'use client'
/**
 * مدير المساقات — قائمة المساقات + إضافة/تعديل/حذف + إخفاء/إظهار محلي
 */
import { useState } from 'react'
import { Plus, Eye, EyeOff, Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { ReportSubject, SubjectColumnsKind, SubjectTrack } from '@/lib/performance/types'
import { TRACK_LABEL } from '@/lib/performance/format'

interface Props {
  subjects: ReportSubject[]
  hiddenIds: Set<string>
  onToggleHidden: (id: string) => void
  onCreate: (input: {
    name: string; track: SubjectTrack; columns_kind: SubjectColumnsKind
    single_label?: string | null; unit?: string | null
  }) => Promise<void>
  onDelete: (id: string) => Promise<void>
  canManage?: boolean
  onClose: () => void
}

export default function SubjectManager({
  subjects, hiddenIds, onToggleHidden, onCreate, onDelete, canManage, onClose,
}: Props) {
  const [name, setName] = useState('')
  const [track, setTrack] = useState<SubjectTrack>('academic')
  const [kind, setKind] = useState<SubjectColumnsKind>('dual')
  const [singleLabel, setSingleLabel] = useState('')
  const [unit, setUnit] = useState('صفحة')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!name.trim()) { toast.error('اكتب اسم المساق'); return }
    setBusy(true)
    try {
      await onCreate({
        name: name.trim(),
        track,
        columns_kind: kind,
        single_label: kind === 'single' ? (singleLabel.trim() || name.trim()) : null,
        unit: unit.trim() || null,
      })
      toast.success('أُضيف المساق')
      setName(''); setSingleLabel('')
    } catch {
      toast.error('تعذّر الإنشاء')
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (s: ReportSubject) => {
    if (!confirm(`حذف المساق "${s.name}"؟ ستبقى البيانات السابقة لكنه يختفي من الجداول.`)) return
    try {
      await onDelete(s.id)
      toast.success('حُذف المساق')
    } catch {
      toast.error('تعذّر الحذف')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl p-5 space-y-4 max-h-[85vh] overflow-auto"
        style={{ background: 'var(--bg-card, #fff)', border: '1px solid var(--border-soft)', boxShadow: '0 20px 50px rgba(0,0,0,0.30)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>إدارة المساقات</h3>
          <button type="button" onClick={onClose} className="text-xs px-2 py-1 rounded-lg" style={{ background: 'var(--bg-subtle)' }}>إغلاق</button>
        </div>

        {/* قائمة الموجودة */}
        <div className="space-y-2">
          {(['educational', 'academic'] as SubjectTrack[]).map(tr => {
            const subs = subjects.filter(s => s.track === tr)
            if (subs.length === 0) return null
            return (
              <div key={tr}>
                <h4 className="text-xs font-bold mb-1.5" style={{ color: 'var(--text-secondary)' }}>{TRACK_LABEL[tr]}</h4>
                <div className="space-y-1.5">
                  {subs.map(s => {
                    const hidden = hiddenIds.has(s.id)
                    return (
                      <div key={s.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg"
                        style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-soft)' }}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-semibold text-sm" style={{ color: hidden ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                            {s.name}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(192,138,72,0.12)', color: '#8B5A1E' }}>
                            {s.columns_kind === 'dual' ? 'حفظ + مراجعة'
                              : s.columns_kind === 'single' ? 'عمود مفرد'
                              : 'حضور'}
                          </span>
                          {s.unit && <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>· {s.unit}</span>}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => onToggleHidden(s.id)}
                            className="p-1.5 rounded-lg hover:bg-black/5"
                            title={hidden ? 'إظهار' : 'إخفاء أثناء التصفح'}
                          >
                            {hidden ? <EyeOff className="w-3.5 h-3.5 text-[var(--text-muted)]" /> : <Eye className="w-3.5 h-3.5 text-[var(--accent-warm)]" />}
                          </button>
                          {canManage && (
                            <button
                              type="button"
                              onClick={() => handleDelete(s)}
                              className="p-1.5 rounded-lg hover:bg-rose-100"
                              title="حذف"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {/* نموذج إضافة جديد */}
        {canManage && (
          <div className="rounded-xl p-3 space-y-2" style={{ background: 'rgba(192,138,72,0.06)', border: '1px solid rgba(192,138,72,0.20)' }}>
            <h4 className="text-xs font-bold flex items-center gap-1.5" style={{ color: '#8B5A1E' }}>
              <Plus className="w-3.5 h-3.5" /> إضافة مساق جديد
            </h4>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>الاسم</label>
                <input
                  value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="مثل: التفسير"
                  className="w-full px-2 py-1.5 text-xs rounded-lg outline-none"
                  style={{ background: 'var(--bg-card, #fff)', border: '1px solid var(--border-soft)', color: 'var(--text-primary)' }}
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>المسار</label>
                <select
                  value={track} onChange={(e) => setTrack(e.target.value as SubjectTrack)}
                  className="w-full px-2 py-1.5 text-xs rounded-lg outline-none"
                  style={{ background: 'var(--bg-card, #fff)', border: '1px solid var(--border-soft)', color: 'var(--text-primary)' }}
                >
                  <option value="academic">المسار العلمي</option>
                  <option value="educational">المسار التربوي</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>نوع الأعمدة</label>
                <select
                  value={kind} onChange={(e) => setKind(e.target.value as SubjectColumnsKind)}
                  className="w-full px-2 py-1.5 text-xs rounded-lg outline-none"
                  style={{ background: 'var(--bg-card, #fff)', border: '1px solid var(--border-soft)', color: 'var(--text-primary)' }}
                >
                  <option value="dual">حفظ + مراجعة</option>
                  <option value="single">عمود مفرد (مثل الورد)</option>
                  <option value="attendance">حضور</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>الوحدة</label>
                <input
                  value={unit} onChange={(e) => setUnit(e.target.value)}
                  placeholder="صفحة | حديث | يوم..."
                  className="w-full px-2 py-1.5 text-xs rounded-lg outline-none"
                  style={{ background: 'var(--bg-card, #fff)', border: '1px solid var(--border-soft)', color: 'var(--text-primary)' }}
                />
              </div>
              {kind === 'single' && (
                <div className="col-span-2">
                  <label className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>تسمية العمود</label>
                  <input
                    value={singleLabel} onChange={(e) => setSingleLabel(e.target.value)}
                    placeholder="مثل: الورد الفردي"
                    className="w-full px-2 py-1.5 text-xs rounded-lg outline-none"
                    style={{ background: 'var(--bg-card, #fff)', border: '1px solid var(--border-soft)', color: 'var(--text-primary)' }}
                  />
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #C08A48, #8B5A1E)' }}
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              إنشاء المساق
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
