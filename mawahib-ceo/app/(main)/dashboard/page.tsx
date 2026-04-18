'use client'
import { useState, useEffect, useMemo } from 'react'
import {
  getBatches, getStudents, getAllAttendance, getExams, getMeetings,
  getPrograms, getSupervisors, getJuzProgress,
  type DBBatch, type DBStudent, type DBAttendanceRecord, type DBExam,
  type DBMeeting, type DBProgram, type DBSupervisor, type DBJuzProgress,
} from '@/lib/db'
import { useAuth } from '@/contexts/AuthContext'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import {
  Users, CalendarCheck, BookOpen, AlertTriangle, Info, AlertCircle,
  Calendar, ChevronLeft, TrendingUp, Activity, Zap, Loader2,
  Target, Star, UserCheck, Clock,
} from 'lucide-react'
import Link from 'next/link'
import CountUp from '@/components/ui/CountUp'
import ProgressRing from '@/components/ui/ProgressRing'

// ── Constants ─────────────────────────────────────────────────────────────────
const PROGRAM_START = new Date('2026-02-27') // ٢٩ رجب ١٤٤٧
const WEEKLY_RATE = 16 // سطراً في الأسبوع
const BATCH_IDS = [48, 46, 44, 42]
const BATCH_COLORS: Record<number, string> = { 48: '#6366f1', 46: '#06b6d4', 44: '#22c55e', 42: '#f59e0b' }

