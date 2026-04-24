'use client'
/**
 * HijriDate — Hijri-first date display.
 *
 * Always shows Hijri as the primary line; Gregorian is shown smaller below
 * (opt-out via `secondary={false}`).
 *
 * Accepts either parsed HijriYMD or ISO strings in either calendar.
 */
import { memo } from 'react'
import {
  formatHijriAr,
  formatGregorianShort,
  parseHijriIso,
  parseGregorianIso,
  hijriToGregorian,
  gregorianToHijri,
  type HijriYMD,
  type GregorianYMD,
} from '@/lib/timeline/hijri'

type Source =
  | { hijri: HijriYMD; gregorian?: GregorianYMD }
  | { hijriIso: string; gregorianIso?: string }
  | { gregorian: GregorianYMD }
  | { gregorianIso: string }

function resolve(src: Source): { h: HijriYMD; g: GregorianYMD } | null {
  if ('hijri' in src && src.hijri) {
    const g = src.gregorian ?? hijriToGregorian(src.hijri)
    return { h: src.hijri, g }
  }
  if ('hijriIso' in src && src.hijriIso) {
    const h = parseHijriIso(src.hijriIso)
    if (!h) return null
    const g = src.gregorianIso
      ? parseGregorianIso(src.gregorianIso) ?? hijriToGregorian(h)
      : hijriToGregorian(h)
    return { h, g }
  }
  if ('gregorian' in src && src.gregorian) {
    return { h: gregorianToHijri(src.gregorian), g: src.gregorian }
  }
  if ('gregorianIso' in src && src.gregorianIso) {
    const g = parseGregorianIso(src.gregorianIso)
    if (!g) return null
    return { h: gregorianToHijri(g), g }
  }
  return null
}

interface Props {
  source: Source
  /** Show Gregorian sub-line? (default: true) */
  secondary?: boolean
  className?: string
}

function HijriDateImpl({ source, secondary = true, className = '' }: Props) {
  const r = resolve(source)
  if (!r) return <span className={className} style={{ color: 'var(--text-muted)' }}>—</span>
  return (
    <span className={`inline-flex flex-col leading-tight ${className}`}>
      <span
        className="font-semibold"
        style={{ color: 'var(--text-primary)' }}
      >
        {formatHijriAr(r.h)}
      </span>
      {secondary && (
        <span
          className="text-[10px] font-mono"
          style={{ color: 'var(--text-muted)' }}
        >
          {formatGregorianShort(r.g)} م
        </span>
      )}
    </span>
  )
}

export default memo(HijriDateImpl)
