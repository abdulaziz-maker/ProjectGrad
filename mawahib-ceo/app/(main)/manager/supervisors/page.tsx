'use client'
import { useState, useEffect } from 'react'
import {
  getStudents, getSupervisors,
  type DBStudent, type DBSupervisor,
} from '@/lib/db'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { UserCheck, Users, TrendingUp, Loader2, ChevronLeft } from 'lucide-react'
import Link from 'next/link'

function scoreColor(pct: number) {
  return pct >= 80 ? '#22c55e' : pct >= 60 ? '#6366f1' : pct >= 40 ? '#f59e0b' : '#ef4444'
}

export default function ManagerSupervisorsPage() {
  const { profile } = useAuth()
  const router = useRouter()
  const batchId = profile?.batch_id

  const [loading, setLoading] = useState(true)
  const [supervisors, setSupervisors] = useState<DBSupervisor[]>([])
  const [students, setStudents] = useState<DBStudent[]>([])
  const [selectedSup, setSelectedSup] = useState<string | null>(null)

  useEffect(() => {
    if (profile && profile.role !== 'batch_manager') router.replace('/dashboard')
  }, [profile, router])

  useEffect(() => {
    if (!batchId) return
    Promise.all([getSupervisors(), getStudents()]).then(([sv, st]) => {
      setSupervisors(sv.filter(s => s.batch_id === batchId))
      setStudents(st.filter(s => s.batch_id === batchId))
      setLoading(false)
    })
  }, [batchId])

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#6366f1' }} />
      </div>
    )
  }

  const selectedSupStudents = selectedSup
    ? students.filter(s => s.supervisor_id === selectedSup)
    : []

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/manager/dashboard" className="p-2 rounded-lg hover:opacity-80" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <ChevronLeft size={18} style={{ color: 'var(--text-muted)', transform: 'rotate(180deg)' }} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>مشرفو الدفعة</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{supervisors.length} مشرف — {students.length} طالب</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Supervisors List */}
        <div className="lg:col-span-1 space-y-3">
          {supervisors.map(sup => {
            const supStudents = students.filter(s => s.supervisor_id === sup.id)
            const avgProg = supStudents.length > 0
              ? Math.round(supStudents.reduce((a, s) => a + (s.completion_percentage || 0), 0) / supStudents.length)
              : 0
            const isSelected = selectedSup === sup.id

            return (
              <button
                key={sup.id}
                onClick={() => setSelectedSup(isSelected ? null : sup.id)}
                className="w-full text-right p-4 rounded-xl transition-all"
                style={{
                  background: isSelected ? 'rgba(99,102,241,0.08)' : 'var(--bg-card)',
                  border: `1px solid ${isSelected ? 'rgba(99,102,241,0.4)' : 'var(--border-color)'}`,
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'rgba(99,102,241,0.1)' }}>
                      <UserCheck size={18} style={{ color: '#6366f1' }} />
                    </div>
                    <div>
                      <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{sup.name}</p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{sup.specialty || 'مشرف'} — {supStudents.length} طالب</p>
                    </div>
                  </div>
                  <div className="text-left">
                    <p className="text-lg font-bold" style={{ color: scoreColor(avgProg) }}>{avgProg}%</p>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="mt-3 w-full h-2 rounded-full" style={{ background: 'var(--border-color)' }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${avgProg}%`, background: scoreColor(avgProg) }} />
                </div>
                {sup.last_report_date && (
                  <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
                    آخر تقرير: {new Date(sup.last_report_date).toLocaleDateString('ar-SA')}
                  </p>
                )}
              </button>
            )
          })}
        </div>

        {/* Selected Supervisor Details */}
        <div className="lg:col-span-2">
          {selectedSup ? (
            <div className="card rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
              <h2 className="font-bold text-lg mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                <Users size={18} style={{ color: '#6366f1' }} />
                طلاب {supervisors.find(s => s.id === selectedSup)?.name}
              </h2>
              {selectedSupStudents.length === 0 ? (
                <p className="text-sm text-center py-8" style={{ color: 'var(--text-muted)' }}>لا يوجد طلاب مسجلون</p>
              ) : (
                <div className="space-y-2">
                  {selectedSupStudents
                    .sort((a, b) => (a.completion_percentage || 0) - (b.completion_percentage || 0))
                    .map(st => (
                    <Link key={st.id} href={`/students/${st.id}`} className="flex items-center justify-between p-3 rounded-lg hover:opacity-80" style={{ background: 'var(--bg-body)' }}>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold" style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1' }}>
                          {st.name.charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{st.name}</p>
                          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{st.juz_completed || 0} جزء محفوظ</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-20 h-2 rounded-full" style={{ background: 'var(--border-color)' }}>
                          <div className="h-full rounded-full" style={{ width: `${st.completion_percentage || 0}%`, background: scoreColor(st.completion_percentage || 0) }} />
                        </div>
                        <span className="text-sm font-bold w-10 text-left" style={{ color: scoreColor(st.completion_percentage || 0) }}>
                          {st.completion_percentage || 0}%
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="card rounded-xl p-12 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
              <UserCheck size={40} className="mx-auto mb-3" style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>اختر مشرفاً لعرض طلابه</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
