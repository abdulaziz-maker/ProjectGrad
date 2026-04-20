import { supabase } from '@/lib/supabase'
import { cachedFetch, invalidateCache, invalidateCachePrefix, CACHE_KEYS } from '@/lib/cache'

/**
 * Paginate through a Supabase query in 1000-row pages to bypass the default limit.
 * Supabase silently truncates at 1000 rows otherwise — causing invisible data loss.
 * Pass a function that returns a fresh query builder on each call.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function paginateAll<T>(buildQuery: () => any): Promise<T[]> {
  const allRows: T[] = []
  const pageSize = 1000
  let from = 0
  while (true) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    allRows.push(...(data as T[]))
    if (data.length < pageSize) break
    from += pageSize
  }
  return allRows
}

export interface DBStudent {
  id: string; name: string; batch_id: number; supervisor_id: string; supervisor_name: string
  enrollment_date: string; status: string; notes: string; juz_completed: number
  completion_percentage: number; last_followup: string | null
  near_review?: string  // ملخص ما حُفظ في آخر ٣ أشهر (نص حر)
  far_review?: string   // ملخص ما حُفظ قبل ٣ أشهر (نص حر)
  national_id?: string  // رقم الهوية الوطنية (١٠ أرقام)
  birth_date?: string | null  // تاريخ الميلاد (YYYY-MM-DD)
  parent_phone?: string // رقم جوال ولي الأمر
}

export interface DBSupervisor {
  id: string; name: string; age: number; specialty: string; experience_years: number
  strengths: string; weaknesses: string; rating: number; student_count: number
  last_report_date: string | null; avg_student_progress: number; notes: string; batch_id: number | null
  user_id: string | null
}

export interface DBBatch {
  id: number; name: string; grade_levels: string; manager_name: string
  student_count: number; completion_percentage: number
}

export interface DBMeeting {
  id: string; type: string; date: string; time: string; attendees: string[]
  agenda: string; decisions: string; recommendations: string
  /** none (غير متكرر) | weekly (أسبوعي) | monthly (شهري) */
  recurrence?: 'none' | 'weekly' | 'monthly'
  /** مُعرِّف السلسلة — كل اجتماعات السلسلة الواحدة لها نفس القيمة */
  series_id?: string | null
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
  errors?: number | null; warnings?: number | null; hesitations?: number | null
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
  return cachedFetch(CACHE_KEYS.BATCHES, async () => {
    const { data, error } = await supabase.from('batches').select('id,name,grade_levels,manager_name,student_count,completion_percentage')
    if (error) throw error
    return data as DBBatch[]
  })
}

export async function upsertBatch(batch: DBBatch): Promise<void> {
  const { error } = await supabase.from('batches').upsert(batch)
  if (error) throw error
  invalidateCache(CACHE_KEYS.BATCHES)
}

export async function deleteBatch(id: number): Promise<void> {
  const { error } = await supabase.from('batches').delete().eq('id', id)
  if (error) throw error
  invalidateCache(CACHE_KEYS.BATCHES)
}

// Supervisors — مرتّبة أبجدياً بالاسم
export async function getSupervisors(): Promise<DBSupervisor[]> {
  return cachedFetch(CACHE_KEYS.SUPERVISORS, async () => {
    const { data, error } = await supabase
      .from('supervisors')
      .select('id,name,age,specialty,experience_years,strengths,weaknesses,rating,student_count,last_report_date,avg_student_progress,notes,batch_id,user_id')
      .order('name', { ascending: true })
    if (error) throw error
    return data as DBSupervisor[]
  })
}

export async function upsertSupervisor(s: DBSupervisor): Promise<void> {
  const { error } = await supabase.from('supervisors').upsert(s)
  if (error) throw error
  invalidateCache(CACHE_KEYS.SUPERVISORS)
}

