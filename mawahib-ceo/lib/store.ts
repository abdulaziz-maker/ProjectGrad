// Simple localStorage store for persisting edits

export type JuzStatus = 'memorized' | 'weak' | 'struggling' | 'in_progress' | 'not_started'

export interface StudentJuzData {
  [studentId: string]: {
    [juz: number]: JuzStatus
  }
}

export interface Exam {
  id: string
  studentId: string
  studentName: string
  batchId: number
  juzNumber: number
  examiner: string
  date: string // YYYY-MM-DD
  time: string // HH:MM
  status: 'scheduled' | 'passed' | 'failed' | 'postponed'
  score?: number
  notes?: string
}

export interface CEOTask {
  id: string
  category: string // fixed: 'batch_managers' | 'budget' | 'fees' | 'supervisors' | 'custom' | any custom id
  title: string
  description?: string
  recurrence: 'daily' | 'weekly' | 'monthly' | 'once'
  dueDate?: string
  completedDates: string[] // dates this was marked done
  priority: 'high' | 'medium' | 'low'
}

export interface CustomCategory {
  id: string
  label: string
  color: string // tailwind color classes
}

// ---- Custom Categories ----
export function loadCustomCategories(): CustomCategory[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem('mawahib_custom_categories')
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function saveCustomCategories(cats: CustomCategory[]) {
  if (typeof window === 'undefined') return
  localStorage.setItem('mawahib_custom_categories', JSON.stringify(cats))
}

// ---- Juz Progress ----
export function loadJuzProgress(): StudentJuzData {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem('mawahib_juz_progress')
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

export function saveJuzProgress(data: StudentJuzData) {
  if (typeof window === 'undefined') return
  localStorage.setItem('mawahib_juz_progress', JSON.stringify(data))
}

// ---- Exams ----
export function loadExams(): Exam[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem('mawahib_exams')
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function saveExams(exams: Exam[]) {
  if (typeof window === 'undefined') return
  localStorage.setItem('mawahib_exams', JSON.stringify(exams))
}

// ---- CEO Tasks ----
export function loadTasks(): CEOTask[] {
  if (typeof window === 'undefined') return defaultTasks()
  try {
    const raw = localStorage.getItem('mawahib_ceo_tasks')
    return raw ? JSON.parse(raw) : defaultTasks()
  } catch { return defaultTasks() }
}

export function saveTasks(tasks: CEOTask[]) {
  if (typeof window === 'undefined') return
  localStorage.setItem('mawahib_ceo_tasks', JSON.stringify(tasks))
}

// === MEETINGS ===
export interface StoredMeeting {
  id: string
  type: string
  date: string
  time: string
  attendees: string
  agenda: string
  decisions: string
  recommendations: string
}

export function loadMeetings(): StoredMeeting[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem('mawahib_meetings') || '[]') } catch { return [] }
}
export function saveMeetings(m: StoredMeeting[]) {
  if (typeof window === 'undefined') return
  localStorage.setItem('mawahib_meetings', JSON.stringify(m))
}

// === PROGRAMS ===
export interface StoredProgram {
  id: string
  name: string
  batch_id: string
  type: 'safra' | 'mabit' | 'nadi'
  start_date: string
  end_date: string
  location: string
  budget: number
  objectives: string
  report: string
  status: 'upcoming' | 'ongoing' | 'completed'
}

export function loadPrograms(): StoredProgram[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem('mawahib_programs') || '[]') } catch { return [] }
}
export function savePrograms(p: StoredProgram[]) {
  if (typeof window === 'undefined') return
  localStorage.setItem('mawahib_programs', JSON.stringify(p))
}

// === ATTENDANCE ===
export interface AttendanceDay {
  date: string
  batchId: string
  records: Record<string, 'present' | 'absent' | 'excused' | 'late'>
}

export function loadAttendance(): AttendanceDay[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem('mawahib_attendance') || '[]') } catch { return [] }
}
export function saveAttendance(a: AttendanceDay[]) {
  if (typeof window === 'undefined') return
  localStorage.setItem('mawahib_attendance', JSON.stringify(a))
}

// === STUDENT EDITS ===
export interface StudentEdit {
  id: string
  name: string
  batch_id: number
  supervisor_id: string
  supervisor_name: string
  status: 'active' | 'suspended' | 'graduated'
  notes: string
  enrollment_date: string
}

