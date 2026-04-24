'use client'
/**
 * TimelineGrid — the heart of Phase 3.
 *
 * Layout: 12 Hijri months (rows) × 30 days (columns).
 * Performance notes:
 *   - Day & activity lookups via Map (O(1)) — required at 360 cells.
 *   - Cells memoized via GridCell on primitive props.
 *   - Zoom applied via CSS `zoom`/`scale` on a wrapper, not per-cell.
 *   - Hover popover is a single element rendered outside the loop.
 *
 * Governance:
 *   - Never modifies Sidebar / Header / AuthContext.
 *   - Uses RLS-backed DB helpers only (lib/timeline/db.ts).
 *   - Hijri-first: Gregorian is opt-in toggle.
 */
import {
  memo,
  useCallback,
  useMemo,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
} from 'react'
import {
  HIJRI_MONTHS_AR,
  hijriIso as hijriToIso,
  hijriToGregorian,
  parseHijriIso,
  formatGregorianShort,
  type HijriYMD,
} from '@/lib/timeline/hijri'
import {
  buildActivityMap,
  buildDayMap,
  dayActivityColor,
  hijriSpanLength,
  shiftHijriIso,
  monthsForView,
  type TimelineViewMode,
} from '@/lib/timeline/activity-helpers'
import type {
  TimelineActivity,
  TimelineActivityType,
  TimelineDay,
} from '@/types/timeline'
import { GridCell } from './GridCell'

export interface TimelineGridProps {
  hijriYear: number
  days: TimelineDay[]
  activities: TimelineActivity[]
  activityTypes: TimelineActivityType[]
  /** CSS zoom level in % (80/100/120/150) */
  zoom: number
  /** 'year' | 'quarter' | 'month' */
  view: TimelineViewMode
  /** Focus month used for 'quarter' + 'month' views (1..12). */
  focusMonth: number
  /** Show Gregorian corner labels? */
  showGregorian: boolean
  /** Can edit? Drag-and-drop + click-to-add gated by this. */
  canEdit: boolean
  /** Called when user clicks a day (no activity or activity cell). */
  onDayClick: (iso: string) => void
  /** Called when user requests edit on a specific activity. */
  onActivityEdit: (activity: TimelineActivity) => void
  /** Called after an activity's dates changed via drag-drop. */
  onActivityMove: (id: string, newStartIso: string, newEndIso: string) => void
}

