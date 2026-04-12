import { supabase } from '@/lib/supabase'

export interface DBStudent {
  id: string; name: string; batch_id: number; supervisor_id: string; supervisor_name: string
  enrollment_date: string; status: string; notes: string; juz_completed: number
  completion_percentage: number; last_followup: string | null
}

export interface DBSupervisor {
  id: string; name: string; age: number; specialty: string; experience_years: number
  strengths: string; weaknesses: string; rating: number; student_count: number
  last_report_date: string | null; avg_student_progress: number; notes: string; batch_id: number | null
}

export interface DBBatch {
  id: number; name: string; grade_levels: string; manager_name: string
  student_count: number; completion_percentage: number
}

export interface DBMeeting {
  id: string; type: string; date: string; time: string; attendees: string[]
  agenda: string; decisions: string; recommendations: string
}

export interface DBProgram {
  id: string; name: string; batch_id: string; type: string
  start_date: string; end_date: string; location: string; budget: number
  objectives: string; report: string; status: string
}

export interface DBAttendanceRecord {
  date: string; batch_id: string; student_id: string; status: string
}

export interface DBJuzProgress {
  student_id: string; juz_number: number; status: string; updated_at?: string
}

export interface DBExam {
  id: string; student_id: string; student_name: string; batch_id: number
  juz_number: number; examiner: string; date: string; time: string
  status: string; score: number | null; notes: string
}

export interface DBTask {
  id: string; category: string; title: string; description: string
  recurrence: string; due_date: string | null; completed_dates: string[]; priority: string
}

export interface DBFollowup {
  supervisor_id: string; student_id: string; week_of: string; checked: boolean
}

// Batches
export async function getBatches(): Promise<DBBatch[]> {
  const { data, error } = await supabase.from('batches').select('*')
  if (error) throw error
  return data as DBBatch[]
}

export async function upsertBatch(batch: DBBatch): Promise<void> {
  const { error } = await supabase.from('batches').upsert(batch)
  if (error) throw error
}

export async function deleteBatch(id: number): Promise<void> {
  const { error } = await supabase.from('batches').delete().eq('id', id)
  if (error) throw error
}

// Supervisors
export async function getSupervisors(): Promise<DBSupervisor[]> {
  const { data, error } = await supabase.from('supervisors').select('*')
  if (error) throw error
  return data as DBSupervisor[]
}

export async function upsertSupervisor(s: DBSupervisor): Promise<void> {
  const { error } = await supabase.from('supervisors').upsert(s)
  if (error) throw error
}

// Students
export async function getStudents(): Promise<DBStudent[]> {
  const { data, error } = await supabase.from('students').select('*')
  if (error) throw error
  return data as DBStudent[]
}

export async function upsertStudent(s: DBStudent): Promise<void> {
  const { error } = await supabase.from('students').upsert(s)
  if (error) throw error
}

export async function deleteStudent(id: string): Promise<void> {
  const { error } = await supabase.from('students').delete().eq('id', id)
  if (error) throw error
}

// Juz Progress
export async function getJuzProgress(): Promise<DBJuzProgress[]> {
  const { data, error } = await supabase.from('juz_progress').select('*')
  if (error) throw error
  return data as DBJuzProgress[]
}

export async function getStudentJuzProgress(studentId: string): Promise<DBJuzProgress[]> {
  const { data, error } = await supabase
    .from('juz_progress')
    .select('*')
    .eq('student_id', studentId)
  if (error) throw error
  return data as DBJuzProgress[]
}

export async function upsertJuzProgress(studentId: string, juzNumber: number, status: string): Promise<void> {
  const { error } = await supabase.from('juz_progress').upsert(
    { student_id: studentId, juz_number: juzNumber, status },
    { onConflict: 'student_id,juz_number' }
  )
  if (error) throw error
}

export async function upsertJuzProgressBatch(items: DBJuzProgress[]): Promise<void> {
  const { error } = await supabase.from('juz_progress').upsert(items, { onConflict: 'student_id,juz_number' })
  if (error) throw error
}