export function loadStudentEdits(): StudentEdit[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem('mawahib_student_edits') || '[]') } catch { return [] }
}
export function saveStudentEdits(s: StudentEdit[]) {
  if (typeof window === 'undefined') return
  localStorage.setItem('mawahib_student_edits', JSON.stringify(s))
}

export function loadNewStudents(): StudentEdit[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem('mawahib_new_students') || '[]') } catch { return [] }
}
export function saveNewStudents(s: StudentEdit[]) {
  if (typeof window === 'undefined') return
  localStorage.setItem('mawahib_new_students', JSON.stringify(s))
}

// === SUPERVISOR FOLLOWUP ===
export function loadFollowups(): Record<string, boolean> {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(localStorage.getItem('mawahib_followups') || '{}') } catch { return {} }
}
export function saveFollowups(f: Record<string, boolean>) {
  if (typeof window === 'undefined') return
  localStorage.setItem('mawahib_followups', JSON.stringify(f))
}

// === BATCHES ===
export interface StoredBatch {
  id: number
  name: string
  grade_levels: string
  manager_name: string
}
export function loadCustomBatches(): StoredBatch[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem('mawahib_custom_batches') || '[]') } catch { return [] }
}
export function saveCustomBatches(b: StoredBatch[]) {
  if (typeof window === 'undefined') return
  localStorage.setItem('mawahib_custom_batches', JSON.stringify(b))
}

function defaultTasks(): CEOTask[] {
  const today = new Date().toISOString().split('T')[0]
  return [
    // متابعة مدراء المراحل
    { id: 't1', category: 'batch_managers', title: 'متابعة عبدالله التويم — دفعة 48', description: 'مراجعة أداء الدفعة وأي تحديات', recurrence: 'weekly', completedDates: [], priority: 'high' },
    { id: 't2', category: 'batch_managers', title: 'متابعة فيصل الحربي — دفعة 46', description: 'مراجعة أداء الدفعة والإنجاز القرآني', recurrence: 'weekly', completedDates: [], priority: 'high' },
    { id: 't3', category: 'batch_managers', title: 'متابعة أسامة السحيباني — دفعة 44', recurrence: 'weekly', completedDates: [], priority: 'medium' },
    { id: 't4', category: 'batch_managers', title: 'متابعة رياض — دفعة 42', description: 'دفعة التخرج — متابعة دقيقة', recurrence: 'weekly', completedDates: [], priority: 'high' },

    // متابعة المشرفين
    { id: 't5', category: 'supervisors', title: 'مراجعة تقارير المشرفين الأسبوعية', description: 'التحقق أن جميع المشرفين رفعوا تقاريرهم', recurrence: 'weekly', completedDates: [], priority: 'high' },
    { id: 't6', category: 'supervisors', title: 'متابعة خالد السالم — لم يرفع تقريره', description: 'مرّ 12 يوم بدون تقرير', recurrence: 'once', dueDate: today, completedDates: [], priority: 'high' },
    { id: 't7', category: 'supervisors', title: 'تقييم أداء المشرفين الشهري', recurrence: 'monthly', completedDates: [], priority: 'medium' },

    // متابعة العهد
    { id: 't8', category: 'budget', title: 'مراجعة عهدة دفعة 46 — أبريل', description: 'التحقق من المصروفات والفواتير', recurrence: 'monthly', completedDates: [], priority: 'high' },
    { id: 't9', category: 'budget', title: 'مراجعة عهدة دفعة 48 — أبريل', recurrence: 'monthly', completedDates: [], priority: 'high' },
    { id: 't10', category: 'budget', title: 'إغلاق العهدة الشهرية', description: 'اليوم الأول من كل شهر', recurrence: 'monthly', dueDate: '2026-05-01', completedDates: [], priority: 'high' },

    // متابعة الرسوم
    { id: 't11', category: 'fees', title: 'متابعة 5 طلاب لم يسددوا الرسوم', description: 'التواصل مع أولياء الأمور', recurrence: 'weekly', completedDates: [], priority: 'high' },
    { id: 't12', category: 'fees', title: 'مراجعة تقرير الرسوم الشهري', recurrence: 'monthly', completedDates: [], priority: 'medium' },
  ]
}
