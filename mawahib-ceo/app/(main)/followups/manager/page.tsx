'use client'
import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import {
  getStudents, getSupervisors, getQuranPlans, getDailyFollowups,
  getBatchSchedule, getFollowupEscalations, upsertBatchScheduleDay, deleteBatchScheduleDay,
  type DBStudent, type DBSupervisor,
} from '@/lib/db'
import {
  calculateExpectedPosition, getToday, getThisWeekRange,
  dateRange, ESCALATION_LEVELS,
  type QuranPlan, type DailyFollowup, type BatchScheduleEntry, type FollowupEscalation,
} from '@/lib/quran-followup'
import { formatHijri, getDayNameAr } from '@/lib/hijri'
import HijriDatePicker from '@/components/ui/HijriDatePicker'
import {
  Users, UserCheck, AlertTriangle, CheckCircle2, Clock, Shield,
  CalendarDays, Plus, X, Save, BookOpenCheck, ChevronDown,
  ClipboardCheck,
} from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import SupervisorTrackingAlert from '@/components/ui/SupervisorTrackingAlert'
import { computeAllSupervisorStatuses } from '@/lib/supervisor-tracking'

const DAY_TYPES: Record<string, { label: string; color: string }> = {
  normal: { label: 'عادي', color: 'bg-white/5' },
  holiday: { label: 'عطلة', color: 'bg-gray-200/50' },
  intensive: { label: 'مكثف', color: 'bg-blue-100' },
  educational_day: { label: 'يوم تربوي', color: 'bg-purple-100' },
  trip: { label: 'رحلة', color: 'bg-green-100' },
  exam: { label: 'اختبار', color: 'bg-amber-100' },
}

