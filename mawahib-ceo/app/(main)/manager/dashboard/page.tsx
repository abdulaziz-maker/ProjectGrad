'use client'
/**
 * لوحة مدير الدفعة — مركَّزة على دفعته فقط.
 *   ١. Hero — حالة دفعتي اليوم/الأسبوع
 *   ٢. نبض اليوم — حضور طلابي + مشرفي
 *   ٣. متأخرو دفعتي
 *   ٤. مشرفو دفعتي — التزام كل واحد
 *   ٥. أبرز طلابي — أعلى ٥ + أدنى ٥
 *   ٦. الاختبارات + الحالات النشطة
 */
import { useState, useEffect, useMemo } from 'react'
import {
  getStudents, getAttendanceInRange, getExamsInRange, getSupervisors, getJuzProgress,
  getDailyFollowups, getSupervisorAttendanceForDate,
  type DBStudent, type DBAttendanceRecord, type DBExam,
  type DBSupervisor, type DBJuzProgress, type DBSupervisorAttendance,
} from '@/lib/db'
import type { DailyFollowup } from '@/lib/quran-followup'
import { getCases } from '@/lib/student-cases/db'
import { getViolations } from '@/lib/violations/db'
import type { CaseWithStudent } from '@/lib/student-cases/types'
import type { WeeklyViolation } from '@/lib/violations/types'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { getFollowupWeekRange } from '@/lib/quran-followup'
import { formatHijriWithDay, toHijriShort } from '@/lib/hijri'
import {
  Users, AlertTriangle, Trophy, UserCheck, ShieldAlert,
  Loader2, BookOpen, Activity, ArrowDownRight,
  XCircle, ClipboardCheck, Zap, CheckCircle2,
} from 'lucide-react'
import Link from 'next/link'
import { localDateIso } from '@/lib/date'

