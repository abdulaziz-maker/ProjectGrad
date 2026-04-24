'use client'
/**
 * /timeline/master — CEO unified view: every batch on one page with conflict detection.
 *
 * Layout: one mini-grid per batch + a conflicts panel at the top.
 * Read-only. For editing use /timeline with batch selected.
 */
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  Layers,
  ChevronLeft,
  Loader2,
  ShieldAlert,
  AlertTriangle,
  Calendar,
  DollarSign,
} from 'lucide-react'
import { TIMELINE_ENABLED } from '@/lib/timeline/flag'
import {
  getActiveCalendar,
  getActivityTypes,
  getBatchesForTimeline,
  getAllActivitiesForCalendar,
  getCostsForActivities,
  getDays,
  type TimelineBatchRef,
} from '@/lib/timeline/db'
import { detectCrossBatchConflicts, type ConflictDay } from '@/lib/timeline/conflicts'
import {
  buildTotalsMap,
  computeKpis,
} from '@/lib/timeline/finance'
import { formatSAR } from '@/lib/timeline/activity-helpers'
import TimelineGrid from '@/components/timeline/TimelineGrid'
import { useAuth } from '@/contexts/AuthContext'
import { HIJRI_MONTHS_AR } from '@/lib/timeline/hijri'
import type {
  TimelineActivity,
  TimelineActivityCost,
  TimelineActivityType,
  TimelineCalendar,
  TimelineDay,
} from '@/types/timeline'