const DAYS_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
const SUPERVISOR_MEETING_TYPES = ['general_management', 'annual_planning', 'quarterly_teachers']
const MEETING_LABELS: Record<string, string> = {
  general_management: 'الإدارة العامة', executive: 'تنفيذية',
  annual_planning: 'الخطة السنوية', quarterly_teachers: 'فصلي للمعلمين',
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDateAr(iso: string) {
  const d = new Date(iso)
  return `${DAYS_AR[d.getDay()]} ${d.getDate()} ${MONTHS_AR[d.getMonth()]}`
}

function weeksElapsed(): number {
  return (Date.now() - PROGRAM_START.getTime()) / (7 * 24 * 3600 * 1000)
}

function AlertIcon({ type }: { type: string }) {
  if (type === 'danger') return <AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: '#ef4444' }} />
  if (type === 'warning') return <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: '#f59e0b' }} />
  return <Info className="w-4 h-4 flex-shrink-0" style={{ color: '#6366f1' }} />
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const todayISO = new Date().toISOString().split('T')[0]
  const today = new Date().toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  const { profile } = useAuth()
  const isCeo = profile?.role === 'ceo'
  // مقيَّد بالدفعة: يشمل مدير الدفعة كذلك (ليس فقط المشرف/المعلم)
  const isSupervisor = profile?.role === 'supervisor' || profile?.role === 'teacher' || profile?.role === 'batch_manager'
  const myBatchId = profile?.batch_id ?? null

  const [loading, setLoading] = useState(true)
  const [students, setStudents] = useState<DBStudent[]>([])
  const [juzProgress, setJuzProgress] = useState<DBJuzProgress[]>([])
  const [attendance, setAttendance] = useState<DBAttendanceRecord[]>([])
  const [exams, setExams] = useState<DBExam[]>([])
  const [meetings, setMeetings] = useState<DBMeeting[]>([])
  const [programs, setPrograms] = useState<DBProgram[]>([])
  const [supervisors, setSupervisors] = useState<DBSupervisor[]>([])
  const [batches, setBatches] = useState<DBBatch[]>([])

  useEffect(() => {
    Promise.all([
      getStudents(), getJuzProgress(), getAllAttendance(),
      getExams(), getMeetings(), getPrograms(), getSupervisors(), getBatches(),
    ]).then(([s, j, a, e, m, p, sv, b]) => {
      setStudents(s); setJuzProgress(j); setAttendance(a)
      setExams(e); setMeetings(m); setPrograms(p)
      setSupervisors(sv); setBatches(b)
    }).catch(console.error).finally(() => setLoading(false))
  }, [])

  // ── Derived data ─────────────────────────────────────────────────────────────
  const activeStudents = useMemo(() =>
    students.filter(s => s.status === 'active' &&
      (!isSupervisor || myBatchId === null || s.batch_id === myBatchId)
    ), [students, isSupervisor, myBatchId])

  // Memorized juz count per student (from source of truth: juz_progress)
  const memorizedByStudent = useMemo(() => {
    const map: Record<string, number> = {}
    for (const p of juzProgress) {
      if (p.status === 'memorized') map[p.student_id] = (map[p.student_id] || 0) + 1
    }
    return map
  }, [juzProgress])

  // juz activity this week
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const juzThisWeek = useMemo(() =>
    juzProgress.filter(p =>
      p.status === 'memorized' &&
      p.updated_at && p.updated_at >= weekAgo &&
      (!isSupervisor || !myBatchId || activeStudents.some(s => s.id === p.student_id))
    ).length
  , [juzProgress, weekAgo, isSupervisor, myBatchId, activeStudents])

  // Hero numbers
  const totalActiveStudents = activeStudents.length
  const totalMemorized = useMemo(() =>
    activeStudents.reduce((sum, s) => sum + (memorizedByStudent[s.id] || 0), 0)
  , [activeStudents, memorizedByStudent])

  const todayAttRecs = attendance.filter(a => a.date === todayISO &&
    (!isSupervisor || !myBatchId || a.batch_id === String(myBatchId)))
  const presentToday = todayAttRecs.filter(a => a.status === 'present').length
  const attendancePct = todayAttRecs.length > 0 ? Math.round((presentToday / todayAttRecs.length) * 100) : 0

  const needsAttention = useMemo(() =>
    activeStudents.filter(s => (memorizedByStudent[s.id] || 0) === 0 ||
      (memorizedByStudent[s.id] || 0) / 30 < 0.1)
  , [activeStudents, memorizedByStudent])

  // Program pace
  const weeks = weeksElapsed()
  const expectedLinesPerStudent = Math.round(weeks * WEEKLY_RATE)
  const weekNumber = Math.ceil(weeks)

  // Batch stats — للمقيَّد بدفعة: دفعته فقط. للمدير التنفيذي: كل الدفعات.
  const visibleBatchIds = useMemo(() =>
    (isSupervisor && myBatchId !== null) ? [myBatchId] : BATCH_IDS
  , [isSupervisor, myBatchId])

  const batchStats = useMemo(() => visibleBatchIds.map(batchId => {
    const bs = students.filter(s => s.batch_id === batchId && s.status === 'active')
    const mem = bs.reduce((sum, s) => sum + (memorizedByStudent[s.id] || 0), 0)
    const possible = bs.length * 30
    const pct = possible > 0 ? Math.round((mem / possible) * 100) : 0
    const struggling = bs.filter(s => {
      const m = memorizedByStudent[s.id] || 0
      return m < 3 && weeks > 4
    }).length
    const batch = batches.find(b => b.id === batchId)
    return { batchId, name: batch?.name || `دفعة ${batchId}`, students: bs.length, memorized: mem, pct, struggling, manager: batch?.manager_name || '' }
  }), [visibleBatchIds, students, memorizedByStudent, batches, weeks])

  const chartData = batchStats.map(b => ({ name: `دفعة ${b.batchId}`, محفوظ: b.memorized, طلاب: b.students }))

  // Top 5 performers & 5 needs attention
  const ranked = useMemo(() =>
    [...activeStudents]
      .map(s => ({ ...s, mem: memorizedByStudent[s.id] || 0 }))
      .sort((a, b) => b.mem - a.mem)
  , [activeStudents, memorizedByStudent])

  const topPerformers = ranked.slice(0, 5)
  const bottomStudents = ranked.filter(s => s.mem < 3).slice(0, 5)

  // Supervisor health — للمقيَّد بدفعة: مشرفو دفعته فقط
  const scopedSupervisors = useMemo(() =>
    (isSupervisor && myBatchId !== null)
      ? supervisors.filter(sup => sup.batch_id === myBatchId)
      : supervisors
  , [supervisors, isSupervisor, myBatchId])

  const supervisorHealth = useMemo(() =>
    scopedSupervisors.map(sup => {
      const supStudents = activeStudents.filter(s =>
        s.supervisor_id === sup.id || s.supervisor_name === sup.name)
      const avgMem = supStudents.length > 0
        ? supStudents.reduce((sum, s) => sum + (memorizedByStudent[s.id] || 0), 0) / supStudents.length
        : 0
      return { ...sup, studentCount: supStudents.length, avgMem: Math.round(avgMem * 10) / 10 }
    }).filter(s => s.studentCount > 0)
  , [scopedSupervisors, activeStudents, memorizedByStudent])

  // Alerts (CEO only)
  const alerts = useMemo(() => {
    const list: { id: string; type: string; title: string; desc: string; link: string }[] = []
    if (!isSupervisor && needsAttention.length > 0)
      list.push({ id: 'attn', type: 'danger', title: `${needsAttention.length} طلاب بدون تقدم`, desc: 'لم يحفظوا أي جزء حتى الآن', link: '/batches' })
    const suspended = activeStudents.filter(s => s.status === 'suspended')
    if (suspended.length > 0)
      list.push({ id: 'sus', type: 'warning', title: `${suspended.length} طلاب موقوفون`, desc: 'يحتاجون مراجعة الحالة', link: '/students' })
    const upcomingExams = exams.filter(e => e.date >= todayISO && e.date <= new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0] &&
      (!isSupervisor || myBatchId === null || e.batch_id === myBatchId))
    if (upcomingExams.length > 0)
      list.push({ id: 'exams', type: 'info', title: `${upcomingExams.length} اختبارات خلال ٣ أيام`, desc: upcomingExams.map(e => e.student_name).slice(0, 3).join('، '), link: '/exams' })
    return list
  }, [needsAttention, activeStudents, exams, todayISO, isSupervisor, myBatchId])

  // Week schedule
  const weekEnd = new Date(Date.now() + 6 * 86400000).toISOString().split('T')[0]
  const weekEvents = useMemo(() => {
    const events: { date: string; label: string; event: string; typeLabel: string; color: string; link: string }[] = []
    for (const m of meetings) {
      if (m.date < todayISO || m.date > weekEnd) continue
      if (isSupervisor && !SUPERVISOR_MEETING_TYPES.includes(m.type)) continue
      events.push({ date: m.date, label: formatDateAr(m.date), event: m.agenda || MEETING_LABELS[m.type] || 'اجتماع', typeLabel: 'اجتماع', color: '#6366f1', link: '/meetings' })
    }
    for (const e of exams) {
      if (e.date < todayISO || e.date > weekEnd) continue
      if (isSupervisor && myBatchId !== null && e.batch_id !== myBatchId) continue
      events.push({ date: e.date, label: formatDateAr(e.date), event: `${e.student_name} — ج${e.juz_number}`, typeLabel: 'اختبار', color: '#f59e0b', link: '/exams' })
    }
    for (const p of programs) {
      if (p.start_date < todayISO || p.start_date > weekEnd) continue
      if (isSupervisor && myBatchId !== null && p.batch_id !== String(myBatchId) && p.batch_id !== 'all') continue
      events.push({ date: p.start_date, label: formatDateAr(p.start_date), event: p.name, typeLabel: 'برنامج', color: '#22c55e', link: '/programs' })
    }
    return events.sort((a, b) => a.date.localeCompare(b.date))
  }, [meetings, exams, programs, todayISO, weekEnd, isSupervisor, myBatchId])

  // ── Render ────────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh] gap-3">
      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      <span className="text-sm" style={{ color: 'var(--text-muted)' }}>جاري تحميل لوحة التحكم...</span>
    </div>
  )

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {isCeo ? 'لوحة المدير التنفيذي' : 'لوحة التحكم'}
          </h1>
          <p className="text-xs font-mono mt-1" style={{ color: 'var(--text-muted)' }}>{today}</p>
        </div>
        {isCeo && (
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            <Clock className="w-3.5 h-3.5" />
            <span>الأسبوع <span className="font-bold font-mono" style={{ color: 'var(--text-primary)' }}>{weekNumber}</span> من البرنامج</span>
            <span className="mx-1">·</span>
            <span>المستهدف: <span className="font-bold font-mono" style={{ color: '#6366f1' }}>{expectedLinesPerStudent} سطراً</span> / طالب</span>
          </div>
        )}
      </div>

      {/* ── Hero KPIs ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { icon: Users, label: 'الطلاب النشطون', value: totalActiveStudents, sub: `${visibleBatchIds.filter(b => students.some(s => s.batch_id === b)).length} دفعات`, color: '#6366f1' },
          { icon: BookOpen, label: 'أجزاء محفوظة', value: totalMemorized, sub: `من ${totalActiveStudents * 30} إجمالي ممكن`, color: '#22c55e' },
          { icon: CalendarCheck, label: 'الحضور اليوم', value: attendancePct, suffix: '%', sub: `${presentToday} / ${todayAttRecs.length} طالب`, color: '#06b6d4' },
          { icon: AlertTriangle, label: 'يحتاجون متابعة', value: needsAttention.length, sub: 'لم يحفظوا بعد', color: needsAttention.length > 0 ? '#ef4444' : '#22c55e' },
        ].map((stat, i) => {
          const Icon = stat.icon
          return (
            <div key={i} className="card p-4 group cursor-pointer">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>{stat.label}</p>
                  <p className="text-2xl font-bold font-mono" style={{ color: 'var(--text-primary)' }}>
                    <CountUp end={stat.value} suffix={stat.suffix ?? ''} />
                  </p>
                  <p className="text-[11px] font-mono mt-1" style={{ color: 'var(--text-muted)' }}>{stat.sub}</p>
                </div>
                <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: `${stat.color}18`, border: `1px solid ${stat.color}30` }}>
                  <Icon size={18} style={{ color: stat.color }} />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Batch Progress Row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {batchStats.map(b => {
          const color = BATCH_COLORS[b.batchId] || '#6366f1'
          const ringGlow = `${color}60`
          return (
            <div key={b.batchId} className="card-static p-4">
              <div className="flex items-center gap-3">
                <ProgressRing value={b.pct} size={60} strokeWidth={5} color={color} glowColor={ringGlow} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{b.name}</p>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{b.manager}</p>
                  <div className="flex gap-3 mt-1.5 text-[11px] font-mono">
                    <span style={{ color: '#22c55e' }}>{b.memorized} ج</span>
                    <span style={{ color: 'var(--text-muted)' }}>{b.students} طالب</span>
                    {b.struggling > 0 && <span style={{ color: '#ef4444' }}>{b.struggling} متعثر</span>}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Main grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Left 2/3 */}
        <div className="lg:col-span-2 space-y-4">

          {/* Bar chart — juz memorized per batch */}
          <div className="card-static p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                <TrendingUp className="w-4 h-4" style={{ color: '#6366f1' }} />
                الأجزاء المحفوظة لكل دفعة
              </h2>
              <span className="text-xs px-2 py-1 rounded-md font-mono" style={{ background: 'rgba(99,102,241,0.1)', color: '#818cf8' }}>
                هذا الأسبوع: {juzThisWeek} جزء
              </span>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#8b90a5' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#8b90a5' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'var(--bg-elevated)', color: '#e8eaf0' }}
                  formatter={(v) => [`${v} جزء`, '']}
                />
                <Bar dataKey="محفوظ" radius={[4, 4, 0, 0]}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={BATCH_COLORS[visibleBatchIds[i]] || '#6366f1'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Students: top performers + needs attention */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Top performers */}
            <div className="card-static p-4">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                <Star className="w-4 h-4 text-yellow-500" />
                أبرز الطلاب
              </h3>
              <div className="space-y-2">
                {topPerformers.length === 0
                  ? <p className="text-xs text-center py-4" style={{ color: 'var(--text-muted)' }}>لا توجد بيانات بعد</p>
                  : topPerformers.map((s, i) => (
                    <div key={s.id} className="flex items-center gap-3">
                      <span className="w-5 text-center text-[10px] font-bold font-mono" style={{ color: i === 0 ? '#f59e0b' : 'var(--text-muted)' }}>
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>{s.name}</p>
                        <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>دفعة {s.batch_id}</p>
                      </div>
                      <span className="text-xs font-bold font-mono px-2 py-0.5 rounded-md" style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>
                        {s.mem} ج
                      </span>
                    </div>
                  ))
                }
              </div>
            </div>

            {/* Needs attention */}
            <div className="card-static p-4">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                <AlertCircle className="w-4 h-4 text-red-500" />
                يحتاجون تدخلاً
              </h3>
              <div className="space-y-2">
                {bottomStudents.length === 0
                  ? <p className="text-xs text-center py-4" style={{ color: '#22c55e' }}>جميع الطلاب في المسار ✓</p>
                  : bottomStudents.map(s => (
                    <div key={s.id} className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>{s.name}</p>
                        <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{s.supervisor_name || 'دفعة ' + s.batch_id}</p>
                      </div>
                      <span className="text-xs font-bold font-mono px-2 py-0.5 rounded-md" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                        {s.mem} ج
                      </span>
                    </div>
                  ))
                }
              </div>
            </div>
          </div>

          {/* Supervisor health (CEO only) */}
          {!isSupervisor && supervisorHealth.length > 0 && (
            <div className="card-static p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                  <UserCheck className="w-4 h-4" style={{ color: '#06b6d4' }} />
                  المشرفون
                </h2>
                <Link href="/supervisors" className="text-xs flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                  عرض الكل <ChevronLeft className="w-3 h-3" />
                </Link>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {supervisorHealth.slice(0, 8).map(sup => {
                  const pct = sup.studentCount > 0 ? Math.round((sup.avgMem / 30) * 100) : 0
                  const color = pct >= 60 ? '#22c55e' : pct >= 30 ? '#f59e0b' : '#ef4444'
                  return (
                    <div key={sup.id} className="rounded-xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold mx-auto mb-1.5 text-white"
                        style={{ background: color }}>
                        {sup.name.charAt(0)}
                      </div>
                      <p className="text-[11px] font-medium leading-tight truncate" style={{ color: 'var(--text-primary)' }}>{sup.name.split(' ').slice(0, 2).join(' ')}</p>
                      <p className="text-[10px] mt-0.5 font-mono" style={{ color }}>معدل {sup.avgMem} ج</p>
                      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{sup.studentCount} طالب</p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right 1/3 */}
        <div className="space-y-4">

          {/* Pace tracker */}
          {isCeo && (
            <div className="card-static p-4">
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                <Target className="w-4 h-4" style={{ color: '#f59e0b' }} />
                مؤشر التقدم
              </h2>
              <div className="space-y-3">
                <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                  <span>الأسابيع المنقضية</span>
                  <span className="font-mono font-bold" style={{ color: 'var(--text-primary)' }}>{weekNumber} أسبوع</span>
                </div>
                <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                  <span>المستهدف التراكمي / طالب</span>
                  <span className="font-mono font-bold" style={{ color: '#6366f1' }}>{expectedLinesPerStudent} سطراً</span>
                </div>
                <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                  <span>إجمالي الأجزاء المحفوظة</span>
                  <span className="font-mono font-bold" style={{ color: '#22c55e' }}>{totalMemorized}</span>
                </div>
                <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                  <span>نشاط هذا الأسبوع</span>
                  <span className="font-mono font-bold" style={{ color: '#06b6d4' }}>{juzThisWeek} جزء</span>
                </div>
                {/* overall progress bar */}
                <div className="mt-2">
                  <div className="flex justify-between text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>
                    <span>إنجاز المشروع</span>
                    <span className="font-mono">{totalActiveStudents > 0 ? Math.round((totalMemorized / (totalActiveStudents * 30)) * 100) : 0}%</span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${totalActiveStudents > 0 ? Math.round((totalMemorized / (totalActiveStudents * 30)) * 100) : 0}%`, background: 'linear-gradient(90deg, #6366f1, #06b6d4)' }} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Alerts */}
          <div className="card-static p-4">
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <Activity className="w-4 h-4" style={{ color: '#ef4444' }} />
              التنبيهات
            </h2>
            <div className="space-y-2">
              {alerts.length === 0
                ? <p className="text-center text-xs py-3" style={{ color: 'var(--text-muted)' }}>لا توجد تنبيهات</p>
                : alerts.map(a => (
                  <Link key={a.id} href={a.link} className="flex items-start gap-2.5 p-2.5 rounded-lg border transition-all hover:opacity-90 block"
                    style={{
                      background: a.type === 'danger' ? 'rgba(239,68,68,0.06)' : a.type === 'warning' ? 'rgba(245,158,11,0.06)' : 'rgba(99,102,241,0.06)',
                      borderColor: a.type === 'danger' ? 'rgba(239,68,68,0.15)' : a.type === 'warning' ? 'rgba(245,158,11,0.15)' : 'rgba(99,102,241,0.15)',
                    }}>
                    <AlertIcon type={a.type} />
                    <div>
                      <p className="text-xs font-medium" style={{ color: a.type === 'danger' ? '#f87171' : a.type === 'warning' ? '#fbbf24' : '#818cf8' }}>{a.title}</p>
                      <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{a.desc}</p>
                    </div>
                  </Link>
                ))
              }
            </div>
          </div>

          {/* Week schedule */}
          <div className="card-static p-4">
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <Calendar className="w-4 h-4" style={{ color: '#06b6d4' }} />
              جدول الأسبوع
            </h2>
            <div className="space-y-1.5">
              {weekEvents.length === 0
                ? <p className="text-center text-xs py-3" style={{ color: 'var(--text-muted)' }}>لا توجد أحداث</p>
                : weekEvents.slice(0, 6).map((item, i) => (
                  <Link key={i} href={item.link} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-white/[0.02] transition-all block">
                    <div className="w-1 h-7 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs truncate" style={{ color: 'var(--text-primary)' }}>{item.event}</p>
                      <p className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>{item.label}</p>
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: `${item.color}15`, color: item.color }}>{item.typeLabel}</span>
                  </Link>
                ))
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
