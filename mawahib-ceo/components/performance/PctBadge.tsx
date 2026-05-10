'use client'
/**
 * شارة نسبة مئوية ملوّنة بعتبات قابلة للتخصيص
 */
export interface Thresholds { green: number; red: number }

export function pctTone(pct: number | null, thresholds: Thresholds): string {
  if (pct == null) return '#7E8187'
  if (pct >= thresholds.green) return '#5A8F67'      // success
  if (pct > thresholds.red)    return '#C08A48'      // warm/warning
  return '#B94838'                                    // danger
}

interface Props {
  pct: number | null
  thresholds: Thresholds
  size?: 'sm' | 'md'
}

export default function PctBadge({ pct, thresholds, size = 'md' }: Props) {
  if (pct == null) {
    return (
      <span className="inline-flex items-center justify-center px-2 py-1 rounded-md text-[10px] font-bold"
        style={{ background: 'var(--bg-subtle)', color: 'var(--text-muted)' }}>
        —
      </span>
    )
  }
  const tone = pctTone(pct, thresholds)
  const sz = size === 'sm'
    ? { fontSize: 10, padding: '2px 7px', radius: 6 }
    : { fontSize: 13, padding: '4px 10px', radius: 8 }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      padding: sz.padding, borderRadius: sz.radius,
      background: tone + '22', color: tone,
      fontFamily: 'var(--font-noto-kufi), sans-serif', fontWeight: 700,
      fontSize: sz.fontSize, letterSpacing: '-0.01em', lineHeight: 1,
      border: `1px solid ${tone}44`,
      whiteSpace: 'nowrap',
    }}>{pct}٪</span>
  )
}
