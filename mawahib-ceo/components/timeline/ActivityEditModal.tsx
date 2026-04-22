'use client'
/**
 * ActivityEditModal — create / view / edit a single activity.
 *
 * Modes:
 *   - null activity + defaultStartIso → "Create" mode
 *   - existing activity → "Edit" mode
 *
 * Validation:
 *   - title required
 *   - start_date <= end_date
 *   - both dates must exist in current calendar's days
 *   - warn if exam/weekend day (does not block)
 *
 * Hijri-first: user picks Hijri month + day. Gregorian shown under as readonly.
 */
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  HIJRI_MONTHS_AR,
  hijriIso as hijriToIso,
  hijriToGregorian,
  parseHijriIso,
  formatGregorianShort,
} from '@/lib/timeline/hijri'
import {
  checkActivityPlacement,
  estimateActivityCost,
  formatSAR,
  hijriSpanLength,
} from '@/lib/timeline/activity-helpers'
import { createActivity, updateActivity, deleteActivity } from '@/lib/timeline/db'
import type {
  TimelineActivity,
  TimelineActivityType,
  TimelineActivityStatus,
  TimelineDay,
} from '@/types/timeline'
import {
  X,
  Save,
  Trash2,
  Calendar as CalIcon,
  AlertTriangle,
  Tag,
  Clock,
  DollarSign,
} from 'lucide-react'

const STATUS_LABELS: Record<TimelineActivityStatus, string> = {
  draft: 'مسودة',
  proposed: 'مقترح',
  approved: 'معتمد',
  cancelled: 'ملغى',
}

const STATUS_COLORS: Record<TimelineActivityStatus, string> = {
  draft: '#94a3b8',
  proposed: '#C08A48',
  approved: '#356B6E',
  cancelled: '#8B2F23',
}

interface Props {
  open: boolean
  onClose: () => void
  /** Existing activity for edit; null for create. */
  activity: TimelineActivity | null
  /** Called with the updated/new record after save (for parent state). */
  onSaved: (a: TimelineActivity) => void
  /** Called after delete (edit mode only). */
  onDeleted?: (id: string) => void
  activityTypes: TimelineActivityType[]
  daysMap: Map<string, TimelineDay>
  hijriYear: number
  batchId: number
  calendarId: string
  studentCount: number
  defaultStartIso?: string | null
  canEdit: boolean
  userId: string | null
}

