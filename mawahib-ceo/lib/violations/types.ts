// ═══════════════════════════════════════════════════════
// أنواع إخلالات المتابعة الأسبوعية
// ═══════════════════════════════════════════════════════

export interface WeeklyViolation {
  id?: number
  supervisor_id: string
  supervisor_name?: string | null
  student_id: string
  student_name?: string | null
  batch_id?: number | null
  /** السبت (YYYY-MM-DD) */
  week_start: string
  /** الخميس (YYYY-MM-DD) */
  week_end: string
  recorded_at?: string
  resolved_at?: string | null
  resolution_note?: string | null
}

export interface ViolationFilters {
  supervisorId?: string
  studentId?: string
  batchId?: number
  weekStart?: string
  fromDate?: string
  toDate?: string
}

export interface SupervisorViolationSummary {
  supervisor_id: string
  supervisor_name: string
  batch_id: number | null
  total_violations: number
  weeks_with_violations: number
  unique_students_missed: number
  last_violation_date: string | null
}
