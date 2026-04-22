'use client'
import { useState, useEffect, useMemo } from 'react'
import { getExams, upsertExam, deleteExam as deleteExamDB, getStudents, getSupervisors, upsertJuzProgress, getDailyFollowups, type DBExam, type DBStudent, type DBSupervisor } from '@/lib/db'
import { CalendarCheck, Plus, Check, X, ChevronLeft, ChevronRight, AlertTriangle, Bell, PauseCircle, Pencil, Save, BookOpen } from 'lucide-react'
import { toast } from 'sonner'
import { getBatchName } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'

// نهايات أجزاء القرآن (مصحف المدينة — ٦٠٤ صفحة). رقم الصفحة عند آخر وجه
// في الجزء. يُستعمل لحساب «كم وجه يتبقّى للطالب ليصل لنهاية الجزء».
const JUZ_END_PAGE: Record<number, number> = {
  1: 21,  2: 41,  3: 61,  4: 81,  5: 101, 6: 121, 7: 141, 8: 161, 9: 181, 10: 201,
  11: 221, 12: 241, 13: 261, 14: 281, 15: 301, 16: 321, 17: 341, 18: 361, 19: 381, 20: 401,
  21: 421, 22: 441, 23: 461, 24: 481, 25: 501, 26: 521, 27: 541, 28: 561, 29: 581, 30: 604,
}

const DAYS_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
const MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']

/** إرجاع أيام أسبوع محدَّد بالإزاحة (0 = الأسبوع الحالي، -1 السابق، 1 التالي). */
function getWeekDates(weekOffset: number = 0): string[] {
  const base = new Date()
  base.setHours(0, 0, 0, 0)
  const day = base.getDay() // 0=Sun
  const week: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(base)
    d.setDate(base.getDate() - day + i + (weekOffset * 7))
    week.push(d.toISOString().split('T')[0])
  }
  return week
}

/** تاريخ اليوم بصيغة ISO (YYYY-MM-DD). */
function todayIso(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString().split('T')[0]
}

function formatDateAr(dateStr: string): string {
  const d = new Date(dateStr)
  return `${DAYS_AR[d.getDay()]} ${d.getDate()} ${MONTHS_AR[d.getMonth()]}`
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  scheduled: { label: 'مجدول', color: 'bg-blue-100 text-blue-700' },
  passed: { label: 'اجتاز', color: 'bg-green-100 text-green-700' },
  failed: { label: 'لم يجتز', color: 'bg-red-100 text-red-700' },
  postponed: { label: 'مؤجل', color: 'bg-gray-100/10 text-gray-400' },
}

