'use client'
import { useState, useEffect } from 'react'
import { getExams, upsertExam, deleteExam as deleteExamDB, getStudents, getSupervisors, type DBExam, type DBStudent, type DBSupervisor } from '@/lib/db'
import { CalendarCheck, Plus, Clock, User, BookOpen, Check, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { getBatchName } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'

const DAYS_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

function getThisWeekDates(): string[] {
  const today = new Date('2026-04-06') // fixed date for demo
  const day = today.getDay() // 0=Sun
  const week: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(today)
    d.setDate(today.getDate() - day + i)
    week.push(d.toISOString().split('T')[0])
  }
  return week
}

function formatDateAr(dateStr: string): string {
  const d = new Date(dateStr)
  return `${DAYS_AR[d.getDay()]} ${d.getDate()} أبريل`
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  scheduled: { label: 'مجدول', color: 'bg-blue-100 text-blue-700' },
  passed: { label: 'اجتاز', color: 'bg-green-100 text-green-700' },
  failed: { label: 'لم يجتز', color: 'bg-red-100 text-red-700' },
  postponed: { label: 'مؤجل', color: 'bg-gray-100/10 text-gray-400' },
}

export default function ExamsPage() {
  const { profile } = useAuth()
  const isSupervisor = profile?.role === 'supervisor' || profile?.role === 'teacher'
  const myBatchId = profile?.batch_id ?? null

  const [exams, setExams] = useState<DBExam[]>([])
  const [students, setStudents] = useState<DBStudent[]>([])
  const [supervisors, setSupervisors] = useState<DBSupervisor[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [selectedDay, setSelectedDay] = useState('2026-04-06')
  const [markingExam, setMarkingExam] = useState<string | null>(null)
  const [score, setScore] = useState('')
  const [form, setForm] = useState({
    studentId: '',
    juzNumber: '1',
    examiner: '',
    date: '2026-04-06',
    time: '10:00',
    notes: '',
  })

  const weekDates = getThisWeekDates()
  const today = '2026-04-06'

  const visibleExams = (isSupervisor && myBatchId !== null)
    ? exams.filter(e => e.batch_id === myBatchId)
    : exams

  useEffect(() => {
    async function fetchData() {
      try {
        const [examsData, studentsData, supervisorsData] = await Promise.all([
          getExams(),
          getStudents(),
          getSupervisors(),
        ])
        setExams(examsData)
        setStudents(studentsData)
        setSupervisors(supervisorsData)
      } catch (err) {
        console.error(err)
        toast.error('حدث خطأ أثناء تحميل البيانات')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const dayExams = visibleExams.filter(e => e.date === selectedDay).sort((a, b) => a.time.localeCompare(b.time))
  const todayExams = visibleExams.filter(e => e.date === today)
  const scheduledToday = todayExams.filter(e => e.status === 'scheduled').length

  const addExam = async () => {
    if (!form.studentId || !form.examiner) {
      toast.error('يرجى تعبئة جميع الحقول المطلوبة')
      return
    }
    const student = students.find(s => s.id === form.studentId)
    if (!student) return
    const newExam: DBExam = {
      id: `e${Date.now()}`,
      student_id: form.studentId,
      student_name: student.name,
      batch_id: isSupervisor && myBatchId !== null ? myBatchId : (students.find(s => s.id === form.studentId)?.batch_id ?? 0),
      juz_number: Number(form.juzNumber),
      examiner: form.examiner,
      date: form.date,
      time: form.time,
      status: 'scheduled',
      score: null,
      notes: form.notes,
    }
    try {
      await upsertExam(newExam)
      setExams(prev => [...prev, newExam])
      setShowAdd(false)
      setForm({ studentId: '', juzNumber: '1', examiner: '', date: '2026-04-06', time: '10:00', notes: '' })
      toast.success(`تم جدولة اختبار ${student.name} — الجزء ${form.juzNumber}`)
    } catch (err) {
      console.error(err)
      toast.error('حدث خطأ أثناء حفظ الاختبار')
    }
  }

  const markResult = async (examId: string, result: 'passed' | 'failed') => {
    const exam = exams.find(e => e.id === examId)
    if (!exam) return
    const updatedExam: DBExam = { ...exam, status: result, score: score ? Number(score) : null }
    try {
      await upsertExam(updatedExam)
      setExams(prev => prev.map(e => e.id === examId ? updatedExam : e))
      setMarkingExam(null)
      setScore('')
      toast.success(result === 'passed' ? '✅ تم تسجيل الاجتياز' : '❌ تم تسجيل عدم الاجتياز')
    } catch (err) {
      console.error(err)
      toast.error('حدث خطأ أثناء تسجيل النتيجة')
    }
  }

  const handleDeleteExam = async (examId: string) => {
    try {
      await deleteExamDB(examId)
      setExams(prev => prev.filter(e => e.id !== examId))
      toast.success('تم حذف الاختبار')
    } catch (err) {
      console.error(err)
      toast.error('حدث خطأ أثناء حذف الاختبار')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>جاري تحميل الاختبارات...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>جدول اختبارات الأجزاء</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>تنظيم اختبارات حفظ القرآن الأسبوعية</p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="btn-primary btn-ripple flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white rounded-xl"
        >
          <Plus className="w-4 h-4" />
          إضافة اختبار
        </button>
      </div>

      {/* Today summary */}
      {todayExams.length > 0 && (
        <div style={{ background: 'rgba(99,102,241,0.06)' }} className="border border-indigo-500/20 rounded-2xl p-4">
          <p className="font-semibold text-sm mb-2 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <CalendarCheck className="w-4 h-4" />
            اختبارات اليوم ({today}) — <span className="font-mono">{scheduledToday}</span> مجدول
          </p>
          <div className="flex flex-wrap gap-2">
            {todayExams.map(e => (
              <div key={e.id} className="border border-white/10 rounded-xl px-3 py-2 text-sm" style={{ background: 'rgba(255,255,255,0.02)' }}>
                <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{e.student_name}</span>
                <span style={{ color: 'var(--text-muted)' }} className="mx-1">•</span>
                <span style={{ color: '#6366f1' }}>الجزء <span className="font-mono">{e.juz_number}</span></span>
                <span style={{ color: 'var(--text-muted)' }} className="mx-1">•</span>
                <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{e.time}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add exam form */}
      {showAdd && (
        <div className="card-static p-5 space-y-4">
          <h2 className="font-bold" style={{ color: 'var(--text-primary)' }}>إضافة اختبار جديد</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="col-span-2 md:col-span-1">
              <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>الطالب *</label>
              <select
                value={form.studentId}
                onChange={e => setForm({ ...form, studentId: e.target.value })}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-green-400"
              >
                <option value="">اختر الطالب</option>
                {(() => {
                  const studentOptions = (isSupervisor && myBatchId !== null)
                    ? students.filter(s => s.batch_id === myBatchId)
                    : students
                  return [...new Set(studentOptions.map(s => s.batch_id))].sort().map(batch => (
                    <optgroup key={batch} label={`دفعة ${batch}`}>
                      {studentOptions.filter(s => s.batch_id === batch).map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </optgroup>
                  ))
                })()}
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>رقم الجزء *</label>
              <select
                value={form.juzNumber}
                onChange={e => setForm({ ...form, juzNumber: e.target.value })}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-green-400"
              >
                {Array.from({ length: 30 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>الجزء {i + 1}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>المقيّم *</label>
              <input
                value={form.examiner}
                onChange={e => setForm({ ...form, examiner: e.target.value })}
                list="examiners-list"
                placeholder="اسم المقيّم"
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-green-400"
              />
              <datalist id="examiners-list">
                {supervisors.map(s => <option key={s.id} value={s.name} />)}
              </datalist>
            </div>
            <div>
              <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>التاريخ *</label>
              <input
                type="date"
                value={form.date}
                onChange={e => setForm({ ...form, date: e.target.value })}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-green-400"
              />
            </div>
            <div>
              <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>الوقت *</label>
              <input
                type="time"
                value={form.time}
                onChange={e => setForm({ ...form, time: e.target.value })}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-green-400"
              />
            </div>
            <div>
              <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>ملاحظات</label>
              <input
                value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                placeholder="ملاحظات اختيارية"
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-green-400"
              />
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <button onClick={addExam} className="btn-primary btn-ripple px-5 py-2.5 text-sm font-medium text-white rounded-xl">
              حفظ الاختبار
            </button>
            <button onClick={() => setShowAdd(false)} className="px-5 py-2.5 text-sm border border-white/10 rounded-xl" style={{ color: 'var(--text-muted)' }}>
              إلغاء
            </button>
          </div>
        </div>
      )}

      {/* Weekly calendar */}
      <div className="card-static overflow-hidden">
        {/* Day selector */}
        <div className="flex overflow-x-auto border-b border-white/5">
          {weekDates.slice(0, 6).map(date => {
            const d = new Date(date)
            const dayName = DAYS_AR[d.getDay()]
            const dayExamCount = visibleExams.filter(e => e.date === date).length
            const isToday = date === today
            const isSelected = date === selectedDay
            return (
              <button
                key={date}
                onClick={() => setSelectedDay(date)}
                className={`flex-1 min-w-20 px-3 py-3 text-center transition-colors border-b-2 ${isSelected ? 'border-indigo-500' : 'border-transparent'}`}
                style={isSelected ? { background: 'rgba(99,102,241,0.06)' } : {}}
              >
                <p className="text-xs font-semibold" style={{ color: isSelected ? '#6366f1' : isToday ? '#818cf8' : 'var(--text-secondary)' }}>{dayName}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{d.getDate()} أبريل</p>
                {dayExamCount > 0 && (
                  <span className="inline-block mt-1 w-5 h-5 rounded-full text-[10px] font-bold font-mono text-white" style={{ backgroundColor: isSelected ? '#6366f1' : 'var(--text-muted)' }}>
                    {dayExamCount}
                  </span>
                )}
                {isToday && !isSelected && <span className="block text-[9px] font-medium mt-0.5" style={{ color: '#818cf8' }}>اليوم</span>}
              </button>
            )
          })}
        </div>

        {/* Day exams */}
        <div className="p-5">
          {dayExams.length === 0 ? (
            <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>
              <CalendarCheck className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">لا توجد اختبارات مجدولة ليوم {formatDateAr(selectedDay)}</p>
              <button onClick={() => { setShowAdd(true); setForm(f => ({ ...f, date: selectedDay })) }} className="mt-3 text-xs hover:underline" style={{ color: '#6366f1' }}>
                + إضافة اختبار لهذا اليوم
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs font-medium mb-3" style={{ color: 'var(--text-muted)' }}>{formatDateAr(selectedDay)} — <span className="font-mono">{dayExams.length}</span> اختبار</p>
              {dayExams.map(exam => (
                <div key={exam.id} className={`flex items-center gap-4 p-4 rounded-xl border ${exam.status === 'scheduled' ? 'border-indigo-500/20' : exam.status === 'passed' ? 'border-green-500/20' : exam.status === 'failed' ? 'border-red-500/20' : 'border-white/10'}`} style={{ background: exam.status === 'scheduled' ? 'rgba(99,102,241,0.06)' : exam.status === 'passed' ? 'rgba(34,197,94,0.06)' : exam.status === 'failed' ? 'rgba(239,68,68,0.06)' : 'transparent' }}>
                  {/* Time */}
                  <div className="text-center min-w-12">
                    <p className="font-bold text-sm font-mono" style={{ color: 'var(--text-primary)' }}>{exam.time}</p>
                    <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>الوقت</p>
                  </div>

                  {/* Juz badge */}
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm font-mono flex-shrink-0" style={{ backgroundColor: '#6366f1' }}>
                    {exam.juz_number}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{exam.student_name}</p>
                    <div className="flex items-center gap-3 text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      <span>{getBatchName(exam.batch_id)}</span>
                      <span>•</span>
                      <span>المقيّم: {exam.examiner}</span>
                      {exam.score !== null && <span style={{ color: '#6366f1' }} className="font-medium font-mono">الدرجة: {exam.score}/100</span>}
                    </div>
                    {exam.notes && <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{exam.notes}</p>}
                  </div>

                  {/* Status + actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${(STATUS_CONFIG[exam.status] || STATUS_CONFIG.scheduled).color}`}>
                      {(STATUS_CONFIG[exam.status] || STATUS_CONFIG.scheduled).label}
                    </span>
                    {exam.status === 'scheduled' && (
                      <>
                        {markingExam === exam.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              value={score}
                              onChange={e => setScore(e.target.value)}
                              placeholder="الدرجة"
                              className="w-16 px-2 py-1 text-xs border border-gray-200 rounded-lg"
                              min={0} max={100}
                            />
                            <button onClick={() => markResult(exam.id, 'passed')} className="p-1.5 bg-green-100 text-green-700 rounded-lg hover:bg-green-200">
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => markResult(exam.id, 'failed')} className="p-1.5 bg-red-100 text-red-700 rounded-lg hover:bg-red-200">
                              <X className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => setMarkingExam(null)} className="text-xs" style={{ color: 'var(--text-muted)' }}>إلغاء</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setMarkingExam(exam.id)}
                            className="text-xs border border-white/10 px-2.5 py-1.5 rounded-lg" style={{ color: 'var(--text-muted)' }}
                          >
                            تسجيل النتيجة
                          </button>
                        )}
                      </>
                    )}
                    <button onClick={() => handleDeleteExam(exam.id)} className="text-gray-300 hover:text-red-400 p-1">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* All upcoming exams */}
      <div className="card-static overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5">
          <h2 className="font-bold" style={{ color: 'var(--text-primary)' }}>جميع الاختبارات القادمة</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.02)' }} className="border-b border-white/5">
              <th className="text-right px-4 py-2.5 font-semibold" style={{ color: 'var(--text-secondary)' }}>الطالب</th>
              <th className="text-right px-4 py-2.5 font-semibold" style={{ color: 'var(--text-secondary)' }}>الجزء</th>
              <th className="text-right px-4 py-2.5 font-semibold" style={{ color: 'var(--text-secondary)' }}>المقيّم</th>
              <th className="text-right px-4 py-2.5 font-semibold" style={{ color: 'var(--text-secondary)' }}>التاريخ</th>
              <th className="text-right px-4 py-2.5 font-semibold" style={{ color: 'var(--text-secondary)' }}>الوقت</th>
              <th className="text-right px-4 py-2.5 font-semibold" style={{ color: 'var(--text-secondary)' }}>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {visibleExams
              .filter(e => e.date >= today)
              .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
              .map(exam => (
                <tr key={exam.id} className="border-b border-white/5">
                  <td className="px-4 py-2.5 font-medium" style={{ color: 'var(--text-primary)' }}>{exam.student_name}</td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-white text-xs font-bold font-mono" style={{ backgroundColor: '#6366f1' }}>
                      {exam.juz_number}
                    </span>
                  </td>
                  <td className="px-4 py-2.5" style={{ color: 'var(--text-secondary)' }}>{exam.examiner}</td>
                  <td className="px-4 py-2.5" style={{ color: 'var(--text-secondary)' }}>{formatDateAr(exam.date)}</td>
                  <td className="px-4 py-2.5 font-mono" style={{ color: 'var(--text-secondary)' }}>{exam.time}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${(STATUS_CONFIG[exam.status] || STATUS_CONFIG.scheduled).color}`}>
                      {(STATUS_CONFIG[exam.status] || STATUS_CONFIG.scheduled).label}
                    </span>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
