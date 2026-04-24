/**
 * Timeline Template Engine — serialize current plan → JSON, then apply to new year.
 *
 * Mapping strategy:
 *   Each activity is abstracted as { hijri_month, hijri_day, span_days, type_id, title, notes }
 *   To apply, we simply re-instantiate on the target calendar using the same
 *   (hijri_month, hijri_day). Hijri days per month vary (29/30), so we clamp
 *   the day to the month's actual length.
 *
 * This is simpler and more reliable than "week N of semester" rules because
 * the academic year isn't strictly calendar-based — month-anchoring works for
 * Ramadan boundaries, exam weeks, and semester holidays.
 */
import type {
  TimelineActivity,
  TimelineActivityCost,
  TimelineActivityStatus,
} from '@/types/timeline'
import { parseHijriIso, hijriIso as hijriToIso, enumerateHijriYear } from './hijri'

// ─── Template shape (stored in timeline_plan_templates.template_data) ─

export interface TemplateActivityRule {
  /** Position in the year */
  hijri_month: number
  hijri_day: number
  span_days: number
  /** Content */
  title: string
  description: string | null
  activity_type_id: string | null
  custom_color: string | null
  notes: string | null
  /** Cost items snapshot (per-activity) — re-used verbatim on apply */
  costs: Array<Pick<TimelineActivityCost, 'cost_type' | 'amount' | 'per_student' | 'estimated_students' | 'notes'>>
}

export interface PlanTemplateData {
  version: 1
  source_hijri_year: number
  activities: TemplateActivityRule[]
}

// ─── Serialize: activities+costs → template JSON ──────────────────────

export function buildTemplateData(
  activities: TimelineActivity[],
  costsByActivity: Map<string, TimelineActivityCost[]>,
  sourceHijriYear: number,
): PlanTemplateData {
  const rules: TemplateActivityRule[] = []
  for (const a of activities) {
    if (a.status === 'cancelled') continue
    const start = parseHijriIso(a.start_date)
    const end = parseHijriIso(a.end_date)
    if (!start || !end) continue
    // Compute span in days using the hijri-to-gregorian bridge
    const span = spanDays(a.start_date, a.end_date, sourceHijriYear) ?? 1
    const costs = (costsByActivity.get(a.id) ?? []).map((c) => ({
      cost_type: c.cost_type,
      amount: c.amount,
      per_student: c.per_student,
      estimated_students: c.estimated_students,
      notes: c.notes,
    }))
    rules.push({
      hijri_month: start.hm,
      hijri_day: start.hd,
      span_days: span,
      title: a.title,
      description: a.description,
      activity_type_id: a.activity_type_id,
      custom_color: a.custom_color,
      notes: a.notes,
      costs,
    })
  }
  return { version: 1, source_hijri_year: sourceHijriYear, activities: rules }
}

// ─── Apply preview — returns proposed activities without writing to DB ─

export interface AppliedActivity {
  rule: TemplateActivityRule
  /** Final start_date after clamping day to target month length */
  start_hijri_iso: string
  end_hijri_iso: string
  clamped: boolean  // whether the day was adjusted (e.g., 30 → 29)
  skipped: boolean  // if true we couldn't place it (shouldn't happen with clamping)
}

/**
 * Project every rule onto the target Hijri year. Returns the resolved
 * (start, end) pair for each rule. Uses the year array from enumerateHijriYear
 * to find valid placements.
 */
export function projectTemplateOnYear(
  tpl: PlanTemplateData,
  targetHijriYear: number,
): AppliedActivity[] {
  const yearDays = enumerateHijriYear(targetHijriYear)
  // Build an index: (month, day) → ISO
  const monthMaxDay: Record<number, number> = {}
  for (const d of yearDays) {
    if (!monthMaxDay[d.hm] || d.hd > monthMaxDay[d.hm]) {
      monthMaxDay[d.hm] = d.hd
    }
  }
  const yearSet = new Set(yearDays.map((d) => hijriToIso(d)))

  const out: AppliedActivity[] = []
  for (const rule of tpl.activities) {
    const maxDay = monthMaxDay[rule.hijri_month] ?? 29
    const clamped = rule.hijri_day > maxDay
    const startDay = Math.min(rule.hijri_day, maxDay)
    const startIso = hijriToIso({
      hy: targetHijriYear,
      hm: rule.hijri_month,
      hd: startDay,
    })
    if (!yearSet.has(startIso)) {
      out.push({
        rule,
        start_hijri_iso: startIso,
        end_hijri_iso: startIso,
        clamped,
        skipped: true,
      })
      continue
    }
    // Compute end by advancing (span_days - 1) days through yearDays
    const startIdx = yearDays.findIndex(
      (d) => d.hm === rule.hijri_month && d.hd === startDay,
    )
    const endIdx = Math.min(startIdx + rule.span_days - 1, yearDays.length - 1)
    const endIso = hijriToIso(yearDays[endIdx])
    out.push({
      rule,
      start_hijri_iso: startIso,
      end_hijri_iso: endIso,
      clamped,
      skipped: false,
    })
  }
  return out
}

