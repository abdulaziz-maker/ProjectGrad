// ══════════════════════════════════════════════════════════════════════════
// أتمتة المراجعة القريبة + البعيدة
// ──────────────────────────────────────────────────────────────────────────
// قواعد المراجعة (من قاعدة البيانات + كمية المحفوظ):
//   1–10 جزء  → L1: قريبة جزء (٢٠ وجه) + بعيدة جزء واحد يومياً
//   11–20 جزء → L2: قريبة جزء (٢٠ وجه) + بعيدة جزءان يومياً
//   21–30 جزء → L3: قريبة جزء (٢٠ وجه) + بعيدة ٣ أجزاء يومياً
//
// "كمية المحفوظ" = الأجزاء بحالة memorized أو weak أو struggling
// (المتعثر يبقى ضمن المحاسبة).
//
// ترتيب الحفظ المعتاد: 27 → 30 ثم 1 → 26.
// أيام العمل: الأحد → الخميس (الجمعة والسبت لا rotation).
// ══════════════════════════════════════════════════════════════════════════

import type { DBJuzProgress } from '@/lib/db'
import { localDateIso } from '@/lib/date'

export type ReviewLevel = 1 | 2 | 3

export interface NearReview {
  /** أول وجه (page) في نطاق المراجعة القريبة */
  startPosition: number
  /** آخر وجه (page) قبل وجه اليوم */
  endPosition: number
  /** نص جاهز للعرض/التعبئة */
  text: string
}

export interface FarReview {
  /** قائمة الأجزاء المطلوبة لهذا اليوم */
  juzNumbers: number[]
  /** نص جاهز للعرض/التعبئة */
  text: string
  /** المستوى المُحدِّد للكمية */
  level: ReviewLevel | 0
}

// ─── ترتيب الحفظ ─────────────────────────────────────────────────
/**
 * يُرتّب الأجزاء بحسب ترتيب الحفظ المعتاد:
 *   27, 28, 29, 30, ثم 1, 2, 3, ..., 26.
 */
export function memorizationOrderRank(juzNum: number): number {
  if (juzNum >= 27 && juzNum <= 30) return juzNum - 27       // 0..3
  if (juzNum >= 1  && juzNum <= 26) return juzNum + 3        // 4..29
  return 999
}

/** يأخذ list أجزاء، يُعيدها مُرتّبة بترتيب الحفظ المعتاد */
export function sortByMemorizationOrder(juz: number[]): number[] {
  return [...juz].sort((a, b) => memorizationOrderRank(a) - memorizationOrderRank(b))
}

// ─── حساب الكمية المحفوظة + المستوى ──────────────────────────────
/**
 * يُرجع قائمة الأجزاء التي يعتبرها النظام "محفوظة" لطالب
 * (memorized + weak + struggling) — مُرتّبة بترتيب الحفظ.
 */
export function getMemorizedJuzList(progress: DBJuzProgress[], studentId: string): number[] {
  const list: number[] = []
  for (const row of progress) {
    if (row.student_id !== studentId) continue
    if (row.status === 'memorized' || row.status === 'weak' || row.status === 'struggling') {
      list.push(row.juz_number)
    }
  }
  return sortByMemorizationOrder(list)
}

/** يُحدّد مستوى الطالب من كمية المحفوظ (1..3) — 0 لو لم يبدأ */
export function getReviewLevel(memorizedCount: number): ReviewLevel | 0 {
  if (memorizedCount <= 0) return 0
  if (memorizedCount <= 10) return 1
  if (memorizedCount <= 20) return 2
  return 3
}

// ─── المراجعة القريبة ────────────────────────────────────────────
/**
 * المراجعة القريبة = آخر ٢٠ وجه قبل الوجه الحالي.
 * مثال: position=590 → range [570, 589]
 *
 * لو الطالب في بداية الحفظ (position < 21) نُعيد ما توفّر.
 */
