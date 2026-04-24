'use client'
/**
 * Reusable close-case modal. Lets the user pick between two outcomes:
 *  - resolved: the student's situation improved — celebration close
 *  - closed:   the student's situation is untenable — permanent close (e.g. withdrawal)
 *
 * Both are permanent per RLS (only batch_manager + CEO can reach here).
 */
import { useState } from 'react'
import { toast } from 'sonner'
import { CheckCircle2, Lock } from 'lucide-react'

interface Props {
  studentName: string
  onClose: () => void
  onConfirm: (outcome: string, kind: 'resolved' | 'closed') => void | Promise<void>
}

export default function CloseCaseModal({ studentName, onClose, onConfirm }: Props) {
  const [kind, setKind] = useState<'resolved' | 'closed'>('resolved')
  const [outcome, setOutcome] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async () => {
    if (!outcome.trim()) {
      toast.error('اكتب خلاصة الإغلاق')
      return
    }
    setSubmitting(true)
    try {
      await onConfirm(outcome.trim(), kind)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="card-static max-w-md w-full p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Lock className="size-5 text-[var(--accent-warm)]" />
            إغلاق حالة {studentName}
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            اختر نوع الإغلاق ثم اكتب الخلاصة. لا يمكن التراجع بعد التنفيذ.
          </p>
        </header>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setKind('resolved')}
            className={`rounded-xl border p-3 text-center transition ${
              kind === 'resolved'
                ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-200'
                : 'border-[var(--border-card)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            <CheckCircle2 className="size-5 text-emerald-600 mx-auto mb-1" />
            <div className="text-sm font-semibold text-emerald-800">انتهت بنجاح</div>
            <div className="text-[11px] text-[var(--text-muted)] mt-0.5">الحالة تحسنت أو حُلّت</div>
          </button>
          <button
            type="button"
            onClick={() => setKind('closed')}
            className={`rounded-xl border p-3 text-center transition ${
              kind === 'closed'
                ? 'bg-slate-100 border-slate-300 ring-2 ring-slate-200'
                : 'border-[var(--border-card)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            <Lock className="size-5 text-slate-600 mx-auto mb-1" />
            <div className="text-sm font-semibold text-slate-800">إغلاق نهائي</div>
            <div className="text-[11px] text-[var(--text-muted)] mt-0.5">انسحاب أو قرار إداري</div>
          </button>
        </div>

        <label className="block">
          <span className="text-sm font-medium text-[var(--text-primary)] block mb-1">
            خلاصة الإغلاق <span className="text-rose-500">*</span>
          </span>
          <textarea
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
            rows={3}
            placeholder="مثل: عاد الطالب لمسار المتابعة بعد 3 أسابيع / قرر ولي الأمر الانسحاب…"
            className="w-full rounded-xl border border-[var(--border-card)] bg-[var(--bg-input)] p-2 text-sm"
          />
        </label>

        <footer className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm border border-[var(--border-card)] hover:bg-[var(--bg-hover)]"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting || !outcome.trim()}
            className={`px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50 ${
              kind === 'resolved' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-slate-700 hover:bg-slate-800 text-white'
            }`}
          >
            {submitting ? 'جارٍ التنفيذ…' : kind === 'resolved' ? 'إنهاء بنجاح' : 'إغلاق نهائي'}
          </button>
        </footer>
      </div>
    </div>
  )
}
