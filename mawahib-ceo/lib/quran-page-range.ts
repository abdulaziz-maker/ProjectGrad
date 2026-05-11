// ════════════════════════════════════════════════════════════════════════
// تقسيم مصحف المدينة (604 صفحة) إلى أجزاء — Source of Truth
//
// التقسيم الفعلي:
//   ج١: 1   → 21   (21 صفحة)  — يبدأ من الفاتحة
//   ج٢: 22  → 41   (20 صفحة)
//   ج٣: 42  → 61   (20 صفحة)
//   ... كل جزء 20 صفحة
//   ج٢٩: 562 → 581 (20 صفحة)
//   ج٣٠: 582 → 604 (23 صفحة)
//
// قاعدة العرض داخل الجزء الواحد:
//   pages >= juzSize - 4  = جزء كامل
//   pages >= 8 و < ذلك    = نصف
//   1 → 7                 = "X أوجه من ج N"
// ════════════════════════════════════════════════════════════════════════

function toAr(n: number): string { return n.toLocaleString('ar-EG') }

/** حدود صفحات كل جزء (1-30). */
export function juzBounds(juz: number): { start: number; end: number } {
  if (juz <= 1)  return { start: 1,   end: 21  }   // ج١ = 21 صفحة
  if (juz >= 30) return { start: 582, end: 604 }   // ج٣٠ = 23 صفحة
  // ج٢..ج٢٩: كل واحد 20 صفحة، يبدأ ج٢ من ص٢٢
  const start = 22 + (juz - 2) * 20
  return { start, end: start + 19 }
}

/** يُرجع رقم الجزء (1-30) الذي تقع فيه صفحة معينة. */
export function pageToJuzNumber(page: number): number {
  if (page <= 0)   return 1
  if (page <= 21)  return 1
  if (page >= 582) return 30
  // page بين 22 و581 → ج٢..ج٢٩
  return 2 + Math.floor((page - 22) / 20)
}

/** عدد الصفحات في جزء معين. */
function juzSize(juz: number): number {
  const { start, end } = juzBounds(juz)
  return end - start + 1
}

interface Segment {
  juz: number
  pages: number
  full: boolean        // عدد قريب من حجم الجزء كاملاً
  half: boolean
}

/** يقسّم النطاق إلى segments — segment لكل جزء يلامسه النطاق. */
function splitByJuz(from: number, to: number): Segment[] {
  const startJuz = pageToJuzNumber(from)
  const endJuz   = pageToJuzNumber(to)
  const segs: Segment[] = []
  for (let juz = startJuz; juz <= endJuz; juz++) {
    const { start: juzStart, end: juzEnd } = juzBounds(juz)
    const a = Math.max(from, juzStart)
    const b = Math.min(to,   juzEnd)
    const pages = b - a + 1
    if (pages <= 0) continue
    const size = juzSize(juz)
    segs.push({
      juz, pages,
      full: pages >= size - 4,                 // كامل تقريباً
      half: pages >= 8 && pages <  size - 4,
    })
  }
  return segs
}

/**
 * يحوّل نطاق صفحات إلى صيغة مختصرة كقائمة أجزاء.
 *
 * أمثلة (بالتقسيم الصحيح ج١=21، ج٢=20، ج٣٠=23):
 *   (1, 21)   → "ج١"
 *   (1, 41)   → "ج١، ٢"
 *   (1, 51)   → "ج١، ٢، نصف ج٣"  (51-42+1=10 من ج٣ = نصف)
 *   (22, 41)  → "ج٢"
 *   (582, 604)→ "ج٣٠"
 */
export function formatPageRangeAsJuz(from: number, to: number): string {
  if (!from || !to || to < from) return ''
  const segs = splitByJuz(from, to)
  if (segs.length === 0) return ''

  const parts: string[] = []
  let fullRun: number[] = []

  const flushFull = () => {
    if (fullRun.length === 0) return
    if (fullRun.length === 1) parts.push(`ج${toAr(fullRun[0])}`)
    else                      parts.push('ج' + fullRun.map(toAr).join('، '))
    fullRun = []
  }

  for (const s of segs) {
    if (s.full) {
      fullRun.push(s.juz)
    } else if (s.half) {
      flushFull()
      parts.push(`نصف ج${toAr(s.juz)}`)
    } else {
      flushFull()
      const wajh = s.pages === 1 ? 'وجه' : s.pages === 2 ? 'وجهان' : 'أوجه'
      parts.push(`${toAr(s.pages)} ${wajh} من ج${toAr(s.juz)}`)
    }
  }
  flushFull()

  return parts.join('، ')
}

/** JUZ_PAGE_RANGES — للحفاظ على التوافق مع الكود القديم. */
export const JUZ_PAGE_RANGES: Record<number, { from: number; to: number }> = (() => {
  const map: Record<number, { from: number; to: number }> = {}
  for (let j = 1; j <= 30; j++) {
    const { start, end } = juzBounds(j)
    map[j] = { from: start, to: end }
  }
  return map
})()
