'use client'
/**
 * /timeline/approvals — CEO / records_officer pending-approval queue.
 *
 * Lists every status='proposed' activity for the active calendar with:
 *   - title, batch, proposer, type, dates, cost breakdown
 *   - Approve / Reject-with-reason buttons (+ notification + audit log)
 *   - Optional "edit then approve" opens the full modal
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  CheckCircle2,
  XCircle,
  Edit3,
  Clock,
  ChevronLeft,
  Loader2,
  ShieldAlert,
  DollarSign,
  Users,
  Calendar,
} from 'lucide-react'
import { TIMELINE_ENABLED } from '@/lib/timeline/flag'
import {
  getActiveCalendar,
  getActivityTypes,
  getBatchesForTimeline,
  getProposedActivities,
  getCostsForActivities,
  getDays,
  approveActivity,
  rejectActivity,
  writeAuditEntry,
  createTimelineNotification,
  type TimelineBatchRef,
} from '@/lib/timeline/db'
import {
  buildDayMap,
  formatSAR,
} from '@/lib/timeline/activity-helpers'
import { computeActivityTotal } from '@/lib/timeline/finance'
import ActivityEditModal from '@/components/timeline/ActivityEditModal'
import { useAuth } from '@/contexts/AuthContext'
import {
  HIJRI_MONTHS_AR,
  parseHijriIso,
} from '@/lib/timeline/hijri'
import type {
  TimelineActivity,
  TimelineActivityCost,
  TimelineActivityType,
  TimelineCalendar,
  TimelineDay,
} from '@/types/timeline'

export default function ApprovalsPage() {
  const router = useRouter()
  const { profile, loading: authLoading } = useAuth()
  const role = profile?.role ?? null
  const userId = profile?.id ?? null
  const isCrossBatch = role === 'ceo' || role === 'records_officer'

  const [calendar, setCalendar] = useState<TimelineCalendar | null>(null)
  const [days, setDays] = useState<TimelineDay[]>([])
  const [types, setTypes] = useState<TimelineActivityType[]>([])
  const [batches, setBatches] = useState<TimelineBatchRef[]>([])
  const [activities, setActivities] = useState<TimelineActivity[]>([])
  const [costs, setCosts] = useState<TimelineActivityCost[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  // Edit-then-approve modal state
  const [editing, setEditing] = useState<TimelineActivity | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  // Feature flag + role gate
  useEffect(() => {
    if (!TIMELINE_ENABLED) router.replace('/dashboard')
  }, [router])

  useEffect(() => {
    if (!TIMELINE_ENABLED || authLoading) return
    if (!isCrossBatch) {
      // Non-CEO: show read-only permission-blocked state
      setLoading(false)
      return
    }
    let alive = true
    ;(async () => {
      try {
        const [cal, tps, bs] = await Promise.all([
          getActiveCalendar(),
          getActivityTypes(),
          getBatchesForTimeline(),
        ])
        if (!alive) return
        setCalendar(cal)
        setTypes(tps)
        setBatches(bs)
        if (cal) {
          const [acts, ds] = await Promise.all([
            getProposedActivities(cal.id),
            getDays(cal.id),
          ])
          if (!alive) return
          setActivities(acts)
          setDays(ds)
          if (acts.length > 0) {
            const cs = await getCostsForActivities(acts.map((a) => a.id))
            if (!alive) return
            setCosts(cs)
          }
        }
      } catch (err) {
        console.error(err)
        toast.error('تعذّر تحميل طلبات الاعتماد')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [authLoading, isCrossBatch])

  const typesById = useMemo(() => new Map(types.map((t) => [t.id, t])), [types])
  const batchesById = useMemo(() => new Map(batches.map((b) => [b.id, b])), [batches])
  const costsByActivity = useMemo(() => {
    const m = new Map<string, TimelineActivityCost[]>()
    for (const c of costs) {
      const arr = m.get(c.activity_id)
      if (arr) arr.push(c)
      else m.set(c.activity_id, [c])
    }
    return m
  }, [costs])
  const daysMap = useMemo(() => buildDayMap(days), [days])

  const handleApprove = useCallback(
    async (activity: TimelineActivity) => {
      if (!userId) return
      setBusyId(activity.id)
      try {
        await approveActivity(activity.id, userId)
        await writeAuditEntry({
          activityId: activity.id,
          action: 'approved',
          performedBy: userId,
          changes: { title: activity.title },
        })
        if (activity.proposed_by && activity.proposed_by !== userId) {
          await createTimelineNotification({
            type: 'timeline_approved',
            title: 'تم اعتماد نشاطك',
            body: `اعتُمِد النشاط "${activity.title}".`,
            severity: 'success',
            targetUserId: activity.proposed_by,
            data: { activity_id: activity.id },
          })
        }
        setActivities((prev) => prev.filter((a) => a.id !== activity.id))
        toast.success('تم الاعتماد')
      } catch (err) {
        console.error(err)
        toast.error('تعذّر الاعتماد')
      } finally {
        setBusyId(null)
      }
    },
    [userId],
  )

  const handleReject = useCallback(
    async (activity: TimelineActivity) => {
      if (!userId) return
      const reason = prompt('سبب الرفض (اختياري — يظهر للمقترح):')
      setBusyId(activity.id)
      try {
        await rejectActivity(activity.id)
        await writeAuditEntry({
          activityId: activity.id,
          action: 'rejected',
          performedBy: userId,
          changes: { reason: reason || null, title: activity.title },
        })
        if (activity.proposed_by && activity.proposed_by !== userId) {
          await createTimelineNotification({
            type: 'timeline_rejected',
            title: 'تم رفض نشاطك',
            body:
              `رُفِض النشاط "${activity.title}"` +
              (reason ? ` — السبب: ${reason}` : ''),
            severity: 'warning',
            targetUserId: activity.proposed_by,
            data: { activity_id: activity.id, reason: reason || null },
          })
        }
        setActivities((prev) => prev.filter((a) => a.id !== activity.id))
        toast.success('تم الرفض — أعيد كمسودة')
      } catch (err) {
        console.error(err)
        toast.error('تعذّر الرفض')
      } finally {
        setBusyId(null)
      }
    },
    [userId],
  )

  const handleSavedFromModal = useCallback((saved: TimelineActivity) => {
    setActivities((prev) => {
      if (saved.status !== 'proposed') {
        return prev.filter((a) => a.id !== saved.id)
      }
      const idx = prev.findIndex((a) => a.id === saved.id)
      if (idx === -1) return prev
      const next = prev.slice()
      next[idx] = saved
      return next
    })
  }, [])

  if (!TIMELINE_ENABLED || authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin mx-auto" style={{ color: '#C08A48' }} />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            جاري تحميل طلبات الاعتماد...
          </p>
        </div>
      </div>
    )
  }

  if (!isCrossBatch) {
    return (
      <div className="space-y-4">
        <Link
          href="/timeline"
          className="text-xs font-semibold inline-flex items-center gap-1 hover:underline"
          style={{ color: '#C08A48' }}
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          رجوع
        </Link>
        <div
          className="rounded-2xl p-8 text-center"
          style={{
            background: 'rgba(185,72,56,0.06)',
            border: '1px solid rgba(185,72,56,0.25)',
          }}
        >
          <ShieldAlert className="w-10 h-10 mx-auto mb-3 opacity-60" style={{ color: '#8B2F23' }} />
          <p className="text-sm font-semibold" style={{ color: '#8B2F23' }}>
            هذه الصفحة مخصّصة للمدير التنفيذي وموظف السجلات فقط.
          </p>
        </div>
      </div>
    )
  }

  if (!calendar) {
    return (
      <div className="space-y-4">
        <Link
          href="/timeline"
          className="text-xs font-semibold inline-flex items-center gap-1 hover:underline"
          style={{ color: '#C08A48' }}
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          رجوع
        </Link>
        <p className="text-sm text-center py-8" style={{ color: 'var(--text-muted)' }}>
          لا يوجد تقويم نشط.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-fade-in-up">
      {/* Header */}
      <div>
        <Link
          href="/timeline"
          className="text-xs font-semibold inline-flex items-center gap-1 hover:underline mb-1"
          style={{ color: '#C08A48' }}
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          رجوع للخطة الزمنية
        </Link>
        <h1
          className="text-2xl font-bold flex items-center gap-2"
          style={{ color: 'var(--text-primary)' }}
        >
          <Clock className="w-6 h-6" style={{ color: '#C08A48' }} />
          طلبات الاعتماد
          <span
            className="text-xs font-bold px-2 py-0.5 rounded-md"
            style={{
              background: 'rgba(192,138,72,0.15)',
              color: '#7A4E1E',
              border: '1px solid rgba(192,138,72,0.35)',
            }}
          >
            {activities.length}
          </span>
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
          الأنشطة التي أرسلها مدراء الدفعات وتنتظر اعتمادك.
        </p>
      </div>

      {/* Empty state */}
      {activities.length === 0 ? (
        <div
          className="rounded-2xl p-10 text-center"
          style={{
            background: 'rgba(53,107,110,0.04)',
            border: '1px dashed rgba(53,107,110,0.25)',
          }}
        >
          <CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-60" style={{ color: '#356B6E' }} />
          <p className="text-sm font-semibold" style={{ color: '#235052' }}>
            لا توجد طلبات معلقة — كل شيء ممتاز!
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {activities.map((a) => {
            const batch = batchesById.get(a.batch_id)
            const type = a.activity_type_id ? typesById.get(a.activity_type_id) : null
            const activityCosts = costsByActivity.get(a.id) ?? []
            const total = computeActivityTotal(
              a,
              activityCosts,
              type ?? null,
              batch?.student_count ?? 0,
            )
            const start = parseHijriIso(a.start_date)
            const end = parseHijriIso(a.end_date)
            const busy = busyId === a.id
            return (
              <div
                key={a.id}
                className="card-static p-4 space-y-3"
                style={{
                  borderLeft: `4px solid ${a.custom_color ?? type?.default_color ?? '#C08A48'}`,
                }}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="space-y-1">
                    <h3 className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>
                      {a.title}
                    </h3>
                    <div className="flex items-center gap-2 text-xs flex-wrap">
                      {type ? (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold"
                          style={{
                            background: `${type.default_color}22`,
                            color: type.default_color,
                            border: `1px solid ${type.default_color}55`,
                          }}
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ background: type.default_color }}
                          />
                          {type.arabic_name}
                        </span>
                      ) : null}
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md"
                        style={{
                          background: 'rgba(53,107,110,0.08)',
                          color: '#235052',
                          border: '1px solid rgba(53,107,110,0.25)',
                        }}
                      >
                        <Users className="w-3 h-3" />
                        {batch?.name ?? '—'}
                      </span>
                      {start ? (
                        <span className="inline-flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                          <Calendar className="w-3 h-3" />
                          <span className="font-semibold">
                            {start.hd} {HIJRI_MONTHS_AR[start.hm - 1]}
                          </span>
                          {end && (start.hm !== end.hm || start.hd !== end.hd) ? (
                            <>
                              <span>→</span>
                              <span className="font-semibold">
                                {end.hd} {HIJRI_MONTHS_AR[end.hm - 1]}
                              </span>
                            </>
                          ) : null}
                        </span>
                      ) : null}
                      <span
                        className="text-[10px] font-mono"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        أُرسل: {new Date(a.updated_at).toLocaleDateString('ar-SA')}
                      </span>
                    </div>
                    {a.description ? (
                      <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                        {a.description}
                      </p>
                    ) : null}
                  </div>

                  {/* Cost preview */}
                  <div
                    className="rounded-xl p-2 min-w-[160px]"
                    style={{
                      background: 'rgba(192,138,72,0.06)',
                      border: '1px solid rgba(192,138,72,0.2)',
                    }}
                  >
                    <div
                      className="flex items-center gap-1 text-[10px] font-semibold"
                      style={{ color: '#7A4E1E' }}
                    >
                      <DollarSign className="w-3 h-3" />
                      الإجمالي المقدَّر
                    </div>
                    <div
                      className="text-lg font-bold font-mono"
                      style={{ color: '#7A4E1E' }}
                    >
                      {formatSAR(total.planned)}
                    </div>
                    {total.details.length > 0 ? (
                      <details className="mt-1 text-[10px]">
                        <summary
                          className="cursor-pointer"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          تفاصيل ({total.details.length})
                        </summary>
                        <ul className="list-disc pr-4 mt-1 space-y-0.5">
                          {total.details.map((d, i) => (
                            <li key={i} style={{ color: 'var(--text-secondary)' }}>
                              {d.cost_type}: {formatSAR(d.effective)}
                              {d.per_student ? ' (للطالب)' : ''}
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-wrap pt-2 border-t"
                  style={{ borderColor: 'var(--border-soft)' }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(a)
                      setModalOpen(true)
                    }}
                    disabled={busy}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold border transition hover:bg-white/5 disabled:opacity-50"
                    style={{
                      borderColor: 'var(--border-color)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    تعديل ثم اعتماد
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReject(a)}
                    disabled={busy}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-bold transition disabled:opacity-50"
                    style={{
                      background: 'rgba(185,72,56,0.08)',
                      color: '#8B2F23',
                      border: '1px solid rgba(185,72,56,0.3)',
                    }}
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    رفض
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApprove(a)}
                    disabled={busy}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-bold text-white transition active:scale-95 disabled:opacity-50"
                    style={{
                      background: 'linear-gradient(135deg, #356B6E, #244A4C)',
                      boxShadow: '0 2px 10px rgba(53,107,110,0.35)',
                    }}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {busy ? '...' : 'اعتماد'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Edit-then-approve modal */}
      {editing && calendar ? (
        <ActivityEditModal
          open={modalOpen}
          onClose={() => {
            setModalOpen(false)
            setEditing(null)
          }}
          activity={editing}
          onSaved={handleSavedFromModal}
          onDeleted={(id) =>
            setActivities((prev) => prev.filter((a) => a.id !== id))
          }
          activityTypes={types}
          daysMap={daysMap}
          hijriYear={calendar.hijri_year}
          batchId={editing.batch_id}
          calendarId={calendar.id}
          studentCount={batchesById.get(editing.batch_id)?.student_count ?? 0}
          canEdit={true}
          canApprove={true}
          userId={userId}
        />
      ) : null}
    </div>
  )
}
