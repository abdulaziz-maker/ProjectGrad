'use client'
/**
 * خلية تعديل inline — تحفظ تلقائياً على blur/Enter.
 * تصميم واضح: حدود منقّطة عند الفراغ + خلفية مميّزة عند الفوكس
 */
import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'

interface Props {
  value: number | null
  readOnly?: boolean
  onSave: (next: number | null) => Promise<void> | void
  /** نمط بصري: مفترض = خلفية مائلة للأصفر، فعلي = أبيض نقي */
  variant?: 'expected' | 'actual'
}

export default function PerformanceCell({ value, readOnly, onSave, variant = 'actual' }: Props) {
  const [v, setV] = useState<string>(value != null ? String(value) : '')
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  const initial = useRef<string>(v)

  useEffect(() => {
    setV(value != null ? String(value) : '')
    initial.current = value != null ? String(value) : ''
  }, [value])

  const commit = async () => {
    if (readOnly) return
    if (v === initial.current) return
    const trimmed = v.trim()
    const next = trimmed === '' ? null : Number(trimmed)
    if (next != null && Number.isNaN(next)) {
      setV(initial.current)
      return
    }
    setSaving(true)
    try {
      await onSave(next)
      initial.current = trimmed
    } catch {
      setV(initial.current)
    } finally {
      setSaving(false)
    }
  }

  const isEmpty = v === ''
  const expectedTint = variant === 'expected'
    ? 'rgba(192,138,72,0.06)'
    : 'transparent'

  return (
    <div className="relative w-full" style={{ background: expectedTint }}>
      <input
        ref={ref}
        type="text"
        inputMode="decimal"
        value={v}
        readOnly={readOnly}
        placeholder={readOnly ? '' : '—'}
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') ref.current?.blur()
          if (e.key === 'Escape') { setV(initial.current); ref.current?.blur() }
        }}
        className={`w-full h-8 px-1 text-center text-[12px] font-mono font-semibold outline-none bg-transparent transition ${
          readOnly
            ? 'cursor-default'
            : isEmpty
              ? 'border border-dashed border-[var(--border-soft)] rounded'
              : 'border border-transparent rounded hover:border-[var(--border-soft)]'
        } focus:border-[var(--accent-warm)] focus:bg-white focus:ring-2 focus:ring-[var(--accent-warm)]/20 ${
          saving ? 'opacity-60' : ''
        }`}
        style={{ color: 'var(--text-primary)' }}
      />
      {saving && (
        <span className="absolute top-1/2 right-1 -translate-y-1/2 pointer-events-none">
          <Loader2 className="w-3 h-3 animate-spin" style={{ color: 'var(--accent-warm)' }} />
        </span>
      )}
    </div>
  )
}
