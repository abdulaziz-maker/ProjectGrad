/**
 * Timeline — Data Layer.
 *
 * Isolated from lib/db.ts. All helpers operate on timeline_* tables only.
 * FK: timeline_activities.batch_id → batches(id) (read-only for existing table).
 *
 * RLS at DB level ensures supervisors/managers only see/write their batch.
 * This layer does NOT re-check permissions — trust the DB.
 */
import { supabase } from '@/lib/supabase'
import type {
  TimelineCalendar,
  TimelineDay,
  TimelineActivityType,
  TimelineActivity,
  TimelineActivityCost,
  TimelinePlanTemplate,
  TimelineAuditEntry,
  TimelineAuditAction,
} from '@/types/timeline'

// ─── Calendars ───────────────────────────────────────────────────────
export async function getCalendars(): Promise<TimelineCalendar[]> {
  const { data, error } = await supabase
    .from('timeline_calendars')
    .select('id,hijri_year,gregorian_year_start,gregorian_year_end,name,is_active,imported_from_file,created_at,created_by')
    .order('hijri_year', { ascending: false })
  if (error) throw error
  return (data ?? []) as TimelineCalendar[]
}

export async function getActiveCalendar(): Promise<TimelineCalendar | null> {
  const { data, error } = await supabase
    .from('timeline_calendars')
    .select('id,hijri_year,gregorian_year_start,gregorian_year_end,name,is_active,imported_from_file,created_at,created_by')
    .eq('is_active', true)
    .maybeSingle()
  if (error) throw error
  return (data ?? null) as TimelineCalendar | null
}

// ─── Days ────────────────────────────────────────────────────────────
export async function getDays(calendarId: string): Promise<TimelineDay[]> {
  const { data, error } = await supabase
    .from('timeline_days')
    .select('id,calendar_id,hijri_date,gregorian_date,day_type,notes')
    .eq('calendar_id', calendarId)
    .order('hijri_date', { ascending: true })
  if (error) throw error
  return (data ?? []) as TimelineDay[]
}

export async function replaceCalendarDays(
  calendarId: string,
  days: Array<Omit<TimelineDay, 'id' | 'calendar_id'> & { calendar_id?: string }>,
): Promise<void> {
  // Strategy: delete-then-insert inside the same call sequence.
  // Small N (~355 rows max), so batching isn't needed.
  const { error: delErr } = await supabase
    .from('timeline_days')
    .delete()
    .eq('calendar_id', calendarId)
  if (delErr) throw delErr

  if (days.length === 0) return
  const payload = days.map((d) => ({ ...d, calendar_id: calendarId }))
  const { error: insErr } = await supabase.from('timeline_days').insert(payload)
  if (insErr) throw insErr
}

export async function updateDayType(
  dayId: string,
  day_type: TimelineDay['day_type'],
  notes?: string | null,
): Promise<void> {
  const patch: Partial<TimelineDay> = { day_type }
  if (notes !== undefined) patch.notes = notes
  const { error } = await supabase.from('timeline_days').update(patch).eq('id', dayId)
  if (error) throw error
}

// ─── Calendar mutations ──────────────────────────────────────────────
export async function createCalendar(
  c: Pick<TimelineCalendar, 'hijri_year' | 'gregorian_year_start' | 'gregorian_year_end' | 'name'> & {
    imported_from_file?: string | null
    created_by?: string | null
  },
): Promise<TimelineCalendar> {
  const { data, error } = await supabase
    .from('timeline_calendars')
    .insert({
      hijri_year: c.hijri_year,
      gregorian_year_start: c.gregorian_year_start,
      gregorian_year_end: c.gregorian_year_end,
      name: c.name,
      imported_from_file: c.imported_from_file ?? null,
      created_by: c.created_by ?? null,
      is_active: false,
    })
    .select('id,hijri_year,gregorian_year_start,gregorian_year_end,name,is_active,imported_from_file,created_at,created_by')
    .single()
  if (error) throw error
  return data as TimelineCalendar
}

export async function deleteCalendar(id: string): Promise<void> {
  const { error } = await supabase.from('timeline_calendars').delete().eq('id', id)
  if (error) throw error
}

/** Activate one calendar (deactivates every other — single-active invariant). */
export async function setActiveCalendar(id: string): Promise<void> {
  // Two-step: clear all flags, then set one. RLS already ensures only CEO/records_officer.
  const { error: e1 } = await supabase
    .from('timeline_calendars')
    .update({ is_active: false })
    .neq('id', id)
  if (e1) throw e1
  const { error: e2 } = await supabase
    .from('timeline_calendars')
    .update({ is_active: true })
    .eq('id', id)
  if (e2) throw e2
}

