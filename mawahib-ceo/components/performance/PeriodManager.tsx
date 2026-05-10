'use client'
/**
 * مدير الفترات — إنشاء/حذف فترات (سنة، فصل، شهر) لكل دفعة.
 */
import { useState } from 'react'
import { Plus, Trash2, Loader2, Copy } from 'lucide-react'
import { toast } from 'sonner'
import type { PerformancePeriod, PeriodType } from '@/lib/performance/types'
import { HIJRI_MONTHS_AR, buildPeriodLabel, PERIOD_TYPE_LABEL } from '@/lib/performance/format'

interface Props {
  batchId: number
  periods: PerformancePeriod[]
  selectedId: string | null
  onSelect: (id: string) => void
  onCreate: (input: {
    period_type: PeriodType
    hijri_year: number
    term_no?: number | null
    hijri_month?: number | null
    label: string
  }) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onClone: (fromId: string, toId: string) => Promise<void>
  canManage?: boolean
}

export default function PeriodManager({
  batchId, periods, selectedId, onSelect, onCreate, onDelete, onClone, canManage,
}: Props) {
  const [showAdd, setShowAdd] = useState(false)
  const [periodType, setPeriodType] = useState<PeriodType>('month')
  const [hijriYear, setHijriYear] = useState(1447)
  const [hijriMonth, setHijriMonth] = useState(1)
  const [termNo, setTermNo] = useState(1)
  const [busy, setBusy] = useState(false)

  const handleCreate = async () => {
    setBusy(true)
    try {
      const label = buildPeriodLabel(
        periodType, hijriYear,
        periodType === 'month' ? hijriMonth : periodType === 'term' ? termNo : null
      )
      await onCreate({
        period_type: periodType,
        hijri_year: hijriYear,
        term_no: periodType === 'term' ? termNo : null,
        hijri_month: periodType === 'month' ? hijriMonth : null,
        label,
      })
      toast.success(`أُضيفت الفترة: ${label}`)
      setShowAdd(false)
    } catch (e: any) {
      toast.error(e?.message?.includes('duplicate') ? 'هذه الفترة موجودة فعلاً' : 'تعذّر إنشاء الفترة')
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (id: string, label: string) => {
    if (!confirm(`حذف الفترة "${label}" + كل بياناتها؟ لا يمكن التراجع.`)) return
    try {
      await onDelete(id)
      toast.success('حُذفت الفترة')
    } catch {
      toast.error('تعذّر الحذف')
    }
  }

  const handleClone = async (fromId: string, fromLabel: string) => {
    if (!selectedId || selectedId === fromId) {
      toast.error('اختر فترة هدف مختلفة أولاً')
      return
    }
    if (!confirm(`نسخ "المفترضات" من "${fromLabel}" إلى الفترة الحالية؟`)) return
    try {
      await onClone(fromId, selectedId)
      toast.success('تم النسخ')
    } catch {
      toast.error('تعذّر النسخ')
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        {periods.map(p => (
          <div
            key={p.id}
            className={`group inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
              selectedId === p.id
                ? 'bg-[var(--accent-warm)] text-white border-[var(--accent-warm)]'
                : 'bg-[var(--bg-card)] border-[var(--border-soft)] text-[var(--text-primary)] hover:bg-[var(--hover-bg)]'
            }`}
            onClick={() => onSelect(p.id)}
          >
            <span>{p.label}</span>
            {canManage && (
              <>
                {selectedId !== p.id && selectedId && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleClone(p.id, p.label) }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-black/10"
                    title="انسخ المفترضات منها للحالية"
                  >
                    <Copy className="w-2.5 h-2.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleDelete(p.id, p.label) }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-rose-200 hover:text-rose-700"
                  title="حذف الفترة"
                >
                  <Trash2 className="w-2.5 h-2.5" />
                </button>
              </>
            )}
          </div>
        ))}
        {canManage && (
          <button
            type="button"
            onClick={() => setShowAdd(s => !s)}
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold border-2 border-dashed transition"
            style={{ borderColor: 'var(--accent-warm)', color: 'var(--accent-warm)' }}
          >
            <Plus className="w-3 h-3" />
            فترة جديدة
          </button>
        )}
      </div>

      {showAdd && canManage && (
        <div className="card-static p-3 flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-[11px] mb-1 font-semibold" style={{ color: 'var(--text-muted)' }}>النوع</label>
            <select
              value={periodType}
              onChange={(e) => setPeriodType(e.target.value as PeriodType)}
              className="px-2 py-1.5 text-xs rounded-lg outline-none"
              style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-soft)', color: 'var(--text-primary)' }}
            >
              <option value="year">{PERIOD_TYPE_LABEL.year}</option>
              <option value="term">{PERIOD_TYPE_LABEL.term}</option>
              <option value="month">{PERIOD_TYPE_LABEL.month}</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] mb-1 font-semibold" style={{ color: 'var(--text-muted)' }}>السنة الهجرية</label>
            <input
              type="number" min={1440} max={1460} value={hijriYear}
              onChange={(e) => setHijriYear(Number(e.target.value))}
              className="w-20 px-2 py-1.5 text-xs rounded-lg outline-none font-mono"
              style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-soft)', color: 'var(--text-primary)' }}
            />
          </div>
          {periodType === 'month' && (
            <div>
              <label className="block text-[11px] mb-1 font-semibold" style={{ color: 'var(--text-muted)' }}>الشهر</label>
              <select
                value={hijriMonth}
                onChange={(e) => setHijriMonth(Number(e.target.value))}
                className="px-2 py-1.5 text-xs rounded-lg outline-none"
                style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-soft)', color: 'var(--text-primary)' }}
              >
                {HIJRI_MONTHS_AR.map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
          )}
          {periodType === 'term' && (
            <div>
              <label className="block text-[11px] mb-1 font-semibold" style={{ color: 'var(--text-muted)' }}>رقم الفصل</label>
              <select
                value={termNo}
                onChange={(e) => setTermNo(Number(e.target.value))}
                className="px-2 py-1.5 text-xs rounded-lg outline-none"
                style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-soft)', color: 'var(--text-primary)' }}
              >
                <option value={1}>الفصل الأول</option>
                <option value={2}>الفصل الثاني</option>
              </select>
            </div>
          )}
          <button
            type="button"
            onClick={handleCreate}
            disabled={busy}
            className="px-3 py-1.5 text-xs rounded-lg font-bold text-white inline-flex items-center gap-1.5"
            style={{ background: 'linear-gradient(135deg, #C08A48, #8B5A1E)' }}
          >
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
            إنشاء
          </button>
          <button
            type="button"
            onClick={() => setShowAdd(false)}
            className="px-3 py-1.5 text-xs rounded-lg border"
            style={{ borderColor: 'var(--border-soft)', color: 'var(--text-muted)' }}
          >
            إلغاء
          </button>
        </div>
      )}
    </div>
  )
}
