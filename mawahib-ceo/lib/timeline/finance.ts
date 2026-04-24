/**
 * Timeline Finance — pure aggregation helpers for the finance dashboard.
 *
 * Rules:
 *   - "total" of an activity = sum of cost rows (detailed) OR
 *     lump_sum default * (1 if not per-student else student_count)  OR
 *     per_student default * student_count
 *   - A cost row with `per_student=true` is multiplied by `estimated_students`
 *     (falling back to the batch's student_count when null).
 *   - Activities with status='cancelled' are excluded from totals (shown separately).
 */
import type {
  TimelineActivity,
  TimelineActivityCost,
  TimelineActivityType,
  TimelineActivityStatus,
} from '@/types/timeline'
import type { TimelineBatchRef } from './db'
import { parseHijriIso, HIJRI_MONTHS_AR } from './hijri'

// ─── Per-activity total ─────────────────────────────────────────────

export interface ActivityTotal {
  activityId: string
  total: number
  planned: number // sum across all rows (raw planned)
  approved: number // only if activity.status === 'approved'
  actual: number // sum of rows where receipt_url is set (proxy for "spent")
  details: Array<{
    cost_type: string
    amount: number
    per_student: boolean
    effective: number
  }>
}

export function computeActivityTotal(
  activity: TimelineActivity,
  costs: TimelineActivityCost[],
  activityType: TimelineActivityType | null | undefined,
  batchStudentCount: number,
): ActivityTotal {
  const details: ActivityTotal['details'] = []
  let planned = 0
  let actual = 0

  if (costs.length > 0) {
    // Detailed (or lump_sum with overrides) — use the cost rows directly
    for (const c of costs) {
      const students = c.estimated_students ?? batchStudentCount
      const effective = c.per_student ? c.amount * students : c.amount
      details.push({
        cost_type: c.cost_type,
        amount: c.amount,
        per_student: c.per_student,
        effective,
      })
      planned += effective
      if (c.receipt_url) actual += effective
    }
  } else if (activityType) {
    // Fall back to type defaults
    if (activityType.cost_model === 'lump_sum' && activityType.default_lump_sum != null) {
      planned = activityType.default_lump_sum
      details.push({
        cost_type: 'الافتراضي',
        amount: planned,
        per_student: false,
        effective: planned,
      })
    } else if (
      activityType.cost_model === 'per_student' &&
      activityType.default_per_student != null
    ) {
      planned = activityType.default_per_student * batchStudentCount
      details.push({
        cost_type: 'للطالب الواحد',
        amount: activityType.default_per_student,
        per_student: true,
        effective: planned,
      })
    }
  }

  const approved = activity.status === 'approved' ? planned : 0

  return {
    activityId: activity.id,
    total: planned,
    planned,
    approved,
    actual,
    details,
  }
}

// ─── Build a quick lookup Map<activityId, ActivityTotal> ─────────────

export function buildTotalsMap(
  activities: TimelineActivity[],
  costsByActivity: Map<string, TimelineActivityCost[]>,
  typesById: Map<string, TimelineActivityType>,
  studentsByBatch: Map<number, number>,
): Map<string, ActivityTotal> {
  const m = new Map<string, ActivityTotal>()
  for (const a of activities) {
    if (a.status === 'cancelled') continue
    const costs = costsByActivity.get(a.id) ?? []
    const type = a.activity_type_id ? typesById.get(a.activity_type_id) : null
    const students = studentsByBatch.get(a.batch_id) ?? 0
    m.set(a.id, computeActivityTotal(a, costs, type, students))
  }
  return m
}

// ─── Aggregations ───────────────────────────────────────────────────

export interface MonthlyBucket {
  hijriMonth: number // 1..12
  label: string      // Arabic month name
  planned: number
  approved: number
  actual: number
  count: number
}