// ─── Activity Types ──────────────────────────────────────────────────
export async function getActivityTypes(): Promise<TimelineActivityType[]> {
  const { data, error } = await supabase
    .from('timeline_activity_types')
    .select('id,name,arabic_name,default_color,cost_model,default_lump_sum,default_per_student,icon,is_system,created_at')
    .order('arabic_name', { ascending: true })
  if (error) throw error
  return (data ?? []) as TimelineActivityType[]
}

// ─── Activities ──────────────────────────────────────────────────────
export interface GetActivitiesFilters {
  batchId?: number
  calendarId?: string
  status?: TimelineActivity['status']
}

export async function getActivities(
  filters: GetActivitiesFilters = {}
): Promise<TimelineActivity[]> {
  let q = supabase
    .from('timeline_activities')
    .select(
      'id,batch_id,calendar_id,activity_type_id,title,description,start_date,end_date,custom_color,status,proposed_by,approved_by,approved_at,notes,created_at,updated_at'
    )
    .order('start_date', { ascending: true })

  if (filters.batchId !== undefined) q = q.eq('batch_id', filters.batchId)
  if (filters.calendarId) q = q.eq('calendar_id', filters.calendarId)
  if (filters.status) q = q.eq('status', filters.status)

  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as TimelineActivity[]
}

export async function upsertActivity(
  a: Omit<TimelineActivity, 'created_at' | 'updated_at'> & { created_at?: string }
): Promise<void> {
  const { error } = await supabase.from('timeline_activities').upsert(a)
  if (error) throw error
}

/** Create a new activity (omits id — DB generates) and returns the full row. */
export async function createActivity(
  a: Omit<TimelineActivity, 'id' | 'created_at' | 'updated_at' | 'approved_by' | 'approved_at'>
): Promise<TimelineActivity> {
  const { data, error } = await supabase
    .from('timeline_activities')
    .insert({
      batch_id: a.batch_id,
      calendar_id: a.calendar_id,
      activity_type_id: a.activity_type_id,
      title: a.title,
      description: a.description,
      start_date: a.start_date,
      end_date: a.end_date,
      custom_color: a.custom_color,
      status: a.status,
      proposed_by: a.proposed_by,
      notes: a.notes,
    })
    .select(
      'id,batch_id,calendar_id,activity_type_id,title,description,start_date,end_date,custom_color,status,proposed_by,approved_by,approved_at,notes,created_at,updated_at'
    )
    .single()
  if (error) throw error
  return data as TimelineActivity
}

/** Update an existing activity (partial). */
export async function updateActivity(
  id: string,
  patch: Partial<
    Omit<TimelineActivity, 'id' | 'created_at' | 'updated_at' | 'batch_id' | 'calendar_id'>
  >,
): Promise<TimelineActivity> {
  const { data, error } = await supabase
    .from('timeline_activities')
    .update(patch)
    .eq('id', id)
    .select(
      'id,batch_id,calendar_id,activity_type_id,title,description,start_date,end_date,custom_color,status,proposed_by,approved_by,approved_at,notes,created_at,updated_at'
    )
    .single()
  if (error) throw error
  return data as TimelineActivity
}

/**
 * Move an activity to a new start date, keeping its duration.
 * Used by drag-and-drop — computes the new end_date to preserve span.
 */
export async function moveActivity(
  id: string,
  newStartHijriIso: string,
  newEndHijriIso: string,
): Promise<TimelineActivity> {
  return updateActivity(id, { start_date: newStartHijriIso, end_date: newEndHijriIso })
}

export async function deleteActivity(id: string): Promise<void> {
  const { error } = await supabase.from('timeline_activities').delete().eq('id', id)
  if (error) throw error
}

