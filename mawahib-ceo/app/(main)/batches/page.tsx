'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { getStudents, getJuzProgress, upsertJuzProgress, upsertStudent, type DBStudent, type DBJuzProgress } from '@/lib/db'
import { Edit3, Plus, Award, BookOpen, TrendingUp } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'

type JuzStatus = 'memorized' | 'in_progress' | 'not_started' | 'struggling' | 'weak'
type StudentJuzData = { [studentId: string]: { [juz: number]: JuzStatus } }

const STATUS_CYCLE: JuzStatus[] = ['not_started', 'in_progress', 'memorized', 'weak', 'struggling']
const STATUS_COLOR: Record<JuzStatus, string> = {
  memorized: '#22c55e', weak: '#f97316', struggling: '#ef4444',
  in_progress: '#eab308', not_started: '#e2e8f0',
}
const STATUS_LABEL: Record<JuzStatus, string> = {
  memorized: '✓', weak: 'ض', struggling: '✗', in_progress: '~', not_started: '—',
}
const STATUS_FULL: Record<JuzStatus, string> = {
  memorized: 'محفوظ', weak: 'ضعيف', struggling: 'متعثر', in_progress: 'قيد الحفظ', not_started: 'لم يبدأ',
}

interface LocalStudent { id: string; name: string; batchId: number; supervisorName: string }

