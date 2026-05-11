'use client'
/**
 * NewEscalationModal — رفع تصعيد جديد بدون الحاجة لمتابعة سابقة.
 *
 * المشرف يختار طالباً → يعرض النظام آخر متابعة (إن وجدت) →
 * إن مضى أكثر من 7 أيام أو لم يُتابَع، يظهر تنبيه ناعم اختياري:
 *   "ينصح بمتابعة الطالب أولاً في صفحة المتابعات لتسجيل التأخر بدقة"
 * مع زر للذهاب للمتابعات أو المتابعة في فتح الحالة مباشرة.
 */
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { X, AlertCircle, Sparkles, Save, ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { getStudents, getSupervisors, type DBStudent } from '@/lib/db'
import { createCase, addCaseAction, getActiveCaseForStudent } from '@/lib/student-cases/db'
import type { UserProfile } from '@/lib/auth'

interface Props {
  profile: UserProfile
  onCreated: () => void
  onClose: () => void
}

type Step = 'select' | 'plan'

const PLAN_SUGGESTIONS = [
  'تخفيض المقدار اليومي مؤقتاً مع زيادة المراجعة',
  'جلسة تحفيز فردية + تواصل ولي الأمر',
  'تخصيص جلسة مراجعة مكثفة كل يومين',
  'تحديد شريك حفظ من زملائه + متابعة يومية',
]

function daysSince(iso: string | null): number {
  if (!iso) return Infinity
  const a = new Date(iso + 'T00:00:00').getTime()
  const b = new Date().getTime()
  return Math.floor((b - a) / (1000 * 60 * 60 * 24))
}

export default function NewEscalationModal({ profile, onCreated, onClose }: Props) {
  const [students, setStudents] = useState<DBStudent[]>([])
  const [step, setStep] = useState<Step>('select')
  const [selectedId, setSelectedId] = useState<string>('')
  const [hasActiveCase, setHasActiveCase] = useState(false)
  const [checking, setChecking] = useState(false)
  const [trigger, setTrigger] = useState('')
  const [plan, setPlan] = useState('')
  const [rootCause, setRootCause] = useState('')
  const [saving, setSaving] = useState(false)

  // اجلب الطلاب الذين يخص المشرف الحالي
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [all, sups] = await Promise.all([getStudents(), getSupervisors()])
        if (!alive) return
        const mySup = sups.find(s => s.user_id === profile.id)
        const list = mySup
          ? all.filter(s => s.supervisor_id === mySup.id && (s.status === 'active' || !s.status))
          : []
        setStudents(list)
      } catch (err) {
        console.error(err)
        toast.error('خطأ في تحميل الطلاب')
      }
    })()
    return () => { alive = false }
  }, [profile.id])

  // افحص الحالة النشطة عند تغيّر الطالب
  useEffect(() => {
    if (!selectedId) { setHasActiveCase(false); return }
    setChecking(true)
    getActiveCaseForStudent(selectedId)
      .then(c => setHasActiveCase(!!c))
      .catch(() => setHasActiveCase(false))
      .finally(() => setChecking(false))
  }, [selectedId])

  const selectedStudent = useMemo(
    () => students.find(s => s.id === selectedId) || null,
    [students, selectedId],
  )

  const lastFollowupDays = useMemo(
    () => selectedStudent ? daysSince(selectedStudent.last_followup) : Infinity,
    [selectedStudent],
  )
  const noRecentFollowup = lastFollowupDays > 7

  async function handleProceed() {
    if (!selectedStudent) return
    if (hasActiveCase) {
      toast.error('للطالب حالة نشطة بالفعل — افتحها من قائمة الحالات')
      return
    }
    if (!trigger.trim()) {
      toast.error('اكتب سبب التصعيد')
      return
    }
    setStep('plan')
  }

  async function handleSave() {
    if (!selectedStudent) return
    if (plan.trim().length < 30) {
      toast.error('الخطة العلاجية يجب أن تكون ٣٠ حرفاً على الأقل')
      return
    }
    setSaving(true)
    try {
      const newCase = await createCase({
        student_id: selectedStudent.id,
        batch_id: selectedStudent.batch_id,
        trigger_reason: trigger.trim(),
        initial_remedial_plan: plan.trim(),
        root_cause: rootCause.trim() || null,
        current_responsible_id: profile.id,
      })
      await addCaseAction({
        case_id: newCase.id,
        actor_id: profile.id,
        action_type: 'plan_adjustment',
        description: plan.trim(),
        outcome: 'تم بدء الخطة العلاجية',
      })
      toast.success(`تم فتح حالة جديدة لـ${selectedStudent.name}`)
      onCreated()
    } catch (err) {
      console.error(err)
      toast.error(`خطأ في الحفظ: ${err instanceof Error ? err.message : ''}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 animate-fade-in-up">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* رأس */}
        <div className="sticky top-0 bg-gradient-to-r from-amber-500 to-orange-600 text-white p-4 flex items-center justify-between rounded-t-2xl">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5" />
            <h3 className="font-black text-base">
              {step === 'select' ? 'رفع تصعيد جديد' : 'الخطة العلاجية'}
            </h3>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {step === 'select' && (
            <>
              {/* اختيار الطالب */}
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  الطالب
                </label>
                <select
                  value={selectedId}
                  onChange={e => setSelectedId(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border"
                  style={{ background: 'var(--bg-body)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                >
                  <option value="">— اختر طالباً —</option>
                  {students.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {/* تنبيه: حالة نشطة */}
              {selectedStudent && hasActiveCase && (
                <div className="rounded-xl p-3 flex items-start gap-2"
                  style={{ background: 'rgba(178,106,100,0.10)', border: '1px solid rgba(178,106,100,0.30)' }}>
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#B26A64' }} />
                  <div className="text-xs" style={{ color: '#B26A64' }}>
                    <strong>للطالب حالة نشطة بالفعل.</strong> لا يمكن فتح حالة جديدة قبل إغلاق الحالية.
                  </div>
                </div>
              )}

              {/* تنبيه ناعم: لا متابعة حديثة */}
              {selectedStudent && !hasActiveCase && noRecentFollowup && (
                <div className="rounded-xl p-3"
                  style={{ background: 'rgba(192,138,72,0.10)', border: '1px solid rgba(192,138,72,0.30)' }}>
                  <div className="flex items-start gap-2 mb-2">
                    <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#8a5e1a' }} />
                    <div className="text-xs" style={{ color: '#8a5e1a' }}>
                      <strong>ينصح بمتابعة الطالب أولاً</strong>
                      {selectedStudent.last_followup
                        ? ` — آخر متابعة قبل ${lastFollowupDays} يوم`
                        : ' — لم تُسجَّل أي متابعة سابقة'}
                      {' '}في صفحة المتابعات لرصد التأخر بدقة. هذا اختياري — يمكنك المتابعة في فتح الحالة مباشرة.
                    </div>
                  </div>
                  <Link
                    href="/followups"
                    className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg"
                    style={{ background: 'rgba(192,138,72,0.20)', color: '#8a5e1a' }}
                  >
                    <ArrowLeft className="w-3 h-3" />
                    الذهاب للمتابعات
                  </Link>
                </div>
              )}

              {/* سبب التصعيد */}
              {selectedStudent && !hasActiveCase && (
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                    سبب التصعيد <span className="text-[10px]" style={{ color: '#B26A64' }}>* إلزامي</span>
                  </label>
                  <textarea
                    value={trigger}
                    onChange={e => setTrigger(e.target.value)}
                    placeholder="مثال: تأخر بأكثر من ١٥ وجه عن الخطة + عدم التزام بالحضور"
                    rows={3}
                    className="w-full px-3 py-2 text-sm rounded-lg border resize-none"
                    style={{ background: 'var(--bg-body)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                  />
                </div>
              )}

              {/* أزرار */}
              <div className="flex gap-2 justify-end pt-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm rounded-lg font-semibold"
                  style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
                >
                  إلغاء
                </button>
                <button
                  onClick={handleProceed}
                  disabled={!selectedStudent || hasActiveCase || !trigger.trim() || checking}
                  className="px-4 py-2 text-sm rounded-lg font-semibold text-white disabled:opacity-50 flex items-center gap-1.5"
                  style={{ background: 'linear-gradient(135deg, #f59e0b, #ea580c)' }}
                >
                  متابعة لإدخال الخطة
                </button>
              </div>
            </>
          )}

          {step === 'plan' && selectedStudent && (
            <>
              <div className="rounded-xl p-3 flex items-center gap-3"
                style={{ background: 'rgba(192,138,72,0.10)', border: '1px solid rgba(192,138,72,0.30)' }}>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>{selectedStudent.name}</p>
                  <p className="text-xs mt-0.5" style={{ color: '#8a5e1a' }}>{trigger}</p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  السبب الجذري <span className="text-[10px] opacity-60">(اختياري)</span>
                </label>
                <input
                  type="text"
                  value={rootCause}
                  onChange={e => setRootCause(e.target.value)}
                  placeholder="مثال: ضعف الهمة، صعوبة الحفظ، مشاكل أسرية..."
                  className="w-full px-3 py-2 text-sm rounded-lg border"
                  style={{ background: 'var(--bg-body)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  الخطة العلاجية <span className="text-[10px]" style={{ color: '#B26A64' }}>* إلزامي ≥٣٠ حرف</span>
                </label>
                <textarea
                  value={plan}
                  onChange={e => setPlan(e.target.value)}
                  placeholder="فصّل خطوات الخطة العلاجية والإجراءات..."
                  rows={5}
                  className="w-full px-3 py-2 text-sm rounded-lg border resize-none"
                  style={{ background: 'var(--bg-body)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                />
                <p className="text-[10px] font-mono mt-1 text-left" style={{ color: plan.length >= 30 ? '#5A8F67' : '#B26A64' }}>
                  {plan.length} / ٣٠
                </p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {PLAN_SUGGESTIONS.map(s => (
                    <button key={s} type="button"
                      onClick={() => setPlan(prev => prev ? `${prev}\n${s}` : s)}
                      className="text-[10px] px-2 py-1 rounded-full font-medium"
                      style={{ background: 'rgba(53,107,110,0.08)', color: 'var(--accent-teal)', border: '1px solid rgba(53,107,110,0.20)' }}
                    >
                      + {s}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  onClick={() => setStep('select')}
                  disabled={saving}
                  className="px-4 py-2 text-sm rounded-lg font-semibold"
                  style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
                >
                  ← رجوع
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || plan.trim().length < 30}
                  className="px-4 py-2 text-sm rounded-lg font-semibold text-white disabled:opacity-50 flex items-center gap-1.5"
                  style={{ background: 'linear-gradient(135deg, #f59e0b, #ea580c)' }}
                >
                  {saving ? <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  فتح الحالة
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
