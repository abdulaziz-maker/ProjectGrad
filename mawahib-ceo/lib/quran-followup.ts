/**
 * Helpers used by the followup-escalation cron route.
 *
 * NOTE: This file was missing from the repo (build broke). Restored with a
 * minimal, conservative implementation so the project builds. Review the
 * thresholds against product requirements before treating them as canonical.
 */

export type EscalationLevel = 'supervisor' | 'manager' | 'director' | 'ceo'

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