// Students — مرتّبة أبجدياً بالاسم
export async function getStudents(): Promise<DBStudent[]> {
  return cachedFetch(CACHE_KEYS.STUDENTS, async () => {
    const { data, error } = await supabase
      .from('students')
      .select('id,name,batch_id,supervisor_id,supervisor_name,enrollment_date,status,notes,juz_completed,completion_percentage,last_followup,near_review,far_review,national_id,birth_date,parent_phone')
      .order('name', { ascending: true })
    if (error) throw error
    return data as DBStudent[]
  })
}

export async function upsertStudent(s: DBStudent): Promise<void> {
  const { error } = await supabase.from('students').upsert(s)
  if (error) throw error
  invalidateCache(CACHE_KEYS.STUDENTS)
}

export async function deleteStudent(id: string): Promise<void> {
  const { error } = await supabase.from('students').delete().eq('id', id)
  if (error) throw error
  invalidateCache(CACHE_KEYS.STUDENTS)
}

// Juz Progress
export async function getJuzProgress(): Promise<DBJuzProgress[]> {
  return cachedFetch(CACHE_KEYS.JUZ_PROGRESS, async () => {
    // Supabase defaults to 1000 rows — we need all rows (students × 30 juz)
    // Paginate to ensure we get everything
    const allRows: DBJuzProgress[] = []
    const pageSize = 1000
    let from = 0
    while (true) {
      const { data, error } = await supabase
        .from('juz_progress')
        .select('student_id,juz_number,status,updated_at')
        .range(from, from + pageSize - 1)
      if (error) throw error
      if (!data || data.length === 0) break
      allRows.push(...(data as DBJuzProgress[]))
      if (data.length < pageSize) break  // last page
      from += pageSize
    }
    return allRows
  })
}

export async function getStudentJuzProgress(studentId: string): Promise<DBJuzProgress[]> {
  const { data, error } = await supabase
    .from('juz_progress')
    .select('student_id,juz_number,status,updated_at')
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
  invalidateCache(CACHE_KEYS.JUZ_PROGRESS)
}

export async function upsertJuzProgressBatch(items: DBJuzProgress[]): Promise<void> {
  const { error } = await supabase.from('juz_progress').upsert(items, { onConflict: 'student_id,juz_number' })
  if (error) throw error
  invalidateCache(CACHE_KEYS.JUZ_PROGRESS)
}

// Exams
export async function getExams(): Promise<DBExam[]> {
  return cachedFetch(CACHE_KEYS.EXAMS, async () => {
  // Paginate — exams can exceed 1000 rows as the program scales
  const data = await paginateAll<DBExam>(() =>
    supabase.from('exams').select('id,student_id,student_name,batch_id,juz_number,examiner,date,time,status,score,notes')
  )
  return data.map(exam => {
    const match = exam.notes?.match(/\[EWH:(.*?)\]/)
    if (match) {
      try {
        const counters = JSON.parse(match[1])
        return {
          ...exam,
          errors: counters.errors || 0,
          warnings: counters.warnings || 0,
          hesitations: counters.hesitations || 0,
          notes: exam.notes.replace(/\n?\[EWH:.*?\]/, '').trim(),
        }
      } catch { return exam }
    }
    return exam
  })
  })
}

export async function upsertExam(exam: DBExam): Promise<void> {
  // Strip client-only fields not in DB schema; encode counters in notes
  const { errors, warnings, hesitations, ...dbFields } = exam
  const countersJson = (errors || warnings || hesitations)
    ? JSON.stringify({ errors: errors || 0, warnings: warnings || 0, hesitations: hesitations || 0 })
    : ''
  const userNotes = (exam.notes || '').replace(/\n?\[EWH:.*?\]/, '').trim()
  const notes = countersJson ? `${userNotes}\n[EWH:${countersJson}]`.trim() : userNotes
  const { error } = await supabase.from('exams').upsert({ ...dbFields, notes })
  if (error) throw error
  invalidateCache(CACHE_KEYS.EXAMS)
}

export async function deleteExam(id: string): Promise<void> {
  const { error } = await supabase.from('exams').delete().eq('id', id)
  if (error) throw error
  invalidateCache(CACHE_KEYS.EXAMS)
}