function TimelineGridImpl({
  hijriYear,
  days,
  activities,
  activityTypes,
  zoom,
  view,
  focusMonth,
  showGregorian,
  canEdit,
  onDayClick,
  onActivityEdit,
  onActivityMove,
}: TimelineGridProps) {
  // ── Memoized indexes: Map<iso, T> — O(1) lookups per cell
  const dayMap = useMemo(() => buildDayMap(days), [days])
  const activityMap = useMemo(
    () => buildActivityMap(activities, hijriYear),
    [activities, hijriYear],
  )
  const typeMap = useMemo(
    () => new Map(activityTypes.map((t) => [t.id, t])),
    [activityTypes],
  )

  // ── State that shouldn't cause re-renders of every cell
  const [hoverIso, setHoverIso] = useState<string | null>(null)
  const [selectedIso, setSelectedIso] = useState<string | null>(null)
  const [dragSource, setDragSource] = useState<string | null>(null)
  const [dragOverIso, setDragOverIso] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const popoverRef = useRef<HTMLDivElement | null>(null)

  // ── Displayed months depend on view mode
  const displayMonths = useMemo(
    () => monthsForView(view, focusMonth),
    [view, focusMonth],
  )

  // ── Stable callbacks — passed to every GridCell via props
  const handleHover = useCallback((iso: string) => {
    // Defer hover state so rapid mouse motion doesn't tank the grid.
    startTransition(() => setHoverIso(iso))
  }, [])

  const handleLeave = useCallback(() => {
    startTransition(() => setHoverIso(null))
  }, [])

  const handleClick = useCallback(
    (iso: string) => {
      setSelectedIso(iso)
      // If this day has activities, open the first activity's edit modal;
      // otherwise trigger "add activity on this day" flow via onDayClick.
      const acts = activityMap.get(iso)
      if (acts && acts.length > 0) {
        onActivityEdit(acts[0])
      } else {
        onDayClick(iso)
      }
    },
    [activityMap, onActivityEdit, onDayClick],
  )

  const handleDragStart = useCallback(
    (iso: string) => {
      if (!canEdit) return
      setDragSource(iso)
    },
    [canEdit],
  )

  const handleDragOver = useCallback(
    (iso: string) => {
      if (!canEdit || !dragSource) return
      setDragOverIso(iso)
    },
    [canEdit, dragSource],
  )

  const handleDrop = useCallback(
    (targetIso: string) => {
      if (!canEdit || !dragSource) return
      if (targetIso === dragSource) {
        setDragSource(null)
        setDragOverIso(null)
        return
      }
      // Find the activity owning the source day. When >1 activities on source,
      // we move the first one (simplest UX) — future: picker.
      const acts = activityMap.get(dragSource)
      if (!acts || acts.length === 0) {
        setDragSource(null)
        setDragOverIso(null)
        return
      }
      const activity = acts[0]
      const span = hijriSpanLength(
        activity.start_date,
        activity.end_date,
        hijriYear,
      )
      if (!span) return
      // Anchor move on dragSource: compute delta from activity.start_date → dragSource
      const originalYearArr = enumerateYearArr(hijriYear)
      const srcIdx = originalYearArr.indexOf(dragSource)
      const actStartIdx = originalYearArr.indexOf(activity.start_date)
      const targetIdx = originalYearArr.indexOf(targetIso)
      if (srcIdx < 0 || actStartIdx < 0 || targetIdx < 0) return

      const offsetInActivity = srcIdx - actStartIdx
      const newStartIdx = targetIdx - offsetInActivity
      const newEndIdx = newStartIdx + (span - 1)
      if (newStartIdx < 0 || newEndIdx >= originalYearArr.length) return

      const newStart = originalYearArr[newStartIdx]
      const newEnd = originalYearArr[newEndIdx]
      onActivityMove(activity.id, newStart, newEnd)
      setDragSource(null)
      setDragOverIso(null)
    },
    [activityMap, canEdit, dragSource, hijriYear, onActivityMove],
  )

  const handleDragEnd = useCallback(() => {
    setDragSource(null)
    setDragOverIso(null)
  }, [])

  // ── Hover popover content
  const hoverContent = useMemo(() => {
    if (!hoverIso) return null
    const h = parseHijriIso(hoverIso)
    if (!h) return null
    const day = dayMap.get(hoverIso)
    const acts = activityMap.get(hoverIso) ?? []
    return {
      iso: hoverIso,
      hijri: h,
      greg: hijriToGregorian(h),
      day,
      activities: acts,
    }
  }, [hoverIso, dayMap, activityMap])

  // ── Cell size based on zoom
  const cellPx = Math.round((40 * zoom) / 100)
  const cellStyle: CSSProperties = {
    width: cellPx,
    height: cellPx,
  }
  const monthLabelWidth = Math.max(100, Math.round((110 * zoom) / 100))

  return (
    <div className="relative">
      {/* Scrollable table wrapper */}
      <div
        className="rounded-2xl p-3 overflow-x-auto"
        style={{
          background: 'var(--bg-subtle)',
          border: '1px solid var(--border-soft)',
        }}
      >
        <table
          className="border-separate"
          style={{
            borderSpacing: Math.round((4 * zoom) / 100) + 'px',
            direction: 'rtl',
          }}
        >
          <thead>
            <tr>
              <th
                className="text-xs font-semibold text-right pr-2 sticky right-0 z-10"
                style={{
                  color: 'var(--text-muted)',
                  minWidth: monthLabelWidth,
                  background: 'var(--bg-subtle)',
                }}
              >
                الشهر الهجري
              </th>
              {Array.from({ length: 30 }, (_, i) => (
                <th
                  key={i}
                  className="text-[10px] font-mono text-center"
                  style={{
                    color: 'var(--text-muted)',
                    minWidth: cellPx,
                  }}
                >
                  {i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayMonths.map((hm) => (
              <tr key={hm}>
                <td
                  className="text-xs font-bold pr-2 text-right sticky right-0 z-10"
                  style={{
                    color: 'var(--text-primary)',
                    background: 'var(--bg-subtle)',
                  }}
                >
                  <div className="flex flex-col items-end leading-tight">
                    <span>{HIJRI_MONTHS_AR[hm - 1]}</span>
                    <span
                      className="text-[10px] font-mono"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      الشهر {hm}
                    </span>
                  </div>
                </td>
                {Array.from({ length: 30 }, (_, dIdx) => {
                  const hd = dIdx + 1
                  const iso = hijriToIso({ hy: hijriYear, hm, hd })
                  const day = dayMap.get(iso)
                  const acts = activityMap.get(iso)
                  const color = dayActivityColor(acts, typeMap)
                  const firstAct = acts?.[0] ?? null
                  const actType = firstAct?.activity_type_id
                    ? typeMap.get(firstAct.activity_type_id) ?? null
                    : null
                  return (
                    <td key={hd} className="p-0 align-middle" style={cellStyle}>
                      <GridCell
                        hm={hm}
                        hd={hd}
                        hijriIso={iso}
                        gregorianIso={day?.gregorian_date ?? null}
                        dayType={day?.day_type ?? null}
                        activityCount={acts?.length ?? 0}
                        activityColor={color}
                        activityTitle={firstAct?.title ?? null}
                        activityIcon={actType?.icon ?? null}
                        isToday={false}
                        isSelected={selectedIso === iso}
                        showGregorian={showGregorian}
                        onHover={handleHover}
                        onLeave={handleLeave}
                        onClick={handleClick}
                        onDragStart={canEdit ? handleDragStart : undefined}
                        onDragOver={canEdit ? handleDragOver : undefined}
                        onDrop={canEdit ? handleDrop : undefined}
                        onDragEnd={canEdit ? handleDragEnd : undefined}
                        dragOver={dragOverIso === iso}
                      />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Floating hover popover — positioned relative to container */}
      {hoverContent ? (
        <div
          ref={popoverRef}
          className="pointer-events-none absolute top-2 left-2 z-20 rounded-xl p-3 shadow-lg max-w-[280px] animate-fade-in-up"
          style={{
            background: 'var(--bg-elevated, white)',
            border: '1px solid var(--border-color)',
            boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
          }}
        >
          <div
            className="text-sm font-bold"
            style={{ color: 'var(--text-primary)' }}
          >
            {hoverContent.hijri.hd} {HIJRI_MONTHS_AR[hoverContent.hijri.hm - 1]}{' '}
            {hoverContent.hijri.hy}هـ
          </div>
          <div
            className="text-[10px] font-mono"
            style={{ color: 'var(--text-muted)' }}
          >
            {formatGregorianShort(hoverContent.greg)} م
          </div>
          {hoverContent.day ? (
            <div className="mt-1 text-[11px]">
              <span
                className="inline-block px-2 py-0.5 rounded-md font-semibold"
                style={{
                  background: 'rgba(192,138,72,0.12)',
                  color: '#7A4E1E',
                  border: '1px solid rgba(192,138,72,0.35)',
                }}
              >
                {labelForType(hoverContent.day.day_type)}
              </span>
            </div>
          ) : (
            <div
              className="mt-1 text-[11px]"
              style={{ color: 'var(--text-muted)' }}
            >
              لا توجد بيانات يوم
            </div>
          )}
          {hoverContent.activities.length > 0 ? (
            <div className="mt-2 space-y-1">
              <div
                className="text-[10px] font-semibold"
                style={{ color: 'var(--text-muted)' }}
              >
                الأنشطة المخططة:
              </div>
              {hoverContent.activities.slice(0, 3).map((a) => {
                const t = a.activity_type_id
                  ? typeMap.get(a.activity_type_id)
                  : null
                return (
                  <div
                    key={a.id}
                    className="flex items-center gap-1.5 text-[11px]"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{
                        background:
                          a.custom_color ?? t?.default_color ?? '#C08A48',
                      }}
                    />
                    <span className="font-semibold truncate">{a.title}</span>
                  </div>
                )
              })}
              {hoverContent.activities.length > 3 ? (
                <div
                  className="text-[10px]"
                  style={{ color: 'var(--text-muted)' }}
                >
                  …و{hoverContent.activities.length - 3} آخر
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

// ── Small helper — cached per year to avoid rebuilding inside drag handlers
const yearArrCache = new Map<number, string[]>()
function enumerateYearArr(hy: number): string[] {
  const cached = yearArrCache.get(hy)
  if (cached) return cached
  // Lazy import to avoid cycle with hijri.ts at module load
  const { enumerateHijriYear } = require('@/lib/timeline/hijri') as typeof import('@/lib/timeline/hijri')
  const arr = enumerateHijriYear(hy).map((h: HijriYMD) => hijriToIso(h))
  yearArrCache.set(hy, arr)
  return arr
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

export default memo(TimelineGridImpl)
