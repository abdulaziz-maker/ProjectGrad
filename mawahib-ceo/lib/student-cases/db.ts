/**
 * Student Cases — Data Layer.
 *
 * All reads/writes are routed through Supabase. Row-level security policies
 * enforce batch isolation + role permissions at the DB level; this layer
 * does NOT re-check authorization — trust the DB.
 *
 * Table naming convention: `student_case_*` prefix to avoid collisions with
 * the pre-existing `followups` / `followup_escalations` tables.
 */
import { supabase } from '@/lib/supabase'
import type {
  WeeklyReview,
  WeeklyReviewStatus,
  WeeklyReviewWithStudent,
  StudentCase,
  CaseStage,
  CaseStatus,
  CaseWithStudent,
  CaseWithHistory,
  CaseTransition,
  CaseAction,
  CaseActionType,
} from './types'
import { weekStartSunday, hijriWeekLabel } from './format'

// ════════════════════════════════════════════════════════════════════
// Weekly Reviews
// ════════════════════════════════════════════════════════════════════

const WR_COLS =
  'id,week_start_date,hijri_week_label,student_id,batch_id,supervisor_id,status,notes,action_taken,parent_contacted,created_at,updated_at,completed_at'

/**
 * Fetch all weekly review rows for the current week, joined with student name.
 * RLS automatically scopes results:
 *  - supervisor → only their students
 *  - batch_manager → only their batch
 *  - ceo / records_officer → all
 */
export async function getCurrentWeekReviews(
  weekStart: string = weekStartSunday()
): Promise<WeeklyReviewWithStudent[]> {
  const { data, error } = await supabase
    .from('student_case_weekly_reviews')
    .select(`${WR_COLS}, student:students(id,name,juz_completed)`)
    .eq('week_start_date', weekStart)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(rowToWeeklyReviewWithStudent)
}

/**
 * Fetch weekly review history for a single student (most recent first).
 */
