/**
 * Student Cases System — TypeScript Types.
 *
 * Matches the 4 tables in supabase-student-cases-migration.sql exactly:
 *   - student_case_weekly_reviews
 *   - student_cases
 *   - student_case_transitions
 *   - student_case_actions
 *
 * Do NOT hand-edit columns — add changes via DB migration first.
 */

// ─── Enums ──────────────────────────────────────────────────────────
export type WeeklyReviewStatus =
  | 'on_track'        // سير طبيعي
  | 'slight_delay'    // تأخر بسيط
  | 'severe_delay'    // تأخر كبير
  | 'not_reviewed'    // لم يُراجَع بعد

export type CaseStage =
  | 'stage_1_supervisor'    // مرحلة ١: المشرف
  | 'stage_2_batch_manager' // مرحلة ٢: مدير الدفعة
  | 'stage_3_ceo'           // مرحلة ٣: المدير التنفيذي
  | 'resolved'              // تم حل الحالة
  | 'closed'                // مغلقة نهائياً

export type CaseStatus = 'active' | 'improving' | 'resolved' | 'closed'

export type CaseTransitionType =
  | 'auto'             // نقل تلقائي (مؤتمت)
  | 'manual_escalate'  // تصعيد يدوي للأعلى
  | 'manual_demote'    // إعادة للأسفل
  | 'close'            // إغلاق

export type CaseActionType =
  | 'supervisor_meeting'   // اجتماع مع المشرف
  | 'parent_call'          // اتصال بولي الأمر
  | 'parent_meeting'       // لقاء مع ولي الأمر
  | 'ceo_intervention'     // تدخل المدير التنفيذي
  | 'plan_adjustment'      // تعديل الخطة
  | 'note'                 // ملاحظة عامة

// ─── Table shapes ───────────────────────────────────────────────────
export interface WeeklyReview {
  id: string
  week_start_date: string        // 'YYYY-MM-DD' (gregorian sunday)
  hijri_week_label: string       // "الأسبوع 10 - 1447"
  student_id: string
  batch_id: number
  supervisor_id: string | null
  status: WeeklyReviewStatus
  notes: string | null
  action_taken: string | null
  parent_contacted: boolean
  created_at: string
  updated_at: string
  completed_at: string | null
}

export interface StudentCase {
  id: string
  student_id: string
  batch_id: number
  current_stage: CaseStage
  started_at: string
  stage_entered_at: string
  current_responsible_id: string | null
  trigger_reason: string
  root_cause: string | null
  status: CaseStatus
  outcome: string | null
  closed_at: string | null
  closed_by: string | null
  created_at: string
  updated_at: string
}

export interface CaseTransition {
  id: string
  case_id: string
  from_stage: CaseStage | null
  to_stage: CaseStage
  transition_type: CaseTransitionType
  transitioned_at: string
  transitioned_by: string | null
  reason: string
  notes: string | null
}

export interface CaseAction {
  id: string
  case_id: string
  actor_id: string
  action_type: CaseActionType
  description: string
  outcome: string | null
  occurred_at: string
  created_at: string
}

// ─── Joined/enriched shapes for UI ──────────────────────────────────
export interface WeeklyReviewWithStudent extends WeeklyReview {
  student_name: string
  supervisor_name?: string | null
  juz_completed?: number | null
}

export interface CaseWithStudent extends StudentCase {
  student_name: string
  supervisor_name?: string | null
  supervisor_id?: string | null
  batch_name?: string | null
}

export interface CaseWithHistory extends CaseWithStudent {
  transitions: CaseTransition[]
  actions: CaseAction[]
  weekly_reviews?: WeeklyReview[]
}