// Exams
export async function getExams(): Promise<DBExam[]> {
  const { data, error } = await supabase.from('exams').select('*')
  if (error) throw error
  return data as DBExam[]
}

export async function upsertExam(exam: DBExam): Promise<void> {
  const { error } = await supabase.from('exams').upsert(exam)
  if (error) throw error
}

export async function deleteExam(id: string): Promise<void> {
  const { error } = await supabase.from('exams').delete().eq('id', id)
  if (error) throw error
}

// Meetings
export async function getMeetings(): Promise<DBMeeting[]> {
  const { data, error } = await supabase.from('meetings').select('*')
  if (error) throw error
  return data as DBMeeting[]
}

export async function upsertMeeting(meeting: DBMeeting): Promise<void> {
  const { error } = await supabase.from('meetings').upsert(meeting)
  if (error) throw error
}

export async function deleteMeeting(id: string): Promise<void> {
  const { error } = await supabase.from('meetings').delete().eq('id', id)
  if (error) throw error
}

// Programs
export async function getPrograms(): Promise<DBProgram[]> {
  const { data, error } = await supabase.from('programs').select('*')
  if (error) throw error
  return data as DBProgram[]
}

export async function upsertProgram(program: DBProgram): Promise<void> {
  const { error } = await supabase.from('programs').upsert(program)
  if (error) throw error
}

export async function deleteProgram(id: string): Promise<void> {
  const { error } = await supabase.from('programs').delete().eq('id', id)
  if (error) throw error
}

// Attendance
export async function getAttendance(date: string, batchId: string): Promise<DBAttendanceRecord[]> {
  const { data, error } = await supabase
    .from('attendance')
    .select('*')
    .eq('date', date)
    .eq('batch_id', batchId)
  if (error) throw error
  return data as DBAttendanceRecord[]
}

export async function getAllAttendance(): Promise<DBAttendanceRecord[]> {
  const { data, error } = await supabase.from('attendance').select('*')
  if (error) throw error
  return data as DBAttendanceRecord[]
}

export async function saveAttendanceDay(
  date: string,
  batchId: string,
  records: Record<string, string>
): Promise<void> {
  // Delete existing records for this day+batch first, then reinsert
  await supabase.from('attendance').delete().eq('date', date).eq('batch_id', batchId)
  const rows: DBAttendanceRecord[] = Object.entries(records).map(([studentId, status]) => ({
    date,
    batch_id: batchId,
    student_id: studentId,
    status,
  }))
  if (rows.length === 0) return
  const { error } = await supabase.from('attendance').insert(rows)
  if (error) throw error
}

// CEO Tasks
export async function getTasks(): Promise<DBTask[]> {
  const { data, error } = await supabase.from('ceo_tasks').select('*')
  if (error) throw error
  return data as DBTask[]
}

export async function upsertTask(task: DBTask): Promise<void> {
  const { error } = await supabase.from('ceo_tasks').upsert(task)
  if (error) throw error
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from('ceo_tasks').delete().eq('id', id)
  if (error) throw error
}

export async function saveTasks(tasks: DBTask[]): Promise<void> {
  const { error } = await supabase.from('ceo_tasks').upsert(tasks)
  if (error) throw error
}

// Custom Categories
export async function getCustomCategories(): Promise<{ id: string; label: string; color: string }[]> {
  const { data, error } = await supabase.from('custom_categories').select('*')
  if (error) throw error
  return data as { id: string; label: string; color: string }[]
}

export async function saveCustomCategories(
  cats: { id: string; label: string; color: string }[]
): Promise<void> {
  const { error } = await supabase.from('custom_categories').upsert(cats)
  if (error) throw error
}

export async function deleteCustomCategory(id: string): Promise<void> {
  const { error } = await supabase.from('custom_categories').delete().eq('id', id)
  if (error) throw error
}

