'use client'
/**
 * Batch manager dashboard — stage 2 owners.
 *
 * Key surface: pinned list of cases currently in stage_2_batch_manager + a
 * stage-filter bar to also view stage_1 and resolved/closed.
 * Actions: escalate to CEO, demote to supervisor, or close permanently.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  ShieldAlert, UserCheck, Users, CheckCircle2, Lock,
  ArrowLeftRight, ChevronRight, ExternalLink, AlertTriangle, Clock,
} from 'lucide-react'
import {
  getCases,
  getBatchRecentReviews,
  escalateCase,
  closeCase,
} from '@/lib/student-cases/db'
import type {
  CaseStage,
  CaseWithStudent,
  WeeklyReviewWithStudent,
} from '@/lib/student-cases/types'
import {
  STAGE_LABEL, STAGE_SHORT_LABEL, STAGE_COLOR,
  WEEKLY_STATUS_LABEL, WEEKLY_STATUS_COLOR,
  timeAgoArabic,
} from '@/lib/student-cases/format'
import type { UserProfile } from '@/lib/auth'
import CloseCaseModal from '@/components/student-cases/CloseCaseModal'

type StageFilter = 'stage_2_batch_manager' | 'stage_1_supervisor' | 'stage_3_ceo' | 'closed_or_resolved' | 'all_active'

interface Props {
  profile: UserProfile
}

export default function ManagerBoard({ profile }: Props) {
  const batchId = profile.batch_id
  const [cases, setCases] = useState<CaseWithStudent[]>([])
  const [recentReviews, setRecentReviews] = useState<WeeklyReviewWithStudent[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<StageFilter>('stage_2_batch_manager')
  const [escalating, setEscalating] = useState<CaseWithStudent | null>(null)
  const [demoting, setDemoting] = useState<CaseWithStudent | null>(null)
  const [closing, setClosing] = useState<CaseWithStudent | null>(null)

  useEffect(() => {
    if (batchId == null) return
    let alive = true
    ;(async () => {
      try {
        const [allCases, reviews] = await Promise.all([
          getCases({ batchId }),
          getBatchRecentReviews(batchId, 40),
        ])
        if (!alive) return
        setCases(allCases)
        setRecentReviews(reviews)
      } catch (err) {
        console.error(err)
        toast.error('تعذّر تحميل حالات الدفعة')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [batchId])

  // ─── Derived ──────────────────────────────────────────────────────
  const countsByStage = useMemo(() => {
    const acc: Record<CaseStage, number> = {
      stage_1_supervisor: 0, stage_2_batch_manager: 0,
      stage_3_ceo: 0, resolved: 0, closed: 0,
    }
    for (const c of cases) acc[c.current_stage] += 1
    return acc
  }, [cases])

  const filtered = useMemo(() => {
    if (filter === 'all_active') {
      return cases.filter((c) => c.status === 'active')
    }
    if (filter === 'closed_or_resolved') {
      return cases.filter((c) => c.current_stage === 'resolved' || c.current_stage === 'closed')
    }
    return cases.filter((c) => c.current_stage === filter)
  }, [cases, filter])

  // ─── Mutations ────────────────────────────────────────────────────
  const onEscalateToCeo = useCallback(async (c: CaseWithStudent, reason: string) => {
    try {
      const updated = await escalateCase(c.id, 'stage_3_ceo', reason)
      setCases((prev) => prev.map((x) => (x.id === c.id ? { ...x, ...updated } : x)))
      setEscalating(null)
      toast.success('تم التصعيد للمدير التنفيذي')
    } catch (err) {
      console.error(err)
      toast.error('تعذّر التصعيد')
    }
  }, [])

  const onDemoteToSupervisor = useCallback(async (c: CaseWithStudent, reason: string) => {
    try {
      const updated = await escalateCase(c.id, 'stage_1_supervisor', reason)
      setCases((prev) => prev.map((x) => (x.id === c.id ? { ...x, ...updated } : x)))
      setDemoting(null)
      toast.success('تمت إعادة الحالة إلى المشرف')
    } catch (err) {
      console.error(err)
      toast.error('تعذّر الإعادة')
    }
  }, [])

  const onClose = useCallback(
    async (c: CaseWithStudent, outcome: string, kind: 'resolved' | 'closed') => {
      try {
        const updated = await closeCase(c.id, outcome, kind, profile.id)
        setCases((prev) => prev.map((x) => (x.id === c.id ? { ...x, ...updated } : x)))
        setClosing(null)
        toast.success(kind === 'resolved' ? 'تم إنهاء الحالة بنجاح' : 'تم إغلاق الحالة')
      } catch (err) {
        console.error(err)
        toast.error('تعذّر الإغلاق')
      }
    },
    [profile.id]
  )

  // ─── UI ───────────────────────────────────────────────────────────
  if (batchId == null) {
    return <div className="card-static p-6 text-center">لا توجد دفعة مرتبطة بحسابك.</div>
  }
  if (loading) {
    return <div className="p-8 text-center text-[var(--text-muted)]">جارٍ تحميل لوحة الدفعة…</div>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="card-static p-6">
        <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
          الحالات الطلابية — لوحة مدير الدفعة
        </h1>
        <p className="text-sm text-[var(--text-muted)]">
          تتابع الحالات المصعّدة من المشرفين وتقرر: تصعيد للمدير التنفيذي، إعادة للمشرف، أو إغلاق نهائي.
        </p>

        <div className="mt-5 grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
          <StageKPI label="عند المشرف"  count={countsByStage.stage_1_supervisor}    color="sky"     icon={<UserCheck  className="size-4" />} onClick={() => setFilter('stage_1_supervisor')} active={filter === 'stage_1_supervisor'} />
          <StageKPI label="عندي"        count={countsByStage.stage_2_batch_manager} color="amber"   icon={<Users       className="size-4" />} onClick={() => setFilter('stage_2_batch_manager')} active={filter === 'stage_2_batch_manager'} />
          <StageKPI label="عند التنفيذي" count={countsByStage.stage_3_ceo}          color="rose"    icon={<ShieldAlert className="size-4" />} onClick={() => setFilter('stage_3_ceo')}          active={filter === 'stage_3_ceo'} />
          <StageKPI label="منتهية"      count={countsByStage.resolved}              color="emerald" icon={<CheckCircle2 className="size-4" />} onClick={() => setFilter('closed_or_resolved')} active={filter === 'closed_or_resolved'} />
          <StageKPI label="النشطة كلها" count={countsByStage.stage_1_supervisor + countsByStage.stage_2_batch_manager + countsByStage.stage_3_ceo} color="slate" icon={<ArrowLeftRight className="size-4" />} onClick={() => setFilter('all_active')} active={filter === 'all_active'} />
        </div>
      </header>

      {/* Case list */}
      {filtered.length === 0 ? (
        <div className="card-static p-8 text-center text-[var(--text-muted)]">
          لا توجد حالات في هذه المرحلة حالياً.
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((c) => (
            <CaseRow
              key={c.id}
              c={c}
              canAct={c.current_stage === 'stage_2_batch_manager'}
              onEscalate={() => setEscalating(c)}
              onDemote={() => setDemoting(c)}
              onClose={() => setClosing(c)}
            />
          ))}
        </ul>
      )}

      {/* Recent weekly reviews (last 7 days, severe first) */}
      <RecentReviewsPanel reviews={recentReviews} />

      {/* Modals */}
      {escalating && (
        <ReasonModal
          title={`تصعيد "${escalating.student_name}" إلى المدير التنفيذي`}
          description="سينتقل الملف إلى المدير التنفيذي لاتخاذ قرار تنفيذي."
          confirmLabel="تصعيد للمدير التنفيذي"
          confirmClass="bg-rose-600 hover:bg-rose-700 text-white"
          icon={<ShieldAlert className="size-5 text-rose-600" />}
          onClose={() => setEscalating(null)}
          onConfirm={(reason) => onEscalateToCeo(escalating, reason)}
        />
      )}
      {demoting && (
        <ReasonModal
          title={`إعادة "${demoting.student_name}" إلى المشرف`}
          description="سيُعاد الملف إلى المشرف مع ملاحظاتك. يمكن إعادة تصعيده لاحقاً."
          confirmLabel="إعادة للمشرف"
          confirmClass="bg-sky-600 hover:bg-sky-700 text-white"
          icon={<UserCheck className="size-5 text-sky-600" />}
          onClose={() => setDemoting(null)}
          onConfirm={(reason) => onDemoteToSupervisor(demoting, reason)}
        />
      )}
      {closing && (
        <CloseCaseModal
          studentName={closing.student_name}
          onClose={() => setClosing(null)}
          onConfirm={(outcome, kind) => onClose(closing, outcome, kind)}
        />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════════
function StageKPI({
  label, count, color, icon, onClick, active,
}: {
  label: string
  count: number
  color: 'sky' | 'amber' | 'rose' | 'emerald' | 'slate'
  icon: React.ReactNode
  onClick: () => void
  active: boolean
}) {
  const map: Record<string, string> = {
    sky:     'bg-sky-50 text-sky-800 border-sky-200',
    amber:   'bg-amber-50 text-amber-900 border-amber-200',
    rose:    'bg-rose-50 text-rose-800 border-rose-200',
    emerald: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    slate:   'bg-slate-50 text-slate-700 border-slate-200',
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-3 py-2 text-left transition-all ${map[color]} ${
        active ? 'ring-2 ring-[var(--accent-warm)] scale-[1.02]' : 'hover:scale-[1.01]'
      }`}
    >
      <div className="flex items-center gap-1.5 opacity-80">
        {icon}
        <span className="text-[11px]">{label}</span>
      </div>
      <div className="text-xl font-bold leading-tight mt-0.5">{count}</div>
    </button>
  )
}

function CaseRow({
  c, canAct, onEscalate, onDemote, onClose,
}: {
  c: CaseWithStudent
  canAct: boolean
  onEscalate: () => void
  onDemote: () => void
  onClose: () => void
}) {
  return (
    <li className="card-interactive p-4 flex flex-wrap items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={`/student-cases/${c.id}`}
            className="font-bold text-base hover:underline"
            style={{ color: 'var(--text-primary)' }}
          >
            {c.student_name}
          </Link>
          <span className={`px-2 py-0.5 rounded-full border text-[10px] font-medium ${STAGE_COLOR[c.current_stage]}`}>
            {STAGE_SHORT_LABEL[c.current_stage]}
          </span>
          <span className="text-[11px] text-[var(--text-muted)] inline-flex items-center gap-1">
            <Clock className="size-3" />
            في هذه المرحلة {timeAgoArabic(c.stage_entered_at)}
          </span>
        </div>
        <p className="text-xs text-[var(--text-muted)] mt-1 line-clamp-2">
          {c.trigger_reason}
        </p>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {canAct && (
          <>
            <button
              type="button"
              onClick={onDemote}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--border-card)] text-xs text-sky-700 hover:bg-sky-50"
            >
              <UserCheck className="size-3.5" /> إعادة للمشرف
            </button>
            <button
              type="button"
              onClick={onEscalate}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700"
            >
              <ShieldAlert className="size-3.5" /> تصعيد للتنفيذي
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--border-card)] text-xs text-emerald-700 hover:bg-emerald-50"
            >
              <CheckCircle2 className="size-3.5" /> إغلاق
            </button>
          </>
        )}
        <Link
          href={`/student-cases/${c.id}`}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--border-card)] text-xs text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
        >
          <ExternalLink className="size-3.5" /> التفاصيل
        </Link>
      </div>
    </li>
  )
}

function RecentReviewsPanel({ reviews }: { reviews: WeeklyReviewWithStudent[] }) {
  const severe = reviews.filter((r) => r.status === 'severe_delay').slice(0, 10)
  if (severe.length === 0) return null
  return (
    <section className="card-static p-5">
      <h2 className="font-bold mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
        <AlertTriangle className="size-4 text-rose-600" />
        طلاب في تأخر كبير هذا الأسبوع
      </h2>
      <ul className="divide-y divide-[var(--border-card)]">
        {severe.map((r) => (
          <li key={r.id} className="py-2.5 flex items-center gap-3">
            <span className={`size-2 rounded-full bg-rose-500 shrink-0`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                {r.student_name}
              </p>
              {r.notes && <p className="text-xs text-[var(--text-muted)] line-clamp-1">{r.notes}</p>}
            </div>
            <span className={`px-2 py-0.5 rounded-full border text-[10px] ${WEEKLY_STATUS_COLOR.severe_delay}`}>
              {WEEKLY_STATUS_LABEL.severe_delay}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function ReasonModal({
  title, description, confirmLabel, confirmClass, icon, onClose, onConfirm,
}: {
  title: string
  description: string
  confirmLabel: string
  confirmClass: string
  icon: React.ReactNode
  onClose: () => void
  onConfirm: (reason: string) => void
}) {
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async () => {
    if (!reason.trim()) {
      toast.error('اكتب السبب')
      return
    }
    setSubmitting(true)
    try {
      await onConfirm(reason.trim())
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
            {icon}
            {title}
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-1">{description}</p>
        </header>
        <label className="block">
          <span className="text-sm font-medium text-[var(--text-primary)] block mb-1">
            السبب <span className="text-rose-500">*</span>
          </span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="اكتب سبباً واضحاً يُعين المسؤول التالي على اتخاذ القرار."
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
            disabled={submitting || !reason.trim()}
            className={`px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50 ${confirmClass}`}
          >
            {submitting ? 'جارٍ التنفيذ…' : confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  )
}