export default function ActivityEditModal({
  open,
  onClose,
  activity,
  onSaved,
  onDeleted,
  activityTypes,
  daysMap,
  hijriYear,
  batchId,
  calendarId,
  studentCount,
  defaultStartIso,
  canEdit,
  userId,
}: Props) {
  const isCreate = !activity

  // ── Form fields
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [typeId, setTypeId] = useState<string | null>(null)
  const [status, setStatus] = useState<TimelineActivityStatus>('draft')
  const [startIso, setStartIso] = useState('')
  const [endIso, setEndIso] = useState('')
  const [customColor, setCustomColor] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // ── Reset form when dialog opens
  useEffect(() => {
    if (!open) return
    if (activity) {
      setTitle(activity.title ?? '')
      setDescription(activity.description ?? '')
      setTypeId(activity.activity_type_id)
      setStatus(activity.status)
      setStartIso(activity.start_date)
      setEndIso(activity.end_date)
      setCustomColor(activity.custom_color)
      setNotes(activity.notes ?? '')
    } else {
      setTitle('')
      setDescription('')
      setTypeId(activityTypes[0]?.id ?? null)
      setStatus('draft')
      setStartIso(defaultStartIso ?? '')
      setEndIso(defaultStartIso ?? '')
      setCustomColor(null)
      setNotes('')
    }
  }, [open, activity, defaultStartIso, activityTypes])

  // ── Derived: validation + cost + warnings
  const selectedType = useMemo(
    () => activityTypes.find((t) => t.id === typeId) ?? null,
    [activityTypes, typeId],
  )

  const startDay = daysMap.get(startIso) ?? null
  const endDay = daysMap.get(endIso) ?? null

  const span = useMemo(
    () => (startIso && endIso ? hijriSpanLength(startIso, endIso, hijriYear) : null),
    [startIso, endIso, hijriYear],
  )

  const cost = useMemo(() => {
    if (!startIso || !endIso || !selectedType) return null
    return estimateActivityCost(
      { activity_type_id: typeId, start_date: startIso, end_date: endIso },
      selectedType,
      studentCount,
      hijriYear,
    )
  }, [startIso, endIso, typeId, selectedType, studentCount, hijriYear])

  const warnings = useMemo(() => {
    const out: string[] = []
    if (!title.trim()) out.push('العنوان مطلوب')
    if (!typeId) out.push('نوع النشاط مطلوب')
    if (!startIso) out.push('تاريخ البداية مطلوب')
    if (!endIso) out.push('تاريخ النهاية مطلوب')
    if (startIso && endIso && startIso > endIso) out.push('تاريخ البداية بعد النهاية')
    if (startIso && !startDay) out.push(`اليوم ${startIso} غير موجود في التقويم`)
    if (endIso && !endDay) out.push(`اليوم ${endIso} غير موجود في التقويم`)
    // Placement warnings for start day
    const pc = checkActivityPlacement(startDay, selectedType)
    out.push(...pc.warnings)
    return out
  }, [title, typeId, startIso, endIso, startDay, endDay, selectedType])

  const canSave =
    canEdit &&
    title.trim() &&
    typeId &&
    startIso &&
    endIso &&
    startIso <= endIso &&
    startDay &&
    endDay &&
    !saving

  // ── Save handler
  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      if (isCreate) {
        const created = await createActivity({
          batch_id: batchId,
          calendar_id: calendarId,
          activity_type_id: typeId,
          title: title.trim(),
          description: description.trim() || null,
          start_date: startIso,
          end_date: endIso,
          custom_color: customColor,
          status,
          proposed_by: userId,
          notes: notes.trim() || null,
        })
        toast.success('تم إنشاء النشاط')
        onSaved(created)
      } else {
        const updated = await updateActivity(activity!.id, {
          activity_type_id: typeId,
          title: title.trim(),
          description: description.trim() || null,
          start_date: startIso,
          end_date: endIso,
          custom_color: customColor,
          status,
          notes: notes.trim() || null,
        })
        toast.success('تم حفظ التعديلات')
        onSaved(updated)
      }
      onClose()
    } catch (err) {
      console.error(err)
      toast.error('تعذّر حفظ النشاط')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!activity) return
    if (!confirm('هل تريد حذف هذا النشاط؟ لا يمكن التراجع.')) return
    setDeleting(true)
    try {
      await deleteActivity(activity.id)
      toast.success('تم حذف النشاط')
      onDeleted?.(activity.id)
      onClose()
    } catch (err) {
      console.error(err)
      toast.error('تعذّر الحذف')
    } finally {
      setDeleting(false)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl p-5 space-y-4 animate-fade-in-up"
        style={{
          background: 'var(--bg-primary)',
          border: '1px solid var(--border-color)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CalIcon className="w-5 h-5" style={{ color: '#C08A48' }} />
            <h2
              className="text-lg font-bold"
              style={{ color: 'var(--text-primary)' }}
            >
              {isCreate ? 'إضافة نشاط جديد' : 'تعديل النشاط'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 transition"
            aria-label="إغلاق"
          >
            <X className="w-5 h-5" style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>

        {/* Title */}
        <div className="space-y-1.5">
          <label
            className="text-xs font-semibold"
            style={{ color: 'var(--text-secondary)' }}
          >
            عنوان النشاط *
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={!canEdit}
            placeholder="مثال: يوم همة - الفصل الأول"
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
            }}
          />
        </div>

        {/* Type + Status */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label
              className="text-xs font-semibold inline-flex items-center gap-1"
              style={{ color: 'var(--text-secondary)' }}
            >
              <Tag className="w-3 h-3" /> نوع النشاط *
            </label>
            <select
              value={typeId ?? ''}
              onChange={(e) => setTypeId(e.target.value || null)}
              disabled={!canEdit}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{
                background: 'var(--bg-subtle)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
              }}
            >
              <option value="">-- اختر --</option>
              {activityTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.arabic_name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label
              className="text-xs font-semibold"
              style={{ color: 'var(--text-secondary)' }}
            >
              الحالة
            </label>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(STATUS_LABELS) as TimelineActivityStatus[]).map(
                (s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => canEdit && setStatus(s)}
                    disabled={!canEdit}
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold transition"
                    style={
                      status === s
                        ? {
                            background: STATUS_COLORS[s],
                            color: 'white',
                            border: `1px solid ${STATUS_COLORS[s]}`,
                          }
                        : {
                            background: 'transparent',
                            color: STATUS_COLORS[s],
                            border: `1px solid ${STATUS_COLORS[s]}55`,
                          }
                    }
                  >
                    {STATUS_LABELS[s]}
                  </button>
                ),
              )}
            </div>
          </div>
        </div>

        {/* Dates — Hijri pickers */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <HijriPicker
            label="تاريخ البداية *"
            value={startIso}
            onChange={(iso) => setStartIso(iso)}
            hijriYear={hijriYear}
            disabled={!canEdit}
          />
          <HijriPicker
            label="تاريخ النهاية *"
            value={endIso}
            onChange={(iso) => setEndIso(iso)}
            hijriYear={hijriYear}
            disabled={!canEdit}
          />
        </div>

        {/* Custom color (optional) */}
        <div className="space-y-1.5">
          <label
            className="text-xs font-semibold"
            style={{ color: 'var(--text-secondary)' }}
          >
            لون مخصَّص (اختياري — يتجاوز لون النوع)
          </label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={customColor ?? selectedType?.default_color ?? '#C08A48'}
              onChange={(e) => setCustomColor(e.target.value)}
              disabled={!canEdit}
              className="w-12 h-9 rounded-md cursor-pointer"
              style={{
                background: 'transparent',
                border: '1px solid var(--border-color)',
              }}
            />
            {customColor ? (
              <button
                type="button"
                onClick={() => setCustomColor(null)}
                disabled={!canEdit}
                className="text-xs font-semibold hover:underline"
                style={{ color: '#C08A48' }}
              >
                إعادة ضبط
              </button>
            ) : (
              <span
                className="text-xs"
                style={{ color: 'var(--text-muted)' }}
              >
                اللون الافتراضي من النوع
              </span>
            )}
          </div>
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <label
            className="text-xs font-semibold"
            style={{ color: 'var(--text-secondary)' }}
          >
            الوصف
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={!canEdit}
            rows={2}
            placeholder="وصف موجز للنشاط..."
            className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-y"
            style={{
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
            }}
          />
        </div>

        {/* Notes */}
        <div className="space-y-1.5">
          <label
            className="text-xs font-semibold"
            style={{ color: 'var(--text-secondary)' }}
          >
            ملاحظات داخلية
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={!canEdit}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
            }}
          />
        </div>

        {/* Summary chips */}
        <div className="flex flex-wrap gap-2 text-xs">
          {span !== null ? (
            <span
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-semibold"
              style={{
                background: 'rgba(53,107,110,0.12)',
                color: '#235052',
                border: '1px solid rgba(53,107,110,0.3)',
              }}
            >
              <Clock className="w-3 h-3" />
              المدة: {span} يوم
            </span>
          ) : null}
          {cost && cost.total > 0 ? (
            <span
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-semibold"
              style={{
                background: 'rgba(192,138,72,0.12)',
                color: '#7A4E1E',
                border: '1px solid rgba(192,138,72,0.35)',
              }}
            >
              <DollarSign className="w-3 h-3" />
              التكلفة المقدَّرة: {formatSAR(cost.total)}
            </span>
          ) : null}
          {cost?.model === 'detailed' ? (
            <span
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg"
              style={{ color: 'var(--text-muted)' }}
            >
              التكلفة: تُدخل يدويًا لاحقاً
            </span>
          ) : null}
        </div>

        {/* Warnings */}
        {warnings.length > 0 ? (
          <div
            className="rounded-xl p-3 text-xs space-y-1"
            style={{
              background: 'rgba(192,138,72,0.08)',
              border: '1px solid rgba(192,138,72,0.35)',
              color: '#7A4E1E',
            }}
          >
            <div className="flex items-center gap-1 font-bold">
              <AlertTriangle className="w-3.5 h-3.5" />
              ملاحظات
            </div>
            <ul className="list-disc pr-4 space-y-0.5">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Actions */}
        <div className="flex items-center justify-between gap-2 flex-wrap pt-2">
          {!isCreate && canEdit ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting || saving}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition disabled:opacity-50"
              style={{
                background: 'rgba(185,72,56,0.08)',
                color: '#8B2F23',
                border: '1px solid rgba(185,72,56,0.3)',
              }}
            >
              <Trash2 className="w-3.5 h-3.5" />
              حذف النشاط
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-semibold border transition"
              style={{
                borderColor: 'var(--border-color)',
                color: 'var(--text-secondary)',
                background: 'transparent',
              }}
            >
              إلغاء
            </button>
            {canEdit ? (
              <button
                type="button"
                onClick={handleSave}
                disabled={!canSave || saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-50 transition active:scale-95"
                style={{
                  background:
                    'linear-gradient(135deg, #C08A48, #9A6A2E)',
                  boxShadow: '0 2px 10px rgba(192,138,72,0.35)',
                }}
              >
                <Save className="w-4 h-4" />
                {saving ? '...' : isCreate ? 'إنشاء' : 'حفظ'}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Hijri picker (small inline component) ─────────────────────────────
function HijriPicker({
  label,
  value,
  onChange,
  hijriYear,
  disabled,
}: {
  label: string
  value: string
  onChange: (iso: string) => void
  hijriYear: number
  disabled?: boolean
}) {
  const parsed = value ? parseHijriIso(value) : null
  const hm = parsed?.hm ?? 1
  const hd = parsed?.hd ?? 1

  const setMonth = (m: number) => {
    onChange(hijriToIso({ hy: hijriYear, hm: m, hd }))
  }
  const setDay = (d: number) => {
    onChange(hijriToIso({ hy: hijriYear, hm, hd: d }))
  }

  const greg = parsed ? hijriToGregorian(parsed) : null

  return (
    <div className="space-y-1.5">
      <label
        className="text-xs font-semibold"
        style={{ color: 'var(--text-secondary)' }}
      >
        {label}
      </label>
      <div className="flex items-center gap-2">
        <select
          value={hm}
          onChange={(e) => setMonth(Number(e.target.value))}
          disabled={disabled}
          className="flex-1 px-2 py-2 rounded-lg text-xs outline-none"
          style={{
            background: 'var(--bg-subtle)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-primary)',
          }}
        >
          {HIJRI_MONTHS_AR.map((name, i) => (
            <option key={i} value={i + 1}>
              {i + 1} — {name}
            </option>
          ))}
        </select>
        <select
          value={hd}
          onChange={(e) => setDay(Number(e.target.value))}
          disabled={disabled}
          className="w-20 px-2 py-2 rounded-lg text-xs outline-none"
          style={{
            background: 'var(--bg-subtle)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-primary)',
          }}
        >
          {Array.from({ length: 30 }, (_, i) => (
            <option key={i} value={i + 1}>
              {i + 1}
            </option>
          ))}
        </select>
      </div>
      <div
        className="text-[10px] font-mono"
        style={{ color: 'var(--text-muted)' }}
      >
        {greg ? `الميلادي: ${formatGregorianShort(greg)}` : '—'}
      </div>
    </div>
  )
}