// Matn Progress
export interface DBMatnProgress {
  student_id: string
  lines_memorized: number
  updated_at?: string
}

export async function getMatnProgress(): Promise<DBMatnProgress[]> {
  const { data, error } = await supabase.from('matn_progress').select('*')
  if (error) throw error
  return data as DBMatnProgress[]
}

export async function upsertMatnProgress(studentId: string, lines: number): Promise<void> {
  const { error } = await supabase.from('matn_progress').upsert(
    { student_id: studentId, lines_memorized: lines, updated_at: new Date().toISOString() },
    { onConflict: 'student_id' }
  )
  if (error) throw error
}

// Followups
export async function getFollowups(weekOf: string): Promise<DBFollowup[]> {
  const { data, error } = await supabase
    .from('followups')
    .select('*')
    .eq('week_of', weekOf)
  if (error) throw error
  return data as DBFollowup[]
}

export async function toggleFollowup(
  supervisorId: string,
  studentId: string,
  weekOf: string,
  checked: boolean
): Promise<void> {
  await supabase.from('followups')
    .delete()
    .eq('supervisor_id', supervisorId)
    .eq('student_id', studentId)
    .eq('week_of', weekOf)
  const { error } = await supabase.from('followups').insert({
    supervisor_id: supervisorId,
    student_id: studentId,
    week_of: weekOf,
    checked,
  })
  if (error) throw error
}

// ════════════════════════════════════════════════════════════════════════
// AUTOMATION SYSTEM — Notifications, Escalations, Weekly Plans
// ════════════════════════════════════════════════════════════════════════

export interface DBNotification {
  id: string
  type: string          // 'escalation' | 'report' | 'alert' | 'achievement' | 'level_transition'
  title: string
  body: string
  data: Record<string, unknown>
  severity: string      // 'info' | 'warning' | 'error' | 'success'
  target_role: string | null
  target_user_id: string | null
  read: boolean
  created_at: string
}

export interface DBEscalation {
  id: string
  student_id: string
  student_name: string
  supervisor_id: string | null
  supervisor_name: string | null
  batch_id: number | null
  consecutive_weeks: number
  level: number             // 1-4
  action_required: string
  whatsapp_message: string | null
  resolved: boolean
  resolved_at: string | null
  created_at: string
  updated_at: string
}

export interface DBWeeklyPlan {
  id: string
  student_id: string
  batch_id: number | null
  week_number: number
  week_start: string
  new_content: string | null
  near_review: string | null
  far_review: string | null
  target_juz: number | null
  status: string
  created_at: string
}

// ── Notifications ──────────────────────────────────────────────────────

export async function getNotifications(role?: string, limit = 50): Promise<DBNotification[]> {
  let q = supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (role) q = q.or(`target_role.is.null,target_role.eq.${role}`)
  const { data, error } = await q
  if (error) throw error
  return data as DBNotification[]
}

export async function getUnreadCount(role?: string): Promise<number> {
  let q = supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('read', false)
  if (role) q = q.or(`target_role.is.null,target_role.eq.${role}`)
  const { count, error } = await q
  if (error) throw error
  return count ?? 0
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase.from('notifications').update({ read: true }).eq('id', id)
  if (error) throw error
}

export async function markAllRead(role?: string): Promise<void> {
  let q = supabase.from('notifications').update({ read: true }).eq('read', false)
  if (role) q = q.or(`target_role.is.null,target_role.eq.${role}`)
  const { error } = await q
  if (error) throw error
}

export async function deleteNotification(id: string): Promise<void> {
  const { error } = await supabase.from('notifications').delete().eq('id', id)
  if (error) throw error
}

// ── Escalations ────────────────────────────────────────────────────────

export async function getEscalations(resolved = false): Promise<DBEscalation[]> {
  const { data, error } = await supabase
    .from('escalations')
    .select('*')
    .eq('resolved', resolved)
    .order('level', { ascending: false })
  if (error) throw error
  return data as DBEscalation[]
}

