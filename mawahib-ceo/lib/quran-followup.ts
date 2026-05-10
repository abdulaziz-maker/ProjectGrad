// ═══════════════════════════════════════════════
// Quran Followup System — Core Algorithm & Types
// ═══════════════════════════════════════════════

import { localDateIso } from '@/lib/date'

// ─── Types ──────────────────────────────────────
export interface QuranPlan {
  id: number
  student_id: string
  start_date: string
  end_date: string
  start_position: number
  daily_rate: number
  is_active: boolean
  hijri_year?: number | null  // السنة الهجرية للخطة (1447، 1448، …) — null للخطط القديمة
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

// ─── Date Helpers ───────────────────────────────
// localDateIso lives in lib/date.ts (imported above) — KSA-safe local date formatter.

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

/**
 * أسبوع المحاسبة على المتابعات: السبت → الخميس.
 * - يبدأ السبت 00:00 وينتهي الخميس 21:00 (9م).
 * - يُستخدم لقياس التزام المشرف بمتابعة كل طالب مرة على الأقل في الأسبوع.
 * - الجمعة لا تُحتسب (لا متابعة فيها).
 */
export function getFollowupWeekRange(date: Date = new Date()): { start: string; end: string } {
  // dow: 6=Sat, 0=Sun ... 4=Thu, 5=Fri
  // أيام للوراء حتى آخر سبت: Sat→0, Sun→1, Mon→2, Tue→3, Wed→4, Thu→5, Fri→6
  const dow = date.getDay()
  const daysBack = (dow + 1) % 7
  const sat = new Date(date)
  sat.setDate(date.getDate() - daysBack)
  const thu = new Date(sat)
  thu.setDate(sat.getDate() + 5) // السبت + 5 = الخميس
  return { start: localDateIso(sat), end: localDateIso(thu) }
}

/** الأسبوع السابق للمتابعة */
export function getPreviousFollowupWeek(date: Date = new Date()): { start: string; end: string } {
  const cur = getFollowupWeekRange(date)
  const prevSat = new Date(cur.start + 'T12:00:00')
  prevSat.setDate(prevSat.getDate() - 7)
  return getFollowupWeekRange(prevSat)
}

/** هل اليوم بعد نهاية أسبوع المحاسبة (الجمعة فما بعد)؟ */
export function isAfterFollowupWeekEnd(date: Date = new Date()): boolean {
  // الجمعة (5) أو السبت قبل البدء (6 ولكن هذا يبدأ أسبوعاً جديداً)
  // الفعلي: لو جلسنا في الخميس بعد 9م = نعدّه منتهياً
  const dow = date.getDay()
  if (dow === 5) return true // الجمعة كاملة بعد نهاية الأسبوع
  if (dow === 4) {
    // الخميس بعد 9م
    return date.getHours() >= 21
  }
  return false
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
 * - Exam days = MANUAL ONLY via batch schedule (day_type: 'exam') — no auto-exam
 * - Otherwise position += daily_rate per working day
 *
 * ⚠️ لا توجد اختبارات تلقائية — الاختبارات يُضيفها المشرف يدوياً من صفحة الاختبارات
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
  const examDays: string[] = []
  const dayDetails: DayDetail[] = []
  let workDays = 0

  const current = new Date(start)

  while (current <= target) {
    const dateStr = localDateIso(current)
    const dow = current.getDay()

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

    // Manual exam day (from batch schedule only) — no position advancement
    if (scheduleType === 'exam') {
      examDays.push(dateStr)
      dayDetails.push({ date: dateStr, type: 'exam', expectedPosition: position, isWorkDay: true })
      current.setDate(current.getDate() + 1)
      continue
    }

    // Intensive day → 2x rate
    const rate = scheduleType === 'intensive' ? dailyRate * 2 : dailyRate

    // Normal work day
    position += rate
    workDays++

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

// ════════════════════════════════════════════════════════════════════════
// PROGRESS TRACKING — حسابات التقدم والتأخر
// ════════════════════════════════════════════════════════════════════════

/**
 * حالة تقدم الطالب بالنسبة للخطة.
 * - ahead    : متقدم أكثر من 5 صفحات
 * - on_track : ضمن النطاق (±5 صفحات)
 * - behind   : متأخر أكثر من 5 صفحات
 * - no_record: لا يوجد تسجيل حفظ بعد
 */
export type ProgressStatus = 'ahead' | 'on_track' | 'behind' | 'no_record'

export interface StudentProgress {
  studentId: string
  name: string
  expected: number | null  // الصفحة المتوقعة وفق الخطة
  actual:   number | null  // آخر صفحة حفظ مُسجَّلة
  gap:      number | null  // actual - expected (موجب = متقدم، سالب = متأخر)
  status:   ProgressStatus
  totalPagesInPeriod: number  // مجموع الأوجه المحفوظة في الفترة
  planId:   number | null
}

export const PROGRESS_STATUS_LABELS: Record<ProgressStatus, string> = {
  ahead:     'متقدم',
  on_track:  'منتظم',
  behind:    'متأخر',
  no_record: 'لم يُسجَّل',
}

export const PROGRESS_STATUS_COLORS: Record<ProgressStatus, string> = {
  ahead:     '#4ade80',
  on_track:  '#facc15',
  behind:    '#f87171',
  no_record: 'var(--text-muted)',
}

export const PROGRESS_STATUS_BG: Record<ProgressStatus, string> = {
  ahead:     'rgba(74,222,128,0.12)',
  on_track:  'rgba(250,204,21,0.12)',
  behind:    'rgba(248,113,113,0.12)',
  no_record: 'var(--bg-elevated)',
}

export const PROGRESS_STATUS_BORDER: Record<ProgressStatus, string> = {
  ahead:     'rgba(74,222,128,0.3)',
  on_track:  'rgba(250,204,21,0.3)',
  behind:    'rgba(248,113,113,0.3)',
  no_record: 'var(--border-soft)',
}

/**
 * احسب الموقع الفعلي (نقية — بدون DB).
 *
 * @param records  - سجلات الحفظ في الفترة المطلوبة
 * @returns
 *   latestPage        - آخر صفحة وصل إليها الطالب (لمقارنة مع المتوقع)
 *   totalPagesInPeriod - مجموع الصفحات المحفوظة في الفترة (للعرض الإحصائي)
 */
export function computeActualPosition(
  records: Array<{ memorization_from_page: number | null; memorization_to_page: number | null }>,
): { latestPage: number | null; totalPagesInPeriod: number } {
  let latestPage: number | null = null
  let totalPages = 0

  for (const rec of records) {
    const from = rec.memorization_from_page
    const to   = rec.memorization_to_page
    if (from !== null && to !== null && to >= from) {
      totalPages += to - from + 1
      if (latestPage === null || to > latestPage) latestPage = to
    }
  }

  return { latestPage, totalPagesInPeriod: totalPages }
}

/**
 * احسب الفجوة والحالة (نقية — بدون DB).
 *
 * THRESHOLDS: ahead > +5 | on_track ±5 | behind < -5
 */
export function computeProgressGap(
  expected: number,
  latestPage: number | null,
): { gap: number | null; status: ProgressStatus } {
  if (latestPage === null) return { gap: null, status: 'no_record' }

  const gap = latestPage - expected
  const status: ProgressStatus =
    gap > 5  ? 'ahead'    :
    gap >= -5 ? 'on_track' :
                'behind'

  return { gap, status }
}

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

// ─── Compat shim — للحفاظ على توافق صفحات قديمة ─────────────
/** @deprecated استخدام نظام hijri_year الجديد بدلاً منه */
export const PROGRAM_END_DATE = '2026-05-21'
