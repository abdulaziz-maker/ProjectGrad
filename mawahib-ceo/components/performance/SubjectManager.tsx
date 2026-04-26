'use client'
/**
 * CourseDrawer — slide-in من اليمين، يدير المساقات.
 * كل مسار له toggle visibility لكل مساق + إضافة/حذف.
 *
 * (المحافظة على الاسم القديم للمكوّن للتوافق مع الـimports)
 */
import { useState } from 'react'
import { Plus, X, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type {
  ReportSubject, SubjectColumnsKind, SubjectTrack,
} from '@/lib/performance/types'
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

const TRACK_COLOR = {
  educational: '#5D4256',
  academic:    '#356B6E',
} as const

const TRACK_KEYS: SubjectTrack[] = ['educational', 'academic']

export default function SubjectManager({
  subjects, hiddenIds, onToggleHidden, onCreate, onDelete, canManage, onClose,
}: Props) {
  const [addingTo, setAddingTo] = useState<SubjectTrack | null>(null)
  const [newName, setNewName] = useState('')
  const [newKind, setNewKind] = useState<SubjectColumnsKind>('dual')
  const [newUnit, setNewUnit] = useState('صفحة')
  const [newSingleLabel, setNewSingleLabel] = useState('')
  const [busy, setBusy] = useState(false)

  const submitNew = async () => {
    if (!addingTo || !newName.trim()) {
      toast.error('اكتب اسم المساق')
      return
    }
    setBusy(true)
    try {
      await onCreate({
        name: newName.trim(),
        track: addingTo,
        columns_kind: newKind,
        single_label: newKind === 'single' ? (newSingleLabel.trim() || newName.trim()) : null,
        unit: newUnit.trim() || null,
      })
      toast.success('أُضيف المساق')
      setNewName(''); setNewSingleLabel(''); setAddingTo(null)
    } catch {
      toast.error('تعذّر الإضافة')
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (s: ReportSubject) => {
    if (!confirm(`حذف المساق "${s.name}"؟`)) return
    try {
      await onDelete(s.id)
      toast.success('حُذف')
    } catch {
      toast.error('تعذّر الحذف')
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.40)',
        zIndex: 100, display: 'flex',
        animation: 'perf-fade 0.2s',
      }}
    >
      <style>{`
        @keyframes perf-slide-right { from { transform: translateX(-100%); } to { transform: translateX(0); } }
        @keyframes perf-fade { from { opacity: 0; } to { opacity: 1; } }
      `}</style>

      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 460, maxWidth: '100vw',
          background: 'var(--bg-card, #fff)', height: '100%',
          boxShadow: '0 0 40px rgba(0,0,0,0.20)',
          animation: 'perf-slide-right 0.3s cubic-bezier(0.2,0.8,0.3,1)',
          overflowY: 'auto', display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Drawer header */}
        <div
          style={{
            padding: '20px 24px',
            background: 'linear-gradient(135deg, #3A3D44, #1A1B20)',
            color: '#fff', position: 'relative', overflow: 'hidden',
          }}
        >
          <svg style={{ position: 'absolute', inset: 0, opacity: 0.18 }} preserveAspectRatio="none" viewBox="0 0 400 200">
            <g stroke="#fff" strokeWidth="0.8" fill="none">
              <ellipse cx="350" cy="170" rx="80" ry="50" />
              <ellipse cx="350" cy="170" rx="130" ry="80" />
              <ellipse cx="350" cy="170" rx="180" ry="110" />
              <path d="M-50 50 Q 100 70 200 40 T 450 90" />
            </g>
          </svg>
          <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 11, opacity: 0.85, fontWeight: 600, letterSpacing: '0.06em', marginBottom: 6 }}>
                إعدادات اللوحة
              </div>
              <h2 style={{
                fontFamily: 'var(--font-noto-kufi), sans-serif',
                margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em',
              }}>
                إدارة المساقات
              </h2>
              <div style={{ fontSize: 12, opacity: 0.85, marginTop: 6 }}>
                أضف، أخفِ، أو احذف المساقات لكل مسار
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.3)',
                color: '#fff', width: 30, height: 30, borderRadius: 9, cursor: 'pointer',
                fontSize: 14, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              title="إغلاق"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tracks */}
        <div style={{ padding: 18, flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {TRACK_KEYS.map(trackKey => {
            const trackSubjects = subjects.filter(s => s.track === trackKey)
            const trackColor = TRACK_COLOR[trackKey]
            const visibleCount = trackSubjects.filter(s => !hiddenIds.has(s.id)).length
            return (
              <div
                key={trackKey}
                style={{
                  border: '1px solid var(--border-soft)',
                  borderRadius: 14, overflow: 'hidden',
                }}
              >
                {/* Track header */}
                <div
                  style={{
                    background: `linear-gradient(180deg, ${trackColor}18, ${trackColor}06)`,
                    padding: '12px 16px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    borderBottom: '1px solid var(--border-soft)',
                  }}
                >
                  <div>
                    <div style={{
                      fontFamily: 'var(--font-noto-kufi), sans-serif',
                      fontSize: 13.5, fontWeight: 700, color: trackColor,
                    }}>
                      {TRACK_LABEL[trackKey]}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      {visibleCount} مساق ظاهر من {trackSubjects.length}
                    </div>
                  </div>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => setAddingTo(addingTo === trackKey ? null : trackKey)}
                      style={{
                        background: trackColor, color: '#fff', border: 'none',
                        padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
                        fontSize: 11.5, fontWeight: 700,
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                      }}
                    >
                      <Plus className="w-3 h-3" /> مساق
                    </button>
                  )}
                </div>

                {/* Subjects list */}
                <div style={{ padding: 6 }}>
                  {trackSubjects.length === 0 && (
                    <div style={{ padding: 14, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                      لا توجد مساقات بعد
                    </div>
                  )}
                  {trackSubjects.map(s => {
                    const isHidden = hiddenIds.has(s.id)
                    return (
                      <div
                        key={s.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '10px 12px', borderRadius: 10,
                          transition: 'background 0.15s',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-subtle)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        {/* Toggle visibility */}
                        <button
                          type="button"
                          onClick={() => onToggleHidden(s.id)}
                          style={{
                            width: 36, height: 20, borderRadius: 100,
                            background: !isHidden ? trackColor : 'var(--bg-subtle)',
                            border: 'none', cursor: 'pointer',
                            position: 'relative', flexShrink: 0,
                            transition: 'background 0.2s',
                          }}
                          title={isHidden ? 'إظهار' : 'إخفاء'}
                        >
                          <span
                            style={{
                              position: 'absolute', top: 2,
                              [!isHidden ? 'right' : 'left']: 2,
                              width: 16, height: 16, borderRadius: '50%',
                              background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                              transition: 'all 0.2s',
                            }}
                          />
                        </button>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 13, fontWeight: 600,
                              color: isHidden ? 'var(--text-muted)' : 'var(--text-primary)',
                              textDecoration: isHidden ? 'line-through' : 'none',
                              textDecorationColor: 'var(--text-muted)',
                            }}
                          >
                            {s.name}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {s.columns_kind === 'dual'
                              ? 'حفظ + مراجعة'
                              : s.columns_kind === 'single'
                                ? `عمود مفرد · ${s.single_label ?? s.name}`
                                : 'حضور'}
                            {s.unit && <> · الوحدة: {s.unit}</>}
                          </div>
                        </div>

                        {canManage && (
                          <button
                            type="button"
                            onClick={() => handleDelete(s)}
                            style={{
                              width: 28, height: 28, borderRadius: 7,
                              background: 'transparent',
                              border: '1px solid var(--border-soft)',
                              color: '#B94838', cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              flexShrink: 0,
                            }}
                            title="حذف"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    )
                  })}

                  {/* Add new subject form */}
                  {addingTo === trackKey && canManage && (
                    <div
                      style={{
                        padding: 12, marginTop: 6,
                        background: `${trackColor}10`,
                        border: `1.5px dashed ${trackColor}`,
                        borderRadius: 12,
                        display: 'flex', flexDirection: 'column', gap: 8,
                      }}
                    >
                      <input
                        autoFocus
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') submitNew()
                          if (e.key === 'Escape') setAddingTo(null)
                        }}
                        placeholder="اسم المساق (مثل: التفسير)"
                        style={{
                          padding: '10px 12px', border: '1px solid var(--border-soft)',
                          background: 'var(--bg-card, #fff)', borderRadius: 8, outline: 'none',
                          fontFamily: 'var(--font-ibm-plex), sans-serif',
                          fontSize: 13, color: 'var(--text-primary)',
                        }}
                      />
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <select
                          value={newKind}
                          onChange={(e) => setNewKind(e.target.value as SubjectColumnsKind)}
                          style={{
                            padding: '8px 10px', border: '1px solid var(--border-soft)',
                            background: 'var(--bg-card, #fff)', borderRadius: 8, outline: 'none',
                            fontSize: 12, color: 'var(--text-primary)',
                          }}
                        >
                          <option value="dual">حفظ + مراجعة</option>
                          <option value="single">عمود مفرد</option>
                          <option value="attendance">حضور</option>
                        </select>
                        <input
                          value={newUnit}
                          onChange={(e) => setNewUnit(e.target.value)}
                          placeholder="الوحدة (صفحة، حديث، يوم)"
                          style={{
                            padding: '8px 10px', border: '1px solid var(--border-soft)',
                            background: 'var(--bg-card, #fff)', borderRadius: 8, outline: 'none',
                            fontSize: 12, color: 'var(--text-primary)',
                          }}
                        />
                      </div>
                      {newKind === 'single' && (
                        <input
                          value={newSingleLabel}
                          onChange={(e) => setNewSingleLabel(e.target.value)}
                          placeholder="تسمية العمود (مثل: الورد الفردي)"
                          style={{
                            padding: '8px 10px', border: '1px solid var(--border-soft)',
                            background: 'var(--bg-card, #fff)', borderRadius: 8, outline: 'none',
                            fontSize: 12, color: 'var(--text-primary)',
                          }}
                        />
                      )}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          type="button"
                          onClick={submitNew}
                          disabled={busy}
                          style={{
                            background: trackColor, color: '#fff', border: 'none',
                            padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
                            fontSize: 12, fontWeight: 700,
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                          }}
                        >
                          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                          إضافة
                        </button>
                        <button
                          type="button"
                          onClick={() => setAddingTo(null)}
                          style={{
                            background: 'transparent', color: 'var(--text-muted)',
                            border: '1px solid var(--border-soft)',
                            padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
                            fontSize: 12, fontWeight: 600,
                          }}
                        >
                          إلغاء
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