export async function resolveEscalation(studentId: string): Promise<void> {
  const { error } = await supabase
    .from('escalations')
    .update({ resolved: true, resolved_at: new Date().toISOString() })
    .eq('student_id', studentId)
  if (error) throw error
}

// ── Weekly Plans ───────────────────────────────────────────────────────

export async function getWeeklyPlans(weekNumber: number, batchId?: number): Promise<DBWeeklyPlan[]> {
  let q = supabase.from('weekly_plans').select('*').eq('week_number', weekNumber)
  if (batchId) q = q.eq('batch_id', batchId)
  const { data, error } = await q
  if (error) throw error
  return data as DBWeeklyPlan[]
}

// ════════════════════════════════════════════════════════════════════════
// TEXTS SYSTEM — المتون
// ════════════════════════════════════════════════════════════════════════

export interface DBText {
  id: string
  name_ar: string
  category: 'علمي' | 'تربوي' | 'مهاري'
  subject: string
  type: 'منظومة' | 'منثور' | 'سؤال_جواب' | 'أحاديث' | 'أسطر'
  level_id: number
  total_lines: number
  weekly_rate: number
  order_in_level: number
  description: string | null
  is_active: boolean
}

export interface DBTextUnit {
  id: string
  text_id: string
  unit_number: number
  start_line: number
  end_line: number
}

export interface DBStudentTextProgress {
  id: string
  student_id: string
  text_id: string
  lines_memorized: number
  status: 'not_started' | 'in_progress' | 'memorized' | 'needs_revision'
  notes: string | null
  started_at: string | null
  completed_at: string | null
  updated_at: string
}

export async function getTexts(levelId?: number): Promise<DBText[]> {
  let q = supabase.from('texts').select('*').eq('is_active', true).order('level_id').order('order_in_level')
  if (levelId) q = q.eq('level_id', levelId)
  const { data, error } = await q
  if (error) throw error
  return data as DBText[]
}

export async function getTextUnits(textId: string): Promise<DBTextUnit[]> {
  const { data, error } = await supabase
    .from('text_units')
    .select('*')
    .eq('text_id', textId)
    .order('unit_number')
  if (error) throw error
  return data as DBTextUnit[]
}

export async function getStudentTextProgress(studentIds?: string[]): Promise<DBStudentTextProgress[]> {
  let q = supabase.from('student_text_progress').select('*')
  if (studentIds?.length) q = q.in('student_id', studentIds)
  const { data, error } = await q
  if (error) throw error
  return data as DBStudentTextProgress[]
}

export async function upsertStudentTextProgress(
  studentId: string,
  textId: string,
  linesMemorized: number,
): Promise<void> {
  const total = linesMemorized
  const status: DBStudentTextProgress['status'] =
    total === 0 ? 'not_started' : 'in_progress'

  const { error } = await supabase.from('student_text_progress').upsert(
    {
      student_id: studentId,
      text_id: textId,
      lines_memorized: linesMemorized,
      status,
      updated_at: new Date().toISOString(),
      started_at: linesMemorized > 0 ? new Date().toISOString() : null,
    },
    { onConflict: 'student_id,text_id' }
  )
  if (error) throw error
}

export async function markTextMemorized(
  studentId: string,
  textId: string,
  totalLines: number,
): Promise<void> {
  const { error } = await supabase.from('student_text_progress').upsert(
    {
      student_id: studentId,
      text_id: textId,
      lines_memorized: totalLines,
      status: 'memorized',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'student_id,text_id' }
  )
  if (error) throw error
}

export async function setTextStatus(
  studentId: string,
  textId: string,
  status: DBStudentTextProgress['status'],
): Promise<void> {
  const { error } = await supabase.from('student_text_progress').upsert(
    { student_id: studentId, text_id: textId, status, updated_at: new Date().toISOString() },
    { onConflict: 'student_id,text_id' }
  )
  if (error) throw error
}
