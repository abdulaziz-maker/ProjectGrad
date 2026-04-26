/**
 * أنواع نظام تقارير الأداء
 *
 * Tables:
 *   - report_subjects             — قائمة المساقات (ديناميكية)
 *   - report_subject_exclusions   — استثناء طالب من مساق
 *   - performance_periods         — الفترات (سنة/فصل/شهر)
 *   - performance_entries         — القيم (مفترض + فعلي)
 */

export type SubjectTrack = 'academic' | 'educational'
export type SubjectColumnsKind = 'dual' | 'single' | 'attendance'
export type EntryColumnKey = 'memorization' | 'revision' | 'single' | 'attendance'
export type PeriodType = 'year' | 'term' | 'month'

export interface ReportSubject {
  id: string
  batch_id: number | null
  name: string
  track: SubjectTrack
  columns_kind: SubjectColumnsKind
  single_label: string | null
  unit: string | null
  sort_order: number
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface SubjectExclusion {
  id: string
  subject_id: string
  student_id: string
  excluded_by: string | null
  reason: string | null
  created_at: string
}

export interface PerformancePeriod {
  id: string
  batch_id: number
  period_type: PeriodType
  hijri_year: number
  term_no: number | null
  hijri_month: number | null
  label: string
  sort_order: number
  is_active: boolean
  created_at: string
}

export interface PerformanceEntry {
  id: string
  period_id: string
  student_id: string
  subject_id: string
  column_key: EntryColumnKey
  expected: number | null
  actual: number | null
  notes: string | null
  updated_by: string | null
  updated_at: string
}

/** Map سريع: subject_id → entries لكل عمود */
export type EntriesByCell = Map<string, PerformanceEntry>
// المفتاح: `${student_id}:${subject_id}:${column_key}`
export const cellKey = (
  student_id: string,
  subject_id: string,
  column_key: EntryColumnKey
) => `${student_id}:${subject_id}:${column_key}`
