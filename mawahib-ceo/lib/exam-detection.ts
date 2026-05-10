// ══════════════════════════════════════════════════════════════════════════
// نظام اكتشاف الاختبارات التلقائية
//
// المنطق:
//   - قريب من الاختبار: بقي ≤4 أوجه على نهاية الجزء
//   - أكمل جزءاً: آخر صفحة = آخر صفحة في الجزء
//   - أيام العمل: السبت-الخميس (الجمعة إجازة)
// ══════════════════════════════════════════════════════════════════════════

import { JUZ_PAGE_RANGES } from '@/lib/quran-far-review'

export const NEAR_EXAM_THRESHOLD = 4  // أوجه

// ─── Types ────────────────────────────────────────────────────

export interface NearExamStudent {
  studentId:      string
  studentName:    string
  batchId:        number
  juz:            number
  currentPage:    number   // آخر صفحة مسجّلة (مطلقة)
  remainingPages: number   // كم وجه تبقى حتى نهاية الجزء
  juzEndPage:     number
}

export interface CompletedJuzStudent {
  studentId:   string
  studentName: string
  batchId:     number
  juz:         number
  examDate:    string   // +2 أيام عمل من اليوم
}

// ─── خريطة نهايات الأجزاء ─────────────────────────────────────

/** آخر صفحة في كل جزء */
export function getJuzEndPage(juz: number): number {
  return JUZ_PAGE_RANGES[juz]?.to ?? juz * 20
}

/** أول صفحة في كل جزء */
export function getJuzStartPage(juz: number): number {
  return JUZ_PAGE_RANGES[juz]?.from ?? (juz - 1) * 20 + 1
}

// ─── Core Detection ───────────────────────────────────────────

/**
 * أي جزء تنتمي إليه هذه الصفحة وكم تبقى منه؟
 * Returns null لو الصفحة خارج 1..604
 */
export function getJuzForMemPage(
  page: number,
): { juz: number; endPage: number; remaining: number } | null {
  if (page < 1 || page > 604) return null
  for (const [juzStr, range] of Object.entries(JUZ_PAGE_RANGES)) {
    if (page >= range.from && page <= range.to) {
      const juz = Number(juzStr)
      return { juz, endPage: range.to, remaining: range.to - page }
    }
  }
  return null
}

/**
 * هل الطالب قريب من نهاية جزء؟ (remaining ≤ threshold)
 * Returns بيانات الجزء أو null لو ما يستوفي الشرط.
 */
export function isNearJuzEnd(
  page: number,
  threshold = NEAR_EXAM_THRESHOLD,
): { juz: number; endPage: number; remaining: number } | null {
  const info = getJuzForMemPage(page)
  if (!info) return null
  if (info.remaining > threshold) return null
  return info
}

/**
 * هل أكمل الطالب جزءاً كاملاً؟
 * Returns رقم الجزء أو null.
 */
export function hasCompletedJuz(page: number): number | null {
  const info = getJuzForMemPage(page)
  if (!info) return null
  return info.remaining === 0 ? info.juz : null
}

// ─── أيام العمل ───────────────────────────────────────────────

/** أيام الأسبوع: 0=الأحد، 5=الجمعة، 6=السبت */
const FRIDAY = 5

/**
 * يضيف n أيام عمل (يتجاوز الجمعة).
 * أيام العمل: السبت-الخميس.
 */
export function addWorkingDays(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  let added = 0
  while (added < days) {
    d.setDate(d.getDate() + 1)
    if (d.getDay() !== FRIDAY) added++
  }
  return d.toISOString().slice(0, 10)
}

// ─── Batch Processing ─────────────────────────────────────────

/**
 * يُصنّف قائمة (studentId → latestPage) إلى:
 * - nearExam: قريبون من الاختبار
 * - completedJuz: أكملوا جزءاً
 *
 * @param students  - Map أو array من سجلات آخر صفحة
 * @param today     - تاريخ اليوم (YYYY-MM-DD) لحساب موعد الاختبار
 */
export function detectExamCandidates(
  students: Array<{ studentId: string; studentName: string; batchId: number; latestPage: number }>,
  today: string,
): {
  nearExam:     NearExamStudent[]
  completedJuz: CompletedJuzStudent[]
} {
  const nearExam:     NearExamStudent[]     = []
  const completedJuz: CompletedJuzStudent[] = []

  for (const s of students) {
    const { latestPage, studentId, studentName, batchId } = s

    const completed = hasCompletedJuz(latestPage)
    if (completed !== null) {
      completedJuz.push({
        studentId, studentName, batchId,
        juz: completed,
        examDate: addWorkingDays(today, 2),
      })
      continue   // أكمل الجزء → لا يُدرج في "قريبون" كذلك
    }

    const near = isNearJuzEnd(latestPage)
    if (near) {
      nearExam.push({
        studentId, studentName, batchId,
        juz:            near.juz,
        currentPage:    latestPage,
        remainingPages: near.remaining,
        juzEndPage:     near.endPage,
      })
    }
  }

  // ترتيب: الأقل أوجه أولاً (الأقرب للاختبار)
  nearExam.sort((a, b) => a.remainingPages - b.remainingPages)

  return { nearExam, completedJuz }
}
