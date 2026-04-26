'use client'
/**
 * PerfCell — خلية فعلي/مفترض على نمط Claude Design.
 *
 * التصميم:
 *   عمودي: [الفعلي الكبير] / [المفترض الصغير]
 *           [نسبة٪]
 *           [شريط تقدّم ملوّن]
 *
 * أوضاع التحرير:
 *   - الوضع الافتراضي: نقر على الخلية → تعديل الفعلي
 *   - وضع تعديل الأهداف: نقر على المفترض → تعديل المفترض
 */
import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { pctTone, type Thresholds } from './PctBadge'

interface Props {
  expected: number | null
  actual: number | null
  thresholds: Thresholds
  density: 'compact' | 'medium' | 'cozy'
  readOnly?: boolean
  /** وضع تعديل المفترضات (يغيّر سلوك النقر) */
  editPlannedMode?: boolean
  onSaveActual: (next: number | null) => Promise<void> | void
  onSaveExpected: (next: number | null) => Promise<void> | void
}

const SIZES = {
  compact: { padY: 4,  padX: 6,  big: 14, small: 9.5,  bar: 3, minH: 56 },
  medium:  { padY: 8,  padX: 10, big: 17, small: 10.5, bar: 4, minH: 72 },
  cozy:    { padY: 12, padX: 12, big: 20, small: 11.5, bar: 5, minH: 90 },
} as const

