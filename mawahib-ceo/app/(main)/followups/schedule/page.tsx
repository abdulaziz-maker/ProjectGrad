'use client'
import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { getStudents, getSupervisors, getDailyFollowups, type DBStudent, type DBSupervisor } from '@/lib/db'
import { getFollowupSchedule, addScheduleEntry, deleteScheduleEntry, toggleRepeating } from '@/lib/followup-schedule/db'
import { FOLLOWUP_WEEK_DAYS, dayName, type FollowupScheduleEntry } from '@/lib/followup-schedule/types'
import { getFollowupWeekRange } from '@/lib/quran-followup'
import { formatHijri, toHijriShort } from '@/lib/hijri'
import PageHeader from '@/components/ui/PageHeader'
import {
  CalendarRange, Plus, X, Pin, Repeat, CheckCircle2, ChevronRight, ChevronLeft,
  Users, Sparkles, AlertCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'

export default function SchedulePage() {
  const { profile } = useAuth()
  const isCeo = profile?.role === 'ceo'
  const isManager = profile?.role === 'batch_manager'
  const isSupervisor = profile?.role === 'supervisor' || profile?.role === 'teacher'

  const [students, setStudents] = useState<DBStudent[]>([])
  const [supervisors, setSupervisors] = useState<DBSupervisor[]>([])
  const [schedule, setSchedule] = useState<FollowupScheduleEntry[]>([])
  const [followupDates, setFollowupDates] = useState<Set<string>>(new Set()) // YYYY-MM-DD per student
  const [loading, setLoading] = useState(true)
  const [addingDay, setAddingDay] = useState<number | null>(null)
  const [selectedStudent, setSelectedStudent] = useState<string>('')
  const [isRepeating, setIsRepeating] = useState(true)

  // المدير يختار أي مشرف يعرض جدوله
  const [viewSupervisorId, setViewSupervisorId] = useState<string | null>(null)
  const [weekOffset, setWeekOffset] = useState(0) // 0 = هذا الأسبوع، -1 = السابق، +1 = القادم

  // اعرف الـsupervisor.id الخاص بالمشرف الحالي
  const mySupervisorId = useMemo(() => {
    if (!isSupervisor || !profile?.id) return null
    return supervisors.find(s => s.user_id === profile.id)?.id ?? null
  }, [isSupervisor, profile?.id, supervisors])

  const activeSupervisorId = isSupervisor ? mySupervisorId : viewSupervisorId

  // نطاق الأسبوع المعروض
  const weekRange = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + weekOffset * 7)
    return getFollowupWeekRange(d)
  }, [weekOffset])

  // الأيام الفعلية للأسبوع المعروض (تواريخ Sat→Thu)
  const weekDates = useMemo(() => {
    const out: Array<{ dow: number; date: string; isToday: boolean }> = []
    const sat = new Date(weekRange.start + 'T12:00:00')
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    for (let i = 0; i < 6; i++) {
      const d = new Date(sat)
      d.setDate(sat.getDate() + i)
      const yyyy = d.getFullYear()
      const mm = String(d.getMonth() + 1).padStart(2, '0')
      const dd = String(d.getDate()).padStart(2, '0')
      const dateStr = `${yyyy}-${mm}-${dd}`
      const dC = new Date(d); dC.setHours(0, 0, 0, 0)
      out.push({ dow: d.getDay(), date: dateStr, isToday: dC.getTime() === today.getTime() })
    }
    return out
  }, [weekRange.start])

  useEffect(() => {
    async function load() {
      try {
        const [s, sups] = await Promise.all([getStudents(), getSupervisors()])
        setStudents(s)
        setSupervisors(sups)

        // المدير الافتراضي يفتح أول مشرف لطلابه
        if ((isCeo || isManager) && !viewSupervisorId && sups.length > 0) {
          const candidate = isManager
            ? sups.find(sv => sv.batch_id === profile?.batch_id) ?? sups[0]
            : sups[0]
          setViewSupervisorId(candidate.id)
        }
      } catch (err) {
        console.error(err)
        toast.error('خطأ في تحميل البيانات')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  // أعد تحميل الجدول والمتابعات عند تغيّر المشرف أو الأسبوع
  useEffect(() => {
    if (!activeSupervisorId) return
    Promise.all([
      getFollowupSchedule(activeSupervisorId),
      getDailyFollowups({ dateFrom: weekRange.start, dateTo: weekRange.end }),
    ]).then(([sch, fups]) => {
      setSchedule(sch)
      const set = new Set<string>()
      for (const f of fups) {
        if (f.actual_position != null) set.add(`${f.student_id}:${f.followup_date}`)
      }
      setFollowupDates(set)
    }).catch(err => {
      console.error(err)
      toast.error('خطأ في تحميل الجدول')
    })
  }, [activeSupervisorId, weekRange.start, weekRange.end])

  // طلاب المشرف المعروض
  const supStudents = useMemo(() => {
    if (!activeSupervisorId) return []
    return students.filter(s => s.supervisor_id === activeSupervisorId && (s.status === 'active' || !s.status))
  }, [students, activeSupervisorId])

  // الجدول يُجمَّع حسب اليوم
  const scheduleByDay = useMemo(() => {
    const m = new Map<number, FollowupScheduleEntry[]>()
    for (const e of schedule) {
      // نستثني entries مرتبطة بأسبوع آخر غير الأسبوع المعروض
      if (!e.is_repeating && e.week_start && e.week_start !== weekRange.start) continue
      const list = m.get(e.day_of_week) ?? []
      list.push(e)
      m.set(e.day_of_week, list)
    }
    return m
  }, [schedule, weekRange.start])

  // إحصائية: كم تابع المشرف من طلابه هذا الأسبوع
  const followedCount = useMemo(() => {
    const studentIds = new Set<string>()
    for (const f of followupDates) {
      const [sid] = f.split(':')
      studentIds.add(sid)
    }
    return supStudents.filter(s => studentIds.has(s.id)).length
  }, [followupDates, supStudents])

  // الطلاب غير المضافين لليوم المختار
  const availableStudents = useMemo(() => {
    if (addingDay === null) return []
    const usedIds = new Set((scheduleByDay.get(addingDay) ?? []).map(e => e.student_id))
    return supStudents.filter(s => !usedIds.has(s.id))
  }, [addingDay, scheduleByDay, supStudents])

  async function handleAdd() {
    if (addingDay === null || !selectedStudent || !activeSupervisorId) return
    try {
      await addScheduleEntry({
        supervisor_id: activeSupervisorId,
        student_id: selectedStudent,
        day_of_week: addingDay,
        is_repeating: isRepeating,
        week_start: isRepeating ? null : weekRange.start,
      })
      setSchedule(await getFollowupSchedule(activeSupervisorId))
      toast.success(isRepeating ? 'تم إضافة الطالب (متكرر أسبوعياً)' : 'تم إضافة الطالب لهذا الأسبوع')
      setAddingDay(null)
      setSelectedStudent('')
      setIsRepeating(true)
    } catch (err) {
      console.error(err)
      toast.error('خطأ في الإضافة')
    }
  }

  async function handleDelete(entry: FollowupScheduleEntry) {
    if (!entry.id || !activeSupervisorId) return
    if (!confirm('هل تريد حذف هذا الموعد من الجدول؟')) return
    try {
      await deleteScheduleEntry(entry.id, activeSupervisorId)
      setSchedule(prev => prev.filter(e => e.id !== entry.id))
      toast.success('تم الحذف')
    } catch (err) {
      console.error(err)
      toast.error('خطأ في الحذف')
    }
  }

  async function handleToggleRepeat(entry: FollowupScheduleEntry) {
    if (!entry.id || !activeSupervisorId) return
    try {
      await toggleRepeating(entry.id, !entry.is_repeating, activeSupervisorId)
      setSchedule(await getFollowupSchedule(activeSupervisorId))
    } catch (err) {
      console.error(err)
      toast.error('خطأ في التحديث')
    }
  }

  // رابط للأسبوع: اعرض اسم الأسبوع بالهجري
  const weekLabel = `${toHijriShort(weekRange.start)} → ${toHijriShort(weekRange.end)}`

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>جاري التحميل...</p>
        </div>
      </div>
    )
  }

  if (!activeSupervisorId) {
    return (
      <div className="space-y-5 animate-fade-in-up">
        <PageHeader
          eyebrow="جدولة المتابعات"
          title="جدول الأسبوع"
          subtitle="نظّم متابعاتك لطلابك على مدار الأسبوع — السبت إلى الخميس"
        />
        <div className="card-static p-6 text-center" style={{ color: 'var(--text-muted)' }}>
          {isCeo || isManager ? 'اختر مشرفاً لعرض جدوله' : 'لم يُحدَّد ملف المشرف لحسابك بعد'}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-fade-in-up">
      <PageHeader
        eyebrow="جدولة المتابعات الأسبوعية"
        title="جدول الأسبوع"
        subtitle={`${weekLabel} — السبت إلى الخميس`}
        actions={
          <Link
            href="/followups"
            className="px-3 py-2 text-sm font-semibold rounded-xl border transition-colors"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border-soft)', color: 'var(--text-secondary)' }}
          >
            ← العودة للمتابعات
          </Link>
        }
      />

      {/* اختيار المشرف للمدراء */}
      {(isCeo || isManager) && (
        <div className="card-static p-3">
          <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>
            عرض جدول المشرف:
          </label>
          <select
            value={viewSupervisorId ?? ''}
            onChange={e => setViewSupervisorId(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg border"
            style={{ background: 'var(--bg-body)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
          >
            {supervisors
              .filter(s => isCeo || s.batch_id === profile?.batch_id)
              .map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.batch_id ? `— دفعة ${s.batch_id}` : ''}
                </option>
              ))
            }
          </select>
        </div>
      )}

      {/* شريط التنقل الأسبوعي */}
      <div className="card-static p-3 flex items-center justify-between gap-3">
        <button
          onClick={() => setWeekOffset(o => o - 1)}
          className="p-2 rounded-lg hover:bg-black/5 transition-colors"
          title="الأسبوع السابق"
        >
          <ChevronRight className="w-5 h-5" style={{ color: 'var(--text-muted)' }} />
        </button>
        <div className="text-center flex-1">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>الأسبوع المعروض</p>
          <p className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>{weekLabel}</p>
          {weekOffset === 0 && (
            <span className="inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full font-semibold"
              style={{ background: 'rgba(90,143,103,0.12)', color: '#3F6E4B', border: '1px solid rgba(90,143,103,0.30)' }}>
              ✓ الأسبوع الحالي
            </span>
          )}
        </div>
        <button
          onClick={() => setWeekOffset(o => o + 1)}
          className="p-2 rounded-lg hover:bg-black/5 transition-colors"
          title="الأسبوع القادم"
        >
          <ChevronLeft className="w-5 h-5" style={{ color: 'var(--text-muted)' }} />
        </button>
        {weekOffset !== 0 && (
          <button
            onClick={() => setWeekOffset(0)}
            className="text-xs px-3 py-1.5 rounded-lg font-semibold"
            style={{ background: 'rgba(53,107,110,0.10)', color: 'var(--accent-teal)' }}
          >
            الآن
          </button>
        )}
      </div>

      {/* إحصائية المتابعات */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card-static p-4 text-center">
          <Users className="w-5 h-5 text-emerald-600 mx-auto mb-1.5" />
          <p className="font-mono font-bold text-2xl" style={{ color: 'var(--text-primary)' }}>{supStudents.length}</p>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>إجمالي الطلاب</p>
        </div>
        <div className="card-static p-4 text-center">
          <CheckCircle2 className="w-5 h-5 text-green-600 mx-auto mb-1.5" />
          <p className="font-mono font-bold text-2xl" style={{ color: 'var(--text-primary)' }}>{followedCount}</p>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>تمت متابعتهم</p>
        </div>
        <div className="card-static p-4 text-center">
          <AlertCircle className="w-5 h-5 text-amber-600 mx-auto mb-1.5" />
          <p className="font-mono font-bold text-2xl" style={{ color: 'var(--text-primary)' }}>{supStudents.length - followedCount}</p>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>متبقّي</p>
        </div>
      </div>

      {/* الجدول الأسبوعي */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {FOLLOWUP_WEEK_DAYS.map((dow, idx) => {
          const dayInfo = weekDates[idx]
          const entries = scheduleByDay.get(dow) ?? []
          const isToday = dayInfo?.isToday

          return (
            <div
              key={dow}
              className={`card-static p-4 transition-all ${isToday ? 'ring-2 ring-emerald-400/40' : ''}`}
              style={isToday ? { background: 'linear-gradient(180deg, rgba(90,143,103,0.06), var(--bg-card))' } : {}}
            >
              {/* رأس اليوم */}
              <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-black/5">
                <div>
                  <h3 className="font-bold text-base flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                    <CalendarRange className="w-4 h-4" style={{ color: isToday ? '#3F6E4B' : 'var(--accent-teal)' }} />
                    {dayName(dow)}
                    {isToday && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded font-bold"
                        style={{ background: '#3F6E4B', color: '#fff', letterSpacing: '0.04em' }}>
                        اليوم
                      </span>
                    )}
                  </h3>
                  <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {dayInfo ? toHijriShort(dayInfo.date) : ''}
                  </p>
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                  {entries.length}
                </span>
              </div>

              {/* الطلاب المجدولون */}
              <div className="space-y-1.5">
                {entries.map(entry => {
                  const student = students.find(s => s.id === entry.student_id)
                  if (!student) return null
                  const wasFollowed = dayInfo && followupDates.has(`${student.id}:${dayInfo.date}`)
                  return (
                    <div
                      key={entry.id}
                      className="flex items-center gap-2 p-2 rounded-lg group transition-all"
                      style={{
                        background: wasFollowed ? 'rgba(90,143,103,0.08)' : 'var(--bg-elevated)',
                        border: wasFollowed ? '1px solid rgba(90,143,103,0.30)' : '1px solid transparent',
                      }}
                    >
                      {wasFollowed ? (
                        <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                      ) : (
                        <span className="w-4 h-4 rounded-full border-2 flex-shrink-0"
                          style={{ borderColor: 'var(--border-color)' }} />
                      )}
                      <span className="text-xs font-medium flex-1 truncate" style={{ color: 'var(--text-primary)' }}>
                        {student.name}
                      </span>
                      <button
                        onClick={() => handleToggleRepeat(entry)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        title={entry.is_repeating ? 'متكرر — اضغط لجعله مرة واحدة' : 'مرة واحدة — اضغط للتكرار'}
                      >
                        {entry.is_repeating ? (
                          <Repeat className="w-3.5 h-3.5" style={{ color: 'var(--accent-warm)' }} />
                        ) : (
                          <Pin className="w-3.5 h-3.5" style={{ color: 'var(--accent-teal)' }} />
                        )}
                      </button>
                      {!isSupervisor || activeSupervisorId === mySupervisorId ? (
                        <button
                          onClick={() => handleDelete(entry)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-700"
                          title="حذف"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      ) : null}
                    </div>
                  )
                })}

                {entries.length === 0 && (
                  <p className="text-center text-[11px] py-3" style={{ color: 'var(--text-muted)' }}>
                    لا متابعات
                  </p>
                )}

                {/* زر إضافة */}
                {(activeSupervisorId === mySupervisorId || !isSupervisor) && (
                  <button
                    onClick={() => { setAddingDay(dow); setSelectedStudent(''); setIsRepeating(true) }}
                    className="w-full mt-2 py-2 text-xs font-semibold rounded-lg border-2 border-dashed transition-colors flex items-center justify-center gap-1.5"
                    style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}
                  >
                    <Plus className="w-3.5 h-3.5" /> إضافة طالب
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* تنبيه استخدام */}
      {weekOffset === 0 && supStudents.length > 0 && followedCount < supStudents.length && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-xl text-sm font-medium"
          style={{ background: 'rgba(192,138,72,0.10)', border: '1px solid rgba(192,138,72,0.30)', color: '#8a5e1a' }}>
          <Sparkles className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>
            <strong>تذكير:</strong> أكمل متابعة <strong>{supStudents.length - followedCount} طالب</strong> قبل نهاية الخميس ٩م
            لتجنّب احتساب الإخلال. الجدول يساعدك على تنظيم وقتك فقط — يمكنك متابعة أي طالب في أي يوم بين السبت والخميس.
          </span>
        </div>
      )}

      {/* مودال إضافة */}
      {addingDay !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in-up">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>
                إضافة طالب يوم {dayName(addingDay)}
              </h3>
              <button onClick={() => setAddingDay(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>
                الطالب
              </label>
              <select
                value={selectedStudent}
                onChange={e => setSelectedStudent(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border"
                style={{ background: 'var(--bg-body)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
              >
                <option value="">— اختر طالباً —</option>
                {availableStudents.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              {availableStudents.length === 0 && (
                <p className="text-[11px] mt-1.5" style={{ color: 'var(--text-muted)' }}>
                  جميع الطلاب مُضافون لهذا اليوم
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>
                نوع الجدولة
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setIsRepeating(true)}
                  className={`p-3 rounded-lg border-2 text-xs font-semibold flex flex-col items-center gap-1 transition-all ${
                    isRepeating ? 'ring-2 ring-amber-400' : ''
                  }`}
                  style={{
                    background: isRepeating ? 'rgba(192,138,72,0.10)' : 'var(--bg-elevated)',
                    borderColor: isRepeating ? 'rgba(192,138,72,0.40)' : 'transparent',
                    color: isRepeating ? '#8a5e1a' : 'var(--text-secondary)',
                  }}
                >
                  <Repeat className="w-4 h-4" />
                  أسبوعي متكرر
                  <span className="text-[9px] font-normal opacity-70">يتكرر كل أسبوع</span>
                </button>
                <button
                  onClick={() => setIsRepeating(false)}
                  className={`p-3 rounded-lg border-2 text-xs font-semibold flex flex-col items-center gap-1 transition-all ${
                    !isRepeating ? 'ring-2 ring-teal-400' : ''
                  }`}
                  style={{
                    background: !isRepeating ? 'rgba(53,107,110,0.10)' : 'var(--bg-elevated)',
                    borderColor: !isRepeating ? 'rgba(53,107,110,0.40)' : 'transparent',
                    color: !isRepeating ? 'var(--accent-teal)' : 'var(--text-secondary)',
                  }}
                >
                  <Pin className="w-4 h-4" />
                  هذا الأسبوع فقط
                  <span className="text-[9px] font-normal opacity-70">{toHijriShort(weekRange.start)}</span>
                </button>
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => setAddingDay(null)}
                className="px-4 py-2 text-sm rounded-lg font-semibold"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
              >
                إلغاء
              </button>
              <button
                onClick={handleAdd}
                disabled={!selectedStudent}
                className="btn-primary btn-ripple px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
              >
                إضافة
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
