/**
 * Helpers used by the followup-escalation cron route.
 *
 * NOTE: This file was missing from the repo (build broke). Restored with a
 * minimal, conservative implementation so the project builds. Review the
 * thresholds against product requirements before treating them as canonical.
 */

export type EscalationLevel = 'supervisor' | 'manager' | 'director' | 'ceo'

export interface QuranPlan {
  id?: string
  student_id: string
  start_date: string
  end_date: string
  start_position: number
  daily_rate: number
  is_active: boolean
}

export interface DailyFollowup {
  id?: string
  student_id: string
  supervisor_id: string | null
  followup_date: string
  expected_position: number
  actual_position: number
  gap: number
  is_exam_day: boolean
  near_review: string | null
  far_review: string | null
  delay_reasons: string | null
  treatment_actions: string | null
  notes: string | null
}

export interface BatchScheduleEntry {
  batch_id: number
  date: string
  day_type: string
}

export interface FollowupEscalation {
  id?: string
  student_id: string
  student_name: string
  supervisor_id: string | null
  batch_id: number | null
  weeks_delayed: number
  level: EscalationLevel
  triggered_at: string
  resolved_at: string | null
  action_taken: string | null
  status: string
}

/**
 * Map "weeks delayed" to escalation level.
 *  1w → supervisor, 2w → manager, 3w → director, 4w+ → ceo
 */
export function getEscalationLevel(weeksDelayed: number): EscalationLevel {
  if (weeksDelayed <= 1) return 'supervisor'
  if (weeksDelayed === 2) return 'manager'
  if (weeksDelayed === 3) return 'director'
  return 'ceo'
}
