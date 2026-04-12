'use client'
import { useState, useEffect, useMemo } from 'react'
import {
  getStudents, getSupervisors, getAllAttendance, getJuzProgress, getBatches,
  type DBStudent, type DBSupervisor, type DBAttendanceRecord, type DBJuzProgress, type DBBatch,
} from '@/lib/db'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import {
  Users, BookOpen, CalendarCheck, UserCheck, TrendingUp,
  AlertTriangle, Loader2, Trophy, Target,
} from 'lucide-react'
import Link from 'next/link'

const PROGRAM_START = new Date('2026-02-27')

function scoreColor(pct: number) {
  return pct >= 80 ? '#22c55e' : pct >= 60 ? '#6366f1' : pct >= 40 ? '#f59e0b' : '#ef4444'
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

  useEffect(() => {
    if (profile && profile.role !== 'batch_manager') router.replace('/dashboard')
  }, [profile, router])

  useEffect(() => {
    if (!batchId) return
    Promise.all([
      getStudents(), getSupervisors(), getAllAttendance(), getJuzProgress(), getBatches(),
    ]).then(([s, sv, a, j, b]) => {
      setStudents(s.filter(st => st.batch_id === batchId))
      setSupervisors(sv.filter(sup => sup.batch_id === batchId))
      setAttendance(a.filter(att => att.batch_id === String(batchId)))
      setJuzProgress(j.filter(jp => s.some(st => st.batch_id === batchId && st.id === jp.student_id)))
      setBatch(b.find(bt => bt.id === batchId) ?? null)
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

    const struggling = students.filter(s => (s.completion_percentage || 0) < 40).length

    return { totalStudents, totalJuz, avgCompletion, attendancePct, struggling, totalSupervisors: supervisors.length }
  }, [students, juzProgress, attendance, supervisors])

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#6366f1' }} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          لوحة الدفعة {batch?.name ?? `#${batchId}`}
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          مرحباً {profile?.name} — إدارة المشرفين والطلاب في دفعتك
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: 'الطلاب', value: stats.totalStudents, icon: Users, color: '#6366f1' },
          { label: 'المشرفون', value: stats.totalSupervisors, icon: UserCheck, color: '#06b6d4' },
          { label: 'أجزاء محفوظة', value: stats.totalJuz, icon: BookOpen, color: '#22c55e' },
          { label: 'نسبة الإنجاز', value: `${stats.avgCompletion}%`, icon: TrendingUp, color: scoreColor(stats.avgCompletion) },
          { label: 'الحضور', value: `${stats.attendancePct}%`, icon: CalendarCheck, color: scoreColor(stats.attendancePct) },
          { label: 'متعثرون', value: stats.struggling, icon: AlertTriangle, color: stats.struggling > 0 ? '#ef4444' : '#22c55e' },
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

      {/* Supervisors Overview */}
      <div className="card rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>مشرفو الدفعة</h2>
          <Link href="/manager/supervisors" className="text-sm font-medium" style={{ color: '#6366f1' }}>
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
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'rgba(99,102,241,0.1)' }}>
                    <span className="text-sm font-bold" style={{ color: '#6366f1' }}>{sup.name.charAt(0)}</span>
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
        <div className="card rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid rgba(239,68,68,0.3)' }}>
          <h2 className="font-bold text-lg mb-4 flex items-center gap-2" style={{ color: '#ef4444' }}>
            <AlertTriangle size={18} /> طلاب يحتاجون تدخل
          </h2>
          <div className="space-y-2">
            {students.filter(s => (s.completion_percentage || 0) < 40).map(s => (
              <Link key={s.id} href={`/students/${s.id}`} className="flex items-center justify-between p-3 rounded-lg hover:opacity-80" style={{ background: 'rgba(239,68,68,0.06)' }}>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{s.name}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>مشرف: {s.supervisor_name}</p>
                </div>
                <span className="text-sm font-bold" style={{ color: '#ef4444' }}>{s.completion_percentage || 0}%</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Quick Links */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { href: '/batches', label: 'خريطة الحفظ', icon: Target, color: '#6366f1' },
          { href: '/matn', label: 'رصد المتون', icon: BookOpen, color: '#06b6d4' },
          { href: '/attendance', label: 'الحضور', icon: CalendarCheck, color: '#22c55e' },
          { href: '/manager/reports', label: 'التقارير', icon: Trophy, color: '#f59e0b' },
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
