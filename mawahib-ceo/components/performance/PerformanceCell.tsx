'use client'
/**
 * خلية تعديل inline للقيم — تحفظ تلقائياً على blur/Enter
 */
import { useEffect, useRef, useState } from 'react'

interface Props {
  value: number | null
  readOnly?: boolean
  onSave: (next: number | null) => Promise<void> | void
  align?: 'center' | 'end'
  unit?: string | null
}

export default function PerformanceCell({ value, readOnly, onSave, align = 'center' }: Props) {
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

  return (
    <input
      ref={ref}
      type="text"
      inputMode="decimal"
      value={v}
      readOnly={readOnly}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') ref.current?.blur()
        if (e.key === 'Escape') { setV(initial.current); ref.current?.blur() }
      }}
      className={`w-full h-7 px-1 text-center text-xs font-mono outline-none bg-transparent ${
        readOnly ? 'cursor-default' : 'focus:bg-white focus:ring-2 focus:ring-[var(--accent-warm)] rounded'
      } ${saving ? 'opacity-60' : ''}`}
      style={{ textAlign: align === 'center' ? 'center' : 'right', color: 'var(--text-primary)' }}
    />
  )
}
