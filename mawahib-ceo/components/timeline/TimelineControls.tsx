'use client'
/**
 * TimelineControls — zoom, view-mode, month focus, Gregorian toggle, filters.
 *
 * All state is controlled from parent. This component is purely presentational.
 */
import { memo } from 'react'
import {
  ZoomIn,
  ZoomOut,
  Calendar,
  Filter as FilterIcon,
  Eye,
  EyeOff,
  ChevronLeft,
  ChevronRight,
  Download,
  Printer,
} from 'lucide-react'
import { HIJRI_MONTHS_AR } from '@/lib/timeline/hijri'
import type {
  TimelineActivityStatus,
  TimelineActivityType,
} from '@/types/timeline'
import type { TimelineViewMode } from '@/lib/timeline/activity-helpers'

export const ZOOM_LEVELS = [80, 100, 120, 150] as const
export type ZoomLevel = (typeof ZOOM_LEVELS)[number]

export interface TimelineControlsProps {
  zoom: ZoomLevel
  setZoom: (z: ZoomLevel) => void
  view: TimelineViewMode
  setView: (v: TimelineViewMode) => void
  focusMonth: number
  setFocusMonth: (m: number) => void
  showGregorian: boolean
  setShowGregorian: (b: boolean) => void
  // Filters
  allTypes: TimelineActivityType[]
  selectedTypeIds: string[]
  setSelectedTypeIds: (ids: string[]) => void
  selectedStatuses: TimelineActivityStatus[]
  setSelectedStatuses: (s: TimelineActivityStatus[]) => void
  // Export
  onPrint?: () => void
  onExportPdf?: () => void
}

const STATUS_META: Record<
  TimelineActivityStatus,
  { label: string; color: string }
> = {
  draft: { label: 'مسودة', color: '#94a3b8' },
  proposed: { label: 'مقترح', color: '#C08A48' },
  approved: { label: 'معتمد', color: '#356B6E' },
  cancelled: { label: 'ملغى', color: '#8B2F23' },
}

