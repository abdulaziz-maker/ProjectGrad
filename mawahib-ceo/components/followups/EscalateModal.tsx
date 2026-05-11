'use client'
import { useState } from 'react'
import { X, ArrowUp, Save, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { escalateCase, addCaseAction } from '@/lib/student-cases/db'
import type { StudentCase, CaseStage } from '@/lib/student-cases/types'

interface Props {
  caseRecord: StudentCase
  studentName: string
  actorAuthId?: string | null
  onEscalated: () => void
  onClose: () => void
}

const STAGE_FLOW: Partial<Record<CaseStage, { next: CaseStage; nextLabel: string; description: string; cta: string; bg: string }>> = {
  stage_1_supervisor: {
    next: 'stage_2_batch_manager',
    nextLabel: 'مدير الدفعة',
    description: 'الطالب لم يلتزم بالخطة العلاجية. التصعيد لمدير الدفعة لاتخاذ إجراءات أعلى.',
    cta: 'تصعيد لمدير الدفعة',
    bg: 'linear-gradient(135deg, #b91c1c, #991b1b)',
  },
  stage_2_batch_manager: {
    next: 'stage_3_ceo',
    nextLabel: 'المدير التنفيذي',
    description: 'إجراءات مدير الدفعة لم تُفلح. التصعيد للمدير التنفيذي للتدخل المباشر.',
    cta: 'تصعيد للمدير التنفيذي',
    bg: 'linear-gradient(135deg, #7f1d1d, #450a0a)',
  },
  stage_3_ceo: {
    next: 'stage_3_ceo',
    nextLabel: 'استدعاء ولي الأمر',
    description: 'الحالة في أعلى مرحلة. التصرف الآن: استدعاء ولي الأمر لاجتماع رسمي.',
    cta: 'استدعاء ولي الأمر',
    bg: 'linear-gradient(135deg, #450a0a, #1c0606)',
  },
}

export default function EscalateModal({ caseRecord, studentName, actorAuthId, onEscalated, onClose }: Props) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const flow = STAGE_FLOW[caseRecord.current_stage]
  const isParentSummon = caseRecord.current_stage === 'stage_3_ceo'

  async function handleEscalate() {
    if (reason.trim().length < 20) {
      toast.error('يجب توضيح سبب التصعيد (٢٠ حرف على الأقل)')
      return
    }
    setSaving(true)
    try {
      if (isParentSummon) {
        // تسجيل استدعاء ولي الأمر كـaction بدل تصعيد
        if (actorAuthId) {
          await addCaseAction({
            case_id: caseRecord.id,
            actor_id: actorAuthId,
            action_type: 'parent_meeting',
            description: reason.trim(),
            outcome: 'استدعاء ولي الأمر لاجتماع رسمي',
          })
        }
        toast.success('تم تسجيل استدعاء ولي الأمر')
      } else if (flow) {
        await escalateCase(caseRecord.id, flow.next, reason.trim(), null)
        if (actorAuthId) {
          await addCaseAction({
            case_id: caseRecord.id,
            actor_id: actorAuthId,
            action_type: 'note',
            description: `تصعيد إلى: ${flow.nextLabel} — ${reason.trim()}`,
            outcome: null,
          })
        }
        toast.success(`تم التصعيد إلى ${flow.nextLabel}`)
      }
      onEscalated()
      onClose()
    } catch (err) {
      console.error(err)
      toast.error(`فشل التصعيد: ${err instanceof Error ? err.message : ''}`)
    } finally {
      setSaving(false)
    }
  }

  if (!flow) return null

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 animate-fade-in-up">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto ring-4 ring-red-500/40">
        {/* رأس بلون قنبلة */}
        <div className="text-white p-5 flex items-center justify-between rounded-t-2xl" style={{ background: flow.bg }}>
          <div className="flex items-center gap-2">
            <ArrowUp className="w-6 h-6" strokeWidth={3} />
            <h3 className="font-black text-lg">{flow.cta}</h3>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* تنبيه */}
          <div className="rounded-xl p-3 flex items-start gap-3"
            style={{ background: 'rgba(185,72,56,0.08)', border: '1px solid rgba(185,72,56,0.30)' }}>
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#B94838' }} />
            <div>
              <p className="font-bold text-sm" style={{ color: '#B94838' }}>{studentName}</p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{flow.description}</p>
            </div>
          </div>

          {/* سبب التصعيد */}
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              {isParentSummon ? 'تفاصيل الاستدعاء' : 'سبب التصعيد'}
              <span className="text-[10px] mr-2" style={{ color: '#B26A64' }}>* إلزامي ≥٢٠ حرف</span>
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder={isParentSummon
                ? 'سبب الاستدعاء، الوقت المقترح، الإجراءات المتوقعة...'
                : 'وضّح ما الذي حدث خلال المرحلة السابقة وما تتوقعه من المرحلة التالية...'}
              rows={5}
              className="w-full px-3 py-2 text-sm rounded-lg border resize-none"
              style={{ background: 'var(--bg-body)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
            />
            <p className="text-[10px] font-mono mt-1 text-left" style={{ color: reason.length >= 20 ? '#5A8F67' : '#B26A64' }}>
              {reason.length} / ٢٠
            </p>
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
              onClick={handleEscalate}
              disabled={saving || reason.trim().length < 20}
              className="px-4 py-2 text-sm rounded-lg font-semibold text-white disabled:opacity-50 flex items-center gap-1.5"
              style={{ background: flow.bg }}
            >
              {saving ? (
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <ArrowUp className="w-3.5 h-3.5" strokeWidth={3} />
              )}
              {flow.cta}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