export default function ManagerFollowupPage() {
  const { profile } = useAuth()
  const isCeo = profile?.role === 'ceo'
  const myBatchId = profile?.batch_id ?? null
  const [selectedBatch, setSelectedBatch] = useState<number>(myBatchId ?? 46)

  const [students, setStudents] = useState<DBStudent[]>([])
  const [supervisors, setSupervisors] = useState<DBSupervisor[]>([])
  const [plans, setPlans] = useState<QuranPlan[]>([])
  const [followups, setFollowups] = useState<DailyFollowup[]>([])
  const [schedule, setSchedule] = useState<BatchScheduleEntry[]>([])
  const [escalations, setEscalations] = useState<FollowupEscalation[]>([])
  const [loading, setLoading] = useState(true)

  // Schedule management
  const [showScheduleManager, setShowScheduleManager] = useState(false)
  const [schedForm, setSchedForm] = useState({ date: getToday(), dayType: 'holiday', notes: '' })

  const today = getToday()
  const weekRange = getThisWeekRange()

  useEffect(() => {
    async function load() {
      try {
        const batchId = isCeo ? selectedBatch : (myBatchId ?? 46)
        const [s, sup, p, sch, esc] = await Promise.all([
          getStudents(),
          getSupervisors(),
          getQuranPlans(),
          getBatchSchedule(batchId),
          getFollowupEscalations({ batchId }),
        ])
        setStudents(s)
        setSupervisors(sup)
        setPlans(p)
        setSchedule(sch)
        setEscalations(esc)

        // Load this week's followups
        const f = await getDailyFollowups({ dateFrom: weekRange.start, dateTo: weekRange.end })
        setFollowups(f)
      } catch (err) {
        console.error(err)
        toast.error('خطأ في تحميل بيانات المدير')
      } finally {
        setLoading(false)
      }
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBatch])

  const batchId = isCeo ? selectedBatch : (myBatchId ?? 46)
  const batchStudents = students.filter(s => s.batch_id === batchId)
  const batchSupervisors = supervisors.filter(s => s.batch_id === batchId)

  // حالة المتابعة الأسبوعية لمشرفي الدفعة
  const supervisorStatuses = useMemo(
    () => computeAllSupervisorStatuses(batchSupervisors, batchStudents.filter(s => s.status === 'active' || !s.status)),
    [batchSupervisors, batchStudents]
  )

  // Schedule map
  const scheduleMap = useMemo(() => {
    const m = new Map<string, string>()
    schedule.forEach(e => m.set(e.date, e.day_type))
    return m
  }, [schedule])

  // Plan map
  const planMap = useMemo(() => {
    const m = new Map<string, QuranPlan>()
    plans.forEach(p => m.set(p.student_id, p))
    return m
  }, [plans])

  // This week's working days (Sun-Thu, excluding holidays)
  const weekDays = useMemo(() => {
    return dateRange(weekRange.start, weekRange.end).filter(d => {
      const dow = new Date(d + 'T12:00:00').getDay()
      return dow !== 5 && dow !== 6
    })
  }, [weekRange])

  // Supervisor compliance: how many of their students have followups this week
  const supervisorStats = useMemo(() => {
    return batchSupervisors.map(sup => {
      const supStudents = batchStudents.filter(s => s.supervisor_id === sup.id)
      const studentsWithPlan = supStudents.filter(s => planMap.has(s.id))
      const totalExpected = studentsWithPlan.length * weekDays.filter(d => d <= today).length
      const totalRecorded = followups.filter(f =>
        supStudents.some(s => s.id === f.student_id) &&
        f.actual_position != null
      ).length

      const compliance = totalExpected > 0 ? Math.round((totalRecorded / totalExpected) * 100) : 0

      return {
        supervisor: sup,
        studentCount: supStudents.length,
        withPlan: studentsWithPlan.length,
        totalExpected,
        totalRecorded,
        compliance,
      }
    }).sort((a, b) => b.compliance - a.compliance)
  }, [batchSupervisors, batchStudents, planMap, followups, weekDays, today])

  // Students with delays
  const delayedStudents = useMemo(() => {
    return batchStudents
      .map(student => {
        const plan = planMap.get(student.id)
        if (!plan) return null
        const expected = calculateExpectedPosition(
          plan.start_position, plan.start_date, today, plan.daily_rate, scheduleMap,
        ).position
        // Get latest followup
        const studentFollowups = followups.filter(f => f.student_id === student.id && f.actual_position != null)
        const latest = studentFollowups.sort((a, b) => b.followup_date.localeCompare(a.followup_date))[0]
        const actual = latest?.actual_position ?? null
        const gap = actual !== null ? actual - expected : null
        return { student, expected, actual, gap }
      })
      .filter((s): s is NonNullable<typeof s> => s !== null && s.gap !== null && s.gap < -5)
      .sort((a, b) => (a.gap ?? 0) - (b.gap ?? 0))
  }, [batchStudents, planMap, today, scheduleMap, followups])

  // Pending escalations
  const pendingEscalations = escalations.filter(e => e.status === 'pending' || e.status === 'in_progress')

  // Add schedule day
  async function addScheduleDay() {
    try {
      await upsertBatchScheduleDay({
        batch_id: batchId,
        date: schedForm.date,
        day_type: schedForm.dayType as BatchScheduleEntry['day_type'],
        notes: schedForm.notes,
      })
      const updated = await getBatchSchedule(batchId)
      setSchedule(updated)
      toast.success(`تم إضافة ${DAY_TYPES[schedForm.dayType]?.label || schedForm.dayType} ليوم ${schedForm.date}`)
      setSchedForm({ date: getToday(), dayType: 'holiday', notes: '' })
    } catch (err) {
      console.error(err)
      toast.error('خطأ في إضافة اليوم')
    }
  }

  async function removeScheduleDay(date: string) {
    try {
      await deleteBatchScheduleDay(batchId, date)
      setSchedule(prev => prev.filter(s => !(s.batch_id === batchId && s.date === date)))
      toast.success('تم الحذف')
    } catch (err) {
      console.error(err)
      toast.error('خطأ')
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="text-center space-y-3">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>جاري تحميل لوحة المدير...</p>
      </div>
    </div>
  )

  return (
    <div className="space-y-5 animate-fade-in-up">
      {/* تنبيه المتابعة الأسبوعية — يظهر تلقائياً عند تأخر المشرفين */}
      <SupervisorTrackingAlert
        statuses={supervisorStatuses}
        title="المتابعة الأسبوعية — مشرفو الدفعة"
        alertsOnly
        collapsible
      />

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="min-w-0">
          <div className="eyebrow-pill mb-3">
            <span className="eyebrow-dot" />
            إشراف المتابعات
          </div>
          <h1 className="display-h1 m-0 flex items-center gap-3" style={{ color: 'var(--text-primary)' }}>
            <Shield className="w-7 h-7" style={{ color: 'var(--accent-teal)' }} />
            لوحة إشراف المتابعات
          </h1>
          <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>
            دفعة {batchId} — أسبوع {formatHijri(weekRange.start)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isCeo && (
            <select
              value={selectedBatch}
              onChange={e => setSelectedBatch(Number(e.target.value))}
              className="px-3 py-2 text-sm border border-gray-200 rounded-xl"
            >
              {[42, 44, 46, 48].map(b => (
                <option key={b} value={b}>دفعة {b}</option>
              ))}
            </select>
          )}
          <Link href="/followups"
            className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 shadow-md hover:shadow-lg"
            style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}>
            <ClipboardCheck className="w-5 h-5" />
            متابعة الطلاب
          </Link>
        </div>
      </div>

      {/* ─── Supervisor Compliance ─── */}
      <div className="card-static overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/5">
          <UserCheck className="w-4 h-4 text-emerald-500" />
          <h2 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>التزام المشرفين — هذا الأسبوع</h2>
        </div>
        <div className="p-5 space-y-3">
          {supervisorStats.map(({ supervisor, studentCount, withPlan, totalExpected, totalRecorded, compliance }) => (
            <div key={supervisor.id} className="flex items-center gap-4 p-3 rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,0.02)' }}>
              {/* Compliance circle */}
              <div className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold font-mono border-2 ${
                compliance >= 80 ? 'border-green-400 text-green-600' :
                compliance >= 50 ? 'border-amber-400 text-amber-600' :
                'border-red-400 text-red-600'
              }`}>
                {compliance}%
              </div>
              <div className="flex-1">
                <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{supervisor.name}</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {totalRecorded}/{totalExpected} متابعة — {withPlan}/{studentCount} طالب لديهم خطة
                </p>
              </div>
              <div className="w-24 h-2 rounded-full bg-gray-200/20 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    compliance >= 80 ? 'bg-green-500' : compliance >= 50 ? 'bg-amber-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${compliance}%` }}
                />
              </div>
            </div>
          ))}
          {supervisorStats.length === 0 && (
            <p className="text-sm text-center py-4" style={{ color: 'var(--text-muted)' }}>لا يوجد مشرفون لهذه الدفعة</p>
          )}
        </div>
      </div>

      {/* ─── Delayed Students ─── */}
      {delayedStudents.length > 0 && (
        <div className="card-static overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-white/5">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <h2 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>طلاب متأخرون (أكثر من ٥ أوجه)</h2>
          </div>
          <div className="divide-y divide-white/5">
            {delayedStudents.map(({ student, expected, actual, gap }) => (
              <div key={student.id} className="flex items-center gap-3 px-5 py-3">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                <div className="flex-1">
                  <p className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>{student.name}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    المفترض: <span className="font-mono">{expected}</span> — الفعلي: <span className="font-mono">{actual}</span>
                  </p>
                </div>
                <span className="text-sm font-bold font-mono text-red-500">{gap} وجه</span>
                <Link
                  href={`/followups/plan/${student.id}`}
                  className="text-[10px] text-emerald-600 hover:underline"
                >
                  الخطة
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Escalations ─── */}
      {pendingEscalations.length > 0 && (
        <div className="card-static overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-white/5">
            <Shield className="w-4 h-4 text-orange-500" />
            <h2 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>تصعيدات معلّقة</h2>
          </div>
          <div className="divide-y divide-white/5">
            {pendingEscalations.map(esc => {
              const levelInfo = ESCALATION_LEVELS[esc.level]
              return (
                <div key={esc.id} className="px-5 py-3 flex items-center gap-3">
                  <span className={`text-xs font-bold ${levelInfo?.color || 'text-gray-500'}`}>
                    {levelInfo?.label || esc.level}
                  </span>
                  <div className="flex-1">
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{esc.student_name}</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      أسبوع {esc.weeks_delayed} — {levelInfo?.action}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    esc.status === 'pending' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {esc.status === 'pending' ? 'معلّق' : 'قيد المعالجة'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ─── Batch Schedule Manager ─── */}
      <div className="card-static overflow-hidden">
        <button
          onClick={() => setShowScheduleManager(!showScheduleManager)}
          className="w-full flex items-center justify-between px-5 py-4 border-b border-white/5"
        >
          <div className="flex items-center gap-3">
            <CalendarDays className="w-4 h-4 text-indigo-500" />
            <h2 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>جدول الدفعة (عطل، برامج، مكثفات)</h2>
          </div>
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showScheduleManager ? 'rotate-180' : ''}`} />
        </button>
        {showScheduleManager && (
          <div className="p-5 space-y-4">
            {/* Add day */}
            <div className="flex items-end gap-2 flex-wrap">
              <HijriDatePicker value={schedForm.date} onChange={v => setSchedForm({ ...schedForm, date: v })} label="التاريخ" compact />
              <div>
                <label className="block text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>النوع</label>
                <select value={schedForm.dayType} onChange={e => setSchedForm({ ...schedForm, dayType: e.target.value })}
                  className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg">
                  {Object.entries(DAY_TYPES).filter(([k]) => k !== 'normal').map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>ملاحظة</label>
                <input value={schedForm.notes} onChange={e => setSchedForm({ ...schedForm, notes: e.target.value })}
                  placeholder="اختياري" className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg w-36" />
              </div>
              <button onClick={addScheduleDay}
                className="btn-primary btn-ripple px-3 py-1.5 text-xs font-medium text-white rounded-lg flex items-center gap-1">
                <Plus className="w-3 h-3" /> إضافة
              </button>
            </div>

            {/* Current schedule entries */}
            <div className="space-y-1.5">
              {schedule
                .filter(s => s.day_type !== 'normal')
                .sort((a, b) => a.date.localeCompare(b.date))
                .map(entry => (
                  <div key={`${entry.batch_id}-${entry.date}`} className="flex items-center gap-2 text-xs">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${DAY_TYPES[entry.day_type]?.color || 'bg-gray-100'}`}>
                      {DAY_TYPES[entry.day_type]?.label || entry.day_type}
                    </span>
                    <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>{entry.date}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{getDayNameAr(entry.date)}</span>
                    {entry.notes && <span style={{ color: 'var(--text-muted)' }}>— {entry.notes}</span>}
                    <button onClick={() => removeScheduleDay(entry.date)} className="text-red-400 hover:text-red-600 mr-auto">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              {schedule.filter(s => s.day_type !== 'normal').length === 0 && (
                <p className="text-xs py-2" style={{ color: 'var(--text-muted)' }}>لم يتم تحديد أيام خاصة بعد</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
