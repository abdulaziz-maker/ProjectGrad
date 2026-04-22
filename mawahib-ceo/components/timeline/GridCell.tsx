'use client'
/**
 * GridCell — single day cell for TimelineGrid.
 *
 * Memoized with primitive props only — re-renders only when *its* data changes,
 * not when siblings change. For 360 cells in the grid this is the difference
 * between a smooth zoom and a frozen tab.
 */
import { memo } from 'react'
import { HIJRI_MONTHS_AR } from '@/lib/timeline/hijri'

export interface GridCellProps {
  hm: number // 1..12 (Hijri month)
  hd: number // 1..30
  hijriIso: string
  gregorianIso: string | null
  dayType: 'study' | 'holiday' | 'exam' | 'weekend' | null
  activityCount: number
  activityColor: string | null
  activityTitle: string | null
  activityIcon: string | null
  isToday: boolean
  isSelected: boolean
  showGregorian: boolean
  onHover: (iso: string) => void
  onLeave: () => void
  onClick: (iso: string) => void
  onDragStart?: (iso: string) => void
  onDragOver?: (iso: string, e: React.DragEvent) => void
  onDrop?: (iso: string) => void
  onDragEnd?: () => void
  dragOver: boolean
}

// Static style maps — referenced by primitives, not re-created per render.
const DAY_TYPE_BG: Record<string, string> = {
  study: 'var(--bg-secondary)',
  holiday: 'rgba(148,163,184,0.22)',
  exam: 'rgba(185,72,56,0.22)',
  weekend: 'rgba(100,116,139,0.28)',
}
const DAY_TYPE_BORDER: Record<string, string> = {
  study: 'var(--border-color)',
  holiday: 'rgba(100,116,139,0.4)',
  exam: 'rgba(185,72,56,0.5)',
  weekend: 'rgba(71,85,105,0.45)',
}

function GridCellImpl({
  hm,
  hd,
  hijriIso,
  gregorianIso,
  dayType,
  activityCount,
  activityColor,
  activityTitle,
  isToday,
  isSelected,
  showGregorian,
  onHover,
  onLeave,
  onClick,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  dragOver,
}: GridCellProps) {
  const bg = dragOver
    ? 'rgba(192,138,72,0.25)'
    : activityColor
      ? `${activityColor}22`
      : dayType
        ? DAY_TYPE_BG[dayType]
        : 'var(--bg-subtle)'
  const border = dragOver
    ? '#C08A48'
    : activityColor
      ? `${activityColor}88`
      : dayType
        ? DAY_TYPE_BORDER[dayType]
        : 'var(--border-soft)'

  // Tiny Gregorian secondary label in the corner (only when toggled on)
  const gregShort = gregorianIso
    ? gregorianIso.slice(8, 10) + '/' + gregorianIso.slice(5, 7)
    : null

  const tooltip =
    `${hd} ${HIJRI_MONTHS_AR[hm - 1]}` +
    (gregorianIso ? ` (${gregorianIso})` : '') +
    (dayType ? ` • ${labelForType(dayType)}` : '') +
    (activityTitle ? ` • ${activityTitle}` : '') +
    (activityCount > 1 ? ` (+${activityCount - 1})` : '')

  return (
    <button
      type="button"
      title={tooltip}
      draggable={activityCount > 0 && !!onDragStart}
      onDragStart={() => onDragStart?.(hijriIso)}
      onDragOver={(e) => {
        if (onDragOver) {
          e.preventDefault()
          onDragOver(hijriIso, e)
        }
      }}
      onDrop={() => onDrop?.(hijriIso)}
      onDragEnd={() => onDragEnd?.()}
      onMouseEnter={() => onHover(hijriIso)}
      onMouseLeave={onLeave}
      onFocus={() => onHover(hijriIso)}
      onBlur={onLeave}
      onClick={() => onClick(hijriIso)}
      className="relative w-full h-full rounded-md transition hover:brightness-110 hover:scale-[1.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C08A48]"
      style={{
        background: bg,
        border: `1.5px solid ${border}`,
        boxShadow: isSelected
          ? '0 0 0 2px #C08A48 inset'
          : isToday
            ? '0 0 0 1.5px rgba(192,138,72,0.75) inset'
            : undefined,
      }}
    >
      {/* Activity color top strip */}
      {activityColor ? (
        <span
          className="absolute left-0 right-0 top-0 h-[4px] rounded-t-md"
          style={{ background: activityColor }}
          aria-hidden
        />
      ) : null}

      {/* Day number (large) */}
      <span
        className="absolute top-[5px] right-[5px] text-[11px] font-mono font-bold leading-none"
        style={{ color: 'var(--text-primary)' }}
      >
        {hd}
      </span>

      {/* Gregorian sub-label (bottom-left) */}
      {showGregorian && gregShort ? (
        <span
          className="absolute bottom-[3px] left-[3px] text-[8px] font-mono leading-none opacity-70"
          style={{ color: 'var(--text-muted)' }}
        >
          {gregShort}
        </span>
      ) : null}

      {/* Activity count badge */}
      {activityCount > 0 ? (
        <span
          className="absolute bottom-[3px] right-[3px] text-[9px] font-bold leading-none px-1 rounded-sm"
          style={{
            background: activityColor ?? '#C08A48',
            color: '#fff',
          }}
        >
          {activityCount}
        </span>
      ) : null}
    </button>
  )
}

function labelForType(t: 'study' | 'holiday' | 'exam' | 'weekend'): string {
  switch (t) {
    case 'study':
      return 'دراسة'
    case 'holiday':
      return 'إجازة'
    case 'exam':
      return 'اختبار'
    case 'weekend':
      return 'نهاية أسبوع'
  }
}

export const GridCell = memo(GridCellImpl)
