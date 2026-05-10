// ═══════════════════════════════════════════════════════════════════════
// Quran Progress — Async Calculation Layer
//
// الطبقة التي تجمع بين:
//   - الدوال النقية (lib/quran-followup.ts)
//   - DB helpers (lib/db.ts)
//
// لا circular dependency: quran-followup ← quran-progress → db
// ═══════════════════════════════════════════════════════════════════════

import {
  calculateExpectedPosition,
  computeActualPosition,
  computeProgressGap,
  type QuranPlan,
  type BatchScheduleEntry,
  type StudentProgress,
  type ProgressStatus,
} from '@/lib/quran-followup'
import {
  getQuranPlans,
  getBatchSchedule,
  getStudents,
  getQuranRecordsInRange,
  getQuranPlansByBatch,
  getQuranRecordsForBatch,
} from '@/lib/db'
import { localDateIso } from '@/lib/date'

// ─── Helpers ─────────────────────────────────────

function buildScheduleMap(schedule: BatchScheduleEntry[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const entry of schedule) map.set(entry.date, entry.day_type)
  return map
}

/** حساب "clamp date": لا تتجاوز نهاية الخطة */
function effectiveDate(plan: QuranPlan, asOfDate: string): string {
  return plan.end_date && asOfDate > plan.end_date ? plan.end_date : asOfDate
}

// ─── Single Student ───────────────────────────────

/**
 * حساب الموقع الفعلي لطالب واحد في نطاق.
 *
 * @returns latestPage        — آخر صفحة حفظها (absolute)
 *          totalPagesInPeriod — مجموع الصفحات في الفترة
 */
export async function calculateActualPosition(
  studentId: string,
  fromDate: string,
  toDate: string,
): Promise<{ latestPage: number | null; totalPagesInPeriod: number }> {
  const records = await getQuranRecordsInRange(studentId, fromDate, toDate)
  return computeActualPosition(records)
}

/**
 * حساب الفجوة الكاملة لطالب واحد حتى تاريخ معين.
 *
 * يجلب:
 *   1. الخطة النشطة
 *   2. جدول الدفعة (لمعرفة الإجازات والأيام المكثفة)
 *   3. سجلات الحفظ منذ بداية الخطة
 *
 * ثم يحسب: المتوقع، الفعلي، الفجوة، الحالة.
 */
export async function calculateGap(
  studentId: string,
  batchId: number,
  asOfDate: string,
): Promise<{
  expected: number | null
  actual: number | null
  gap: number | null
  status: ProgressStatus
  totalPagesInPeriod: number
  plan: QuranPlan | null
}> {
  // الخطة النشطة
  const plans = await getQuranPlans(studentId)
  const plan = plans[0] ?? null

  if (!plan) {
    return { expected: null, actual: null, gap: null, status: 'no_record', totalPagesInPeriod: 0, plan: null }
  }

  const targetDate = effectiveDate(plan, asOfDate)

  // جدول الدفعة + سجلات الحفظ بالتوازي
  const [schedule, records] = await Promise.all([
    getBatchSchedule(batchId, plan.start_date, targetDate),
    getQuranRecordsInRange(studentId, plan.start_date, targetDate),
  ])

  const scheduleMap = buildScheduleMap(schedule)

  // المتوقع
  const { position: expected } = calculateExpectedPosition(
    plan.start_position,
    plan.start_date,
    targetDate,
    plan.daily_rate,
    scheduleMap,
  )

  // الفعلي
  const { latestPage, totalPagesInPeriod } = computeActualPosition(records)

  // الفجوة والحالة
  const { gap, status } = computeProgressGap(expected, latestPage)

  return { expected, actual: latestPage, gap, status, totalPagesInPeriod, plan }
}

// ─── Batch Level ──────────────────────────────────

/**
 * حساب تقدم جميع طلاب دفعة — محسّن للأداء.
 *
 * التحسين:
 *   - query واحد لكل الخطط
 *   - query واحد لكل السجلات في الفترة
 *   - query واحد للجدول
 *   - كل الحسابات in-memory
 *
 * الخطوات:
 *   1. جلب الطلاب + الخطط + الجدول + السجلات (4 queries متوازية)
 *   2. بناء Maps للبحث O(1)
 *   3. حساب كل طالب synchronously
 */
export async function calculateBatchProgress(
  batchId: number,
  asOfDate: string,
): Promise<StudentProgress[]> {
  // ١. جلب كل شيء بالتوازي
  const [allStudents, plans, records] = await Promise.all([
    getStudents(),
    getQuranPlansByBatch(batchId),
    // نجلب السجلات منذ أقدم خطة نشطة (أو آخر 180 يوم fallback)
    getQuranRecordsForBatch(batchId, localDateIso(new Date(Date.now() - 180 * 86400_000)), asOfDate),
  ])

  const students = allStudents.filter(s => s.batch_id === batchId && s.status === 'active')

  if (students.length === 0) return []

  // جلب الجدول — نطاق يشمل أقدم بداية خطة
  const planStartDates = plans.map(p => p.start_date).sort()
  const scheduleFrom = planStartDates[0] ?? localDateIso(new Date(Date.now() - 180 * 86400_000))
  const schedule = await getBatchSchedule(batchId, scheduleFrom, asOfDate)
  const scheduleMap = buildScheduleMap(schedule)

  // ٢. Maps للبحث O(1)
  const planByStudent = new Map<string, QuranPlan>()
  for (const p of plans) planByStudent.set(p.student_id, p)

  // تجميع السجلات per student
  const recordsByStudent = new Map<string, typeof records>()
  for (const rec of records) {
    const arr = recordsByStudent.get(rec.student_id) ?? []
    arr.push(rec)
    recordsByStudent.set(rec.student_id, arr)
  }

  // ٣. حساب كل طالب synchronously (لا async، كل البيانات في memory)
  const results: StudentProgress[] = students.map(student => {
    const plan = planByStudent.get(student.id) ?? null

    if (!plan) {
      return {
        studentId: student.id,
        name: student.name,
        expected: null,
        actual: null,
        gap: null,
        status: 'no_record' as ProgressStatus,
        totalPagesInPeriod: 0,
        planId: null,
      }
    }

    const targetDate = effectiveDate(plan, asOfDate)

    const { position: expected } = calculateExpectedPosition(
      plan.start_position,
      plan.start_date,
      targetDate,
      plan.daily_rate,
      scheduleMap,
    )

    const studentRecords = recordsByStudent.get(student.id) ?? []
    // فلتر السجلات في نطاق الخطة فقط
    const inRangeRecords = studentRecords.filter(
      r => r.recorded_at >= plan.start_date && r.recorded_at <= targetDate
    )
    const { latestPage, totalPagesInPeriod } = computeActualPosition(inRangeRecords)
    const { gap, status } = computeProgressGap(expected, latestPage)

    return {
      studentId: student.id,
      name: student.name,
      expected,
      actual: latestPage,
      gap,
      status,
      totalPagesInPeriod,
      planId: plan.id,
    }
  })

  // ترتيب: المتأخرون أولاً (gap الأصغر = أسوأ)، ثم بلا خطة في النهاية
  return results.sort((a, b) => {
    if (a.gap === null && b.gap === null) return a.name.localeCompare(b.name, 'ar')
    if (a.gap === null) return 1
    if (b.gap === null) return -1
    return (a.gap ?? 0) - (b.gap ?? 0)
  })
}
