export type BatchId = 42 | 44 | 46 | 48

export interface Batch {
  id: BatchId
  name: string
  grade_levels: string
  manager_id: string
  manager_name: string
  student_count: number
  completion_percentage: number
}

export interface Supervisor {
  id: string
  name: string
  age: number
  specialty: string
  experience_years: number
  strengths: string
  weaknesses: string
  rating: number
  student_count: number
  last_report_date: string | null
  avg_student_progress: number
  notes: string
}

export interface Teacher {
  id: string
  name: string
  batch_id: BatchId | null
  certification: string
  status: 'active' | 'inactive'
  performance_rating: number
  notes: string
}

export interface Student {
  id: string
  name: string
  batch_id: BatchId
  supervisor_id: string
  supervisor_name?: string
  enrollment_date: string
  status: 'active' | 'suspended' | 'graduated'
  notes: string
  juz_completed: number
  completion_percentage: number
  last_followup: string | null
}

export interface AttendanceRecord {
  id: string
  student_id: string
  student_name?: string
  date: string
  status: 'present' | 'absent' | 'late'
  excuse_reason: string | null
}

export interface QuranProgress {
  id: string
  student_id: string
  juz_number: number
  status: 'memorized' | 'in_progress' | 'failed' | 'not_started'
  exam_date: string | null
  exam_score: number | null
  review_score: number | null
  examiner_name: string | null
}

export interface Program {
  id: string
  name: string
  batch_id: BatchId
  type: 'club' | 'short' | 'long'
  start_date: string
  end_date: string
  location: string
  budget: number
  objectives: string
  report: string | null
  status: 'upcoming' | 'ongoing' | 'completed'
}

export interface Meeting {
  id: string
  type: 'general_management' | 'executive' | 'annual_planning' | 'quarterly_teachers'
  date: string
  attendees: string[]
  agenda: string
  decisions: string | null
  attachments: string[]
}

export interface BudgetRecord {
  id: string
  batch_id: BatchId | null
  month: number
  year: number
  allocated: number
  spent: number
  status: 'open' | 'closed'
  notes: string
}

export interface FeeRecord {
  id: string
  student_id: string
  student_name?: string
  year: number
  amount: number
  paid_amount: number
  status: 'paid' | 'partial' | 'pending' | 'exempt'
  payment_dates: string[]
}

export interface Report {
  id: string
  type: 'monthly' | 'quarterly' | 'program' | 'teachers'
  period: string
  data_json: Record<string, unknown>
  created_at: string
}

export type AlertType = 'danger' | 'warning' | 'info'

export interface Alert {
  id: string
  type: AlertType
  title: string
  description: string
  link?: string
}