export default function MasterPage() {
  const router = useRouter()
  const { profile, loading: authLoading } = useAuth()
  const role = profile?.role ?? null
  const isCrossBatch = role === 'ceo' || role === 'records_officer'

  const [calendar, setCalendar] = useState<TimelineCalendar | null>(null)
  const [days, setDays] = useState<TimelineDay[]>([])
  const [types, setTypes] = useState<TimelineActivityType[]>([])
  const [batches, setBatches] = useState<TimelineBatchRef[]>([])
  const [activities, setActivities] = useState<TimelineActivity[]>([])
  const [costs, setCosts] = useState<TimelineActivityCost[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!TIMELINE_ENABLED) router.replace('/dashboard')
  }, [router])

  useEffect(() => {
    if (!TIMELINE_ENABLED || authLoading) return
    if (!isCrossBatch) {
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
            getAllActivitiesForCalendar(cal.id),
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
        toast.error('تعذّر تحميل البيانات')
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
  const studentsByBatch = useMemo(
    () => new Map(batches.map((b) => [b.id, b.student_count ?? 0])),
    [batches],
  )
  const costsByActivity = useMemo(() => {
    const m = new Map<string, TimelineActivityCost[]>()
    for (const c of costs) {
      const arr = m.get(c.activity_id) ?? []
      arr.push(c)
      m.set(c.activity_id, arr)
    }
    return m
  }, [costs])
  const totalsMap = useMemo(
    () => buildTotalsMap(activities, costsByActivity, typesById, studentsByBatch),
    [activities, costsByActivity, typesById, studentsByBatch],
  )
  const kpis = useMemo(
    () => computeKpis(activities, totalsMap),
    [activities, totalsMap],
  )

  const conflicts = useMemo(
    () => (calendar ? detectCrossBatchConflicts(activities, calendar.hijri_year) : []),
    [activities, calendar],
  )

  // Group activities by batch
  const activitiesByBatch = useMemo(() => {
    const m = new Map<number, TimelineActivity[]>()
    for (const a of activities) {
      const arr = m.get(a.batch_id) ?? []
      arr.push(a)
      m.set(a.batch_id, arr)
    }
    return m
  }, [activities])

  if (!TIMELINE_ENABLED || authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin mx-auto" style={{ color: '#C08A48' }} />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            جاري تحميل العرض الموحَّد...
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
          <ChevronLeft className="w-3.5 h-3.5" /> رجوع
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
            هذا العرض مخصّص للمدير التنفيذي وموظف السجلات فقط.
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
          <ChevronLeft className="w-3.5 h-3.5" /> رجوع
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
      <div className="flex items-start justify-between flex-wrap gap-3">
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
            <Layers className="w-6 h-6" style={{ color: '#C08A48' }} />
            العرض الموحَّد
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {batches.length} دفعة • {activities.length} نشاط • {calendar.hijri_year}هـ
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div
            className="rounded-xl px-3 py-2 text-xs"
            style={{
              background: 'rgba(192,138,72,0.08)',
              border: '1px solid rgba(192,138,72,0.3)',
              color: '#7A4E1E',
            }}
          >
            <div className="flex items-center gap-1 font-semibold">
              <DollarSign className="w-3.5 h-3.5" />
              الإجمالي:
              <span className="font-mono font-bold">{formatSAR(kpis.totalPlanned)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Conflicts banner */}
      {conflicts.length > 0 ? (
        <div
          className="rounded-2xl p-3 space-y-2"
          style={{
            background: 'rgba(185,72,56,0.06)',
            border: '1px solid rgba(185,72,56,0.3)',
          }}
        >
          <div
            className="flex items-center gap-2 font-bold text-sm"
            style={{ color: '#8B2F23' }}
          >
            <AlertTriangle className="w-4 h-4" />
            {conflicts.length} تعارض بين الدفعات
          </div>
          <ul className="text-xs space-y-1" style={{ color: 'var(--text-secondary)' }}>
            {conflicts.slice(0, 8).map((c, i) => (
              <li
                key={i}
                className="flex items-center gap-2 flex-wrap"
              >
                <Calendar className="w-3 h-3 shrink-0" />
                <span
                  className="font-semibold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {c.hijri_day} {HIJRI_MONTHS_AR[c.hijri_month - 1]}
                </span>
                <span>—</span>
                <span>
                  {c.type_id
                    ? typesById.get(c.type_id)?.arabic_name ?? 'نوع غير محدد'
                    : 'بلا نوع'}
                </span>
                <span>في الدفعات:</span>
                {c.batch_ids.map((bid) => {
                  const b = batchesById.get(bid)
                  return b ? (
                    <span
                      key={bid}
                      className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold"
                      style={{
                        background: 'rgba(185,72,56,0.12)',
                        color: '#8B2F23',
                      }}
                    >
                      {b.name}
                    </span>
                  ) : null
                })}
              </li>
            ))}
            {conflicts.length > 8 ? (
              <li className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                …و{conflicts.length - 8} تعارضاً آخر
              </li>
            ) : null}
          </ul>
        </div>
      ) : (
        <div
          className="rounded-2xl p-3 text-xs flex items-center gap-2"
          style={{
            background: 'rgba(53,107,110,0.06)',
            border: '1px solid rgba(53,107,110,0.25)',
            color: '#235052',
          }}
        >
          <span className="font-bold">✓</span>
          <span>لا توجد تعارضات بين الدفعات — كل نشاط فريد في يومه.</span>
        </div>
      )}

      {/* Per-batch grids */}
      <div className="space-y-5">
        {batches.map((batch) => {
          const batchActivities = activitiesByBatch.get(batch.id) ?? []
          // Batch total
          const batchTotal = batchActivities.reduce((acc, a) => {
            return acc + (totalsMap.get(a.id)?.planned ?? 0)
          }, 0)
          return (
            <section
              key={batch.id}
              className="space-y-2"
            >
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h2
                    className="text-base font-bold"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {batch.name}
                  </h2>
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {batchActivities.length} نشاط • {batch.student_count ?? '—'} طالب •
                    المدير: {batch.manager_name ?? '—'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="text-xs font-bold font-mono px-2 py-1 rounded-md"
                    style={{
                      background: 'rgba(192,138,72,0.12)',
                      color: '#7A4E1E',
                    }}
                  >
                    {formatSAR(batchTotal)}
                  </span>
                  <Link
                    href={`/timeline?batch=${batch.id}`}
                    className="text-[11px] font-semibold hover:underline"
                    style={{ color: '#C08A48' }}
                  >
                    فتح ←
                  </Link>
                </div>
              </div>
              <TimelineGrid
                hijriYear={calendar.hijri_year}
                days={days}
                activities={batchActivities}
                activityTypes={types}
                zoom={80}
                view="year"
                focusMonth={1}
                showGregorian={false}
                canEdit={false}
                onDayClick={() => {}}
                onActivityEdit={() => {}}
                onActivityMove={() => {}}
              />
            </section>
          )
        })}
      </div>
    </div>
  )
}
