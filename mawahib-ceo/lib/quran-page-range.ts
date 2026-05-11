// ════════════════════════════════════════════════════════════════════════
// تسمية نطاق صفحات القرآن كأجزاء مفهومة
// كل جزء = 20 وجه (مصحف المدينة)
// قاعدة الأوجه داخل الجزء الواحد:
//   16-20 = جزء كامل
//   8-15  = نصف
//   1-7   = "X أوجه من ج N"
// ════════════════════════════════════════════════════════════════════════

const JUZ_PAGES = 20

function toAr(n: number): string { return n.toLocaleString('ar-EG') }

interface Segment {
  juz: number
  pages: number
  full: boolean        // 16-20 = نعتبره جزءاً كاملاً
  half: boolean        // 8-15 = نصف
}

/** حدود صفحات كل جزء (مصحف المدينة — ج30 = 24 صفحة 581-604، البقية 20). */
function juzBounds(juz: number): { start: number; end: number } {
  if (juz < 1) juz = 1
  if (juz >= 30) return { start: 581, end: 604 }
  return { start: (juz - 1) * JUZ_PAGES + 1, end: juz * JUZ_PAGES }
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
    // ج30 = 24 صفحة، فالحدود تتكيف
    const fullSize = juzEnd - juzStart + 1
    segs.push({
      juz, pages,
      full: pages >= fullSize - 4,                 // ≥ 16 لـ20 صفحة، ≥ 20 لـ24
      half: pages >= 8 && pages < fullSize - 4,
    })
  }
  return segs
}

/**
 * يحوّل نطاق صفحات إلى صيغة مختصرة كقائمة أجزاء.
 *
 * أمثلة:
 *   formatPageRangeAsJuz(1, 50)   → "ج١، ٢، نصف ج٣"
 *   formatPageRangeAsJuz(1, 30)   → "ج١، نصف ج٢"
 *   formatPageRangeAsJuz(1, 40)   → "ج١، ٢"
 *   formatPageRangeAsJuz(500, 510)→ "١ وجه من ج٢٥، نصف ج٢٦"
 *   formatPageRangeAsJuz(1, 7)    → "٧ أوجه من ج١"
 */
export function formatPageRangeAsJuz(from: number, to: number): string {
  if (!from || !to || to < from) return ''
  const segs = splitByJuz(from, to)
  if (segs.length === 0) return ''

  // نجمع الأجزاء الكاملة المتتالية في group واحد: "ج١، ٢، ٣"
  // الباقي (نصف / X أوجه) نُلحقه كنص مستقل.
  const parts: string[] = []
  let fullRun: number[] = []

  const flushFull = () => {
    if (fullRun.length === 0) return
    if (fullRun.length === 1) {
      parts.push(`ج${toAr(fullRun[0])}`)
    } else {
      // ج١، ٢، ٣ — الأول فقط بـ"ج"، الباقي أرقام مفصولة بفواصل
      parts.push('ج' + fullRun.map(toAr).join('، '))
    }
    fullRun = []
  }

  for (const s of segs) {
    if (s.full) {
      fullRun.push(s.juz)
    } else if (s.half) {
      flushFull()
      parts.push(`نصف ج${toAr(s.juz)}`)
    } else {
      // 1-7 أوجه
      flushFull()
      const wajh = s.pages === 1 ? 'وجه' : s.pages === 2 ? 'وجهان' : 'أوجه'
      parts.push(`${toAr(s.pages)} ${wajh} من ج${toAr(s.juz)}`)
    }
  }
  flushFull()

  return parts.join('، ')
}

/** يُرجع رقم الجزء (1-30) الذي تقع فيه صفحة معينة. */
export function pageToJuzNumber(page: number): number {
  if (page < 1) return 1
  if (page >= 581) return 30
  return Math.ceil(page / JUZ_PAGES)
}
