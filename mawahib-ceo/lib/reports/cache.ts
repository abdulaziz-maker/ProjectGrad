// ══════════════════════════════════════════════════════════════════════════
// Cache يومي لتقارير القرآن — sessionStorage بمفتاح يتضمن اليوم
// مفتاح يومي يعني: نفس البيانات في نفس اليوم → استرجاع فوري
// تغيير اليوم → cache miss طبيعي (التقرير يتغيّر)
// ══════════════════════════════════════════════════════════════════════════

import type { QuranReport, ReportPeriod } from './quran-report'

const PREFIX = 'qr'

function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

function cacheKey(params: {
  batchId:    number
  period:     ReportPeriod
  from?:      string
  to?:        string
}): string {
  return [PREFIX, todayKey(), params.batchId, params.period, params.from ?? '', params.to ?? ''].join(':')
}

export function readReportCache(params: {
  batchId: number
  period:  ReportPeriod
  from?:   string
  to?:     string
}): QuranReport | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(cacheKey(params))
    return raw ? (JSON.parse(raw) as QuranReport) : null
  } catch { return null }
}

export function writeReportCache(
  params: { batchId: number; period: ReportPeriod; from?: string; to?: string },
  report: QuranReport,
): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(cacheKey(params), JSON.stringify(report))
  } catch {
    // sessionStorage quota — امسح القديم وحاول مرة واحدة
    try { clearReportCache(); sessionStorage.setItem(cacheKey(params), JSON.stringify(report)) } catch { /* abandon */ }
  }
}

/** يمسح كل الـcache للتقارير (مفيد عند الضغط على "تحديث"). */
export function clearReportCache(): void {
  if (typeof window === 'undefined') return
  const keys: string[] = []
  for (let i = 0; i < sessionStorage.length; i++) {
    const k = sessionStorage.key(i)
    if (k && k.startsWith(`${PREFIX}:`)) keys.push(k)
  }
  keys.forEach(k => sessionStorage.removeItem(k))
}
