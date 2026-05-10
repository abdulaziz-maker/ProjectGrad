// ══════════════════════════════════════════════════════════════════════════
// نظام تتبع المراجعة البعيدة — Sequential Completion Tracking
//
// المنطق:
//   - لكل طالب: جزء حالي + صفحة الوصول + أجزاء مكتملة
//   - الانتقال للجزء التالي فقط بعد إكمال السابق
//   - ترتيب الحفظ: 27→30 ثم 1→26 (مستورد من review-schedule)
//   - المستوى (L1/L2/L3) يحدد كم جزء في الجلسة الواحدة
// ══════════════════════════════════════════════════════════════════════════

import {
  sortByMemorizationOrder,
  getMemorizedJuzList,
  getReviewLevel,
  type ReviewLevel,
} from '@/lib/review-schedule'
import type { DBJuzProgress } from '@/lib/db'
import { supabase } from '@/lib/supabase'

// ─── حدود صفحات كل جزء (مصحف المدينة — 604 وجه) ─────────────
// كل جزء = 20 صفحة بالضبط، عدا الجزء 30 = 24 صفحة (581–604)
export const JUZ_PAGE_RANGES: Record<number, { from: number; to: number }> = {}
for (let j = 1; j <= 29; j++) {
  JUZ_PAGE_RANGES[j] = { from: (j - 1) * 20 + 1, to: j * 20 }
}
JUZ_PAGE_RANGES[30] = { from: 581, to: 604 }

/** كم صفحة في هذا الجزء؟ */
export function juzPageCount(juzNumber: number): number {
  const r = JUZ_PAGE_RANGES[juzNumber]
  if (!r) return 20
  return r.to - r.from + 1
}

/** أي جزء تنتمي إليه هذه الصفحة؟ (null لو خارج النطاق) */
export function getJuzForPage(page: number): number | null {
  if (page < 1 || page > 604) return null
  for (const [juzStr, range] of Object.entries(JUZ_PAGE_RANGES)) {
    if (page >= range.from && page <= range.to) return Number(juzStr)
  }
  return null
}

// ─── DB Types ────────────────────────────────────────────────
export interface DBFarReviewProgress {
  id:           string
  student_id:   string
  batch_id:     number
  juz_number:   number
  current_page: number   // آخر صفحة وصل إليها في هذا الجزء
  is_completed: boolean
  completed_at: string | null
  tenant_id:    number
  updated_at:   string
  created_at:   string
}

// ─── Summary Types (للواجهة) ─────────────────────────────────
export interface FarReviewSession {
  juzNumber: number
  pageFrom:  number   // أول صفحة في الجزء
  pageTo:    number   // آخر صفحة في الجزء
  totalPages: number
  currentPage: number  // 0 = لم يبدأ
  progress:   number   // 0..1
  isCompleted: boolean
  isActive:   boolean  // الجزء الحالي الذي يراجعه
}

export interface FarReviewSummary {
  level:        ReviewLevel | 0
  memorizedCount: number
  activeSessions: FarReviewSession[]    // الجلسة/الجلسات الحالية (1 أو 2 أو 3)
  completedJuz:   number[]              // الأجزاء المكتملة
  nextJuzNumbers: number[]              // الجزء التالي بعد الإكمال
  totalCompleted: number
  totalMemorized: number
}

// ─── DB Helpers ───────────────────────────────────────────────
export async function getFarReviewProgress(
  studentId: string,
): Promise<DBFarReviewProgress[]> {
  const { data, error } = await supabase
    .from('quran_far_review_progress')
    .select('*')
    .eq('student_id', studentId)
    .order('juz_number', { ascending: true })
  if (error) { console.error('getFarReviewProgress:', error); return [] }
  return (data ?? []) as DBFarReviewProgress[]
}

export async function getFarReviewProgressForBatch(
  batchId: number,
): Promise<DBFarReviewProgress[]> {
  const { data, error } = await supabase
    .from('quran_far_review_progress')
    .select('*')
    .eq('batch_id', batchId)
    .order('student_id')
  if (error) { console.error('getFarReviewProgressForBatch:', error); return [] }
  return (data ?? []) as DBFarReviewProgress[]
}

