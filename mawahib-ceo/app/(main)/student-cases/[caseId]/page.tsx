'use client'
/**
 * /student-cases/[caseId] — full case detail + timeline + action log.
 *
 * Layout:
 *   ├─ back-nav
 *   ├─ print-optimized header (student info, stage badge, dates)
 *   ├─ vertical timeline (transitions + actions, merged by occurred_at)
 *   ├─ add-action panel (role-gated)
 *   └─ close-case footer (manager + CEO only)
 *
 * Printing: "طباعة/تصدير PDF" uses window.print(); the page is styled
 * with @media print to look like a parent-summons document.
 */
import { use, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ArrowRight, Printer, ShieldAlert, UserCheck, Users, Lock, CheckCircle2,
  MessageSquare, Phone, ClipboardEdit, StickyNote, Handshake, Plus,
  Clock, AlertTriangle,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { STUDENT_CASES_ENABLED } from '@/lib/student-cases/flag'
import {
  getCaseWithHistory,
  addCaseAction,
  escalateCase,
  closeCase,
  getStudentWeeklyHistory,
} from '@/lib/student-cases/db'
import type {
  CaseWithHistory,
  CaseActionType,
  WeeklyReview,
} from '@/lib/student-cases/types'
import {
  STAGE_SHORT_LABEL, STAGE_COLOR,
  CASE_STATUS_LABEL, CASE_STATUS_COLOR,
  TRANSITION_LABEL,
  ACTION_LABEL,
  WEEKLY_STATUS_LABEL, WEEKLY_STATUS_COLOR,
  timeAgoArabic,
} from '@/lib/student-cases/format'
import CloseCaseModal from '@/components/student-cases/CloseCaseModal'
import CaseStageStepper from '@/components/student-cases/CaseStageStepper'

export default function CaseDetailPage({
  params,
}: {
  params: Promise<{ caseId: string }>
}) {
  const { caseId } = use(params)
  const router = useRouter()
  const { profile, loading: authLoading } = useAuth()

  const [caseData, setCaseData] = useState<CaseWithHistory | null>(null)
  const [weekly, setWeekly] = useState<WeeklyReview[]>([])
  const [loading, setLoading] = useState(true)
  const [showClose, setShowClose] = useState(false)

  // ─── Feature gate + load ──────────────────────────────────────────
  useEffect(() => {
    if (!STUDENT_CASES_ENABLED) router.replace('/dashboard')
  }, [router])

  useEffect(() => {
    if (authLoading) return
    let alive = true
    ;(async () => {
      try {
        const c = await getCaseWithHistory(caseId)
        if (!alive) return
        if (!c) {
          toast.error('لم يتم العثور على الحالة (أو ليست لديك صلاحية رؤيتها)')
          router.replace('/student-cases')
          return
        }
        setCaseData(c)
        const w = await getStudentWeeklyHistory(c.student_id, 12)
        if (alive) setWeekly(w)
      } catch (err) {
        console.error(err)
        toast.error('تعذّر تحميل الحالة')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [caseId, authLoading, router])

  // ─── Permissions ──────────────────────────────────────────────────
  const role = profile?.role ?? null
  const canAddAction = role === 'ceo' || role === 'batch_manager' || role === 'supervisor' || role === 'teacher'
  const canEscalate  = role === 'supervisor' || role === 'teacher' || role === 'batch_manager'
  const canClose     = role === 'batch_manager' || role === 'ceo'
  const canDemote    = role === 'batch_manager' || role === 'ceo'

  // Determine which escalation step is available given current stage
  const escalationTarget = useMemo(() => {
    if (!caseData) return null
    if (!canEscalate) return null
    if (role === 'supervisor' || role === 'teacher') {
      return caseData.current_stage === 'stage_1_supervisor' ? 'stage_2_batch_manager' : null
    }
    if (role === 'batch_manager') {
      return caseData.current_stage === 'stage_2_batch_manager' ? 'stage_3_ceo' : null
    }
    return null
  }, [caseData, canEscalate, role])

  const demotionTarget = useMemo(() => {
    if (!caseData) return null
    if (role === 'batch_manager' && caseData.current_stage === 'stage_2_batch_manager') {
      return 'stage_1_supervisor' as const
    }
    if (role === 'ceo' && caseData.current_stage === 'stage_3_ceo') {
      return 'stage_2_batch_manager' as const
    }
    return null
  }, [caseData, role])

  // ─── Merged timeline ──────────────────────────────────────────────
  interface TimelineEvent {
    kind: 'transition' | 'action'
    at: string
    title: string
    description: string
    icon: string
    color: string
    actorId: string | null
  }

  const timeline = useMemo<TimelineEvent[]>(() => {
    if (!caseData) return []
    const out: TimelineEvent[] = []

    for (const t of caseData.transitions) {
      out.push({
        kind: 'transition',
        at: t.transitioned_at,
        title: `${TRANSITION_LABEL[t.transition_type]} → ${STAGE_SHORT_LABEL[t.to_stage]}`,
        description: t.reason,
        icon: iconForTransition(t.transition_type),
        color: colorForStage(t.to_stage),
        actorId: t.transitioned_by,
      })
    }
    for (const a of caseData.actions) {
      out.push({
        kind: 'action',
        at: a.occurred_at,
        title: ACTION_LABEL[a.action_type],
        description: a.description + (a.outcome ? ` · النتيجة: ${a.outcome}` : ''),
        icon: iconForAction(a.action_type),
        color: 'bg-indigo-500',
        actorId: a.actor_id,
      })
    }
    out.sort((a, b) => b.at.localeCompare(a.at))
    return out
  }, [caseData])

  // ─── Mutations ────────────────────────────────────────────────────
  const onAddAction = useCallback(
    async (type: CaseActionType, description: string, outcome: string) => {
      if (!caseData || !profile) return
      try {
        const action = await addCaseAction({
          case_id: caseData.id,
          actor_id: profile.id,
          action_type: type,
          description,
          outcome: outcome || null,
        })
        setCaseData((prev) => prev ? { ...prev, actions: [action, ...prev.actions] } : prev)
        toast.success('تم تسجيل الإجراء')
      } catch (err) {
        console.error(err)
        toast.error('تعذّر تسجيل الإجراء')
      }
    },
    [caseData, profile]
  )

  const onEscalateNext = useCallback(async (reason: string) => {
    if (!caseData || !escalationTarget) return
    try {
      const updated = await escalateCase(caseData.id, escalationTarget, reason)
      // Refetch full history (transitions updated via trigger)
      const refreshed = await getCaseWithHistory(caseData.id)
      if (refreshed) setCaseData(refreshed)
      toast.success('تم التصعيد')
    } catch (err) {
      console.error(err)
      toast.error('تعذّر التصعيد')
    }
  }, [caseData, escalationTarget])

  const onDemote = useCallback(async (reason: string) => {
    if (!caseData || !demotionTarget) return
    try {
      await escalateCase(caseData.id, demotionTarget, reason)
      const refreshed = await getCaseWithHistory(caseData.id)
      if (refreshed) setCaseData(refreshed)
      toast.success('تمت الإعادة')
    } catch (err) {
      console.error(err)
      toast.error('تعذّر التنفيذ')
    }
  }, [caseData, demotionTarget])

  const onCloseCase = useCallback(async (outcome: string, kind: 'resolved' | 'closed') => {
    if (!caseData || !profile) return
    try {
      await closeCase(caseData.id, outcome, kind, profile.id)
      const refreshed = await getCaseWithHistory(caseData.id)
      if (refreshed) setCaseData(refreshed)
      setShowClose(false)
      toast.success(kind === 'resolved' ? 'تم إنهاء الحالة' : 'تم إغلاق الحالة')
    } catch (err) {
      console.error(err)
      toast.error('تعذّر الإغلاق')
    }
  }, [caseData, profile])

  // ─── UI ───────────────────────────────────────────────────────────
  if (!STUDENT_CASES_ENABLED) return null
  if (loading || authLoading) {
    return <div className="p-8 text-center text-[var(--text-muted)]">جارٍ تحميل الحالة…</div>
  }
  if (!caseData) return null

  const isTerminal = caseData.current_stage === 'resolved' || caseData.current_stage === 'closed'

  return (
    <div className="space-y-5 max-w-5xl mx-auto" id="case-print-root">
      {/* Action toolbar — hidden on print */}
      <div className="no-print flex items-center justify-between gap-3 flex-wrap">
        <Link href="/student-cases" className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:underline">
          <ArrowRight className="size-4" />
          عودة
        </Link>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--border-card)] text-sm hover:bg-[var(--bg-hover)]"
          >
            <Printer className="size-4" /> طباعة / تصدير PDF
          </button>
          {canClose && !isTerminal && (
            <button
              type="button"
              onClick={() => setShowClose(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"
            >
              <Lock className="size-4" /> إغلاق الحالة
            </button>
          )}
        </div>
      </div>

      {/* Header — printed */}
      <header className="card-static p-6 border-t-4 border-[var(--accent-warm)]">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">
              حالة طالب — تقرير تصعيد
            </p>
            <h1 className="text-3xl font-bold mt-1" style={{ color: 'var(--text-primary)' }}>
              {caseData.student_name}
            </h1>
            <div className="flex items-center gap-2 mt-2 flex-wrap text-xs text-[var(--text-muted)]">
              <span>الدفعة: {caseData.batch_name ?? caseData.batch_id}</span>
              <span>·</span>
              <span>بدأت: {new Date(caseData.started_at).toLocaleDateString('ar-SA-u-ca-islamic-umalqura', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
            </div>
          </div>
          <div className="text-left space-y-2">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium ${STAGE_COLOR[caseData.current_stage]}`}>
              {STAGE_SHORT_LABEL[caseData.current_stage]}
            </span>
            <br />
            <span className={`inline-block px-3 py-1 rounded-full border text-xs ${CASE_STATUS_COLOR[caseData.status]}`}>
              {CASE_STATUS_LABEL[caseData.status]}
            </span>
          </div>
        </div>

        {/* Hungerstation-style stage stepper */}
        <div className="mt-5">
          <CaseStageStepper
            currentStage={caseData.current_stage}
            status={caseData.status}
            startedAt={caseData.started_at}
            transitions={caseData.transitions}
            closedAt={caseData.closed_at}
          />
        </div>

        {/* الخطة العلاجية الأولية — تظهر بصرياً بارزة لمدير الدفعة والمدير التنفيذي */}
        {caseData.initial_remedial_plan && (
          <div
            className="mt-5 rounded-xl p-4"
            style={{
              background: 'linear-gradient(135deg, rgba(192,138,72,0.08), rgba(192,138,72,0.02))',
              border: '1px solid rgba(192,138,72,0.30)',
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <ClipboardEdit className="size-4" style={{ color: 'var(--accent-warm)' }} />
              <h3 className="font-bold text-sm" style={{ color: '#7A4E1E' }}>
                الخطة العلاجية الأولية — وثّقها المشرف قبل التصعيد
              </h3>
            </div>
            <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>
              {caseData.initial_remedial_plan}
            </p>
          </div>
        )}

        <dl className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5 text-sm">
          <div>
            <dt className="text-xs text-[var(--text-muted)] mb-0.5">سبب التصعيد</dt>
            <dd className="font-medium" style={{ color: 'var(--text-primary)' }}>{caseData.trigger_reason}</dd>
          </div>
          {caseData.root_cause && (
            <div>
              <dt className="text-xs text-[var(--text-muted)] mb-0.5">السبب الجذري</dt>
              <dd className="font-medium" style={{ color: 'var(--text-primary)' }}>{caseData.root_cause}</dd>
            </div>
          )}
          {caseData.outcome && (
            <div className="md:col-span-2">
              <dt className="text-xs text-[var(--text-muted)] mb-0.5">خلاصة الإغلاق</dt>
              <dd className="font-medium" style={{ color: 'var(--text-primary)' }}>{caseData.outcome}</dd>
            </div>
          )}
        </dl>
      </header>

      {/* Add action form (hidden if terminal) */}
      {canAddAction && !isTerminal && (
        <section className="card-static p-5 no-print">
          <AddActionForm onSubmit={onAddAction} role={role} />
        </section>
      )}

      {/* Action bar for escalate / demote */}
      {!isTerminal && (escalationTarget || demotionTarget) && (
        <section className="no-print card-static p-4 flex items-center justify-end gap-2 flex-wrap">
          {demotionTarget && (
            <EscalationButton
              kind="demote"
              label={`إعادة إلى ${STAGE_SHORT_LABEL[demotionTarget]}`}
              onConfirm={onDemote}
            />
          )}
          {escalationTarget && (
            <EscalationButton
              kind="escalate"
              label={`تصعيد إلى ${STAGE_SHORT_LABEL[escalationTarget]}`}
              onConfirm={onEscalateNext}
            />
          )}
        </section>
      )}

      {/* Timeline */}
      <section className="card-static p-5">
        <h2 className="font-bold text-lg mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <Clock className="size-5 text-[var(--accent-warm)]" />
          مسار الحالة
        </h2>
        {timeline.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)] py-4 text-center">لا توجد أحداث بعد.</p>
        ) : (
          <ol className="relative pr-8">
            <div className="absolute top-1 bottom-1 right-3 w-0.5 bg-[var(--border-card)]" aria-hidden />
            {timeline.map((ev, i) => (
              <li key={i} className="relative pb-5 last:pb-0">
                <span className={`absolute right-[-4px] top-1 size-4 rounded-full ring-4 ring-[var(--bg-card)] ${ev.color}`} />
                <div className="pr-5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                      {ev.title}
                    </h3>
                    <span className="text-xs text-[var(--text-muted)]">· {timeAgoArabic(ev.at)}</span>
                    <span className="text-[11px] text-[var(--text-muted)]">
                      {new Date(ev.at).toLocaleString('ar-SA-u-ca-islamic-umalqura', { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </span>
                  </div>
                  {ev.description && (
                    <p className="text-sm text-[var(--text-muted)] mt-1 whitespace-pre-wrap leading-relaxed">
                      {ev.description}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Weekly review history */}
      {weekly.length > 0 && (
        <section className="card-static p-5">
          <h2 className="font-bold text-lg mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <AlertTriangle className="size-5 text-amber-500" />
            المتابعات الأسبوعية السابقة
          </h2>
          <ul className="divide-y divide-[var(--border-card)]">
            {weekly.map((w) => (
              <li key={w.id} className="py-2.5 flex items-center gap-3">
                <span className={`shrink-0 px-2 py-0.5 rounded-full border text-[10px] ${WEEKLY_STATUS_COLOR[w.status]}`}>
                  {WEEKLY_STATUS_LABEL[w.status]}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                    {w.hijri_week_label}
                  </p>
                  {w.notes && <p className="text-[11px] text-[var(--text-muted)] line-clamp-1">{w.notes}</p>}
                </div>
                {w.parent_contacted && (
                  <span className="text-[10px] text-emerald-700 inline-flex items-center gap-0.5">
                    <Phone className="size-3" />
                    تواصل مع ولي الأمر
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Print footer — signatures */}
      <div className="hidden print:block mt-8 grid grid-cols-3 gap-6 text-sm">
        <div className="border-t-2 border-black pt-2">المشرف</div>
        <div className="border-t-2 border-black pt-2">مدير الدفعة</div>
        <div className="border-t-2 border-black pt-2">المدير التنفيذي</div>
      </div>

      {/* Close modal */}
      {showClose && (
        <CloseCaseModal
          studentName={caseData.student_name}
          onClose={() => setShowClose(false)}
          onConfirm={onCloseCase}
        />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════════
// StageProgress was replaced by CaseStageStepper (Hungerstation-style)

function AddActionForm({
  onSubmit, role,
}: {
  onSubmit: (type: CaseActionType, description: string, outcome: string) => Promise<void>
  role: string | null
}) {
  // الإجراءات المتاحة لكل دور
  // - استدعاء/اجتماع ولي الأمر + تدخل التنفيذي = للـCEO فقط (حسب البرومبت)
  const allowedActions: CaseActionType[] = (() => {
    if (role === 'ceo') return ['supervisor_meeting', 'parent_call', 'parent_meeting', 'ceo_intervention', 'plan_adjustment', 'note']
    if (role === 'batch_manager' || role === 'records_officer') return ['supervisor_meeting', 'plan_adjustment', 'note']
    // المشرف/المعلم: محدود
    return ['supervisor_meeting', 'plan_adjustment', 'note']
  })()
  const [type, setType] = useState<CaseActionType>(allowedActions[0] ?? 'supervisor_meeting')
  const [description, setDescription] = useState('')
  const [outcome, setOutcome] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async () => {
    if (!description.trim()) {
      toast.error('اكتب وصف الإجراء')
      return
    }
    setSubmitting(true)
    try {
      await onSubmit(type, description.trim(), outcome.trim())
      setDescription('')
      setOutcome('')
    } finally {
      setSubmitting(false)
    }
  }

  const actionIcons: Record<CaseActionType, React.ReactNode> = {
    supervisor_meeting: <Users className="size-4" />,
    parent_call:        <Phone className="size-4" />,
    parent_meeting:     <Handshake className="size-4" />,
    ceo_intervention:   <ShieldAlert className="size-4" />,
    plan_adjustment:    <ClipboardEdit className="size-4" />,
    note:               <StickyNote className="size-4" />,
  }

  return (
    <div>
      <h3 className="font-bold text-base mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
        <Plus className="size-4 text-[var(--accent-warm)]" />
        إضافة إجراء
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3">
        {allowedActions.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs ${
              type === t
                ? 'bg-[var(--accent-warm)]/10 border-[var(--accent-warm)] text-[var(--accent-warm)] font-semibold'
                : 'border-[var(--border-card)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            {actionIcons[t]}
            {ACTION_LABEL[t]}
          </button>
        ))}
      </div>
      <label className="block mb-2">
        <span className="text-sm font-medium block mb-1">الوصف</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="ماذا حدث؟"
          className="w-full rounded-xl border border-[var(--border-card)] bg-[var(--bg-input)] p-2 text-sm"
        />
      </label>
      <label className="block mb-3">
        <span className="text-sm font-medium block mb-1">النتيجة (اختياري)</span>
        <input
          type="text"
          value={outcome}
          onChange={(e) => setOutcome(e.target.value)}
          placeholder="مثل: وافق ولي الأمر على زيارة…"
          className="w-full rounded-xl border border-[var(--border-card)] bg-[var(--bg-input)] p-2 text-sm"
        />
      </label>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={submit}
          disabled={submitting || !description.trim()}
          className="btn-primary text-sm px-4 py-2 disabled:opacity-50"
        >
          {submitting ? 'جارٍ التسجيل…' : 'تسجيل الإجراء'}
        </button>
      </div>
    </div>
  )
}

function EscalationButton({
  kind, label, onConfirm,
}: {
  kind: 'escalate' | 'demote'
  label: string
  onConfirm: (reason: string) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async () => {
    if (!reason.trim()) return
    setSubmitting(true)
    try {
      await onConfirm(reason.trim())
      setOpen(false)
      setReason('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold ${
          kind === 'escalate' ? 'bg-rose-600 text-white hover:bg-rose-700' : 'bg-sky-600 text-white hover:bg-sky-700'
        }`}
      >
        {kind === 'escalate' ? <ShieldAlert className="size-4" /> : <UserCheck className="size-4" />}
        {label}
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="card-static max-w-md w-full p-6 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{label}</h2>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="اكتب السبب."
              className="w-full rounded-xl border border-[var(--border-card)] bg-[var(--bg-input)] p-2 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 rounded-xl text-sm border border-[var(--border-card)] hover:bg-[var(--bg-hover)]">
                إلغاء
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={submitting || !reason.trim()}
                className={`px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50 ${
                  kind === 'escalate' ? 'bg-rose-600 text-white hover:bg-rose-700' : 'bg-sky-600 text-white hover:bg-sky-700'
                }`}
              >
                {submitting ? 'جارٍ التنفيذ…' : 'تأكيد'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────
function iconForTransition(t: string) {
  // Returned as a CSS class string; we don't render Icon components for each event —
  // the colored dot is enough visual treatment for this page.
  return 'lucide'
}

function iconForAction(t: string) {
  return 'lucide'
}

function colorForStage(stage: string): string {
  switch (stage) {
    case 'stage_1_supervisor':    return 'bg-sky-500'
    case 'stage_2_batch_manager': return 'bg-amber-500'
    case 'stage_3_ceo':           return 'bg-rose-500'
    case 'resolved':              return 'bg-emerald-500'
    case 'closed':                return 'bg-slate-400'
    default: return 'bg-indigo-500'
  }
}