export async function getStudentWeeklyHistory(
  studentId: string,
  limit = 12
): Promise<WeeklyReview[]> {
  const { data, error } = await supabase
    .from('student_case_weekly_reviews')
    .select(WR_COLS)
    .eq('student_id', studentId)
    .order('week_start_date', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as WeeklyReview[]
}

export interface UpsertWeeklyReviewInput {
  student_id: string
  batch_id: number
  supervisor_id?: string | null
  week_start_date?: string     // defaults to current Sunday
  status: WeeklyReviewStatus
  notes?: string | null
  action_taken?: string | null
  parent_contacted?: boolean
}

/**
 * Upsert a weekly review row. Uses the UNIQUE(week_start_date, student_id)
 * index as the conflict target so the same supervisor can edit during the
 * week without creating duplicates.
 */
export async function upsertWeeklyReview(
  input: UpsertWeeklyReviewInput
): Promise<WeeklyReview> {
  const week_start_date = input.week_start_date ?? weekStartSunday()
  const payload = {
    student_id: input.student_id,
    batch_id: input.batch_id,
    supervisor_id: input.supervisor_id ?? null,
    week_start_date,
    hijri_week_label: hijriWeekLabel(week_start_date),
    status: input.status,
    notes: input.notes ?? null,
    action_taken: input.action_taken ?? null,
    parent_contacted: input.parent_contacted ?? false,
    completed_at:
      input.status === 'not_reviewed' ? null : new Date().toISOString(),
  }
  const { data, error } = await supabase
    .from('student_case_weekly_reviews')
    .upsert(payload, { onConflict: 'week_start_date,student_id' })
    .select(WR_COLS)
    .single()
  if (error) throw error
  return data as WeeklyReview
}

/** Recent reviews across the whole batch (for manager dashboard). */
export async function getBatchRecentReviews(
  batchId: number,
  limit = 50
): Promise<WeeklyReviewWithStudent[]> {
  const { data, error } = await supabase
    .from('student_case_weekly_reviews')
    .select(`${WR_COLS}, student:students(id,name,juz_completed)`)
    .eq('batch_id', batchId)
    .order('week_start_date', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []).map(rowToWeeklyReviewWithStudent)
}

// ════════════════════════════════════════════════════════════════════
// Cases — core table
// ════════════════════════════════════════════════════════════════════

const CASE_COLS =
  'id,student_id,batch_id,current_stage,started_at,stage_entered_at,current_responsible_id,trigger_reason,root_cause,status,outcome,closed_at,closed_by,created_at,updated_at'

const CASE_COLS_JOINED = `${CASE_COLS}, student:students(id,name,supervisor_id,juz_completed), batch:batches(id,name)`

export interface GetCasesFilters {
  batchId?: number
  stage?: CaseStage
  status?: CaseStatus
  studentId?: string
}

export async function getCases(
  filters: GetCasesFilters = {}
): Promise<CaseWithStudent[]> {
  let q = supabase
    .from('student_cases')
    .select(CASE_COLS_JOINED)
    .order('stage_entered_at', { ascending: false })

  if (filters.batchId !== undefined) q = q.eq('batch_id', filters.batchId)
  if (filters.stage) q = q.eq('current_stage', filters.stage)
  if (filters.status) q = q.eq('status', filters.status)
  if (filters.studentId) q = q.eq('student_id', filters.studentId)

  const { data, error } = await q
  if (error) throw error
  return (data ?? []).map(rowToCaseWithStudent)
}

/** Find the current active case for a student (0 or 1 row). */
export async function getActiveCaseForStudent(
  studentId: string
): Promise<StudentCase | null> {
  const { data, error } = await supabase
    .from('student_cases')
    .select(CASE_COLS)
    .eq('student_id', studentId)
    .eq('status', 'active')
    .maybeSingle()
  if (error) throw error
  return (data ?? null) as StudentCase | null
}

/** Fetch one case with transitions + actions, for the detail page. */
export async function getCaseWithHistory(
  caseId: string
): Promise<CaseWithHistory | null> {
  const { data: caseRow, error: e1 } = await supabase
    .from('student_cases')
    .select(CASE_COLS_JOINED)
    .eq('id', caseId)
    .maybeSingle()
  if (e1) throw e1
  if (!caseRow) return null

  const [transitions, actions] = await Promise.all([
    listCaseTransitions(caseId),
    listCaseActions(caseId),
  ])

  return {
    ...rowToCaseWithStudent(caseRow),
    transitions,
    actions,
  }
}

export interface CreateCaseInput {
  student_id: string
  batch_id: number
  trigger_reason: string
  current_responsible_id?: string | null
  root_cause?: string | null
}

/**
 * Open a new stage_1 case. DB UNIQUE index prevents duplicate active cases
 * per student — caller should check with `getActiveCaseForStudent()` first
 * and surface a friendly error if already open.
 */
export async function createCase(input: CreateCaseInput): Promise<StudentCase> {
  const { data, error } = await supabase
    .from('student_cases')
    .insert({
      student_id: input.student_id,
      batch_id: input.batch_id,
      current_stage: 'stage_1_supervisor',
      trigger_reason: input.trigger_reason,
      root_cause: input.root_cause ?? null,
      current_responsible_id: input.current_responsible_id ?? null,
      status: 'active',
    })
    .select(CASE_COLS)
    .single()
  if (error) throw error
  return data as StudentCase
}

/**
 * Move a case to the next stage. The DB trigger `log_case_stage_change`
 * auto-writes the transition row.
 */
export async function escalateCase(
  caseId: string,
  nextStage: CaseStage,
  reason: string,
  newResponsibleId?: string | null
): Promise<StudentCase> {
  const patch: Partial<StudentCase> = {
    current_stage: nextStage,
    trigger_reason: reason,            // trigger uses this in its INSERT
    current_responsible_id: newResponsibleId ?? null,
  }
  const { data, error } = await supabase
    .from('student_cases')
    .update(patch)
    .eq('id', caseId)
    .select(CASE_COLS)
    .single()
  if (error) throw error
  return data as StudentCase
}

/** Update non-stage fields (root_cause, status transitions within same stage). */
export async function updateCaseFields(
  caseId: string,
  patch: Partial<Pick<StudentCase, 'root_cause' | 'status' | 'outcome' | 'trigger_reason'>>
): Promise<StudentCase> {
  const { data, error } = await supabase
    .from('student_cases')
    .update(patch)
    .eq('id', caseId)
    .select(CASE_COLS)
    .single()
  if (error) throw error
  return data as StudentCase
}

/**
 * Close a case permanently (outcome + closed_by stamped).
 * Only batch_manager & CEO are allowed — RLS enforces this at the DB level.
 */
export async function closeCase(
  caseId: string,
  outcome: string,
  finalStage: 'resolved' | 'closed' = 'closed',
  closedBy?: string
): Promise<StudentCase> {
  const { data, error } = await supabase
    .from('student_cases')
    .update({
      current_stage: finalStage,
      status: finalStage,
      outcome,
      closed_at: new Date().toISOString(),
      closed_by: closedBy ?? null,
      trigger_reason: `إغلاق: ${outcome}`,
    })
    .eq('id', caseId)
    .select(CASE_COLS)
    .single()
  if (error) throw error
  return data as StudentCase
}

// ════════════════════════════════════════════════════════════════════
// Transitions
// ════════════════════════════════════════════════════════════════════

const TRANS_COLS =
  'id,case_id,from_stage,to_stage,transition_type,transitioned_at,transitioned_by,reason,notes'

export async function listCaseTransitions(caseId: string): Promise<CaseTransition[]> {
  const { data, error } = await supabase
    .from('student_case_transitions')
    .select(TRANS_COLS)
    .eq('case_id', caseId)
    .order('transitioned_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as CaseTransition[]
}

// ════════════════════════════════════════════════════════════════════
// Actions
// ════════════════════════════════════════════════════════════════════

const ACTION_COLS =
  'id,case_id,actor_id,action_type,description,outcome,occurred_at,created_at'

export async function listCaseActions(caseId: string): Promise<CaseAction[]> {
  const { data, error } = await supabase
    .from('student_case_actions')
    .select(ACTION_COLS)
    .eq('case_id', caseId)
    .order('occurred_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as CaseAction[]
}

export interface AddActionInput {
  case_id: string
  actor_id: string
  action_type: CaseActionType
  description: string
  outcome?: string | null
  occurred_at?: string
}

export async function addCaseAction(input: AddActionInput): Promise<CaseAction> {
  const { data, error } = await supabase
    .from('student_case_actions')
    .insert({
      case_id: input.case_id,
      actor_id: input.actor_id,
      action_type: input.action_type,
      description: input.description,
      outcome: input.outcome ?? null,
      occurred_at: input.occurred_at ?? new Date().toISOString(),
    })
    .select(ACTION_COLS)
    .single()
  if (error) throw error
  return data as CaseAction
}

// ════════════════════════════════════════════════════════════════════
// Helpers — row shape normalization
// ════════════════════════════════════════════════════════════════════

interface StudentJoin {
  id: string
  name: string
  supervisor_id?: string | null
  juz_completed?: number | null
}

interface BatchJoin {
  id: number
  name: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToWeeklyReviewWithStudent(row: any): WeeklyReviewWithStudent {
  const student = row.student as StudentJoin | null
  return {
    id: row.id,
    week_start_date: row.week_start_date,
    hijri_week_label: row.hijri_week_label,
    student_id: row.student_id,
    batch_id: row.batch_id,
    supervisor_id: row.supervisor_id,
    status: row.status,
    notes: row.notes,
    action_taken: row.action_taken,
    parent_contacted: !!row.parent_contacted,
    created_at: row.created_at,
    updated_at: row.updated_at,
    completed_at: row.completed_at,
    student_name: student?.name ?? row.student_id,
    juz_completed: student?.juz_completed ?? null,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToCaseWithStudent(row: any): CaseWithStudent {
  const student = row.student as StudentJoin | null
  const batch = row.batch as BatchJoin | null
  return {
    id: row.id,
    student_id: row.student_id,
    batch_id: row.batch_id,
    current_stage: row.current_stage,
    started_at: row.started_at,
    stage_entered_at: row.stage_entered_at,
    current_responsible_id: row.current_responsible_id,
    trigger_reason: row.trigger_reason,
    root_cause: row.root_cause,
    status: row.status,
    outcome: row.outcome,
    closed_at: row.closed_at,
    closed_by: row.closed_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    student_name: student?.name ?? row.student_id,
    supervisor_id: student?.supervisor_id ?? null,
    batch_name: batch?.name ?? null,
  }
}
