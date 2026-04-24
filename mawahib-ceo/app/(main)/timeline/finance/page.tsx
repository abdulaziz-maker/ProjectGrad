'use client'
/**
 * /timeline/finance — budget dashboard across all batches of the active calendar.
 *
 * KPIs + monthly bar chart + pie by type + batch table + Excel export.
 * Read-access: everyone with read on activities (DB RLS enforces scope).
 * Write-access: none from this page — pure analytics.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  ResponsiveContainer,
  PieChart,
  Pie,
  Legend,
  CartesianGrid,
} from 'recharts'
import {
  DollarSign,
  TrendingUp,
  ChevronLeft,
  Loader2,
  Download,
  Layers,
  CheckCircle2,
  Clock,
  AlertCircle,
} from 'lucide-react'
import { TIMELINE_ENABLED } from '@/lib/timeline/flag'
import {
  getActiveCalendar,
  getActivityTypes,
  getBatchesForTimeline,
  getAllActivitiesForCalendar,
  getCostsForActivities,
  type TimelineBatchRef,
} from '@/lib/timeline/db'
import {
  buildTotalsMap,
  aggregateByMonth,
  aggregateByQuarter,
  aggregateByType,
  aggregateByBatch,
  computeKpis,
  exportFinanceXlsx,
} from '@/lib/timeline/finance'
import { formatSAR } from '@/lib/timeline/activity-helpers'
import { useAuth } from '@/contexts/AuthContext'
import type {
  TimelineActivity,
  TimelineActivityCost,
  TimelineActivityType,
  TimelineCalendar,
} from '@/types/timeline'

export default function FinancePage() {
  const router = useRouter()
  const { profile, loading: authLoading } = useAuth()
  const role = profile?.role ?? null
  const isCrossBatch = role === 'ceo' || role === 'records_officer'

  const [calendar, setCalendar] = useState<TimelineCalendar | null>(null)
  const [types, setTypes] = useState<TimelineActivityType[]>([])
  const [batches, setBatches] = useState<TimelineBatchRef[]>([])
  const [activities, setActivities] = useState<TimelineActivity[]>([])
  const [costs, setCosts] = useState<TimelineActivityCost[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    if (!TIMELINE_ENABLED) router.replace('/dashboard')
  }, [router])

  useEffect(() => {
    if (!TIMELINE_ENABLED || authLoading) return
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
          const acts = await getAllActivitiesForCalendar(cal.id)
          if (!alive) return
          setActivities(acts)
          const ac = await getCostsForActivities(acts.map((a) => a.id))
          if (!alive) return
          setCosts(ac)
        }
      } catch (err) {
        console.error(err)
        toast.error('تعذّر تحميل بيانات الميزانية')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [authLoading])

  // Build core indexes
  const typesById = useMemo(() => new Map(types.map((t) => [t.id, t])), [types])
  const studentsByBatch = useMemo(
    () => new Map(batches.map((b) => [b.id, b.student_count ?? 0])),
    [batches],
  )
  const costsByActivity = useMemo(() => {
    const m = new Map<string, TimelineActivityCost[]>()
    for (const c of costs) {
      const arr = m.get(c.activity_id)
      if (arr) arr.push(c)
      else m.set(c.activity_id, [c])
    }
    return m
  }, [costs])

  const totalsMap = useMemo(
    () => buildTotalsMap(activities, costsByActivity, typesById, studentsByBatch),
    [activities, costsByActivity, typesById, studentsByBatch],
  )

  const kpis = useMemo(() => computeKpis(activities, totalsMap), [activities, totalsMap])
  const monthly = useMemo(
    () => aggregateByMonth(activities, totalsMap),
    [activities, totalsMap],
  )
  const quarterly = useMemo(() => aggregateByQuarter(monthly), [monthly])
  const byType = useMemo(
    () => aggregateByType(activities, totalsMap, typesById),
    [activities, totalsMap, typesById],
  )
  const byBatch = useMemo(
    () => aggregateByBatch(activities, totalsMap, batches),
    [activities, totalsMap, batches],
  )

  const handleExport = useCallback(async () => {
    if (!calendar) return
    setExporting(true)
    try {
      await exportFinanceXlsx({
        filename: `تقرير-مالي-${calendar.hijri_year}هـ.xlsx`,
        activities,
        totalsMap,
        typesById,
        batches,
        monthly,
        byType,
        byBatch,
      })
      toast.success('تم التنزيل')
    } catch (err) {
      console.error(err)
      toast.error('تعذّر التصدير')
    } finally {
      setExporting(false)
    }
  }, [calendar, activities, totalsMap, typesById, batches, monthly, byType, byBatch])

  if (!TIMELINE_ENABLED || authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin mx-auto" style={{ color: '#C08A48' }} />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            جاري تحميل لوحة الميزانية...
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
          رجوع للخطة الزمنية
        </Link>
        <div
          className="rounded-2xl p-8 text-center"
          style={{
            background: 'rgba(192,138,72,0.04)',
            border: '1px dashed rgba(192,138,72,0.35)',
          }}
        >
          <p className="text-sm font-semibold" style={{ color: '#7A4E1E' }}>
            لا يوجد تقويم نشط — لا يمكن عرض الميزانية.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/timeline"
              className="text-xs font-semibold inline-flex items-center gap-1 hover:underline"
              style={{ color: '#C08A48' }}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              رجوع للخطة الزمنية
            </Link>
          </div>
          <h1
            className="text-2xl font-bold flex items-center gap-2"
            style={{ color: 'var(--text-primary)' }}
          >
            <DollarSign className="w-6 h-6" style={{ color: '#C08A48' }} />
            ميزانية الخطة الزمنية
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            تحليل مالي للتقويم النشط{' '}
            <span className="font-mono">
              ({calendar.name} — {calendar.hijri_year}هـ)
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting || activities.length === 0}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white rounded-xl transition active:scale-95 disabled:opacity-50"
          style={{
            background: 'linear-gradient(135deg, #356B6E, #244A4C)',
            boxShadow: '0 2px 10px rgba(53,107,110,0.35)',
          }}
        >
          <Download className="w-4 h-4" />
          {exporting ? 'جاري التصدير...' : 'تصدير Excel'}
        </button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard
          label="الإجمالي المخطط"
          value={formatSAR(kpis.totalPlanned)}
          color="#C08A48"
          icon={<TrendingUp className="w-4 h-4" />}
        />
        <KpiCard
          label="المعتمد"
          value={formatSAR(kpis.totalApproved)}
          color="#356B6E"
          icon={<CheckCircle2 className="w-4 h-4" />}
          subtitle={`${kpis.approvedCount} نشاط`}
        />
        <KpiCard
          label="بانتظار الاعتماد"
          value={`${kpis.pendingCount}`}
          color="#C08A48"
          icon={<Clock className="w-4 h-4" />}
          subtitle={formatSAR(kpis.byStatus.proposed.amount)}
        />
        <KpiCard
          label="الفعلي المنفذ"
          value={formatSAR(kpis.totalActual)}
          color="#235052"
          icon={<AlertCircle className="w-4 h-4" />}
          subtitle={
            kpis.totalPlanned > 0
              ? `${Math.round((kpis.totalActual / kpis.totalPlanned) * 100)}%`
              : undefined
          }
        />
      </div>

      {/* Permission hint for non-CEO */}
      {!isCrossBatch ? (
        <div
          className="rounded-xl p-2.5 text-xs flex items-center gap-2"
          style={{
            background: 'rgba(148,163,184,0.08)',
            border: '1px solid rgba(148,163,184,0.25)',
            color: 'var(--text-muted)',
          }}
        >
          <Layers className="w-4 h-4" />
          <span>
            الأرقام تعرض دفعتك فقط بسبب صلاحيات عرض الأنشطة.
          </span>
        </div>
      ) : null}

      {/* Monthly chart */}
      <div className="card-static p-4">
        <h3
          className="font-bold text-sm mb-3"
          style={{ color: 'var(--text-primary)' }}
        >
          التوزيع الشهري (هجري)
        </h3>
        <div className="w-full h-72">
          <ResponsiveContainer>
            <BarChart data={monthly} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" />
              <XAxis
                dataKey="label"
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                reversed
              />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 8,
                  direction: 'rtl',
                }}
                formatter={(v) => formatSAR(typeof v === 'number' ? v : Number(v) || 0)}
              />
              <Bar dataKey="planned" name="المخطط" fill="#C08A48" radius={[4, 4, 0, 0]} />
              <Bar dataKey="approved" name="المعتمد" fill="#356B6E" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Quarterly strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {quarterly.map((q) => (
          <div
            key={q.quarter}
            className="rounded-2xl p-3"
            style={{
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border-soft)',
            }}
          >
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {q.label}
            </p>
            <p
              className="text-lg font-bold font-mono mt-1"
              style={{ color: 'var(--text-primary)' }}
            >
              {formatSAR(q.planned)}
            </p>
            <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {q.count} نشاط • معتمد: {formatSAR(q.approved)}
            </p>
          </div>
        ))}
      </div>

      {/* Pie by type + Batch table */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card-static p-4">
          <h3
            className="font-bold text-sm mb-3"
            style={{ color: 'var(--text-primary)' }}
          >
            حسب نوع النشاط
          </h3>
          {byType.length === 0 ? (
            <p
              className="text-xs text-center py-8"
              style={{ color: 'var(--text-muted)' }}
            >
              لا توجد بيانات
            </p>
          ) : (
            <div className="w-full h-72">
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={byType}
                    dataKey="planned"
                    nameKey="name"
                    outerRadius={90}
                    innerRadius={48}
                    paddingAngle={2}
                  >
                    {byType.map((t) => (
                      <Cell key={t.typeId} fill={t.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 8,
                      direction: 'rtl',
                    }}
                    formatter={(v) => formatSAR(typeof v === 'number' ? v : Number(v) || 0)}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 11 }}
                    formatter={(v) => <span style={{ color: 'var(--text-secondary)' }}>{v}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="card-static p-4">
          <h3
            className="font-bold text-sm mb-3"
            style={{ color: 'var(--text-primary)' }}
          >
            حسب الدفعة
          </h3>
          {byBatch.length === 0 ? (
            <p
              className="text-xs text-center py-8"
              style={{ color: 'var(--text-muted)' }}
            >
              لا توجد بيانات
            </p>
          ) : (
            <div className="space-y-2">
              {byBatch.map((b) => (
                <div
                  key={b.batchId}
                  className="rounded-xl p-3 flex items-center justify-between flex-wrap gap-2"
                  style={{
                    background: 'var(--bg-subtle)',
                    border: '1px solid var(--border-soft)',
                  }}
                >
                  <div>
                    <p
                      className="text-sm font-bold"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {b.name}
                    </p>
                    <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      {b.count} نشاط
                    </p>
                  </div>
                  <div className="text-left">
                    <p
                      className="text-sm font-bold font-mono"
                      style={{ color: '#C08A48' }}
                    >
                      {formatSAR(b.planned)}
                    </p>
                    <p className="text-[10px]" style={{ color: '#235052' }}>
                      معتمد: {formatSAR(b.approved)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Top activities table */}
      <div className="card-static p-4">
        <h3
          className="font-bold text-sm mb-3"
          style={{ color: 'var(--text-primary)' }}
        >
          أغلى ١٠ أنشطة
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ direction: 'rtl' }}>
            <thead>
              <tr
                className="border-b"
                style={{ borderColor: 'var(--border-color)' }}
              >
                <th className="text-right p-2 text-xs font-bold" style={{ color: 'var(--text-muted)' }}>
                  النشاط
                </th>
                <th className="text-right p-2 text-xs font-bold" style={{ color: 'var(--text-muted)' }}>
                  الدفعة
                </th>
                <th className="text-right p-2 text-xs font-bold" style={{ color: 'var(--text-muted)' }}>
                  النوع
                </th>
                <th className="text-left p-2 text-xs font-bold" style={{ color: 'var(--text-muted)' }}>
                  المخطط
                </th>
                <th className="text-left p-2 text-xs font-bold" style={{ color: 'var(--text-muted)' }}>
                  المعتمد
                </th>
              </tr>
            </thead>
            <tbody>
              {activities
                .map((a) => ({ a, t: totalsMap.get(a.id) }))
                .filter((x) => x.t && x.t.planned > 0)
                .sort((x, y) => (y.t!.planned - x.t!.planned))
                .slice(0, 10)
                .map(({ a, t }) => {
                  const batch = batches.find((b) => b.id === a.batch_id)
                  const type = a.activity_type_id ? typesById.get(a.activity_type_id) : null
                  return (
                    <tr
                      key={a.id}
                      className="border-b"
                      style={{ borderColor: 'var(--border-soft)' }}
                    >
                      <td className="p-2 font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {a.title}
                      </td>
                      <td className="p-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {batch?.name ?? '—'}
                      </td>
                      <td className="p-2 text-xs">
                        {type ? (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-semibold"
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
                        ) : (
                          '—'
                        )}
                      </td>
                      <td
                        className="p-2 text-left font-mono font-bold"
                        style={{ color: '#7A4E1E' }}
                      >
                        {formatSAR(t!.planned)}
                      </td>
                      <td
                        className="p-2 text-left font-mono"
                        style={{ color: '#235052' }}
                      >
                        {formatSAR(t!.approved)}
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── KPI card ──────────────────────────────────────────────────────
function KpiCard({
  label,
  value,
  subtitle,
  color,
  icon,
}: {
  label: string
  value: string
  subtitle?: string
  color: string
  icon: React.ReactNode
}) {
  return (
    <div
      className="rounded-2xl p-3"
      style={{
        background: `${color}11`,
        border: `1px solid ${color}33`,
      }}
    >
      <div
        className="flex items-center gap-1.5 text-[11px] font-semibold"
        style={{ color }}
      >
        {icon}
        {label}
      </div>
      <div
        className="text-xl font-bold font-mono mt-1"
        style={{ color: 'var(--text-primary)' }}
      >
        {value}
      </div>
      {subtitle ? (
        <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
          {subtitle}
        </div>
      ) : null}
    </div>
  )
}