export default function ExamsPage() {
  const { profile } = useAuth()
  const role = profile?.role ?? null
  const isCeo = role === 'ceo'
  // موظف السجلات: صلاحيات كاملة عبر كل الدفعات (مثل CEO في هذه الصفحة)
  const isRecordsOfficer = role === 'records_officer'
  const isCrossBatch = isCeo || isRecordsOfficer
  const myBatchId = profile?.batch_id ?? null

  const today = todayIso()

  const [exams, setExams] = useState<DBExam[]>([])
  const [students, setStudents] = useState<DBStudent[]>([])
  const [supervisors, setSupervisors] = useState<DBSupervisor[]>([])
  const [latestPosByStudent, setLatestPosByStudent] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [weekOffset, setWeekOffset] = useState(0)
  const [selectedDay, setSelectedDay] = useState(today)
  const [markingExam, setMarkingExam] = useState<string | null>(null)
  const [score, setScore] = useState('')
  const [errors, setErrors] = useState('')
  const [warnings, setWarnings] = useState('')
  const [hesitations, setHesitations] = useState('')
  // تعديل تفاصيل اختبار (الجزء/التاريخ/الوقت/المقيّم/الملاحظات)
  const [editingExamId, setEditingExamId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ juzNumber: '1', date: today, time: '10:00', examiner: '', notes: '' })
  const [form, setForm] = useState({
    studentId: '',
    juzNumber: '1',
    examiner: '',
    date: today,
    time: '10:00',
    notes: '',
  })

  const weekDates = getWeekDates(weekOffset)

  // كل المسجّلين يرون كل الاختبارات (read-only للدفعات الأخرى في حالة المشرف/مدير الدفعة).
  const visibleExams = exams

  // هل يستطيع المستخدم تعديل/حذف هذا الاختبار؟
  const canEditExam = (exam: DBExam): boolean => {
    if (isCrossBatch) return true // ceo + records_officer
    if (role === 'batch_manager' || role === 'supervisor' || role === 'teacher') {
      return myBatchId !== null && exam.batch_id === myBatchId
    }
    return false
  }
  const isOtherBatch = (exam: DBExam): boolean => !isCrossBatch && myBatchId !== null && exam.batch_id !== myBatchId

  useEffect(() => {
    async function fetchData() {
      try {
        // نجلب آخر ١٢٠ يوماً من المتابعات اليومية لاستنتاج آخر موضع لكل طالب.
        // RLS على الخادم يحدّ البيانات حسب صلاحية المستخدم — لا تسرّب بين الدفعات.
        const d = new Date()
        d.setDate(d.getDate() - 120)
        const dateFrom = d.toISOString().split('T')[0]

        const [examsData, studentsData, supervisorsData, followupsData] = await Promise.all([
          getExams(),
          getStudents(),
          getSupervisors(),
          getDailyFollowups({ dateFrom }),
        ])
        setExams(examsData)
        setStudents(studentsData)
        setSupervisors(supervisorsData)

        // آخر موضع (actual_position) لكل طالب — الأحدث تاريخاً مع قيمة غير فارغة.
        // followupsData مرتّبة تنازلياً حسب followup_date، فأول ظهور هو الأحدث.
        const latest: Record<string, { date: string; pos: number }> = {}
        for (const f of followupsData) {
          if (f.actual_position == null) continue
          const prev = latest[f.student_id]
          if (!prev || f.followup_date > prev.date) {
            latest[f.student_id] = { date: f.followup_date, pos: f.actual_position }
          }
        }
        const posMap: Record<string, number> = {}
        for (const sid of Object.keys(latest)) posMap[sid] = latest[sid].pos
        setLatestPosByStudent(posMap)
      } catch (err) {
        console.error(err)
        toast.error('حدث خطأ أثناء تحميل البيانات')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  // «كم وجه متبقّى» للطالب حتى نهاية جزء الاختبار. null إذا لم يتوفّر موضع.
  const remainingFor = useMemo(() => {
    return (exam: DBExam): { remaining: number; hasPos: boolean } => {
      const pos = latestPosByStudent[exam.student_id]
      const end = JUZ_END_PAGE[exam.juz_number] ?? exam.juz_number * 20
      if (pos == null) return { remaining: end, hasPos: false }
      return { remaining: Math.max(0, end - pos), hasPos: true }
    }
  }, [latestPosByStudent])

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
      batch_id: (!isCrossBatch && myBatchId !== null) ? myBatchId : (students.find(s => s.id === form.studentId)?.batch_id ?? 0),
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

  const resetMarkingForm = () => {
    setMarkingExam(null)
    setScore('')
    setErrors('')
    setWarnings('')
    setHesitations('')
  }

  const openMarkingFor = (exam: DBExam) => {
    // نبدأ من قيم الاختبار الحالية لو كانت مسجَّلة (تعديل نتيجة سابقة)
    setMarkingExam(exam.id)
    setScore(exam.score !== null && exam.score !== undefined ? String(exam.score) : '')
    setErrors(exam.errors !== null && exam.errors !== undefined ? String(exam.errors) : '')
    setWarnings(exam.warnings !== null && exam.warnings !== undefined ? String(exam.warnings) : '')
    setHesitations(exam.hesitations !== null && exam.hesitations !== undefined ? String(exam.hesitations) : '')
  }

  const markResult = async (examId: string, result: 'passed' | 'failed') => {
    const exam = exams.find(e => e.id === examId)
    if (!exam) return
    const updatedExam: DBExam = {
      ...exam,
      status: result,
      score: score ? Number(score) : null,
      errors: errors ? Number(errors) : null,
      warnings: warnings ? Number(warnings) : null,
      hesitations: hesitations ? Number(hesitations) : null,
    }
    try {
      await upsertExam(updatedExam)
      // ربط نتيجة الاختبار بخريطة الحفظ:
      // - اجتاز  → الجزء «محفوظ»
      // - لم يجتز → يُعاد إلى «قيد الحفظ» (لا نمسح البيانات الأخرى)
      try {
        await upsertJuzProgress(
          exam.student_id,
          exam.juz_number,
          result === 'passed' ? 'memorized' : 'in_progress',
        )
      } catch (jErr) {
        console.warn('juz_progress sync failed', jErr)
        // لا نُفشل الاختبار كاملاً لو فشل تحديث الخريطة — لكن ننبّه.
        toast.error('تم حفظ الاختبار لكن لم يتم تحديث خريطة الحفظ')
      }
      setExams(prev => prev.map(e => e.id === examId ? updatedExam : e))
      resetMarkingForm()
      toast.success(
        result === 'passed'
          ? '✅ اجتاز — تم تسجيله في خريطة الحفظ'
          : '❌ لم يجتز — تم إرجاع الجزء إلى «قيد الحفظ»',
      )
    } catch (err) {
      console.error(err)
      toast.error('حدث خطأ أثناء تسجيل النتيجة')
    }
  }

  // ─── تعديل تفاصيل الاختبار (الجزء / التاريخ / الوقت / المقيّم / الملاحظات) ───
  const openEditFor = (exam: DBExam) => {
    // نغلق أي نموذج تسجيل نتيجة مفتوح لتجنّب التداخل البصري
    if (markingExam) resetMarkingForm()
    setEditingExamId(exam.id)
    setEditForm({
      juzNumber: String(exam.juz_number),
      date: exam.date,
      time: exam.time,
      examiner: exam.examiner,
      notes: exam.notes || '',
    })
  }
  const cancelEdit = () => { setEditingExamId(null) }
  const saveEdit = async (examId: string) => {
    const exam = exams.find(e => e.id === examId)
    if (!exam) return
    const newJuz = Number(editForm.juzNumber)
    if (!newJuz || newJuz < 1 || newJuz > 30) { toast.error('رقم الجزء غير صحيح'); return }
    if (!editForm.date || !editForm.time) { toast.error('التاريخ والوقت مطلوبان'); return }
    if (!editForm.examiner.trim()) { toast.error('اسم المقيّم مطلوب'); return }
    const updated: DBExam = {
      ...exam,
      juz_number: newJuz,
      date: editForm.date,
      time: editForm.time,
      examiner: editForm.examiner.trim(),
      notes: editForm.notes,
    }
    try {
      await upsertExam(updated)
      setExams(prev => prev.map(e => e.id === examId ? updated : e))
      setEditingExamId(null)
      toast.success('تم حفظ تعديلات الاختبار')
    } catch (err) {
      console.error(err)
      toast.error('حدث خطأ أثناء حفظ التعديلات')
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
                <span style={{ color: '#C08A48' }}>الجزء <span className="font-mono">{e.juz_number}</span></span>
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
                  const studentOptions = (!isCeo && myBatchId !== null)
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
        {/* Week navigation */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5" style={{ background: 'rgba(99,102,241,0.04)' }}>
          <button
            onClick={() => { setWeekOffset(w => w - 1); setSelectedDay(getWeekDates(weekOffset - 1)[0]) }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors hover:bg-white/5"
            style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
          >
            <ChevronRight className="w-3.5 h-3.5" />
            الأسبوع السابق
          </button>

          <div className="text-center">
            <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
              {weekOffset === 0 ? 'الأسبوع الحالي' : weekOffset === 1 ? 'الأسبوع التالي' : weekOffset === -1 ? 'الأسبوع السابق' : weekOffset > 0 ? `بعد ${weekOffset} أسابيع` : `قبل ${-weekOffset} أسابيع`}
            </p>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {formatDateAr(weekDates[0])} — {formatDateAr(weekDates[5])}
            </p>
            {weekOffset !== 0 && (
              <button
                onClick={() => { setWeekOffset(0); setSelectedDay(today) }}
                className="mt-1 text-[11px] px-2 py-0.5 rounded font-medium"
                style={{ color: '#C08A48', background: 'rgba(99,102,241,0.1)' }}
              >
                ← العودة للأسبوع الحالي
              </button>
            )}
          </div>

          <button
            onClick={() => { setWeekOffset(w => w + 1); setSelectedDay(getWeekDates(weekOffset + 1)[0]) }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors hover:bg-white/5"
            style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
          >
            الأسبوع التالي
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
        </div>

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
                <p className="text-xs font-semibold" style={{ color: isSelected ? '#C08A48' : isToday ? '#818cf8' : 'var(--text-secondary)' }}>{dayName}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{d.getDate()} أبريل</p>
                {dayExamCount > 0 && (
                  <span className="inline-block mt-1 w-5 h-5 rounded-full text-[10px] font-bold font-mono text-white" style={{ backgroundColor: isSelected ? '#C08A48' : 'var(--text-muted)' }}>
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
              <button onClick={() => { setShowAdd(true); setForm(f => ({ ...f, date: selectedDay })) }} className="mt-3 text-xs hover:underline" style={{ color: '#C08A48' }}>
                + إضافة اختبار لهذا اليوم
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs font-medium mb-3" style={{ color: 'var(--text-muted)' }}>{formatDateAr(selectedDay)} — <span className="font-mono">{dayExams.length}</span> اختبار</p>
              {dayExams.map(exam => {
                const readOnly = isOtherBatch(exam)
                const bgColor = readOnly
                  ? 'rgba(148,163,184,0.08)'
                  : exam.status === 'scheduled' ? 'rgba(99,102,241,0.06)'
                  : exam.status === 'passed' ? 'rgba(34,197,94,0.06)'
                  : exam.status === 'failed' ? 'rgba(239,68,68,0.06)' : 'transparent'
                const borderCls = readOnly
                  ? 'border-slate-400/30'
                  : exam.status === 'scheduled' ? 'border-indigo-500/20'
                  : exam.status === 'passed' ? 'border-green-500/20'
                  : exam.status === 'failed' ? 'border-red-500/20' : 'border-white/10'
                const isMarking = markingExam === exam.id
                const hasResult = exam.status === 'passed' || exam.status === 'failed'
                return (
                <div key={exam.id} className={`rounded-xl border ${borderCls}`} style={{ background: bgColor, opacity: readOnly ? 0.75 : 1 }}>
                  <div className="flex flex-wrap items-center gap-3 sm:gap-4 p-4">
                    {/* Time */}
                    <div className="text-center min-w-12">
                      <p className="font-bold text-sm font-mono" style={{ color: 'var(--text-primary)' }}>{exam.time}</p>
                      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>الوقت</p>
                    </div>

                    {/* Juz badge */}
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm font-mono flex-shrink-0" style={{ backgroundColor: '#C08A48' }}>
                      {exam.juz_number}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-[180px]">
                      <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{exam.student_name}</p>
                      <div className="flex items-center gap-3 text-xs mt-0.5 flex-wrap" style={{ color: 'var(--text-muted)' }}>
                        <span>{getBatchName(exam.batch_id)}</span>
                        <span>•</span>
                        <span>المقيّم: {exam.examiner}</span>
                        {exam.score !== null && exam.score !== undefined && (
                          <span style={{ color: '#C08A48' }} className="font-medium font-mono">الدرجة: {exam.score}/100</span>
                        )}
                      </div>
                      {/* توقُّع — كم وجه متبقّى للطالب لنهاية الجزء */}
                      {!hasResult && (() => {
                        const { remaining, hasPos } = remainingFor(exam)
                        if (!hasPos) {
                          return (
                            <div className="mt-1.5">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-semibold" style={{ background: 'rgba(148,163,184,0.12)', color: 'var(--text-muted)', border: '1px solid var(--border-soft)' }}>
                                <BookOpen className="w-3 h-3" />
                                لا توجد بيانات موضع — الجزء {exam.juz_number}: {JUZ_END_PAGE[exam.juz_number] ?? exam.juz_number * 20} وجه
                              </span>
                            </div>
                          )
                        }
                        const tone = remaining === 0
                          ? { bg: 'rgba(90,143,103,0.15)', color: '#356B42', border: 'rgba(90,143,103,0.35)', label: 'جاهز للاختبار — وصل لنهاية الجزء' }
                          : remaining <= 3
                            ? { bg: 'rgba(90,143,103,0.12)', color: '#356B42', border: 'rgba(90,143,103,0.30)', label: `متبقّ ${remaining} وجه — قريب` }
                            : remaining <= 8
                              ? { bg: 'rgba(192,138,72,0.12)', color: '#8B5A1E', border: 'rgba(192,138,72,0.30)', label: `متبقّ ${remaining} وجه` }
                              : { bg: 'rgba(185,72,56,0.10)', color: '#8B2F23', border: 'rgba(185,72,56,0.30)', label: `متبقّ ${remaining} وجه — بعيد` }
                        return (
                          <div className="mt-1.5">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-bold font-mono" style={{ background: tone.bg, color: tone.color, border: `1px solid ${tone.border}` }}>
                              <BookOpen className="w-3 h-3" />
                              {tone.label}
                            </span>
                          </div>
                        )
                      })()}
                      {/* Counter pills — Errors / Warnings / Hesitations */}
                      {(exam.errors || exam.warnings || exam.hesitations) && (
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                          {exam.errors ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-bold font-mono" style={{ background: '#fef2f2', color: '#B94838', border: '1px solid rgba(185,72,56,0.2)' }}>
                              <X className="w-3 h-3" /> أخطاء: {exam.errors}
                            </span>
                          ) : null}
                          {exam.warnings ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-bold font-mono" style={{ background: '#fefce8', color: '#854d0e', border: '1px solid rgba(234,179,8,0.25)' }}>
                              <Bell className="w-3 h-3" /> تنبيهات: {exam.warnings}
                            </span>
                          ) : null}
                          {exam.hesitations ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-bold font-mono" style={{ background: '#f5f3ff', color: '#5B21B6', border: '1px solid rgba(91,33,182,0.18)' }}>
                              <PauseCircle className="w-3 h-3" /> ترددات: {exam.hesitations}
                            </span>
                          ) : null}
                        </div>
                      )}
                      {exam.notes && <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{exam.notes}</p>}
                    </div>

                    {/* Status + top-level actions */}
                    <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto sm:flex-shrink-0 mt-2 sm:mt-0">
                      {readOnly && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: 'rgba(148,163,184,0.2)', color: '#64748b' }}>
                          قراءة فقط
                        </span>
                      )}
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${(STATUS_CONFIG[exam.status] || STATUS_CONFIG.scheduled).color}`}>
                        {(STATUS_CONFIG[exam.status] || STATUS_CONFIG.scheduled).label}
                      </span>
                      {!readOnly && !isMarking && exam.status === 'scheduled' && (
                        <button
                          onClick={() => openMarkingFor(exam)}
                          className="text-xs font-semibold border px-3 py-2 rounded-lg hover:bg-white/5 transition active:scale-95"
                          style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-soft)', minHeight: '36px' }}
                        >
                          تسجيل النتيجة
                        </button>
                      )}
                      {!readOnly && !isMarking && hasResult && (
                        <button
                          onClick={() => openMarkingFor(exam)}
                          className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg hover:opacity-90 transition active:scale-95"
                          style={{ background: 'rgba(192,138,72,0.15)', color: '#8B5A1E', border: '1px solid rgba(192,138,72,0.4)', minHeight: '36px' }}
                          title="تعديل النتيجة — قد يُعيد حالة الجزء في خريطة الحفظ"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          تعديل
                        </button>
                      )}
                      {canEditExam(exam) && !isMarking && editingExamId !== exam.id && (
                        <button
                          onClick={() => openEditFor(exam)}
                          className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg transition active:scale-95"
                          style={{ background: 'rgba(53,107,110,0.10)', color: '#235052', border: '1px solid rgba(53,107,110,0.35)', minHeight: '36px' }}
                          title="تعديل الجزء والتاريخ والوقت"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          تعديل التفاصيل
                        </button>
                      )}
                      {canEditExam(exam) && !isMarking && (
                        <button
                          onClick={() => handleDeleteExam(exam.id)}
                          className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg transition active:scale-95"
                          style={{ background: 'rgba(185,72,56,0.10)', color: '#B94838', border: '1px solid rgba(185,72,56,0.35)', minHeight: '36px' }}
                          title="حذف الاختبار"
                        >
                          <X className="w-3.5 h-3.5" />
                          حذف
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Edit details form — expanded row with 5 inputs */}
                  {canEditExam(exam) && editingExamId === exam.id && (
                    <div
                      className="px-4 pb-4 pt-0 border-t mt-2"
                      style={{ borderColor: 'rgba(53,107,110,0.25)' }}
                    >
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-3">
                        <div>
                          <label className="text-[11px] font-semibold mb-1 block" style={{ color: 'var(--text-secondary)' }}>الجزء</label>
                          <select
                            value={editForm.juzNumber}
                            onChange={e => setEditForm({ ...editForm, juzNumber: e.target.value })}
                            className="w-full px-2.5 py-2 text-sm rounded-lg outline-none"
                            style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-soft)', color: 'var(--text-primary)' }}
                          >
                            {Array.from({ length: 30 }, (_, i) => (
                              <option key={i + 1} value={i + 1}>الجزء {i + 1}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-[11px] font-semibold mb-1 block" style={{ color: 'var(--text-secondary)' }}>التاريخ</label>
                          <input
                            type="date"
                            value={editForm.date}
                            onChange={e => setEditForm({ ...editForm, date: e.target.value })}
                            className="w-full px-2.5 py-2 text-sm rounded-lg outline-none"
                            style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-soft)', color: 'var(--text-primary)' }}
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-semibold mb-1 block" style={{ color: 'var(--text-secondary)' }}>الوقت</label>
                          <input
                            type="time"
                            value={editForm.time}
                            onChange={e => setEditForm({ ...editForm, time: e.target.value })}
                            className="w-full px-2.5 py-2 text-sm rounded-lg outline-none"
                            style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-soft)', color: 'var(--text-primary)' }}
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-semibold mb-1 block" style={{ color: 'var(--text-secondary)' }}>المقيّم</label>
                          <input
                            value={editForm.examiner}
                            onChange={e => setEditForm({ ...editForm, examiner: e.target.value })}
                            list="examiners-list-edit"
                            className="w-full px-2.5 py-2 text-sm rounded-lg outline-none"
                            style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-soft)', color: 'var(--text-primary)' }}
                          />
                          <datalist id="examiners-list-edit">
                            {supervisors.map(s => <option key={s.id} value={s.name} />)}
                          </datalist>
                        </div>
                        <div className="col-span-2 md:col-span-1">
                          <label className="text-[11px] font-semibold mb-1 block" style={{ color: 'var(--text-secondary)' }}>ملاحظات</label>
                          <input
                            value={editForm.notes}
                            onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                            placeholder="اختياري"
                            className="w-full px-2.5 py-2 text-sm rounded-lg outline-none"
                            style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-soft)', color: 'var(--text-primary)' }}
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-end gap-2 mt-3 flex-wrap">
                        <button
                          onClick={() => saveEdit(exam.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition active:scale-95"
                          style={{ background: 'linear-gradient(135deg, #356B6E, #244A4C)', boxShadow: '0 2px 8px rgba(53,107,110,0.3)' }}
                        >
                          <Save className="w-3.5 h-3.5" /> حفظ التعديلات
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="text-xs px-3 py-1.5 rounded-lg border transition hover:bg-white/5"
                          style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}
                        >
                          إلغاء
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Marking form — expanded row with 4 inputs */}
                  {!readOnly && isMarking && (
                    <div
                      className="px-4 pb-4 pt-0 border-t mt-2"
                      style={{ borderColor: 'rgba(192,138,72,0.20)' }}
                    >
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                        <div>
                          <label className="text-[11px] font-semibold mb-1 flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                            الدرجة <span className="text-[10px] opacity-60">/ 100</span>
                          </label>
                          <input
                            type="number" min={0} max={100}
                            value={score}
                            onChange={e => setScore(e.target.value)}
                            placeholder="—"
                            className="w-full px-2.5 py-2 text-sm rounded-lg outline-none"
                            style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-soft)', color: 'var(--text-primary)' }}
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-semibold mb-1 flex items-center gap-1" style={{ color: '#B94838' }}>
                            <X className="w-3 h-3" /> الأخطاء
                          </label>
                          <input
                            type="number" min={0}
                            value={errors}
                            onChange={e => setErrors(e.target.value)}
                            placeholder="0"
                            className="w-full px-2.5 py-2 text-sm rounded-lg outline-none"
                            style={{ background: '#fef2f2', border: '1px solid rgba(185,72,56,0.25)', color: '#791F1F' }}
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-semibold mb-1 flex items-center gap-1" style={{ color: '#854d0e' }}>
                            <Bell className="w-3 h-3" /> التنبيهات
                          </label>
                          <input
                            type="number" min={0}
                            value={warnings}
                            onChange={e => setWarnings(e.target.value)}
                            placeholder="0"
                            className="w-full px-2.5 py-2 text-sm rounded-lg outline-none"
                            style={{ background: '#fefce8', border: '1px solid rgba(234,179,8,0.3)', color: '#713F12' }}
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-semibold mb-1 flex items-center gap-1" style={{ color: '#5B21B6' }}>
                            <PauseCircle className="w-3 h-3" /> الترددات
                          </label>
                          <input
                            type="number" min={0}
                            value={hesitations}
                            onChange={e => setHesitations(e.target.value)}
                            placeholder="0"
                            className="w-full px-2.5 py-2 text-sm rounded-lg outline-none"
                            style={{ background: '#f5f3ff', border: '1px solid rgba(91,33,182,0.2)', color: '#3B0764' }}
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
                        <p className="text-[11px] flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                          <AlertTriangle className="w-3.5 h-3.5" style={{ color: '#C08A48' }} />
                          عند اعتماد «اجتاز» — سيُسجَّل الجزء {exam.juz_number} كـ <span className="font-bold" style={{ color: '#5A8F67' }}>محفوظ</span> في خريطة الطالب.
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => markResult(exam.id, 'passed')}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition active:scale-95"
                            style={{ background: 'linear-gradient(135deg, #16a34a, #15803d)', boxShadow: '0 2px 8px rgba(22,163,74,0.3)' }}
                          >
                            <Check className="w-3.5 h-3.5" /> اجتاز
                          </button>
                          <button
                            onClick={() => markResult(exam.id, 'failed')}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition active:scale-95"
                            style={{ background: 'linear-gradient(135deg, #B94838, #8B2F23)', boxShadow: '0 2px 8px rgba(185,72,56,0.3)' }}
                          >
                            <X className="w-3.5 h-3.5" /> لم يجتز
                          </button>
                          <button
                            onClick={resetMarkingForm}
                            className="text-xs px-3 py-1.5 rounded-lg border transition hover:bg-white/5"
                            style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}
                          >
                            إلغاء
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )})}
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
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-white text-xs font-bold font-mono" style={{ backgroundColor: '#C08A48' }}>
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