// ─── Conflict detection (against target calendar's days) ─────────────

export interface AppliedConflict {
  ruleIdx: number
  severity: 'warning'
  message: string
}

import type { TimelineDay } from '@/types/timeline'

export function detectAppliedConflicts(
  applied: AppliedActivity[],
  targetDays: TimelineDay[],
): AppliedConflict[] {
  const daysByIso = new Map(targetDays.map((d) => [d.hijri_date, d]))
  const out: AppliedConflict[] = []
  applied.forEach((a, idx) => {
    const startDay = daysByIso.get(a.start_hijri_iso)
    if (a.skipped) {
      out.push({
        ruleIdx: idx,
        severity: 'warning',
        message: `${a.rule.title}: اليوم غير موجود في التقويم المستهدف`,
      })
      return
    }
    if (a.clamped) {
      out.push({
        ruleIdx: idx,
        severity: 'warning',
        message: `${a.rule.title}: تم تعديل اليوم من ${a.rule.hijri_day} لأن الشهر قصير`,
      })
    }
    if (startDay?.day_type === 'exam') {
      out.push({
        ruleIdx: idx,
        severity: 'warning',
        message: `${a.rule.title}: يقع في فترة اختبارات — اقترح نقله`,
      })
    }
    if (startDay?.day_type === 'weekend') {
      out.push({
        ruleIdx: idx,
        severity: 'warning',
        message: `${a.rule.title}: يقع في نهاية أسبوع`,
      })
    }
    if (startDay?.day_type === 'holiday') {
      out.push({
        ruleIdx: idx,
        severity: 'warning',
        message: `${a.rule.title}: يصادف إجازة`,
      })
    }
  })
  return out
}

// ─── Materialize: applied → DB insert payload ─────────────────────────

export interface MaterializeParams {
  applied: AppliedActivity[]
  batchId: number
  calendarId: string
  proposedBy: string | null
  /** Status of newly created activities — defaults to 'draft' */
  defaultStatus?: TimelineActivityStatus
  /** Skip entries flagged as `skipped` */
  dropSkipped?: boolean
}

export interface MaterializedRows {
  activities: Array<
    Omit<
      TimelineActivity,
      'id' | 'created_at' | 'updated_at' | 'approved_by' | 'approved_at'
    >
  >
  /** Parallel array: costs[i] belongs to activity[i] */
  costsPerActivity: Array<
    Array<
      Pick<TimelineActivityCost, 'cost_type' | 'amount' | 'per_student' | 'estimated_students' | 'notes'>
    >
  >
}

export function materializeApplied(params: MaterializeParams): MaterializedRows {
  const status: TimelineActivityStatus = params.defaultStatus ?? 'draft'
  const activities: MaterializedRows['activities'] = []
  const costsPerActivity: MaterializedRows['costsPerActivity'] = []
  for (const a of params.applied) {
    if (a.skipped && params.dropSkipped !== false) continue
    activities.push({
      batch_id: params.batchId,
      calendar_id: params.calendarId,
      activity_type_id: a.rule.activity_type_id,
      title: a.rule.title,
      description: a.rule.description,
      start_date: a.start_hijri_iso,
      end_date: a.end_hijri_iso,
      custom_color: a.rule.custom_color,
      status,
      proposed_by: params.proposedBy,
      notes: a.rule.notes,
    })
    costsPerActivity.push(a.rule.costs)
  }
  return { activities, costsPerActivity }
}

// ─── Internal: span days between two hijri ISOs (same year) ──────────

function spanDays(
  startIso: string,
  endIso: string,
  hy: number,
): number | null {
  const arr = enumerateHijriYear(hy).map((h) => hijriToIso(h))
  const a = arr.indexOf(startIso)
  const b = arr.indexOf(endIso)
  if (a === -1 || b === -1) return null
  return Math.abs(b - a) + 1
}
