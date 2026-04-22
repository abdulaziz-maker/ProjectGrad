/**
 * Timeline Feature — TypeScript Types
 * Generated for Phase 1 (Schema) — matches Supabase DB exactly.
 * Do NOT hand-edit columns; add changes via DB migration first, then regenerate.
 */

export type TimelineDayType = 'study' | 'holiday' | 'exam' | 'weekend'
export type TimelineCostModel = 'lump_sum' | 'per_student' | 'detailed'
export type TimelineActivityStatus = 'draft' | 'proposed' | 'approved' | 'cancelled'
export type TimelineAuditAction = 'created' | 'updated' | 'approved' | 'rejected' | 'deleted'

export interface TimelineCalendar {
  id: string
  hijri_year: number
  gregorian_year_start: number
  gregorian_year_end: number
  name: string
  is_active: boolean
  imported_from_file: string | null
  created_at: string
  created_by: string | null
}

export interface TimelineDay {
  id: string
  calendar_id: string
  hijri_date: string   // 'YYYY-MM-DD' (hijri stored as postgres date for native comparison)
  gregorian_date: string
  day_type: TimelineDayType
  notes: string | null
}

export interface TimelineActivityType {
  id: string
  name: string              // stable slug, e.g. 'intensive_course'
  arabic_name: string       // display name in Arabic
  default_color: string     // hex
  cost_model: TimelineCostModel
  default_lump_sum: number | null
  default_per_student: number | null
  icon: string | null       // lucide-react icon name
  is_system: boolean
  created_at: string
}

export interface TimelineActivity {
  id: string
  batch_id: number          // FK → batches.id
  calendar_id: string
  activity_type_id: string | null
  title: string
  description: string | null
  start_date: string
  end_date: string
  custom_color: string | null
  status: TimelineActivityStatus
  proposed_by: string | null
  approved_by: string | null
  approved_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface TimelineActivityCost {
  id: string
  activity_id: string
  cost_type: string          // free-form: "إجمالي", "تغذية", "نقل", ...
  amount: number
  per_student: boolean
  estimated_students: number | null
  notes: string | null
  receipt_url: string | null
  created_at: string
}

export interface TimelinePlanTemplate {
  id: string
  name: string
  batch_id: number | null
  template_data: unknown     // JSONB — shape defined in Phase 2+
  source_year: number | null
  created_at: string
  created_by: string | null
}

export interface TimelineAuditEntry {
  id: string
  activity_id: string | null
  action: TimelineAuditAction | string
  performed_by: string | null
  changes: unknown | null
  performed_at: string
}