// Meetings
export async function getMeetings(): Promise<DBMeeting[]> {
  return cachedFetch(CACHE_KEYS.MEETINGS, async () => {
    const { data, error } = await supabase.from('meetings').select('id,type,date,time,attendees,agenda,decisions,recommendations,recurrence,series_id')
    if (error) throw error
    return data as DBMeeting[]
  })
}

/**
 * إنشاء سلسلة اجتماعات دورية (أسبوعي/شهري) مع عدد مرات محدَّد.
 * - `weekly`: يضيف ٧ أيام بين كل اجتماع
 * - `monthly`: يضيف شهراً ميلادياً بين كل اجتماع
 * يُرجع قائمة المعرِّفات المُنشأة.
 */
export async function createMeetingSeries(
  base: Omit<DBMeeting, 'id' | 'series_id'>,
  occurrences: number = 12,
): Promise<string[]> {
  const seriesId = `series_${Date.now()}`
  const rows: DBMeeting[] = []
  const startDate = new Date(base.date + 'T12:00:00')
  for (let i = 0; i < occurrences; i++) {
    const d = new Date(startDate)
    if (base.recurrence === 'weekly') {
      d.setDate(startDate.getDate() + i * 7)
    } else if (base.recurrence === 'monthly') {
      d.setMonth(startDate.getMonth() + i)
    } else {
      // غير دوري — اجتماع واحد فقط
      rows.push({ ...base, id: `m_${Date.now()}`, series_id: null })
      break
    }
    rows.push({
      ...base,
      id: `m_${Date.now()}_${i}`,
      date: d.toISOString().split('T')[0],
      series_id: seriesId,
    })
  }
  const { error } = await supabase.from('meetings').insert(rows)
  if (error) throw error
  return rows.map(r => r.id)
}

export async function upsertMeeting(meeting: DBMeeting): Promise<void> {
  const { error } = await supabase.from('meetings').upsert(meeting)
  if (error) throw error
  invalidateCache(CACHE_KEYS.MEETINGS)
}

export async function deleteMeeting(id: string): Promise<void> {
  const { error } = await supabase.from('meetings').delete().eq('id', id)
  if (error) throw error
  invalidateCache(CACHE_KEYS.MEETINGS)
}

// Programs
export async function getPrograms(): Promise<DBProgram[]> {
  return cachedFetch(CACHE_KEYS.PROGRAMS, async () => {
    const { data, error } = await supabase.from('programs').select('id,name,batch_id,type,start_date,end_date,location,budget,objectives,report,status')
    if (error) throw error
    return data as DBProgram[]
  })
}

export async function upsertProgram(program: DBProgram): Promise<void> {
  const { error } = await supabase.from('programs').upsert(program)
  if (error) throw error
  invalidateCache(CACHE_KEYS.PROGRAMS)
}

export async function deleteProgram(id: string): Promise<void> {
  const { error } = await supabase.from('programs').delete().eq('id', id)
  if (error) throw error
  invalidateCache(CACHE_KEYS.PROGRAMS)
}

// Attendance
export async function getAttendance(date: string, batchId: string): Promise<DBAttendanceRecord[]> {
  const { data, error } = await supabase
    .from('attendance')
    .select('date,batch_id,student_id,status')
    .eq('date', date)
    .eq('batch_id', batchId)
  if (error) throw error
  return data as DBAttendanceRecord[]
}

export async function getAllAttendance(): Promise<DBAttendanceRecord[]> {
  return cachedFetch(CACHE_KEYS.ATTENDANCE_ALL, async () => {
    // Paginate to avoid Supabase's default 1000-row limit
    const allRows: DBAttendanceRecord[] = []
    const pageSize = 1000
    let from = 0
    while (true) {
      const { data, error } = await supabase
        .from('attendance')
        .select('date,batch_id,student_id,status')
        .range(from, from + pageSize - 1)
      if (error) throw error
      if (!data || data.length === 0) break
      allRows.push(...(data as DBAttendanceRecord[]))
      if (data.length < pageSize) break
      from += pageSize
    }
    return allRows
  })
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
  invalidateCache(CACHE_KEYS.ATTENDANCE_ALL)
}