/** Aggregate totals by Hijri month (uses activity start_date). */
export function aggregateByMonth(
  activities: TimelineActivity[],
  totalsMap: Map<string, ActivityTotal>,
): MonthlyBucket[] {
  const out: MonthlyBucket[] = Array.from({ length: 12 }, (_, i) => ({
    hijriMonth: i + 1,
    label: HIJRI_MONTHS_AR[i],
    planned: 0,
    approved: 0,
    actual: 0,
    count: 0,
  }))
  for (const a of activities) {
    if (a.status === 'cancelled') continue
    const t = totalsMap.get(a.id)
    if (!t) continue
    const h = parseHijriIso(a.start_date)
    if (!h) continue
    const b = out[h.hm - 1]
    b.planned += t.planned
    b.approved += t.approved
    b.actual += t.actual
    b.count += 1
  }
  return out
}

export interface QuarterBucket {
  quarter: number // 1..4
  label: string
  months: number[]
  planned: number
  approved: number
  actual: number
  count: number
}

/** Split Hijri year into 4 quarters of 3 months each. */
export function aggregateByQuarter(monthly: MonthlyBucket[]): QuarterBucket[] {
  const quarters: QuarterBucket[] = [
    { quarter: 1, label: 'الربع الأول', months: [1, 2, 3], planned: 0, approved: 0, actual: 0, count: 0 },
    { quarter: 2, label: 'الربع الثاني', months: [4, 5, 6], planned: 0, approved: 0, actual: 0, count: 0 },
    { quarter: 3, label: 'الربع الثالث', months: [7, 8, 9], planned: 0, approved: 0, actual: 0, count: 0 },
    { quarter: 4, label: 'الربع الرابع', months: [10, 11, 12], planned: 0, approved: 0, actual: 0, count: 0 },
  ]
  for (const m of monthly) {
    const q = quarters.find((x) => x.months.includes(m.hijriMonth))
    if (!q) continue
    q.planned += m.planned
    q.approved += m.approved
    q.actual += m.actual
    q.count += m.count
  }
  return quarters
}

export interface TypeBucket {
  typeId: string
  name: string
  color: string
  planned: number
  approved: number
  actual: number
  count: number
}

export function aggregateByType(
  activities: TimelineActivity[],
  totalsMap: Map<string, ActivityTotal>,
  typesById: Map<string, TimelineActivityType>,
): TypeBucket[] {
  const m = new Map<string, TypeBucket>()
  for (const a of activities) {
    if (a.status === 'cancelled') continue
    if (!a.activity_type_id) continue
    const t = totalsMap.get(a.id)
    const type = typesById.get(a.activity_type_id)
    if (!t || !type) continue
    const b = m.get(type.id) ?? {
      typeId: type.id,
      name: type.arabic_name,
      color: type.default_color,
      planned: 0,
      approved: 0,
      actual: 0,
      count: 0,
    }
    b.planned += t.planned
    b.approved += t.approved
    b.actual += t.actual
    b.count += 1
    m.set(type.id, b)
  }
  return Array.from(m.values()).sort((a, b) => b.planned - a.planned)
}

export interface BatchBucket {
  batchId: number
  name: string
  planned: number
  approved: number
  actual: number
  count: number
}

export function aggregateByBatch(
  activities: TimelineActivity[],
  totalsMap: Map<string, ActivityTotal>,
  batches: TimelineBatchRef[],
): BatchBucket[] {
  const byId = new Map(batches.map((b) => [b.id, b]))
  const m = new Map<number, BatchBucket>()
  for (const a of activities) {
    if (a.status === 'cancelled') continue
    const t = totalsMap.get(a.id)
    if (!t) continue
    const batch = byId.get(a.batch_id)
    if (!batch) continue
    const b = m.get(a.batch_id) ?? {
      batchId: a.batch_id,
      name: batch.name,
      planned: 0,
      approved: 0,
      actual: 0,
      count: 0,
    }
    b.planned += t.planned
    b.approved += t.approved
    b.actual += t.actual
    b.count += 1
    m.set(a.batch_id, b)
  }
  return Array.from(m.values()).sort((a, b) => b.planned - a.planned)
}

// ─── Headline KPIs ─────────────────────────────────────────────────

export interface FinanceKpis {
  totalPlanned: number
  totalApproved: number
  totalActual: number
  activityCount: number
  approvedCount: number
  pendingCount: number
  byStatus: Record<TimelineActivityStatus, { count: number; amount: number }>
}