export function calculateNearReview(currentPosition: number): NearReview | null {
  if (!currentPosition || currentPosition <= 1) return null

  // نهاية النطاق = الوجه السابق مباشرة
  const endPosition = Math.max(1, currentPosition - 1)
  // بداية النطاق = ٢٠ وجه قبل (مع الانتباه ألا تنزل عن 1)
  const startPosition = Math.max(1, endPosition - 19)

  const text = startPosition === endPosition
    ? `وجه ${startPosition}`
    : `الأوجه ${startPosition} – ${endPosition}`

  return { startPosition, endPosition, text }
}

// ─── المراجعة البعيدة (rotation) ────────────────────────────────
const PROGRAM_START = '2026-02-27' // نقطة بداية ثابتة لحساب dayIndex

/**
 * يحسب عدد أيام العمل (الأحد→الخميس) من PROGRAM_START حتى date شاملاً.
 * الجمعة (5) والسبت (6) لا تُحسب — هما عطلة في النظام.
 */
function workDaysSinceStart(targetDateIso: string): number {
  const start = new Date(PROGRAM_START + 'T12:00:00')
  const target = new Date(targetDateIso + 'T12:00:00')
  if (target < start) return 0

  let count = 0
  const cur = new Date(start)
  while (cur <= target) {
    const dow = cur.getDay()
    if (dow !== 5 && dow !== 6) count++ // ليست جمعة ولا سبت
    cur.setDate(cur.getDate() + 1)
  }
  // count يشمل اليوم الهدف نفسه — للحصول على dayIndex (0-based) نطرح 1
  return Math.max(0, count - 1)
}

/**
 * يحسب المراجعة البعيدة لطالب في يوم محدد.
 *
 * الخوارزمية:
 *   1. اجلب قائمة المحفوظ مرتبة (27→30 ثم 1→26).
 *   2. حدّد المستوى (1/2/3) من كمية المحفوظ.
 *   3. dayIndex = أيام العمل من PROGRAM_START حتى date.
 *   4. start = (dayIndex × level) % memorizedJuz.length
 *   5. خذ `level` جزء بدءاً من start مع wraparound.
 */
export function calculateFarReview(
  memorizedJuz: number[],
  date: string,
): FarReview {
  const level = getReviewLevel(memorizedJuz.length)
  if (level === 0 || memorizedJuz.length === 0) {
    return { juzNumbers: [], text: '—', level: 0 }
  }

  const sorted = sortByMemorizationOrder(memorizedJuz)
  const dayIdx = workDaysSinceStart(date)
  const startIdx = (dayIdx * level) % sorted.length

  const result: number[] = []
  for (let i = 0; i < level; i++) {
    result.push(sorted[(startIdx + i) % sorted.length])
  }

  const text = result.length === 1
    ? `جزء ${result[0]}`
    : `الأجزاء ${result.join('، ')}`

  return { juzNumbers: result, text, level }
}

// ─── دالة موحّدة (قريبة + بعيدة لطالب في يوم) ─────────────────
export interface DailyReview {
  near: NearReview | null
  far: FarReview
  level: ReviewLevel | 0
  memorizedCount: number
}

/**
 * تحسب المراجعة الكاملة لطالب في يوم محدد.
 *
 * @param progress كل صفوف juz_progress
 * @param studentId الطالب
 * @param date YYYY-MM-DD
 * @param currentPosition وجه اليوم (المفترض أو الفعلي حسب الحالة)
 */
export function calculateDailyReview(
  progress: DBJuzProgress[],
  studentId: string,
  date: string,
  currentPosition: number,
): DailyReview {
  const memorizedJuz = getMemorizedJuzList(progress, studentId)
  const memorizedCount = memorizedJuz.length
  const level = getReviewLevel(memorizedCount)
  const near = calculateNearReview(currentPosition)
  const far = calculateFarReview(memorizedJuz, date)
  return { near, far, level, memorizedCount }
}

// ─── نص جاهز للعرض الموحّد ──────────────────────────────────────
export function formatReviewSummary(review: DailyReview): { near: string; far: string } {
  return {
    near: review.near ? review.near.text : 'لم يبدأ بعد',
    far:  review.far.text,
  }
}