// ─── حضور البرامج التربوية ─────────────────────────────────────
export interface DBProgramAttendance {
  program_id: string
  student_id: string
  status: 'present' | 'absent' | 'excused'
}

export async function getProgramAttendance(programId: string): Promise<DBProgramAttendance[]> {
  const { data, error } = await supabase
    .from('program_attendance')
    .select('program_id,student_id,status')
    .eq('program_id', programId)
  if (error) throw error
  return (data ?? []) as DBProgramAttendance[]
}

export async function saveProgramAttendance(
  programId: string,
  records: Record<string, 'present' | 'absent' | 'excused'>,
): Promise<void> {
  await supabase.from('program_attendance').delete().eq('program_id', programId)
  const rows = Object.entries(records).map(([student_id, status]) => ({
    program_id: programId,
    student_id,
    status,
  }))
  if (rows.length === 0) return
  const { error } = await supabase.from('program_attendance').insert(rows)
  if (error) throw error
}

// ─── حضور المشرفين ────────────────────────────────────────────
export interface DBSupervisorAttendance {
  supervisor_id: string
  batch_id: number
  date: string
  status: string
}

export async function getSupervisorAttendanceForDate(
  batchId: number,
  date: string
): Promise<DBSupervisorAttendance[]> {
  const { data, error } = await supabase
    .from('supervisor_attendance')
    .select('supervisor_id,batch_id,date,status')
    .eq('batch_id', batchId)
    .eq('date', date)
  if (error) throw error
  return (data ?? []) as DBSupervisorAttendance[]
}

export async function saveSupervisorAttendanceDay(
  date: string,
  batchId: number,
  records: Record<string, string>
): Promise<void> {
  await supabase.from('supervisor_attendance').delete()
    .eq('date', date).eq('batch_id', batchId)
  const rows = Object.entries(records).map(([supervisor_id, status]) => ({
    date,
    batch_id: batchId,
    supervisor_id,
    status,
  }))
  if (rows.length === 0) return
  const { error } = await supabase.from('supervisor_attendance').insert(rows)
  if (error) throw error
}

// CEO Tasks
export async function getTasks(): Promise<DBTask[]> {
  const { data, error } = await supabase.from('ceo_tasks').select('id,category,title,description,recurrence,due_date,completed_dates,priority')
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
  const { data, error } = await supabase.from('custom_categories').select('id,label,color')
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
  return cachedFetch(CACHE_KEYS.MATN_PROGRESS, async () => {
    // Paginate — can exceed 1000 rows with many students
    return paginateAll<DBMatnProgress>(() =>
      supabase.from('matn_progress').select('student_id,lines_memorized,updated_at')
    )
  })
}

export async function upsertMatnProgress(studentId: string, lines: number): Promise<void> {
  const { error } = await supabase.from('matn_progress').upsert(
    { student_id: studentId, lines_memorized: lines, updated_at: new Date().toISOString() },
    { onConflict: 'student_id' }
  )
  if (error) throw error
  invalidateCache(CACHE_KEYS.MATN_PROGRESS)
}

// ── Student Assignments ──────────────────────────────────────────────

export interface DBAssignmentHistory {
  id: string
  student_id: string
  student_name: string
  from_supervisor_id: string | null
  from_supervisor_name: string | null
  to_supervisor_id: string
  to_supervisor_name: string
  batch_id: number
  assigned_by: string
  assigned_at: string
}

