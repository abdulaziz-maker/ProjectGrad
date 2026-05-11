'use client'
import { useState } from 'react'
import { X, Sparkles, Save, AlertTriangle, Lightbulb } from 'lucide-react'
import { toast } from 'sonner'
import { createCase, addCaseAction } from '@/lib/student-cases/db'

interface Props {
  studentId: string
  studentName: string
  batchId: number
  supervisorAuthId?: string | null
  triggerReason: string  // مثال: "تأخر بـ12 وجه عن المفترض"
  onCreated: (caseId: string) => void
  onClose: () => void
}

const PLAN_SUGGESTIONS = [
  'تخفيض المقدار اليومي مؤقتاً مع زيادة المراجعة',
  'جلسة تحفيز فردية + تواصل ولي الأمر',
  'تخصيص جلسة مراجعة مكثفة كل يومين',
  'تحديد شريك حفظ من زملائه + متابعة يومية',
]

export default function RemedialPlanModal({
  studentId, studentName, batchId, supervisorAuthId, triggerReason, onCreated, onClose,
}: Props) {
  const [plan, setPlan] = useState('')
  const [rootCause, setRootCause] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (plan.trim().length < 30) {
      toast.error('الخطة العلاجية يجب أن تكون ٣٠ حرفاً على الأقل (تفصيل الإجراء)')
      return
    }
    setSaving(true)
    try {
      const newCase = await createCase({
        student_id: studentId,
        batch_id: batchId,
        trigger_reason: triggerReason,
        initial_remedial_plan: plan.trim(),
        root_cause: rootCause.trim() || null,
        current_responsible_id: supervisorAuthId ?? null,
      })
      // أضف action "خطة علاجية" يحوي تفاصيل الخطة
      if (supervisorAuthId) {
        await addCaseAction({
          case_id: newCase.id,
          actor_id: supervisorAuthId,
          action_type: 'plan_adjustment',
          description: plan.trim(),
          outcome: 'تم بدء الخطة العلاجية',
        })
      }
      toast.success('تم بدء الخطة العلاجية وفتح حالة للطالب')
      onCreated(newCase.id)
      onClose()
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
            <h3 className="font-black text-base">بدء خطة علاجية للطالب</h3>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* معلومات الطالب */}
          <div className="rounded-xl p-3 flex items-center gap-3"
            style={{ background: 'rgba(192,138,72,0.10)', border: '1px solid rgba(192,138,72,0.30)' }}>
            <AlertTriangle className="w-5 h-5 flex-shrink-0" style={{ color: '#8a5e1a' }} />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>{studentName}</p>
              <p className="text-xs mt-0.5" style={{ color: '#8a5e1a' }}>{triggerReason}</p>
            </div>
          </div>

          {/* السبب الجذري (اختياري) */}
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              السبب الجذري للتأخر <span className="text-[10px] opacity-60">(اختياري)</span>
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

          {/* الخطة العلاجية */}
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              الخطة العلاجية المقترحة
              <span className="text-[10px] mr-2" style={{ color: '#B26A64' }}>* إلزامي ≥٣٠ حرف</span>
            </label>
            <textarea
              value={plan}
              onChange={e => setPlan(e.target.value)}
              placeholder="فصّل خطوات الخطة العلاجية والإجراءات التي ستتخذها مع الطالب..."
              rows={5}
              className="w-full px-3 py-2 text-sm rounded-lg border resize-none"
              style={{ background: 'var(--bg-body)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
            />
            <div className="flex items-center justify-between mt-1">
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                <Lightbulb className="w-3 h-3 inline ml-1" />
                اقتراحات سريعة بالأسفل
              </p>
              <p className="text-[10px] font-mono" style={{ color: plan.length >= 30 ? '#5A8F67' : '#B26A64' }}>
                {plan.length} / ٣٠
              </p>
            </div>

            {/* اقتراحات سريعة */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {PLAN_SUGGESTIONS.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setPlan(prev => prev ? `${prev}\n${s}` : s)}
                  className="text-[10px] px-2 py-1 rounded-full font-medium transition-colors"
                  style={{
                    background: 'rgba(53,107,110,0.08)',
                    color: 'var(--accent-teal)',
                    border: '1px solid rgba(53,107,110,0.20)',
                  }}
                >
                  + {s}
                </button>
              ))}
            </div>
          </div>

          {/* تنبيه */}
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg text-[11px]"
            style={{ background: 'rgba(53,107,110,0.06)', color: 'var(--accent-teal)' }}>
            <span className="text-base leading-none">ℹ️</span>
            <span>
              ستُنشأ <strong>حالة</strong> للطالب بمرحلة المشرف. لو لم يلتزم الطالب وتأخّر مرة ثانية، ستظهر لك خيار <strong>رفع التصعيد</strong> لمدير الدفعة.
            </span>
          </div>

          {/* أزرار */}
          <div className="flex gap-2 justify-end pt-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-sm rounded-lg font-semibold disabled:opacity-50"
              style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
            >
              إلغاء
            </button>
            <button
              onClick={handleSave}
              disabled={saving || plan.trim().length < 30}
              className="px-4 py-2 text-sm rounded-lg font-semibold text-white disabled:opacity-50 flex items-center gap-1.5"
              style={{ background: 'linear-gradient(135deg, #f59e0b, #ea580c)' }}
            >
              {saving ? (
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              بدء الخطة وفتح الحالة
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
