// ═══════════════════════════════════════════════
// Quran Followup System — Core Algorithm & Types
// ═══════════════════════════════════════════════

// ─── Types ──────────────────────────────────────
export interface QuranPlan {
  id: number
  student_id: string
  start_date: string
  end_date: string
  start_position: number
  daily_rate: number
  is_active: boolean
  created_at?: string
}

export interface DailyFollowup {
  id?: number
  student_id: string
  supervisor_id?: string
  followup_date: string
  expected_position: number
  actual_position: number | null
  gap: number | null
  is_exam_day: boolean
  near_review: string
  far_review: string
  delay_reasons: string[]
  treatment_actions: string[]
  notes: string
  created_at?: string
}

export interface BatchScheduleEntry {
  id?: number
  batch_id: number
  date: string
  day_type: 'normal' | 'holiday' | 'intensive' | 'exam' | 'educational_day' | 'trip'
  notes?: string
}

export interface FollowupEscalation {
  id?: number
  student_id: string
  student_name: string
  supervisor_id?: string
  batch_id?: number
  weeks_delayed: number
  level: string
  triggered_at?: string
  resolved_at?: string
  action_taken?: string
  status: string
}

// ─── Day Detail (for plan grid) ─────────────────
export type DayType = 'work' | 'exam' | 'holiday' | 'friday' | 'saturday' | 'off' | 'intensive'

export interface DayDetail {
  date: string
  type: DayType
  expectedPosition: number
  isWorkDay: boolean
}

export interface PositionResult {
  position: number
  examDays: string[]
  workDays: number
  dayDetails: DayDetail[]
}

// ─── Hijri Date Utilities ───────────────────────
export function toHijriDisplay(dateStr: string): string {
  try {
    const date = new Date(dateStr + 'T12:00:00')
    return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date)
  } catch {
    return dateStr
  }
}

export function toHijriShort(dateStr: string): string {
  try {
    const date = new Date(dateStr + 'T12:00:00')
    return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', {
      day: 'numeric',
      month: 'short',
    }).format(date)
  } catch {
    return dateStr
  }
}

// ─── Arabic Day/Month Names ─────────────────────
const DAYS_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
const MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']

export function getDayNameAr(dateStr: string): string {
  return DAYS_AR[new Date(dateStr + 'T12:00:00').getDay()]
}

export function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return `${d.getDate()} ${MONTHS_AR[d.getMonth()]}`
}

// ─── Program End Date ──────────────────────────
/** الحلقة تنتهي في ٤ ذو الحجة ١٤٤٧هـ = 2026-05-21 */
export const PROGRAM_END_DATE = '2026-05-21'

// ─── Date Helpers ───────────────────────────────
/**
 * Format Date as YYYY-MM-DD using LOCAL components.
 * ⚠️ Never use toISOString() — it returns UTC and gives YESTERDAY in
 * positive timezones (Saudi Arabia is UTC+3, so local midnight = previous-day UTC).
 */
function localDateIso(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function getToday(): string {
  return localDateIso(new Date())
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return localDateIso(d)
}

export function getThisWeekRange(): { start: string; end: string } {
  const today = new Date()
  const dow = today.getDay()
  const sun = new Date(today)
  sun.setDate(today.getDate() - dow)
  const thu = new Date(sun)
  thu.setDate(sun.getDate() + 4)
  return {
    start: localDateIso(sun),
    end: localDateIso(thu),
  }
}

/** Generate all dates in a range (inclusive) */
export function dateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = []
  const current = new Date(startDate + 'T12:00:00')
  const end = new Date(endDate + 'T12:00:00')
  while (current <= end) {
    dates.push(localDateIso(current))
    current.setDate(current.getDate() + 1)
  }
  return dates
}

// ─── Core Algorithm ─────────────────────────────
/**
 * Calculate the expected Quran position for a given target date.
 *
 * Rules:
 * - Friday & Saturday are holidays (no memorization, no count)
 * - Batch schedule overrides (holiday/trip/educational_day = off)
 * - Intensive days (batch schedule 'intensive') = 2x daily rate
 * - Every 20 pages from start = exam day (next working day off for exam)
 * - Otherwise position += daily_rate per working day
 */
