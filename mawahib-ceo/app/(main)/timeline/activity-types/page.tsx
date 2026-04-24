'use client'
/**
 * /timeline/activity-types — manage timeline_activity_types.
 *
 * Who can view: everyone (read-only for non-CEO/non-records_officer).
 * Who can mutate: CEO + records_officer (enforced by DB RLS).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { TIMELINE_ENABLED } from '@/lib/timeline/flag'
import {
  getActivityTypes,
  upsertActivityType,
  deleteActivityType,
} from '@/lib/timeline/db'
import { useAuth } from '@/contexts/AuthContext'
import type {
  TimelineActivityType,
  TimelineCostModel,
} from '@/types/timeline'
import {
  Tag,
  Plus,
  Edit3,
  Trash2,
  X,
  Save,
  ChevronLeft,
  Loader2,
  Shield,
} from 'lucide-react'

const COST_MODEL_LABELS: Record<TimelineCostModel, string> = {
  lump_sum: 'مبلغ مقطوع',
  per_student: 'سعر للطالب',
  detailed: 'بنود تفصيلية',
}

export default function ActivityTypesPage() {
  const router = useRouter()
  const { profile, loading: authLoading } = useAuth()
  const role = profile?.role ?? null
  const canManage = role === 'ceo' || role === 'records_officer'

  const [types, setTypes] = useState<TimelineActivityType[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<TimelineActivityType | null>(null)

  useEffect(() => {
    if (!TIMELINE_ENABLED) router.replace('/dashboard')
  }, [router])

  useEffect(() => {
    if (!TIMELINE_ENABLED || authLoading) return
    let alive = true
    ;(async () => {
      try {
        const data = await getActivityTypes()
        if (alive) setTypes(data)
      } catch (err) {
        console.error(err)
        toast.error('تعذّر تحميل الأنواع')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [authLoading])

  const handleSaved = useCallback((t: TimelineActivityType) => {
    setTypes((prev) => {
      const idx = prev.findIndex((x) => x.id === t.id)
      if (idx === -1) return [...prev, t].sort((a, b) => a.arabic_name.localeCompare(b.arabic_name))
      const next = prev.slice()
      next[idx] = t
      return next
    })
  }, [])

  const handleDelete = async (t: TimelineActivityType) => {
    if (!canManage) return
    if (t.is_system) {
      toast.error('لا يمكن حذف نوع نظامي')
      return
    }
    if (!confirm(`هل تريد حذف النوع "${t.arabic_name}"؟`)) return
    try {
      await deleteActivityType(t.id)
      setTypes((prev) => prev.filter((x) => x.id !== t.id))
      toast.success('تم الحذف')
    } catch (err) {
      console.error(err)
      toast.error('تعذّر الحذف — ربما هناك أنشطة مرتبطة')
    }
  }

  if (!TIMELINE_ENABLED || authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin mx-auto" style={{ color: '#C08A48' }} />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            جاري تحميل الأنواع...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/timeline"
              className="text-xs font-semibold inline-flex items-center gap-1 hover:underline"
              style={{ color: '#C08A48' }}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              رجوع للخطة الزمنية
            </Link>
          </div>
          <h1
            className="text-2xl font-bold flex items-center gap-2"
            style={{ color: 'var(--text-primary)' }}
          >
            <Tag className="w-6 h-6" style={{ color: '#C08A48' }} />
            أنواع الأنشطة
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            قاموس الأنواع المستخدم في الخطة الزمنية. يحدد اللون الافتراضي ونموذج التكلفة.
          </p>
        </div>
        {canManage ? (
          <button
            type="button"
            onClick={() => {
              setEditing(null)
              setModalOpen(true)
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white rounded-xl transition active:scale-95"
            style={{
              background: 'linear-gradient(135deg, #C08A48, #9A6A2E)',
              boxShadow: '0 2px 10px rgba(192,138,72,0.35)',
            }}
          >
            <Plus className="w-4 h-4" />
            نوع جديد
          </button>
        ) : (
          <div
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold"
            style={{
              background: 'rgba(148,163,184,0.08)',
              border: '1px solid rgba(148,163,184,0.25)',
              color: 'var(--text-muted)',
            }}
          >
            <Shield className="w-3.5 h-3.5" />
            قراءة فقط
          </div>
        )}
      </div>

      {/* Table */}
      <div
        className="card-static overflow-hidden"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ direction: 'rtl' }}>
            <thead>
              <tr
                style={{
                  background: 'var(--bg-subtle)',
                  borderBottom: '1px solid var(--border-color)',
                }}
              >
                <th className="text-right p-3 text-xs font-bold" style={{ color: 'var(--text-muted)' }}>
                  اللون
                </th>
                <th className="text-right p-3 text-xs font-bold" style={{ color: 'var(--text-muted)' }}>
                  الاسم بالعربي
                </th>
                <th className="text-right p-3 text-xs font-bold" style={{ color: 'var(--text-muted)' }}>
                  المعرّف
                </th>
                <th className="text-right p-3 text-xs font-bold" style={{ color: 'var(--text-muted)' }}>
                  نموذج التكلفة
                </th>
                <th className="text-right p-3 text-xs font-bold" style={{ color: 'var(--text-muted)' }}>
                  الإعدادات الافتراضية
                </th>
                <th className="text-right p-3 text-xs font-bold" style={{ color: 'var(--text-muted)' }}>
                  النظام؟
                </th>
                {canManage ? (
                  <th className="text-right p-3 text-xs font-bold" style={{ color: 'var(--text-muted)' }}>
                    إجراءات
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {types.map((t) => (
                <tr
                  key={t.id}
                  className="border-b transition hover:bg-white/2"
                  style={{ borderColor: 'var(--border-soft)' }}
                >
                  <td className="p-3">
                    <span
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-semibold"
                      style={{
                        background: t.default_color + '22',
                        color: t.default_color,
                        border: `1px solid ${t.default_color}55`,
                      }}
                    >
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ background: t.default_color }}
                      />
                      {t.default_color}
                    </span>
                  </td>
                  <td className="p-3 font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {t.arabic_name}
                  </td>
                  <td className="p-3 font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
                    {t.name}
                  </td>
                  <td className="p-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {COST_MODEL_LABELS[t.cost_model]}
                  </td>
                  <td className="p-3 text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                    {t.cost_model === 'lump_sum' && t.default_lump_sum != null
                      ? `${t.default_lump_sum.toLocaleString('ar-SA')} ر.س`
                      : t.cost_model === 'per_student' && t.default_per_student != null
                        ? `${t.default_per_student.toLocaleString('ar-SA')} ر.س/طالب`
                        : '—'}
                  </td>
                  <td className="p-3 text-xs">
                    {t.is_system ? (
                      <span
                        className="inline-block px-2 py-0.5 rounded-md font-semibold"
                        style={{
                          background: 'rgba(53,107,110,0.12)',
                          color: '#235052',
                          border: '1px solid rgba(53,107,110,0.3)',
                        }}
                      >
                        نظامي
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>مخصَّص</span>
                    )}
                  </td>
                  {canManage ? (
                    <td className="p-3">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(t)
                            setModalOpen(true)
                          }}
                          className="p-1.5 rounded-md hover:bg-white/5 transition"
                          aria-label="تعديل"
                        >
                          <Edit3 className="w-3.5 h-3.5" style={{ color: '#C08A48' }} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(t)}
                          disabled={t.is_system}
                          className="p-1.5 rounded-md hover:bg-white/5 transition disabled:opacity-40"
                          aria-label="حذف"
                        >
                          <Trash2 className="w-3.5 h-3.5" style={{ color: '#8B2F23' }} />
                        </button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal */}
      <ActivityTypeEditModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editing}
        onSaved={handleSaved}
      />
    </div>
  )
}

