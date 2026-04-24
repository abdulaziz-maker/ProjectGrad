'use client'
/**
 * CEO panorama — see every case across every batch.
 *
 * Design goal (user-approved):
 *   "التصعيد الزمني يكون مرتب وسهل وبتصميم جميل وواضح للجميع — كل حسب دفعته"
 *
 * Layout:
 *   ├─ KPI strip (stages counts)
 *   ├─ Stage-3 spotlight (cases on my desk)
 *   ├─ Timeline grouped by batch (collapsible)
 *   └─ Recently-closed gallery
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  UserCheck, Users, ShieldAlert, CheckCircle2, Lock,
  Building2, ChevronDown, ChevronUp, Clock, ExternalLink,
  AlertTriangle, TrendingUp, Sparkles,
} from 'lucide-react'
import { getCases, escalateCase, closeCase } from '@/lib/student-cases/db'
import type {
  CaseStage,
  CaseWithStudent,
} from '@/lib/student-cases/types'
import {
  STAGE_LABEL, STAGE_SHORT_LABEL, STAGE_COLOR,
  timeAgoArabic,
} from '@/lib/student-cases/format'
import type { UserProfile } from '@/lib/auth'
import CloseCaseModal from '@/components/student-cases/CloseCaseModal'

interface Props {
  profile: UserProfile
  readOnly?: boolean
}

export default function CeoBoard({ profile, readOnly }: Props) {
  const [cases, setCases] = useState<CaseWithStudent[]>([])
  const [loading, setLoading] = useState(true)
  const [collapsedBatches, setCollapsedBatches] = useState<Set<number>>(new Set())
  const [demoting, setDemoting] = useState<CaseWithStudent | null>(null)
  const [closing, setClosing] = useState<CaseWithStudent | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const all = await getCases({})  // CEO RLS: no batch filter
        if (!alive) return
        setCases(all)
      } catch (err) {
        console.error(err)
        toast.error('تعذّر تحميل الحالات')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [])

  // ─── Derived ──────────────────────────────────────────────────────
  const activeCases = useMemo(
    () => cases.filter((c) => c.status === 'active' || c.status === 'improving'),
    [cases]
  )

  const stageCounts = useMemo(() => {
    const acc: Record<CaseStage, number> = {
      stage_1_supervisor: 0, stage_2_batch_manager: 0,
      stage_3_ceo: 0, resolved: 0, closed: 0,
    }
    for (const c of cases) acc[c.current_stage] += 1
    return acc
  }, [cases])

  const spotlightStage3 = useMemo(
    () => activeCases.filter((c) => c.current_stage === 'stage_3_ceo'),
    [activeCases]
  )

  const byBatch = useMemo(() => {
    const groups = new Map<number, { name: string; cases: CaseWithStudent[] }>()
    for (const c of activeCases) {
      const name = c.batch_name ?? `دفعة ${c.batch_id}`
      if (!groups.has(c.batch_id)) groups.set(c.batch_id, { name, cases: [] })
      groups.get(c.batch_id)!.cases.push(c)
    }
    // Sort each batch's cases: stage_3 first, then stage_2, then stage_1; within stage by recency
    const stageRank: Record<CaseStage, number> = {
      stage_3_ceo: 0, stage_2_batch_manager: 1, stage_1_supervisor: 2,
      resolved: 3, closed: 4,
    }
    for (const g of groups.values()) {
      g.cases.sort((a, b) => {
        const sa = stageRank[a.current_stage]
        const sb = stageRank[b.current_stage]
        if (sa !== sb) return sa - sb
        return b.stage_entered_at.localeCompare(a.stage_entered_at)
      })
    }
    return Array.from(groups.entries())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ar'))
  }, [activeCases])

  const recentClosed = useMemo(
    () => cases
      .filter((c) => c.current_stage === 'resolved' || c.current_stage === 'closed')
      .sort((a, b) => (b.closed_at ?? '').localeCompare(a.closed_at ?? ''))
      .slice(0, 8),
    [cases]
  )

  // ─── Mutations ────────────────────────────────────────────────────
  const toggleBatch = useCallback((batchId: number) => {
    setCollapsedBatches((prev) => {
      const next = new Set(prev)
      if (next.has(batchId)) next.delete(batchId)
      else next.add(batchId)
      return next
    })
  }, [])

  const onDemote = useCallback(async (c: CaseWithStudent, reason: string) => {
    try {
      const updated = await escalateCase(c.id, 'stage_2_batch_manager', reason)
      setCases((prev) => prev.map((x) => (x.id === c.id ? { ...x, ...updated } : x)))
      setDemoting(null)
      toast.success('تمت إعادة الحالة إلى مدير الدفعة')
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
  if (loading) {
    return <div className="p-8 text-center text-[var(--text-muted)]">جارٍ تحميل لوحة المدير التنفيذي…</div>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="card-static p-6">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold mb-1 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <ShieldAlert className="size-6 text-[var(--accent-warm)]" />
              الحالات الطلابية — لوحة المدير التنفيذي
            </h1>
            <p className="text-sm text-[var(--text-muted)]">
              عرض شامل لكل الحالات النشطة عبر جميع الدفعات. الحالات عند مكتبك مُظلَّلة أعلى الصفحة.
            </p>
          </div>
          {readOnly && (
            <span className="px-3 py-1.5 rounded-full bg-slate-100 text-slate-700 text-xs border border-slate-200 inline-flex items-center gap-1">
              <Lock className="size-3.5" /> للعرض فقط
            </span>
          )}
        </div>

        <div className="mt-5 grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
          <KpiCell label="عند المشرف"     count={stageCounts.stage_1_supervisor}    icon={<UserCheck className="size-4" />}    color="sky" />
          <KpiCell label="عند مدير الدفعة" count={stageCounts.stage_2_batch_manager} icon={<Users className="size-4" />}         color="amber" />
          <KpiCell label="عندي (أنا)"     count={stageCounts.stage_3_ceo}           icon={<ShieldAlert className="size-4" />}    color="rose" highlight />
          <KpiCell label="منتهية بنجاح"   count={stageCounts.resolved}              icon={<CheckCircle2 className="size-4" />}   color="emerald" />
          <KpiCell label="مُغلقة نهائياً"  count={stageCounts.closed}                icon={<Lock className="size-4" />}           color="slate" />
        </div>
      </header>

      {/* Stage-3 spotlight */}
      {spotlightStage3.length > 0 && (
        <section className="rounded-2xl border-2 border-rose-200 bg-gradient-to-br from-rose-50 to-white p-5 shadow-sm">
          <h2 className="font-bold text-rose-900 flex items-center gap-2 mb-3">
            <ShieldAlert className="size-5" />
            حالات تحتاج قرارك — {spotlightStage3.length}
          </h2>
          <ul className="space-y-2">
            {spotlightStage3.map((c) => (
              <CeoSpotlightRow
                key={c.id}
                c={c}
                readOnly={!!readOnly}
                onDemote={() => setDemoting(c)}
                onClose={() => setClosing(c)}
              />
            ))}
          </ul>
        </section>
      )}

      {/* Batch timelines */}
      {byBatch.length === 0 ? (
        <div className="card-static p-8 text-center text-[var(--text-muted)]">
          <Sparkles className="size-8 mx-auto mb-2 text-emerald-500" />
          لا توجد حالات نشطة حالياً — كل الدفعات على المسار.
        </div>
      ) : (
        <div className="space-y-4">
          {byBatch.map((g) => {
            const collapsed = collapsedBatches.has(g.id)
            return (
              <section key={g.id} className="card-static overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleBatch(g.id)}
                  className="w-full p-4 flex items-center justify-between hover:bg-[var(--bg-hover)] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="size-10 rounded-xl bg-[var(--accent-warm)]/10 text-[var(--accent-warm)] grid place-content-center">
                      <Building2 className="size-5" />
                    </div>
                    <div className="text-right">
                      <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>
                        {g.name}
                      </h3>
                      <p className="text-xs text-[var(--text-muted)]">
                        {g.cases.length} حالة نشطة
                      </p>
                    </div>
                  </div>
                  {collapsed ? <ChevronDown className="size-5 text-[var(--text-muted)]" /> : <ChevronUp className="size-5 text-[var(--text-muted)]" />}
                </button>
                {!collapsed && (
                  <div className="border-t border-[var(--border-card)]">
                    <BatchTimeline cases={g.cases} />
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}

      {/* Recent closed */}
      {recentClosed.length > 0 && (
        <section className="card-static p-5">
          <h2 className="font-bold mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <TrendingUp className="size-4 text-emerald-600" />
            آخر الحالات المُنجزة
          </h2>
          <ul className="divide-y divide-[var(--border-card)]">
            {recentClosed.map((c) => (
              <li key={c.id} className="py-2.5 flex items-center gap-3">
                <span className={`size-2 rounded-full shrink-0 ${c.current_stage === 'resolved' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                <div className="flex-1 min-w-0">
                  <Link href={`/student-cases/${c.id}`} className="text-sm font-medium hover:underline" style={{ color: 'var(--text-primary)' }}>
                    {c.student_name}
                  </Link>
                  <p className="text-xs text-[var(--text-muted)] truncate">
                    {c.batch_name} · {c.outcome ?? '—'}
                  </p>
                </div>
                <span className="text-[11px] text-[var(--text-muted)]">
                  {c.closed_at ? timeAgoArabic(c.closed_at) : '—'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Modals */}
      {demoting && (
        <ReasonModalLite
          title={`إعادة "${demoting.student_name}" إلى مدير الدفعة`}
          confirmLabel="إعادة لمدير الدفعة"
          confirmClass="bg-amber-600 hover:bg-amber-700 text-white"
          onClose={() => setDemoting(null)}
          onConfirm={(r) => onDemote(demoting, r)}
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
function KpiCell({
  label, count, icon, color, highlight,
}: {
  label: string
  count: number
  icon: React.ReactNode
  color: 'sky' | 'amber' | 'rose' | 'emerald' | 'slate'
  highlight?: boolean
}) {
  const map: Record<string, string> = {
    sky:     'bg-sky-50 text-sky-800 border-sky-200',
    amber:   'bg-amber-50 text-amber-900 border-amber-200',
    rose:    'bg-rose-50 text-rose-800 border-rose-200',
    emerald: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    slate:   'bg-slate-50 text-slate-700 border-slate-200',
  }
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${map[color]} ${highlight ? 'ring-2 ring-rose-300' : ''}`}>
      <div className="flex items-center gap-1.5 opacity-85">
        {icon}
        <span className="text-[11px]">{label}</span>
      </div>
      <div className="text-2xl font-bold leading-tight mt-0.5">{count}</div>
    </div>
  )
}

function BatchTimeline({ cases }: { cases: CaseWithStudent[] }) {
  return (
    <ul className="relative p-4">
      <div className="absolute top-4 bottom-4 right-6 w-px bg-[var(--border-card)]" aria-hidden />
      {cases.map((c) => (
        <li key={c.id} className="relative pr-12 pl-2 py-3">
          <span className={`absolute right-5 top-5 size-3 rounded-full ring-2 ring-[var(--bg-card)] ${stageDotColor(c.current_stage)}`} />
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Link
                  href={`/student-cases/${c.id}`}
                  className="font-semibold text-sm hover:underline"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {c.student_name}
                </Link>
                <span className={`px-2 py-0.5 rounded-full border text-[10px] ${STAGE_COLOR[c.current_stage]}`}>
                  {STAGE_SHORT_LABEL[c.current_stage]}
                </span>
                <span className="text-[11px] text-[var(--text-muted)] inline-flex items-center gap-1">
                  <Clock className="size-3" />
                  {timeAgoArabic(c.stage_entered_at)}
                </span>
              </div>
              <p className="text-xs text-[var(--text-muted)] mt-1 line-clamp-2">{c.trigger_reason}</p>
            </div>
            <Link
              href={`/student-cases/${c.id}`}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--border-card)] text-xs text-[var(--text-muted)] hover:bg-[var(--bg-hover)] shrink-0"
            >
              <ExternalLink className="size-3.5" /> التفاصيل
            </Link>
          </div>
        </li>
      ))}
    </ul>
  )
}

function stageDotColor(stage: CaseStage): string {
  switch (stage) {
    case 'stage_1_supervisor':    return 'bg-sky-500'
    case 'stage_2_batch_manager': return 'bg-amber-500'
    case 'stage_3_ceo':           return 'bg-rose-500'
    case 'resolved':              return 'bg-emerald-500'
    case 'closed':                return 'bg-slate-400'
  }
}

function CeoSpotlightRow({
  c, readOnly, onDemote, onClose,
}: {
  c: CaseWithStudent
  readOnly: boolean
  onDemote: () => void
  onClose: () => void
}) {
  return (
    <li className="rounded-xl bg-white/90 border border-rose-100 p-3 flex flex-wrap items-center gap-3">
      <AlertTriangle className="size-4 text-rose-500 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Link href={`/student-cases/${c.id}`} className="font-bold text-sm hover:underline" style={{ color: 'var(--text-primary)' }}>
            {c.student_name}
          </Link>
          <span className="text-[11px] text-[var(--text-muted)]">· {c.batch_name ?? `دفعة ${c.batch_id}`}</span>
          <span className="text-[11px] text-rose-700 inline-flex items-center gap-1">
            <Clock className="size-3" />
            {timeAgoArabic(c.stage_entered_at)}
          </span>
        </div>
        <p className="text-xs text-[var(--text-muted)] mt-1 line-clamp-1">{c.trigger_reason}</p>
      </div>
      {!readOnly && (
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onDemote}
            className="px-2.5 py-1.5 rounded-lg border border-[var(--border-card)] text-xs text-amber-700 hover:bg-amber-50"
          >
            إعادة لمدير الدفعة
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700"
          >
            إغلاق
          </button>
        </div>
      )}
      <Link
        href={`/student-cases/${c.id}`}
        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--border-card)] text-xs text-[var(--text-muted)] hover:bg-[var(--bg-hover)] shrink-0"
      >
        <ExternalLink className="size-3.5" /> التفاصيل
      </Link>
    </li>
  )
}

function ReasonModalLite({
  title, confirmLabel, confirmClass, onClose, onConfirm,
}: {
  title: string
  confirmLabel: string
  confirmClass: string
  onClose: () => void
  onConfirm: (reason: string) => void
}) {
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="card-static max-w-md w-full p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{title}</h2>
        <label className="block">
          <span className="text-sm font-medium text-[var(--text-primary)] block mb-1">
            السبب <span className="text-rose-500">*</span>
          </span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="w-full rounded-xl border border-[var(--border-card)] bg-[var(--bg-input)] p-2 text-sm"
          />
        </label>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm border border-[var(--border-card)] hover:bg-[var(--bg-hover)]"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={async () => {
              if (!reason.trim()) return
              setSubmitting(true)
              try { await onConfirm(reason.trim()) } finally { setSubmitting(false) }
            }}
            disabled={submitting || !reason.trim()}
            className={`px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50 ${confirmClass}`}
          >
            {submitting ? 'جارٍ التنفيذ…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
