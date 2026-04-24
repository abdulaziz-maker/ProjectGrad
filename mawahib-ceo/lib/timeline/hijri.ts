/**
 * Hijri date utilities — Hijri-first, Gregorian secondary.
 *
 * All public functions:
 * - Accept/return Hijri as the "primary" date.
 * - Expose a Gregorian helper explicitly labeled as such.
 * - Use Umm al-Qura via hijri-converter.
 */
import { toHijri, toGregorian } from 'hijri-converter'

export interface HijriYMD { hy: number; hm: number; hd: number }
export interface GregorianYMD { gy: number; gm: number; gd: number }

/** Arabic names of the 12 Hijri months. */
export const HIJRI_MONTHS_AR = [
  'محرم', 'صفر', 'ربيع الأول', 'ربيع الآخر',
  'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان',
  'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة',
] as const

export const HIJRI_WEEKDAYS_AR = [
  'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء',
  'الخميس', 'الجمعة', 'السبت',
] as const

/** Parse 'YYYY-MM-DD' (Gregorian ISO) → GregorianYMD. */
export function parseGregorianIso(iso: string): GregorianYMD | null {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(iso.trim())
  if (!m) return null
  const gy = Number(m[1]), gm = Number(m[2]), gd = Number(m[3])
  if (gm < 1 || gm > 12 || gd < 1 || gd > 31) return null
  return { gy, gm, gd }
}

/** Parse 'YYYY-MM-DD' (Hijri string) → HijriYMD. */
export function parseHijriIso(iso: string): HijriYMD | null {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(iso.trim())
  if (!m) return null
  const hy = Number(m[1]), hm = Number(m[2]), hd = Number(m[3])
  if (hm < 1 || hm > 12 || hd < 1 || hd > 30) return null
  return { hy, hm, hd }
}

/** Format ISO string from HijriYMD. */
export function hijriIso(h: HijriYMD): string {
  return `${h.hy}-${String(h.hm).padStart(2, '0')}-${String(h.hd).padStart(2, '0')}`
}

/** Format ISO string from GregorianYMD. */
export function gregorianIso(g: GregorianYMD): string {
  return `${g.gy}-${String(g.gm).padStart(2, '0')}-${String(g.gd).padStart(2, '0')}`
}

/** Convert Hijri → Gregorian. */
export function hijriToGregorian(h: HijriYMD): GregorianYMD {
  return toGregorian(h.hy, h.hm, h.hd)
}

/** Convert Gregorian → Hijri. */
export function gregorianToHijri(g: GregorianYMD): HijriYMD {
  return toHijri(g.gy, g.gm, g.gd)
}

/**
 * Human-readable Hijri date in Arabic.
 * Example: (1447, 1, 15) → "١٥ محرم ١٤٤٧هـ"
 */
export function formatHijriAr(h: HijriYMD): string {
  return `${h.hd} ${HIJRI_MONTHS_AR[h.hm - 1]} ${h.hy}هـ`
}

/**
 * Human-readable Gregorian date (short form).
 * Example: (2025, 7, 26) → "26-07-2025"
 */
export function formatGregorianShort(g: GregorianYMD): string {
  return `${String(g.gd).padStart(2, '0')}-${String(g.gm).padStart(2, '0')}-${g.gy}`
}

/**
 * Validate a hijri↔gregorian pair matches (via conversion).
 * Returns null when consistent, or an error string.
 */
export function validateHijriGregorianPair(
  hijri: HijriYMD,
  gregorian: GregorianYMD,
): string | null {
  try {
    const expectedGreg = hijriToGregorian(hijri)
    if (
      expectedGreg.gy !== gregorian.gy ||
      expectedGreg.gm !== gregorian.gm ||
      expectedGreg.gd !== gregorian.gd
    ) {
      return `تعارض: ${hijriIso(hijri)} هجري يقابل ${gregorianIso(expectedGreg)} لا ${gregorianIso(gregorian)}`
    }
    return null
  } catch (err) {
    return `تاريخ غير صالح: ${err instanceof Error ? err.message : String(err)}`
  }
}

/** Gregorian weekday (0=Sun .. 6=Sat) for a given Hijri date. */
export function hijriWeekday(h: HijriYMD): number {
  const g = hijriToGregorian(h)
  const d = new Date(Date.UTC(g.gy, g.gm - 1, g.gd))
  return d.getUTCDay()
}

/** Is Gregorian weekday considered weekend in KSA? (Friday=5, Saturday=6). */
export function isKSAWeekend(weekday: number): boolean {
  return weekday === 5 || weekday === 6
}

/**
 * Generate every Hijri day from (hy, 1, 1) to (hy, 12, last).
 * Since Umm al-Qura month lengths vary, we iterate via Gregorian JDN under the hood:
 * start at hy/1/1 Gregorian equivalent and advance 1 day at a time until we pass hy/12/end.
 */
export function enumerateHijriYear(hy: number): HijriYMD[] {
  const firstGreg = hijriToGregorian({ hy, hm: 1, hd: 1 })
  const nextYearFirstGreg = hijriToGregorian({ hy: hy + 1, hm: 1, hd: 1 })

  const start = Date.UTC(firstGreg.gy, firstGreg.gm - 1, firstGreg.gd)
  const end = Date.UTC(nextYearFirstGreg.gy, nextYearFirstGreg.gm - 1, nextYearFirstGreg.gd)
  const MS_DAY = 24 * 60 * 60 * 1000

  const out: HijriYMD[] = []
  for (let t = start; t < end; t += MS_DAY) {
    const d = new Date(t)
    const g: GregorianYMD = { gy: d.getUTCFullYear(), gm: d.getUTCMonth() + 1, gd: d.getUTCDate() }
    out.push(gregorianToHijri(g))
  }
  return out
}

/** Count days in a Hijri year (354 or 355). */
export function hijriYearLength(hy: number): number {
  return enumerateHijriYear(hy).length
}

/** Get start/end Gregorian years covered by a Hijri year. */
export function hijriYearGregorianRange(hy: number): { start: number; end: number } {
  const a = hijriToGregorian({ hy, hm: 1, hd: 1 })
  const b = hijriToGregorian({ hy, hm: 12, hd: 29 })
  return { start: a.gy, end: b.gy }
}
