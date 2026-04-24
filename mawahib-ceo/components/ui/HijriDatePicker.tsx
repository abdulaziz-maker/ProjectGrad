'use client'
import { useState, useEffect, useMemo } from 'react'
import { gregorianToHijri, hijriToGregorian, hijriDaysInMonth, HIJRI_MONTHS } from '@/lib/hijri'

interface HijriDatePickerProps {
  value: string                        // Gregorian YYYY-MM-DD (stored in DB)
  onChange: (gregorianDate: string) => void
  label?: string
  className?: string
  compact?: boolean                    // smaller variant
}

export default function HijriDatePicker({ value, onChange, label, className, compact }: HijriDatePickerProps) {
  const hijri = useMemo(() => gregorianToHijri(value || ''), [value])
  const [hYear, setHYear] = useState(hijri.year)
  const [hMonth, setHMonth] = useState(hijri.month)
  const [hDay, setHDay] = useState(hijri.day)

  // Sync when external value changes
  useEffect(() => {
    const h = gregorianToHijri(value || '')
    setHYear(h.year)
    setHMonth(h.month)
    setHDay(h.day)
  }, [value])

  const maxDays = useMemo(() => hijriDaysInMonth(hYear, hMonth), [hYear, hMonth])

  function update(y: number, m: number, d: number) {
    const maxD = hijriDaysInMonth(y, m)
    const clamped = Math.min(d, maxD)
    setHYear(y); setHMonth(m); setHDay(clamped)
    const greg = hijriToGregorian(y, m, clamped)
    if (greg) onChange(greg)
  }

  const py = compact ? 'py-1.5' : 'py-2'
  const text = compact ? 'text-xs' : 'text-sm'

  return (
    <div className={className}>
      {label && <label className="block text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>{label}</label>}
      <div className="flex items-center gap-1">
        {/* Day */}
        <select
          value={hDay}
          onChange={e => update(hYear, hMonth, Number(e.target.value))}
          className={`w-14 px-1 ${py} ${text} border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-400 font-mono text-center`}
        >
          {Array.from({ length: maxDays }, (_, i) => i + 1).map(d => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>

        {/* Month */}
        <select
          value={hMonth}
          onChange={e => update(hYear, Number(e.target.value), hDay)}
          className={`flex-1 min-w-0 px-1 ${py} ${text} border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-400`}
        >
          {HIJRI_MONTHS.map(m => (
            <option key={m.num} value={m.num}>{m.name}</option>
          ))}
        </select>

        {/* Year */}
        <select
          value={hYear}
          onChange={e => update(Number(e.target.value), hMonth, hDay)}
          className={`w-20 px-1 ${py} ${text} border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-400 font-mono text-center`}
        >
          {[1445, 1446, 1447, 1448, 1449, 1450].map(y => (
            <option key={y} value={y}>{y}هـ</option>
          ))}
        </select>
      </div>
      {/* Gregorian secondary */}
      <p className="text-[9px] mt-0.5 font-mono opacity-50" style={{ color: 'var(--text-muted)' }}>{value}</p>
    </div>
  )
}
