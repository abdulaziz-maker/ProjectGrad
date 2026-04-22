'use client'
/**
 * DayEditPopover — modal for editing a single calendar day's type + notes.
 *
 * Kept intentionally minimal: 4 radio buttons for day_type + an optional notes
 * field. Saves via updateDayType(). Parent owns the open/close state.
 */
import { useState, useEffect } from 'react'
import { X, Save } from 'lucide-react'
import { toast } from 'sonner'
import type { TimelineDay, TimelineDayType } from '@/types/timeline'
import { updateDayType } from '@/lib/timeline/db'
import HijriDate from './HijriDate'

const TYPES: { value: TimelineDayType; label: string; color: string }[] = [
  { value: 'study',   label: 'دراسة',        color: '#6366f1' },
  { value: 'holiday', label: 'إجازة',        color: '#22c55e' },
  { value: 'exam',    label: 'اختبار',       color: '#B94838' },
  { value: 'weekend', label: 'نهاية أسبوع',  color: '#94a3b8' },
]

interface Props {
  day: TimelineDay | null
  onClose: () => void
  onSaved: (updated: TimelineDay) => void
  canEdit: boolean
}

export default function DayEditPopover({ day, onClose, onSaved, canEdit }: Props) {
  const [dayType, setDayType] = useState<TimelineDayType>('study')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!day) return
    setDayType(day.day_type as TimelineDayType)
    setNotes(day.notes ?? '')
  }, [day])

  if (!day) return null

  const handleSave = async () => {
    if (!canEdit) return
    setSaving(true)
    try {
      await updateDayType(day.id, dayType, notes)
      onSaved({ ...day, day_type: dayType, notes: notes || null })
      toast.success('تم حفظ تعديل اليوم')
      onClose()
    } catch (err) {
      console.error(err)
      toast.error('حدث خطأ أثناء الحفظ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in-up"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md rounded-2xl p-5 space-y-4"
        style={{
          background: 'var(--bg-card, #fff)',
          border: '1px solid var(--border-soft)',
          boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>
              تعديل اليوم
            </h3>
            <div className="mt-1">
              <HijriDate source={{ hijriIso: day.hijri_date, gregorianIso: day.gregorian_date }} />
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/5"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>

        {/* Day type radios */}
        <div>
          <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
            نوع اليوم
          </label>
          <div className="grid grid-cols-2 gap-2">
            {TYPES.map((t) => {
              const active = dayType === t.value
              return (
                <button
                  key={t.value}
                  type="button"
                  disabled={!canEdit}
                  onClick={() => setDayType(t.value)}
                  className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    background: active ? `${t.color}20` : 'var(--bg-subtle)',
                    border: `1px solid ${active ? t.color : 'var(--border-soft)'}`,
                    color: active ? t.color : 'var(--text-primary)',
                  }}
                >
                  <span className="w-2 h-2 rounded-full" style={{ background: t.color }} />
                  {t.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
            ملاحظات
          </label>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={!canEdit}
            placeholder="اختياري"
            className="w-full px-3 py-2 text-sm rounded-xl outline-none disabled:opacity-50"
            style={{
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border-soft)',
              color: 'var(--text-primary)',
            }}
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs rounded-lg border"
            style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}
          >
            إلغاء
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white rounded-lg disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #356B6E, #244A4C)' }}
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'جاري الحفظ...' : 'حفظ'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
