'use client'
import { useState, useEffect, useMemo, useCallback, memo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import {
  getStudents, getSupervisors, getQuranPlans, getDailyFollowups, upsertDailyFollowup,
  getBatchSchedule, upsertQuranPlan, getExams, upsertExam, type DBStudent, type DBExam, type DBSupervisor,
} from '@/lib/db'
import {
  calculateExpectedPosition, getToday, PROGRAM_END_DATE,
  getStudentStatus, STATUS_LABELS, STATUS_COLORS, STATUS_BG,
  DELAY_REASONS, TREATMENT_ACTIONS,
  getCompletedJuz, getUpcomingExamDays,
  type QuranPlan, type DailyFollowup, type BatchScheduleEntry,
} from '@/lib/quran-followup'
import { formatHijriWithDay } from '@/lib/hijri'
import HijriDatePicker from '@/components/ui/HijriDatePicker'
import {
  BookOpenCheck, ChevronDown, ChevronUp, Save, Plus, Users, AlertTriangle,
  CheckCircle2, Clock, CalendarDays, FileText, Pencil, X, Eye,
} from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'

export default function FollowupsPage() {
  const { profile } = useAuth()
  const isCeo = profile?.role === 'ceo'
  const isBatchManager = profile?.role === 'batch_manager'
  const canViewSupervisors = isCeo || isBatchManager
  const myBatchId = profile?.batch_id ?? null

  const [students, setStudents] = useState<DBStudent[]>([])
  const [plans, setPlans] = useState<QuranPlan[]>([])
  const [followups, setFollowups] = useState<DailyFollowup[]>([])
  const [schedule, setSchedule] = useState<BatchScheduleEntry[]>([])
  const [supervisorsList, setSupervisorsList] = useState<DBSupervisor[]>([])
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

  // New plan form
  const [showAddPlan, setShowAddPlan] = useState<string | null>(null)
  const [planForm, setPlanForm] = useState({ startDate: getToday(), endDate: PROGRAM_END_DATE, startPosition: '1', dailyRate: '1' })

  useEffect(() => {
    async function load() {
      try {
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
        const f = await getDailyFollowups({ dateFrom: selectedDate, dateTo: selectedDate })
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

  // Build schedule map for algorithm
  const scheduleMap = useMemo(() => {
    const m = new Map<string, string>()
    schedule.forEach(e => m.set(e.date, e.day_type))
    return m
  }, [schedule])

  // Student view filter for supervisors: 'mine' | 'all'
  const [studentFilter, setStudentFilter] = useState<'mine' | 'all'>('mine')
  const isSupervisor = profile?.role === 'supervisor' || profile?.role === 'teacher'

  // Filter students by batch
  const allBatchStudents = useMemo(() => {
    if (isCeo) return students
    if (myBatchId !== null) return students.filter(s => s.batch_id === myBatchId)
    return []
  }, [students, myBatchId, isCeo])

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

  // Build plan map: student_id → plan
  const planMap = useMemo(() => {
    const m = new Map<string, QuranPlan>()
    plans.forEach(p => m.set(p.student_id, p))
    return m
  }, [plans])

  // Build followup map: student_id → followup for selected date
  const followupMap = useMemo(() => {
    const m = new Map<string, DailyFollowup>()
    followups.forEach(f => m.set(f.student_id, f))
    return m
  }, [followups])

  // For each student, compute expected position and status
  const studentData = useMemo(() => {
    return myStudents.map(student => {
      const plan = planMap.get(student.id)
      if (!plan) return { student, plan: null, expected: 0, followup: null, gap: null, status: 'no_plan' as const, isExamDay: false, isFollowed: false }

      const result = calculateExpectedPosition(
        plan.start_position,
        plan.start_date,
        selectedDate,
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
    }).sort((a, b) => {
      const order = { severe_delay: 0, slight_delay: 1, no_followup: 2, on_track: 3, no_plan: 4 }
      return (order[a.status] ?? 5) - (order[b.status] ?? 5)
    })
  }, [myStudents, planMap, followupMap, selectedDate, scheduleMap])

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
    const existing = followupMap.get(studentId)
    if (existing) {
      setFormActual(existing.actual_position ?? '')
      setFormNearReview(existing.near_review || '')
      setFormFarReview(existing.far_review || '')
      setFormReasons(Array.isArray(existing.delay_reasons) ? existing.delay_reasons : [])
      setFormActions(Array.isArray(existing.treatment_actions) ? existing.treatment_actions : [])
      setFormNotes(existing.notes || '')
      if (existing.expected_position != null && existing.expected_position !== computedExpected) {
        setFormExpectedOverride(existing.expected_position)
      } else {
        setFormExpectedOverride('')
      }
      // Always start at step 1 — user can manually navigate to step 2 if needed
      // (Step 2 auto-opens only after saving step 1 when gap is negative — see saveFollowup)
      setFollowupStep(1)
    } else {
      setFormActual('')
      setFormExpectedOverride('')
      setFormNearReview('')
      setFormFarReview('')
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

  // Save followup — step 1 saves actual/reviews, step 2 saves reasons/actions
  async function saveFollowup(studentId: string, expectedPosition: number, isExamDay: boolean) {
    if (formActual === '') {
      toast.error('أدخل الوجه الفعلي')
      return
    }
    setSaving(true)
    const actual = Number(formActual)
    const effectiveExpected = formExpectedOverride !== '' ? Number(formExpectedOverride) : expectedPosition
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

      // Step 1 → if behind, auto-transition to step 2
      if (followupStep === 1 && actual < effectiveExpected) {
        toast.success('تم الحفظ — حدد أسباب التأخر')
        setFollowupStep(2)
      } else {
        toast.success('تم حفظ المتابعة')
        setExpandedStudent(null)
        setFollowupStep(1)
      }

      // ── Auto exam scheduling (when on track) ──
      if (actual >= effectiveExpected) {
        const plan = planMap.get(studentId)
        const student = myStudents.find(s => s.id === studentId)
        if (plan && student) {
          try {
            const upcomingExams = getUpcomingExamDays(
              plan.start_position, plan.start_date, selectedDate,
              plan.daily_rate, scheduleMap, 7,
            )
            if (upcomingExams.length > 0) {
              const existingExams = await getExams()
              for (const examDay of upcomingExams) {
                const juzNum = getCompletedJuz(examDay.expectedPosition, plan.start_position)
                if (juzNum <= 0) continue
                // Check if exam already scheduled for this student + juz
                const alreadyScheduled = existingExams.some(e =>
                  e.student_id === studentId && e.juz_number === juzNum && (e.status === 'scheduled' || e.status === 'passed')
                )
                if (alreadyScheduled) continue
                // Check daily capacity
                const dayCount = existingExams.filter(e => e.date === examDay.date).length
                if (dayCount >= 3) continue // default max 3 per day
                const newExam: DBExam = {
                  id: `auto_${studentId}_j${juzNum}_${Date.now()}`,
                  student_id: studentId,
                  student_name: student.name,
                  batch_id: student.batch_id,
                  juz_number: juzNum,
                  examiner: profile?.name || 'المشرف',
                  date: examDay.date,
                  time: '10:00',
                  status: 'scheduled',
                  score: null,
                  notes: 'مجدول تلقائياً من المتابعات',
                }
                await upsertExam(newExam)
                toast.success(`تم جدولة اختبار الجزء ${juzNum} تلقائياً — ${examDay.date}`, { duration: 4000 })
              }
            }
          } catch (examErr) {
            console.error('Auto exam scheduling error:', examErr)
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
        <div className="flex items-center gap-2">
          <HijriDatePicker value={selectedDate} onChange={setSelectedDate} compact />
          {canViewSupervisors && (
            <Link
              href="/followups/manager"
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-xl transition-colors"
              style={{
                background: 'rgba(53,107,110,0.08)',
                border: '1px solid rgba(53,107,110,0.25)',
                color: 'var(--accent-teal)',
              }}
            >
              <Users className="w-3.5 h-3.5" />
              لوحة المدير
            </Link>
          )}
        </div>
      </div>

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
      <div className="space-y-3">
        {studentData.map(({ student, plan, expected, followup, gap, status, isExamDay, isFollowed }) => (
          <div
            key={student.id}
            className={`card-static overflow-hidden border transition-all ${
              expandedStudent === student.id ? 'ring-1 ring-emerald-400/50' : ''
            } ${plan ? STATUS_BG[status] : 'bg-gray-500/5 border-gray-200/20'}`}
          >
            {/* Student row */}
            <button
              onClick={() => plan ? expandStudent(student.id, expected) : setShowAddPlan(showAddPlan === student.id ? null : student.id)}
              className="w-full text-right p-4 flex items-center gap-3"
            >
              {/* Status indicator + checkmark */}
              <div className="relative flex-shrink-0">
                <div className={`w-3 h-3 rounded-full ${
                  status === 'on_track' ? 'bg-green-500' :
                  status === 'slight_delay' ? 'bg-amber-500' :
                  status === 'severe_delay' ? 'bg-red-500 animate-pulse' :
                  'bg-gray-300'
                }`} />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{student.name}</p>
                  {/* ✓ Followed checkmark */}
                  {isFollowed && (
                    <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  <span>دفعة {student.batch_id}</span>
                  {plan && (
                    <>
                      <span>•</span>
                      <span>المفترض: <strong className="font-mono">{expected}</strong></span>
                      {followup?.actual_position != null && (
                        <>
                          <span>•</span>
                          <span>الفعلي: <strong className="font-mono">{followup.actual_position}</strong></span>
                          <span>•</span>
                          <span className={`font-bold ${STATUS_COLORS[status]}`}>
                            {gap !== null && gap !== 0 ? (gap > 0 ? `+${gap}` : gap) : '0'} وجه
                          </span>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Status badge */}
              <span className={`text-[11px] px-2.5 py-1 rounded-full font-medium ${STATUS_COLORS[status]}`}>
                {isExamDay ? 'يوم اختبار' : STATUS_LABELS[status]}
              </span>

              {plan ? (
                expandedStudent === student.id ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />
              ) : (
                <Plus className="w-4 h-4 text-gray-400" />
              )}
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
                      background: gapVal === null ? '#fafafa' : gapVal >= 0 ? '#f0fdf4' : '#fef2f2',
                    }}>
                      <p className="text-[10px] text-gray-400 mb-0.5">الفجوة</p>
                      <span className="text-xl font-mono font-bold" style={{
                        color: gapVal === null ? '#d1d5db' : gapVal >= 0 ? '#16a34a' : '#dc2626',
                      }}>
                        {gapVal !== null ? (gapVal > 0 ? `+${gapVal}` : gapVal) : '—'}
                      </span>
                    </div>
                  </div>

                  {editingExpected && (
                    <p className="text-[10px] text-amber-500 mb-3 -mt-2">* سيعدّل وجه البداية في كامل الخطة</p>
                  )}

                  {/* المراجعات */}
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <label className="block">
                      <span className="text-[10px] text-gray-400 block mb-1">مراجعة قريبة</span>
                      <input value={formNearReview} onChange={e => setFormNearReview(e.target.value)}
                        placeholder="الأوجه القريبة..."
                        className="w-full px-3 py-2 text-xs rounded-lg bg-gray-50 border border-gray-200 text-gray-800 placeholder-gray-300 focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/20" />
                    </label>
                    <label className="block">
                      <span className="text-[10px] text-gray-400 block mb-1">مراجعة بعيدة</span>
                      <input value={formFarReview} onChange={e => setFormFarReview(e.target.value)}
                        placeholder="الأوجه البعيدة..."
                        className="w-full px-3 py-2 text-xs rounded-lg bg-gray-50 border border-gray-200 text-gray-800 placeholder-gray-300 focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/20" />
                    </label>
                  </div>

                  {/* ملاحظات */}
                  <label className="block mb-4">
                    <span className="text-[10px] text-gray-400 block mb-1">ملاحظات</span>
                    <input value={formNotes} onChange={e => setFormNotes(e.target.value)}
                      placeholder="ملاحظات إضافية..."
                      className="w-full px-3 py-2 text-xs rounded-lg bg-gray-50 border border-gray-200 text-gray-800 placeholder-gray-300 focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/20" />
                  </label>

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
        ))}

        {studentData.length === 0 && (
          <div className="text-center py-16">
            <BookOpenCheck className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>لا يوجد طلاب لمتابعتهم</p>
          </div>
        )}
      </div>
    </div>
  )
}
