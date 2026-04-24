/**
 * Cross-batch conflict detection for the Master view.
 *
 * A "conflict" is defined as: two or more activities — from different batches —
 * that overlap on the same Hijri day AND share the same activity_type_id AND
 * both are non-cancelled.
 *
 * Useful signals: two batches running a سفرة on the same day (vehicle clash),
 * two يوم همة events competing for the same speaker, etc.
 */
import type { TimelineActivity } from '@/types/timeline'
import { enumerateHijriYear, hijriIso, parseHijriIso } from './hijri'

export interface ConflictDay {
  hijri_iso: string
  hijri_month: number
  hijri_day: number
  type_id: string | null
  batch_ids: number[]
  activities: TimelineActivity[]
}

/**
 * Build a conflict report for a single Hijri year across every passed activity.
 * O(N × span) where N = activities, span = average duration.
 */
export function detectCrossBatchConflicts(
  activities: TimelineActivity[],
  hijriYear: number,
): ConflictDay[] {
  const yearDays = enumerateHijriYear(hijriYear).map((h) => hijriIso(h))
  const yearIndex = new Map(yearDays.map((iso, i) => [iso, i]))
  // bucket[iso][typeId] = set of batch ids
  const buckets = new Map<string, Map<string, TimelineActivity[]>>()

  for (const a of activities) {
    if (a.status === 'cancelled') continue
    const startIdx = yearIndex.get(a.start_date)
    const endIdx = yearIndex.get(a.end_date)
    if (startIdx === undefined || endIdx === undefined) continue
    const typeKey = a.activity_type_id ?? '_no_type_'
    const lo = Math.min(startIdx, endIdx)
    const hi = Math.max(startIdx, endIdx)
    for (let i = lo; i <= hi; i++) {
      const iso = yearDays[i]
      let byType = buckets.get(iso)
      if (!byType) {
        byType = new Map()
        buckets.set(iso, byType)
      }
      const arr = byType.get(typeKey) ?? []
      arr.push(a)
      byType.set(typeKey, arr)
    }
  }

  const conflicts: ConflictDay[] = []
  for (const [iso, byType] of buckets) {
    for (const [typeKey, arr] of byType) {
      // Unique batch ids
      const batchIds = Array.from(new Set(arr.map((a) => a.batch_id)))
      if (batchIds.length < 2) continue
      const parsed = parseHijriIso(iso)
      if (!parsed) continue
      conflicts.push({
        hijri_iso: iso,
        hijri_month: parsed.hm,
        hijri_day: parsed.hd,
        type_id: typeKey === '_no_type_' ? null : typeKey,
        batch_ids: batchIds,
        activities: arr,
      })
    }
  }
  conflicts.sort((a, b) =>
    a.hijri_month !== b.hijri_month
      ? a.hijri_month - b.hijri_month
      : a.hijri_day - b.hijri_day,
  )
  return conflicts
}
