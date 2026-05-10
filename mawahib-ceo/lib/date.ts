/**
 * Format a Date as local-timezone YYYY-MM-DD string.
 *
 * Why this exists: `Date.prototype.toISOString()` always returns UTC, which
 * shifts the date by -3 hours for KSA users — a Saturday afternoon becomes
 * Saturday morning UTC, but a Friday after 9pm KSA becomes Saturday UTC.
 * This helper preserves the user's local calendar date.
 *
 * Used in cron routes (KSA scheduling) and dashboards (week-aligned ranges).
 */
export function localDateIso(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}
