'use client'
/**
 * CalendarHeatmap — visual overview of an entire Hijri year.
 *
 * Layout: 12 rows × up to 30 cells (one per Hijri month × day).
 * Colors mapped from day_type. Hovering reveals Hijri + Gregorian tooltip.
 * Click a cell to trigger `onDayClick` (for inline edit).
 *
 * Designed Hijri-first: rows are Hijri months; Gregorian is only in tooltip.
 */
import { memo, useMemo } from 'react'
import {
  HIJRI_MONTHS_AR,
  parseHijriIso,
  parseGregorianIso,
  formatHijriAr,
  formatGregorianShort,
  type HijriYMD,
} from '@/lib/timeline/hijri'
import type { TimelineDay, TimelineDayType } from '@/types/timeline'

const DAY_TYPE_COLORS: Record<TimelineDayType, { bg: string; border: string; label: string }> = {
  study:   { bg: 'rgba(99,102,241,0.35)', border: 'rgba(99,102,241,0.55)', label: 'دراسة' },
  holiday: { bg: 'rgba(34,197,94,0.35)',  border: 'rgba(34,197,94,0.55)',  label: 'إجازة' },
  exam:    { bg: 'rgba(185,72,56,0.42)',  border: 'rgba(185,72,56,0.65)',  label: 'اختبار' },
  weekend: { bg: 'rgba(148,163,184,0.28)',border: 'rgba(148,163,184,0.45)',label: 'نهاية أسبوع' },
}

const EMPTY_BG = 'rgba(148,163,184,0.08)'
const EMPTY_BORDER = 'rgba(148,163,184,0.18)'

interface Props {
  days: TimelineDay[]
  hijriYear: number
  onDayClick?: (day: TimelineDay) => void
}

interface CellData {
  hy: number
  hm: number  // 1..12
  hd: number  // 1..30
  day: TimelineDay | null
}

function CalendarHeatmapImpl({ days, hijriYear, onDayClick }: Props) {
  const grid = useMemo(() => {
    // Build 12×30 grid indexed by [hm-1][hd-1]
    const cells: (CellData | null)[][] = Array.from({ length: 12 }, (_, m) =>
      Array.from({ length: 30 }, (_, d) => ({ hy: hijriYear, hm: m + 1, hd: d + 1, day: null })),
    )
    for (const day of days) {
      const h = parseHijriIso(day.hijri_date)
      if (!h || h.hy !== hijriYear) continue
      if (h.hm < 1 || h.hm > 12 || h.hd < 1 || h.hd > 30) continue
      cells[h.hm - 1][h.hd - 1]!.day = day
    }
    return cells
  }, [days, hijriYear])

  // Summary counts
  const summary = useMemo(() => {
    const out: Record<TimelineDayType, number> = { study: 0, holiday: 0, exam: 0, weekend: 0 }
    for (const d of days) out[d.day_type as TimelineDayType] = (out[d.day_type as TimelineDayType] ?? 0) + 1
    return out
  }, [days])

  return (
    <div className="space-y-4">
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="font-semibold" style={{ color: 'var(--text-secondary)' }}>
          الإجمالي: <span className="font-mono">{days.length}</span> يوم
        </span>
        <span className="mx-1" style={{ color: 'var(--text-muted)' }}>•</span>
        {(Object.keys(DAY_TYPE_COLORS) as TimelineDayType[]).map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md"
            style={{
              background: DAY_TYPE_COLORS[t].bg,
              border: `1px solid ${DAY_TYPE_COLORS[t].border}`,
              color: 'var(--text-primary)',
            }}
          >
            <span className="w-2 h-2 rounded-full" style={{ background: DAY_TYPE_COLORS[t].border }} />
            {DAY_TYPE_COLORS[t].label}
            <span className="font-mono">{summary[t] ?? 0}</span>
          </span>
        ))}
      </div>

      {/* Grid */}
      <div
        className="rounded-2xl p-3 overflow-x-auto"
        style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-soft)' }}
      >
        <table className="w-full border-separate" style={{ borderSpacing: '3px' }}>
          <thead>
            <tr>
              <th className="text-[10px] font-semibold text-right pr-2" style={{ color: 'var(--text-muted)', minWidth: '110px' }}>
                الشهر
              </th>
              {Array.from({ length: 30 }, (_, i) => (
                <th key={i} className="text-[9px] font-mono text-center" style={{ color: 'var(--text-muted)', minWidth: '20px' }}>
                  {i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.map((monthRow, mIdx) => (
              <tr key={mIdx}>
                <td className="text-xs font-semibold pr-2 text-right" style={{ color: 'var(--text-secondary)' }}>
                  {HIJRI_MONTHS_AR[mIdx]}
                </td>
                {monthRow.map((cell, dIdx) => {
                  if (!cell) return <td key={dIdx} />
                  const color = cell.day
                    ? DAY_TYPE_COLORS[cell.day.day_type as TimelineDayType]
                    : { bg: EMPTY_BG, border: EMPTY_BORDER, label: '' }
                  const h: HijriYMD = { hy: cell.hy, hm: cell.hm, hd: cell.hd }
                  const g = cell.day ? parseGregorianIso(cell.day.gregorian_date) : null
                  const tooltip = cell.day
                    ? `${formatHijriAr(h)} — ${g ? formatGregorianShort(g) + ' م' : ''} • ${color.label}${cell.day.notes ? ` • ${cell.day.notes}` : ''}`
                    : `${formatHijriAr(h)} — لا بيانات`
                  return (
                    <td key={dIdx} className="p-0">
                      <button
                        type="button"
                        title={tooltip}
                        onClick={() => cell.day && onDayClick?.(cell.day)}
                        disabled={!cell.day}
                        className="w-5 h-5 rounded-sm transition hover:scale-110 disabled:cursor-default"
                        style={{
                          background: color.bg,
                          border: `1px solid ${color.border}`,
                        }}
                        aria-label={tooltip}
                      />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default memo(CalendarHeatmapImpl)
