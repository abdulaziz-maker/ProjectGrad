'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { getStudents, getAllAttendance, saveAttendanceDay, DBStudent, DBAttendanceRecord } from '@/lib/db'
import { toHijriDisplay, toGregorianDisplay, addDays, todayStr } from '@/lib/hijri'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

type AttendanceStatus = 'present' | 'absent' | 'late'
type BatchId = '46' | '48'

export default function AttendancePage() {
  const { profile } = useAuth()
  const isSupervisor = profile?.role === 'supervisor' || profile?.role === 'teacher'
  const supervisorBatchId = profile?.batch_id ? String(profile.batch_id) as BatchId : null

  const [date, setDate] = useState<string>(todayStr())
  const [batchId, setBatchId] = useState<BatchId>(supervisorBatchId ?? '46')
  const [records, setRecords] = useState<Record<string, AttendanceStatus>>({})
  const [activeTab, setActiveTab] = useState<'daily' | 'report'>('daily')
  const [allAttendance, setAllAttendance] = useState<DBAttendanceRecord[]>([])
  const [students, setStudents] = useState<DBStudent[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([getStudents(), getAllAttendance()])
      .then(([studs, att]) => {
        setStudents(studs)
        setAllAttendance(att)
        // Load records for current date/batch
        const existing = att.filter(a => a.date === todayStr() && a.batch_id === '46')
        const recMap: Record<string, AttendanceStatus> = {}
        for (const r of existing) recMap[r.student_id] = r.status as AttendanceStatus
        setRecords(recMap)
      })
      .catch(() => toast.error('خطأ في تحميل البيانات'))
      .finally(() => setLoading(false))
  }, [])

  const loadRecordsForDateBatch = useCallback((d: string, b: BatchId) => {
    const existing = allAttendance.filter(a => a.date === d && a.batch_id === b)
    const recMap: Record<string, AttendanceStatus> = {}
    for (const r of existing) recMap[r.student_id] = r.status as AttendanceStatus
    setRecords(recMap)
  }, [allAttendance])

  useEffect(() => {
    if (!loading) loadRecordsForDateBatch(date, batchId)
  }, [date, batchId, loading, loadRecordsForDateBatch])

  const setStatus = (studentId: string, status: AttendanceStatus) => {
    setRecords(prev => ({ ...prev, [studentId]: status }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const recordsMap: Record<string, string> = {}
      for (const [k, v] of Object.entries(records)) recordsMap[k] = v
      await saveAttendanceDay(date, batchId, recordsMap)
      // Update local allAttendance
      const batchStudents = students.filter(s => s.batch_id === parseInt(batchId))
      const newRecords: DBAttendanceRecord[] = batchStudents
        .filter(s => records[s.id])
        .map(s => ({ date, batch_id: batchId, student_id: s.id, status: records[s.id] }))
      setAllAttendance(prev => {
        const filtered = prev.filter(a => !(a.date === date && a.batch_id === batchId))
        return [...filtered, ...newRecords]
      })
      toast.success('تم حفظ الحضور بنجاح')
    } catch {
      toast.error('خطأ في الحفظ')
    } finally {
      setSaving(false)
    }
  }

  const batchStudents = students.filter(s => s.batch_id === parseInt(batchId))
  const presentCount = batchStudents.filter(s => records[s.id] === 'present').length
  const absentCount = batchStudents.filter(s => records[s.id] === 'absent').length
  const lateCount = batchStudents.filter(s => records[s.id] === 'late').length
  const unmarkedCount = batchStudents.length - presentCount - absentCount - lateCount

  const getAttendancePercentage = (studentId: string, bId: BatchId): number => {
    const relevant = allAttendance.filter(a => a.batch_id === bId && a.student_id === studentId)
    if (relevant.length === 0) return 0
    const present = relevant.filter(a => a.status === 'present' || a.status === 'late').length
    return Math.round((present / relevant.length) * 100)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]" dir="rtl">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-[#6366f1] mx-auto" />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>جاري تحميل البيانات...</p>
        </div>
      </div>
    )
  }

  return (
    <div dir="rtl" className="min-h-screen p-4 md:p-6 animate-fade-in-up" style={{ background: 'rgba(255,255,255,0.02)' }}>
      <div className="max-w-4xl mx-auto space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>سجل الحضور والغياب</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>تسجيل ومتابعة حضور الطلاب يومياً</p>
          </div>
          <div className="flex gap-2">
            {(['daily', 'report'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${activeTab === tab ? 'btn-primary btn-ripple text-white shadow-sm' : 'border border-gray-200'}`} style={activeTab !== tab ? { color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.02)' } : {}}>
                {tab === 'daily' ? 'اليومي' : 'التقرير الشهري'}
              </button>
            ))}
          </div>
        </div>

        {activeTab === 'daily' ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 stagger-children">
              <div className="card-static p-5 flex flex-col items-center gap-4">
                <p className="text-xs font-medium uppercase tracking-wide self-start" style={{ color: 'var(--text-muted)' }}>التاريخ</p>
                <div className="flex items-center gap-3 w-full justify-between">
                  <button onClick={() => setDate(d => addDays(d, -1))}
                    className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-xl leading-none" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}>›</button>
                  <div className="flex flex-col items-center gap-1 flex-1">
                    <p className="text-xl font-bold leading-tight text-center" style={{ color: 'var(--text-primary)' }}>{toHijriDisplay(date)}</p>
                    <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>{toGregorianDisplay(date)}</p>
                  </div>
                  <button onClick={() => setDate(d => addDays(d, 1))}
                    className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-xl leading-none" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}>‹</button>
                </div>
                <input type="date" value={date} onChange={e => setDate(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6366f1]/20 text-center" style={{ color: 'var(--text-secondary)' }} />
              </div>

              <div className="card-static p-5 flex flex-col justify-between gap-4">
                <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>الدفعة</p>
                <div className="flex gap-3 flex-1 items-center">
                  {isSupervisor ? (
                    <div className="btn-primary flex-1 py-4 rounded-xl text-base font-bold text-white text-center shadow-sm">
                      دفعة {batchId}
                    </div>
                  ) : (
                    (['46', '48'] as BatchId[]).map(b => (
                      <button key={b} onClick={() => setBatchId(b)}
                        className={`flex-1 py-4 rounded-xl text-base font-bold transition-colors border-2 ${batchId === b ? 'btn-primary btn-ripple text-white border-transparent shadow-sm' : 'border-gray-100'}`} style={batchId !== b ? { background: 'rgba(255,255,255,0.02)', color: 'var(--text-secondary)' } : {}}>
                        دفعة {b}
                      </button>
                    ))
                  )}
                </div>
                <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>{batchStudents.length} طالب مسجّل</p>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-3 stagger-children">
              {[
                { label: 'حاضر', count: presentCount, bgColor: '#f0fdf4', textColor: '#15803d', borderColor: '#bbf7d0' },
                { label: 'غائب', count: absentCount, bgColor: '#fef2f2', textColor: '#dc2626', borderColor: '#fecaca' },
                { label: 'متأخر', count: lateCount, bgColor: '#fefce8', textColor: '#ca8a04', borderColor: '#fef08a' },
                { label: 'غير محدد', count: unmarkedCount, bgColor: '#f9fafb', textColor: '#6b7280', borderColor: '#e5e7eb' },
              ].map(({ label, count, bgColor, textColor, borderColor }) => (
                <div key={label} className="rounded-2xl p-3 text-center border" style={{ backgroundColor: bgColor, borderColor }}>
                  <p className="text-2xl font-bold font-mono" style={{ color: textColor }}>{count}</p>
                  <p className="text-xs mt-1" style={{ color: textColor }}>{label}</p>
                </div>
              ))}
            </div>

            <div className="card-static overflow-hidden">
              <div className="px-5 py-3.5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-color)' }}>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>قائمة الطلاب — دفعة {batchId}</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{batchStudents.length} طالب</p>
              </div>
              <div className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
                {batchStudents.map((student, idx) => {
                  const status = records[student.id]
                  return (
                    <div key={student.id} className="flex items-center justify-between px-5 py-3.5 hover:opacity-90">
                      <div className="flex items-center gap-3">
                        <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium font-mono flex-shrink-0" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}>{idx + 1}</span>
                        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{student.name}</p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setStatus(student.id, 'present')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${status === 'present' ? 'text-white shadow-sm scale-105' : 'bg-green-50 text-green-700 hover:bg-green-100'}`}
                          style={status === 'present' ? { backgroundColor: '#16a34a' } : {}}>حاضر</button>
                        <button onClick={() => setStatus(student.id, 'absent')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${status === 'absent' ? 'bg-red-500 text-white shadow-sm scale-105' : 'bg-red-50 text-red-700 hover:bg-red-100'}`}>غائب</button>
                        <button onClick={() => setStatus(student.id, 'late')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${status === 'late' ? 'bg-yellow-400 text-white shadow-sm scale-105' : 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100'}`}>متأخر</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <button onClick={handleSave} disabled={saving}
              className="btn-primary btn-ripple w-full py-3.5 rounded-2xl text-white font-semibold text-base shadow-sm hover:opacity-90 disabled:opacity-70 flex items-center justify-center gap-2">
              {saving && <Loader2 className="w-5 h-5 animate-spin" />}
              حفظ الحضور
            </button>
          </>
        ) : (
          <>
            {isSupervisor ? (
              <div className="btn-primary px-4 py-2 rounded-xl text-sm font-bold text-white shadow-sm w-fit">
                دفعة {batchId}
              </div>
            ) : (
              <div className="flex gap-3">
                {(['46', '48'] as BatchId[]).map(b => (
                  <button key={b} onClick={() => setBatchId(b)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium border ${batchId === b ? 'btn-primary btn-ripple text-white border-transparent shadow-sm' : 'border-gray-200'}`} style={batchId !== b ? { background: 'rgba(255,255,255,0.02)', color: 'var(--text-secondary)' } : {}}>
                    دفعة {b}
                  </button>
                ))}
              </div>
            )}

            <div className="card-static overflow-hidden">
              <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
                <h2 className="font-bold" style={{ color: 'var(--text-primary)' }}>تقرير الحضور — دفعة {batchId}</h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>بناءً على البيانات المحفوظة في Supabase</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs border-b" style={{ background: 'rgba(99,102,241,0.06)', color: 'var(--text-muted)', borderColor: 'var(--border-color)' }}>
                      <th className="text-right px-5 py-3 font-medium">#</th>
                      <th className="text-right px-5 py-3 font-medium">اسم الطالب</th>
                      <th className="text-right px-5 py-3 font-medium">الأيام المسجّلة</th>
                      <th className="text-right px-5 py-3 font-medium">نسبة الحضور</th>
                      <th className="text-right px-5 py-3 font-medium">الحالة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
                    {batchStudents.map((student, idx) => {
                      const relevantDays = allAttendance.filter(a => a.batch_id === batchId && a.student_id === student.id)
                      const pct = getAttendancePercentage(student.id, batchId)
                      const statusLabel = relevantDays.length === 0 ? 'لا بيانات' : pct >= 90 ? 'ممتاز' : pct >= 75 ? 'جيد' : pct >= 60 ? 'مقبول' : 'ضعيف'
                      const statusStyle = relevantDays.length === 0
                        ? { bg: '#f3f4f6', text: 'var(--text-muted)' }
                        : pct >= 90 ? { bg: '#dcfce7', text: '#15803d' }
                        : pct >= 75 ? { bg: '#dbeafe', text: '#1d4ed8' }
                        : pct >= 60 ? { bg: '#fef9c3', text: '#854d0e' }
                        : { bg: '#fee2e2', text: '#dc2626' }
                      const barColor = relevantDays.length === 0 ? '#d1d5db' : pct >= 90 ? '#6366f1' : pct >= 75 ? '#3b82f6' : pct >= 60 ? '#f59e0b' : '#ef4444'

                      return (
                        <tr key={student.id} className="hover:opacity-90">
                          <td className="px-5 py-3 text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{idx + 1}</td>
                          <td className="px-5 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>{student.name}</td>
                          <td className="px-5 py-3 text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{relevantDays.length} يوم</td>
                          <td className="px-5 py-3">
                            {relevantDays.length > 0 ? (
                              <div className="flex items-center gap-2">
                                <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                  <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: barColor }} />
                                </div>
                                <span className="font-medium text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>{pct}%</span>
                              </div>
                            ) : <span className="text-xs" style={{ color: 'var(--text-muted)' }}>—</span>}
                          </td>
                          <td className="px-5 py-3">
                            <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium"
                              style={{ backgroundColor: statusStyle.bg, color: statusStyle.text }}>
                              {statusLabel}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
