import { supabase } from '@/lib/supabase'
import { cachedFetch, invalidateCache, CACHE_KEYS } from '@/lib/cache'
import type { WeeklyViolation, ViolationFilters, SupervisorViolationSummary } from './types'

/** اجلب الإخلالات وفق فلاتر */
export async function getViolations(filters: ViolationFilters = {}): Promise<WeeklyViolation[]> {
  const cacheKey = `${CACHE_KEYS.WEEKLY_VIOLATIONS}:${JSON.stringify(filters)}`
  return cachedFetch(cacheKey, async () => {
    let q = supabase
      .from('supervisor_weekly_violations')
      .select('*')
      .order('week_start', { ascending: false })
      .order('supervisor_name', { ascending: true })

    if (filters.supervisorId) q = q.eq('supervisor_id', filters.supervisorId)
    if (filters.studentId)    q = q.eq('student_id', filters.studentId)
    if (filters.batchId !== undefined) q = q.eq('batch_id', filters.batchId)
    if (filters.weekStart)    q = q.eq('week_start', filters.weekStart)
    if (filters.fromDate)     q = q.gte('week_start', filters.fromDate)
    if (filters.toDate)       q = q.lte('week_start', filters.toDate)

    const { data, error } = await q
    if (error) throw error
    return (data || []) as WeeklyViolation[]
  })
}

/** أنشئ violation (يُستدعى من cron) */
export async function recordViolation(v: WeeklyViolation): Promise<void> {
  const { error } = await supabase.from('supervisor_weekly_violations').upsert({
    supervisor_id: v.supervisor_id,
    supervisor_name: v.supervisor_name ?? null,
    student_id: v.student_id,
    student_name: v.student_name ?? null,
    batch_id: v.batch_id ?? null,
    week_start: v.week_start,
    week_end: v.week_end,
  }, { onConflict: 'supervisor_id,student_id,week_start' })
  if (error) throw error
  invalidateCache(CACHE_KEYS.WEEKLY_VIOLATIONS)
}

/** حدّث/أحلّ violation */
export async function resolveViolation(id: number, note: string): Promise<void> {
  const { error } = await supabase
    .from('supervisor_weekly_violations')
    .update({ resolved_at: new Date().toISOString(), resolution_note: note })
    .eq('id', id)
  if (error) throw error
  invalidateCache(CACHE_KEYS.WEEKLY_VIOLATIONS)
}

/** ملخّص بإحصائيات لكل مشرف */
export function buildSupervisorSummary(violations: WeeklyViolation[]): SupervisorViolationSummary[] {
  const map = new Map<string, SupervisorViolationSummary>()
  const studentSets = new Map<string, Set<string>>()
  const weekSets = new Map<string, Set<string>>()

  for (const v of violations) {
    if (v.resolved_at) continue
    const key = v.supervisor_id
    if (!map.has(key)) {
      map.set(key, {
        supervisor_id: v.supervisor_id,
        supervisor_name: v.supervisor_name || '—',
        batch_id: v.batch_id ?? null,
        total_violations: 0,
        weeks_with_violations: 0,
        unique_students_missed: 0,
        last_violation_date: null,
      })
      studentSets.set(key, new Set())
      weekSets.set(key, new Set())
    }
    const summary = map.get(key)!
    summary.total_violations++
    studentSets.get(key)!.add(v.student_id)
    weekSets.get(key)!.add(v.week_start)
    if (!summary.last_violation_date || v.week_start > summary.last_violation_date) {
      summary.last_violation_date = v.week_start
    }
  }
  for (const [key, summary] of map.entries()) {
    summary.unique_students_missed = studentSets.get(key)?.size ?? 0
    summary.weeks_with_violations = weekSets.get(key)?.size ?? 0
  }
  return [...map.values()].sort((a, b) => b.total_violations - a.total_violations)
}
