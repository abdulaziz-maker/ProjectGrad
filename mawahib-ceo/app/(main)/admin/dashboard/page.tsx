'use client'
import { useState, useEffect, useMemo } from 'react'
import {
  getBatches, getStudents, getAllAttendance, getExams, getMeetings,
  getPrograms, getSupervisors, getJuzProgress,
  type DBBatch, type DBStudent, type DBAttendanceRecord, type DBExam,
  type DBMeeting, type DBProgram, type DBSupervisor, type DBJuzProgress,
} from '@/lib/db'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import {
  Users, BookOpen, CalendarCheck, ClipboardCheck, AlertTriangle,
  Trophy, UserCheck, Zap, Bell, TrendingUp, Clock,
  Loader2, ChevronLeft, Target, Star,
} from 'lucide-react'
import Link from 'next/link'
import CountUp from '@/components/ui/CountUp'
import WisdomCard from '@/components/ui/WisdomCard'

// ── Constants ──────────────────────────────────────────────────────────────────
const PROGRAM_START = new Date('2026-02-27')
const BATCH_IDS = [48, 46, 44, 42]
const BATCH_COLORS: Record<number, string> = { 48: '#C08A48', 46: '#356B6E', 44: '#5A8F67', 42: '#C9972C' }
const TOTAL_WEEKS = 12

// ── Color helpers ──────────────────────────────────────────────────────────────
function scoreColor(pct: number) {
  return pct >= 80 ? '#27500A' : pct >= 60 ? '#97C459' : pct >= 40 ? '#EF9F27' : '#E24B4A'
}

// ── Date helpers ───────────────────────────────────────────────────────────────
function weekRange(n: number): { start: Date; end: Date } {
  const start = new Date(PROGRAM_START.getTime() + (n - 1) * 7 * 86400000)
  const end = new Date(start.getTime() + 7 * 86400000)
  return { start, end }
}

function weeksElapsed(): number {
  return (Date.now() - PROGRAM_START.getTime()) / (7 * 24 * 3600 * 1000)
}