export async function assignStudentToSupervisor(
  studentId: string,
  studentName: string,
  fromSupervisorId: string | null,
  fromSupervisorName: string | null,
  toSupervisorId: string,
  toSupervisorName: string,
  batchId: number,
  assignedBy: string,
): Promise<void> {
  const { error: updateErr } = await supabase
    .from('students')
    .update({ supervisor_id: toSupervisorId, supervisor_name: toSupervisorName })
    .eq('id', studentId)
  if (updateErr) throw updateErr

  await supabase.from('assignment_history').insert({
    student_id: studentId,
    student_name: studentName,
    from_supervisor_id: fromSupervisorId || null,
    from_supervisor_name: fromSupervisorName || null,
    to_supervisor_id: toSupervisorId,
    to_supervisor_name: toSupervisorName,
    batch_id: batchId,
    assigned_by: assignedBy,
  })

  invalidateCache(CACHE_KEYS.STUDENTS)
}

export async function unassignStudent(
  studentId: string,
  studentName: string,
  fromSupervisorId: string,
  fromSupervisorName: string,
  batchId: number,
  assignedBy: string,
): Promise<void> {
  const { error } = await supabase
    .from('students')
    .update({ supervisor_id: '', supervisor_name: '' })
    .eq('id', studentId)
  if (error) throw error

  await supabase.from('assignment_history').insert({
    student_id: studentId,
    student_name: studentName,
    from_supervisor_id: fromSupervisorId,
    from_supervisor_name: fromSupervisorName,
    to_supervisor_id: '',
    to_supervisor_name: 'غير معيّن',
    batch_id: batchId,
    assigned_by: assignedBy,
  })

  invalidateCache(CACHE_KEYS.STUDENTS)
}

export async function getAssignmentHistory(batchId?: number, limit = 50): Promise<DBAssignmentHistory[]> {
  return cachedFetch(`${CACHE_KEYS.ASSIGNMENT_HISTORY}_${batchId ?? 'all'}`, async () => {
    let q = supabase
      .from('assignment_history')
      .select('id,student_id,student_name,from_supervisor_id,from_supervisor_name,to_supervisor_id,to_supervisor_name,batch_id,assigned_by,assigned_at')
      .order('assigned_at', { ascending: false })
      .limit(limit)
    if (batchId) q = q.eq('batch_id', batchId)
    const { data, error } = await q
    if (error) throw error
    return data as DBAssignmentHistory[]
  })
}