export default function ManagerDashboardPage() {
  const { profile, loading: authLoading } = useAuth()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [students, setStudents] = useState<DBStudent[]>([])
  const [attendance, setAttendance] = useState<DBAttendanceRecord[]>([])
  const [supervisors, setSupervisors] = useState<DBSupervisor[]>([])
  const [juzProgress, setJuzProgress] = useState<DBJuzProgress[]>([])
  const [todayFollowups, setTodayFollowups] = useState<DailyFollowup[]>([])
  const [weekFollowups, setWeekFollowups] = useState<DailyFollowup[]>([])
  const [supervisorAttendance, setSupervisorAttendance] = useState<DBSupervisorAttendance[]>([])
  const [activeCases, setActiveCases] = useState<CaseWithStudent[]>([])
  const [violations, setViolations] = useState<WeeklyViolation[]>([])
  const [recentExams, setRecentExams] = useState<DBExam[]>([])

  const myBatchId = profile?.batch_id

  useEffect(() => {
    if (!authLoading && profile && profile.role !== 'batch_manager') {
      router.replace('/dashboard')
    }
  }, [profile, authLoading, router])

  useEffect(() => {
    if (authLoading || !profile || !myBatchId) return
    const today = localDateIso(new Date())
    const fweek = getFollowupWeekRange()
    const sevenAgo = new Date(); sevenAgo.setDate(sevenAgo.getDate() - 7)

    Promise.all([
      getStudents(),
      getAttendanceInRange(fweek.start, today),
      getSupervisors(),
      getJuzProgress(),
      getDailyFollowups({ dateFrom: today, dateTo: today }),
      getDailyFollowups({ dateFrom: fweek.start, dateTo: fweek.end }),
      getSupervisorAttendanceForDate(myBatchId, today),
      getCases({ status: 'active', batchId: myBatchId }),
      getViolations({ batchId: myBatchId, fromDate: fweek.start, toDate: fweek.end }),
      getExamsInRange(localDateIso(sevenAgo)),
    ]).then(([s, a, sup, j, tf, wf, supAtt, c, v, allExams]) => {
      // فلترة client-side للدفعة
      const myStudents = s.filter(st => st.batch_id === myBatchId)
      const myStudentIds = new Set(myStudents.map(st => st.id))
      setStudents(myStudents)
      setAttendance(a)
      setSupervisors(sup.filter(sv => sv.batch_id === myBatchId))
      setJuzProgress(j)
      setTodayFollowups(tf.filter(f => myStudentIds.has(f.student_id)))
      setWeekFollowups(wf.filter(f => myStudentIds.has(f.student_id)))
      setSupervisorAttendance(supAtt)
      setActiveCases(c)
      setViolations(v)
      setRecentExams(
        allExams
          .filter(e => e.batch_id === myBatchId && e.date >= localDateIso(sevenAgo) && e.status === 'passed')
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, 6)
      )
    }).catch(err => console.error(err))
      .finally(() => setLoading(false))
  }, [authLoading, profile, myBatchId])

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

  const todayStats = useMemo(() => {
    const studentIds = new Set(activeStudents.map(s => s.id))
    const todayAttendance = attendance.filter(a => a.date === today && studentIds.has(a.student_id))
    const present = todayAttendance.filter(a => a.status === 'present' || a.status === 'late').length
    const absent = todayAttendance.filter(a => a.status === 'absent').length
    const supPresent = supervisorAttendance.filter(s => s.status === 'present' || s.status === 'late').length
    const supAbsent = supervisorAttendance.filter(s => s.status === 'absent').length
    const followedToday = todayFollowups.filter(f => f.actual_position != null).length
    return {
      present, absent, supPresent, supAbsent,
      supTotal: supervisors.length,
      followedToday, totalStudents: activeStudents.length,
    }
  }, [activeStudents, attendance, today, supervisorAttendance, supervisors, todayFollowups])

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
        return st ? { ...x, name: st.name, supervisorName: st.supervisor_name } : null
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) => a.worstGap - b.worstGap)
      .slice(0, 8)
  }, [weekFollowups, activeStudents])

  const supervisorCommitment = useMemo(() => {
    return supervisors.map(sup => {
      const myStudents = activeStudents.filter(s => s.supervisor_id === sup.id)
      const studentIds = new Set(myStudents.map(s => s.id))
      const wfups = weekFollowups.filter(f => studentIds.has(f.student_id) && f.actual_position != null)
      const followedSet = new Set(wfups.map(f => f.student_id))
      const violationsCount = violations.filter(v => v.supervisor_id === sup.id).length
      return {
        id: sup.id, name: sup.name,
        studentsCount: myStudents.length,
        followedCount: followedSet.size,
        followedPct: myStudents.length ? Math.round((followedSet.size / myStudents.length) * 100) : 0,
        violationsCount,
      }
    }).sort((a, b) => a.followedPct - b.followedPct)
  }, [supervisors, activeStudents, weekFollowups, violations])

  const overallTop = useMemo(() => [...studentsWithJuz].sort((a, b) => b.realJuz - a.realJuz).slice(0, 5), [studentsWithJuz])
  const overallBottom = useMemo(() => [...studentsWithJuz].sort((a, b) => a.realJuz - b.realJuz).slice(0, 5), [studentsWithJuz])

  const avgJuz = useMemo(() => {
    if (!activeStudents.length) return '0'
    const total = studentsWithJuz.reduce((sum, s) => sum + s.realJuz, 0)
    return (total / activeStudents.length).toFixed(1)
  }, [studentsWithJuz, activeStudents])

  if (loading || authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-10 h-10 animate-spin" style={{ color: 'var(--accent-warm)' }} />
      </div>
    )
  }

  if (!profile || profile.role !== 'batch_manager' || !myBatchId) return null

  const fweek = getFollowupWeekRange()

  return (
    <div className="space-y-5 animate-fade-in-up">
      {/* Hero */}
      <div className="card-static p-5" style={{
        background: 'linear-gradient(135deg, rgba(53,107,110,0.10), var(--bg-card))',
        border: '2px solid rgba(53,107,110,0.30)',
      }}>
        <p className="eyebrow-pill mb-2"><span className="eyebrow-dot" /> مدير الدفعة</p>
        <h1 className="display-h1 m-0" style={{ color: 'var(--text-primary)' }}>
          دفعة {myBatchId} — لوحة المدير
        </h1>
        <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>
          {formatHijriWithDay(today)} · أسبوع المتابعة: {toHijriShort(fweek.start)} → {toHijriShort(fweek.end)}
        </p>
      </div>

      {/* نبض اليوم */}
      <section>
        <h2 className="font-bold text-base mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <Activity className="w-4 h-4" style={{ color: 'var(--accent-teal)' }} />
          نبض دفعتي اليوم
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <PulseCard icon={<UserCheck className="w-5 h-5" />} color="#5A8F67" value={todayStats.present} total={todayStats.totalStudents} label="طلابي حاضرون" href="/attendance" />
          <PulseCard icon={<XCircle className="w-5 h-5" />} color="#B94838" value={todayStats.absent} label="غائبون اليوم" urgent={todayStats.absent > 3} href="/attendance" />
          <PulseCard icon={<UserCheck className="w-5 h-5" />} color="#356B6E" value={todayStats.supPresent} total={todayStats.supTotal} label="مشرفي حاضرون" href="/manager/supervisors" />
          <PulseCard icon={<ClipboardCheck className="w-5 h-5" />} color="#C08A48" value={todayStats.followedToday} label="متابعات اليوم" href="/followups/manager" />
        </div>
      </section>

      {/* متأخرو دفعتي */}
      {delayedThisWeek.length > 0 && (
        <section className="card-static p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-base flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <AlertTriangle className="w-4 h-4 text-red-500" />
              متأخرو دفعتي ({delayedThisWeek.length})
            </h2>
            <Link href="/followups/manager" className="text-[11px] font-bold text-amber-700 hover:underline">عرض كل المتابعات ←</Link>
          </div>
          <div className="space-y-1.5">
            {delayedThisWeek.map((d, idx) => {
              const severity = d.worstGap <= -15 ? 'critical' : d.worstGap <= -10 ? 'high' : d.worstGap <= -5 ? 'medium' : 'low'
              const sevColors: Record<typeof severity, { bg: string; border: string; color: string }> = {
                critical: { bg: 'rgba(185,72,56,0.10)', border: 'rgba(185,72,56,0.40)', color: '#B94838' },
                high:     { bg: 'rgba(201,151,44,0.10)', border: 'rgba(201,151,44,0.40)', color: '#8B5A1E' },
                medium:   { bg: 'rgba(192,138,72,0.08)', border: 'rgba(192,138,72,0.30)', color: '#8a5e1a' },
                low:      { bg: 'rgba(53,107,110,0.06)', border: 'rgba(53,107,110,0.25)', color: 'var(--accent-teal)' },
              }
              const c = sevColors[severity]
              return (
                <div key={d.studentId} className="flex items-center gap-3 p-2.5 rounded-lg border"
                  style={{ background: c.bg, borderColor: c.border }}>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs flex-shrink-0"
                    style={{ background: '#fff', color: c.color }}>{idx + 1}</div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{d.name}</p>
                    <p className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>
                      {d.supervisorName || 'بدون مشرف'} · آخر متابعة {toHijriShort(d.lastFollowup)}
                    </p>
                  </div>
                  <div className="text-left flex-shrink-0">
                    <p className="font-mono font-black text-xl" style={{ color: c.color }}>{d.worstGap}</p>
                    <p className="text-[9px] font-semibold" style={{ color: c.color }}>وجه</p>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* مشرفو دفعتي */}
      <section className="card-static p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-base flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Zap className="w-4 h-4" style={{ color: '#C08A48' }} />
            التزام مشرفي ({supervisors.length})
          </h2>
          <Link href="/manager/supervisors" className="text-[11px] font-bold text-amber-700 hover:underline">إدارة المشرفين ←</Link>
        </div>
        <div className="space-y-2">
          {supervisorCommitment.map(s => {
            const color = s.followedPct >= 80 ? '#5A8F67' : s.followedPct >= 50 ? '#C9972C' : '#B94838'
            return (
              <div key={s.id} className="flex items-center gap-3 p-2.5 rounded-lg border"
                style={{ background: 'var(--bg-card)', borderColor: 'var(--border-soft)' }}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <p className="font-bold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{s.name}</p>
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold flex-shrink-0"
                      style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                      {s.studentsCount} طالب
                    </span>
                    {s.violationsCount > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-bold flex-shrink-0"
                        style={{ background: 'rgba(185,72,56,0.10)', color: '#B94838' }}>
                        {s.violationsCount} إخلال
                      </span>
                    )}
                  </div>
                  <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-elevated)' }}>
                    <div className="h-full transition-all" style={{ width: `${s.followedPct}%`, background: color }} />
                  </div>
                </div>
                <div className="text-center flex-shrink-0">
                  <p className="font-mono font-black text-lg" style={{ color }}>{s.followedPct}%</p>
                  <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{s.followedCount}/{s.studentsCount}</p>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* أبرز طلابي */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="card-static p-4">
          <h3 className="font-bold text-sm mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Trophy className="w-4 h-4" style={{ color: '#C9972C' }} />
            أعلى ٥ في دفعتي
          </h3>
          <div className="space-y-1.5">
            {overallTop.map((s, i) => (
              <div key={s.id} className="flex items-center gap-2 p-2 rounded-lg"
                style={{ background: i === 0 ? 'rgba(201,151,44,0.10)' : 'var(--bg-elevated)' }}>
                <div className="w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0"
                  style={{ background: i === 0 ? '#C9972C' : 'var(--accent-warm)', color: '#fff' }}>
                  {i === 0 ? '🏆' : i + 1}
                </div>
                <span className="flex-1 text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{s.name}</span>
                <span className="font-mono font-bold text-sm" style={{ color: '#C9972C' }}>{s.realJuz}/30</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card-static p-4">
          <h3 className="font-bold text-sm mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <ArrowDownRight className="w-4 h-4" style={{ color: '#B94838' }} />
            أدنى ٥ — يحتاجون متابعة
          </h3>
          <div className="space-y-1.5">
            {overallBottom.map((s, i) => (
              <div key={s.id} className="flex items-center gap-2 p-2 rounded-lg" style={{ background: 'rgba(185,72,56,0.05)' }}>
                <div className="w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0"
                  style={{ background: '#B94838', color: '#fff' }}>{i + 1}</div>
                <span className="flex-1 text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{s.name}</span>
                <span className="font-mono font-bold text-sm" style={{ color: '#B94838' }}>{s.realJuz}/30</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* الاختبارات + الحالات */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="card-static p-4">
          <h3 className="font-bold text-sm mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <BookOpen className="w-4 h-4" style={{ color: 'var(--accent-teal)' }} />
            اختبارات دفعتي الأخيرة
          </h3>
          {recentExams.length === 0 ? (
            <p className="text-center text-xs py-4" style={{ color: 'var(--text-muted)' }}>لا اختبارات في آخر ٧ أيام</p>
          ) : (
            <div className="space-y-1.5">
              {recentExams.map(e => {
                const grade = e.score ?? 0
                const gradeColor = grade >= 90 ? '#5A8F67' : grade >= 75 ? '#C9972C' : '#B94838'
                return (
                  <div key={e.id} className="flex items-center gap-2 p-2 rounded-lg" style={{ background: 'var(--bg-elevated)' }}>
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center font-mono font-black text-xs flex-shrink-0"
                      style={{ background: `${gradeColor}15`, color: gradeColor }}>
                      {grade || '—'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-xs truncate" style={{ color: 'var(--text-primary)' }}>{e.student_name}</p>
                      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                        جزء {e.juz_number} · {toHijriShort(e.date)}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="card-static p-4">
          <h3 className="font-bold text-sm mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <ShieldAlert className="w-4 h-4 text-red-500" />
            حالات تصعيد دفعتي ({activeCases.length})
          </h3>
          {activeCases.length === 0 ? (
            <p className="text-center text-xs py-4" style={{ color: 'var(--text-muted)' }}>لا حالات نشطة — ممتاز!</p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2 mb-2">
                {(['stage_1_supervisor', 'stage_2_batch_manager', 'stage_3_ceo'] as const).map(stage => {
                  const count = activeCases.filter(c => c.current_stage === stage).length
                  const labels = {
                    stage_1_supervisor: { label: 'المشرف', color: '#356B6E' },
                    stage_2_batch_manager: { label: 'عندي', color: '#C9972C' },
                    stage_3_ceo: { label: 'التنفيذي', color: '#B94838' },
                  }
                  const lbl = labels[stage]
                  return (
                    <div key={stage} className="text-center p-2 rounded-lg"
                      style={{ background: `${lbl.color}10`, border: `1px solid ${lbl.color}30` }}>
                      <p className="font-mono font-black text-lg" style={{ color: lbl.color }}>{count}</p>
                      <p className="text-[9px] font-semibold" style={{ color: lbl.color }}>{lbl.label}</p>
                    </div>
                  )
                })}
              </div>
              <Link href="/followups?tab=cases" className="block text-center text-[11px] font-bold text-amber-700 hover:underline">
                عرض حالات دفعتي ←
              </Link>
            </>
          )}
        </div>
      </section>

      {/* متوسط الحفظ */}
      <div className="card-static p-4 text-center">
        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>متوسط الحفظ في دفعتي</p>
        <p className="font-mono font-black text-3xl mt-1" style={{ color: 'var(--accent-warm)' }}>
          {avgJuz} <span className="text-base font-normal" style={{ color: 'var(--text-muted)' }}>/30 جزء</span>
        </p>
        <CheckCircle2 className="w-4 h-4 inline mt-2" style={{ color: 'var(--accent-warm)' }} />
      </div>
    </div>
  )
}

function PulseCard({
  icon, color, value, total, label, urgent, href,
}: {
  icon: React.ReactNode; color: string; value: number; total?: number; label: string; urgent?: boolean; href?: string
}) {
  const inner = (
    <div className="card-static p-4 transition-all hover:shadow-md cursor-pointer"
      style={{ borderColor: urgent ? color : undefined, borderWidth: urgent ? 2 : 1 }}>
      <div className="flex items-center justify-between mb-2">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}15`, color }}>
          {icon}
        </div>
        {urgent && <AlertTriangle className="w-4 h-4 animate-pulse" style={{ color }} />}
      </div>
      <p className="font-mono font-black text-2xl leading-none mb-1" style={{ color: 'var(--text-primary)' }}>
        {value}
        {total !== undefined && <span className="text-sm font-normal" style={{ color: 'var(--text-muted)' }}> / {total}</span>}
      </p>
      <p className="text-[11px] font-semibold mt-1" style={{ color: 'var(--text-muted)' }}>{label}</p>
    </div>
  )
  return href ? <Link href={href}>{inner}</Link> : inner
}
