'use client'
import { useState, useMemo, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getStudents, type DBStudent } from '@/lib/db'
import { createCase, getActiveCaseForStudent } from '@/lib/student-cases/db'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from 'sonner'
import { X, Loader2, ShieldAlert, Search, AlertCircle } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
  /** يُستدعى بعد نجاح الإنشاء — مفيد لإعادة تحميل اللوحة. */
  onCreated?: (caseId: string) => void
}

const MIN_REASON   = 20
const MIN_PLAN     = 30

export default function NewCaseModal({ open, onClose, onCreated }: Props) {
  const { profile } = useAuth()
  const router = useRouter()

  const [students, setStudents] = useState<DBStudent[]>([])
  const [loadingStudents, setLoadingStudents] = useState(false)
  const [search, setSearch]               = useState('')
  const [selectedId, setSelectedId]       = useState<string>('')
  const [reason, setReason]               = useState('')
  const [plan, setPlan]                   = useState('')
  const [rootCause, setRootCause]         = useState('')
  const [saving, setSaving]               = useState(false)
  const [warn, setWarn]                   = useState<string | null>(null)

  // جلب الطلاب عند فتح الـmodal — RLS تفلتر تلقائياً حسب دور المستخدم
  useEffect(() => {
    if (!open) return
    setLoadingStudents(true)
    getStudents()
      .then(list => setStudents(list.filter(s => s.status === 'active' || !s.status)))
      .finally(() => setLoadingStudents(false))
  }, [open])

  // إعادة تصفية + ترتيب
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = q ? students.filter(s => s.name.toLowerCase().includes(q)) : students
    return list.slice(0, 50)   // perf — لا نعرض أكثر من 50 في الـdropdown
  }, [students, search])

  const selected = useMemo(
    () => students.find(s => s.id === selectedId) ?? null,
    [students, selectedId]
  )

  // فحص "هل للطالب حالة نشطة بالفعل؟" عند الاختيار
  useEffect(() => {
    if (!selectedId) { setWarn(null); return }
    let cancelled = false
    getActiveCaseForStudent(selectedId)
      .then(existing => {
        if (cancelled) return
        if (existing) setWarn('للطالب حالة نشطة بالفعل — التصعيد سيكون امتداداً لها.')
        else setWarn(null)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [selectedId])

  const canSubmit =
    !!profile &&
    !!selected &&
    reason.trim().length >= MIN_REASON &&
    plan.trim().length   >= MIN_PLAN

  const reset = useCallback(() => {
    setSelectedId(''); setReason(''); setPlan(''); setRootCause(''); setSearch(''); setWarn(null)
  }, [])

  const handleSubmit = async () => {
    if (!canSubmit || !selected || !profile) return
    setSaving(true)
    try {
      const newCase = await createCase({
        student_id: selected.id,
        batch_id: selected.batch_id ?? 0,
        trigger_reason: reason.trim(),
        initial_remedial_plan: plan.trim(),
        root_cause: rootCause.trim() || null,
        current_responsible_id: profile.id,
      })
      toast.success(`فُتحت حالة جديدة لـ${selected.name}`)
      reset()
      onCreated?.(newCase.id)
      onClose()
      router.push(`/student-cases/${newCase.id}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'تعذّر فتح الحالة'
      toast.error(msg.includes('duplicate') ? 'للطالب حالة نشطة بالفعل' : msg)
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-case-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(15,15,20,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[95vh] flex flex-col rounded-t-3xl sm:rounded-3xl overflow-hidden"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-soft)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--border-soft)' }}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-2xl flex items-center justify-center shrink-0"
              style={{ background: 'rgba(185,72,56,0.12)' }}>
              <ShieldAlert className="w-5 h-5" style={{ color: '#B94838' }} />
            </div>
            <div className="min-w-0">
              <h2 id="new-case-title" className="font-black text-base leading-none"
                style={{ color: 'var(--text-primary)' }}>
                فتح تصعيد جديد
              </h2>
              <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                ينتقل تلقائياً للمرحلة الأولى (المشرف)
              </p>
            </div>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-[var(--bg-elevated)]"
            aria-label="إغلاق">
            <X className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          </button>
        </header>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* اختيار الطالب */}
          <section>
            <label className="text-xs font-bold block mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              الطالب *
            </label>
            <div className="relative mb-2">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
              <input
                type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="ابحث عن طالب بالاسم..."
                className="w-full pr-9 pl-3 py-2.5 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#C08A48]/30"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
              />
            </div>
            {loadingStudents ? (
              <p className="text-xs text-center py-2" style={{ color: 'var(--text-muted)' }}>جارٍ تحميل الطلاب…</p>
            ) : filtered.length === 0 ? (
              <p className="text-xs text-center py-2" style={{ color: 'var(--text-muted)' }}>
                {search.trim() ? 'لا توجد نتائج' : 'لا يوجد طلاب نشطون في النطاق'}
              </p>
            ) : (
              <div className="max-h-44 overflow-y-auto rounded-xl"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-soft)' }}>
                {filtered.map(s => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedId(s.id)}
                    className="w-full text-right px-3 py-2 text-sm transition-colors flex items-center justify-between"
                    style={{
                      background: selectedId === s.id ? 'rgba(192,138,72,0.1)' : 'transparent',
                      color: selectedId === s.id ? 'var(--accent-warm)' : 'var(--text-primary)',
                      fontWeight: selectedId === s.id ? 700 : 500,
                      borderBottom: '1px solid var(--border-faint)',
                    }}
                  >
                    <span className="truncate">{s.name}</span>
                    <span className="text-[10px] opacity-70 shrink-0 mr-2">دفعة {s.batch_id}</span>
                  </button>
                ))}
              </div>
            )}
            {warn && (
              <div className="mt-2 flex items-start gap-2 p-2.5 rounded-xl"
                style={{ background: 'rgba(192,138,72,0.08)', border: '1px solid rgba(192,138,72,0.3)' }}>
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#a16207' }} />
                <p className="text-xs" style={{ color: '#a16207' }}>{warn}</p>
              </div>
            )}
          </section>

          {/* سبب التصعيد */}
          <section>
            <label className="text-xs font-bold block mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              سبب التصعيد * <span className="opacity-60">(20 حرفاً على الأقل)</span>
            </label>
            <textarea
              value={reason} onChange={e => setReason(e.target.value)} rows={3}
              placeholder="اشرح لماذا يحتاج هذا الطالب تصعيداً..."
              className="w-full px-3 py-2.5 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#C08A48]/30 resize-none"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
            />
            <p className="text-[10px] mt-1 text-end" style={{
              color: reason.trim().length >= MIN_REASON ? '#16a34a' : 'var(--text-muted)',
            }}>
              {reason.trim().length} / {MIN_REASON}
            </p>
          </section>

          {/* الخطة العلاجية */}
          <section>
            <label className="text-xs font-bold block mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              الخطة العلاجية الأولية * <span className="opacity-60">(30 حرفاً على الأقل)</span>
            </label>
            <textarea
              value={plan} onChange={e => setPlan(e.target.value)} rows={4}
              placeholder="ما الخطوات التي ستُطبَّق مع الطالب؟ (تواصل مع ولي الأمر، جلسة فردية، إلخ)"
              className="w-full px-3 py-2.5 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#C08A48]/30 resize-none"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
            />
            <p className="text-[10px] mt-1 text-end" style={{
              color: plan.trim().length >= MIN_PLAN ? '#16a34a' : 'var(--text-muted)',
            }}>
              {plan.trim().length} / {MIN_PLAN}
            </p>
          </section>

          {/* السبب الجذري — اختياري */}
          <section>
            <label className="text-xs font-bold block mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              السبب الجذري <span className="opacity-60">(اختياري)</span>
            </label>
            <input
              type="text" value={rootCause} onChange={e => setRootCause(e.target.value)}
              placeholder="مثل: ظروف عائلية، صعوبة في التركيز، عدم نوم كافٍ..."
              className="w-full px-3 py-2.5 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#C08A48]/30"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
            />
          </section>
        </div>

        {/* Footer — actions */}
        <footer className="flex items-center gap-2 px-5 py-3 shrink-0"
          style={{ borderTop: '1px solid var(--border-soft)', background: 'var(--bg-elevated)' }}>
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-soft)', color: 'var(--text-secondary)' }}>
            إلغاء
          </button>
          <button onClick={handleSubmit} disabled={!canSubmit || saving}
            className="flex-[2] py-2.5 rounded-xl text-sm font-bold text-white transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            style={{ background: canSubmit ? 'var(--accent-warm)' : 'var(--bg-card)' }}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldAlert className="w-4 h-4" />}
            فتح الحالة
          </button>
        </footer>
      </div>
    </div>
  )
}
