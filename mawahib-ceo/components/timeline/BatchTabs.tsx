'use client'
/**
 * BatchTabs — pill-style selector for switching between batches.
 *
 * Supervisors/batch_managers/teachers see ONLY their own batch (pre-filtered
 * upstream); they still render as a disabled single pill so the UI stays
 * consistent.
 *
 * CEO + records_officer see all batches with a clickable tab bar.
 */
import { memo } from 'react'
import { Users2 } from 'lucide-react'
import type { TimelineBatchRef } from '@/lib/timeline/db'

interface Props {
  batches: TimelineBatchRef[]
  selectedBatchId: number | null
  onSelect: (id: number) => void
  /** true if user is restricted to a single batch — disables clicking others */
  locked?: boolean
}

function BatchTabsImpl({ batches, selectedBatchId, onSelect, locked }: Props) {
  if (batches.length === 0) {
    return (
      <div
        className="rounded-xl p-4 text-center text-sm"
        style={{
          background: 'var(--bg-subtle)',
          border: '1px solid var(--border-soft)',
          color: 'var(--text-muted)',
        }}
      >
        لا توجد دفعات لعرضها.
      </div>
    )
  }

  return (
    <div
      className="flex flex-wrap items-center gap-2 p-1 rounded-2xl"
      style={{
        background: 'rgba(192,138,72,0.05)',
        border: '1px solid rgba(192,138,72,0.20)',
      }}
      role="tablist"
      aria-label="اختيار الدفعة"
    >
      {batches.map((b) => {
        const active = b.id === selectedBatchId
        const disabled = locked && !active
        return (
          <button
            key={b.id}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={disabled}
            onClick={() => !disabled && onSelect(b.id)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              background: active
                ? 'linear-gradient(135deg, #C08A48, #9A6A2E)'
                : 'transparent',
              color: active ? '#fff' : 'var(--text-primary)',
              boxShadow: active ? '0 2px 10px rgba(192,138,72,0.35)' : 'none',
            }}
          >
            <Users2 className="w-3.5 h-3.5" />
            <span>{b.name}</span>
            {b.student_count != null && (
              <span
                className="font-mono text-[10px] px-1.5 py-0.5 rounded-md"
                style={{
                  background: active ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.06)',
                  color: active ? '#fff' : 'var(--text-muted)',
                }}
              >
                {b.student_count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export default memo(BatchTabsImpl)
