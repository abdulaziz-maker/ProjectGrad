import { supabase } from '@/lib/supabase'
import { cachedFetch, invalidateCache, CACHE_KEYS } from '@/lib/cache'
import type { FollowupScheduleEntry } from './types'

/** اجلب جدول المتابعات (الكل أو لمشرف محدد) */
export async function getFollowupSchedule(supervisorId?: string): Promise<FollowupScheduleEntry[]> {
  const cacheKey = supervisorId
    ? `${CACHE_KEYS.FOLLOWUP_SCHEDULE}:${supervisorId}`
    : CACHE_KEYS.FOLLOWUP_SCHEDULE
  return cachedFetch(cacheKey, async () => {
    let q = supabase.from('followup_schedule').select('*').order('day_of_week')
    if (supervisorId) q = q.eq('supervisor_id', supervisorId)
    const { data, error } = await q
    if (error) throw error
    return (data || []) as FollowupScheduleEntry[]
  })
}

/** أضف بند جدولة جديد */
export async function addScheduleEntry(entry: Omit<FollowupScheduleEntry, 'id' | 'created_at'>): Promise<void> {
  const payload = {
    supervisor_id: entry.supervisor_id,
    student_id: entry.student_id,
    day_of_week: entry.day_of_week,
    is_repeating: entry.is_repeating,
    week_start: entry.is_repeating ? null : (entry.week_start ?? null),
    notes: entry.notes ?? null,
  }
  const { error } = await supabase.from('followup_schedule').upsert(payload, {
    onConflict: 'supervisor_id,student_id,day_of_week,week_start',
  })
  if (error) throw error
  invalidateCache(CACHE_KEYS.FOLLOWUP_SCHEDULE)
  invalidateCache(`${CACHE_KEYS.FOLLOWUP_SCHEDULE}:${entry.supervisor_id}`)
}

/** احذف بند جدولة */
export async function deleteScheduleEntry(id: number, supervisorId?: string): Promise<void> {
  const { error } = await supabase.from('followup_schedule').delete().eq('id', id)
  if (error) throw error
  invalidateCache(CACHE_KEYS.FOLLOWUP_SCHEDULE)
  if (supervisorId) invalidateCache(`${CACHE_KEYS.FOLLOWUP_SCHEDULE}:${supervisorId}`)
}

/** بدّل خاصية التكرار */
export async function toggleRepeating(id: number, isRepeating: boolean, supervisorId?: string): Promise<void> {
  const { error } = await supabase
    .from('followup_schedule')
    .update({ is_repeating: isRepeating, week_start: isRepeating ? null : undefined })
    .eq('id', id)
  if (error) throw error
  invalidateCache(CACHE_KEYS.FOLLOWUP_SCHEDULE)
  if (supervisorId) invalidateCache(`${CACHE_KEYS.FOLLOWUP_SCHEDULE}:${supervisorId}`)
}
