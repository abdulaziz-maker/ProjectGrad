// ═══════════════════════════════════════════════
// Hijri Date Utilities — Umm al-Qura Calendar
// Primary: Hijri | Secondary: Gregorian
// ═══════════════════════════════════════════════

export const HIJRI_MONTHS = [
  { num: 1,  name: 'محرم',         short: 'محرم' },
  { num: 2,  name: 'صفر',          short: 'صفر' },
  { num: 3,  name: 'ربيع الأول',   short: 'ربيع١' },
  { num: 4,  name: 'ربيع الآخر',   short: 'ربيع٢' },
  { num: 5,  name: 'جمادى الأولى', short: 'جمادى١' },
  { num: 6,  name: 'جمادى الآخرة', short: 'جمادى٢' },
  { num: 7,  name: 'رجب',          short: 'رجب' },
  { num: 8,  name: 'ش��بان',        short: 'شعب��ن' },
  { num: 9,  name: 'رمضان',        short: 'رمضان' },
  { num: 10, name: 'شوال',         short: 'شوال' },
  { num: 11, name: 'ذو القعدة',    short: 'ذو القع��ة' },
  { num: 12, name: 'ذو الحجة',     short: 'ذو الحجة' },
]

export const AR_DAYS = ['الأحد', 'الا��نين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

// ─── Types ──────────────────────────────────────
export interface HijriDate {
  year: number
  month: number
  day: number
  monthName: string
}

// ─── Gregorian → Hijri ──────────────────────────
const _fmtParts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
  day: 'numeric', month: 'numeric', year: 'numeric',
})

export function gregorianToHijri(dateStr: string): HijriDate {
  if (!dateStr) {
    const today = new Date()
    dateStr = today.toISOString().split('T')[0]
  }
  try {
    const date = new Date(dateStr + 'T12:00:00')
    const parts = _fmtParts.formatToParts(date)
    const month = Number(parts.find(p => p.type === 'month')?.value) || 1
    return {
      year: Number(parts.find(p => p.type === 'year')?.value) || 1447,
      month,
      day: Number(parts.find(p => p.type === 'day')?.value) || 1,
      monthName: HIJRI_MONTHS[month - 1]?.name || '',
    }
  } catch {
    return { year: 1447, month: 1, day: 1, monthName: 'محرم' }
  }
}

// ��── Hijri → Gregorian ───────────────────────���──
export function hijriToGregorian(hYear: number, hMonth: number, hDay: number): string {
  // Estimate: 1 Muharram 1446 ≈ 2024-07-07
  const estDays = (hYear - 1446) * 354 + (hMonth - 1) * 29.5 + hDay
  const ref = new Date('2024-07-07T12:00:00')
  const center = new Date(ref)
  center.setDate(ref.getDate() + Math.round(estDays))

  for (let i = -50; i <= 50; i++) {
    const check = new Date(center)
    check.setDate(center.getDate() + i)
    const parts = _fmtParts.formatToParts(check)
    const y = Number(parts.find(p => p.type === 'year')?.value)
    const m = Number(parts.find(p => p.type === 'month')?.value)
    const d = Number(parts.find(p => p.type === 'day')?.value)
    if (y === hYear && m === hMonth && d === hDay) {
      return check.toISOString().split('T')[0]
    }
  }
  // Day 30 may not exist → try 29
  if (hDay === 30) return hijriToGregorian(hYear, hMonth, 29)
  return new Date().toISOString().split('T')[0]
}

// ─── Days in a Hijri month ──────────────────────
export function hijriDaysInMonth(hYear: number, hMonth: number): number {
  const greg = hijriToGregorian(hYear, hMonth, 30)
  if (!greg) return 29
  const check = gregorianToHijri(greg)
  return (check.month === hMonth && check.day === 30) ? 30 : 29
}

// ─── Display Formatters ─────────────────────────
/** "25 شوال 1447هـ" */
export function formatHijri(dateStr: string): string {
  if (!dateStr) return ''
  const h = gregorianToHijri(dateStr)
  return `${h.day} ${h.monthName} ${h.year}هـ`
}

/** "25 شوال" */
export function formatHijriShort(dateStr: string): string {
  if (!dateStr) return ''
  const h = gregorianToHijri(dateStr)
  return `${h.day} ${HIJRI_MONTHS[h.month - 1]?.short || ''}`
}

/** "الأربعاء 25 شوال 1447هـ" */
export function formatHijriWithDay(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T12:00:00')
  const dayName = AR_DAYS[d.getDay()]
  return `${dayName} ${formatHijri(dateStr)}`
}

/** Full Intl Hijri format (fallback) */
export function toHijriDisplay(dateStr: string): string {
  if (!dateStr) return ''
  try {
    const date = new Date(dateStr + 'T12:00:00')
    return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', {
      day: 'numeric', month: 'long', year: 'numeric',
    }).format(date)
  } catch {
    return formatHijri(dateStr)
  }
}

export function toHijriShort(dateStr: string): string {
  if (!dateStr) return ''
  try {
    const date = new Date(dateStr + 'T12:00:00')
    return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', {
      day: 'numeric', month: 'short',
    }).format(date)
  } catch {
    return formatHijriShort(dateStr)
  }
}

/** Gregorian display (secondary) */
export function toGregorianDisplay(dateStr: string): string {
  if (!dateStr) return ''
  try {
    const date = new Date(dateStr + 'T12:00:00')
    return new Intl.DateTimeFormat('ar-SA', {
      day: 'numeric', month: 'long', year: 'numeric',
    }).format(date)
  } catch {
    return dateStr
  }
}

/** Returns both */
export function formatDateBoth(dateStr: string): { hijri: string; gregorian: string } {
  return { hijri: formatHijri(dateStr), gregorian: toGregorianDisplay(dateStr) }
}

// ─── General Helpers ────────────────────────────
export function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

export function dateToStr(d: Date): string {
  return d.toISOString().split('T')[0]
}

export function getWeekStart(date: Date = new Date()): string {
  const d = new Date(date)
  d.setDate(d.getDate() - d.getDay())
  return d.toISOString().split('T')[0]
}

export function getDayNameAr(dateStr: string): string {
  return AR_DAYS[new Date(dateStr + 'T12:00:00').getDay()]
}
