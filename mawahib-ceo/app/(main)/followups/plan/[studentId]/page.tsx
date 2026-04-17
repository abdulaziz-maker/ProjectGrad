'use client'
import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { getStudents, getQuranPlans, getDailyFollowups, getBatchSchedule, upsertBatchScheduleDay, deleteBatchScheduleDay, upsertStudent, type DBStudent } from '@/lib/db'
import { formatHijri, toHijriShort, todayStr as getToday, gregorianToHijri } from '@/lib/hijri'
import {
  calculateExpectedPosition, PROGRAM_END_DATE,
  type QuranPlan, type DailyFollowup, type DayDetail, type BatchScheduleEntry,
} from '@/lib/quran-followup'
import { BookOpenCheck, ArrowRight, CalendarDays, TrendingUp, Target, ChevronLeft, ChevronRight, Save, RotateCw } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'

const DAYS_AR_SHORT = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت']

export default function PlanPage() {
  const params = useParams()
  const studentId = params.studentId as string

  const [student, setStudent] = useState<DBStudent | null>(null)
  const [plan, setPlan] = useState<QuranPlan | null>(null)
  const [followups, setFollowups] = useState<DailyFollowup[]>([])
  const [schedule, setSchedule] = useState<BatchScheduleEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCell, setSelectedCell] = useState<string | null>(null)

  // حقول المراجعة (تُحرَّر محلياً ثم تُحفظ)
  const [nearReview, setNearReview] = useState('')
  const [farReview, setFarReview] = useState('')
  const [reviewDirty, setReviewDirty] = useState(false)
  const [reviewSaving, setReviewSaving] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const [students, plans] = await Promise.all([
          getStudents(),
          getQuranPlans(studentId),
        ])
        const s = students.find(st => st.id === studentId)
        setStudent(s || null)
        if (s) {
          setNearReview(s.near_review ?? '')
          setFarReview(s.far_review ?? '')
          setReviewDirty(false)
        }
        const activePlan = plans.find(p => p.is_active)
        setPlan(activePlan || null)

        if (activePlan && s) {
          const [f, sch] = await Promise.all([
            getDailyFollowups({ studentId, dateFrom: activePlan.start_date, dateTo: activePlan.end_date }),
            getBatchSchedule(s.batch_id, activePlan.start_date, activePlan.end_date),
          ])
          setFollowups(f)
          setSchedule(sch)
        }
      } catch (err) {
        console.error(err)
        toast.error('خطأ في تحميل بيانات الخطة')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [studentId])

  // Build schedule map
  const scheduleMap = useMemo(() => {
    const m = new Map<string, string>()
    schedule.forEach(e => m.set(e.date, e.day_type))
    return m
  }, [schedule])

  // Build followup map: date → followup
  const followupByDate = useMemo(() => {
    const m = new Map<string, DailyFollowup>()
    followups.forEach(f => m.set(f.followup_date, f))
    return m
  }, [followups])

  // Calculate plan details
  const dayDetails = useMemo(() => {
    if (!plan) return []
    return calculateExpectedPosition(
      plan.start_position,
      plan.start_date,
      plan.end_date,
      plan.daily_rate,
      scheduleMap,
    ).dayDetails
  }, [plan, scheduleMap])

  // Group days by week (Sun start)
  const weeks = useMemo(() => {
    if (dayDetails.length === 0) return []
    const result: DayDetail[][] = []
    let currentWeek: DayDetail[] = []

    // Pad the first week with empty days
    const firstDay = new Date(dayDetails[0].date + 'T12:00:00')
    const firstDow = firstDay.getDay()
    for (let i = 0; i < firstDow; i++) {
      currentWeek.push({ date: '', type: 'holiday', expectedPosition: 0, isWorkDay: false })
    }

    for (const day of dayDetails) {
      const dow = new Date(day.date + 'T12:00:00').getDay()
      if (dow === 0 && currentWeek.length > 0) {
        // Pad remaining days of current week
        while (currentWeek.length < 7) currentWeek.push({ date: '', type: 'holiday', expectedPosition: 0, isWorkDay: false })
        result.push(currentWeek)
        currentWeek = []
      }
      currentWeek.push(day)
    }
    // Pad last week
    while (currentWeek.length < 7) currentWeek.push({ date: '', type: 'holiday', expectedPosition: 0, isWorkDay: false })
    if (currentWeek.length > 0) result.push(currentWeek)

    return result
  }, [dayDetails])

  // Stats
  const today = getToday()
  const todayExpected = useMemo(() => {
    if (!plan) return 0
    return calculateExpectedPosition(plan.start_position, plan.start_date, today, plan.daily_rate, scheduleMap).position
  }, [plan, scheduleMap, today])

  const latestFollowup = followups.filter(f => f.actual_position != null).sort((a, b) => b.followup_date.localeCompare(a.followup_date))[0]
  const currentActual = latestFollowup?.actual_position ?? null
  const currentGap = currentActual !== null ? currentActual - todayExpected : null

  // حفظ حقول المراجعة (قريبة + بعيدة) على سجل الطالب
  async function saveReview() {
    if (!student) return
    setReviewSaving(true)
    try {
      const updated: DBStudent = { ...student, near_review: nearReview, far_review: farReview }
      await upsertStudent(updated)
      setStudent(updated)
      setReviewDirty(false)
      toast.success('تم حفظ حقول المراجعة')
    } catch (err) {
      console.error(err)
      toast.error('خطأ في حفظ حقول المراجعة')
    } finally {
      setReviewSaving(false)
    }
  }

  // Toggle exam day in batch schedule
  async function toggleExamDay(date: string, isCurrentlyExam: boolean) {
    if (!student) return
    try {
      if (isCurrentlyExam) {
        const isManualExam = scheduleMap.get(date) === 'exam'
        if (isManualExam) {
          // Manual exam → delete the schedule entry to revert to normal
          await deleteBatchScheduleDay(student.batch_id, date)
          setSchedule(prev => prev.filter(e => !(e.date === date)))
        } else {
          // Auto-generated exam → override with 'normal' to cancel it
          const entry: BatchScheduleEntry = {
            batch_id: student.batch_id,
            date,
            day_type: 'normal',
            notes: 'إلغاء اختبار تلقائي',
          }
          await upsertBatchScheduleDay(entry)
          setSchedule(prev => [...prev.filter(e => e.date !== date), entry])
        }
        toast.success('تم إلغاء يوم الاختبار — تم إعادة ترتيب الأوجه')
      } else {
        // First remove any 'normal' override if exists
        const existingType = scheduleMap.get(date)
        if (existingType === 'normal') {
          await deleteBatchScheduleDay(student.batch_id, date)
        }
        // Mark as exam day — positions shift forward
        const entry: BatchScheduleEntry = {
          batch_id: student.batch_id,
          date,
          day_type: 'exam',
          notes: 'اختبار يدوي',
        }
        await upsertBatchScheduleDay(entry)
        setSchedule(prev => [...prev.filter(e => e.date !== date), entry])
        toast.success('تم إضافة يوم اختبار — تم تحريك الأوجه للأمام')
      }
      setSelectedCell(null)
    } catch (err) {
      console.error(err)
      toast.error('خطأ في تعديل الجدول')
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="text-center space-y-3">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>جاري تحميل الخطة...</p>
      </div>
    </div>
  )

  if (!student || !plan) return (
    <div className="text-center py-20">
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>لا توجد خطة فعالة لهذا الطالب</p>
      <Link href="/followups" className="text-emerald-600 text-sm mt-2 inline-block hover:underline">← العودة للمتابعات</Link>
    </div>
  )

  return (
    <div className="space-y-5 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link href="/followups" className="text-xs text-emerald-600 hover:underline flex items-center gap-1 mb-2">
            <ArrowRight className="w-3 h-3" /> العودة للمتابعات
          </Link>
          <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <BookOpenCheck className="w-5 h-5 text-emerald-500" />
            خطة حفظ {student.name}
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            دفعة {student.batch_id} — من {formatHijri(plan.start_date)} إلى {formatHijri(plan.end_date)}
          </p>
        </div>
      </div>

      {/* Plan stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card-static p-3 text-center">
          <Target className="w-4 h-4 text-emerald-500 mx-auto mb-1" />
          <p className="font-bold font-mono text-lg" style={{ color: 'var(--text-primary)' }}>{plan.start_position}</p>
          <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>وجه البداية</p>
        </div>
        <div className="card-static p-3 text-center">
          <TrendingUp className="w-4 h-4 text-blue-500 mx-auto mb-1" />
          <p className="font-bold font-mono text-lg" style={{ color: 'var(--text-primary)' }}>{todayExpected}</p>
          <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>المفترض اليوم</p>
        </div>
        <div className="card-static p-3 text-center">
          <CalendarDays className="w-4 h-4 text-indigo-500 mx-auto mb-1" />
          <p className="font-bold font-mono text-lg" style={{ color: 'var(--text-primary)' }}>{currentActual ?? '—'}</p>
          <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>الفعلي الحالي</p>
        </div>
        <div className="card-static p-3 text-center">
          <div className={`w-4 h-4 rounded-full mx-auto mb-1 ${
            currentGap === null ? 'bg-gray-300' : currentGap >= 0 ? 'bg-green-500' : currentGap >= -5 ? 'bg-amber-500' : 'bg-red-500'
          }`} />
          <p className={`font-bold font-mono text-lg ${
            currentGap === null ? '' : currentGap >= 0 ? 'text-green-600' : currentGap >= -5 ? 'text-amber-600' : 'text-red-600'
          }`}>{currentGap !== null ? (currentGap > 0 ? `+${currentGap}` : currentGap) : '—'}</p>
          <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>الفجوة</p>
        </div>
      </div>

      {/* المراجعة القريبة والبعيدة */}
      <div className="card-static p-4 space-y-3">
        <div className="flex items-center gap-2">
          <RotateCw className="w-4 h-4 text-indigo-500" />
          <h3 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>المراجعة</h3>
          <span className="text-[10px] mr-auto" style={{ color: 'var(--text-muted)' }}>تُدخل يدوياً من المشرف — يمكن تحديثها أسبوعياً</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
              المراجعة القريبة <span className="text-[10px]">(آخر ٣ أشهر)</span>
            </label>
            <input
              value={nearReview}
              onChange={e => { setNearReview(e.target.value); setReviewDirty(true) }}
              placeholder="مثال: الأجزاء ٢٨-٣٠"
              className="w-full px-3 py-2 text-sm rounded-lg border"
              style={{ background: 'var(--bg-body)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
            />
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
              المراجعة البعيدة <span className="text-[10px]">(قبل ٣ أشهر)</span>
            </label>
            <input
              value={farReview}
              onChange={e => { setFarReview(e.target.value); setReviewDirty(true) }}
              placeholder="مثال: الأجزاء ١-١٥"
              className="w-full px-3 py-2 text-sm rounded-lg border"
              style={{ background: 'var(--bg-body)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
            />
          </div>
        </div>
        <button
          onClick={saveReview}
          disabled={!reviewDirty || reviewSaving}
          className="btn-primary btn-ripple px-4 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-50 flex items-center gap-1.5"
        >
          {reviewSaving ? <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-3 h-3" />}
          حفظ المراجعة
        </button>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 text-[10px]" style={{ color: 'var(--text-muted)' }}>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-500/20 border border-emerald-500/30 inline-block" /> حفظ عادي</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-500/20 border border-amber-500/30 inline-block" /> يوم اختبار (خ)</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-500/10 border border-gray-200/30 inline-block" /> عطلة</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-500 inline-block" /> منتظم</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500 inline-block" /> متأخر</span>
        <span className="border-r border-gray-300 pr-3 mr-1">اضغط على أي يوم لإضافة أو إلغاء اختبار — الأوجه تنتقل تلقائياً</span>
      </div>

      {/* Calendar Grid */}
      <div className="card-static overflow-x-auto">
        <table className="w-full text-xs min-w-[600px]">
          <thead>
            <tr className="border-b border-white/5">
              <th className="text-right px-2 py-2 font-semibold w-24" style={{ color: 'var(--text-muted)' }}>الأسبوع</th>
              {DAYS_AR_SHORT.map(d => (
                <th key={d} className="text-center px-1 py-2 font-semibold" style={{ color: d === 'جمعة' || d === 'سبت' ? 'var(--text-muted)' : 'var(--text-secondary)' }}>
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week, wi) => {
              // Week label from first real date in the week
              const firstRealDay = week.find(d => d.date)
              const weekLabel = firstRealDay ? toHijriShort(firstRealDay.date) : ''
              return (
                <tr key={wi} className="border-b border-white/5">
                  <td className="px-2 py-1.5 text-[10px]" style={{ color: 'var(--text-muted)' }}>{weekLabel}</td>
                  {week.map((day, di) => {
                    if (!day.date) return <td key={di} className="px-1 py-1.5" />

                    const isToday = day.date === today
                    const followup = followupByDate.get(day.date)
                    const hasActual = followup?.actual_position != null
                    const isAhead = hasActual && followup!.actual_position! >= day.expectedPosition
                    const isBehind = hasActual && followup!.actual_position! < day.expectedPosition
                    const isHoliday = day.type === 'friday' || day.type === 'saturday' || day.type === 'off'
                    const isExam = day.type === 'exam'
                    const isPast = day.date < today

                    const hijriDay = gregorianToHijri(day.date).day
                    const isAfterEnd = day.date > PROGRAM_END_DATE
                    const canToggle = !isHoliday && !isPast && !isAfterEnd
                    const isSelected = selectedCell === day.date
                    const hasNormalOverride = scheduleMap.get(day.date) === 'normal'

                    return (
                      <td key={di} className="px-0.5 py-0.5 relative">
                        <div
                          onClick={() => canToggle ? setSelectedCell(isSelected ? null : day.date) : undefined}
                          className={`rounded-lg p-1 text-center min-h-[50px] flex flex-col items-center justify-center transition-all border relative
                          ${canToggle ? 'cursor-pointer' : ''}
                          ${isSelected ? 'ring-2 ring-indigo-400 ring-offset-1 z-10' : ''}
                          ${isToday && !isSelected ? 'ring-2 ring-emerald-400 ring-offset-1' : ''}
                          ${isAfterEnd ? 'bg-gray-100 border-gray-200/30 opacity-40' : ''}
                          ${!isAfterEnd && isHoliday ? 'bg-gray-500/5 border-gray-200/20' : ''}
                          ${!isAfterEnd && isExam ? 'bg-amber-500/10 border-amber-500/20' : ''}
                          ${!isAfterEnd && !isHoliday && !isExam && isAhead ? 'bg-green-500/10 border-green-500/30' : ''}
                          ${!isAfterEnd && !isHoliday && !isExam && isBehind ? 'bg-red-500/10 border-red-500/30' : ''}
                          ${!isAfterEnd && !isHoliday && !isExam && !hasActual && isPast ? 'bg-gray-500/5 border-gray-200/20' : ''}
                          ${!isAfterEnd && !isHoliday && !isExam && !hasActual && !isPast ? 'bg-emerald-500/5 border-emerald-200/20' : ''}
                        `}>
                          {/* Hijri day number */}
                          <span className="absolute top-0.5 right-1 text-[8px] font-mono text-gray-400">{hijriDay}</span>
                          {isAfterEnd ? (
                            <span className="text-gray-300 text-[8px]">—</span>
                          ) : isHoliday ? (
                            <span className="text-gray-300 text-[9px]">—</span>
                          ) : isExam ? (
                            <span className="font-bold text-amber-600">خ</span>
                          ) : (
                            <>
                              <span className="font-mono font-bold text-[11px]" style={{ color: 'var(--text-primary)' }}>
                                {day.expectedPosition}
                              </span>
                              {hasActual && (
                                <span className={`text-[8px] font-mono font-bold ${isAhead ? 'text-green-600' : 'text-red-600'}`}>
                                  {followup!.actual_position}
                                </span>
                              )}
                            </>
                          )}
                        </div>
                        {/* Action popup */}
                        {isSelected && canToggle && (
                          <div className="absolute z-20 top-full mt-1 left-1/2 -translate-x-1/2 bg-white rounded-xl shadow-lg border border-gray-200 p-2 min-w-[140px] text-center">
                            <p className="text-[9px] text-gray-400 mb-1.5 font-medium">{hijriDay} — {toHijriShort(day.date)}</p>
                            {isExam ? (
                              <button
                                onClick={(e) => { e.stopPropagation(); toggleExamDay(day.date, true) }}
                                className="w-full text-[11px] px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-red-600 font-semibold hover:bg-red-100 transition-colors"
                              >
                                إلغاء الاختبار ✕
                              </button>
                            ) : hasNormalOverride ? (
                              <div className="space-y-1.5">
                                <button
                                  onClick={(e) => { e.stopPropagation(); /* restore: delete normal override */
                                    deleteBatchScheduleDay(student!.batch_id, day.date).then(() => {
                                      setSchedule(prev => prev.filter(e2 => e2.date !== day.date))
                                      setSelectedCell(null)
                                      toast.success('تم استعادة يوم الاختبار التلقائي')
                                    })
                                  }}
                                  className="w-full text-[11px] px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 font-semibold hover:bg-amber-100 transition-colors"
                                >
                                  استعادة الاختبار (خ)
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); toggleExamDay(day.date, false) }}
                                  className="w-full text-[11px] px-3 py-1.5 rounded-lg bg-amber-50/50 border border-amber-100 text-amber-600 hover:bg-amber-50 transition-colors"
                                >
                                  تعيين اختبار يدوي
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={(e) => { e.stopPropagation(); toggleExamDay(day.date, false) }}
                                className="w-full text-[11px] px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 font-semibold hover:bg-amber-100 transition-colors"
                              >
                                تعيين اختبار (خ)
                              </button>
                            )}
                            <p className="text-[8px] text-gray-400 mt-1">
                              {isExam ? 'ستعود الأوجه لمكانها' : 'ستتحرك الأوجه للأمام'}
                            </p>
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Summary */}
      <div className="card-static p-4">
        <h3 className="font-bold text-sm mb-2" style={{ color: 'var(--text-primary)' }}>ملخص الخطة</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div>
            <p style={{ color: 'var(--text-muted)' }}>عدد أيام العمل</p>
            <p className="font-mono font-bold" style={{ color: 'var(--text-primary)' }}>
              {dayDetails.filter(d => d.type === 'work' || d.type === 'intensive').length} يوم
            </p>
          </div>
          <div>
            <p style={{ color: 'var(--text-muted)' }}>أيام الاختبار</p>
            <p className="font-mono font-bold" style={{ color: 'var(--text-primary)' }}>
              {dayDetails.filter(d => d.type === 'exam').length} يوم
            </p>
          </div>
          <div>
            <p style={{ color: 'var(--text-muted)' }}>أيام العطل</p>
            <p className="font-mono font-bold" style={{ color: 'var(--text-primary)' }}>
              {dayDetails.filter(d => !d.isWorkDay).length} يوم
            </p>
          </div>
          <div>
            <p style={{ color: 'var(--text-muted)' }}>الوجه المتوقع نهاية الخطة</p>
            <p className="font-mono font-bold" style={{ color: 'var(--text-primary)' }}>
              {dayDetails.length > 0 ? dayDetails[dayDetails.length - 1].expectedPosition : '—'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
