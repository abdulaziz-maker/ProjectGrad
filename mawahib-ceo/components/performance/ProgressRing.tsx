'use client'
/**
 * حلقة دائرية تعرض النسبة الإجمالية للطالب
 */
import { pctTone, type Thresholds } from './PctBadge'

interface Props {
  pct: number | null
  size?: number
  stroke?: number
  thresholds: Thresholds
}

export default function ProgressRing({ pct, size = 46, stroke = 4, thresholds }: Props) {
  const safePct = pct ?? 0
  const tone = pctTone(pct, thresholds)
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const dash = (Math.min(100, safePct) / 100) * c
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke="var(--bg-subtle)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke={tone}
          strokeWidth={stroke}
          strokeDasharray={`${dash} ${c}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.6s cubic-bezier(0.2,0.8,0.3,1)' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-noto-kufi), sans-serif',
        fontWeight: 700,
        fontSize: size > 60 ? 16 : 12,
        color: tone,
        letterSpacing: '-0.02em',
      }}>
        {pct == null ? '—' : `${pct}٪`}
      </div>
    </div>
  )
}