export default function PerformanceCell({
  expected, actual, thresholds, density,
  readOnly, editPlannedMode,
  onSaveActual, onSaveExpected,
}: Props) {
  const sz = SIZES[density]

  const pct = (expected == null || expected === 0)
    ? null
    : actual == null
      ? null
      : Math.min(150, Math.round((actual / expected) * 100))

  const tone = pctTone(pct, thresholds)
  const [hover, setHover] = useState(false)
  const [editingActual, setEditingActual] = useState(false)
  const [editingExpected, setEditingExpected] = useState(false)
  const [savingActual, setSavingActual] = useState(false)
  const [savingExpected, setSavingExpected] = useState(false)

  const [localActual, setLocalActual] = useState<string>(actual != null ? String(actual) : '')
  const [localExpected, setLocalExpected] = useState<string>(expected != null ? String(expected) : '')
  useEffect(() => setLocalActual(actual != null ? String(actual) : ''), [actual])
  useEffect(() => setLocalExpected(expected != null ? String(expected) : ''), [expected])

  const commitActual = async () => {
    setEditingActual(false)
    if (readOnly) return
    const t = localActual.trim()
    const next = t === '' ? null : Number(t)
    if (next != null && Number.isNaN(next)) {
      setLocalActual(actual != null ? String(actual) : '')
      return
    }
    if (next === actual) return
    setSavingActual(true)
    try { await onSaveActual(next) } catch { setLocalActual(actual != null ? String(actual) : '') }
    finally { setSavingActual(false) }
  }
  const commitExpected = async () => {
    setEditingExpected(false)
    if (readOnly) return
    const t = localExpected.trim()
    const next = t === '' ? null : Number(t)
    if (next != null && Number.isNaN(next)) {
      setLocalExpected(expected != null ? String(expected) : '')
      return
    }
    if (next === expected) return
    setSavingExpected(true)
    try { await onSaveExpected(next) } catch { setLocalExpected(expected != null ? String(expected) : '') }
    finally { setSavingExpected(false) }
  }

  const handleClick = () => {
    if (readOnly) return
    if (editPlannedMode) setEditingExpected(true)
    else setEditingActual(true)
  }

  // ─── وضع تعديل الفعلي (input كبير) ─────────────────────
  if (editingActual) {
    return (
      <div style={{
        padding: sz.padY,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
        background: 'rgba(58,61,68,0.10)',
        border: '1.5px solid var(--text-primary)',
        borderRadius: 8, minHeight: sz.minH,
      }}>
        <input
          autoFocus
          type="number"
          inputMode="decimal"
          value={localActual}
          onChange={(e) => setLocalActual(e.target.value)}
          onBlur={commitActual}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitActual()
            if (e.key === 'Escape') { setLocalActual(actual != null ? String(actual) : ''); setEditingActual(false) }
          }}
          style={{
            width: '100%', textAlign: 'center', border: 'none', background: 'transparent',
            fontFamily: 'var(--font-noto-kufi), sans-serif',
            fontSize: sz.big, fontWeight: 700,
            color: tone, outline: 'none',
          }}
        />
        <div style={{ fontSize: sz.small, color: 'var(--text-muted)', fontWeight: 600 }}>
          من {expected ?? '—'}
        </div>
      </div>
    )
  }

  return (
    <div
      onClick={handleClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: `${sz.padY}px ${sz.padX}px`,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 3,
        cursor: readOnly ? 'default' : 'pointer',
        borderRadius: 8,
        background: hover && !readOnly ? `${tone}10` : 'transparent',
        transition: 'background 0.15s',
        position: 'relative',
        minHeight: sz.minH,
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 5,
        fontFamily: 'var(--font-noto-kufi), sans-serif',
      }}>
        <span style={{
          fontSize: sz.big, fontWeight: 700,
          color: actual == null ? 'var(--text-muted)' : tone,
          letterSpacing: '-0.02em', lineHeight: 1,
        }}>
          {actual ?? '—'}
        </span>

        {editingExpected ? (
          <input
            autoFocus
            type="number"
            inputMode="decimal"
            value={localExpected}
            onChange={(e) => setLocalExpected(e.target.value)}
            onBlur={commitExpected}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitExpected()
              if (e.key === 'Escape') { setLocalExpected(expected != null ? String(expected) : ''); setEditingExpected(false) }
            }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 40, textAlign: 'center',
              border: '1.5px solid var(--accent-warm)',
              background: 'rgba(192,138,72,0.12)', borderRadius: 5, outline: 'none',
              fontFamily: 'var(--font-noto-kufi), sans-serif',
              fontSize: sz.small + 1, fontWeight: 700,
              color: 'var(--accent-warm)', padding: '1px 3px',
            }}
          />
        ) : (
          <span
            onClick={(e) => {
              e.stopPropagation()
              if (editPlannedMode && !readOnly) setEditingExpected(true)
            }}
            title={editPlannedMode ? 'انقر لتعديل المفترض' : ''}
            style={{
              fontSize: sz.small, fontWeight: 600,
              color: editPlannedMode ? 'var(--accent-warm)' : 'var(--text-muted)',
              cursor: editPlannedMode && !readOnly ? 'pointer' : 'default',
              textDecoration: editPlannedMode ? 'underline dotted' : 'none',
              textDecorationColor: 'var(--accent-warm)',
              padding: editPlannedMode ? '1px 3px' : '0',
              borderRadius: 4,
              background: editPlannedMode ? 'rgba(192,138,72,0.12)' : 'transparent',
            }}
          >
            /{expected ?? '—'}
          </span>
        )}
      </div>

      <div style={{
        fontSize: sz.small - 0.5,
        color: pct == null ? 'var(--text-muted)' : tone,
        fontWeight: 700, letterSpacing: '-0.01em',
      }}>
        {pct == null ? '—' : `${pct}٪`}
      </div>

      {/* progress bar */}
      <div style={{
        width: '100%', height: sz.bar,
        background: 'var(--bg-subtle)',
        borderRadius: 100, overflow: 'hidden', marginTop: 2,
      }}>
        <div style={{
          width: pct != null ? `${Math.min(100, pct)}%` : '0%',
          height: '100%',
          background: `linear-gradient(90deg, ${tone}, ${tone}cc)`,
          borderRadius: 100,
          transition: 'width 0.5s cubic-bezier(0.2,0.8,0.3,1)',
        }} />
      </div>

      {hover && !readOnly && (savingActual || savingExpected) && (
        <Loader2 style={{ position: 'absolute', top: 4, left: 4 }} className="w-3 h-3 animate-spin"
          color="var(--accent-warm)" />
      )}
      {hover && !readOnly && !savingActual && !savingExpected && (
        <span style={{
          position: 'absolute', top: 2, left: 4,
          fontSize: 9, color: 'var(--text-muted)',
        }}>✎</span>
      )}
    </div>
  )
}
