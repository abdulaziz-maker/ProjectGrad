'use client'
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import {
  getTexts, getAllTextUnits, createText, updateText, deleteText,
  type DBText, type DBTextUnit,
} from '@/lib/db'
import {
  Plus, Pencil, Trash2, ChevronRight, Loader2, Save,
  X, ChevronDown, ChevronUp, BookOpen, AlertTriangle,
  CheckCircle2, Hash, GripVertical,
} from 'lucide-react'
import { MatnSkeleton } from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'

// ── ثوابت ──────────────────────────────────────────────────────────────
// المستوى التمهيدي (0) قبل المستوى الأول — للطلاب المبتدئين قبل بدء المناهج النظامية.
const LEVEL_LABELS: Record<number, string> = {
  0: 'التمهيدي',
  1: 'الأول', 2: 'الثاني', 3: 'الثالث',
  4: 'الرابع', 5: 'الخامس', 6: 'السادس',
}

const LEVEL_IDS = [0, 1, 2, 3, 4, 5, 6] as const

const SUBJECT_COLORS: Record<string, string> = {
  'علوم القرآن': '#C08A48', 'الفقه': '#356B6E', 'العقيدة': '#8b5cf6',
  'اللغة': '#5A8F67', 'التاريخ': '#C9972C', 'الحديث': '#B94838',
  'التربية الإيمانية': '#ec4899', 'مهارات': '#64748b',
}

const CATEGORIES: DBText['category'][] = ['علمي', 'تربوي', 'مهاري']
const TYPES: DBText['type'][] = ['منظومة', 'منثور', 'سؤال_جواب', 'أحاديث', 'أسطر']
const SUBJECTS = ['علوم القرآن', 'الفقه', 'العقيدة', 'اللغة', 'التاريخ', 'الحديث', 'التربية الإيمانية', 'مهارات']

type FormData = Omit<DBText, 'id'>

const EMPTY_FORM: FormData = {
  name_ar: '', category: 'علمي', subject: 'علوم القرآن',
  type: 'منظومة', level_id: 1, total_lines: 0,
  weekly_rate: 16, order_in_level: 1, description: null, is_active: true,
}

// ── حقل الإدخال ──────────────────────────────────────────────────────
function FormField({ label, required, children }: {
  label: string; required?: boolean; children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium flex items-center gap-1"
        style={{ color: 'var(--text-secondary)' }}>
        {label}
        {required && <span style={{ color: '#791F1F' }}>*</span>}
      </label>
      {children}
    </div>
  )
}

const inputCls = "w-full px-3 py-2.5 text-sm rounded-xl outline-none"
const inputStyle = {
  background: 'var(--bg-subtle)',
  border: '1px solid var(--border-soft)',
  color: 'var(--text-primary)',
}

