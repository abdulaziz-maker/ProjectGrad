/**
 * Timeline activity helpers — pure functions used by grid + modals.
 *
 * Performance: O(1) Map lookups for 12×30 = 360 cells, expanding ~N activities
 * into per-day presence maps (bounded by activity span length).
 */
import type {
  TimelineActivity,
  TimelineActivityType,
  TimelineDay,
  TimelineDayType,
} from '@/types/timeline'
import {
  enumerateHijriYear,
  hijriIso,
  parseHijriIso,
  type HijriYMD,
} from './hijri'

// ─── Map builders ────────────────────────────────────────────────────

/** O(1) lookup from hijri iso → TimelineDay. */
export function buildDayMap(days: TimelineDay[]): Map<string, TimelineDay> {
  const m = new Map<string, TimelineDay>()
  for (const d of days) m.set(d.hijri_date, d)
  return m
}

/**
 * Expand activities into per-day buckets (multi-day spans touch every day).
 * Result: `Map<hijriIso, TimelineActivity[]>`.
 */
export function buildActivityMap(
  activities: TimelineActivity[],
  hijriYear: number,
): Map<string, TimelineActivity[]> {
  const m = new Map<string, TimelineActivity[]>()
  // Pre-generate every Hijri day of the year so we can iterate by ISO string
  // directly rather than dealing with calendar arithmetic for each activity.
  const year = enumerateHijriYear(hijriYear).map((h) => hijriIso(h))
  const yearIndex = new Map(year.map((iso, i) => [iso, i]))

  for (const a of activities) {
    const startIdx = yearIndex.get(a.start_date)
    const endIdx = yearIndex.get(a.end_date)
    if (startIdx === undefined || endIdx === undefined) continue
    const lo = Math.min(startIdx, endIdx)
    const hi = Math.max(startIdx, endIdx)
    for (let i = lo; i <= hi; i++) {
      const iso = year[i]
      const arr = m.get(iso)
      if (arr) arr.push(a)
      else m.set(iso, [a])
    }
  }
  return m
}

/** Count days between two Hijri ISO dates (inclusive). Returns null on invalid. */
export function hijriSpanLength(
  startIso: string,
  endIso: string,
  hijriYear: number,
): number | null {
  const year = enumerateHijriYear(hijriYear).map((h) => hijriIso(h))
  const yi = new Map(year.map((iso, i) => [iso, i]))
  const a = yi.get(startIso)
  const b = yi.get(endIso)
  if (a === undefined || b === undefined) return null
  return Math.abs(b - a) + 1
}

/**
 * Shift an ISO date forward/backward by N Hijri days, preserving calendar
 * (never crosses years).
 */
export function shiftHijriIso(
  iso: string,
  deltaDays: number,
  hijriYear: number,
): string | null {
  const year = enumerateHijriYear(hijriYear).map((h) => hijriIso(h))
  const i = year.indexOf(iso)
  if (i === -1) return null
  const j = i + deltaDays
  if (j < 0 || j >= year.length) return null
  return year[j]
}

// ─── Cost estimation ─────────────────────────────────────────────────

export interface CostEstimate {
  total: number
  perDay: number | null
  model: 'lump_sum' | 'per_student' | 'detailed' | 'unknown'
}

/**
 * Estimate activity cost from its activity_type's defaults + span + optional student count.
 * Returns 0 when the type is unknown (caller can show "غير محدد").
 */
export function estimateActivityCost(
  activity: Pick<TimelineActivity, 'activity_type_id' | 'start_date' | 'end_date'>,
  activityType: TimelineActivityType | null | undefined,
  studentCount: number,
  hijriYear: number,
): CostEstimate {
  if (!activityType) return { total: 0, perDay: null, model: 'unknown' }
  const span = hijriSpanLength(activity.start_date, activity.end_date, hijriYear) ?? 1

  if (activityType.cost_model === 'lump_sum') {
    const total = activityType.default_lump_sum ?? 0
    return { total, perDay: span > 0 ? total / span : null, model: 'lump_sum' }
  }
  if (activityType.cost_model === 'per_student') {
    const per = activityType.default_per_student ?? 0
    const total = per * studentCount
    return { total, perDay: span > 0 ? total / span : null, model: 'per_student' }
  }
  // 'detailed' — real value comes from activity_costs child rows
  return { total: 0, perDay: null, model: 'detailed' }
}

/** Format a number as SAR currency (Arabic thousand-separators, no decimals). */
export function formatSAR(n: number): string {
  if (!Number.isFinite(n)) return '—'
  return `${Math.round(n).toLocaleString('ar-SA')} ر.س`
}

// ─── Placement validation ────────────────────────────────────────────

export interface PlacementCheck {
  allowed: boolean
  warnings: string[]
}

/**
 * Check whether placing/moving an activity into the given day is "safe".
 * Never blocks — just raises warnings the UI can show.
 */
export function checkActivityPlacement(
  targetDay: TimelineDay | null | undefined,
  activityType?: TimelineActivityType | null,
): PlacementCheck {
  const warnings: string[] = []
  if (!targetDay) {
    return { allowed: true, warnings: ['اليوم غير معرَّف في التقويم'] }
  }
  const dt = targetDay.day_type as TimelineDayType
  if (dt === 'exam' && activityType?.name !== 'exam_day') {
    warnings.push('هذا اليوم مخصّص لاختبار — تأكد قبل التعارض')
  }
  if (dt === 'weekend' && activityType?.name !== 'exam_day') {
    warnings.push('يوم نهاية أسبوع — عادةً لا تُجدول فيه أنشطة')
  }
  if (dt === 'holiday') {
    warnings.push('يوم إجازة — النشاط سيُصنَّف أثناء إجازة')
  }
  return { allowed: true, warnings }
}

// ─── View modes ──────────────────────────────────────────────────────

export type TimelineViewMode = 'year' | 'quarter' | 'month'

/** Given a view mode + focus month (1..12), return the Hijri months to render. */
export function monthsForView(
  mode: TimelineViewMode,
  focusMonth: number,
): number[] {
  if (mode === 'year') return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
  if (mode === 'quarter') {
    // Quarter of 3 months surrounding focusMonth
    const start = Math.max(1, Math.min(10, focusMonth - 1))
    return [start, start + 1, start + 2]
  }
  return [focusMonth]
}

/** Find the dominant activity color for a day (returns first activity's color). */
export function dayActivityColor(
  activities: TimelineActivity[] | undefined,
  typeMap: Map<string, TimelineActivityType>,
): string | null {
  if (!activities || activities.length === 0) return null
  const first = activities[0]
  if (first.custom_color) return first.custom_color
  if (first.activity_type_id) {
    const t = typeMap.get(first.activity_type_id)
    if (t) return t.default_color
  }
  return null
}

/** Determine if a Hijri date is "today" (compares via Gregorian UTC). */
export function isHijriToday(iso: string): boolean {
  const h = parseHijriIso(iso)
  if (!h) return false
  const now = new Date()
  const todayHmHy = `${now.getUTCFullYear()}-${now.getUTCMonth() + 1}-${now.getUTCDate()}`
  return hijriToGregorianIsoSafe(h) === todayHmHy
}

function hijriToGregorianIsoSafe(h: HijriYMD): string {
  try {
    // Lazy import to avoid cycle
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { toGregorian } = require('hijri-converter') as typeof import('hijri-converter')
    const g = toGregorian(h.hy, h.hm, h.hd)
    return `${g.gy}-${g.gm}-${g.gd}`
  } catch {
    return ''
  }
}
