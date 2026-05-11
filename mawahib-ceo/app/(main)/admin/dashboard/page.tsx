'use client'
/**
 * لوحة المدير التنفيذي — تصميم تنفيذي مكثّف:
 *   ١. Hero Status — إشارة مرور + ترحيب
 *   ٢. نبض اليوم — حضور طلاب/مشرفين + متابعات
 *   ٣. شريط المتأخرين التنفيذي — أبرز 3 + رقم إجمالي (نظرة واحدة)
 *   ٤. التذكيرات + آخر الأحداث (timeline)
 *   ٥. الدفعات — بطاقة لكل دفعة + أعلى ٣ وأدنى ٣ من نفس الدفعة
 *   ٦. الاختبارات الأخيرة — تصميم مدمج (طالب/جزء/درجة/EWH)
 *   ٧. حالات تصعيد المتعثرين + متابعات المشرفين بأرقام حقيقية
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  getBatches, getStudents, getAttendanceInRange, getExamsInRange, getPrograms,
  getSupervisors, getJuzProgress, getDailyFollowups,
  getAllSupervisorAttendanceForDate,
  type DBBatch, type DBStudent, type DBAttendanceRecord, type DBExam,
  type DBProgram,
  type DBSupervisor, type DBJuzProgress, type DBSupervisorAttendance,
} from '@/lib/db'
import { invalidateCache, CACHE_KEYS } from '@/lib/cache'
import type { DailyFollowup } from '@/lib/quran-followup'
import { getCases } from '@/lib/student-cases/db'
import { getViolations } from '@/lib/violations/db'
import type { CaseWithStudent } from '@/lib/student-cases/types'
import type { WeeklyViolation } from '@/lib/violations/types'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { getFollowupWeekRange, getThisWeekRange } from '@/lib/quran-followup'
import { formatHijriWithDay, toHijriShort } from '@/lib/hijri'
import {
  Users, AlertTriangle, UserCheck, ShieldAlert,
  Loader2, BookOpen, Activity, Crown, ArrowDownRight, ArrowUpRight,
  XCircle, ClipboardCheck, FileText, RefreshCw, Star,
  CheckCircle2,
} from 'lucide-react'
import Link from 'next/link'
import WisdomCard from '@/components/ui/WisdomCard'
import { localDateIso } from '@/lib/date'

const BATCH_COLORS: Record<number, { primary: string; bg: string; gradient: string }> = {
  48: { primary: '#C08A48', bg: 'rgba(192,138,72,0.10)', gradient: 'linear-gradient(135deg, #C08A48, #8a5e1a)' },
  46: { primary: '#356B6E', bg: 'rgba(53,107,110,0.10)', gradient: 'linear-gradient(135deg, #356B6E, #244A4D)' },
  44: { primary: '#5A8F67', bg: 'rgba(90,143,103,0.10)', gradient: 'linear-gradient(135deg, #5A8F67, #3F6E4B)' },
  42: { primary: '#5D4256', bg: 'rgba(93,66,86,0.10)',   gradient: 'linear-gradient(135deg, #5D4256, #3A2840)' },
}

function batchColor(id: number) {
  return BATCH_COLORS[id] ?? { primary: '#6b7280', bg: 'rgba(107,114,128,0.10)', gradient: 'linear-gradient(135deg, #6b7280, #4b5563)' }
}

// ── Main ─────────────────────────────────────────────────────────────
export default function AdminDashboardPage() {
  const { profile, loading: authLoading } = useAuth()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [students, setStudents] = useState<DBStudent[]>([])
  const [batches, setBatches] = useState<DBBatch[]>([])
  const [attendance, setAttendance] = useState<DBAttendanceRecord[]>([])
  const [exams, setExams] = useState<DBExam[]>([])
  const [programs, setPrograms] = useState<DBProgram[]>([])
  const [supervisors, setSupervisors] = useState<DBSupervisor[]>([])
  const [juzProgress, setJuzProgress] = useState<DBJuzProgress[]>([])
  const [todayFollowups, setTodayFollowups] = useState<DailyFollowup[]>([])
  const [weekFollowups, setWeekFollowups] = useState<DailyFollowup[]>([])
  const [supervisorAttendance, setSupervisorAttendance] = useState<DBSupervisorAttendance[]>([])
  const [activeCases, setActiveCases] = useState<CaseWithStudent[]>([])
  const [violations, setViolations] = useState<WeeklyViolation[]>([])

  // ── Fetch helper (manual refresh) ──
  const fetchAll = useCallback(async (force = false) => {
    const today = localDateIso(new Date())
    const fweek = getFollowupWeekRange()
    const tweek = getThisWeekRange()
    // نطاق الحضور: من بداية الأسبوع الميلادي إلى اليوم — يكفي للإحصائيات
    const attFrom = tweek.start < fweek.start ? tweek.start : fweek.start

    if (force) {
      invalidateCache(CACHE_KEYS.STUDENTS)
      invalidateCache(CACHE_KEYS.JUZ_PROGRESS)
      invalidateCache(`attendance_range:${attFrom}:${today}`)
      invalidateCache(CACHE_KEYS.EXAMS)
      invalidateCache(CACHE_KEYS.SUPERVISORS)
      invalidateCache(CACHE_KEYS.DAILY_FOLLOWUPS)
    }

    // نطاق الاختبارات: آخر 30 يوماً يكفي للوحة (الـ"الأخيرة" + الإحصائيات)
    const examsFrom = (() => {
      const d = new Date(); d.setDate(d.getDate() - 30)
      return localDateIso(d)
    })()

    // ١١ queries بدلاً من ١٢ — حذف getMeetings (غير مستخدم في الـUI)
    const [s, b, a, e, p, sup, j, tf, wf, c, v] = await Promise.all([
      getStudents(),
      getBatches(),
      getAttendanceInRange(attFrom, today),
      getExamsInRange(examsFrom),
      getPrograms(),
      getSupervisors(),
      getJuzProgress(),
      getDailyFollowups({ dateFrom: today, dateTo: today }),
      getDailyFollowups({ dateFrom: fweek.start, dateTo: fweek.end }),
      getCases({ status: 'active' }),
      getViolations({ fromDate: fweek.start, toDate: fweek.end }),
    ])
    setStudents(s); setBatches(b); setAttendance(a); setExams(e)
    setPrograms(p); setSupervisors(sup); setJuzProgress(j)
    setTodayFollowups(tf); setWeekFollowups(wf); setActiveCases(c); setViolations(v)

    // حضور المشرفين اليوم — query واحد لكل الدفعات (RLS يُفلتر)
    try {
      const supAtt = await getAllSupervisorAttendanceForDate(today)
      setSupervisorAttendance(supAtt)
    } catch { /* ignore */ }
  }, [])

  // Auth gate
  useEffect(() => {
    if (!authLoading && profile && profile.role !== 'ceo' && profile.role !== 'records_officer') {
      router.replace('/dashboard')
    }
  }, [profile, authLoading, router])

  // Initial load
  useEffect(() => {
    if (authLoading || !profile) return
    fetchAll(false).catch(console.error).finally(() => setLoading(false))
  }, [authLoading, profile, fetchAll])

  // Refresh on tab focus — لكن فقط لو مضى أكثر من ٥ دقائق (لتجنب burn cache)
  // الـcache بـSWR يخدم البيانات المخزّنة فوراً، فلا حاجة لـforce=true
  const lastFetchRef = useRef<number>(Date.now())
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return
      const elapsed = Date.now() - lastFetchRef.current
      // إعادة الجلب فقط لو مضى أكثر من ٥ دقائق، بدون bust للـcache
      if (elapsed > 5 * 60_000) {
        lastFetchRef.current = Date.now()
        fetchAll(false).catch(console.error)
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [fetchAll])

  // Manual refresh
  const handleRefresh = async () => {
    setRefreshing(true)
    try { await fetchAll(true) } finally { setRefreshing(false) }
  }

  // ─── حسابات ───────────────────────────────────────────
  const today = useMemo(() => localDateIso(new Date()), [])
  const activeStudents = useMemo(() => students.filter(s => s.status === 'active' || !s.status), [students])

  const memorizedJuzMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const row of juzProgress) {
      if (row.status === 'memorized') map.set(row.student_id, (map.get(row.student_id) || 0) + 1)
    }
    return map
  }, [juzProgress])

  const studentsWithJuz = useMemo(() => activeStudents.map(s => ({
    ...s, realJuz: memorizedJuzMap.get(s.id) || 0,
  })), [activeStudents, memorizedJuzMap])

  // نبض اليوم
  const todayStats = useMemo(() => {
    const todayAttendance = attendance.filter(a => a.date === today)
    const presentStudents = todayAttendance.filter(a => a.status === 'present' || a.status === 'late').length
    const absentStudents = todayAttendance.filter(a => a.status === 'absent').length
    const expectedToday = activeStudents.length
    const supPresent = supervisorAttendance.filter(s => s.status === 'present' || s.status === 'late').length
    const supAbsent = supervisorAttendance.filter(s => s.status === 'absent').length
    const supTotal = supervisors.filter(s => s.batch_id !== null).length
    const followedToday = todayFollowups.filter(f => f.actual_position != null).length
    return { presentStudents, absentStudents, expectedToday, supPresent, supAbsent, supTotal, followedToday }
  }, [attendance, today, activeStudents, supervisorAttendance, supervisors, todayFollowups])

  // المتأخرون الأسبوع
  const delayedThisWeek = useMemo(() => {
    const map = new Map<string, { studentId: string; worstGap: number; lastFollowup: string }>()
    for (const f of weekFollowups) {
      if (f.gap == null || f.gap >= 0) continue
      const cur = map.get(f.student_id)
      if (!cur || f.gap < cur.worstGap) {
        map.set(f.student_id, { studentId: f.student_id, worstGap: f.gap, lastFollowup: f.followup_date })
      }
    }
    return [...map.values()]
      .map(x => {
        const st = activeStudents.find(s => s.id === x.studentId)
        return st ? { ...x, name: st.name, batchId: st.batch_id, supervisorName: st.supervisor_name } : null
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) => a.worstGap - b.worstGap)
  }, [weekFollowups, activeStudents])

  // الدفعات + أعلى/أدنى لكل دفعة — تحسين O(n²) → O(n) عبر Maps
  const batchBreakdown = useMemo(() => {
    const weekRange = getThisWeekRange()

    // بناء Maps مرة واحدة (O(n)) بدلاً من filter متكرر داخل loop
    const studentsByBatch = new Map<number, typeof studentsWithJuz>()
    const studentToBatch  = new Map<string, number>()
    for (const s of studentsWithJuz) {
      if (!studentsByBatch.has(s.batch_id)) studentsByBatch.set(s.batch_id, [])
      studentsByBatch.get(s.batch_id)!.push(s)
      studentToBatch.set(s.id, s.batch_id)
    }

    const attendanceByBatch = new Map<number, { present: number; total: number }>()
    for (const a of attendance) {
      if (a.date < weekRange.start || a.date > weekRange.end) continue
      const bid = studentToBatch.get(a.student_id)
      if (bid === undefined) continue
      let entry = attendanceByBatch.get(bid)
      if (!entry) { entry = { present: 0, total: 0 }; attendanceByBatch.set(bid, entry) }
      entry.total++
      if (a.status === 'present' || a.status === 'late') entry.present++
    }

    const followedByBatch = new Map<number, Set<string>>()
    for (const f of weekFollowups) {
      if (f.actual_position == null) continue
      const bid = studentToBatch.get(f.student_id)
      if (bid === undefined) continue
      let set = followedByBatch.get(bid)
      if (!set) { set = new Set(); followedByBatch.set(bid, set) }
      set.add(f.student_id)
    }

    const violationsByBatch = new Map<number, number>()
    for (const v of violations) {
      if (v.batch_id == null) continue
      violationsByBatch.set(v.batch_id, (violationsByBatch.get(v.batch_id) || 0) + 1)
    }

    const supCountByBatch = new Map<number, number>()
    for (const sup of supervisors) {
      if (sup.batch_id == null) continue
      supCountByBatch.set(sup.batch_id, (supCountByBatch.get(sup.batch_id) || 0) + 1)
    }

    const batchIds = [...studentsByBatch.keys()].sort((a, b) => a - b)
    return batchIds.map(bid => {
      const bs = studentsByBatch.get(bid) || []
      const totalJuz = bs.reduce((sum, s) => sum + s.realJuz, 0)
      const avgJuz = bs.length ? (totalJuz / bs.length).toFixed(1) : '0'
      const avgPct = bs.length ? Math.round((totalJuz / (bs.length * 30)) * 100) : 0

      const att = attendanceByBatch.get(bid)
      const attendancePct = att && att.total ? Math.round((att.present / att.total) * 100) : 0

      const followedCount = followedByBatch.get(bid)?.size ?? 0
      const batchViolations = violationsByBatch.get(bid) ?? 0
      const supCount = supCountByBatch.get(bid) ?? 0

      const top3 = [...bs].sort((a, b) => b.realJuz - a.realJuz).slice(0, 3)
      const bottom3 = [...bs].sort((a, b) => a.realJuz - b.realJuz).slice(0, 3)

      const batchInfo = batches.find(x => x.id === bid)
      return {
        id: bid,
        name: batchInfo?.name || `دفعة ${bid}`,
        managerName: batchInfo?.manager_name || '—',
        studentsCount: bs.length, supervisorsCount: supCount,
        avgJuz, avgPct, attendancePct,
        followedCount, expectedFollowups: bs.length,
        violationsCount: batchViolations,
        top3, bottom3,
      }
    })
  }, [studentsWithJuz, attendance, weekFollowups, supervisors, violations, batches])

  // الاختبارات الأخيرة (آخر ٧ أيام)
  const recentExams = useMemo(() => {
    const sevenAgo = new Date(); sevenAgo.setDate(sevenAgo.getDate() - 7)
    const cutoff = localDateIso(sevenAgo)
    return [...exams]
      .filter(e => e.date >= cutoff && (e.status === 'passed' || e.status === 'failed'))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 8)
  }, [exams])


  // متابعات المشرفين بأرقام حقيقية (مهمة ٢٥)
  const supervisorTracking = useMemo(() => {
    return supervisors
      .filter(sup => sup.batch_id !== null)
      .map(sup => {
        const myStudents = activeStudents.filter(s => s.supervisor_id === sup.id)
        const studentIds = new Set(myStudents.map(s => s.id))
        const followedSet = new Set(
          weekFollowups
            .filter(f => studentIds.has(f.student_id) && f.actual_position != null)
            .map(f => f.student_id)
        )
        const followedStudents = myStudents.filter(s => followedSet.has(s.id))
        const notFollowedStudents = myStudents.filter(s => !followedSet.has(s.id))
        const violationsCount = violations.filter(v => v.supervisor_id === sup.id).length
        return {
          id: sup.id, name: sup.name, batchId: sup.batch_id,
          totalStudents: myStudents.length,
          followedCount: followedStudents.length,
          notFollowedCount: notFollowedStudents.length,
          followedNames: followedStudents.map(s => s.name),
          notFollowedNames: notFollowedStudents.map(s => s.name),
          violationsCount,
        }
      })
      .filter(s => s.totalStudents > 0)
      .sort((a, b) => b.notFollowedCount - a.notFollowedCount) // أكثر من لم يُتابِع أولاً
  }, [supervisors, activeStudents, weekFollowups, violations])

  // إشارة المرور
  const overallStatus = useMemo(() => {
    const issues: string[] = []
    if (delayedThisWeek.length > 5) issues.push(`${delayedThisWeek.length} طالب متأخر`)
    if (todayStats.absentStudents > 5) issues.push(`${todayStats.absentStudents} غائب اليوم`)
    if (todayStats.supAbsent > 1) issues.push(`${todayStats.supAbsent} مشرف غائب`)
    if (activeCases.length > 10) issues.push(`${activeCases.length} حالة تصعيد`)
    if (violations.length > 5) issues.push(`${violations.length} إخلال`)
    let level: 'green' | 'yellow' | 'red' = 'green'
    if (issues.length >= 3) level = 'red'
    else if (issues.length >= 1) level = 'yellow'
    return { level, issues }
  }, [delayedThisWeek, todayStats, activeCases, violations])

  // ─── UI ───────────────────────────────────────────────────────────
  if (loading || authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-10 h-10 animate-spin" style={{ color: 'var(--accent-warm)' }} />
      </div>
    )
  }
  if (!profile || (profile.role !== 'ceo' && profile.role !== 'records_officer')) return null

  const fweek = getFollowupWeekRange()
  const statusColors = {
    green:  { bg: 'rgba(90,143,103,0.10)', border: 'rgba(90,143,103,0.40)', color: '#3F6E4B', label: 'ممتاز' },
    yellow: { bg: 'rgba(192,138,72,0.10)', border: 'rgba(192,138,72,0.40)', color: '#8a5e1a', label: 'يحتاج انتباه' },
    red:    { bg: 'rgba(185,72,56,0.12)',  border: 'rgba(185,72,56,0.40)',  color: '#B94838', label: 'تنبيه عاجل' },
  }
  const sc = statusColors[overallStatus.level]

  return (
    <div className="space-y-2.5 sm:space-y-4 animate-fade-in-up">
      {/* ═══ 1. HERO ═══ */}
      <div className="card-static p-3 sm:p-5" style={{
        background: `linear-gradient(135deg, ${sc.bg}, var(--bg-card))`,
        border: `2px solid ${sc.border}`,
      }}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="min-w-0">
            <p className="eyebrow-pill mb-2"><span className="eyebrow-dot" /> لوحة المدير التنفيذي</p>
            <h1 className="display-h1 m-0 text-xl sm:text-2xl" style={{ color: 'var(--text-primary)' }}>
              نظرة شاملة على البرنامج
            </h1>
            <p className="text-xs sm:text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>
              {formatHijriWithDay(today)} · أسبوع المتابعة: {toHijriShort(fweek.start)} → {toHijriShort(fweek.end)}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
              style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
              title="تحديث البيانات"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'تحديث...' : 'تحديث'}
            </button>
            <div className="flex items-center gap-2 px-3 sm:px-5 py-2 sm:py-3 rounded-2xl shadow-sm"
              style={{ background: '#fff', border: `2px solid ${sc.border}` }}>
              <div className="w-4 h-4 sm:w-6 sm:h-6 rounded-full animate-pulse-soft" style={{ background: sc.color }} />
              <div>
                <p className="text-[9px] sm:text-[10px] font-semibold opacity-70" style={{ color: 'var(--text-muted)' }}>الحالة</p>
                <p className="font-black text-sm sm:text-lg" style={{ color: sc.color }}>{sc.label}</p>
              </div>
            </div>
          </div>
        </div>
        {overallStatus.issues.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {overallStatus.issues.map(i => (
              <span key={i} className="text-[11px] font-semibold px-2 py-1 rounded-lg"
                style={{ background: '#fff', color: sc.color, border: `1px solid ${sc.border}` }}>{i}</span>
            ))}
          </div>
        )}
      </div>

      {/* ═══ 2. نبض اليوم ═══ */}
      <section>
        <h2 className="font-bold text-sm sm:text-base mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <Activity className="w-4 h-4" style={{ color: 'var(--accent-teal)' }} />
          نبض اليوم
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          <PulseCard icon={<UserCheck className="w-4 h-4 sm:w-5 sm:h-5" />} color="#5A8F67" value={todayStats.presentStudents} total={todayStats.expectedToday} label="طلاب حاضرون" href="/attendance" />
          <PulseCard icon={<XCircle className="w-4 h-4 sm:w-5 sm:h-5" />} color="#B94838" value={todayStats.absentStudents} label="غائبون اليوم" urgent={todayStats.absentStudents > 5} href="/attendance" />
          <PulseCard icon={<UserCheck className="w-4 h-4 sm:w-5 sm:h-5" />} color="#356B6E" value={todayStats.supPresent} total={todayStats.supTotal} label="مشرفون حاضرون" href="/supervisors" />
          <PulseCard icon={<ClipboardCheck className="w-4 h-4 sm:w-5 sm:h-5" />} color="#C08A48" value={todayStats.followedToday} label="متابعات اليوم" href="/followups" />
        </div>
      </section>

      {/* ═══ 3. شريط المتأخرين التنفيذي (مهمة ٢٠) ═══ */}
      {delayedThisWeek.length > 0 && (
        <Link href="/followups" className="card-static p-3 sm:p-4 flex items-center gap-3 hover:shadow-md transition-all group"
          style={{ background: 'linear-gradient(90deg, rgba(185,72,56,0.06), var(--bg-card))', border: '1px solid rgba(185,72,56,0.25)' }}>
          <div className="flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(185,72,56,0.12)' }}>
            <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6" style={{ color: '#B94838' }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-black text-base sm:text-lg" style={{ color: '#B94838' }}>{delayedThisWeek.length}</span>
              <span className="font-bold text-xs sm:text-sm" style={{ color: 'var(--text-primary)' }}>متأخر هذا الأسبوع</span>
              <span className="hidden sm:inline text-[10px] font-mono px-1.5 py-0.5 rounded"
                style={{ background: '#B94838', color: '#fff' }}>
                أسوأ: {delayedThisWeek[0].worstGap} وجه
              </span>
            </div>
            {/* أبرز ٣ كنص واحد */}
            <p className="text-[10px] sm:text-[11px] truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {delayedThisWeek.slice(0, 3).map(d =>
                `${d.name} (${d.worstGap})`
              ).join(' · ')}
              {delayedThisWeek.length > 3 && ` · و ${delayedThisWeek.length - 3} آخرين`}
            </p>
          </div>
          <ArrowUpRight className="w-4 h-4 flex-shrink-0 group-hover:scale-110 transition-transform" style={{ color: '#B94838' }} />
        </Link>
      )}

      {/* ═══ 4. تذكيرة إيمانية ═══ */}
      <section>
        <WisdomCard />
      </section>

      {/* ═══ 5. الدفعات (per-batch comparison مهمة ٢٢) ═══ */}
      <section>
        <h2 className="font-bold text-sm sm:text-base mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <BookOpen className="w-4 h-4" style={{ color: 'var(--accent-warm)' }} />
          الدفعات
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-4 gap-2 sm:gap-3">
          {batchBreakdown.map(b => {
            const c = batchColor(b.id)
            return (
              <div key={b.id} className="card-static p-0 overflow-hidden">
                <div className="px-2.5 sm:px-4 py-2 sm:py-3 text-white" style={{ background: c.gradient }}>
                  <div className="flex items-center justify-between gap-1">
                    <div className="min-w-0">
                      <h3 className="font-bold text-xs sm:text-base truncate">{b.name}</h3>
                      <p className="text-[9px] sm:text-[10px] opacity-90 truncate">{b.managerName}</p>
                    </div>
                    <div className="text-left flex-shrink-0">
                      <p className="font-mono font-black text-base sm:text-2xl leading-none">{b.avgPct}%</p>
                      <p className="text-[8px] sm:text-[9px] opacity-90">متوسط الحفظ</p>
                    </div>
                  </div>
                </div>
                <div className="p-2 sm:p-3 space-y-1.5 sm:space-y-2">
                  <div className="grid grid-cols-2 gap-1.5">
                    <BatchStatCell value={b.studentsCount} label="طالب" color={c.primary} />
                    <BatchStatCell value={b.supervisorsCount} label="مشرف" color={c.primary} />
                    <BatchStatCell value={`${b.avgJuz}`} label="متوسط الأجزاء" color={c.primary} />
                    <BatchStatCell value={`${b.attendancePct}%`} label="حضور الأسبوع" color={c.primary} />
                  </div>

                  <div className="rounded-lg p-2 flex items-center justify-between gap-2" style={{ background: c.bg }}>
                    <span className="text-[10px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                      متابعات: <span className="font-mono font-bold">{b.followedCount}/{b.expectedFollowups}</span>
                    </span>
                    {b.violationsCount > 0 && (
                      <span className="text-[10px] font-bold flex items-center gap-1" style={{ color: '#B94838' }}>
                        <AlertTriangle className="w-2.5 h-2.5" /> {b.violationsCount}
                      </span>
                    )}
                  </div>

                  {/* أعلى ٣ + أدنى ٣ في نفس الدفعة */}
                  {b.top3.length > 0 && (
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t" style={{ borderColor: 'var(--border-soft)' }}>
                      <div>
                        <p className="text-[9px] font-bold mb-1 flex items-center gap-1" style={{ color: '#5A8F67' }}>
                          <Crown className="w-2.5 h-2.5" />
                          أعلى ٣
                        </p>
                        {b.top3.map((s, i) => (
                          <div key={s.id} className="flex items-center justify-between text-[10px] mb-0.5">
                            <span className="truncate ml-1" style={{ color: 'var(--text-primary)' }}>{i + 1}. {s.name}</span>
                            <span className="font-mono font-bold flex-shrink-0" style={{ color: '#5A8F67' }}>{s.realJuz}</span>
                          </div>
                        ))}
                      </div>
                      <div>
                        <p className="text-[9px] font-bold mb-1 flex items-center gap-1" style={{ color: '#B94838' }}>
                          <ArrowDownRight className="w-2.5 h-2.5" />
                          أدنى ٣
                        </p>
                        {b.bottom3.map((s, i) => (
                          <div key={s.id} className="flex items-center justify-between text-[10px] mb-0.5">
                            <span className="truncate ml-1" style={{ color: 'var(--text-primary)' }}>{i + 1}. {s.name}</span>
                            <span className="font-mono font-bold flex-shrink-0" style={{ color: '#B94838' }}>{s.realJuz}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* ═══ 6. الاختبارات الأخيرة (مدمجة مهمة ٢٣) ═══ */}
      {recentExams.length > 0 && (
        <section className="card-static p-3 sm:p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-sm flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <FileText className="w-4 h-4" style={{ color: 'var(--accent-teal)' }} />
              آخر الاختبارات
              <span className="text-[10px] font-normal" style={{ color: 'var(--text-muted)' }}>(٧ أيام)</span>
            </h3>
            <Link href="/exams" className="text-[11px] font-bold text-amber-700 hover:underline">الكل ←</Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-1.5 sm:gap-2">
            {recentExams.map(e => <ExamCard key={e.id} exam={e} />)}
          </div>
        </section>
      )}

      {/* ═══ 7. حالات تصعيد المتعثرين + متابعات المشرفين ═══ */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* حالات تصعيد المتعثرين — تصميم غني */}
        <div className="card-static p-0 overflow-hidden">
          {/* رأس بـgradient */}
          <div className="px-3 sm:px-4 py-2.5 flex items-center justify-between"
            style={{ background: 'linear-gradient(135deg, #B94838, #7f1d1d)' }}>
            <h3 className="font-bold text-sm flex items-center gap-2 text-white">
              <ShieldAlert className="w-4 h-4" />
              حالات تصعيد المتعثرين
            </h3>
            <span className="text-[11px] font-mono font-black px-2 py-0.5 rounded"
              style={{ background: 'rgba(255,255,255,0.20)', color: '#fff' }}>
              {activeCases.length}
            </span>
          </div>

          {activeCases.length === 0 ? (
            <div className="text-center py-8 px-4">
              <CheckCircle2 className="w-12 h-12 mx-auto mb-2" style={{ color: '#5A8F67' }} />
              <p className="font-bold text-sm" style={{ color: '#3F6E4B' }}>لا متعثرين في تصعيد</p>
              <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>كل الطلاب على المسار الصحيح</p>
            </div>
          ) : (
            <div className="p-2.5 space-y-2.5">
              {/* شريط مراحل أفقي */}
              <div className="grid grid-cols-3 gap-1.5">
                {(['stage_1_supervisor', 'stage_2_batch_manager', 'stage_3_ceo'] as const).map(stage => {
                  const count = activeCases.filter(c => c.current_stage === stage).length
                  const labels = {
                    stage_1_supervisor:    { label: 'عند المشرف',  color: '#356B6E', bg: 'rgba(53,107,110,0.10)',  icon: '👨‍🏫' },
                    stage_2_batch_manager: { label: 'عند المدير',  color: '#C9972C', bg: 'rgba(201,151,44,0.10)',  icon: '👨‍💼' },
                    stage_3_ceo:           { label: 'تنفيذي',       color: '#B94838', bg: 'rgba(185,72,56,0.10)',   icon: '🚨' },
                  }
                  const lbl = labels[stage]
                  return (
                    <div key={stage} className="rounded-lg p-2 text-center"
                      style={{ background: lbl.bg, border: `1px solid ${lbl.color}30` }}>
                      <div className="flex items-center justify-center gap-1 mb-0.5">
                        <span className="text-sm">{lbl.icon}</span>
                        <p className="font-mono font-black text-base" style={{ color: lbl.color }}>{count}</p>
                      </div>
                      <p className="text-[9px] font-semibold leading-none" style={{ color: lbl.color }}>{lbl.label}</p>
                    </div>
                  )
                })}
              </div>

              {/* قائمة الحالات الفعلية (top 4) */}
              <div className="space-y-1.5">
                {activeCases.slice(0, 4).map(cs => {
                  const stageMap = {
                    stage_1_supervisor:    { label: 'مشرف',    color: '#356B6E', bg: 'rgba(53,107,110,0.08)' },
                    stage_2_batch_manager: { label: 'مدير',    color: '#C9972C', bg: 'rgba(201,151,44,0.08)' },
                    stage_3_ceo:           { label: 'تنفيذي', color: '#B94838', bg: 'rgba(185,72,56,0.08)' },
                    resolved:              { label: 'محلولة', color: '#5A8F67', bg: 'rgba(90,143,103,0.08)' },
                    closed:                { label: 'مغلقة',  color: '#6b7280', bg: 'rgba(107,114,128,0.08)' },
                  }
                  const sm = stageMap[cs.current_stage]
                  const c = batchColor(cs.batch_id ?? 0)
                  return (
                    <Link
                      key={cs.id}
                      href={`/student-cases/${cs.id}`}
                      className="flex items-center gap-2 p-2 rounded-lg border hover:shadow-sm transition-all group"
                      style={{ background: sm.bg, borderColor: `${sm.color}30` }}
                    >
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: sm.color, color: '#fff' }}>
                        <ShieldAlert className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                          <p className="font-bold text-xs truncate" style={{ color: 'var(--text-primary)' }}>
                            {cs.student_name}
                          </p>
                          <span className="text-[9px] px-1 py-0.5 rounded font-semibold flex-shrink-0"
                            style={{ background: c.bg, color: c.primary }}>
                            د{cs.batch_id}
                          </span>
                          <span className="text-[9px] px-1 py-0.5 rounded font-bold flex-shrink-0"
                            style={{ background: sm.color, color: '#fff' }}>
                            {sm.label}
                          </span>
                        </div>
                        <p className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>
                          {cs.trigger_reason}
                        </p>
                      </div>
                      <ArrowUpRight className="w-3.5 h-3.5 flex-shrink-0 group-hover:scale-110 transition-transform"
                        style={{ color: sm.color }} />
                    </Link>
                  )
                })}
              </div>

              {activeCases.length > 4 && (
                <Link href="/followups?tab=cases" className="block text-center text-[11px] font-bold py-1.5 rounded-lg transition-colors hover:bg-amber-50"
                  style={{ color: '#8a5e1a', background: 'rgba(192,138,72,0.08)', border: '1px solid rgba(192,138,72,0.20)' }}>
                  عرض {activeCases.length - 4} حالة أخرى ←
                </Link>
              )}
            </div>
          )}
        </div>

        {/* متابعات المشرفين بأرقام حقيقية (مهمة ٢٥) */}
        <div className="card-static p-3 sm:p-4">
          <h3 className="font-bold text-sm mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Users className="w-4 h-4" style={{ color: '#C08A48' }} />
            متابعات المشرفين الأسبوعية
          </h3>
          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
            {supervisorTracking.map(s => {
              const c = batchColor(s.batchId ?? 0)
              const allDone = s.notFollowedCount === 0
              return (
                <div key={s.id} className="rounded-lg p-2.5 border"
                  style={{
                    background: allDone ? 'rgba(90,143,103,0.06)' : 'var(--bg-card)',
                    borderColor: allDone ? 'rgba(90,143,103,0.30)' : 'var(--border-soft)',
                  }}>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-bold flex-shrink-0"
                        style={{ background: c.bg, color: c.primary }}>د{s.batchId}</span>
                      <p className="font-bold text-xs truncate" style={{ color: 'var(--text-primary)' }}>{s.name}</p>
                      {s.violationsCount > 0 && (
                        <span className="text-[9px] px-1 py-0.5 rounded font-bold flex-shrink-0"
                          style={{ background: 'rgba(185,72,56,0.10)', color: '#B94838' }}>
                          {s.violationsCount} إخلال
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <div className="rounded p-1.5 flex items-center gap-1.5"
                      style={{ background: 'rgba(90,143,103,0.08)' }}>
                      <CheckCircle2 className="w-3 h-3 flex-shrink-0" style={{ color: '#5A8F67' }} />
                      <div className="min-w-0">
                        <p className="font-mono font-bold text-sm leading-none" style={{ color: '#3F6E4B' }}>{s.followedCount}</p>
                        <p className="text-[9px] truncate" style={{ color: '#3F6E4B' }}>تابع: {s.followedNames.join('، ') || '—'}</p>
                      </div>
                    </div>
                    <div className="rounded p-1.5 flex items-center gap-1.5"
                      style={{ background: s.notFollowedCount > 0 ? 'rgba(185,72,56,0.08)' : 'rgba(150,150,150,0.05)' }}>
                      <XCircle className="w-3 h-3 flex-shrink-0" style={{ color: s.notFollowedCount > 0 ? '#B94838' : 'var(--text-muted)' }} />
                      <div className="min-w-0">
                        <p className="font-mono font-bold text-sm leading-none" style={{ color: s.notFollowedCount > 0 ? '#B94838' : 'var(--text-muted)' }}>
                          {s.notFollowedCount}
                        </p>
                        <p className="text-[9px] truncate" style={{ color: s.notFollowedCount > 0 ? '#B94838' : 'var(--text-muted)' }}>
                          لم يتابع: {s.notFollowedNames.join('، ') || '—'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ═══ 8. البرامج التربوية (هامشي — آخر الصفحة) ═══ */}
      {programs.length > 0 && (
        <section className="card-static p-3 sm:p-4 opacity-90">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-xs sm:text-sm flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
              <Star className="w-3.5 h-3.5" style={{ color: 'var(--accent-warm)' }} />
              البرامج التربوية
              <span className="text-[10px] font-normal" style={{ color: 'var(--text-muted)' }}>({programs.length})</span>
            </h3>
            <Link href="/programs" className="text-[10px] font-bold text-amber-700 hover:underline">عرض الكل ←</Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {programs.slice(0, 6).map(p => {
              const isPast = p.end_date < today
              const isUpcoming = p.start_date > today
              const status = isPast ? 'مكتمل' : isUpcoming ? 'قادم' : 'جارٍ'
              const statusColor = isPast ? '#5A8F67' : isUpcoming ? '#C08A48' : '#356B6E'
              return (
                <div key={p.id} className="rounded-lg p-2 border" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-soft)' }}>
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="text-xs font-bold flex-1 truncate" style={{ color: 'var(--text-primary)' }}>{p.name}</p>
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold flex-shrink-0"
                      style={{ background: `${statusColor}15`, color: statusColor, border: `1px solid ${statusColor}40` }}>
                      {status}
                    </span>
                  </div>
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    {toHijriShort(p.start_date)} → {toHijriShort(p.end_date)}
                    {p.location && ` · ${p.location}`}
                  </p>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────
function PulseCard({
  icon, color, value, total, label, urgent, href,
}: {
  icon: React.ReactNode; color: string; value: number; total?: number; label: string; urgent?: boolean; href?: string
}) {
  const inner = (
    <div className="card-static p-2 sm:p-4 transition-all hover:shadow-md cursor-pointer h-full"
      style={{ borderColor: urgent ? color : undefined, borderWidth: urgent ? 2 : 1 }}>
      <div className="flex items-center justify-between mb-1 sm:mb-2">
        <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-md sm:rounded-lg flex items-center justify-center" style={{ background: `${color}15`, color }}>
          {icon}
        </div>
        {urgent && <AlertTriangle className="w-3 h-3 sm:w-3.5 sm:h-3.5 animate-pulse" style={{ color }} />}
      </div>
      <p className="font-mono font-black text-lg sm:text-2xl leading-none mb-0.5" style={{ color: 'var(--text-primary)' }}>
        {value}
        {total !== undefined && <span className="text-[10px] sm:text-sm font-normal" style={{ color: 'var(--text-muted)' }}> / {total}</span>}
      </p>
      <p className="text-[9px] sm:text-[11px] font-semibold mt-0.5 leading-tight" style={{ color: 'var(--text-muted)' }}>{label}</p>
    </div>
  )
  return href ? <Link href={href} className="block h-full">{inner}</Link> : inner
}

function BatchStatCell({ value, label, color }: { value: string | number; label: string; color: string }) {
  return (
    <div className="rounded-md sm:rounded-lg px-1.5 py-1.5 sm:p-2 text-center"
      style={{ background: `${color}10`, border: `1px solid ${color}25` }}>
      <p className="font-mono font-bold text-base sm:text-lg leading-none" style={{ color }}>{value}</p>
      <p className="text-[9px] sm:text-[10px] mt-0.5 font-semibold leading-tight" style={{ color: 'var(--text-secondary)' }}>{label}</p>
    </div>
  )
}

// كرت اختبار — تصميم واضح مع PASS/FAIL
function ExamCard({ exam }: { exam: DBExam }) {
  const c = batchColor(exam.batch_id)
  const passed = exam.status === 'passed'
  const grade = exam.score ?? 0
  const errors = exam.errors ?? 0
  const warnings = exam.warnings ?? 0
  const hesitations = exam.hesitations ?? 0
  const hasIssues = errors + warnings + hesitations > 0

  const passColor = passed ? '#3F6E4B' : '#B94838'
  const passBg    = passed ? 'rgba(90,143,103,0.10)' : 'rgba(185,72,56,0.10)'
  const passBgStrong = passed ? '#5A8F67' : '#B94838'

  return (
    <div className="rounded-lg overflow-hidden border" style={{
      background: 'var(--bg-card)',
      borderColor: `${passColor}50`,
    }}>
      {/* صف رئيسي مدمج: شريط النتيجة + معلومات الطالب */}
      <div className="flex items-stretch">
        {/* شريط جانبي للنتيجة */}
        <div className="flex flex-col items-center justify-center px-1.5 py-2 flex-shrink-0"
          style={{ background: passBgStrong, color: '#fff', minWidth: '38px' }}>
          {passed ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
          {grade > 0 && (
            <span className="font-mono font-black text-xs mt-0.5">{grade}</span>
          )}
        </div>

        {/* المعلومات الرئيسية */}
        <div className="p-2 flex-1 min-w-0">
          <div className="flex items-center gap-1 mb-0.5">
            <p className="font-bold text-[11px] sm:text-xs flex-1 truncate" style={{ color: 'var(--text-primary)' }}>
              {exam.student_name}
            </p>
            <span className="text-[8px] px-1 py-0.5 rounded font-bold flex-shrink-0"
              style={{ background: c.bg, color: c.primary }}>د{exam.batch_id}</span>
          </div>
          <p className="text-[9px] sm:text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>
            <span className="font-bold" style={{ color: c.primary }}>ج{exam.juz_number}</span>
            <span className="mx-1">·</span>
            <span className={passed ? 'text-emerald-600' : 'text-red-500'}>{passed ? 'اجتاز' : 'لم يجتز'}</span>
            <span className="mx-1">·</span>
            <span>{toHijriShort(exam.date)}</span>
          </p>
        </div>
      </div>

      {/* شريط EWH أفقي مدمج (إن وُجد) */}
      {hasIssues && (
        <div className="grid grid-cols-3 border-t" style={{ borderColor: 'var(--border-soft)' }}>
          <ErrorCell count={errors}      label="خ" color="#B94838" />
          <ErrorCell count={warnings}    label="ت" color="#C9972C" />
          <ErrorCell count={hesitations} label="د" color="#356B6E" />
        </div>
      )}
    </div>
  )
}

function ErrorCell({ count, label, color }: { count: number; label: string; color: string }) {
  const active = count > 0
  return (
    <div className="text-center py-0.5 flex items-center justify-center gap-1"
      style={{
        background: active ? `${color}10` : 'transparent',
      }}>
      <span className="font-mono font-bold text-[10px]" style={{ color: active ? color : 'var(--text-muted)' }}>{count}</span>
      <span className="text-[9px] font-semibold" style={{ color: active ? color : 'var(--text-muted)' }}>{label}</span>
    </div>
  )
}
