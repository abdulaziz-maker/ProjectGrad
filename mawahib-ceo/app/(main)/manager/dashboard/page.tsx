'use client'
import { useState, useEffect, useMemo } from 'react'
import {
  getStudents, getSupervisors, getAllAttendance, getJuzProgress, getBatches,
  getExams, getMeetings, getPrograms,
  getSupervisorAttendanceForDate,
  type DBStudent, type DBSupervisor, type DBAttendanceRecord, type DBJuzProgress, type DBBatch,
  type DBExam, type DBMeeting, type DBProgram,
} from '@/lib/db'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import {
  Users, BookOpen, CalendarCheck, UserCheck, TrendingUp,
  AlertTriangle, Loader2, Trophy, Target,
  ClipboardCheck, Star, MessageSquare, FileText, ArrowLeft,
} from 'lucide-react'
import Link from 'next/link'
import { todayStr } from '@/lib/hijri'
import WisdomCard from '@/components/ui/WisdomCard'
import SupervisorTrackingAlert from '@/components/ui/SupervisorTrackingAlert'
import { computeAllSupervisorStatuses } from '@/lib/supervisor-tracking'

const PROGRAM_START = new Date('2026-02-27')

function scoreColor(pct: number) {
  return pct >= 80 ? '#5A8F67' : pct >= 60 ? '#C08A48' : pct >= 40 ? '#C9972C' : '#B94838'
}

