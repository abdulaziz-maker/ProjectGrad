'use client'
import { useState, useEffect, useMemo, useCallback, memo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import {
  getStudents, getSupervisors, getQuranPlans, getDailyFollowups, upsertDailyFollowup,
  getBatchSchedule, upsertQuranPlan, getJuzProgressForStudents, type DBStudent, type DBSupervisor,
  type DBJuzProgress,
} from '@/lib/db'
import { calculateDailyReview } from '@/lib/review-schedule'
import {
  calculateExpectedPosition, getToday,
  getStudentStatus, STATUS_LABELS, STATUS_COLORS, STATUS_BG,
  DELAY_REASONS, TREATMENT_ACTIONS,
  getThisWeekRange,
  type QuranPlan, type DailyFollowup, type BatchScheduleEntry,
} from '@/lib/quran-followup'
import { formatHijriWithDay, toHijriShort, gregorianToHijri } from '@/lib/hijri'
import HijriDatePicker from '@/components/ui/HijriDatePicker'
import WeekNavBar from '@/components/ui/WeekNavBar'
import EscalationBanner from '@/components/followups/EscalationBanner'
import RemedialPlanModal from '@/components/followups/RemedialPlanModal'
import EscalateModal from '@/components/followups/EscalateModal'
import CasesTimelineView from '@/components/student-cases/CasesTimelineView'
import { getCases } from '@/lib/student-cases/db'
import type { CaseWithStudent, StudentCase } from '@/lib/student-cases/types'
import {
  BookOpenCheck, ChevronDown, ChevronUp, Save, Plus, Users, AlertTriangle,
  CheckCircle2, Clock, CalendarDays, FileText, Pencil, X, Eye, RotateCw, ShieldAlert, ExternalLink,
} from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import SupervisorTrackingAlert from '@/components/ui/SupervisorTrackingAlert'
import { computeAllSupervisorStatuses, computeSupervisorWeeklyStatus } from '@/lib/supervisor-tracking'

export default function FollowupsPage() {
  const { profile } = useAuth()
  const isCeo = profile?.role === 'ceo'
  const isBatchManager = profile?.role === 'batch_manager'
  const canViewSupervisors = isCeo || isBatchManager
  const myBatchId = profile?.batch_id ?? null
  // فلتر الدفعة للـCEO — null = أول دفعة (يُضبط بعد تحميل الطلاب)
  const [ceoBatchFilter, setCeoBatchFilter] = useState<number | null>(null)

  const [students, setStudents] = useState<DBStudent[]>([])
  const [plans, setPlans] = useState<QuranPlan[]>([])
  const [followups, setFollowups] = useState<DailyFollowup[]>([])
  // متابعات الأسبوع كاملة — لاكتشاف "تمت المتابعة هذا الأسبوع"
  const [weekFollowups, setWeekFollowups] = useState<DailyFollowup[]>([])
  const [schedule, setSchedule] = useState<BatchScheduleEntry[]>([])
  const [supervisorsList, setSupervisorsList] = useState<DBSupervisor[]>([])
  const [juzProgress, setJuzProgress] = useState<DBJuzProgress[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState(getToday())
  const [saving, setSaving] = useState(false)
  const [showSupervisorPanel, setShowSupervisorPanel] = useState(false)
  // 1 = enter actual/reviews, 2 = enter reasons/actions (auto after save if behind)
  const [followupStep, setFollowupStep] = useState<1 | 2>(1)

  // Form state for daily followup
  const [formActual, setFormActual] = useState<number | ''>('')
  const [formExpectedOverride, setFormExpectedOverride] = useState<number | ''>('')
  const [editingExpected, setEditingExpected] = useState(false)
  const [savingExpected, setSavingExpected] = useState(false)
  const [formNearReview, setFormNearReview] = useState('')
  const [formFarReview, setFormFarReview] = useState('')
  const [formReasons, setFormReasons] = useState<string[]>([])
  const [formActions, setFormActions] = useState<string[]>([])
  const [formNotes, setFormNotes] = useState('')
  const [formCustomReason, setFormCustomReason] = useState('')
  const [formCustomAction, setFormCustomAction] = useState('')

  // ── Escalation system (المهمة ٨ + ٩) ──
  const [activeTab, setActiveTab] = useState<'daily' | 'cases'>('daily')
  const [activeCases, setActiveCases] = useState<Map<string, StudentCase>>(new Map())
  const [escalationFor, setEscalationFor] = useState<{
    student: DBStudent; gap: number; severity: 'first_delay' | 'plan_failed' | 'escalated_manager' | 'escalated_ceo'
  } | null>(null)
  const [planModalFor, setPlanModalFor] = useState<{ student: DBStudent; gap: number } | null>(null)
  const [escalateModalFor, setEscalateModalFor] = useState<{ student: DBStudent; case: StudentCase } | null>(null)
  const [casesList, setCasesList] = useState<CaseWithStudent[]>([])

  // New plan form
  const [showAddPlan, setShowAddPlan] = useState<string | null>(null)
  const [planForm, setPlanForm] = useState({ startDate: getToday(), endDate: '', startPosition: '1', dailyRate: '1' })

  useEffect(() => {
    async function load() {
      try {
        // Wave 1: independent fetches.
        const [s, p, batchSchedules, sups] = await Promise.all([
          getStudents(),
          getQuranPlans(),
          myBatchId ? getBatchSchedule(myBatchId) : Promise.resolve([]),
          getSupervisors(),
        ])
        setStudents(s)
        setSupervisorsList(sups)
        setPlans(p)
        setSchedule(batchSchedules)

        // Wave 2: parallel — juz progress scoped to visible students + today's followups.
        const studentIds = s.map(x => x.id)
        const [jp, f] = await Promise.all([
          getJuzProgressForStudents(studentIds),
          getDailyFollowups({ dateFrom: selectedDate, dateTo: selectedDate }),
        ])
        setJuzProgress(jp)
        setFollowups(f)
      } catch (err) {
        console.error(err)
        toast.error('خطأ في تحميل البيانات')
      } finally {
        setLoading(false)
      }
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reload followups when date changes
  useEffect(() => {
    if (loading) return
    getDailyFollowups({ dateFrom: selectedDate, dateTo: selectedDate }).then(setFollowups).catch(console.error)
  }, [selectedDate, loading])

  // Load this-week followups for the weekly tracker (independent of selectedDate)
  useEffect(() => {
    if (loading) return
    const wr = getThisWeekRange()
    getDailyFollowups({ dateFrom: wr.start, dateTo: wr.end })
      .then(setWeekFollowups)
      .catch(console.error)
  }, [loading, followups])  // إعادة تحميل كل ما تغيّرت متابعات اليوم لينعكس على الأسبوع

  // ── تحميل الحالات النشطة (Active Cases) ──
  const reloadCases = useCallback(async () => {
    try {
      const cases = await getCases({ status: 'active' })
      setCasesList(cases)
      const map = new Map<string, StudentCase>()
      for (const c of cases) {
        if (c.status === 'active') map.set(c.student_id, c)
      }
      setActiveCases(map)
    } catch (err) {
      console.error('Failed to load cases', err)
    }
  }, [])

  useEffect(() => {
    if (loading) return
    reloadCases()
  }, [loading, reloadCases])

  // Build schedule map for algorithm
  const scheduleMap = useMemo(() => {
    const m = new Map<string, string>()
    schedule.forEach(e => m.set(e.date, e.day_type))
    return m
  }, [schedule])

  // Student view filter for supervisors: 'mine' | 'all'
  const [studentFilter, setStudentFilter] = useState<'mine' | 'all'>('mine')
  const isSupervisor = profile?.role === 'supervisor' || profile?.role === 'teacher'

  // قائمة الدفعات المتاحة للـCEO
  const availableBatches = useMemo(() => {
    if (!isCeo) return []
    const seen = new Set<number>()
    const batches: { id: number; count: number }[] = []
    for (const s of students) {
      if (!seen.has(s.batch_id)) {
        seen.add(s.batch_id)
        batches.push({ id: s.batch_id, count: 0 })
      }
      const b = batches.find(b => b.id === s.batch_id)
      if (b) b.count++
    }
    return batches.sort((a, b) => a.id - b.id)
  }, [students, isCeo])

  // ضبط الفلتر الافتراضي على أول دفعة عند التحميل
  useEffect(() => {
    if (isCeo && availableBatches.length > 0 && ceoBatchFilter === null) {
      setCeoBatchFilter(availableBatches[0].id)
    }
  }, [isCeo, availableBatches, ceoBatchFilter])

  // Filter students by batch
  const allBatchStudents = useMemo(() => {
    if (isCeo) {
      const batchId = ceoBatchFilter ?? availableBatches[0]?.id
      if (batchId !== undefined) return students.filter(s => s.batch_id === batchId)
      return students
    }
    if (myBatchId !== null) return students.filter(s => s.batch_id === myBatchId)
    return []
  }, [students, myBatchId, isCeo, ceoBatchFilter, availableBatches])

  // Find current supervisor's table ID (sup_xxx) from their auth user_id
  const mySupervisorTableId = useMemo(() => {
    if (!profile?.id || !isSupervisor) return null
    const mySup = supervisorsList.find(s => s.user_id === profile.id)
    return mySup?.id ?? null
  }, [profile, isSupervisor, supervisorsList])

  // Set of student IDs assigned to current supervisor
  const myAssignedIds = useMemo(() => {
    if (!mySupervisorTableId) return new Set<string>()
    return new Set(allBatchStudents.filter(s => s.supervisor_id === mySupervisorTableId).map(s => s.id))
  }, [allBatchStudents, mySupervisorTableId])

  // Apply filter
  const myStudents = useMemo(() => {
    if (!isSupervisor || studentFilter === 'all') return allBatchStudents
    return allBatchStudents.filter(s => myAssignedIds.has(s.id))
  }, [allBatchStudents, isSupervisor, studentFilter, myAssignedIds])

  // ── حالة المتابعة الأسبوعية ──
  const supervisorTrackingStatuses = useMemo(() => {
    const activeBatchStudents = allBatchStudents.filter(s => s.status === 'active' || !s.status)
    if (isSupervisor && mySupervisorTableId) {
      // مشرف → حالته هو فقط
      const mySup = supervisorsList.find(sv => sv.id === mySupervisorTableId)
      if (!mySup) return []
      const st = computeSupervisorWeeklyStatus(mySup, activeBatchStudents)
      return st.totalStudents > 0 ? [st] : []
    }
    // CEO / batch manager → يرى كل المشرفين ضمن نطاقه
    const scoped = isCeo
      ? supervisorsList
      : supervisorsList.filter(sv => myBatchId !== null && sv.batch_id === myBatchId)
    return computeAllSupervisorStatuses(scoped, activeBatchStudents)
  }, [allBatchStudents, supervisorsList, isSupervisor, mySupervisorTableId, isCeo, myBatchId])

  // Build plan map: student_id → plan
  const planMap = useMemo(() => {
    const m = new Map<string, QuranPlan>()
    plans.forEach(p => m.set(p.student_id, p))
    return m
  }, [plans])

  // Build supervisor name map: supervisor_id → supervisor name (for student card display)
  const supervisorNameMap = useMemo(() => {
    const m = new Map<string, string>()
    supervisorsList.forEach(s => m.set(s.id, s.name))
    return m
  }, [supervisorsList])

  // Build followup map: student_id → followup for selected date
  const followupMap = useMemo(() => {
    const m = new Map<string, DailyFollowup>()
    followups.forEach(f => m.set(f.student_id, f))
    return m
  }, [followups])

  // الطلاب الذين تمّت متابعتهم هذا الأسبوع — للعرض فقط (لا يُخفي أحداً)
  const weekFollowedSet = useMemo(() => {
    const s = new Set<string>()
    for (const f of weekFollowups) {
      if (f.actual_position != null) s.add(f.student_id)
    }
    return s
  }, [weekFollowups])

  // ── أحدث متابعة بـactual_position لكل طالب في هذا الأسبوع ──
  const weekLatestActual = useMemo(() => {
    const m = new Map<string, { position: number; date: string }>()
    for (const f of weekFollowups) {
      if (f.actual_position == null) continue
      const cur = m.get(f.student_id)
      if (!cur || f.followup_date > cur.date) {
        m.set(f.student_id, { position: f.actual_position, date: f.followup_date })
      }
    }
    return m
  }, [weekFollowups])

  // أسوأ gap للطالب هذا الأسبوع (لاكتشاف المتعثرين الشديدين)
  const weekWorstGap = useMemo(() => {
    const m = new Map<string, number>()
    for (const f of weekFollowups) {
      if (f.gap == null) continue
      const cur = m.get(f.student_id)
      if (cur == null || f.gap < cur) m.set(f.student_id, f.gap)
    }
    return m
  }, [weekFollowups])

  const SEVERE_DELAY = 10
  const isStudentSeverelyDelayed = useCallback((studentId: string): boolean => {
    const g = weekWorstGap.get(studentId)
    return g != null && g <= -SEVERE_DELAY
  }, [weekWorstGap])

  // حساب بيانات كل طالب (بدون sort) — يُعاد فقط عند تغيّر الحسابات الفعلية.
  // TODO: استخراج بطاقة الطالب لـcomponent منفصل + React.memo لتجنّب re-render
  // كل البطاقات عند تغيّر state واحد في الصفحة الأم.
  const studentDataUnsorted = useMemo(() => {
    return myStudents.map(student => {
      const plan = planMap.get(student.id)
      if (!plan) return { student, plan: null, expected: 0, followup: null, gap: null, status: 'no_plan' as const, isExamDay: false, isFollowed: false }

      const effectiveDate = plan.end_date && selectedDate > plan.end_date ? plan.end_date : selectedDate
      const result = calculateExpectedPosition(
        plan.start_position,
        plan.start_date,
        effectiveDate,
        plan.daily_rate,
        scheduleMap,
      )
      const expected = result.position
      const dayDetail = result.dayDetails.find(d => d.date === selectedDate)
      const isExamDay = !!dayDetail && dayDetail.type === 'exam'

      const followup = followupMap.get(student.id)
      const isFollowed = followup?.actual_position != null
      const gap = isFollowed ? followup!.actual_position! - expected : null
      const status = gap !== null ? getStudentStatus(gap) : 'no_followup'

      return { student, plan, expected, followup, gap, status, isExamDay, isFollowed }
    })
  }, [myStudents, planMap, followupMap, selectedDate, scheduleMap])

  // sort منفصل — يعتمد فقط على نتيجة الحسابات.
  const studentData = useMemo(() => {
    const order = { severe_delay: 0, slight_delay: 1, no_followup: 2, on_track: 3, no_plan: 4 }
    return [...studentDataUnsorted].sort((a, b) => (order[a.status] ?? 5) - (order[b.status] ?? 5))
  }, [studentDataUnsorted])

  // Stats
  const stats = useMemo(() => ({
    total: studentData.length,
    withPlan: studentData.filter(s => s.plan).length,
    followed: studentData.filter(s => s.isFollowed).length,
    onTrack: studentData.filter(s => s.status === 'on_track').length,
    slightDelay: studentData.filter(s => s.status === 'slight_delay').length,
    severeDelay: studentData.filter(s => s.status === 'severe_delay').length,
    noFollowup: studentData.filter(s => s.status === 'no_followup').length,
  }), [studentData])

  // Supervisor compliance data (for CEO / batch_manager)
  const supervisorCompliance = useMemo(() => {
    if (!canViewSupervisors) return []
    const map = new Map<string, { name: string; total: number; followed: number }>()
    for (const sd of studentData) {
      if (!sd.plan) continue
      const supName = sd.student.supervisor_name || 'بدون مشرف'
      const key = sd.student.supervisor_id || supName
      if (!map.has(key)) map.set(key, { name: supName, total: 0, followed: 0 })
      const entry = map.get(key)!
      entry.total++
      if (sd.isFollowed) entry.followed++
    }
    return [...map.values()].sort((a, b) => {
      const pctA = a.total > 0 ? a.followed / a.total : 1
      const pctB = b.total > 0 ? b.followed / b.total : 1
      return pctA - pctB
    })
  }, [studentData, canViewSupervisors])

  // ── Handlers ──────────────────────────────────────────────────────

  function expandStudent(studentId: string, computedExpected: number) {
    if (expandedStudent === studentId) {
      setExpandedStudent(null)
      setEditingExpected(false)
      setFollowupStep(1)
      return
    }
    setExpandedStudent(studentId)
    setEditingExpected(false)
    // ── حساب المراجعة المقترحة (قريبة + بعيدة) من القواعد ──
    // النظام يستخدم المفترض كأساس؛ لو الطالب متقدم/متأخر سنُحدّث القريبة بعد إدخال الفعلي
    const dailyReview = calculateDailyReview(juzProgress, studentId, selectedDate, computedExpected)
    const suggestedNear = dailyReview.near?.text || ''
    const suggestedFar  = dailyReview.far.text === '—' ? '' : dailyReview.far.text

    const existing = followupMap.get(studentId)
    if (existing) {
      setFormActual(existing.actual_position ?? '')
      // املأ من DB لو موجود، وإلا املأ من الاقتراح
      setFormNearReview(existing.near_review || suggestedNear)
      setFormFarReview(existing.far_review || suggestedFar)
      setFormReasons(Array.isArray(existing.delay_reasons) ? existing.delay_reasons : [])
      setFormActions(Array.isArray(existing.treatment_actions) ? existing.treatment_actions : [])
      setFormNotes(existing.notes || '')
      if (existing.expected_position != null && existing.expected_position !== computedExpected) {
        setFormExpectedOverride(existing.expected_position)
      } else {
        setFormExpectedOverride('')
      }
      setFollowupStep(1)
    } else {
      setFormActual('')
      setFormExpectedOverride('')
      // متابعة جديدة → املأ تلقائياً من القواعد
      setFormNearReview(suggestedNear)
      setFormFarReview(suggestedFar)
      setFormReasons([])
      setFormActions([])
      setFormNotes('')
      setFollowupStep(1)
    }
    setFormCustomReason('')
    setFormCustomAction('')
  }

  // Save expected override — updates plan.start_position to shift the entire plan
  async function saveExpectedOverride(studentId: string, computedExpected: number) {
    if (formExpectedOverride === '' || Number(formExpectedOverride) === computedExpected) {
      setEditingExpected(false)
      setFormExpectedOverride('')
      return
    }
    setSavingExpected(true)
    const newExpected = Number(formExpectedOverride)
    const plan = planMap.get(studentId)
    if (!plan) { setSavingExpected(false); return }

    const delta = newExpected - computedExpected
    const newStartPosition = plan.start_position + delta

    try {
      await upsertQuranPlan({ ...plan, start_position: newStartPosition })
      const updatedPlans = await getQuranPlans()
      setPlans(updatedPlans)
      setEditingExpected(false)
      setFormExpectedOverride('')
      toast.success('تم تعديل الخطة بالكامل')
    } catch (err) {
      console.error(err)
      toast.error('خطأ في تعديل الخطة')
    } finally {
      setSavingExpected(false)
    }
  }

  // ⚙️ منطق المتابعة الأسبوعية (#1، #2، #3):
  //   - المتابعة تُعتبر مكتملة عند تسجيل actual_position
  //   - مرة واحدة في الأسبوع تكفي إلا للمتعثرين (gap >= -10 أوجه)
  //   - عند التأخر، الأسباب والإجراءات إلزامية في step 2
  //   - عند التعثّر الشديد، نقترح التصعيد لمدير الدفعة
  const SEVERE_DELAY_THRESHOLD = 10  // أكثر من ١٠ أوجه = متعثر يحتاج متابعة دائمة

  async function saveFollowup(studentId: string, expectedPosition: number, isExamDay: boolean) {
    if (formActual === '') {
      toast.error('أدخل الوجه الفعلي')
      return
    }
    const actual = Number(formActual)
    const effectiveExpected = formExpectedOverride !== '' ? Number(formExpectedOverride) : expectedPosition
    const gap = actual - effectiveExpected
    const isBehind = actual < effectiveExpected

    // ⚠️ في step 2 (التأخر) — إلزامية ≥1 سبب و ≥1 إجراء
    if (followupStep === 2 && isBehind) {
      const totalReasons = formReasons.length + (formCustomReason.trim() ? 1 : 0)
      const totalActions = formActions.length + (formCustomAction.trim() ? 1 : 0)
      if (totalReasons === 0) {
        toast.error('اختر سبباً واحداً على الأقل لتأخر الطالب')
        return
      }
      if (totalActions === 0) {
        toast.error('اختر إجراءً علاجياً واحداً على الأقل')
        return
      }
    }

    setSaving(true)
    const allReasons = [...formReasons, ...(formCustomReason ? [formCustomReason] : [])]
    const allActions = [...formActions, ...(formCustomAction ? [formCustomAction] : [])]

    const followup: DailyFollowup = {
      student_id: studentId,
      supervisor_id: profile?.id,
      followup_date: selectedDate,
      expected_position: effectiveExpected,
      actual_position: actual,
      gap: actual - effectiveExpected,
      is_exam_day: isExamDay,
      near_review: formNearReview,
      far_review: formFarReview,
      delay_reasons: allReasons,
      treatment_actions: allActions,
      notes: formNotes,
    }
    try {
      await upsertDailyFollowup(followup)
      setFollowups(prev => {
        const filtered = prev.filter(f => !(f.student_id === studentId && f.followup_date === selectedDate))
        return [...filtered, followup]
      })

      // Step 1 → إذا متأخر، انتقل لـstep 2 (إلزامي عند التأخر)
      if (followupStep === 1 && isBehind) {
        toast.success('تم الحفظ — لكن الطالب متأخر، يجب تحديد الأسباب والإجراءات')
        setFollowupStep(2)
      } else {
        // ── منطق التصعيد الجديد (بانر بدل toast) ──
        if (isBehind) {
          toast.success('تم حفظ المتابعة')
          const student = myStudents.find(s => s.id === studentId)
          const existingCase = activeCases.get(studentId)
          if (student) {
            // حدد شدة التنبيه حسب وجود حالة نشطة وحجم التأخر
            let severity: 'first_delay' | 'plan_failed' | 'escalated_manager' | 'escalated_ceo' = 'first_delay'
            if (existingCase) {
              if (existingCase.current_stage === 'stage_1_supervisor') severity = 'plan_failed'
              else if (existingCase.current_stage === 'stage_2_batch_manager') severity = 'escalated_manager'
              else if (existingCase.current_stage === 'stage_3_ceo') severity = 'escalated_ceo'
            }
            // فقط أظهر البانر لو التأخر >= 5 (تجنّب الإزعاج بالتأخر البسيط جداً)
            if (Math.abs(gap) >= 5 || existingCase) {
              setEscalationFor({ student, gap, severity })
              // اطوِ بطاقة الطالب لإظهار البانر
              setExpandedStudent(null)
              setFollowupStep(1)
              setSaving(false)
              return
            }
          }
        } else {
          toast.success('تم حفظ المتابعة — تُعتبر متابعة هذا الأسبوع مكتملة')
        }
        setExpandedStudent(null)
        setFollowupStep(1)
      }

      // ── تنبيه المشرف بإضافة الاختبار يدوياً ──
      // ⚠️ الاختبارات لا تُضاف تلقائياً — المشرف يضيفها يدوياً من صفحة الاختبارات
      if (actual >= effectiveExpected) {
        const plan = planMap.get(studentId)
        if (plan) {
          const pagesCompleted = actual - plan.start_position
          if (pagesCompleted > 0 && pagesCompleted % 20 === 0) {
            const juzNum = Math.floor(pagesCompleted / 20)
            setTimeout(() => {
              toast.warning(
                `📋 تذكير: الطالب أكمل الجزء ${juzNum} — يُرجى إضافة موعد الاختبار يدوياً من صفحة "الاختبارات".`,
                { duration: 10000 }
              )
            }, 800)
          }
        }
      }
    } catch (err) {
      console.error(err)
      toast.error('خطأ في الحفظ')
    } finally {
      setSaving(false)
    }
  }

  // Add quran plan
  async function addPlan(studentId: string) {
    try {
      await upsertQuranPlan({
        student_id: studentId,
        start_date: planForm.startDate,
        end_date: planForm.endDate,
        start_position: Number(planForm.startPosition) || 1,
        daily_rate: Number(planForm.dailyRate) || 1,
        is_active: true,
        hijri_year: gregorianToHijri(planForm.startDate).year,
      })
      const updatedPlans = await getQuranPlans()
      setPlans(updatedPlans)
      setShowAddPlan(null)
      toast.success('تم إنشاء الخطة')
    } catch (err) {
      console.error(err)
      toast.error('خطأ في إنشاء الخطة')
    }
  }

  // Check if selected date is Fri/Sat
  const selectedDow = new Date(selectedDate + 'T12:00:00').getDay()
  const isWeekend = selectedDow === 5 || selectedDow === 6

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="text-center space-y-3">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>جاري تحميل المتابعات...</p>
      </div>
    </div>
  )

  return (
    <div className="space-y-5 animate-fade-in-up">
      {/* ── تنبيه المتابعة الأسبوعية — يظهر تلقائياً عند وجود تأخر ── */}
      <SupervisorTrackingAlert
        statuses={supervisorTrackingStatuses}
        title={
          isSupervisor
            ? 'متطلباتك الأسبوعية — متابعة طلابك'
            : isCeo
            ? 'المتابعة الأسبوعية للمشرفين'
            : 'المتابعة الأسبوعية لمشرفي الدفعة'
        }
        singleSupervisor={isSupervisor}
        alertsOnly
        collapsible
      />

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-2">
        <div className="min-w-0">
          <div className="eyebrow-pill mb-3">
            <span className="eyebrow-dot" />
            متابعات يومية
          </div>
          <h1 className="display-h1 m-0 flex items-center gap-3" style={{ color: 'var(--text-primary)' }}>
            <BookOpenCheck className="w-7 h-7" style={{ color: 'var(--accent-teal)' }} />
            متابعات الطلاب
          </h1>
          <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>
            {formatHijriWithDay(selectedDate)}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <HijriDatePicker value={selectedDate} onChange={setSelectedDate} compact />
        </div>
      </div>

      {/* ── شريط أزرار الإجراءات السريعة (واضح كأزرار) ── */}
      <div className="flex flex-wrap gap-2 sm:gap-2.5">
        <Link
          href="/followups/schedule"
          className="group flex items-center gap-2 px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-bold rounded-xl shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 active:translate-y-0"
          style={{
            background: 'linear-gradient(135deg, #C08A48, #8a5e1a)',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.20)',
          }}
        >
          <CalendarDays className="w-4 h-4 group-hover:scale-110 transition-transform" />
          <span>جدول الأسبوع</span>
        </Link>
        <Link
          href="/followups/history"
          className="group flex items-center gap-2 px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-bold rounded-xl shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 active:translate-y-0"
          style={{
            background: 'linear-gradient(135deg, #5D4256, #3A2840)',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.20)',
          }}
        >
          <FileText className="w-4 h-4 group-hover:scale-110 transition-transform" />
          <span>الأرشيف</span>
        </Link>
        <button
          type="button"
          onClick={() => {
            setActiveTab('cases')
            setTimeout(() => {
              document.querySelector('[data-cases-tab]')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }, 50)
          }}
          className="group flex items-center gap-2 px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-bold rounded-xl shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 active:translate-y-0 relative"
          style={{
            background: 'linear-gradient(135deg, #DC2626, #7f1d1d)',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.20)',
          }}
        >
          <ShieldAlert className="w-4 h-4 group-hover:scale-110 transition-transform" />
          <span>حالات التصعيد</span>
          {casesList.length > 0 && (
            <span className="text-[10px] font-mono font-black px-1.5 py-0.5 rounded-full"
              style={{ background: '#fff', color: '#7f1d1d' }}>
              {casesList.length}
            </span>
          )}
        </button>
        {canViewSupervisors && (
          <>
            <Link
              href="/followups/violations"
              className="group flex items-center gap-2 px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-bold rounded-xl shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 active:translate-y-0"
              style={{
                background: 'linear-gradient(135deg, #B94838, #7f1d1d)',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.20)',
              }}
            >
              <AlertTriangle className="w-4 h-4 group-hover:scale-110 transition-transform" />
              <span>الإخلالات</span>
            </Link>
            <Link
              href="/followups/manager"
              className="group flex items-center gap-2 px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-bold rounded-xl shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 active:translate-y-0"
              style={{
                background: 'linear-gradient(135deg, #356B6E, #244A4D)',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.20)',
              }}
            >
              <Users className="w-4 h-4 group-hover:scale-110 transition-transform" />
              <span>لوحة المدير</span>
            </Link>
          </>
        )}
      </div>

      {/* ── شريط التنقل الأسبوعي (السبت → الخميس) ── */}
      <WeekNavBar
        selectedDate={selectedDate}
        onSelect={setSelectedDate}
        weekFollowups={weekFollowups}
      />

      {/* ── بانر التصعيد (قنبلة / تحذير) ── */}
      {escalationFor && (
        <EscalationBanner
          studentName={escalationFor.student.name}
          gap={escalationFor.gap}
          severity={escalationFor.severity}
          activeCase={activeCases.get(escalationFor.student.id) ?? null}
          onStartPlan={() => {
            setPlanModalFor({ student: escalationFor.student, gap: escalationFor.gap })
            setEscalationFor(null)
          }}
          onEscalate={() => {
            const c = activeCases.get(escalationFor.student.id)
            if (c) setEscalateModalFor({ student: escalationFor.student, case: c })
            setEscalationFor(null)
          }}
          onViewCase={() => {
            const c = activeCases.get(escalationFor.student.id)
            if (c) window.location.href = `/student-cases/${c.id}`
          }}
          onDismiss={() => setEscalationFor(null)}
        />
      )}

      {/* ── Tabs: المتابعات اليومية / حالات التصعيد ── */}
      <div data-cases-tab className="flex gap-2 p-1 rounded-xl w-fit" style={{ background: 'var(--bg-elevated)' }}>
        <button
          onClick={() => setActiveTab('daily')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'daily' ? 'bg-white shadow-sm' : ''}`}
          style={activeTab === 'daily' ? { color: 'var(--accent-teal)' } : { color: 'var(--text-muted)' }}
        >
          المتابعات اليومية
        </button>
        <button
          onClick={() => setActiveTab('cases')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${activeTab === 'cases' ? 'bg-white shadow-sm' : ''}`}
          style={activeTab === 'cases' ? { color: '#B94838' } : { color: 'var(--text-muted)' }}
        >
          حالات التصعيد
          {casesList.length > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: activeTab === 'cases' ? '#B94838' : 'rgba(185,72,56,0.15)', color: activeTab === 'cases' ? '#fff' : '#B94838' }}>
              {casesList.length}
            </span>
          )}
        </button>
      </div>

      {/* ── محتوى تبويب الحالات ── */}
      {activeTab === 'cases' && profile && (
        <div className="animate-fade-in-up">
          <CasesTimelineView profile={profile} />
        </div>
      )}

      {/* ── محتوى تبويب المتابعات (الأصلي) — يبقى كما كان فقط لـactiveTab='daily' ── */}
      {activeTab === 'daily' && <>

      {/* ── فلتر الدفعة للـCEO ── */}
      {isCeo && availableBatches.length > 1 && (
        <div className="flex gap-2 p-1 rounded-xl w-fit" style={{ background: 'var(--bg-elevated)' }}>
          {availableBatches.map(batch => (
            <button
              key={batch.id}
              onClick={() => setCeoBatchFilter(batch.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${ceoBatchFilter === batch.id ? 'bg-white shadow-sm' : ''}`}
              style={ceoBatchFilter === batch.id ? { color: 'var(--accent-teal)' } : { color: 'var(--text-muted)' }}
            >
              دفعة {batch.id} <span className="text-xs opacity-60">({batch.count})</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Supervisor filter toggle ── */}
      {isSupervisor && myAssignedIds.size > 0 && (
        <div className="flex gap-2 p-1 rounded-xl w-fit" style={{ background: 'var(--bg-elevated)' }}>
          <button
            onClick={() => setStudentFilter('mine')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${studentFilter === 'mine' ? 'bg-white shadow-sm' : ''}`}
            style={studentFilter === 'mine' ? { color: 'var(--accent-warm)' } : { color: 'var(--text-muted)' }}
          >
            طلابي ({myAssignedIds.size})
          </button>
          <button
            onClick={() => setStudentFilter('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${studentFilter === 'all' ? 'bg-white shadow-sm' : ''}`}
            style={studentFilter === 'all' ? { color: 'var(--accent-warm)' } : { color: 'var(--text-muted)' }}
          >
            جميع طلاب الدفعة ({allBatchStudents.length})
          </button>
        </div>
      )}

      {/* ── Stats bar ── */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {[
          { label: 'لديهم خطة', value: stats.withPlan, icon: Users, color: '#C08A48' },
          { label: 'تمت المتابعة', value: stats.followed, icon: CheckCircle2, color: '#356B6E' },
          { label: 'منتظمون', value: stats.onTrack, icon: CheckCircle2, color: '#5A8F67' },
          { label: 'تأخر بسيط', value: stats.slightDelay, icon: Clock, color: '#C9972C' },
          { label: 'تأخر كبير', value: stats.severeDelay, icon: AlertTriangle, color: '#B94838' },
          { label: 'لم يتابع', value: stats.noFollowup, icon: FileText, color: '#8B8F96' },
        ].map(s => (
          <div key={s.label} className="card-static p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: s.color + '15' }}>
              <s.icon className="w-4 h-4" style={{ color: s.color }} />
            </div>
            <div>
              <p className="font-bold text-lg font-mono" style={{ color: 'var(--text-primary)' }}>{s.value}</p>
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Supervisor compliance panel (CEO / batch_manager) ── */}
      {canViewSupervisors && supervisorCompliance.length > 0 && (
        <div className="card-static overflow-hidden border border-indigo-200/30">
          <button
            onClick={() => setShowSupervisorPanel(!showSupervisorPanel)}
            className="w-full flex items-center justify-between p-4 text-right"
          >
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-indigo-500" />
              <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                متابعة المشرفين اليومية
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-500 font-mono font-bold">
                {stats.followed}/{stats.withPlan} طالب
              </span>
            </div>
            {showSupervisorPanel ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>
          {showSupervisorPanel && (
            <div className="px-4 pb-4 space-y-2 border-t border-white/10 pt-3">
              {supervisorCompliance.map(sup => {
                const pct = sup.total > 0 ? Math.round((sup.followed / sup.total) * 100) : 0
                const color = pct === 100 ? '#5A8F67' : pct >= 50 ? '#C9972C' : '#B94838'
                return (
                  <div key={sup.name} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ background: color }}>
                      {sup.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{sup.name}</p>
                        <span className="text-xs font-mono font-bold flex-shrink-0" style={{ color }}>{pct}%</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
                        </div>
                        <span className="text-[10px] font-mono flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{sup.followed}/{sup.total}</span>
                      </div>
                    </div>
                    {pct === 100 && <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Weekend notice */}
      {isWeekend && (
        <div className="border border-amber-200/50 bg-amber-500/5 rounded-xl p-3 text-sm text-amber-600 flex items-center gap-2">
          <CalendarDays className="w-4 h-4 flex-shrink-0" />
          يوم {selectedDow === 5 ? 'الجمعة' : 'السبت'} — عطلة (لا تسميع)
        </div>
      )}

      {/* ── Student list ── */}
      <div className="space-y-2">
        {studentData.map(({ student, plan, expected, followup, gap, status, isExamDay, isFollowed }) => {
          const weekLatest = weekLatestActual.get(student.id)
          const weekGap = weekLatest ? weekLatest.position - expected : null
          const isExpanded = expandedStudent === student.id
          const followedThisWeek = weekFollowedSet.has(student.id)
          const severelyDelayed = isStudentSeverelyDelayed(student.id)

          // لون الـborder حسب الحالة
          const accentColor =
            !plan ? '#9CA3AF'
            : severelyDelayed ? '#B94838'
            : status === 'severe_delay' ? '#B94838'
            : status === 'slight_delay' ? '#C9972C'
            : status === 'on_track' ? '#5A8F67'
            : followedThisWeek ? '#356B6E'
            : '#9CA3AF'

          return (
          <div
            key={student.id}
            className="card-static overflow-hidden transition-all"
            style={{
              borderRight: `4px solid ${accentColor}`,
              boxShadow: isExpanded ? '0 4px 16px -4px rgba(0,0,0,0.08)' : undefined,
            }}
          >
            {/* بطاقة الطالب — نظرة واحدة */}
            <button
              onClick={() => plan ? expandStudent(student.id, expected) : setShowAddPlan(showAddPlan === student.id ? null : student.id)}
              className="w-full text-right p-3 sm:p-4 flex items-center gap-3 hover:bg-black/[0.015] transition-colors"
            >
              {/* أحرف اسم الطالب */}
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center flex-shrink-0 font-bold text-sm"
                style={{ background: `${accentColor}15`, color: accentColor, border: `1px solid ${accentColor}30` }}>
                {student.name.charAt(0)}
              </div>

              {/* الاسم + الـbadges */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap mb-1">
                  <p className="font-bold text-sm sm:text-[15px]" style={{ color: 'var(--text-primary)' }}>
                    {student.name}
                  </p>
                  {/* رابط صفحة تفاصيل الطالب */}
                  <span onClick={e => e.stopPropagation()}>
                    <Link
                      href={`/quran-system/student/${student.id}`}
                      className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded transition-opacity hover:opacity-70"
                      style={{ background: 'rgba(56,189,248,0.12)', color: '#38bdf8' }}
                    >
                      <ExternalLink className="w-2.5 h-2.5" />
                      التقدم
                    </Link>
                  </span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold"
                    style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                    د{student.batch_id}
                  </span>
                  {isExamDay && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-bold"
                      style={{ background: 'rgba(192,138,72,0.15)', color: '#8a5e1a' }}>
                      اختبار
                    </span>
                  )}
                  {followedThisWeek && !severelyDelayed && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold inline-flex items-center gap-0.5"
                      style={{ background: 'rgba(90,143,103,0.12)', color: '#3F6E4B' }}>
                      <CheckCircle2 className="w-2.5 h-2.5" /> تمّت
                    </span>
                  )}
                  {severelyDelayed && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-bold inline-flex items-center gap-0.5"
                      style={{ background: 'rgba(185,72,56,0.12)', color: '#8B2F23' }}>
                      ⚠ متعثّر
                    </span>
                  )}
                </div>

                {/* اسم المشرف */}
                {student.supervisor_id && supervisorNameMap.get(student.supervisor_id) && (
                  <p className="text-[10px] sm:text-[11px] mb-1 inline-flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                    <Users className="w-3 h-3" />
                    <span>المشرف:</span>
                    <span className="font-medium" style={{ color: 'var(--text-secondary)' }}>
                      {supervisorNameMap.get(student.supervisor_id)}
                    </span>
                  </p>
                )}

                {/* صف المعلومات الرئيسية — نظرة واحدة */}
                {plan ? (
                  <div className="flex items-center gap-2 sm:gap-3 text-[11px] sm:text-xs flex-wrap" style={{ color: 'var(--text-muted)' }}>
                    {/* المفترض */}
                    <span className="inline-flex items-center gap-1">
                      <span className="text-[10px]">مفترض</span>
                      <strong className="font-mono text-sm" style={{ color: 'var(--text-primary)' }}>{expected}</strong>
                    </span>
                    <span style={{ color: 'var(--border-color)' }}>·</span>

                    {/* آخر فعلي هذا الأسبوع */}
                    <span className="inline-flex items-center gap-1">
                      <span className="text-[10px]">فعلي الأسبوع</span>
                      <strong className="font-mono text-sm" style={{ color: weekLatest ? accentColor : 'var(--text-muted)' }}>
                        {weekLatest ? weekLatest.position : '—'}
                      </strong>
                      {weekGap !== null && (
                        <span className="text-[10px] font-mono font-bold px-1 py-0.5 rounded"
                          style={{
                            background: weekGap >= 0 ? 'rgba(90,143,103,0.12)' : weekGap >= -5 ? 'rgba(201,151,44,0.12)' : 'rgba(185,72,56,0.12)',
                            color: weekGap >= 0 ? '#3F6E4B' : weekGap >= -5 ? '#8B5A1E' : '#B94838',
                          }}>
                          {weekGap > 0 ? `+${weekGap}` : weekGap}
                        </span>
                      )}
                    </span>
                    <span style={{ color: 'var(--border-color)' }}>·</span>

                    {/* آخر متابعة */}
                    <span className="inline-flex items-center gap-1">
                      <span className="text-[10px]">آخر متابعة</span>
                      <strong className="font-mono text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        {weekLatest ? toHijriShort(weekLatest.date) : student.last_followup ? toHijriShort(student.last_followup) : '—'}
                      </strong>
                    </span>
                  </div>
                ) : (
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    دفعة {student.batch_id} · لا توجد خطة حفظ
                  </p>
                )}
              </div>

              {/* أيقونة فتح/إغلاق */}
              <div className="flex-shrink-0">
                {plan ? (
                  isExpanded
                    ? <ChevronUp className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                    : <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                ) : (
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                    style={{ background: 'rgba(192,138,72,0.10)', color: '#8a5e1a' }}>
                    <Plus className="w-4 h-4" />
                  </div>
                )}
              </div>
            </button>

            {/* Add Plan form (for students without plan) */}
            {!plan && showAddPlan === student.id && (
              <div className="px-4 pb-4 space-y-3 border-t border-white/10 pt-3">
                <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>إنشاء خطة حفظ</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div>
                    <HijriDatePicker label="تاريخ البداية" value={planForm.startDate} onChange={v => setPlanForm({ ...planForm, startDate: v })} compact />
                  </div>
                  <div>
                    <HijriDatePicker label="تاريخ النهاية" value={planForm.endDate} onChange={v => setPlanForm({ ...planForm, endDate: v })} compact />
                  </div>
                  <div>
                    <label className="block text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>وجه البداية</label>
                    <input type="number" value={planForm.startPosition} onChange={e => setPlanForm({ ...planForm, startPosition: e.target.value })}
                      className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg font-mono" min={1} />
                  </div>
                  <div>
                    <label className="block text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>المعدل اليومي</label>
                    <input type="number" value={planForm.dailyRate} onChange={e => setPlanForm({ ...planForm, dailyRate: e.target.value })}
                      className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg font-mono" min={1} max={5} />
                  </div>
                </div>
                <button onClick={() => addPlan(student.id)}
                  className="btn-primary btn-ripple px-4 py-2 text-xs font-medium text-white rounded-lg flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5" />إنشاء الخطة
                </button>
              </div>
            )}

            {/* ── Daily followup form ── */}
            {plan && expandedStudent === student.id && (() => {
              const gapVal = formActual !== '' ? Number(formActual) - expected : null
              return (
              <div className="border-t border-gray-100 px-5 py-4">

                {/* ════════ الخطوة ١: الأرقام + المراجعة ════════ */}
                {followupStep === 1 && (<>

                  {/* شريط الأرقام */}
                  <div className="flex rounded-xl overflow-hidden border border-gray-200 mb-4">
                    {/* المفترض */}
                    <div className="flex-1 py-3 text-center bg-gray-50">
                      <p className="text-[10px] text-gray-400 mb-0.5 flex items-center justify-center gap-1">
                        المفترض
                        {!editingExpected && (
                          <button
                            type="button"
                            onClick={() => { setEditingExpected(true); setFormExpectedOverride(expected) }}
                            className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-50 border border-amber-200 text-amber-600 hover:bg-amber-100 hover:border-amber-400 hover:text-amber-700 active:scale-95 transition-all duration-150 touch-manipulation"
                            title="تعديل المفترض"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        )}
                      </p>
                      {editingExpected ? (
                        <div className="flex items-center gap-1 px-2 mt-0.5">
                          <input type="number" value={formExpectedOverride} autoFocus
                            onChange={e => setFormExpectedOverride(e.target.value === '' ? '' : Number(e.target.value))}
                            className="w-full text-center text-sm font-mono font-bold rounded-md py-0.5 border border-amber-300 bg-amber-50 text-amber-700 focus:outline-none" min={1} />
                          <button onClick={() => saveExpectedOverride(student.id, expected)} disabled={savingExpected}
                            className="text-[9px] px-1.5 py-1 rounded-md bg-amber-500 text-white font-bold whitespace-nowrap hover:bg-amber-600 disabled:opacity-50">
                            {savingExpected ? '...' : 'حفظ'}</button>
                          <button onClick={() => { setEditingExpected(false); setFormExpectedOverride('') }}
                            className="p-0.5 text-gray-400 hover:text-gray-600"><X className="w-3 h-3" /></button>
                        </div>
                      ) : (
                        <span className="text-xl font-mono font-bold text-gray-800">{expected}</span>
                      )}
                    </div>
                    <div className="w-px bg-gray-200" />
                    {/* الفعلي */}
                    <div className="flex-1 py-3 text-center bg-white">
                      <p className="text-[10px] text-gray-400 mb-0.5">الفعلي</p>
                      <input type="number" value={formActual}
                        onChange={e => setFormActual(e.target.value === '' ? '' : Number(e.target.value))}
                        placeholder={followup?.actual_position != null ? String(followup.actual_position) : '—'}
                        className="w-20 text-center text-xl font-mono font-bold bg-transparent text-gray-800 placeholder-gray-300 focus:outline-none"
                        min={1} />
                    </div>
                    <div className="w-px bg-gray-200" />
                    {/* الفجوة */}
                    <div className="flex-1 py-3 text-center" style={{
                      background: gapVal === null ? '#FAF7F1' : gapVal >= 0 ? 'rgba(111,163,146,0.10)' : 'rgba(185,72,56,0.08)',
                    }}>
                      <p className="text-[10px] text-gray-400 mb-0.5">الفجوة</p>
                      <span className="text-xl font-mono font-bold" style={{
                        color: gapVal === null ? '#d1d5db' : gapVal >= 0 ? '#2F6F56' : '#B94838',
                      }}>
                        {gapVal !== null ? (gapVal > 0 ? `+${gapVal}` : gapVal) : '—'}
                      </span>
                    </div>
                  </div>

                  {editingExpected && (
                    <p className="text-[10px] text-amber-500 mb-3 -mt-2">* سيعدّل وجه البداية في كامل الخطة</p>
                  )}

                  {/* ── قسم المراجعات والملاحظات (محدَّث) ── */}
                  <div className="rounded-xl p-3 mb-3 space-y-3"
                    style={{
                      background: 'linear-gradient(180deg, rgba(192,138,72,0.04), rgba(53,107,110,0.03))',
                      border: '1px solid rgba(192,138,72,0.18)',
                    }}>
                    <div className="flex items-center gap-2 pb-2 border-b border-amber-200/30">
                      <RotateCw className="w-3.5 h-3.5" style={{ color: 'var(--accent-warm)' }} />
                      <h4 className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                        المراجعة والملاحظات
                      </h4>
                      <span className="text-[9px] font-normal mr-auto" style={{ color: 'var(--text-muted)' }}>
                        اختياري — يساعد على متابعة طويلة المدى
                      </span>
                    </div>

                    {/* المراجعتان */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      <label className="block">
                        <span className="flex items-center gap-1.5 text-[11px] font-semibold mb-1.5" style={{ color: '#3F6E4B' }}>
                          <span className="w-2 h-2 rounded-full" style={{ background: '#5A8F67' }} />
                          مراجعة قريبة
                          <span className="text-[9px] font-normal opacity-70">(آخر ٣ أشهر)</span>
                        </span>
                        <textarea
                          value={formNearReview}
                          onChange={e => setFormNearReview(e.target.value)}
                          placeholder="مثال: الأجزاء ٢٨–٣٠، أو سور البقرة وآل عمران…"
                          rows={2}
                          className="w-full px-3 py-2 text-xs rounded-lg resize-none transition-colors focus:outline-none"
                          style={{
                            background: 'var(--bg-card, #fff)',
                            border: '1px solid rgba(90,143,103,0.25)',
                            color: 'var(--text-primary)',
                          }}
                        />
                        {/* اقتراحات سريعة */}
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {['الجزء الأخير', 'آخر سورة', 'الأجزاء ٢٨–٣٠'].map(s => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => setFormNearReview(s)}
                              className="text-[9px] px-2 py-0.5 rounded-full font-medium transition-colors"
                              style={{
                                background: 'rgba(90,143,103,0.08)',
                                color: '#3F6E4B',
                                border: '1px solid rgba(90,143,103,0.20)',
                              }}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      </label>

                      <label className="block">
                        <span className="flex items-center gap-1.5 text-[11px] font-semibold mb-1.5" style={{ color: 'var(--accent-teal)' }}>
                          <span className="w-2 h-2 rounded-full" style={{ background: 'var(--accent-teal)' }} />
                          مراجعة بعيدة
                          <span className="text-[9px] font-normal opacity-70">(قبل ٣ أشهر)</span>
                        </span>
                        <textarea
                          value={formFarReview}
                          onChange={e => setFormFarReview(e.target.value)}
                          placeholder="مثال: الأجزاء ١–١٥، أو السور الطوال…"
                          rows={2}
                          className="w-full px-3 py-2 text-xs rounded-lg resize-none transition-colors focus:outline-none"
                          style={{
                            background: 'var(--bg-card, #fff)',
                            border: '1px solid rgba(53,107,110,0.25)',
                            color: 'var(--text-primary)',
                          }}
                        />
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {['الأجزاء ١–١٠', 'النصف الأول', 'السور الطوال'].map(s => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => setFormFarReview(s)}
                              className="text-[9px] px-2 py-0.5 rounded-full font-medium transition-colors"
                              style={{
                                background: 'rgba(53,107,110,0.08)',
                                color: 'var(--accent-teal)',
                                border: '1px solid rgba(53,107,110,0.20)',
                              }}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      </label>
                    </div>

                    {/* الملاحظات */}
                    <label className="block">
                      <span className="flex items-center gap-1.5 text-[11px] font-semibold mb-1.5" style={{ color: '#8a5e1a' }}>
                        <FileText className="w-3 h-3" style={{ color: 'var(--accent-warm)' }} />
                        ملاحظات إضافية
                        <span className="text-[9px] font-normal opacity-70">(تُحفظ في سجل الطالب)</span>
                      </span>
                      <textarea
                        value={formNotes}
                        onChange={e => setFormNotes(e.target.value)}
                        placeholder="مثال: الطالب متفاعل جداً اليوم، أتقن مخارج الحروف، يحتاج مراجعة في سورة معينة..."
                        rows={3}
                        className="w-full px-3 py-2 text-xs rounded-lg resize-none transition-colors focus:outline-none"
                        style={{
                          background: 'var(--bg-card, #fff)',
                          border: '1px solid rgba(192,138,72,0.25)',
                          color: 'var(--text-primary)',
                        }}
                      />
                      {/* اقتراحات للملاحظات */}
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {[
                          { label: '✨ متفاعل', value: 'الطالب متفاعل ومتميّز اليوم' },
                          { label: '👍 أتقن', value: 'أتقن المقدار اليوم بشكل جيد' },
                          { label: '⏳ يحتاج تركيز', value: 'يحتاج مزيداً من التركيز في المراجعة' },
                          { label: '💪 تحفيز', value: 'تم تحفيز الطالب لزيادة المقدار' },
                        ].map(s => (
                          <button
                            key={s.label}
                            type="button"
                            onClick={() => setFormNotes(prev => prev ? `${prev}\n${s.value}` : s.value)}
                            className="text-[9px] px-2 py-0.5 rounded-full font-medium transition-colors"
                            style={{
                              background: 'rgba(192,138,72,0.08)',
                              color: '#8a5e1a',
                              border: '1px solid rgba(192,138,72,0.20)',
                            }}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </label>
                  </div>

                  {/* تنبيه الخطوة الثانية عند التأخر */}
                  {gapVal !== null && gapVal < 0 && (
                    <div className="flex items-center gap-2 px-3 py-2 mb-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-[11px]">
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>الطالب متأخر — بعد الحفظ ستظهر <strong>الخطوة ٢</strong> لرصد أسباب التأخر والإجراءات العلاجية</span>
                    </div>
                  )}

                  {/* حفظ */}
                  <div className="flex items-center gap-2">
                    <button onClick={() => saveFollowup(student.id, expected, isExamDay)}
                      disabled={saving || formActual === ''}
                      className="flex-1 py-2.5 text-xs font-bold text-white rounded-lg flex items-center justify-center gap-1.5 disabled:opacity-30 transition-all hover:shadow-md"
                      style={{ background: '#059669' }}>
                      <Save className="w-3.5 h-3.5" />
                      {saving ? 'جاري الحفظ...' : 'حفظ المتابعة'}
                    </button>
                    <Link href={`/followups/plan/${student.id}`}
                      className="py-2.5 px-4 text-xs font-bold rounded-lg flex items-center gap-1.5 text-white transition-all hover:shadow-md hover:opacity-90"
                      style={{ background: 'linear-gradient(135deg, #C08A48 0%, #4f46e5 100%)' }}>
                      <CalendarDays className="w-4 h-4" /> استعراض الخطة
                    </Link>
                  </div>
                </>)}

                {/* ════════ الخطوة ٢: أسباب التأخر والعلاج (تظهر تلقائياً بعد الحفظ) ════════ */}
                {followupStep === 2 && (<>
                  <div className="text-center mb-4">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-50 border border-red-200 text-red-600 text-xs font-semibold">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      الطالب متأخر {formActual !== '' ? Math.abs(Number(formActual) - expected) : 0} وجه
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1.5">حدد الأسباب والإجراءات ثم احفظ</p>
                  </div>

                  {/* الأسباب */}
                  <div className="mb-3">
                    <p className="text-[10px] font-semibold text-red-500 mb-2">أسباب التأخر</p>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {DELAY_REASONS.map(r => (
                        <button key={r} onClick={() => setFormReasons(p => p.includes(r) ? p.filter(x => x !== r) : [...p, r])}
                          className={`text-[11px] px-2.5 py-1 rounded-lg border transition-all ${
                            formReasons.includes(r)
                              ? 'bg-red-50 border-red-300 text-red-600 font-medium'
                              : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                          }`}>{formReasons.includes(r) && '✓ '}{r}</button>
                      ))}
                    </div>
                    <input value={formCustomReason} onChange={e => setFormCustomReason(e.target.value)}
                      placeholder="سبب آخر..."
                      className="w-full px-3 py-1.5 text-[11px] rounded-lg bg-gray-50 border border-gray-200 text-gray-800 placeholder-gray-300 focus:outline-none focus:border-red-300" />
                  </div>

                  {/* الإجراءات */}
                  <div className="mb-4">
                    <p className="text-[10px] font-semibold text-amber-500 mb-2">الإجراءات</p>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {TREATMENT_ACTIONS.map(a => (
                        <button key={a} onClick={() => setFormActions(p => p.includes(a) ? p.filter(x => x !== a) : [...p, a])}
                          className={`text-[11px] px-2.5 py-1 rounded-lg border transition-all ${
                            formActions.includes(a)
                              ? 'bg-amber-50 border-amber-300 text-amber-600 font-medium'
                              : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                          }`}>{formActions.includes(a) && '✓ '}{a}</button>
                      ))}
                    </div>
                    <input value={formCustomAction} onChange={e => setFormCustomAction(e.target.value)}
                      placeholder="إجراء آخر..."
                      className="w-full px-3 py-1.5 text-[11px] rounded-lg bg-gray-50 border border-gray-200 text-gray-800 placeholder-gray-300 focus:outline-none focus:border-amber-300" />
                  </div>

                  {/* أزرار */}
                  <div className="flex items-center gap-2">
                    <button onClick={() => saveFollowup(student.id, expected, isExamDay)}
                      disabled={saving}
                      className="flex-1 py-2.5 text-xs font-bold text-white rounded-lg flex items-center justify-center gap-1.5 disabled:opacity-50 transition-all hover:shadow-md"
                      style={{ background: '#059669' }}>
                      <Save className="w-3.5 h-3.5" />
                      {saving ? 'جاري الحفظ...' : 'حفظ الأسباب والإجراءات'}
                    </button>
                    <Link href={`/followups/plan/${student.id}`}
                      className="py-2.5 px-4 text-xs font-bold rounded-lg flex items-center gap-1.5 text-white transition-all hover:shadow-md hover:opacity-90"
                      style={{ background: 'linear-gradient(135deg, #C08A48 0%, #4f46e5 100%)' }}>
                      <CalendarDays className="w-4 h-4" /> استعراض الخطة
                    </Link>
                    <button onClick={() => { setFollowupStep(1) }}
                      className="py-2.5 px-3 text-[10px] rounded-lg border border-gray-200 text-gray-400 hover:bg-gray-50 transition-colors">
                      رجوع
                    </button>
                    <button onClick={() => { setExpandedStudent(null); setFollowupStep(1) }}
                      className="py-2.5 px-3 text-[10px] rounded-lg text-gray-400 hover:text-gray-600 transition-colors">
                      تخطي
                    </button>
                  </div>
                </>)}

              </div>
              )
            })()}
          </div>
        )})}

        {studentData.length === 0 && (
          <div className="text-center py-16">
            <BookOpenCheck className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>لا يوجد طلاب لمتابعتهم</p>
          </div>
        )}
      </div>
      </>}

      {/* ── مودال خطة علاجية ── */}
      {planModalFor && (
        <RemedialPlanModal
          studentId={planModalFor.student.id}
          studentName={planModalFor.student.name}
          batchId={planModalFor.student.batch_id}
          supervisorAuthId={profile?.id}
          triggerReason={`تأخر بـ${Math.abs(planModalFor.gap)} وجه عن المفترض في متابعة ${selectedDate}`}
          onCreated={() => { reloadCases() }}
          onClose={() => setPlanModalFor(null)}
        />
      )}

      {/* ── مودال تصعيد ── */}
      {escalateModalFor && (
        <EscalateModal
          caseRecord={escalateModalFor.case}
          studentName={escalateModalFor.student.name}
          actorAuthId={profile?.id}
          onEscalated={() => { reloadCases() }}
          onClose={() => setEscalateModalFor(null)}
        />
      )}
    </div>
  )
}