function TimelineControlsImpl(props: TimelineControlsProps) {
  const {
    zoom,
    setZoom,
    view,
    setView,
    focusMonth,
    setFocusMonth,
    showGregorian,
    setShowGregorian,
    allTypes,
    selectedTypeIds,
    setSelectedTypeIds,
    selectedStatuses,
    setSelectedStatuses,
    onPrint,
    onExportPdf,
  } = props

  const toggleType = (id: string) => {
    if (selectedTypeIds.includes(id)) {
      setSelectedTypeIds(selectedTypeIds.filter((x) => x !== id))
    } else {
      setSelectedTypeIds([...selectedTypeIds, id])
    }
  }

  const toggleStatus = (s: TimelineActivityStatus) => {
    if (selectedStatuses.includes(s)) {
      setSelectedStatuses(selectedStatuses.filter((x) => x !== s))
    } else {
      setSelectedStatuses([...selectedStatuses, s])
    }
  }

  return (
    <div className="space-y-3">
      {/* Top row: zoom + view + gregorian + export */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        {/* Zoom */}
        <div className="inline-flex items-center rounded-lg overflow-hidden border"
          style={{ borderColor: 'var(--border-color)' }}
        >
          <button
            type="button"
            onClick={() => {
              const idx = ZOOM_LEVELS.indexOf(zoom)
              if (idx > 0) setZoom(ZOOM_LEVELS[idx - 1])
            }}
            disabled={zoom === ZOOM_LEVELS[0]}
            className="px-2 py-1.5 transition hover:bg-white/5 disabled:opacity-40"
            aria-label="تصغير"
            title="تصغير"
          >
            <ZoomOut className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
          </button>
          <span
            className="px-2 py-1.5 text-xs font-mono font-bold border-x"
            style={{
              borderColor: 'var(--border-color)',
              color: 'var(--text-primary)',
              minWidth: 52,
              textAlign: 'center',
            }}
          >
            {zoom}%
          </span>
          <button
            type="button"
            onClick={() => {
              const idx = ZOOM_LEVELS.indexOf(zoom)
              if (idx < ZOOM_LEVELS.length - 1) setZoom(ZOOM_LEVELS[idx + 1])
            }}
            disabled={zoom === ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
            className="px-2 py-1.5 transition hover:bg-white/5 disabled:opacity-40"
            aria-label="تكبير"
            title="تكبير"
          >
            <ZoomIn className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
          </button>
        </div>

        {/* View mode */}
        <div
          className="inline-flex items-center rounded-lg overflow-hidden border"
          style={{ borderColor: 'var(--border-color)' }}
        >
          {(['year', 'quarter', 'month'] as TimelineViewMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setView(m)}
              className="px-3 py-1.5 text-xs font-semibold transition"
              style={
                view === m
                  ? {
                      background: '#C08A48',
                      color: 'white',
                    }
                  : {
                      background: 'transparent',
                      color: 'var(--text-secondary)',
                    }
              }
            >
              {m === 'year' ? 'سنوي' : m === 'quarter' ? 'فصلي' : 'شهري'}
            </button>
          ))}
        </div>

        {/* Month focus (only when not year view) */}
        {view !== 'year' ? (
          <div className="inline-flex items-center gap-1">
            <button
              type="button"
              onClick={() =>
                setFocusMonth(focusMonth > 1 ? focusMonth - 1 : 12)
              }
              className="p-1.5 rounded-md hover:bg-white/5 transition"
              aria-label="الشهر السابق"
            >
              <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
            </button>
            <select
              value={focusMonth}
              onChange={(e) => setFocusMonth(Number(e.target.value))}
              className="px-2 py-1 rounded-md text-xs font-semibold outline-none"
              style={{
                background: 'var(--bg-subtle)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
                minWidth: 110,
              }}
            >
              {HIJRI_MONTHS_AR.map((name, i) => (
                <option key={i} value={i + 1}>
                  {i + 1} — {name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() =>
                setFocusMonth(focusMonth < 12 ? focusMonth + 1 : 1)
              }
              className="p-1.5 rounded-md hover:bg-white/5 transition"
              aria-label="الشهر التالي"
            >
              <ChevronLeft className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
            </button>
          </div>
        ) : null}

        {/* Gregorian toggle */}
        <button
          type="button"
          onClick={() => setShowGregorian(!showGregorian)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition hover:bg-white/5"
          style={{
            borderColor: showGregorian ? '#356B6E' : 'var(--border-color)',
            color: showGregorian ? '#235052' : 'var(--text-secondary)',
            background: showGregorian ? 'rgba(53,107,110,0.08)' : 'transparent',
          }}
          title={showGregorian ? 'إخفاء الميلادي' : 'إظهار الميلادي'}
        >
          {showGregorian ? (
            <Eye className="w-3.5 h-3.5" />
          ) : (
            <EyeOff className="w-3.5 h-3.5" />
          )}
          الميلادي
        </button>

        {/* Export */}
        <div className="inline-flex items-center gap-1">
          {onPrint ? (
            <button
              type="button"
              onClick={onPrint}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border transition hover:bg-white/5"
              style={{
                borderColor: 'var(--border-color)',
                color: 'var(--text-secondary)',
              }}
              title="طباعة"
            >
              <Printer className="w-3.5 h-3.5" />
              طباعة
            </button>
          ) : null}
          {onExportPdf ? (
            <button
              type="button"
              onClick={onExportPdf}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border transition hover:bg-white/5"
              style={{
                borderColor: 'var(--border-color)',
                color: 'var(--text-secondary)',
              }}
              title="تصدير PDF"
            >
              <Download className="w-3.5 h-3.5" />
              PDF
            </button>
          ) : null}
        </div>
      </div>

      {/* Filters row */}
      <div
        className="rounded-xl p-3 space-y-2"
        style={{
          background: 'rgba(192,138,72,0.04)',
          border: '1px solid rgba(192,138,72,0.15)',
        }}
      >
        {/* Types */}
        <div className="flex items-start gap-2 flex-wrap">
          <span
            className="text-[11px] font-semibold inline-flex items-center gap-1 pt-1.5"
            style={{ color: 'var(--text-muted)' }}
          >
            <FilterIcon className="w-3 h-3" />
            النوع:
          </span>
          <button
            type="button"
            onClick={() => setSelectedTypeIds([])}
            className="text-[11px] font-bold px-2 py-1 rounded-md transition"
            style={{
              background:
                selectedTypeIds.length === 0
                  ? '#C08A48'
                  : 'rgba(192,138,72,0.12)',
              color: selectedTypeIds.length === 0 ? 'white' : '#7A4E1E',
              border: `1px solid ${selectedTypeIds.length === 0 ? '#C08A48' : 'rgba(192,138,72,0.35)'}`,
            }}
          >
            الكل
          </button>
          {allTypes.map((t) => {
            const active = selectedTypeIds.includes(t.id)
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => toggleType(t.id)}
                className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-md transition"
                style={{
                  background: active ? `${t.default_color}22` : 'transparent',
                  color: active ? t.default_color : 'var(--text-secondary)',
                  border: `1px solid ${active ? t.default_color + '77' : 'var(--border-color)'}`,
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: t.default_color }}
                />
                {t.arabic_name}
              </button>
            )
          })}
        </div>

        {/* Statuses */}
        <div className="flex items-start gap-2 flex-wrap">
          <span
            className="text-[11px] font-semibold pt-1.5"
            style={{ color: 'var(--text-muted)' }}
          >
            الحالة:
          </span>
          <button
            type="button"
            onClick={() => setSelectedStatuses([])}
            className="text-[11px] font-bold px-2 py-1 rounded-md transition"
            style={{
              background:
                selectedStatuses.length === 0
                  ? '#356B6E'
                  : 'rgba(53,107,110,0.08)',
              color: selectedStatuses.length === 0 ? 'white' : '#235052',
              border: `1px solid ${selectedStatuses.length === 0 ? '#356B6E' : 'rgba(53,107,110,0.3)'}`,
            }}
          >
            الكل
          </button>
          {(Object.keys(STATUS_META) as TimelineActivityStatus[]).map((s) => {
            const active = selectedStatuses.includes(s)
            const meta = STATUS_META[s]
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggleStatus(s)}
                className="text-[11px] font-semibold px-2 py-1 rounded-md transition"
                style={{
                  background: active ? `${meta.color}22` : 'transparent',
                  color: active ? meta.color : 'var(--text-secondary)',
                  border: `1px solid ${active ? meta.color + '77' : 'var(--border-color)'}`,
                }}
              >
                {meta.label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default memo(TimelineControlsImpl)