// ── مودال الإضافة / التعديل ──────────────────────────────────────────
function TextModal({ initial, onSave, onClose, saving, saveError }: {
  initial: FormData
  onSave: (data: FormData) => void
  onClose: () => void
  saving: boolean
  saveError?: string | null
}) {
  const [form, setForm] = useState<FormData>(initial)

  // تزامن البيانات عند تغيير المتن المحدد
  useEffect(() => { setForm(initial) }, [initial])
  const units = form.total_lines > 0 && form.weekly_rate > 0
    ? Math.ceil(form.total_lines / form.weekly_rate) : 0

  const set = (key: keyof FormData, value: unknown) =>
    setForm(prev => ({ ...prev, [key]: value }))

  const valid = form.name_ar.trim().length > 0 && form.total_lines > 0 && form.weekly_rate > 0

  const content = (
    <div className="modal-backdrop"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>

      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>

        {/* رأس */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="modal-icon info">
              <BookOpen size={17} style={{ color: '#C08A48' }} />
            </div>
            <span className="modal-title">
              {initial.name_ar ? 'تعديل المتن' : 'إضافة متن جديد'}
            </span>
          </div>
          <button className="modal-close" onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        <div className="modal-body scrollable space-y-4">

          {/* اسم المتن */}
          <FormField label="اسم المتن" required>
            <input type="text" className={inputCls} style={inputStyle}
              value={form.name_ar}
              onChange={e => set('name_ar', e.target.value)}
              placeholder="مثال: تحفة الأطفال" />
          </FormField>

          {/* المستوى + الترتيب */}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="المستوى" required>
              <div className="relative">
                <select className={inputCls + " appearance-none pl-7"} style={inputStyle}
                  value={form.level_id}
                  onChange={e => set('level_id', Number(e.target.value))}>
                  {LEVEL_IDS.map(l =>
                    <option key={l} value={l}>المستوى {LEVEL_LABELS[l]}</option>
                  )}
                </select>
                <ChevronDown size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: 'var(--text-muted)' }} />
              </div>
            </FormField>

            <FormField label="الترتيب في المستوى" required>
              <input type="number" min={1} className={inputCls} style={inputStyle}
                value={form.order_in_level}
                onChange={e => set('order_in_level', Number(e.target.value))} />
            </FormField>
          </div>

          {/* الفئة + المادة */}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="الفئة" required>
              <div className="relative">
                <select className={inputCls + " appearance-none pl-7"} style={inputStyle}
                  value={form.category}
                  onChange={e => set('category', e.target.value as DBText['category'])}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <ChevronDown size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: 'var(--text-muted)' }} />
              </div>
            </FormField>

            <FormField label="المادة" required>
              <div className="relative">
                <select className={inputCls + " appearance-none pl-7"} style={inputStyle}
                  value={form.subject}
                  onChange={e => set('subject', e.target.value)}>
                  {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <ChevronDown size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: 'var(--text-muted)' }} />
              </div>
            </FormField>
          </div>

          {/* نوع المتن */}
          <FormField label="نوع المتن" required>
            <div className="grid grid-cols-5 gap-1.5">
              {TYPES.map(t => (
                <button key={t} type="button" onClick={() => set('type', t)}
                  className="py-2 px-1 rounded-xl text-[11px] font-medium text-center transition-all"
                  style={{
                    minHeight: '44px',
                    background: form.type === t ? 'rgba(192,138,72,0.15)' : 'var(--bg-subtle)',
                    border: `1.5px solid ${form.type === t ? '#C08A48' : 'var(--border-color)'}`,
                    color: form.type === t ? '#C08A48' : 'var(--text-muted)',
                  }}>
                  {t}
                </button>
              ))}
            </div>
          </FormField>

          {/* الأسطر + المعدل */}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="إجمالي الأسطر" required>
              <input type="number" min={1} className={inputCls} style={inputStyle}
                value={form.total_lines || ''}
                onChange={e => set('total_lines', Number(e.target.value))}
                placeholder="مثال: 61" />
            </FormField>

            <FormField label="معدل الحفظ الأسبوعي" required>
              <input type="number" min={1} className={inputCls} style={inputStyle}
                value={form.weekly_rate || ''}
                onChange={e => set('weekly_rate', Number(e.target.value))}
                placeholder="مثال: 16" />
            </FormField>
          </div>

          {/* معاينة عدد المقررات */}
          {units > 0 && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
              style={{ background: 'rgba(192,138,72,0.10)', border: '1px solid rgba(192,138,72,0.28)' }}>
              <Hash size={14} style={{ color: 'var(--accent-warm)' }} />
              <span className="text-xs" style={{ color: '#8B5A1E' }}>
                سيتم توليد <strong>{units}</strong> مقرر أسبوعي تلقائياً
              </span>
            </div>
          )}

          {/* الوصف */}
          <FormField label="ملاحظات (اختياري)">
            <textarea className={inputCls + " resize-none"} style={inputStyle} rows={2}
              value={form.description ?? ''}
              onChange={e => set('description', e.target.value || null)}
              placeholder="أي ملاحظات إضافية..." />
          </FormField>

          {/* مفتاح التفعيل */}
          <div className="flex items-center justify-between px-3 py-3 rounded-xl"
            style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-color)' }}>
            <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>نشط في الخطة</span>
            <button type="button" onClick={() => set('is_active', !form.is_active)}
              className="w-12 h-6 rounded-full transition-all relative"
              style={{
                background: form.is_active ? '#27500A' : 'var(--bg-elevated)',
                border: '2px solid ' + (form.is_active ? '#27500A' : 'var(--border-soft)'),
              }}>
              <span className="absolute top-0.5 w-4 h-4 rounded-full transition-all"
                style={{ background: '#fff', left: form.is_active ? 'calc(100% - 18px)' : '2px' }} />
            </button>
          </div>
        </div>

        {/* رسالة خطأ داخل المودال */}
        {saveError && (
          <div className="mx-5 mb-3 px-3 py-2.5 rounded-xl flex items-center gap-2"
            style={{ background: '#FCEBEB', border: '1px solid #791F1F' }}>
            <AlertTriangle size={14} style={{ color: '#791F1F', flexShrink: 0 }} />
            <span className="text-xs font-medium" style={{ color: '#791F1F' }}>{saveError}</span>
          </div>
        )}

        {/* أزرار */}
        <div className="modal-footer">
          <button onClick={onClose}
            style={{ padding: '9px 20px', borderRadius: 10, fontSize: 13, fontWeight: 500, background: 'var(--bg-elevated)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            إلغاء
          </button>
          <button onClick={() => onSave(form)} disabled={!valid || saving}
            className="flex items-center gap-2 disabled:opacity-50"
            style={{ padding: '9px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700, background: 'linear-gradient(135deg,#C08A48,#4f46e5)', color: '#fff', cursor: 'pointer', border: 'none' }}>
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            {saving ? 'جاري الحفظ...' : 'حفظ'}
          </button>
        </div>
      </div>
    </div>
  )

  return typeof window !== 'undefined'
    ? createPortal(content, document.body)
    : null
}

// ── صف المتن مع أزرار الترتيب ──────────────────────────────────────────
function TextRow({ text, unitCount, rank, isFirst, isLast, onEdit, onDelete, onMoveUp, onMoveDown, reordering }: {
  text: DBText
  unitCount: number
  rank: number
  isFirst: boolean
  isLast: boolean
  onEdit: () => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  reordering: boolean
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const subjectColor = SUBJECT_COLORS[text.subject] ?? '#C08A48'

  return (
    <div className="flex items-center gap-2 p-3 rounded-xl transition-all"
      style={{
        background: text.is_active ? 'var(--bg-card)' : 'rgba(255,255,255,0.02)',
        border: `1px solid ${text.is_active ? 'var(--border-color)' : 'var(--border-faint)'}`,
        opacity: text.is_active ? 1 : 0.55,
      }}>

      {/* أزرار الترتيب */}
      <div className="flex flex-col gap-0.5 flex-shrink-0">
        <button onClick={onMoveUp} disabled={isFirst || reordering}
          className="w-7 h-7 rounded-lg flex items-center justify-center transition-all active:scale-90 disabled:opacity-20"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-color)' }}
          title="رفع الأولوية">
          <ChevronUp size={13} style={{ color: 'var(--text-muted)' }} />
        </button>
        <button onClick={onMoveDown} disabled={isLast || reordering}
          className="w-7 h-7 rounded-lg flex items-center justify-center transition-all active:scale-90 disabled:opacity-20"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-color)' }}
          title="خفض الأولوية">
          <ChevronDown size={13} style={{ color: 'var(--text-muted)' }} />
        </button>
      </div>

      {/* رقم الترتيب */}
      <div className="w-6 flex-shrink-0 text-center">
        <span className="text-[11px] font-bold" style={{ color: 'var(--text-muted)' }}>{rank}</span>
      </div>

      {/* نقطة المادة */}
      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: subjectColor }} />

      {/* المعلومات */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
            {text.name_ar}
          </span>
          {!text.is_active && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full"
              style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}>
              معطّل
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap mt-0.5">
          <span className="text-[10px] px-1.5 py-0.5 rounded"
            style={{ background: `${subjectColor}15`, color: subjectColor }}>
            {text.subject}
          </span>
          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{text.type}</span>
          <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
            {text.total_lines} سطر · {unitCount} مقرر · {text.weekly_rate}/أسبوع
          </span>
        </div>
      </div>

      {/* تحكم */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {confirmDelete ? (
          <>
            <button onClick={onDelete}
              className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold"
              style={{ background: '#FCEBEB', color: '#791F1F', border: '1px solid #791F1F' }}>
              تأكيد
            </button>
            <button onClick={() => setConfirmDelete(false)}
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-color)' }}>
              <X size={13} style={{ color: 'var(--text-muted)' }} />
            </button>
          </>
        ) : (
          <>
            <button onClick={onEdit}
              data-tooltip="تعديل المتن" data-tooltip-position="top"
              className="w-9 h-9 rounded-xl flex items-center justify-center transition-all active:scale-95"
              style={{ background: 'rgba(192,138,72,0.1)', border: '1px solid rgba(192,138,72,0.2)' }}>
              <Pencil size={14} style={{ color: '#C08A48' }} />
            </button>
            <button onClick={() => setConfirmDelete(true)}
              data-tooltip="حذف المتن" data-tooltip-position="top"
              className="w-9 h-9 rounded-xl flex items-center justify-center transition-all active:scale-95"
              style={{ background: 'rgba(121,31,31,0.08)', border: '1px solid rgba(121,31,31,0.15)' }}>
              <Trash2 size={14} style={{ color: '#791F1F' }} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── الصفحة الرئيسية ────────────────────────────────────────────────────
export default function ManageTextsPage() {
  const { profile } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [loading, setLoading] = useState(true)
  const [texts, setTexts] = useState<DBText[]>([])
  const [textUnits, setTextUnits] = useState<DBTextUnit[]>([])
  const [selectedLevel, setSelectedLevel] = useState<number | 'all'>('all')
  const [showModal, setShowModal] = useState(false)
  const [editTarget, setEditTarget] = useState<DBText | null>(null)

  // فتح نموذج الإضافة تلقائياً عند الوصول بـ ?action=add من زر الإضافة السريعة
  useEffect(() => {
    if (searchParams.get('action') === 'add') {
      setEditTarget(null)
      setShowModal(true)
    }
  }, [searchParams])
  // ref لتجنب stale closure في handleSave
  const editTargetRef = useRef<DBText | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [reordering, setReordering] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    const load = async () => {
      const [t, u] = await Promise.all([getTexts(), getAllTextUnits()])
      setTexts(t)
      setTextUnits(u)
    }
    load().catch(console.error).finally(() => setLoading(false))
  }, [])

  const unitCountByText = useMemo(() => {
    const map = new Map<string, number>()
    for (const u of textUnits) map.set(u.text_id, (map.get(u.text_id) ?? 0) + 1)
    return map
  }, [textUnits])

  const filteredTexts = useMemo(() => {
    let list = texts
    if (selectedLevel !== 'all') list = list.filter(t => t.level_id === selectedLevel)
    if (search.trim()) list = list.filter(t =>
      t.name_ar.includes(search) || t.subject.includes(search)
    )
    return list.sort((a, b) =>
      a.level_id !== b.level_id ? a.level_id - b.level_id : a.order_in_level - b.order_in_level
    )
  }, [texts, selectedLevel, search])

  // تجميع المتون حسب المستوى للترتيب الصحيح
  const textsByLevel = useMemo(() => {
    const map = new Map<number, DBText[]>()
    for (const t of filteredTexts) {
      const arr = map.get(t.level_id) ?? []
      arr.push(t)
      map.set(t.level_id, arr)
    }
    return map
  }, [filteredTexts])

  const stats = useMemo(() => ({
    total: texts.length,
    active: texts.filter(t => t.is_active).length,
  }), [texts])

  const showToast = useCallback((msg: string, type: 'success' | 'error') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }, [])

  // ── مزامنة ref مع state لتجنب stale closure ──
  useEffect(() => { editTargetRef.current = editTarget }, [editTarget])

  // ── حفظ — يستخدم ref للحصول على القيمة الحالية دائماً ──
  const handleSave = useCallback(async (data: FormData) => {
    const target = editTargetRef.current
    setSaving(true)
    setSaveError(null)
    try {
      if (target) {
        await updateText(target.id, data)
        setTexts(prev => prev.map(t => t.id === target.id ? { ...t, ...data } : t))
      } else {
        const newId = await createText(data)
        setTexts(prev => [...prev, { ...data, id: newId }])
      }
      // تحديث المقررات بشكل غير متزامن (لا يوقف الحفظ إن فشل)
      getAllTextUnits().then(setTextUnits).catch(() => {})
      showToast(target ? 'تم تعديل المتن بنجاح ✓' : 'تمت الإضافة بنجاح ✓', 'success')
      setShowModal(false)
      setEditTarget(null)
      editTargetRef.current = null
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'حدث خطأ أثناء الحفظ'
      setSaveError(msg)   // يظهر داخل المودال
    } finally {
      setSaving(false)
    }
  }, [showToast])

  // ── حذف ──
  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteText(id)
      setTexts(prev => prev.filter(t => t.id !== id))
      showToast('تم حذف المتن', 'success')
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'حدث خطأ', 'error')
    }
  }, [showToast])

  // ── تبديل الترتيب بين متنين ──
  const handleReorder = useCallback(async (textId: string, direction: 'up' | 'down') => {
    const text = texts.find(t => t.id === textId)
    if (!text) return

    // المتون في نفس المستوى مرتبة
    const levelTexts = texts
      .filter(t => t.level_id === text.level_id)
      .sort((a, b) => a.order_in_level - b.order_in_level)

    const idx = levelTexts.findIndex(t => t.id === textId)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1

    if (swapIdx < 0 || swapIdx >= levelTexts.length) return

    const other = levelTexts[swapIdx]
    const newOrderCurrent = other.order_in_level
    const newOrderOther = text.order_in_level

    setReordering(true)
    try {
      await Promise.all([
        updateText(text.id,  { order_in_level: newOrderCurrent }),
        updateText(other.id, { order_in_level: newOrderOther }),
      ])
      setTexts(prev => prev.map(t => {
        if (t.id === text.id)  return { ...t, order_in_level: newOrderCurrent }
        if (t.id === other.id) return { ...t, order_in_level: newOrderOther }
        return t
      }))
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'خطأ في الترتيب', 'error')
    } finally {
      setReordering(false)
    }
  }, [texts, showToast])

  // ── المودال يُعرض فوراً حتى أثناء تحميل المتون (Portal إلى document.body) ──
  // حتى لا يرى المستخدم هيكل التحميل ثم يقفز المودال بعد لحظة.
  if (loading) return (
    <>
      <MatnSkeleton />
      {showModal && (
        <TextModal
          key={editTarget?.id ?? 'new'}
          initial={editTarget
            ? { name_ar: editTarget.name_ar, category: editTarget.category,
                subject: editTarget.subject, type: editTarget.type,
                level_id: editTarget.level_id, total_lines: editTarget.total_lines,
                weekly_rate: editTarget.weekly_rate, order_in_level: editTarget.order_in_level,
                description: editTarget.description, is_active: editTarget.is_active }
            : { ...EMPTY_FORM }}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditTarget(null); setSaveError(null) }}
          saving={saving}
          saveError={saveError}
        />
      )}
    </>
  )

  // مستويات ظاهرة
  const visibleLevels = selectedLevel === 'all'
    ? [1,2,3,4,5,6].filter(l => textsByLevel.has(l))
    : [selectedLevel as number]

  return (
    <div className="space-y-5 max-w-3xl mx-auto">

      {/* ── رأس الصفحة ── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/matn')}
            className="w-11 h-11 rounded-xl flex items-center justify-center"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <ChevronRight size={18} style={{ color: 'var(--text-secondary)' }} />
          </button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <BookOpen size={20} style={{ color: '#C08A48' }} />
              إدارة المتون
            </h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {stats.total} متن · {stats.active} نشط ·
              <span className="mr-1" style={{ color: '#C08A48' }}>↕ الترتيب يحدد الأولوية</span>
            </p>
          </div>
        </div>
        <button onClick={() => { setEditTarget(null); setShowModal(true) }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold"
          style={{
            background: 'linear-gradient(135deg, #C08A48 0%, #4f46e5 100%)',
            color: '#fff', minHeight: '44px',
          }}>
          <Plus size={16} />
          إضافة متن
        </button>
      </div>

      {/* ── بحث ── */}
      <input type="text" value={search} onChange={e => setSearch(e.target.value)}
        placeholder="ابحث باسم المتن أو المادة..."
        className="w-full px-4 py-3 text-sm rounded-xl outline-none"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
      />

      {/* ── تبويبات الفلترة ── */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {([['all', 'الكل']] as [string | number, string][])
          .concat(LEVEL_IDS.map(l => [l, `م${LEVEL_LABELS[l]}`]))
          .map(([val, label]) => {
            const isActive = selectedLevel === val
            const count = val === 'all'
              ? texts.length
              : texts.filter(t => t.level_id === Number(val)).length
            return (
              <button key={String(val)}
                onClick={() => setSelectedLevel(val === 'all' ? 'all' : Number(val))}
                className="flex-shrink-0 px-4 py-2 rounded-xl text-xs font-medium transition-all"
                style={{
                  minHeight: '44px',
                  background: isActive ? 'rgba(192,138,72,0.15)' : 'var(--bg-card)',
                  border: `1.5px solid ${isActive ? '#C08A48' : 'var(--border-color)'}`,
                  color: isActive ? '#C08A48' : 'var(--text-muted)',
                }}>
                {label} <span className="opacity-60">({count})</span>
              </button>
            )
          })}
      </div>

      {/* ── تلميح الترتيب ── */}
      {!search && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
          style={{ background: 'rgba(53,107,110,0.08)', border: '1px solid rgba(53,107,110,0.22)' }}>
          <GripVertical size={14} style={{ color: 'var(--accent-teal)' }} />
          <span className="text-xs" style={{ color: 'var(--accent-teal)' }}>
            استخدم أزرار ↑↓ لترتيب أولويات المتون — المتن الأول هو الأعلى أولوية
          </span>
        </div>
      )}

      {/* ── قائمة المتون مجمعة حسب المستوى ── */}
      {filteredTexts.length === 0 ? (
        <EmptyState
          icon={<BookOpen size={28} />}
          title="لا توجد متون بعد"
          message="أضف أول متن لتبدأ في تسجيل تقدم الطلاب في الحفظ"
          cta={{ label: '+ إضافة متن جديد', onClick: () => { setEditTarget(null); setShowModal(true) } }}
        />
      ) : (
        <div className="space-y-5">
          {visibleLevels.map(lvl => {
            const lvlTexts = textsByLevel.get(lvl) ?? []
            return (
              <div key={lvl}>
                {/* عنوان المستوى */}
                <div className="flex items-center gap-2 mb-2">
                  <div className="px-3 py-1 rounded-lg text-xs font-bold"
                    style={{ background: 'rgba(192,138,72,0.12)', color: '#8B5A1E', border: '1px solid rgba(192,138,72,0.28)' }}>
                    المستوى {LEVEL_LABELS[lvl]}
                  </div>
                  <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {lvlTexts.length} متن
                  </span>
                  {reordering && (
                    <Loader2 size={12} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
                  )}
                </div>

                {/* متون المستوى */}
                <div className="space-y-2">
                  {lvlTexts.map((text, idx) => (
                    <TextRow
                      key={text.id}
                      text={text}
                      unitCount={unitCountByText.get(text.id) ?? 0}
                      rank={idx + 1}
                      isFirst={idx === 0}
                      isLast={idx === lvlTexts.length - 1}
                      onEdit={() => { setEditTarget(text); setShowModal(true) }}
                      onDelete={() => handleDelete(text.id)}
                      onMoveUp={() => handleReorder(text.id, 'up')}
                      onMoveDown={() => handleReorder(text.id, 'down')}
                      reordering={reordering}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── مودال الإضافة / التعديل ── */}
      {showModal && (
        <TextModal
          key={editTarget?.id ?? 'new'}
          initial={editTarget
            ? { name_ar: editTarget.name_ar, category: editTarget.category,
                subject: editTarget.subject, type: editTarget.type,
                level_id: editTarget.level_id, total_lines: editTarget.total_lines,
                weekly_rate: editTarget.weekly_rate, order_in_level: editTarget.order_in_level,
                description: editTarget.description, is_active: editTarget.is_active }
            : { ...EMPTY_FORM }}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditTarget(null); setSaveError(null) }}
          saving={saving}
          saveError={saveError}
        />
      )}

      {/* ── Toast ── */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl flex items-center gap-2 shadow-xl"
          style={{
            background: toast.type === 'success' ? '#EAF3DE' : '#FCEBEB',
            color: toast.type === 'success' ? '#27500A' : '#791F1F',
            border: `1px solid ${toast.type === 'success' ? '#27500A' : '#791F1F'}`,
          }}>
          {toast.type === 'success'
            ? <CheckCircle2 size={16} />
            : <AlertTriangle size={16} />}
          <span className="text-sm font-medium">{toast.msg}</span>
        </div>
      )}
    </div>
  )
}