// ─── Edit modal ────────────────────────────────────────────────────
function ActivityTypeEditModal({
  open,
  onClose,
  editing,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  editing: TimelineActivityType | null
  onSaved: (t: TimelineActivityType) => void
}) {
  const [name, setName] = useState('')
  const [arabicName, setArabicName] = useState('')
  const [color, setColor] = useState('#C08A48')
  const [costModel, setCostModel] = useState<TimelineCostModel>('lump_sum')
  const [defaultLumpSum, setDefaultLumpSum] = useState<number | null>(null)
  const [defaultPerStudent, setDefaultPerStudent] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (editing) {
      setName(editing.name)
      setArabicName(editing.arabic_name)
      setColor(editing.default_color)
      setCostModel(editing.cost_model)
      setDefaultLumpSum(editing.default_lump_sum)
      setDefaultPerStudent(editing.default_per_student)
    } else {
      setName('')
      setArabicName('')
      setColor('#C08A48')
      setCostModel('lump_sum')
      setDefaultLumpSum(null)
      setDefaultPerStudent(null)
    }
  }, [open, editing])

  if (!open) return null

  const canSave = name.trim() && arabicName.trim() && color && !saving

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      const saved = await upsertActivityType({
        ...(editing ? { id: editing.id } : {}),
        name: name.trim(),
        arabic_name: arabicName.trim(),
        default_color: color,
        cost_model: costModel,
        default_lump_sum: costModel === 'lump_sum' ? defaultLumpSum : null,
        default_per_student:
          costModel === 'per_student' ? defaultPerStudent : null,
        icon: null,
      })
      onSaved(saved)
      toast.success(editing ? 'تم الحفظ' : 'تم إنشاء النوع')
      onClose()
    } catch (err) {
      console.error(err)
      toast.error('تعذّر الحفظ — ربما المعرّف مستخدم مسبقاً')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl p-5 space-y-4 animate-fade-in-up"
        style={{
          background: 'var(--bg-primary)',
          border: '1px solid var(--border-color)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
            {editing ? 'تعديل النوع' : 'نوع جديد'}
          </h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10">
            <X className="w-5 h-5" style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
              الاسم بالعربي *
            </label>
            <input
              type="text"
              value={arabicName}
              onChange={(e) => setArabicName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{
                background: 'var(--bg-subtle)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
              المعرّف (بالإنجليزي) *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value.replace(/\s+/g, '_').toLowerCase())}
              placeholder="mohtama_day"
              disabled={!!editing}
              className="w-full px-3 py-2 rounded-lg text-sm font-mono outline-none"
              style={{
                background: 'var(--bg-subtle)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
            اللون الافتراضي
          </label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-14 h-10 rounded-md cursor-pointer"
              style={{ background: 'transparent', border: '1px solid var(--border-color)' }}
            />
            <span className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
              {color}
            </span>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
            نموذج التكلفة
          </label>
          <div className="flex gap-1.5 flex-wrap">
            {(Object.keys(COST_MODEL_LABELS) as TimelineCostModel[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setCostModel(m)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition"
                style={
                  costModel === m
                    ? {
                        background: '#C08A48',
                        color: 'white',
                        border: '1px solid #C08A48',
                      }
                    : {
                        background: 'transparent',
                        color: 'var(--text-secondary)',
                        border: '1px solid var(--border-color)',
                      }
                }
              >
                {COST_MODEL_LABELS[m]}
              </button>
            ))}
          </div>
        </div>

        {costModel === 'lump_sum' ? (
          <div className="space-y-1">
            <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
              مبلغ افتراضي (ر.س)
            </label>
            <input
              type="number"
              min={0}
              value={defaultLumpSum ?? ''}
              onChange={(e) => setDefaultLumpSum(e.target.value ? Number(e.target.value) : null)}
              className="w-full px-3 py-2 rounded-lg text-sm font-mono outline-none"
              style={{
                background: 'var(--bg-subtle)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
        ) : costModel === 'per_student' ? (
          <div className="space-y-1">
            <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
              سعر الطالب الواحد الافتراضي (ر.س)
            </label>
            <input
              type="number"
              min={0}
              value={defaultPerStudent ?? ''}
              onChange={(e) => setDefaultPerStudent(e.target.value ? Number(e.target.value) : null)}
              className="w-full px-3 py-2 rounded-lg text-sm font-mono outline-none"
              style={{
                background: 'var(--bg-subtle)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
        ) : (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            التكاليف التفصيلية تُدخَل عند إنشاء كل نشاط.
          </p>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-semibold border transition"
            style={{
              borderColor: 'var(--border-color)',
              color: 'var(--text-secondary)',
            }}
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-50 transition active:scale-95"
            style={{
              background: 'linear-gradient(135deg, #C08A48, #9A6A2E)',
              boxShadow: '0 2px 10px rgba(192,138,72,0.35)',
            }}
          >
            <Save className="w-4 h-4" />
            {saving ? '...' : 'حفظ'}
          </button>
        </div>
      </div>
    </div>
  )
}