// ─── Activity Costs ──────────────────────────────────────────────────
export async function getActivityCosts(activityId: string): Promise<TimelineActivityCost[]> {
  const { data, error } = await supabase
    .from('timeline_activity_costs')
    .select('id,activity_id,cost_type,amount,per_student,estimated_students,notes,receipt_url,created_at')
    .eq('activity_id', activityId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as TimelineActivityCost[]
}

/** Fetch costs for many activities in a single query (used by finance dashboard). */
export async function getCostsForActivities(
  activityIds: string[],
): Promise<TimelineActivityCost[]> {
  if (activityIds.length === 0) return []
  const { data, error } = await supabase
    .from('timeline_activity_costs')
    .select(
      'id,activity_id,cost_type,amount,per_student,estimated_students,notes,receipt_url,created_at',
    )
    .in('activity_id', activityIds)
  if (error) throw error
  return (data ?? []) as TimelineActivityCost[]
}

/**
 * Replace all cost rows for an activity with the new set.
 * Used by the "detailed" cost mode in ActivityEditModal.
 */
export async function replaceActivityCosts(
  activityId: string,
  costs: Array<Omit<TimelineActivityCost, 'id' | 'activity_id' | 'created_at'>>,
): Promise<void> {
  const { error: delErr } = await supabase
    .from('timeline_activity_costs')
    .delete()
    .eq('activity_id', activityId)
  if (delErr) throw delErr
  if (costs.length === 0) return
  const payload = costs.map((c) => ({
    activity_id: activityId,
    cost_type: c.cost_type,
    amount: c.amount,
    per_student: c.per_student,
    estimated_students: c.estimated_students,
    notes: c.notes,
    receipt_url: c.receipt_url,
  }))
  const { error: insErr } = await supabase
    .from('timeline_activity_costs')
    .insert(payload)
  if (insErr) throw insErr
}

// ─── Approval workflow ──────────────────────────────────────────────
/**
 * Transition an activity to 'proposed' status (submit for approval).
 * DB RLS ensures only the owning batch_manager / supervisor / teacher can do this.
 */
export async function requestActivityApproval(id: string): Promise<TimelineActivity> {
  return updateActivity(id, { status: 'proposed' })
}

/**
 * CEO/records_officer approves an activity.
 * Sets status='approved', approved_by=userId, approved_at=now().
 */
export async function approveActivity(
  id: string,
  approverId: string,
): Promise<TimelineActivity> {
  return updateActivity(id, {
    status: 'approved',
    approved_by: approverId,
    approved_at: new Date().toISOString(),
  })
}

/** Reject a proposed activity — sets it back to draft. */
export async function rejectActivity(id: string): Promise<TimelineActivity> {
  return updateActivity(id, {
    status: 'draft',
    approved_by: null,
    approved_at: null,
  })
}

// ─── Activity-Type CRUD (CEO / records_officer only at DB level) ────
export async function upsertActivityType(
  t:
    | (Omit<
        TimelineActivityType,
        'id' | 'created_at' | 'is_system'
      > & { id?: string })
    | TimelineActivityType,
): Promise<TimelineActivityType> {
  const payload = {
    name: t.name,
    arabic_name: t.arabic_name,
    default_color: t.default_color,
    cost_model: t.cost_model,
    default_lump_sum: t.default_lump_sum,
    default_per_student: t.default_per_student,
    icon: t.icon,
    ...('id' in t && t.id ? { id: t.id } : {}),
  }
  const { data, error } = await supabase
    .from('timeline_activity_types')
    .upsert(payload)
    .select(
      'id,name,arabic_name,default_color,cost_model,default_lump_sum,default_per_student,icon,is_system,created_at',
    )
    .single()
  if (error) throw error
  return data as TimelineActivityType
}

export async function deleteActivityType(id: string): Promise<void> {
  const { error } = await supabase
    .from('timeline_activity_types')
    .delete()
    .eq('id', id)
  if (error) throw error
}

// ─── All activities (finance dashboard — no batch filter) ───────────
export async function getAllActivitiesForCalendar(
  calendarId: string,
): Promise<TimelineActivity[]> {
  const { data, error } = await supabase
    .from('timeline_activities')
    .select(
      'id,batch_id,calendar_id,activity_type_id,title,description,start_date,end_date,custom_color,status,proposed_by,approved_by,approved_at,notes,created_at,updated_at',
    )
    .eq('calendar_id', calendarId)
    .order('start_date', { ascending: true })
  if (error) throw error
  return (data ?? []) as TimelineActivity[]
}

// ─── Batches (read-only access to existing table — no FK or policy changes) ───
export interface TimelineBatchRef {
  id: number
  name: string
  manager_name: string | null
  student_count: number | null
}

export async function getBatchesForTimeline(): Promise<TimelineBatchRef[]> {
  // Read-only select from existing batches table. RLS on batches is permissive,
  // so every authenticated user sees all. Navigation filtering is done UI-side
  // based on profile.role + profile.batch_id.
  const { data, error } = await supabase
    .from('batches')
    .select('id,name,manager_name,student_count')
    .order('id', { ascending: true })
  if (error) throw error
  return (data ?? []) as TimelineBatchRef[]
}

// ─── Approvals queue ─────────────────────────────────────────────────
/** Fetch all `status='proposed'` activities across the given calendar. */
export async function getProposedActivities(
  calendarId: string,
): Promise<TimelineActivity[]> {
  const { data, error } = await supabase
    .from('timeline_activities')
    .select(
      'id,batch_id,calendar_id,activity_type_id,title,description,start_date,end_date,custom_color,status,proposed_by,approved_by,approved_at,notes,created_at,updated_at',
    )
    .eq('calendar_id', calendarId)
    .eq('status', 'proposed')
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as TimelineActivity[]
}

// ─── Audit log ───────────────────────────────────────────────────────
export async function writeAuditEntry(params: {
  activityId: string | null
  action: TimelineAuditAction | string
  performedBy: string
  changes?: Record<string, unknown>
}): Promise<void> {
  const { error } = await supabase.from('timeline_audit_log').insert({
    activity_id: params.activityId,
    action: params.action,
    performed_by: params.performedBy,
    changes: params.changes ?? null,
  })
  if (error) {
    // Audit log is non-critical — surface to console but never block the UX
    console.warn('[timeline] failed to write audit entry:', error.message)
  }
}

export async function getAuditEntries(
  activityId: string,
): Promise<TimelineAuditEntry[]> {
  const { data, error } = await supabase
    .from('timeline_audit_log')
    .select('id,activity_id,action,performed_by,changes,performed_at')
    .eq('activity_id', activityId)
    .order('performed_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as TimelineAuditEntry[]
}

// ─── Notifications (fire-and-forget) ─────────────────────────────────
/**
 * Write a notification row to the shared `notifications` table.
 * Uses the same table as escalations/reports so /notifications displays it.
 * RLS on `notifications`: authenticated users can INSERT; filtered on SELECT
 * by target_role or target_user_id.
 */
export async function createTimelineNotification(params: {
  type: string              // 'timeline_proposed' | 'timeline_approved' | 'timeline_rejected'
  title: string
  body: string
  severity?: 'info' | 'warning' | 'error' | 'success'
  targetRole?: string | null
  targetUserId?: string | null
  data?: Record<string, unknown>
}): Promise<void> {
  const { error } = await supabase.from('notifications').insert({
    type: params.type,
    title: params.title,
    body: params.body,
    severity: params.severity ?? 'info',
    target_role: params.targetRole ?? null,
    target_user_id: params.targetUserId ?? null,
    data: params.data ?? {},
    read: false,
  })
  if (error) {
    console.warn('[timeline] failed to write notification:', error.message)
  }
}

// ─── Plan Templates (clone system) ───────────────────────────────────
export async function getPlanTemplates(): Promise<TimelinePlanTemplate[]> {
  const { data, error } = await supabase
    .from('timeline_plan_templates')
    .select('id,name,batch_id,template_data,source_year,created_at,created_by')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as TimelinePlanTemplate[]
}

export async function createPlanTemplate(params: {
  name: string
  batchId: number | null
  templateData: unknown
  sourceYear: number | null
  createdBy: string | null
}): Promise<TimelinePlanTemplate> {
  const { data, error } = await supabase
    .from('timeline_plan_templates')
    .insert({
      name: params.name,
      batch_id: params.batchId,
      template_data: params.templateData,
      source_year: params.sourceYear,
      created_by: params.createdBy,
    })
    .select('id,name,batch_id,template_data,source_year,created_at,created_by')
    .single()
  if (error) throw error
  return data as TimelinePlanTemplate
}

export async function deletePlanTemplate(id: string): Promise<void> {
  const { error } = await supabase
    .from('timeline_plan_templates')
    .delete()
    .eq('id', id)
  if (error) throw error
}

/**
 * Bulk-insert activities (used by template clone).
 * Returns count of inserted rows.
 */
export async function bulkInsertActivities(
  rows: Array<
    Omit<TimelineActivity, 'id' | 'created_at' | 'updated_at' | 'approved_by' | 'approved_at'>
  >,
): Promise<number> {
  if (rows.length === 0) return 0
  const { error } = await supabase.from('timeline_activities').insert(
    rows.map((r) => ({
      batch_id: r.batch_id,
      calendar_id: r.calendar_id,
      activity_type_id: r.activity_type_id,
      title: r.title,
      description: r.description,
      start_date: r.start_date,
      end_date: r.end_date,
      custom_color: r.custom_color,
      status: r.status,
      proposed_by: r.proposed_by,
      notes: r.notes,
    })),
  )
  if (error) throw error
  return rows.length
}