export default function ManagerDashboardPage() {
  const { profile } = useAuth()
  const router = useRouter()
  const batchId = profile?.batch_id

  const [loading, setLoading] = useState(true)
  const [students, setStudents] = useState<DBStudent[]>([])
  const [supervisors, setSupervisors] = useState<DBSupervisor[]>([])
  const [attendance, setAttendance] = useState<DBAttendanceRecord[]>([])
  const [juzProgress, setJuzProgress] = useState<DBJuzProgress[]>([])
  const [batch, setBatch] = useState<DBBatch | null>(null)
  const [exams, setExams] = useState<DBExam[]>([])
  const [meetings, setMeetings] = useState<DBMeeting[]>([])
  const [programs, setPrograms] = useState<DBProgram[]>([])
  const [supAttToday, setSupAttToday] = useState<{ present: number; total: number }>({ present: 0, total: 0 })

  useEffect(() => {
    if (profile && profile.role !== 'batch_manager') router.replace('/dashboard')
  }, [profile, router])

  useEffect(() => {
    if (!batchId) return
    Promise.all([
      getStudents(), getSupervisors(), getAllAttendance(), getJuzProgress(), getBatches(),
      getExams(), getMeetings(), getPrograms(),
      getSupervisorAttendanceForDate(batchId, todayStr()).catch(() => []),
    ]).then(([s, sv, a, j, b, ex, mt, pr, supAtt]) => {
      const batchStudents = s.filter(st => st.batch_id === batchId)
      const batchStudentIds = new Set(batchStudents.map(st => st.id))
      setStudents(batchStudents)
      setSupervisors(sv.filter(sup => sup.batch_id === batchId))
      setAttendance(a.filter(att => att.batch_id === String(batchId)))
      setJuzProgress(j.filter(jp => batchStudentIds.has(jp.student_id)))
      setBatch(b.find(bt => bt.id === batchId) ?? null)
      setExams(ex.filter(e => e.batch_id === batchId || batchStudentIds.has(e.student_id)))
      setMeetings(mt)
      setPrograms(pr.filter(p => p.batch_id === String(batchId) || p.batch_id === 'all'))

      const present = supAtt.filter(r => r.status === 'present').length
      setSupAttToday({ present, total: supAtt.length })

      setLoading(false)
    })
  }, [batchId])

  const stats = useMemo(() => {
    const totalStudents = students.filter(s => s.status === 'active' || !s.status).length
    const totalJuz = juzProgress.filter(j => j.status === 'memorized').length
    const avgCompletion = totalStudents > 0
      ? Math.round(students.reduce((sum, s) => sum + (s.completion_percentage || 0), 0) / totalStudents)
      : 0

    const now = new Date()
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - now.getDay())
    const weekAttendance = attendance.filter(a => new Date(a.date) >= weekStart)
    const attendancePct = weekAttendance.length > 0
      ? Math.round((weekAttendance.filter(a => a.status === 'present').length / weekAttendance.length) * 100)
      : 0

    // حضور اليوم فقط
    const today = todayStr()
    const todayAtt = attendance.filter(a => a.date === today)
    const todayPresent = todayAtt.filter(a => a.status === 'present').length
    const todayAttPct = todayAtt.length > 0 ? Math.round((todayPresent / todayAtt.length) * 100) : 0

    // المتابعة الأسبوعية
    const followedCount = students.filter(s => {
      if (!s.last_followup) return false
      return new Date(s.last_followup) >= weekStart
    }).length
    const followupPct = totalStudents > 0 ? Math.round((followedCount / totalStudents) * 100) : 0

    // أقرب اختبار قادم
    const upcomingExam = [...exams]
      .filter(e => e.date >= today && e.status === 'scheduled')
      .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))[0]

    // أقرب برنامج تربوي قادم
    const upcomingProgram = [...programs]
      .filter(p => p.start_date >= today && p.status !== 'completed')
      .sort((a, b) => a.start_date.localeCompare(b.start_date))[0]

    // آخر اجتماع مجدول
    const upcomingMeeting = [...meetings]
      .filter(m => m.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))[0]

    const struggling = students.filter(s => (s.completion_percentage || 0) < 40).length

    return {
      totalStudents, totalJuz, avgCompletion, attendancePct, struggling,
      totalSupervisors: supervisors.length,
      todayPresent, todayAtt: todayAtt.length, todayAttPct,
      followedCount, followupPct,
      upcomingExam, upcomingProgram, upcomingMeeting,
    }
  }, [students, juzProgress, attendance, supervisors, exams, programs, meetings])

  const supervisorStatuses = useMemo(
    () => computeAllSupervisorStatuses(supervisors, students.filter(s => s.status === 'active' || !s.status)),
    [supervisors, students]
  )

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--accent-warm)' }} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="eyebrow-pill mb-3">
          <span className="eyebrow-dot" />
          لوحة إدارة الدفعة
        </div>
        <h1 className="display-h1 m-0" style={{ color: 'var(--text-primary)' }}>
          {batch?.name ?? `الدفعة #${batchId}`}
        </h1>
        <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>
          مرحباً {profile?.name} — إدارة المشرفين والطلاب في دفعتك
        </p>
      </div>

      {/* Wisdom reminder */}
      <WisdomCard />

      {/* المتابعة الأسبوعية للمشرفين — يظهر عند وجود تأخر */}
      <SupervisorTrackingAlert
        statuses={supervisorStatuses}
        title="المتابعة الأسبوعية لمشرفي الدفعة"
        alertsOnly
        collapsible
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: 'الطلاب', value: stats.totalStudents, icon: Users, color: '#C08A48' },
          { label: 'المشرفون', value: stats.totalSupervisors, icon: UserCheck, color: '#356B6E' },
          { label: 'أجزاء محفوظة', value: stats.totalJuz, icon: BookOpen, color: '#5A8F67' },
          { label: 'نسبة الإنجاز', value: `${stats.avgCompletion}%`, icon: TrendingUp, color: scoreColor(stats.avgCompletion) },
          { label: 'الحضور', value: `${stats.attendancePct}%`, icon: CalendarCheck, color: scoreColor(stats.attendancePct) },
          { label: 'متعثرون', value: stats.struggling, icon: AlertTriangle, color: stats.struggling > 0 ? '#B94838' : '#5A8F67' },
        ].map((kpi, i) => (
          <div key={i} className="card p-4 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <div className="flex items-center gap-2 mb-2">
              <kpi.icon size={16} style={{ color: kpi.color }} />
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{kpi.label}</span>
            </div>
            <p className="text-xl font-bold" style={{ color: kpi.color }}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* ملخص كل قسم (بطاقات مفصَّلة مع روابط تفاصيل) */}
      <div>
        <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--text-secondary)' }}>ملخص الأقسام</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* الطلاب */}
          <Link href="/students" className="card rounded-xl p-4 hover:opacity-90 transition-opacity" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4" style={{ color: '#C08A48' }} />
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>الطلاب</h3>
              </div>
              <ArrowLeft className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
            </div>
            <p className="text-2xl font-bold mb-1" style={{ color: '#C08A48' }}>{stats.totalStudents}</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              حضور اليوم: <span className="font-semibold" style={{ color: scoreColor(stats.todayAttPct) }}>{stats.todayPresent}</span> / {stats.todayAtt}
              {stats.todayAtt > 0 && ` (${stats.todayAttPct}%)`}
            </p>
            <p className="text-[11px] mt-1" style={{ color: '#C08A48' }}>عرض التفاصيل ←</p>
          </Link>

          {/* المشرفون */}
          <Link href="/manager/supervisors" className="card rounded-xl p-4 hover:opacity-90 transition-opacity" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4" style={{ color: '#356B6E' }} />
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>المشرفون</h3>
              </div>
              <ArrowLeft className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
            </div>
            <p className="text-2xl font-bold mb-1" style={{ color: '#356B6E' }}>{stats.totalSupervisors}</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {supAttToday.total > 0
                ? <>حضور اليوم: <span className="font-semibold" style={{ color: scoreColor(Math.round((supAttToday.present / supAttToday.total) * 100)) }}>{supAttToday.present}</span> / {supAttToday.total}</>
                : 'لم يُسجَّل حضور اليوم بعد'}
            </p>
            <p className="text-[11px] mt-1" style={{ color: '#356B6E' }}>عرض التفاصيل ←</p>
          </Link>

          {/* التقارير */}
          <Link href="/manager/reports" className="card rounded-xl p-4 hover:opacity-90 transition-opacity" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4" style={{ color: '#C9972C' }} />
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>التقارير</h3>
              </div>
              <ArrowLeft className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
            </div>
            <p className="text-xs mb-0.5" style={{ color: 'var(--text-muted)' }}>إنجاز أسبوعي: <span className="font-semibold" style={{ color: scoreColor(stats.avgCompletion) }}>{stats.avgCompletion}%</span></p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>متابعة: <span className="font-semibold" style={{ color: scoreColor(stats.followupPct) }}>{stats.followupPct}%</span></p>
            <p className="text-[11px] mt-1" style={{ color: '#C9972C' }}>عرض التفاصيل ←</p>
          </Link>

          {/* أقرب اختبار */}
          <Link href="/exams" className="card rounded-xl p-4 hover:opacity-90 transition-opacity" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="w-4 h-4" style={{ color: '#8b5cf6' }} />
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>أقرب اختبار</h3>
              </div>
              <ArrowLeft className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
            </div>
            {stats.upcomingExam ? (
              <>
                <p className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>{stats.upcomingExam.student_name}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  الجزء {stats.upcomingExam.juz_number} — {stats.upcomingExam.date} {stats.upcomingExam.time}
                </p>
              </>
            ) : (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>لا توجد اختبارات مجدولة</p>
            )}
            <p className="text-[11px] mt-1" style={{ color: '#8b5cf6' }}>عرض الجدول ←</p>
          </Link>

          {/* البرنامج القادم */}
          <Link href="/programs" className="card rounded-xl p-4 hover:opacity-90 transition-opacity" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4" style={{ color: '#5A8F67' }} />
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>البرنامج القادم</h3>
              </div>
              <ArrowLeft className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
            </div>
            {stats.upcomingProgram ? (
              <>
                <p className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>{stats.upcomingProgram.name}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{stats.upcomingProgram.start_date}</p>
              </>
            ) : (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>لا توجد برامج مجدولة</p>
            )}
            <p className="text-[11px] mt-1" style={{ color: '#5A8F67' }}>عرض التفاصيل ←</p>
          </Link>

          {/* أقرب اجتماع */}
          <Link href="/meetings" className="card rounded-xl p-4 hover:opacity-90 transition-opacity" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4" style={{ color: '#ec4899' }} />
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>أقرب اجتماع</h3>
              </div>
              <ArrowLeft className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
            </div>
            {stats.upcomingMeeting ? (
              <>
                <p className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>{stats.upcomingMeeting.type}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{stats.upcomingMeeting.date} {stats.upcomingMeeting.time}</p>
              </>
            ) : (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>لا توجد اجتماعات مجدولة</p>
            )}
            <p className="text-[11px] mt-1" style={{ color: '#ec4899' }}>عرض التفاصيل ←</p>
          </Link>
        </div>
      </div>

      {/* Supervisors Overview */}
      <div className="card rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>مشرفو الدفعة</h2>
          <Link href="/manager/supervisors" className="text-sm font-medium" style={{ color: '#C08A48' }}>
            عرض الكل ←
          </Link>
        </div>
        <div className="space-y-3">
          {supervisors.length === 0 ? (
            <p className="text-sm text-center py-4" style={{ color: 'var(--text-muted)' }}>لا يوجد مشرفون في هذه الدفعة</p>
          ) : supervisors.map(sup => {
            const supStudents = students.filter(s => s.supervisor_id === sup.id)
            const avgProg = supStudents.length > 0
              ? Math.round(supStudents.reduce((a, s) => a + (s.completion_percentage || 0), 0) / supStudents.length)
              : 0
            return (
              <div key={sup.id} className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'var(--bg-body)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'rgba(192,138,72,0.1)' }}>
                    <span className="text-sm font-bold" style={{ color: '#C08A48' }}>{sup.name.charAt(0)}</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{sup.name}</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{supStudents.length} طالب</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-left">
                    <p className="text-sm font-bold" style={{ color: scoreColor(avgProg) }}>{avgProg}%</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>إنجاز</p>
                  </div>
                  <div className="w-16 h-2 rounded-full" style={{ background: 'var(--border-color)' }}>
                    <div className="h-full rounded-full" style={{ width: `${avgProg}%`, background: scoreColor(avgProg) }} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Students at Risk */}
      {stats.struggling > 0 && (
        <div className="card rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid rgba(185,72,56,0.3)' }}>
          <h2 className="font-bold text-lg mb-4 flex items-center gap-2" style={{ color: '#B94838' }}>
            <AlertTriangle size={18} /> طلاب يحتاجون تدخل
          </h2>
          <div className="space-y-2">
            {students.filter(s => (s.completion_percentage || 0) < 40).map(s => (
              <Link key={s.id} href={`/students/${s.id}`} className="flex items-center justify-between p-3 rounded-lg hover:opacity-80" style={{ background: 'rgba(185,72,56,0.06)' }}>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{s.name}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>مشرف: {s.supervisor_name}</p>
                </div>
                <span className="text-sm font-bold" style={{ color: '#B94838' }}>{s.completion_percentage || 0}%</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Quick Links */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { href: '/batches', label: 'خريطة الحفظ', icon: Target, color: '#C08A48' },
          { href: '/matn', label: 'رصد المتون', icon: BookOpen, color: '#356B6E' },
          { href: '/attendance', label: 'الحضور', icon: CalendarCheck, color: '#5A8F67' },
          { href: '/manager/reports', label: 'التقارير', icon: Trophy, color: '#C9972C' },
        ].map((link, i) => (
          <Link key={i} href={link.href} className="card p-4 rounded-xl flex items-center gap-3 hover:opacity-80" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <link.icon size={20} style={{ color: link.color }} />
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{link.label}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