export default function BatchesPage() {
  const { profile } = useAuth()
  const isSupervisor = profile?.role === 'supervisor' || profile?.role === 'teacher'
  const myBatchId = (profile?.batch_id ?? 46) as 46 | 48

  const [selectedBatch, setSelectedBatch] = useState<46 | 48>(myBatchId)
  const [juzData, setJuzData] = useState<StudentJuzData>({})
  const [juzProgress, setJuzProgress] = useState<DBJuzProgress[]>([])
  const [dbStudents, setDbStudents] = useState<DBStudent[]>([])
  const [students, setStudents] = useState<LocalStudent[]>([])
  const [editingStudent, setEditingStudent] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editSupervisor, setEditSupervisor] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [newStudent, setNewStudent] = useState({ name: '', supervisorName: '' })
  const [loading, setLoading] = useState(true)

  const dbStudentsRef = useRef<DBStudent[]>([])

  useEffect(() => {
    async function fetchData() {
      try {
        const [fetchedStudents, dbProgress] = await Promise.all([getStudents(), getJuzProgress()])

        const nested: StudentJuzData = {}
        for (const row of dbProgress) {
          if (!nested[row.student_id]) nested[row.student_id] = {}
          nested[row.student_id][row.juz_number] = (row.status as JuzStatus) || 'not_started'
        }

        const correctedStudents = fetchedStudents
          .map(student => {
            const juzMap = nested[student.id] || {}
            const realCompleted = Object.values(juzMap).filter(s => s === 'memorized').length
            const realPct = Math.round((realCompleted / 30) * 100)
            return { ...student, juz_completed: realCompleted, completion_percentage: realPct }
          })
          .sort((a, b) => a.name.localeCompare(b.name, 'ar'))

        dbStudentsRef.current = correctedStudents
        setDbStudents(correctedStudents)
        setStudents(correctedStudents.map(s => ({ id: s.id, name: s.name, batchId: s.batch_id, supervisorName: s.supervisor_name || '' })))
        setJuzData(nested)
        setJuzProgress(dbProgress)
      } catch {
        toast.error('حدث خطأ أثناء تحميل البيانات')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const batchStudents = students.filter(s => s.batchId === selectedBatch)

  const cycleStatus = useCallback((studentId: string, juz: number) => {
    setJuzData(prev => {
      const current: JuzStatus = prev[studentId]?.[juz] || 'not_started'
      const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(current) + 1) % STATUS_CYCLE.length]
      const updatedJuz = { ...(prev[studentId] || {}), [juz]: next }
      const juzCompleted = Object.values(updatedJuz).filter(s => s === 'memorized').length
      const completionPct = Math.round((juzCompleted / 30) * 100)

      setTimeout(async () => {
        try {
          await upsertJuzProgress(studentId, juz, next)
          setJuzProgress(prev => {
            const filtered = prev.filter(p => !(p.student_id === studentId && p.juz_number === juz))
            return [...filtered, { student_id: studentId, juz_number: juz, status: next }]
          })
          const original = dbStudentsRef.current.find(s => s.id === studentId)
          if (original && (original.juz_completed !== juzCompleted || original.completion_percentage !== completionPct)) {
            const updated: DBStudent = { ...original, juz_completed: juzCompleted, completion_percentage: completionPct }
            await upsertStudent(updated)
            dbStudentsRef.current = dbStudentsRef.current.map(s => s.id === studentId ? updated : s)
            setDbStudents(dbStudentsRef.current)
          }
        } catch {
          toast.error('حدث خطأ أثناء حفظ التقدم')
        }
      }, 0)

      return { ...prev, [studentId]: updatedJuz }
    })
  }, [])

  const getStatus = (studentId: string, juz: number): JuzStatus => juzData[studentId]?.[juz] || 'not_started'
  const countOf = (studentId: string, status: JuzStatus) => Object.values(juzData[studentId] || {}).filter(s => s === status).length

  const saveStudentEdit = async (id: string) => {
    const original = dbStudents.find(s => s.id === id)
    if (!original) return
    const updated: DBStudent = { ...original, name: editName, supervisor_name: editSupervisor }
    try {
      await upsertStudent(updated)
      setDbStudents(prev => prev.map(s => s.id === id ? updated : s))
      setStudents(prev => prev.map(s => s.id === id ? { ...s, name: editName, supervisorName: editSupervisor } : s))
      setEditingStudent(null)
      toast.success('تم تحديث بيانات الطالب')
    } catch {
      toast.error('حدث خطأ أثناء حفظ التعديل')
    }
  }

  const addStudent = async () => {
    if (!newStudent.name.trim()) return
    const id = `s_${Date.now()}`
    const dbStudent: DBStudent = {
      id, name: newStudent.name.trim(), batch_id: selectedBatch, supervisor_id: '',
      supervisor_name: newStudent.supervisorName, enrollment_date: new Date().toISOString().split('T')[0],
      status: 'active', notes: '', juz_completed: 0, completion_percentage: 0, last_followup: null,
    }
    try {
      await upsertStudent(dbStudent)
      setDbStudents(prev => [...prev, dbStudent])
      setStudents(prev => [...prev, { id, name: newStudent.name.trim(), batchId: selectedBatch, supervisorName: newStudent.supervisorName }])
      setJuzData(prev => {
        const newJuz: Record<number, JuzStatus> = {}
        for (let j = 1; j <= 30; j++) newJuz[j] = 'not_started'
        return { ...prev, [id]: newJuz }
      })
      setNewStudent({ name: '', supervisorName: '' })
      setShowAddForm(false)
      toast.success(`تمت إضافة ${newStudent.name}`)
    } catch {
      toast.error('حدث خطأ أثناء إضافة الطالب')
    }
  }

  // Chart + stats — scoped to visible batch
  const batchStudentIds = new Set(batchStudents.map(s => s.id))
  const batchProgress = juzProgress.filter(p => batchStudentIds.has(p.student_id))
  const chartData = Array.from({ length: 30 }, (_, i) => ({
    juz: `${i + 1}`,
    محفوظ: batchProgress.filter(p => p.juz_number === i + 1 && p.status === 'memorized').length,
  }))
  const totalMemorized = batchProgress.filter(p => p.status === 'memorized').length
  const totalInProgress = batchProgress.filter(p => p.status === 'in_progress').length
  const totalStruggling = batchProgress.filter(p => p.status === 'struggling' || p.status === 'weak').length

  if (loading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="w-8 h-8 border-4 border-gray-200 border-t-green-500 rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-5 animate-fade-in-up">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>خريطة الحفظ</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>اضغط على أي جزء لتغيير حالته مباشرة</p>
        </div>

        {/* Batch tabs */}
        {isSupervisor ? (
          <div className="btn-primary px-5 py-2 rounded-lg text-sm font-bold text-white shadow-sm">
            دفعة {myBatchId} ({batchStudents.length} طالب)
          </div>
        ) : (
          <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
            {([46, 48] as const).map(b => (
              <button key={b} onClick={() => setSelectedBatch(b)}
                className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${selectedBatch === b ? 'shadow-sm' : ''}`}
                style={{ color: selectedBatch === b ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                دفعة {b} ({students.filter(s => s.batchId === b).length})
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card-static p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(34,197,94,0.12)' }}>
            <Award className="w-4 h-4" style={{ color: '#22c55e' }} />
          </div>
          <div>
            <p className="text-xl font-bold font-mono" style={{ color: 'var(--text-primary)' }}>{totalMemorized}</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>أجزاء محفوظة</p>
          </div>
        </div>
        <div className="card-static p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(234,179,8,0.12)' }}>
            <BookOpen className="w-4 h-4 text-yellow-500" />
          </div>
          <div>
            <p className="text-xl font-bold font-mono" style={{ color: 'var(--text-primary)' }}>{totalInProgress}</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>قيد الحفظ</p>
          </div>
        </div>
        <div className="card-static p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.12)' }}>
            <TrendingUp className="w-4 h-4 text-red-500" />
          </div>
          <div>
            <p className="text-xl font-bold font-mono" style={{ color: 'var(--text-primary)' }}>{totalStruggling}</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>متعثر / ضعيف</p>
          </div>
        </div>
      </div>

      {/* Bar chart */}
      <div className="card-static p-4">
        <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>عدد الطلاب الذين أتموا كل جزء</p>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={chartData} margin={{ top: 0, right: 0, left: -28, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="juz" tick={{ fontSize: 9 }} interval={1} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            <Bar dataKey="محفوظ" fill="#6366f1" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex gap-3 flex-wrap text-xs">
        {(Object.entries(STATUS_FULL) as [JuzStatus, string][]).map(([k, v]) => (
          <div key={k} className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded flex items-center justify-center font-bold" style={{ backgroundColor: STATUS_COLOR[k], color: k === 'not_started' ? '#94a3b8' : 'white', fontSize: 9 }}>
              {STATUS_LABEL[k]}
            </div>
            <span style={{ color: 'var(--text-secondary)' }}>{v}</span>
          </div>
        ))}
        <span className="text-xs mr-2" style={{ color: 'var(--text-muted)' }}>← اضغط لتغيير الحالة</span>
      </div>

      {/* Main table */}
      <div className="card-static overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-white/5" style={{ background: 'var(--bg-elevated)' }}>
                <th
                  className="sticky right-0 z-20 text-right px-3 py-3 font-semibold min-w-44 border-l border-white/5"
                  style={{
                    background: 'var(--bg-elevated)',
                    color: 'var(--text-secondary)',
                    boxShadow: '-8px 0 12px -8px rgba(0,0,0,0.35)',
                  }}
                >
                  الطالب
                </th>
                {Array.from({ length: 30 }, (_, i) => (
                  <th key={i} className="px-1 py-3 font-bold text-center w-8 min-w-8 font-mono" style={{ color: 'var(--text-muted)' }}>{i + 1}</th>
                ))}
                <th className="px-2 py-3 text-green-600 font-semibold text-center min-w-12">محفوظ</th>
                <th className="px-2 py-3 text-orange-500 font-semibold text-center min-w-10">ضعيف</th>
                <th className="px-2 py-3 text-red-500 font-semibold text-center min-w-10">متعثر</th>
              </tr>
            </thead>
            <tbody>
              {batchStudents.map((student, rowIdx) => {
                const isEditing = editingStudent === student.id
                return (
                  <tr key={student.id} className="border-b border-white/5">
                    <td
                      className="sticky right-0 z-20 px-3 py-2 border-l border-white/5"
                      style={{
                        background: rowIdx % 2 === 1 ? 'var(--bg-elevated)' : 'var(--bg-card)',
                        boxShadow: '-8px 0 12px -8px rgba(0,0,0,0.35)',
                      }}
                    >
                      {isEditing ? (
                        <div className="flex flex-col gap-1">
                          <input value={editName} onChange={e => setEditName(e.target.value)} autoFocus
                            className="text-xs border border-gray-200 rounded px-2 py-1 w-full" />
                          <input value={editSupervisor} onChange={e => setEditSupervisor(e.target.value)} placeholder="اسم المشرف"
                            className="text-xs border border-gray-200 rounded px-2 py-1 w-full" />
                          <div className="flex gap-1">
                            <button onClick={() => saveStudentEdit(student.id)} className="flex-1 text-xs bg-green-500 text-white rounded py-1">حفظ</button>
                            <button onClick={() => setEditingStudent(null)} className="text-xs px-1" style={{ color: 'var(--text-muted)' }}>إلغاء</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 group">
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-xs leading-tight" style={{ color: 'var(--text-primary)' }}>{student.name}</p>
                            {student.supervisorName && <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{student.supervisorName}</p>}
                          </div>
                          <button
                            onClick={() => { setEditingStudent(student.id); setEditName(student.name); setEditSupervisor(student.supervisorName) }}
                            className="opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity" style={{ color: 'var(--text-muted)' }}>
                            <Edit3 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </td>

                    {Array.from({ length: 30 }, (_, i) => {
                      const juz = i + 1
                      const status = getStatus(student.id, juz)
                      return (
                        <td key={juz} className="px-0.5 py-1.5 text-center">
                          <div
                            className="w-7 h-7 rounded-md mx-auto flex items-center justify-center font-bold text-[10px] cursor-pointer hover:opacity-80 hover:scale-110 transition-all select-none"
                            style={{ backgroundColor: STATUS_COLOR[status], color: status === 'not_started' ? '#94a3b8' : 'white' }}
                            onClick={() => cycleStatus(student.id, juz)}
                            title={`${student.name} — الجزء ${juz}: ${STATUS_FULL[status]}`}
                          >
                            {STATUS_LABEL[status]}
                          </div>
                        </td>
                      )
                    })}

                    <td className="px-2 py-2 text-center">
                      <span className="inline-flex items-center justify-center w-9 h-6 rounded-md font-bold font-mono text-xs" style={{ background: '#dcfce7', color: '#15803d' }}>{countOf(student.id, 'memorized')}</span>
                    </td>
                    <td className="px-2 py-2 text-center">
                      <span className="inline-flex items-center justify-center w-9 h-6 rounded-md font-bold font-mono text-xs" style={{ background: '#ffedd5', color: '#c2410c' }}>{countOf(student.id, 'weak')}</span>
                    </td>
                    <td className="px-2 py-2 text-center">
                      <span className="inline-flex items-center justify-center w-9 h-6 rounded-md font-bold font-mono text-xs" style={{ background: '#fee2e2', color: '#b91c1c' }}>{countOf(student.id, 'struggling')}</span>
                    </td>
                  </tr>
                )
              })}

              {/* Summary row */}
              <tr className="border-t-2 border-white/10 font-semibold" style={{ background: 'var(--bg-elevated)' }}>
                <td
                  className="sticky right-0 z-20 px-3 py-2.5 text-xs border-l border-white/5"
                  style={{
                    background: 'var(--bg-elevated)',
                    color: 'var(--text-secondary)',
                    boxShadow: '-8px 0 12px -8px rgba(0,0,0,0.35)',
                  }}
                >إجمالي المحفوظ</td>
                {Array.from({ length: 30 }, (_, i) => {
                  const count = batchStudents.filter(s => getStatus(s.id, i + 1) === 'memorized').length
                  const pct = batchStudents.length > 0 ? count / batchStudents.length : 0
                  return (
                    <td key={i} className="px-0.5 py-2 text-center">
                      <div className="w-7 h-7 rounded-md mx-auto flex items-center justify-center text-[10px] font-bold"
                        style={{ backgroundColor: pct >= 0.8 ? '#dcfce7' : pct >= 0.5 ? '#fef9c3' : '#fee2e2', color: pct >= 0.8 ? '#15803d' : pct >= 0.5 ? '#854d0e' : '#b91c1c' }}>
                        {count}
                      </div>
                    </td>
                  )
                })}
                <td className="px-2 py-2 text-center">
                  <span className="inline-flex items-center justify-center w-9 h-6 rounded-md font-bold font-mono text-xs" style={{ background: '#dcfce7', color: '#15803d' }}>
                    {batchStudents.reduce((sum, s) => sum + countOf(s.id, 'memorized'), 0)}
                  </span>
                </td>
                <td className="px-2 py-2 text-center">
                  <span className="inline-flex items-center justify-center w-9 h-6 rounded-md font-bold font-mono text-xs" style={{ background: '#ffedd5', color: '#c2410c' }}>
                    {batchStudents.reduce((sum, s) => sum + countOf(s.id, 'weak'), 0)}
                  </span>
                </td>
                <td className="px-2 py-2 text-center">
                  <span className="inline-flex items-center justify-center w-9 h-6 rounded-md font-bold font-mono text-xs" style={{ background: '#fee2e2', color: '#b91c1c' }}>
                    {batchStudents.reduce((sum, s) => sum + countOf(s.id, 'struggling'), 0)}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Add student */}
        <div className="border-t border-white/5 p-4">
          {showAddForm ? (
            <div className="flex items-center gap-3 flex-wrap">
              <input value={newStudent.name} onChange={e => setNewStudent({ ...newStudent, name: e.target.value })}
                placeholder="اسم الطالب" autoFocus
                className="flex-1 min-w-48 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-green-400" />
              <input value={newStudent.supervisorName} onChange={e => setNewStudent({ ...newStudent, supervisorName: e.target.value })}
                placeholder="اسم المشرف (اختياري)"
                className="flex-1 min-w-36 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-green-400" />
              <button onClick={addStudent} className="btn-primary btn-ripple px-4 py-2 text-sm font-medium text-white rounded-xl">إضافة</button>
              <button onClick={() => setShowAddForm(false)} className="px-4 py-2 text-sm" style={{ color: 'var(--text-muted)' }}>إلغاء</button>
            </div>
          ) : (
            <button onClick={() => setShowAddForm(true)} className="flex items-center gap-2 text-sm font-medium" style={{ color: '#6366f1' }}>
              <Plus className="w-4 h-4" />
              إضافة طالب جديد لدفعة {selectedBatch}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
