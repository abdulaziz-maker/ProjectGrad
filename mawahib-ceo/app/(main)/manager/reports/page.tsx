'use client'
import { useState, useEffect, useMemo } from 'react'
import {
  getStudents, getSupervisors, getAllAttendance, getJuzProgress,
  type DBStudent, type DBSupervisor, type DBAttendanceRecord, type DBJuzProgress,
} from '@/lib/db'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import {
  FileText, Users, BookOpen, CalendarCheck,
  Loader2, ChevronLeft, TrendingUp, Download,
} from 'lucide-react'
import Link from 'next/link'

function scoreColor(pct: number) {
  return pct >= 80 ? '#22c55e' : pct >= 60 ? '#6366f1' : pct >= 40 ? '#f59e0b' : '#ef4444'
}

export default function ManagerReportsPage() {
  const { profile } = useAuth()
  const router = useRouter()
  const batchId = profile?.batch_id

  const [loading, setLoading] = useState(true)
  const [students, setStudents] = useState<DBStudent[]>([])
  const [supervisors, setSupervisors] = useState<DBSupervisor[]>([])
  const [attendance, setAttendance] = useState<DBAttendanceRecord[]>([])
  const [juzProgress, setJuzProgress] = useState<DBJuzProgress[]>([])

  useEffect(() => {
    if (profile && profile.role !== 'batch_manager') router.replace('/dashboard')
  }, [profile, router])

  useEffect(() => {
    if (!batchId) return
    Promise.all([getStudents(), getSupervisors(), getAllAttendance(), getJuzProgress()])
      .then(([st, sv, att, juz]) => {
        setStudents(st.filter(s => s.batch_id === batchId))
        setSupervisors(sv.filter(s => s.batch_id === batchId))
        setAttendance(att.filter(a => a.batch_id === String(batchId)))
        setJuzProgress(juz.filter(j => st.some(s => s.batch_id === batchId && s.id === j.student_id)))
        setLoading(false)
      })
  }, [batchId])

  const report = useMemo(() => {
    const active = students.filter(s => s.status === 'active' || !s.status)
    const totalStudents = active.length
    const memorized = juzProgress.filter(j => j.status === 'memorized').length
    const avgCompletion = totalStudents > 0
      ? Math.round(active.reduce((sum, s) => sum + (s.completion_percentage || 0), 0) / totalStudents)
      : 0

    // Attendance this week
    const now = new Date()
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - now.getDay())
    const weekAtt = attendance.filter(a => new Date(a.date) >= weekStart)
    const attendancePct = weekAtt.length > 0
      ? Math.round((weekAtt.filter(a => a.status === 'present').length / weekAtt.length) * 100)
      : 0

    // Per supervisor
    const perSupervisor = supervisors.map(sup => {
      const supStudents = active.filter(s => s.supervisor_id === sup.id)
      const avg = supStudents.length > 0
        ? Math.round(supStudents.reduce((a, s) => a + (s.completion_percentage || 0), 0) / supStudents.length)
        : 0
      const supAtt = weekAtt.filter(a => supStudents.some(s => s.id === a.student_id))
      const supAttPct = supAtt.length > 0
        ? Math.round((supAtt.filter(a => a.status === 'present').length / supAtt.length) * 100)
        : 0
      return { ...sup, studentCount: supStudents.length, avgCompletion: avg, attendancePct: supAttPct }
    })

    // Top & bottom students
    const sorted = [...active].sort((a, b) => (b.completion_percentage || 0) - (a.completion_percentage || 0))
    const top5 = sorted.slice(0, 5)
    const bottom5 = sorted.slice(-5).reverse()

    return { totalStudents, memorized, avgCompletion, attendancePct, perSupervisor, top5, bottom5 }
  }, [students, supervisors, attendance, juzProgress])

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#6366f1' }} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/manager/dashboard" className="p-2 rounded-lg hover:opacity-80" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <ChevronLeft size={18} style={{ color: 'var(--text-muted)', transform: 'rotate(180deg)' }} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>تقارير الدفعة</h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>ملخص أداء الدفعة هذا الأسبوع</p>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'إجمالي الطلاب', value: report.totalStudents, icon: Users, color: '#6366f1' },
          { label: 'أجزاء محفوظة', value: report.memorized, icon: BookOpen, color: '#22c55e' },
          { label: 'متوسط الإنجاز', value: `${report.avgCompletion}%`, icon: TrendingUp, color: scoreColor(report.avgCompletion) },
          { label: 'الحضور الأسبوعي', value: `${report.attendancePct}%`, icon: CalendarCheck, color: scoreColor(report.attendancePct) },
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

      {/* Per Supervisor Table */}
      <div className="card rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <h2 className="font-bold text-lg mb-4" style={{ color: 'var(--text-primary)' }}>أداء المشرفين</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                <th className="text-right py-3 px-2 font-semibold" style={{ color: 'var(--text-muted)' }}>المشرف</th>
                <th className="text-center py-3 px-2 font-semibold" style={{ color: 'var(--text-muted)' }}>الطلاب</th>
                <th className="text-center py-3 px-2 font-semibold" style={{ color: 'var(--text-muted)' }}>الإنجاز</th>
                <th className="text-center py-3 px-2 font-semibold" style={{ color: 'var(--text-muted)' }}>الحضور</th>
                <th className="text-center py-3 px-2 font-semibold" style={{ color: 'var(--text-muted)' }}>التقدم</th>
              </tr>
            </thead>
            <tbody>
              {report.perSupervisor
                .sort((a, b) => b.avgCompletion - a.avgCompletion)
                .map(sup => (
                <tr key={sup.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td className="py-3 px-2 font-medium" style={{ color: 'var(--text-primary)' }}>{sup.name}</td>
                  <td className="py-3 px-2 text-center" style={{ color: 'var(--text-muted)' }}>{sup.studentCount}</td>
                  <td className="py-3 px-2 text-center font-bold" style={{ color: scoreColor(sup.avgCompletion) }}>{sup.avgCompletion}%</td>
                  <td className="py-3 px-2 text-center font-bold" style={{ color: scoreColor(sup.attendancePct) }}>{sup.attendancePct}%</td>
                  <td className="py-3 px-2">
                    <div className="w-full h-2 rounded-full mx-auto max-w-[80px]" style={{ background: 'var(--border-color)' }}>
                      <div className="h-full rounded-full" style={{ width: `${sup.avgCompletion}%`, background: scoreColor(sup.avgCompletion) }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top & Bottom Students */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Top 5 */}
        <div className="card rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid rgba(34,197,94,0.3)' }}>
          <h2 className="font-bold mb-4 flex items-center gap-2" style={{ color: '#22c55e' }}>
            🏆 أفضل ٥ طلاب
          </h2>
          <div className="space-y-2">
            {report.top5.map((s, i) => (
              <div key={s.id} className="flex items-center justify-between p-2 rounded-lg" style={{ background: 'var(--bg-body)' }}>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold w-5 text-center" style={{ color: '#22c55e' }}>{i + 1}</span>
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{s.name}</span>
                </div>
                <span className="text-sm font-bold" style={{ color: '#22c55e' }}>{s.completion_percentage || 0}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom 5 */}
        <div className="card rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid rgba(239,68,68,0.3)' }}>
          <h2 className="font-bold mb-4 flex items-center gap-2" style={{ color: '#ef4444' }}>
            ⚠️ أضعف ٥ طلاب
          </h2>
          <div className="space-y-2">
            {report.bottom5.map((s, i) => (
              <div key={s.id} className="flex items-center justify-between p-2 rounded-lg" style={{ background: 'var(--bg-body)' }}>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold w-5 text-center" style={{ color: '#ef4444' }}>{i + 1}</span>
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{s.name}</span>
                </div>
                <span className="text-sm font-bold" style={{ color: '#ef4444' }}>{s.completion_percentage || 0}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