/**
 * يُحدّث تقدم الطالب في جزء بعيد.
 * يُستدعى تلقائياً عند تسجيل far_review في daily_records.
 */
export async function upsertFarReviewProgress(params: {
  studentId:   string
  batchId:     number
  juzNumber:   number
  currentPage: number   // آخر صفحة وصل إليها
  tenantId:    number
}): Promise<void> {
  const { studentId, batchId, juzNumber, currentPage, tenantId } = params
  const juzEnd = JUZ_PAGE_RANGES[juzNumber]?.to ?? (juzNumber * 20)
  const isCompleted = currentPage >= juzEnd
  const completedAt = isCompleted ? new Date().toISOString() : null

  const { error } = await supabase
    .from('quran_far_review_progress')
    .upsert(
      {
        student_id:   studentId,
        batch_id:     batchId,
        juz_number:   juzNumber,
        current_page: currentPage,
        is_completed: isCompleted,
        ...(completedAt ? { completed_at: completedAt } : {}),
        tenant_id:    tenantId,
      },
      { onConflict: 'student_id,juz_number' },
    )
  if (error) console.error('upsertFarReviewProgress:', error)
}

// ─── Pure Calculations ────────────────────────────────────────

/**
 * بناء ملخص المراجعة البعيدة من البيانات المحمّلة — نقية (بلا DB).
 *
 * @param juzProgress    - سجلات juz_progress للطالب
 * @param farProgress    - سجلات quran_far_review_progress للطالب
 * @param studentId      - معرف الطالب
 */
export function buildFarReviewSummary(
  juzProgress: DBJuzProgress[],
  farProgress: DBFarReviewProgress[],
  studentId: string,
): FarReviewSummary {
  const memorizedJuz  = getMemorizedJuzList(juzProgress, studentId)
  const memorizedCount = memorizedJuz.length
  const level          = getReviewLevel(memorizedCount)

  // Map للوصول السريع O(1)
  const progressMap = new Map<number, DBFarReviewProgress>()
  for (const row of farProgress) progressMap.set(row.juz_number, row)

  const completedJuz = memorizedJuz.filter(j => progressMap.get(j)?.is_completed === true)
  const incompleteJuz = memorizedJuz.filter(j => !progressMap.get(j)?.is_completed)

  // جلسات نشطة: أول `level` جزء غير مكتمل بترتيب الحفظ
  const sessionCount  = level === 0 ? 0 : level
  const activeJuzNums = incompleteJuz.slice(0, sessionCount)

  const activeSessions: FarReviewSession[] = activeJuzNums.map(juzNum => {
    const range    = JUZ_PAGE_RANGES[juzNum]
    const existing = progressMap.get(juzNum)
    const curPage  = existing?.current_page ?? 0
    const total    = juzPageCount(juzNum)
    const progress = total > 0 ? Math.min(curPage / total, 1) : 0

    return {
      juzNumber:   juzNum,
      pageFrom:    range.from,
      pageTo:      range.to,
      totalPages:  total,
      currentPage: curPage,
      progress,
      isCompleted: existing?.is_completed ?? false,
      isActive:    true,
    }
  })

  // الجزء التالي بعد الجلسات الحالية
  const nextJuzNumbers = incompleteJuz.slice(sessionCount, sessionCount + sessionCount)

  return {
    level,
    memorizedCount,
    activeSessions,
    completedJuz,
    nextJuzNumbers,
    totalCompleted: completedJuz.length,
    totalMemorized: memorizedCount,
  }
}

/**
 * لو المعلم سجّل far_review_from_page + far_review_to_page:
 * احسب أي جزء يجب تحديثه وبأي صفحة.
 *
 * Returns null لو الصفحات خارج نطاق معروف.
 */
export function resolveProgressUpdate(
  fromPage: number,
  toPage: number,
): { juzNumber: number; newCurrentPage: number } | null {
  // نأخذ الجزء من toPage (آخر صفحة وصلها الطالب)
  const juzNum = getJuzForPage(toPage)
  if (!juzNum) return null

  const range = JUZ_PAGE_RANGES[juzNum]
  // current_page = الوجه النسبي داخل الجزء (1..totalPages)
  const newCurrentPage = toPage - range.from + 1

  return { juzNumber: juzNum, newCurrentPage }
}