function hijriNow(): string {
  try {
    return new Intl.DateTimeFormat('ar-SA-u-ca-islamic', {
      day: 'numeric', month: 'long', year: 'numeric',
    }).format(new Date())
  } catch { return '' }
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function AdminDashboardPage() {
  const { profile } = useAuth()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [students, setStudents] = useState<DBStudent[]>([])
  const [juzProgress, setJuzProgress] = useState<DBJuzProgress[]>([])
  const [attendance, setAttendance] = useState<DBAttendanceRecord[]>([])
  const [exams, setExams] = useState<DBExam[]>([])
  const [meetings, setMeetings] = useState<DBMeeting[]>([])
  const [programs, setPrograms] = useState<DBProgram[]>([])
  const [supervisors, setSupervisors] = useState<DBSupervisor[]>([])
  const [batches, setBatches] = useState<DBBatch[]>([])

  // Redirect non-CEO
  useEffect(() => {
    if (profile && profile.role !== 'ceo') router.replace('/dashboard')
  }, [profile, router])

  useEffect(() => {
    Promise.all([
      getStudents(), getJuzProgress(), getAllAttendance(),
      getExams(), getMeetings(), getPrograms(), getSupervisors(), getBatches(),
    ]).then(([s, j, a, e, m, p, sv, b]) => {
      setStudents(s.sort((x, y) => x.name.localeCompare(y.name, 'ar')))
      setJuzProgress(j); setAttendance(a)
      setExams(e); setMeetings(m); setPrograms(p)
      setSupervisors(sv); setBatches(b)
    }).catch(console.error).finally(() => setLoading(false))
  }, [])

  // ── Derived data ──────────────────────────────────────────────────────────────
  const activeStudents = useMemo(() =>
    students.filter(s => s.status === 'active'), [students])

  const memorizedByStudent = useMemo(() => {
    const map: Record<string, number> = {}
    for (const p of juzProgress) {
      if (p.status === 'memorized') map[p.student_id] = (map[p.student_id] || 0) + 1
    }
    return map
  }, [juzProgress])

  const currentWeek = Math.ceil(weeksElapsed())
  const todayISO = new Date().toISOString().split('T')[0]

  // KPI 1 — total active
  const totalActive = activeStudents.length

  // KPI 2 — overall memorization %
  const totalMemorized = useMemo(() =>
    activeStudents.reduce((sum, s) => sum + (memorizedByStudent[s.id] || 0), 0)
  , [activeStudents, memorizedByStudent])
  const overallPct = totalActive > 0 ? Math.round((totalMemorized / (totalActive * 30)) * 100) : 0

  // KPI 3 — this week attendance
  const now = new Date()
  const dayOfWeek = now.getDay()
  const weekStartDate = new Date(now.getTime() - dayOfWeek * 86400000)
  const weekEndDate = new Date(now.getTime() + (6 - dayOfWeek) * 86400000)
  const weekStartISO = weekStartDate.toISOString().split('T')[0]
  const weekEndISO = weekEndDate.toISOString().split('T')[0]
  const weekAtt = attendance.filter(a => a.date >= weekStartISO && a.date <= weekEndISO)
  const weekAttPct = weekAtt.length > 0
    ? Math.round(weekAtt.filter(a => a.status === 'present').length / weekAtt.length * 100) : 0

  // KPI 4 — pending exams
  const pendingExams = exams.filter(e => e.status === 'scheduled' && e.date >= todayISO).length

  // KPI 5 — struggling
  const struggling = activeStudents.filter(s => (memorizedByStudent[s.id] || 0) < 3 && currentWeek > 3).length

  // KPI 6 — best batch
  const batchStats = useMemo(() => BATCH_IDS.map(batchId => {
    const bs = activeStudents.filter(s => s.batch_id === batchId)
    const mem = bs.reduce((sum, s) => sum + (memorizedByStudent[s.id] || 0), 0)
    const possible = bs.length * 30
    const pct = possible > 0 ? Math.round((mem / possible) * 100) : 0
    const batch = batches.find(b => b.id === batchId)
    return { batchId, name: batch?.name || `دفعة ${batchId}`, students: bs.length, memorized: mem, pct }
  }), [activeStudents, memorizedByStudent, batches])

  const bestBatch = [...batchStats].sort((a, b) => b.pct - a.pct)[0]

  // KPI 7 — active supervisors
  const activeSupervisors = supervisors.filter(s =>
    activeStudents.some(st => st.supervisor_id === s.id || st.supervisor_name === s.name)
  ).length

  // KPI 8 — juz this week
  const weekAgoISO = new Date(Date.now() - 7 * 86400000).toISOString()
  const juzThisWeek = juzProgress.filter(p =>
    p.status === 'memorized' && p.updated_at && p.updated_at >= weekAgoISO
  ).length

  // Heat map: pre-compute per batch × week
  const heatMapData = useMemo(() => {
    // index juz by student_id → batch_id
    const studentBatch: Record<string, number> = {}
    for (const s of activeStudents) studentBatch[s.id] = s.batch_id

    // bucket: [batchId][weekIdx] = count
    const counts: Record<number, number[]> = {}
    for (const bid of BATCH_IDS) counts[bid] = Array(TOTAL_WEEKS).fill(0)

    for (const p of juzProgress) {
      if (p.status !== 'memorized' || !p.updated_at) continue
      const bid = studentBatch[p.student_id]
      if (!bid) continue
      const dt = new Date(p.updated_at)
      for (let w = 0; w < TOTAL_WEEKS; w++) {
        const { start, end } = weekRange(w + 1)
        if (dt >= start && dt < end) { counts[bid][w]++; break }
      }
    }

    return BATCH_IDS.map(batchId => {
      const weeks = counts[batchId]
      const maxCount = Math.max(...weeks, 1)
      const batch = batches.find(b => b.id === batchId)
      return { batchId, name: batch?.name || `دفعة ${batchId}`, weeks, maxCount }
    })
  }, [activeStudents, juzProgress, batches])

  // Line chart: cumulative juz per batch per week
  const lineChartData = useMemo(() => {
    const studentBatch: Record<string, number> = {}
    for (const s of activeStudents) studentBatch[s.id] = s.batch_id

    // cumulative counts per batch
    const cumCounts: Record<number, number[]> = {}
    for (const bid of BATCH_IDS) cumCounts[bid] = Array(TOTAL_WEEKS).fill(0)

    for (const p of juzProgress) {
      if (p.status !== 'memorized' || !p.updated_at) continue
      const bid = studentBatch[p.student_id]
      if (!bid) continue
      const dt = new Date(p.updated_at)
      for (let w = 0; w < TOTAL_WEEKS; w++) {
        const { end } = weekRange(w + 1)
        if (dt < end) cumCounts[bid][w]++
      }
    }

    return Array.from({ length: TOTAL_WEEKS }, (_, i) => {
      const point: Record<string, string | number> = { week: `أ${i + 1}` }
      for (const bid of BATCH_IDS) point[`دفعة ${bid}`] = cumCounts[bid][i]
      return point
    })
  }, [activeStudents, juzProgress])

  // Supervisor ranking
  const supervisorRanking = useMemo(() =>
    supervisors.map(sup => {
      const ss = activeStudents.filter(s => s.supervisor_id === sup.id || s.supervisor_name === sup.name)
      const avg = ss.length > 0
        ? ss.reduce((sum, s) => sum + (memorizedByStudent[s.id] || 0), 0) / ss.length : 0
      const pct = Math.round((avg / 30) * 100)
      return { ...sup, studentCount: ss.length, avgMem: Math.round(avg * 10) / 10, pct }
    })
    .filter(s => s.studentCount > 0)
    .sort((a, b) => b.pct - a.pct)
  , [supervisors, activeStudents, memorizedByStudent])

  // Action required
  const actionRequired = useMemo(() =>
    activeStudents
      .filter(s => currentWeek > 3 && (memorizedByStudent[s.id] || 0) < 3)
      .map(s => ({ ...s, mem: memorizedByStudent[s.id] || 0 }))
      .sort((a, b) => a.mem - b.mem)
      .slice(0, 8)
  , [activeStudents, memorizedByStudent, currentWeek])

  // Wins
  const wins = useMemo(() =>
    [...activeStudents]
      .map(s => ({ ...s, mem: memorizedByStudent[s.id] || 0 }))
      .filter(s => s.mem >= 15)
      .sort((a, b) => b.mem - a.mem)
      .slice(0, 8)
  , [activeStudents, memorizedByStudent])

  // Timeline
  const timeline = useMemo(() => {
    const events: { date: string; title: string; type: string; color: string }[] = []
    for (const m of meetings) {
      events.push({ date: m.date, title: m.agenda || 'اجتماع', type: 'اجتماع', color: '#C08A48' })
    }
    for (const e of exams) {
      if (e.status === 'completed') {
        events.push({ date: e.date, title: `اختبار ${e.student_name} — ج${e.juz_number}`, type: 'اختبار', color: '#C9972C' })
      }
    }
    for (const p of programs) {
      events.push({ date: p.start_date, title: p.name, type: 'برنامج', color: '#5A8F67' })
    }
    return events
      .filter(ev => ev.date <= todayISO)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 10)
  }, [meetings, exams, programs, todayISO])

  // Alert level
  const alertLevel = struggling > 10 || overallPct < 20 ? 'danger'
    : struggling > 5 || overallPct < 40 ? 'warning' : null

  // ── Render ─────────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh] gap-3">
      <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--text-muted)' }} />
      <span className="text-sm" style={{ color: 'var(--text-muted)' }}>جاري تحميل لوحة المدير التنفيذي...</span>
    </div>
  )

  const hijri = hijriNow()

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="eyebrow-pill mb-3">
            <span className="eyebrow-dot" />
            القيادة التنفيذية · الأسبوع {currentWeek}
          </div>
          <h1 className="display-h1 m-0" style={{ color: 'var(--text-primary)' }}>
            لوحة المدير التنفيذي
          </h1>
          <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>
            {hijri && <span>{hijri} · </span>}
            {new Date().toLocaleDateString('ar-SA-u-nu-latn', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="text-left">
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {profile?.name ?? 'المدير التنفيذي'}
            </p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              الأسبوع <span className="font-mono font-bold">{currentWeek}</span> من البرنامج
            </p>
          </div>
          <div className="relative">
            <button
              className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{ background: 'var(--hover-bg)', border: '1px solid var(--border-color)' }}
            >
              <Bell size={15} style={{ color: 'var(--text-muted)' }} />
            </button>
            {alertLevel && (
              <span
                className="absolute -top-1 -left-1 w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] font-bold text-white"
                style={{ background: alertLevel === 'danger' ? '#E24B4A' : '#EF9F27' }}
              >!</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Wisdom + Alert row ── */}
      <div className={`grid gap-3 ${alertLevel ? 'lg:grid-cols-[1.6fr_1fr]' : 'grid-cols-1'}`}>
        <WisdomCard />
        {alertLevel && (
          <div
            className="rounded-2xl px-4 py-3 flex items-start gap-3"
            style={{
              background: alertLevel === 'danger' ? 'rgba(185,72,56,0.08)' : 'rgba(201,151,44,0.10)',
              border: `1px solid ${alertLevel === 'danger' ? 'rgba(185,72,56,0.28)' : 'rgba(201,151,44,0.32)'}`,
            }}
          >
            <AlertTriangle size={16} style={{ color: alertLevel === 'danger' ? '#B94838' : '#C9972C', flexShrink: 0, marginTop: 2 }} />
            <p className="text-sm leading-relaxed" style={{ color: alertLevel === 'danger' ? '#B94838' : '#8B5A1E' }}>
              {alertLevel === 'danger'
                ? `تحذير: ${struggling} طالباً متعثراً — النسبة الكلية ${overallPct}% — يتطلب تدخلاً فورياً`
                : `تنبيه: ${struggling} طالباً متعثراً — يوصى بمراجعة خطة المتابعة`
              }
            </p>
          </div>
        )}
      </div>

      {/* ── KPI Row 1 ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {([
          {
            icon: Users, label: 'إجمالي الطلاب', value: totalActive, suffix: '',
            sub: `${BATCH_IDS.filter(b => activeStudents.some(s => s.batch_id === b)).length} دفعات نشطة`,
            color: '#C08A48', link: '/students',
          },
          {
            icon: BookOpen, label: 'نسبة الحفظ الكلية', value: overallPct, suffix: '%',
            sub: `${totalMemorized} من ${totalActive * 30} جزء`,
            color: scoreColor(overallPct), link: '/batches',
          },
          {
            icon: CalendarCheck, label: 'الحضور هذا الأسبوع', value: weekAttPct, suffix: '%',
            sub: `${weekAtt.filter(a => a.status === 'present').length} / ${weekAtt.length} سجل`,
            color: weekAttPct >= 80 ? '#97C459' : weekAttPct >= 60 ? '#EF9F27' : '#E24B4A',
            link: '/attendance',
          },
          {
            icon: ClipboardCheck, label: 'اختبارات معلقة', value: pendingExams, suffix: '',
            sub: `من إجمالي ${exams.length} اختبار`,
            color: pendingExams > 10 ? '#E24B4A' : pendingExams > 5 ? '#EF9F27' : '#97C459',
            link: '/exams',
          },
        ] as const).map((k, i) => {
          const Icon = k.icon
          return (
            <Link key={i} href={k.link} className="card p-4 block" style={{ textDecoration: 'none' }}>
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-xs mb-1.5 truncate" style={{ color: 'var(--text-muted)' }}>{k.label}</p>
                  <p className="text-2xl font-bold font-mono" style={{ color: 'var(--text-primary)' }}>
                    <CountUp end={typeof k.value === 'number' ? k.value : 0} suffix={k.suffix ?? ''} />
                  </p>
                  <p className="text-[10px] mt-1 font-mono" style={{ color: 'var(--text-muted)' }}>{k.sub}</p>
                </div>
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mr-2"
                  style={{ background: `${k.color}18`, border: `1px solid ${k.color}30` }}
                >
                  <Icon size={16} style={{ color: k.color }} />
                </div>
              </div>
            </Link>
          )
        })}
      </div>

      {/* ── KPI Row 2 ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {([
          {
            icon: AlertTriangle, label: 'طلاب متعثرون', value: struggling, suffix: '',
            sub: 'أقل من ٣ أجزاء محفوظة',
            color: struggling > 10 ? '#E24B4A' : struggling > 5 ? '#EF9F27' : '#97C459',
            link: '/students',
          },
          {
            icon: Trophy, label: 'أفضل دفعة', value: bestBatch?.pct ?? 0, suffix: '%',
            sub: bestBatch?.name ?? '—',
            color: scoreColor(bestBatch?.pct ?? 0), link: '/batches',
          },
          {
            icon: UserCheck, label: 'المشرفون النشطون', value: activeSupervisors, suffix: '',
            sub: `من ${supervisors.length} مشرف`,
            color: '#356B6E', link: '/supervisors',
          },
          {
            icon: Zap, label: 'نشاط هذا الأسبوع', value: juzThisWeek, suffix: '',
            sub: 'جزء تم تسجيله',
            color: '#C9972C', link: '/batches',
          },
        ] as const).map((k, i) => {
          const Icon = k.icon
          return (
            <Link key={i} href={k.link} className="card p-4 block" style={{ textDecoration: 'none' }}>
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-xs mb-1.5 truncate" style={{ color: 'var(--text-muted)' }}>{k.label}</p>
                  <p className="text-2xl font-bold font-mono" style={{ color: 'var(--text-primary)' }}>
                    <CountUp end={typeof k.value === 'number' ? k.value : 0} suffix={k.suffix ?? ''} />
                  </p>
                  <p className="text-[10px] mt-1 font-mono" style={{ color: 'var(--text-muted)' }}>{k.sub}</p>
                </div>
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mr-2"
                  style={{ background: `${k.color}18`, border: `1px solid ${k.color}30` }}
                >
                  <Icon size={16} style={{ color: k.color }} />
                </div>
              </div>
            </Link>
          )
        })}
      </div>

      {/* ── Heat Map ── */}
      <div className="card-static p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Target size={14} style={{ color: '#C08A48' }} />
            خريطة تقدم الحفظ الأسبوعية
          </h2>
          <span className="text-xs px-2 py-1 rounded-md font-mono" style={{ background: 'rgba(99,102,241,0.1)', color: '#818cf8' }}>
            الأسبوع {currentWeek} / {TOTAL_WEEKS}
          </span>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mb-4 flex-wrap">
          {[
            { label: 'ممتاز', color: '#27500A' },
            { label: 'جيد', color: '#97C459' },
            { label: 'متوسط', color: '#EF9F27' },
            { label: 'ضعيف', color: '#E24B4A' },
            { label: 'لا نشاط', color: 'rgba(255,255,255,0.05)', border: true },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
              <span
                className="w-3 h-3 rounded-sm inline-block flex-shrink-0"
                style={{ background: l.color, border: l.border ? '1px solid rgba(255,255,255,0.1)' : 'none' }}
              />
              {l.label}
            </div>
          ))}
        </div>

        {/* Week headers */}
        <div className="flex gap-1 mb-1.5" style={{ marginRight: 80 }}>
          {Array.from({ length: TOTAL_WEEKS }, (_, i) => (
            <div
              key={i}
              className="flex-1 text-center text-[9px] font-mono"
              style={{ color: i + 1 === currentWeek ? '#818cf8' : 'var(--text-muted)', fontWeight: i + 1 === currentWeek ? 700 : 400 }}
            >
              أ{i + 1}
            </div>
          ))}
        </div>

        {/* Batch rows */}
        <div className="space-y-1.5">
          {heatMapData.map(({ batchId, name, weeks, maxCount }) => (
            <div key={batchId} className="flex items-center gap-1">
              <div className="text-[11px] font-medium truncate flex-shrink-0" style={{ width: 80, color: 'var(--text-primary)' }}>
                {name.split(' ').slice(-2).join(' ')}
              </div>
              {weeks.map((count, wi) => {
                const isCurrent = wi + 1 === currentWeek
                const intensity = maxCount > 0 ? count / maxCount : 0
                const pct = Math.round(intensity * 100)
                const cellColor = count === 0
                  ? 'rgba(255,255,255,0.04)'
                  : pct >= 80 ? '#27500A' : pct >= 60 ? '#97C459' : pct >= 40 ? '#EF9F27' : '#E24B4A'
                return (
                  <div
                    key={wi}
                    className="flex-1 h-7 rounded-sm flex items-center justify-center text-[9px] font-mono"
                    title={`أسبوع ${wi + 1}: ${count} جزء`}
                    style={{
                      background: cellColor,
                      border: isCurrent ? '1px solid rgba(255,255,255,0.25)' : '1px solid transparent',
                      color: count > 0 ? 'rgba(255,255,255,0.75)' : 'transparent',
                    }}
                  >
                    {count > 0 ? count : ''}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* ── Line Chart ── */}
      <div className="card-static p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <TrendingUp size={14} style={{ color: '#356B6E' }} />
            التقدم التراكمي لكل دفعة
          </h2>
          <div className="flex items-center gap-4 flex-wrap">
            {BATCH_IDS.map(id => (
              <div key={id} className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                <span className="w-5 h-0.5 inline-block rounded" style={{ background: BATCH_COLORS[id] }} />
                دفعة {id}
              </div>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={lineChartData} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#8b90a5' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#8b90a5' }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{
                borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)',
                background: 'var(--bg-elevated)', color: '#e8eaf0',
              }}
            />
            {BATCH_IDS.map(id => (
              <Line
                key={id}
                type="monotone"
                dataKey={`دفعة ${id}`}
                stroke={BATCH_COLORS[id]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: BATCH_COLORS[id] }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ── 3-column grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Supervisor Ranking */}
        <div className="card-static p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <UserCheck size={14} style={{ color: '#356B6E' }} />
              ترتيب المشرفين
            </h2>
            <Link href="/supervisors" className="text-[11px] flex items-center gap-0.5" style={{ color: 'var(--text-muted)' }}>
              الكل <ChevronLeft size={11} />
            </Link>
          </div>
          <div className="space-y-2">
            {supervisorRanking.length === 0
              ? <p className="text-xs text-center py-4" style={{ color: 'var(--text-muted)' }}>لا بيانات</p>
              : supervisorRanking.map((sup, i) => (
                <div key={sup.id} className="flex items-center gap-2.5">
                  <span
                    className="w-5 text-center text-[10px] font-bold font-mono flex-shrink-0"
                    style={{ color: i === 0 ? '#C9972C' : i === 1 ? '#94a3b8' : i === 2 ? '#cd7c3e' : 'var(--text-muted)' }}
                  >
                    {i + 1}
                  </span>
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                    style={{ background: scoreColor(sup.pct), color: '#fff' }}
                  >
                    {sup.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                      {sup.name.split(' ').slice(0, 2).join(' ')}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                        <div className="h-full rounded-full" style={{ width: `${sup.pct}%`, background: scoreColor(sup.pct) }} />
                      </div>
                      <span className="text-[10px] font-mono flex-shrink-0" style={{ color: scoreColor(sup.pct) }}>
                        {sup.pct}%
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{sup.studentCount}ط</span>
                </div>
              ))
            }
          </div>
        </div>

        {/* Action Required */}
        <div className="card-static p-4">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <AlertTriangle size={14} style={{ color: '#E24B4A' }} />
            يحتاجون تدخلاً
            {actionRequired.length > 0 && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                style={{ background: 'rgba(226,75,74,0.1)', color: '#E24B4A' }}
              >
                {actionRequired.length}
              </span>
            )}
          </h2>
          <div className="space-y-2">
            {actionRequired.length === 0
              ? <p className="text-xs text-center py-4" style={{ color: '#97C459' }}>جميع الطلاب في المسار ✓</p>
              : actionRequired.map(s => (
                <div
                  key={s.id}
                  className="flex items-center gap-2 p-2 rounded-lg"
                  style={{ background: 'rgba(226,75,74,0.05)', border: '1px solid rgba(226,75,74,0.1)' }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>{s.name}</p>
                    <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{s.supervisor_name || `دفعة ${s.batch_id}`}</p>
                  </div>
                  <span
                    className="text-[11px] font-bold font-mono px-1.5 py-0.5 rounded flex-shrink-0"
                    style={{ background: 'rgba(226,75,74,0.1)', color: '#E24B4A' }}
                  >
                    {s.mem} ج
                  </span>
                </div>
              ))
            }
          </div>
        </div>

        {/* Wins */}
        <div className="card-static p-4">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Star size={14} style={{ color: '#C9972C' }} />
            إنجازات متميزة
          </h2>
          <div className="space-y-2">
            {wins.length === 0
              ? <p className="text-xs text-center py-4" style={{ color: 'var(--text-muted)' }}>لا إنجازات بعد (≥١٥ جزء)</p>
              : wins.map((s, i) => (
                <div
                  key={s.id}
                  className="flex items-center gap-2 p-2 rounded-lg"
                  style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.1)' }}
                >
                  <span className="text-sm flex-shrink-0">
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '⭐'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>{s.name}</p>
                    <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{s.supervisor_name || `دفعة ${s.batch_id}`}</p>
                  </div>
                  <span
                    className="text-[11px] font-bold font-mono px-1.5 py-0.5 rounded flex-shrink-0"
                    style={{ background: 'rgba(245,158,11,0.1)', color: '#C9972C' }}
                  >
                    {s.mem} ج
                  </span>
                </div>
              ))
            }
          </div>
        </div>
      </div>

      {/* ── Timeline ── */}
      <div className="card-static p-5">
        <h2 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <Clock size={14} style={{ color: '#8b90a5' }} />
          آخر الأحداث
        </h2>
        {timeline.length === 0
          ? <p className="text-xs text-center py-4" style={{ color: 'var(--text-muted)' }}>لا أحداث مسجلة</p>
          : (
            <div className="relative">
              <div
                className="absolute top-2 bottom-2 w-px"
                style={{ right: 5, background: 'rgba(255,255,255,0.07)' }}
              />
              <div className="space-y-3">
                {timeline.map((ev, i) => (
                  <div key={i} className="flex gap-4 relative">
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0 mt-0.5 relative z-10"
                      style={{ background: ev.color, boxShadow: `0 0 6px ${ev.color}80` }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[11px] font-medium" style={{ color: 'var(--text-primary)' }}>{ev.title}</p>
                        <span className="text-[10px] font-mono flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{ev.date}</span>
                      </div>
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded mt-0.5 inline-block"
                        style={{ background: `${ev.color}15`, color: ev.color }}
                      >
                        {ev.type}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        }
      </div>
    </div>
  )
}