// Followups
export async function getFollowups(weekOf: string): Promise<DBFollowup[]> {
  const { data, error } = await supabase
    .from('followups')
    .select('supervisor_id,student_id,week_of,checked')
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
    .select('id,type,title,body,data,severity,target_role,target_user_id,read,created_at')
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
    .select('id,student_id,student_name,supervisor_id,supervisor_name,batch_id,consecutive_weeks,level,action_required,whatsapp_message,resolved,resolved_at,created_at,updated_at')
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
  let q = supabase.from('weekly_plans').select('id,student_id,batch_id,week_number,week_start,new_content,near_review,far_review,target_juz,status,created_at').eq('week_number', weekNumber)
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

// أبواب المتن — تقسيم المتن الواحد لأبواب/فصول
export interface DBTextChapter {
  id: string
  text_id: string
  chapter_number: number
  title: string
  start_line: number
  end_line: number
}

export async function getTextChapters(textId: string): Promise<DBTextChapter[]> {
  const { data, error } = await supabase
    .from('text_chapters')
    .select('id,text_id,chapter_number,title,start_line,end_line')
    .eq('text_id', textId)
    .order('chapter_number')
  if (error) throw error
  return (data ?? []) as DBTextChapter[]
}

export async function upsertTextChapter(ch: Omit<DBTextChapter, 'id'> & { id?: string }): Promise<void> {
  const { error } = await supabase.from('text_chapters').upsert(ch, { onConflict: 'text_id,chapter_number' })
  if (error) throw error
}

export async function deleteTextChapter(id: string): Promise<void> {
  const { error } = await supabase.from('text_chapters').delete().eq('id', id)
  if (error) throw error
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
  let q = supabase.from('texts').select('id,name_ar,category,subject,type,level_id,total_lines,weekly_rate,order_in_level,description,is_active').eq('is_active', true).order('level_id').order('order_in_level')
  if (levelId) q = q.eq('level_id', levelId)
  const { data, error } = await q
  if (error) throw error
  return data as DBText[]
}

export async function getTextUnits(textId: string): Promise<DBTextUnit[]> {
  const { data, error } = await supabase
    .from('text_units')
    .select('id,text_id,unit_number,start_line,end_line')
    .eq('text_id', textId)
    .order('unit_number')
  if (error) throw error
  return data as DBTextUnit[]
}

export async function getStudentTextProgress(studentIds?: string[]): Promise<DBStudentTextProgress[]> {
  // Only cache the unfiltered "all students" query — filtered queries are cheap enough to skip cache
  if (!studentIds?.length) {
    return cachedFetch(CACHE_KEYS.STUDENT_TEXT_PROGRESS, async () => {
      return paginateAll<DBStudentTextProgress>(() =>
        supabase.from('student_text_progress').select('id,student_id,text_id,lines_memorized,status,notes,started_at,completed_at,updated_at')
      )
    })
  }
  return paginateAll<DBStudentTextProgress>(() =>
    supabase.from('student_text_progress')
      .select('id,student_id,text_id,lines_memorized,status,notes,started_at,completed_at,updated_at')
      .in('student_id', studentIds)
  )
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
  invalidateCache(CACHE_KEYS.STUDENT_TEXT_PROGRESS)
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
  invalidateCache(CACHE_KEYS.STUDENT_TEXT_PROGRESS)
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
  invalidateCache(CACHE_KEYS.STUDENT_TEXT_PROGRESS)
}

// ════════════════════════════════════════════════════════════════════════
// RECITATIONS SYSTEM — نظام التسميع الأسبوعي
// ════════════════════════════════════════════════════════════════════════

export type RecitationGrade = 'mutqin' | 'daeef' | 'mutaaththir'
export type FinalStatus = 'ممتاز' | 'جيد' | 'مقبول' | 'متعثر'

export const GRADE_LABELS: Record<RecitationGrade, string> = {
  mutqin: 'متقن',
  daeef: 'ضعيف',
  mutaaththir: 'متعثر',
}

export interface DBRecitation {
  id: string
  student_id: string
  text_id: string
  text_unit_id: string
  week_number: number
  new_memo_status: RecitationGrade | null
  ghareeb_status: RecitationGrade | null
  near_review_status: RecitationGrade | null
  far_review_status: RecitationGrade | null
  final_status: FinalStatus | null
  notes: string | null
  voice_note_url: string | null
  assessed_by: string | null
  created_at: string
  updated_at: string
}

export function computeFinalStatus(
  newMemo: RecitationGrade | null,
  ghareeb: RecitationGrade | null,
  nearReview: RecitationGrade | null,
  farReview: RecitationGrade | null,
): FinalStatus | null {
  const filled = [newMemo, ghareeb, nearReview, farReview].filter(Boolean) as RecitationGrade[]
  if (filled.length === 0) return null
  const mutqin = filled.filter(s => s === 'mutqin').length
  const mutaaththir = filled.filter(s => s === 'mutaaththir').length
  if (mutaaththir >= 2) return 'متعثر'
  if (mutaaththir >= 1) return 'مقبول'
  if (mutqin === filled.length) return 'ممتاز'
  if (mutqin >= filled.length - 1) return 'جيد'
  return 'مقبول'
}

export async function getAllTextUnits(): Promise<DBTextUnit[]> {
  const { data, error } = await supabase
    .from('text_units')
    .select('id,text_id,unit_number,start_line,end_line')
    .order('text_id')
    .order('unit_number')
  if (error) throw error
  return data as DBTextUnit[]
}

export async function getRecitationsForStudents(studentIds: string[]): Promise<DBRecitation[]> {
  if (!studentIds.length) return []
  // Supabase `.in()` has a limit, chunk if needed
  const chunkSize = 100
  const results: DBRecitation[] = []
  for (let i = 0; i < studentIds.length; i += chunkSize) {
    const chunk = studentIds.slice(i, i + chunkSize)
    const { data, error } = await supabase
      .from('recitations')
      .select('id,student_id,text_id,text_unit_id,week_number,new_memo_status,ghareeb_status,near_review_status,far_review_status,final_status,notes,voice_note_url,assessed_by,created_at,updated_at')
      .in('student_id', chunk)
    if (error) throw error
    if (data) results.push(...(data as DBRecitation[]))
  }
  return results
}

export async function getRecitationsByUnit(textUnitId: string): Promise<DBRecitation[]> {
  const { data, error } = await supabase
    .from('recitations')
    .select('id,student_id,text_id,text_unit_id,week_number,new_memo_status,ghareeb_status,near_review_status,far_review_status,final_status,notes,voice_note_url,assessed_by,created_at,updated_at')
    .eq('text_unit_id', textUnitId)
  if (error) throw error
  return data as DBRecitation[]
}

// ════════════════════════════════════════════════════════════════════════
// TEXTS CRUD — إدارة المتون
// ════════════════════════════════════════════════════════════════════════

export async function regenerateTextUnits(textId: string, totalLines: number, weeklyRate: number): Promise<void> {
  const { error } = await supabase.rpc('generate_text_units', {
    p_text_id: textId,
    p_total_lines: totalLines,
    p_weekly_rate: weeklyRate,
  })
  if (error) throw error
}

export async function createText(data: Omit<DBText, 'id'>): Promise<string> {
  const { data: row, error } = await supabase
    .from('texts')
    .insert(data)
    .select('id')
    .single()
  if (error) throw error
  const newId = (row as { id: string }).id
  await regenerateTextUnits(newId, data.total_lines, data.weekly_rate)
  return newId
}

export async function updateText(id: string, data: Partial<Omit<DBText, 'id'>>): Promise<void> {
  const { error } = await supabase.from('texts').update(data).eq('id', id)
  if (error) throw error
  // أعد توليد المقررات إذا تغيّر عدد الأسطر أو المعدل
  if (data.total_lines !== undefined || data.weekly_rate !== undefined) {
    const { data: row } = await supabase
      .from('texts')
      .select('total_lines, weekly_rate')
      .eq('id', id)
      .single()
    if (row) {
      const r = row as { total_lines: number; weekly_rate: number }
      await regenerateTextUnits(id, r.total_lines, r.weekly_rate)
    }
  }
}

export async function deleteText(id: string): Promise<void> {
  const { error } = await supabase.from('texts').delete().eq('id', id)
  if (error) throw error
}

export async function upsertRecitation(rec: {
  student_id: string
  text_id: string
  text_unit_id: string
  week_number: number
  new_memo_status: RecitationGrade | null
  ghareeb_status: RecitationGrade | null
  near_review_status: RecitationGrade | null
  far_review_status: RecitationGrade | null
  notes?: string | null
  voice_note_url?: string | null
  assessed_by?: string | null
}): Promise<void> {
  const finalStatus = computeFinalStatus(
    rec.new_memo_status,
    rec.ghareeb_status,
    rec.near_review_status,
    rec.far_review_status,
  )
  const { error } = await supabase.from('recitations').upsert(
    {
      ...rec,
      final_status: finalStatus,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'student_id,text_unit_id' }
  )
  if (error) throw error
}

// ─── App Settings ────────────────────────────────────────────
export async function getAppSetting(key: string): Promise<unknown> {
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', key)
      .single()
    if (error || !data) return null
    return data.value
  } catch {
    return null
  }
}

