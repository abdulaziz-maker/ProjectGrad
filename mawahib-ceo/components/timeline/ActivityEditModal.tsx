'use client'
/**
 * ActivityEditModal — create / view / edit a single activity (Phase 4).
 *
 * Adds on top of Phase 3:
 *   - Type picker with color + icon preview
 *   - Dynamic cost section:
 *       lump_sum:   single amount + optional "affected by student count"
 *       per_student: price × student count (auto)
 *       detailed:   add/remove line-item table (food/transport/housing/…)
 *   - Save as draft vs Send for approval vs Approve (CEO) vs Reject
 *
 * Hijri-first. Never modifies Sidebar / Header / AuthContext.
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
  hijriSpanLength,
  formatSAR,
} from '@/lib/timeline/activity-helpers'
import {
  createActivity,
  updateActivity,
  deleteActivity,
  getActivityCosts,
  replaceActivityCosts,
  approveActivity,
  rejectActivity,
  requestActivityApproval,
} from '@/lib/timeline/db'
import type {
  TimelineActivity,
  TimelineActivityType,
  TimelineActivityStatus,
  TimelineActivityCost,
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
  Plus,
  Send,
  CheckCircle2,
  XCircle,
  Users,
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

// Default line items for detailed mode (what an admin typically adds)
const DEFAULT_DETAILED_LINES = [
  { cost_type: 'تغذية', amount: 0, per_student: true },
  { cost_type: 'نقل', amount: 0, per_student: false },
  { cost_type: 'إقامة', amount: 0, per_student: true },
  { cost_type: 'مكافآت', amount: 0, per_student: false },
]

// Form shape for cost rows (no id — we replace the whole set on save)
interface CostRowForm {
  cost_type: string
  amount: number
  per_student: boolean
  estimated_students: number | null
  notes: string | null
  receipt_url: string | null
}

interface Props {
  open: boolean
  onClose: () => void
  activity: TimelineActivity | null
  onSaved: (a: TimelineActivity) => void
  onDeleted?: (id: string) => void
  activityTypes: TimelineActivityType[]
  daysMap: Map<string, TimelineDay>
  hijriYear: number
  batchId: number
  calendarId: string
  studentCount: number
  defaultStartIso?: string | null
  canEdit: boolean
  /** Role-scoped — enables Approve / Reject buttons. */
  canApprove?: boolean
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
  canApprove = false,
  userId,
}: Props) {
  const isCreate = !activity

  // ── Activity fields
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [typeId, setTypeId] = useState<string | null>(null)
  const [status, setStatus] = useState<TimelineActivityStatus>('draft')
  const [startIso, setStartIso] = useState('')
  const [endIso, setEndIso] = useState('')
  const [customColor, setCustomColor] = useState<string | null>(null)
  const [notes, setNotes] = useState('')

  // ── Cost fields
  const [costRows, setCostRows] = useState<CostRowForm[]>([])
  const [lumpSumAmount, setLumpSumAmount] = useState<number>(0)
  const [lumpPerStudent, setLumpPerStudent] = useState<boolean>(false)
  const [perStudentAmount, setPerStudentAmount] = useState<number>(0)
  const [costsLoading, setCostsLoading] = useState(false)

  // ── UI state
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [approving, setApproving] = useState(false)

  // ── Derived
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

  const costModel = selectedType?.cost_model ?? null

  // ── Reset form when opening
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
      // Reset cost fields
      setCostRows([])
      setLumpSumAmount(0)
      setLumpPerStudent(false)
      setPerStudentAmount(0)
    }
  }, [open, activity, defaultStartIso, activityTypes])

  // ── When type changes or when editing, hydrate cost fields from DB
  useEffect(() => {
    if (!open) return
    if (!activity) {
      // In create mode, seed cost fields from the type's defaults
      if (selectedType?.cost_model === 'lump_sum') {
        setLumpSumAmount(selectedType.default_lump_sum ?? 0)
        setLumpPerStudent(false)
        setCostRows([])
      } else if (selectedType?.cost_model === 'per_student') {
        setPerStudentAmount(selectedType.default_per_student ?? 0)
        setCostRows([])
      } else if (selectedType?.cost_model === 'detailed') {
        setCostRows(
          DEFAULT_DETAILED_LINES.map((l) => ({
            ...l,
            estimated_students: null,
            notes: null,
            receipt_url: null,
          })),
        )
      }
      return
    }
    // Edit mode — load cost rows from DB
    let alive = true
    setCostsLoading(true)
    ;(async () => {
      try {
        const costs = await getActivityCosts(activity.id)
        if (!alive) return
        // If the activity has a type, hydrate mode-specific fields
        if (selectedType?.cost_model === 'lump_sum') {
          const lump = costs.find((c) => !c.per_student)
          const per = costs.find((c) => c.per_student)
          setLumpSumAmount(lump?.amount ?? 0)
          setLumpPerStudent(!!per)
          setPerStudentAmount(per?.amount ?? 0)
        } else if (selectedType?.cost_model === 'per_student') {
          const per = costs.find((c) => c.per_student)
          setPerStudentAmount(per?.amount ?? selectedType.default_per_student ?? 0)
        } else if (selectedType?.cost_model === 'detailed') {
          setCostRows(
            (costs.length > 0 ? costs : DEFAULT_DETAILED_LINES.map((l) => ({ ...l, id: '', activity_id: '', estimated_students: null, notes: null, receipt_url: null, created_at: '' }) as unknown as TimelineActivityCost)).map(
              (c) => ({
                cost_type: c.cost_type,
                amount: c.amount,
                per_student: c.per_student,
                estimated_students: c.estimated_students ?? null,
                notes: c.notes ?? null,
                receipt_url: c.receipt_url ?? null,
              }),
            ),
          )
        }
      } catch (err) {
        console.error(err)
        toast.error('تعذّر تحميل بنود التكلفة')
      } finally {
        if (alive) setCostsLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [open, activity, selectedType])

  // ── Computed cost total (live)
  const computedTotal = useMemo(() => {
    if (costModel === 'lump_sum') {
      return lumpSumAmount + (lumpPerStudent ? perStudentAmount * studentCount : 0)
    }
    if (costModel === 'per_student') {
      return perStudentAmount * studentCount
    }
    if (costModel === 'detailed') {
      return costRows.reduce((acc, r) => {
        const mult = r.per_student ? r.estimated_students ?? studentCount : 1
        return acc + r.amount * mult
      }, 0)
    }
    return 0
  }, [costModel, lumpSumAmount, lumpPerStudent, perStudentAmount, costRows, studentCount])

  // ── Warnings
  const warnings = useMemo(() => {
    const out: string[] = []
    if (!title.trim()) out.push('العنوان مطلوب')
    if (!typeId) out.push('نوع النشاط مطلوب')
    if (!startIso) out.push('تاريخ البداية مطلوب')
    if (!endIso) out.push('تاريخ النهاية مطلوب')
    if (startIso && endIso && startIso > endIso) out.push('تاريخ البداية بعد النهاية')
    if (startIso && !startDay) out.push(`اليوم ${startIso} غير موجود في التقويم`)
    if (endIso && !endDay) out.push(`اليوم ${endIso} غير موجود في التقويم`)
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

  // ── Save helpers
  const buildCostsPayload = (): Array<Omit<TimelineActivityCost, 'id' | 'activity_id' | 'created_at'>> => {
    if (costModel === 'lump_sum') {
      const out: Array<Omit<TimelineActivityCost, 'id' | 'activity_id' | 'created_at'>> = []
      if (lumpSumAmount > 0) {
        out.push({
          cost_type: 'الأساسي',
          amount: lumpSumAmount,
          per_student: false,
          estimated_students: null,
          notes: null,
          receipt_url: null,
        })
      }
      if (lumpPerStudent && perStudentAmount > 0) {
        out.push({
          cost_type: 'للطالب الواحد',
          amount: perStudentAmount,
          per_student: true,
          estimated_students: studentCount,
          notes: null,
          receipt_url: null,
        })
      }
      return out
    }
    if (costModel === 'per_student') {
      if (perStudentAmount <= 0) return []
      return [
        {
          cost_type: 'للطالب الواحد',
          amount: perStudentAmount,
          per_student: true,
          estimated_students: studentCount,
          notes: null,
          receipt_url: null,
        },
      ]
    }
    if (costModel === 'detailed') {
      return costRows
        .filter((r) => r.cost_type.trim() && r.amount > 0)
        .map((r) => ({
          cost_type: r.cost_type.trim(),
          amount: r.amount,
          per_student: r.per_student,
          estimated_students: r.per_student
            ? r.estimated_students ?? studentCount
            : null,
          notes: r.notes ?? null,
          receipt_url: r.receipt_url ?? null,
        }))
    }
    return []
  }

  const saveInternal = async (
    finalStatus: TimelineActivityStatus,
  ): Promise<TimelineActivity | null> => {
    if (!canSave) return null
    setSaving(true)
    try {
      let saved: TimelineActivity
      if (isCreate) {
        saved = await createActivity({
          batch_id: batchId,
          calendar_id: calendarId,
          activity_type_id: typeId,
          title: title.trim(),
          description: description.trim() || null,
          start_date: startIso,
          end_date: endIso,
          custom_color: customColor,
          status: finalStatus,
          proposed_by: userId,
          notes: notes.trim() || null,
        })
      } else {
        saved = await updateActivity(activity!.id, {
          activity_type_id: typeId,
          title: title.trim(),
          description: description.trim() || null,
          start_date: startIso,
          end_date: endIso,
          custom_color: customColor,
          status: finalStatus,
          notes: notes.trim() || null,
        })
      }
      // Replace cost rows
      await replaceActivityCosts(saved.id, buildCostsPayload())
      onSaved(saved)
      return saved
    } catch (err) {
      console.error(err)
      toast.error('تعذّر حفظ النشاط')
      return null
    } finally {
      setSaving(false)
    }
  }

  const handleSaveDraft = async () => {
    const saved = await saveInternal('draft')
    if (saved) {
      toast.success('تم الحفظ كمسودة')
      onClose()
    }
  }

  const handleSaveProposed = async () => {
    const saved = await saveInternal('proposed')
    if (saved) {
      toast.success('تم إرسال النشاط للاعتماد')
      onClose()
    }
  }

  const handleSaveApproved = async () => {
    // Save first (status stays), then approve
    const saved = await saveInternal(status === 'approved' ? 'approved' : status)
    if (saved && userId) {
      setApproving(true)
      try {
        const approved = await approveActivity(saved.id, userId)
        onSaved(approved)
        toast.success('تم اعتماد النشاط')
        onClose()
      } catch (err) {
        console.error(err)
        toast.error('تعذّر الاعتماد')
      } finally {
        setApproving(false)
      }
    }
  }

  const handleReject = async () => {
    if (!activity) return
    setApproving(true)
    try {
      const rejected = await rejectActivity(activity.id)
      onSaved(rejected)
      toast.success('تم إعادة النشاط كمسودة')
      onClose()
    } catch (err) {
      console.error(err)
      toast.error('تعذّر الرفض')
    } finally {
      setApproving(false)
    }
  }

  const handleSubmitForApproval = async () => {
    if (!activity) return
    setApproving(true)
    try {
      const updated = await requestActivityApproval(activity.id)
      onSaved(updated)
      toast.success('تم إرسال الطلب للاعتماد')
      onClose()
    } catch (err) {
      console.error(err)
      toast.error('تعذّر الإرسال')
    } finally {
      setApproving(false)
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

  // ── Cost-row editors (detailed)
  const addCostRow = () => {
    setCostRows([
      ...costRows,
      {
        cost_type: '',
        amount: 0,
        per_student: false,
        estimated_students: null,
        notes: null,
        receipt_url: null,
      },
    ])
  }

  const updateCostRow = (idx: number, patch: Partial<CostRowForm>) => {
    setCostRows(costRows.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }

  const removeCostRow = (idx: number) => {
    setCostRows(costRows.filter((_, i) => i !== idx))
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl p-5 space-y-4 animate-fade-in-up"
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
            {activity ? (
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-md"
                style={{
                  background: STATUS_COLORS[activity.status] + '22',
                  color: STATUS_COLORS[activity.status],
                  border: `1px solid ${STATUS_COLORS[activity.status]}55`,
                }}
              >
                {STATUS_LABELS[activity.status]}
              </span>
            ) : null}
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

        {/* Type picker with preview */}
        <div className="space-y-1.5">
          <label
            className="text-xs font-semibold inline-flex items-center gap-1"
            style={{ color: 'var(--text-secondary)' }}
          >
            <Tag className="w-3 h-3" /> نوع النشاط *
          </label>
          <div className="flex flex-wrap gap-1.5">
            {activityTypes.map((t) => {
              const active = typeId === t.id
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => canEdit && setTypeId(t.id)}
                  disabled={!canEdit}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition"
                  style={{
                    background: active ? `${t.default_color}22` : 'transparent',
                    color: active ? t.default_color : 'var(--text-secondary)',
                    border: `1.5px solid ${active ? t.default_color : 'var(--border-color)'}`,
                  }}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ background: t.default_color }}
                  />
                  {t.arabic_name}
                  <span
                    className="text-[9px] opacity-60 ml-1"
                  >
                    ({costModelLabel(t.cost_model)})
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Title + dates */}
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

        {/* Custom color */}
        <div className="space-y-1.5">
          <label
            className="text-xs font-semibold"
            style={{ color: 'var(--text-secondary)' }}
          >
            لون مخصَّص (اختياري)
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

        {/* Cost section — dynamic based on type */}
        {selectedType ? (
          <div
            className="rounded-xl p-3 space-y-3"
            style={{
              background: 'rgba(192,138,72,0.04)',
              border: '1px solid rgba(192,138,72,0.2)',
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <div
                className="text-xs font-bold inline-flex items-center gap-1.5"
                style={{ color: '#7A4E1E' }}
              >
                <DollarSign className="w-4 h-4" />
                التكلفة — {costModelLabel(selectedType.cost_model)}
              </div>
              <div className="inline-flex items-center gap-1 text-[11px]"
                style={{ color: 'var(--text-muted)' }}
              >
                <Users className="w-3 h-3" />
                الطلاب: <span className="font-mono font-bold">{studentCount}</span>
              </div>
            </div>

            {costsLoading ? (
              <div className="text-xs text-center py-4" style={{ color: 'var(--text-muted)' }}>
                جاري تحميل التكاليف...
              </div>
            ) : costModel === 'lump_sum' ? (
              <div className="space-y-2">
                <div>
                  <label className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
                    المبلغ الإجمالي (ر.س)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={lumpSumAmount}
                    onChange={(e) => setLumpSumAmount(Number(e.target.value) || 0)}
                    disabled={!canEdit}
                    className="w-full mt-1 px-3 py-2 rounded-lg text-sm outline-none"
                    style={{
                      background: 'var(--bg-subtle)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-primary)',
                    }}
                  />
                </div>
                <label className="inline-flex items-center gap-2 cursor-pointer text-xs"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <input
                    type="checkbox"
                    checked={lumpPerStudent}
                    onChange={(e) => setLumpPerStudent(e.target.checked)}
                    disabled={!canEdit}
                  />
                  <span>يتأثر بعدد الطلاب (أضف سعراً للطالب الواحد)</span>
                </label>
                {lumpPerStudent ? (
                  <div>
                    <label className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
                      سعر الطالب الواحد (ر.س)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={perStudentAmount}
                      onChange={(e) => setPerStudentAmount(Number(e.target.value) || 0)}
                      disabled={!canEdit}
                      className="w-full mt-1 px-3 py-2 rounded-lg text-sm outline-none"
                      style={{
                        background: 'var(--bg-subtle)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-primary)',
                      }}
                    />
                  </div>
                ) : null}
              </div>
            ) : costModel === 'per_student' ? (
              <div>
                <label className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  سعر الطالب الواحد (ر.س)
                </label>
                <input
                  type="number"
                  min={0}
                  value={perStudentAmount}
                  onChange={(e) => setPerStudentAmount(Number(e.target.value) || 0)}
                  disabled={!canEdit}
                  className="w-full mt-1 px-3 py-2 rounded-lg text-sm outline-none"
                  style={{
                    background: 'var(--bg-subtle)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                  }}
                />
                <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                  الإجمالي = {perStudentAmount} × {studentCount} طالب
                </p>
              </div>
            ) : costModel === 'detailed' ? (
              <div className="space-y-2">
                {costRows.map((row, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-12 gap-2 items-center"
                  >
                    <input
                      type="text"
                      value={row.cost_type}
                      onChange={(e) =>
                        updateCostRow(idx, { cost_type: e.target.value })
                      }
                      disabled={!canEdit}
                      placeholder="البند"
                      className="col-span-4 px-2 py-1.5 rounded-md text-xs outline-none"
                      style={{
                        background: 'var(--bg-subtle)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-primary)',
                      }}
                    />
                    <input
                      type="number"
                      min={0}
                      value={row.amount}
                      onChange={(e) =>
                        updateCostRow(idx, { amount: Number(e.target.value) || 0 })
                      }
                      disabled={!canEdit}
                      placeholder="المبلغ"
                      className="col-span-3 px-2 py-1.5 rounded-md text-xs font-mono outline-none"
                      style={{
                        background: 'var(--bg-subtle)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-primary)',
                      }}
                    />
                    <label
                      className="col-span-3 inline-flex items-center gap-1 text-[10px] cursor-pointer"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      <input
                        type="checkbox"
                        checked={row.per_student}
                        onChange={(e) =>
                          updateCostRow(idx, { per_student: e.target.checked })
                        }
                        disabled={!canEdit}
                      />
                      للطالب
                    </label>
                    <span
                      className="col-span-1 text-[10px] font-mono text-left"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {row.per_student
                        ? `× ${row.estimated_students ?? studentCount}`
                        : ''}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeCostRow(idx)}
                      disabled={!canEdit}
                      className="col-span-1 p-1 rounded-md hover:bg-white/5"
                      aria-label="حذف البند"
                    >
                      <Trash2
                        className="w-3.5 h-3.5"
                        style={{ color: '#8B2F23' }}
                      />
                    </button>
                  </div>
                ))}
                {canEdit ? (
                  <button
                    type="button"
                    onClick={addCostRow}
                    className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-md transition hover:bg-white/5 border"
                    style={{
                      borderColor: 'rgba(192,138,72,0.4)',
                      color: '#7A4E1E',
                    }}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    إضافة بند
                  </button>
                ) : null}
              </div>
            ) : (
              <div
                className="text-[11px] text-center py-2"
                style={{ color: 'var(--text-muted)' }}
              >
                اختر نوع النشاط لعرض نموذج التكلفة
              </div>
            )}

            {/* Live total */}
            <div
              className="flex items-center justify-between pt-2 border-t"
              style={{ borderColor: 'rgba(192,138,72,0.25)' }}
            >
              <span
                className="text-xs font-semibold"
                style={{ color: 'var(--text-secondary)' }}
              >
                الإجمالي المقدَّر
              </span>
              <span
                className="text-lg font-bold font-mono"
                style={{ color: '#7A4E1E' }}
              >
                {formatSAR(computedTotal)}
              </span>
            </div>
          </div>
        ) : null}

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
              disabled={deleting || saving || approving}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition disabled:opacity-50"
              style={{
                background: 'rgba(185,72,56,0.08)',
                color: '#8B2F23',
                border: '1px solid rgba(185,72,56,0.3)',
              }}
            >
              <Trash2 className="w-3.5 h-3.5" />
              حذف
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2 flex-wrap">
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
            {canApprove && activity && activity.status === 'proposed' ? (
              <>
                <button
                  type="button"
                  onClick={handleReject}
                  disabled={approving || saving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-50 transition"
                  style={{
                    background: 'rgba(185,72,56,0.08)',
                    color: '#8B2F23',
                    border: '1px solid rgba(185,72,56,0.3)',
                  }}
                >
                  <XCircle className="w-4 h-4" />
                  رفض
                </button>
                <button
                  type="button"
                  onClick={handleSaveApproved}
                  disabled={!canSave || saving || approving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-50 transition active:scale-95"
                  style={{
                    background: 'linear-gradient(135deg, #356B6E, #244A4C)',
                    boxShadow: '0 2px 10px rgba(53,107,110,0.35)',
                  }}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  اعتماد
                </button>
              </>
            ) : null}
            {canEdit ? (
              <>
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={!canSave || saving || approving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-50 transition"
                  style={{
                    background: 'transparent',
                    border: '1px solid #C08A48',
                    color: '#7A4E1E',
                  }}
                >
                  <Save className="w-4 h-4" />
                  {saving ? '...' : 'حفظ كمسودة'}
                </button>
                {!canApprove ? (
                  <button
                    type="button"
                    onClick={
                      isCreate || activity?.status === 'draft'
                        ? handleSaveProposed
                        : handleSubmitForApproval
                    }
                    disabled={!canSave || saving || approving}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-50 transition active:scale-95"
                    style={{
                      background: 'linear-gradient(135deg, #C08A48, #9A6A2E)',
                      boxShadow: '0 2px 10px rgba(192,138,72,0.35)',
                    }}
                  >
                    <Send className="w-4 h-4" />
                    {saving || approving ? '...' : 'إرسال للاعتماد'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSaveDraft}
                    disabled={!canSave || saving || approving}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-50 transition active:scale-95"
                    style={{
                      background: 'linear-gradient(135deg, #C08A48, #9A6A2E)',
                      boxShadow: '0 2px 10px rgba(192,138,72,0.35)',
                    }}
                  >
                    <Save className="w-4 h-4" />
                    {saving ? '...' : 'حفظ'}
                  </button>
                )}
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Cost-model label helper ───────────────────────────────────────
function costModelLabel(m: 'lump_sum' | 'per_student' | 'detailed'): string {
  switch (m) {
    case 'lump_sum': return 'مبلغ مقطوع'
    case 'per_student': return 'سعر للطالب'
    case 'detailed': return 'بنود تفصيلية'
  }
}

// ─── Hijri picker ─────────────────────────────────────────────────
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