export function computeKpis(
  activities: TimelineActivity[],
  totalsMap: Map<string, ActivityTotal>,
): FinanceKpis {
  const kpis: FinanceKpis = {
    totalPlanned: 0,
    totalApproved: 0,
    totalActual: 0,
    activityCount: 0,
    approvedCount: 0,
    pendingCount: 0,
    byStatus: {
      draft: { count: 0, amount: 0 },
      proposed: { count: 0, amount: 0 },
      approved: { count: 0, amount: 0 },
      cancelled: { count: 0, amount: 0 },
    },
  }
  for (const a of activities) {
    const t = totalsMap.get(a.id)
    const amt = t?.planned ?? 0
    kpis.byStatus[a.status].count += 1
    kpis.byStatus[a.status].amount += amt
    if (a.status === 'cancelled') continue
    kpis.activityCount += 1
    kpis.totalPlanned += amt
    kpis.totalApproved += t?.approved ?? 0
    kpis.totalActual += t?.actual ?? 0
    if (a.status === 'approved') kpis.approvedCount += 1
    if (a.status === 'proposed') kpis.pendingCount += 1
  }
  return kpis
}

// ─── Excel export ──────────────────────────────────────────────────

/**
 * Export activity-cost breakdown as an xlsx workbook and trigger download.
 * Uses the already-bundled `xlsx` package — no new dep.
 */
export async function exportFinanceXlsx(params: {
  filename: string
  activities: TimelineActivity[]
  totalsMap: Map<string, ActivityTotal>
  typesById: Map<string, TimelineActivityType>
  batches: TimelineBatchRef[]
  monthly: MonthlyBucket[]
  byType: TypeBucket[]
  byBatch: BatchBucket[]
}): Promise<void> {
  const XLSX = await import('xlsx')

  const batchNameById = new Map(params.batches.map((b) => [b.id, b.name]))

  // Sheet 1: Activities
  const activitiesRows = params.activities.map((a) => {
    const t = params.totalsMap.get(a.id)
    const type = a.activity_type_id ? params.typesById.get(a.activity_type_id) : null
    return {
      'العنوان': a.title,
      'الدفعة': batchNameById.get(a.batch_id) ?? a.batch_id,
      'النوع': type?.arabic_name ?? '',
      'من': a.start_date,
      'إلى': a.end_date,
      'الحالة': statusLabel(a.status),
      'المخطط (ر.س)': t?.planned ?? 0,
      'المعتمد (ر.س)': t?.approved ?? 0,
      'الفعلي (ر.س)': t?.actual ?? 0,
    }
  })

  const monthlyRows = params.monthly.map((m) => ({
    'الشهر': m.label,
    'رقم الشهر': m.hijriMonth,
    'عدد الأنشطة': m.count,
    'المخطط (ر.س)': m.planned,
    'المعتمد (ر.س)': m.approved,
    'الفعلي (ر.س)': m.actual,
  }))

  const typeRows = params.byType.map((t) => ({
    'النوع': t.name,
    'العدد': t.count,
    'المخطط (ر.س)': t.planned,
    'المعتمد (ر.س)': t.approved,
    'الفعلي (ر.س)': t.actual,
  }))

  const batchRows = params.byBatch.map((b) => ({
    'الدفعة': b.name,
    'عدد الأنشطة': b.count,
    'المخطط (ر.س)': b.planned,
    'المعتمد (ر.س)': b.approved,
    'الفعلي (ر.س)': b.actual,
  }))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(activitiesRows),
    'الأنشطة',
  )
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(monthlyRows),
    'شهري',
  )
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(typeRows),
    'حسب النوع',
  )
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(batchRows),
    'حسب الدفعة',
  )

  XLSX.writeFile(wb, params.filename)
}

function statusLabel(s: TimelineActivityStatus): string {
  switch (s) {
    case 'draft': return 'مسودة'
    case 'proposed': return 'مقترح'
    case 'approved': return 'معتمد'
    case 'cancelled': return 'ملغى'
  }
}