export async function setAppSetting(key: string, value: unknown): Promise<void> {
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() })
  if (error) throw error
}

// ─── Quran Plans ─────────────────────────────────
import type { QuranPlan, DailyFollowup, BatchScheduleEntry, FollowupEscalation } from './quran-followup'

export async function getQuranPlans(studentId?: string): Promise<QuranPlan[]> {
  let q = supabase.from('quran_plans').select('id,student_id,start_date,end_date,start_position,daily_rate,is_active').eq('is_active', true)
  if (studentId) q = q.eq('student_id', studentId)
  const { data, error } = await q
  if (error) { console.error('getQuranPlans:', error); return [] }
  return data as QuranPlan[]
}

export async function upsertQuranPlan(plan: Partial<QuranPlan> & { student_id: string }): Promise<void> {
  // Deactivate old plans first
  if (plan.is_active !== false) {
    await supabase.from('quran_plans').update({ is_active: false }).eq('student_id', plan.student_id)
  }
  const { error } = await supabase.from('quran_plans').upsert(plan as QuranPlan)
  if (error) throw error
}

// ─── Daily Followups ─────────────────────────────
export async function getDailyFollowups(filters: {
  studentId?: string
  batchId?: number
  dateFrom?: string
  dateTo?: string
  supervisorId?: string
}): Promise<(DailyFollowup & { student_name?: string; batch_id?: number })[]> {
  // Paginate — students × days can easily exceed 1000 rows
  try {
    return await paginateAll<DailyFollowup>(() => {
      let q = supabase.from('daily_followups').select('id,student_id,supervisor_id,followup_date,expected_position,actual_position,gap,is_exam_day,near_review,far_review,delay_reasons,treatment_actions,notes')
      if (filters.studentId) q = q.eq('student_id', filters.studentId)
      if (filters.supervisorId) q = q.eq('supervisor_id', filters.supervisorId)
      if (filters.dateFrom) q = q.gte('followup_date', filters.dateFrom)
      if (filters.dateTo) q = q.lte('followup_date', filters.dateTo)
      return q.order('followup_date', { ascending: false })
    })
  } catch (err) {
    console.error('getDailyFollowups:', err)
    return []
  }
}

