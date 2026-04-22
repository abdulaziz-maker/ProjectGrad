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
