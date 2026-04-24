/**
 * Convert Western (Latin) digits to Arabic-Indic digits
 * 0→٠, 1→١, 2→٢, 3→٣, 4→٤, 5→٥, 6→٦, 7→٧, 8→٨, 9→٩
 */

const ARABIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩']

/**
 * Convert any number or string containing digits to Arabic-Indic numerals.
 * Handles negative numbers, decimals, and percentages.
 *
 * Examples:
 *   toAr(42)       → "٤٢"
 *   toAr("100%")   → "١٠٠%"
 *   toAr(3.5)      → "٣.٥"
 *   toAr("دفعة 46") → "دفعة ٤٦"
 */
export function toAr(input: string | number): string {
  return String(input).replace(/[0-9]/g, d => ARABIC_DIGITS[parseInt(d)])
}

/**
 * Format a number with Arabic digits and optional suffix
 */
export function toArNum(n: number, suffix?: string): string {
  const formatted = toAr(n)
  return suffix ? `${formatted}${suffix}` : formatted
}

/**
 * Format percentage with Arabic digits
 */
export function toArPct(n: number): string {
  return `${toAr(Math.round(n))}٪`
}