export async function upsertDailyFollowup(followup: DailyFollowup): Promise<void> {
  const { error } = await supabase.from('daily_followups').upsert(
    followup,
    { onConflict: 'student_id,followup_date' }
  )
  if (error) throw error
  invalidateCache(CACHE_KEYS.DAILY_FOLLOWUPS)
}

// ─── Batch Schedule ──────────────────────────────
export async function getBatchSchedule(batchId: number, dateFrom?: string, dateTo?: string): Promise<BatchScheduleEntry[]> {
  let q = supabase.from('batch_schedule').select('batch_id,date,day_type').eq('batch_id', batchId)
  if (dateFrom) q = q.gte('date', dateFrom)
  if (dateTo) q = q.lte('date', dateTo)
  const { data, error } = await q
  if (error) { console.error('getBatchSchedule:', error); return [] }
  return data as BatchScheduleEntry[]
}

export async function upsertBatchScheduleDay(entry: BatchScheduleEntry): Promise<void> {
  const { error } = await supabase.from('batch_schedule').upsert(
    entry,
    { onConflict: 'batch_id,date' }
  )
  if (error) throw error
}

export async function deleteBatchScheduleDay(batchId: number, date: string): Promise<void> {
  const { error } = await supabase.from('batch_schedule').delete().eq('batch_id', batchId).eq('date', date)
  if (error) throw error
}

// ─── Followup Escalations ────────────────────────
export async function getFollowupEscalations(filters: {
  batchId?: number
  status?: string
  level?: string
}): Promise<FollowupEscalation[]> {
  let q = supabase.from('followup_escalations').select('id,student_id,student_name,supervisor_id,batch_id,weeks_delayed,level,triggered_at,resolved_at,action_taken,status')
  if (filters.batchId) q = q.eq('batch_id', filters.batchId)
  if (filters.status) q = q.eq('status', filters.status)
  if (filters.level) q = q.eq('level', filters.level)
  q = q.order('triggered_at', { ascending: false })
  const { data, error } = await q
  if (error) { console.error('getFollowupEscalations:', error); return [] }
  return data as FollowupEscalation[]
}

export async function upsertFollowupEscalation(esc: FollowupEscalation): Promise<void> {
  const { error } = await supabase.from('followup_escalations').upsert(esc as FollowupEscalation)
  if (error) throw error
}
