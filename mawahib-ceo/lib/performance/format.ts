/**
 * Formatting helpers for performance reports.
 */
import type { SubjectColumnsKind, EntryColumnKey, SubjectTrack, PeriodType } from './types'

export const TRACK_LABEL: Record<SubjectTrack, string> = {
  academic:    'المساق العلمي',
  educational: 'المساق التربوي',
}

export const COLUMN_LABEL: Record<EntryColumnKey, string> = {
  memorization: 'الحفظ',
  revision:     'المراجعة',
  single:       'العمود',
  attendance:   'الحضور',
}

export const PERIOD_TYPE_LABEL: Record<PeriodType, string> = {
  year:  'العام',
  term:  'الفصل',
  month: 'الشهر',
}

export const HIJRI_MONTHS_AR = [
  'محرّم', 'صفر', 'ربيع الأول', 'ربيع الآخر',
  'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان',
  'رمضان', 'شوّال', 'ذو القعدة', 'ذو الحجّة',
] as const

/**
 * إرجاع تسميات أعمدة المساق حسب نوعه:
 *   - dual       → ['memorization', 'revision']
 *   - single     → ['single']
 *   - attendance → ['attendance']
 */
export function columnsForKind(kind: SubjectColumnsKind): EntryColumnKey[] {
  if (kind === 'dual') return ['memorization', 'revision']
  if (kind === 'single') return ['single']
  return ['attendance']
}

/** يحسب نسبة الإنجاز ٪ ويُرجع رقم 0-200 (يتجاوز 100% لو الفعلي أكبر) */
export function calcPercent(expected: number | null | undefined, actual: number | null | undefined): number | null {
  if (expected == null || expected === 0) return null
  if (actual == null) return null
  return Math.round((actual / expected) * 100)
}

/**
 * لون الخلفية حسب نسبة الإنجاز (نمط الجدول الأصلي)
 *   ≥ 85%  → أخضر
 *   70-84% → أصفر
 *   < 70%  → أحمر
 *   null   → بدون لون
 */
export interface CellPalette { bg: string; text: string }

export function paletteForPercent(pct: number | null): CellPalette | null {
  if (pct == null) return null
  if (pct >= 85) return { bg: 'rgba(90,143,103,0.18)', text: '#3F6E4B' }
  if (pct >= 70) return { bg: 'rgba(217,176,73,0.22)', text: '#7A4E1E' }
  return { bg: 'rgba(185,72,56,0.16)', text: '#8B2F23' }
}

/** متوسط نسب جميع الأعمدة (للنسبة الإجمالية للمسار أو للطالب) */
export function averagePercent(percents: (number | null)[]): number | null {
  const valid = percents.filter((p): p is number => p != null)
  if (valid.length === 0) return null
  return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length)
}

/** بناء تسمية فترة: مثل "ربيع الأول 1447هـ" */
export function buildPeriodLabel(type: PeriodType, hijriYear: number, monthOrTerm?: number | null): string {
  if (type === 'year') return `عام ${hijriYear}هـ`
  if (type === 'term') return `الفصل ${monthOrTerm === 1 ? 'الأول' : 'الثاني'} — ${hijriYear}هـ`
  if (type === 'month' && monthOrTerm != null) {
    return `${HIJRI_MONTHS_AR[monthOrTerm - 1]} ${hijriYear}هـ`
  }
  return ''
}
