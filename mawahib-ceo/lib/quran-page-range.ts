// ════════════════════════════════════════════════════════════════════════
// تسمية نطاق صفحات القرآن كأجزاء مفهومة
// كل جزء = 20 وجه (مصحف المدينة)
// ════════════════════════════════════════════════════════════════════════

const JUZ_PAGES = 20

/**
 * تسمية الباقي (أوجه أقل من جزء كامل):
 *   0       → ""
 *   1-7     → "X وجه/أوجه"
 *   8-15    → "نصف"
 *   16-19   → "جزء" (تقريباً جزء كامل)
 */
function labelRemainder(n: number): string {
  if (n <= 0) return ''
  if (n <= 7)  return `${toAr(n)} ${n === 1 ? 'وجه' : n === 2 ? 'وجهان' : 'أوجه'}`
  if (n <= 15) return 'نصف'
  return 'جزء'
}

function toAr(n: number): string { return n.toLocaleString('ar-EG') }

/** تسمية عدد الأجزاء الكاملة. */
function labelFullJuz(n: number): string {
  if (n === 1) return 'جزء'
  if (n === 2) return 'جزءان'
  return `${toAr(n)} أجزاء`
}

/**
 * يحوّل نطاق صفحات إلى وصف مقروء.
 *
 * أمثلة:
 *   formatPageRangeAsJuz(1, 7)   → "٧ أوجه"
 *   formatPageRangeAsJuz(1, 15)  → "نصف"
 *   formatPageRangeAsJuz(1, 20)  → "جزء"
 *   formatPageRangeAsJuz(1, 30)  → "جزء + نصف"
 *   formatPageRangeAsJuz(1, 40)  → "جزءان"
 *   formatPageRangeAsJuz(1, 41)  → "جزءان + ١ وجه"
 *   formatPageRangeAsJuz(1, 60)  → "٣ أجزاء"
 */
export function formatPageRangeAsJuz(from: number, to: number): string {
  if (!from || !to || to < from) return ''
  const pages = to - from + 1
  const fullJuz  = Math.floor(pages / JUZ_PAGES)
  const remainder = pages % JUZ_PAGES

  const juzPart   = fullJuz > 0 ? labelFullJuz(fullJuz) : ''
  const remPart   = labelRemainder(remainder)

  if (juzPart && remPart) return `${juzPart} + ${remPart}`
  return juzPart || remPart || ''
}

/**
 * يُرجع رقم الجزء (1-30) الذي تقع فيه صفحة معينة.
 * مصحف المدينة: 1-580 → أجزاء 1-29 (20 صفحة لكل جزء)، 581-604 → الجزء 30.
 */
export function pageToJuzNumber(page: number): number {
  if (page < 1) return 1
  if (page >= 581) return 30
  return Math.ceil(page / JUZ_PAGES)
}