export function calculateExpectedPosition(
  startPosition: number,
  startDate: string,
  targetDate: string,
  dailyRate: number,
  scheduleMap: Map<string, string>,
): PositionResult {
  let position = startPosition
  const start = new Date(startDate + 'T12:00:00')
  const target = new Date(targetDate + 'T12:00:00')
  const programEnd = new Date(PROGRAM_END_DATE + 'T12:00:00')
  const examDays: string[] = []
  const dayDetails: DayDetail[] = []
  let workDays = 0
  let needExam = false

  const current = new Date(start)

  while (current <= target) {
    const dateStr = localDateIso(current)
    const dow = current.getDay()

    // Hard stop: after program end date, no more memorization
    if (current > programEnd) {
      dayDetails.push({ date: dateStr, type: 'off', expectedPosition: position, isWorkDay: false })
      current.setDate(current.getDate() + 1)
      continue
    }

    // Friday
    if (dow === 5) {
      dayDetails.push({ date: dateStr, type: 'friday', expectedPosition: position, isWorkDay: false })
      current.setDate(current.getDate() + 1)
      continue
    }

    // Saturday
    if (dow === 6) {
      dayDetails.push({ date: dateStr, type: 'saturday', expectedPosition: position, isWorkDay: false })
      current.setDate(current.getDate() + 1)
      continue
    }

    // Batch schedule override
    const scheduleType = scheduleMap.get(dateStr)
    if (scheduleType === 'holiday' || scheduleType === 'trip' || scheduleType === 'educational_day') {
      dayDetails.push({ date: dateStr, type: 'off', expectedPosition: position, isWorkDay: false })
      current.setDate(current.getDate() + 1)
      continue
    }

    // Manual exam day (from batch schedule) — no position advancement
    if (scheduleType === 'exam') {
      examDays.push(dateStr)
      if (needExam) needExam = false // consume the auto-exam flag too
      dayDetails.push({ date: dateStr, type: 'exam', expectedPosition: position, isWorkDay: true })
      current.setDate(current.getDate() + 1)
      continue
    }

    // Force-normal: cancels auto-exam, treat as regular work day
    if (scheduleType === 'normal' && needExam) {
      needExam = false
      // fall through to normal work day below
    }

    // Auto exam day (after completing 20 pages) — only if not overridden
    if (needExam) {
      examDays.push(dateStr)
      needExam = false
      dayDetails.push({ date: dateStr, type: 'exam', expectedPosition: position, isWorkDay: true })
      current.setDate(current.getDate() + 1)
      continue
    }

    // Intensive day → 2x rate
    const rate = scheduleType === 'intensive' ? dailyRate * 2 : dailyRate

    // Normal work day
    position += rate
    workDays++

    // Exam threshold: every 20 pages from start
    if ((position - startPosition) > 0 && (position - startPosition) % 20 === 0) {
      needExam = true
    }

    dayDetails.push({
      date: dateStr,
      type: scheduleType === 'intensive' ? 'intensive' : 'work',
      expectedPosition: position,
      isWorkDay: true,
    })
    current.setDate(current.getDate() + 1)
  }

  return { position, examDays, workDays, dayDetails }
}

// ─── Student Status Helpers ─────────────────────
export type StudentFollowupStatus = 'on_track' | 'slight_delay' | 'severe_delay' | 'no_plan' | 'no_followup'

export function getStudentStatus(gap: number | null): StudentFollowupStatus {
  if (gap === null) return 'no_followup'
  if (gap >= 0) return 'on_track'
  if (gap >= -5) return 'slight_delay'
  return 'severe_delay'
}

export const STATUS_LABELS: Record<StudentFollowupStatus, string> = {
  on_track: 'منتظم',
  slight_delay: 'تأخر بسيط',
  severe_delay: 'تأخر كبير',
  no_plan: 'بدون خطة',
  no_followup: 'لم يتابع اليوم',
}

export const STATUS_COLORS: Record<StudentFollowupStatus, string> = {
  on_track: 'text-green-500',
  slight_delay: 'text-amber-500',
  severe_delay: 'text-red-500',
  no_plan: 'text-gray-400',
  no_followup: 'text-gray-400',
}

export const STATUS_BG: Record<StudentFollowupStatus, string> = {
  on_track: 'bg-green-500/10 border-green-500/20',
  slight_delay: 'bg-amber-500/10 border-amber-500/20',
  severe_delay: 'bg-red-500/10 border-red-500/20',
  no_plan: 'bg-gray-500/10 border-gray-500/20',
  no_followup: 'bg-gray-500/10 border-gray-500/20',
}

// ─── Delay Reasons & Treatment Actions ──────────
export const DELAY_REASONS = [
  'مرض',
  'ضعف الهمة',
  'صعوبة الحفظ',
  'ظروف عائلية',
  'سفر',
  'غياب',
]

export const TREATMENT_ACTIONS = [
  'جلسة تحفيزية',
  'تقليص المقدار مؤقتاً',
  'تواصل ولي الأمر',
  'تمارين إضافية',
  'جلسة مراجعة مكثفة',
  'متابعة يومية مع المشرف',
]

// ─── Escalation Level Helpers ───────────────────
export const ESCALATION_LEVELS: Record<string, { label: string; action: string; color: string }> = {
  supervisor:      { label: 'المشرف',             action: 'تحفيز الطالب',         color: 'text-amber-500' },
  batch_manager:   { label: 'مدير الدفعة',        action: 'جلسة مع مدير الدفعة',  color: 'text-orange-500' },
  executive:       { label: 'المدير التنفيذي',    action: 'تواصل ولي الأمر',      color: 'text-red-500' },
  parent_call:     { label: 'اتصال ولي الأمر',    action: 'اتصال هاتفي',          color: 'text-red-600' },
  parent_meeting:  { label: 'استدعاء ولي الأمر',  action: 'اجتماع عاجل',          color: 'text-red-700' },
}

export function getEscalationLevel(weeks: number): string {
  if (weeks <= 1) return 'supervisor'
  if (weeks === 2) return 'batch_manager'
  if (weeks === 3) return 'executive'
  return 'parent_meeting'
}

// ─── Auto Exam Helpers ─────────────────────────
/**
 * Calculate which juz number a student should be tested on
 * based on their current position and plan start.
 * Every 20 pages from start_position = 1 juz completed.
 */
export function getCompletedJuz(currentPosition: number, startPosition: number): number {
  const pagesCompleted = currentPosition - startPosition
  if (pagesCompleted < 20) return 0
  return Math.floor(pagesCompleted / 20)
}

/**
 * Find upcoming exam days within the next N working days from the plan.
 */
export function getUpcomingExamDays(
  startPosition: number,
  startDate: string,
  fromDate: string,
  dailyRate: number,
  scheduleMap: Map<string, string>,
  lookAheadDays: number = 7,
): { date: string; expectedPosition: number }[] {
  const endDate = addDays(fromDate, lookAheadDays)
  const result = calculateExpectedPosition(startPosition, startDate, endDate, dailyRate, scheduleMap)
  return result.dayDetails
    .filter(d => d.type === 'exam' && d.date > fromDate)
    .map(d => ({ date: d.date, expectedPosition: d.expectedPosition }))
}
