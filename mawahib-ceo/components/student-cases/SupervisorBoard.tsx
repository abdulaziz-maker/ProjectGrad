'use client'
/**
 * Supervisor weekly board — the primary action surface for stage 1.
 *
 * Layout:
 *   ├─ header (week label + KPIs)
 *   ├─ filter chips (الكل / لم يُراجع / تأخر كبير / تأخر بسيط / سير طبيعي)
 *   └─ student cards (inline status picker + notes + escalation button)
 *
 * Writes flow through lib/student-cases/db.ts. DB RLS enforces:
 *   - Supervisor sees only their own students
 *   - Supervisor can create + update stage 1 cases
 *   - Supervisor can escalate stage 1 → stage 2 (via WITH CHECK clause)
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  CheckCircle2, AlertCircle, AlertTriangle, Clock, MessageSquare,
  Phone, ShieldAlert, BookOpenCheck, ChevronDown, ChevronUp,
  Search, Filter, History,
} from 'lucide-react'
import { getStudents, getSupervisors, type DBStudent } from '@/lib/db'
import {
  getCurrentWeekReviews,
  upsertWeeklyReview,
  getActiveCaseForStudent,
  createCase,
  escalateCase,
} from '@/lib/student-cases/db'
import type {
  WeeklyReview,
  WeeklyReviewStatus,
  StudentCase,
} from '@/lib/student-cases/types'
import {
  WEEKLY_STATUS_LABEL,
  WEEKLY_STATUS_COLOR,
  WEEKLY_STATUS_DOT,
  STAGE_SHORT_LABEL,
  STAGE_COLOR,
  weekStartSunday,
  hijriWeekLabel,
  timeAgoArabic,
} from '@/lib/student-cases/format'
import type { UserProfile } from '@/lib/auth'

type Filter = 'all' | WeeklyReviewStatus

interface Props {
  profile: UserProfile
}

export default function SupervisorBoard({ profile }: Props) {
  const [students, setStudents] = useState<DBStudent[]>([])
  const [reviews, setReviews] = useState<WeeklyReview[]>([])
  const [activeCases, setActiveCases] = useState<Record<string, StudentCase>>({})
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [escalateOpen, setEscalateOpen] = useState<DBStudent | null>(null)
  // ID المشرف من جدول supervisors (نص مثل sup_rakan) — يختلف عن profile.id (UUID)
  const [mySupervisorTableId, setMySupervisorTableId] = useState<string | null>(null)

  const weekStart = useMemo(() => weekStartSunday(), [])
  const weekLabel = useMemo(() => hijriWeekLabel(weekStart), [weekStart])

  // ─── Initial load ─────────────────────────────────────────────────
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        // All supervisor's students + this-week's reviews (RLS scopes automatically)
        // students.supervisor_id يخزّن supervisors.id (نص مثل sup_rakan)
        // فلازم نجيب صف المشرف أولاً عن طريق user_id ثم نفلتر
        const [all, weekReviews, sups] = await Promise.all([
          getStudents(),
          getCurrentWeekReviews(weekStart),
          getSupervisors(),
        ])
        if (!alive) return
        const mySupRow = sups.find((sv) => sv.user_id === profile.id)
        const mySupId = mySupRow?.id ?? null
        setMySupervisorTableId(mySupId)
        const mine = mySupId ? all.filter((s) => s.supervisor_id === mySupId) : []
        setStudents(mine)
        setReviews(weekReviews)

        // Fetch any existing active cases for these students (one query each —
        // could be batched later; N is small, ≤ ~15 per supervisor)
        const casesMap: Record<string, StudentCase> = {}
        await Promise.all(
          mine.map(async (s) => {
            const c = await getActiveCaseForStudent(s.id)
            if (c) casesMap[s.id] = c
          })
        )
        if (alive) setActiveCases(casesMap)
      } catch (err) {
        console.error(err)
        toast.error('تعذّر تحميل متابعات الأسبوع')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [profile.id, weekStart])

  // ─── Derived ──────────────────────────────────────────────────────
  const reviewsByStudent = useMemo(() => {
    const map = new Map<string, WeeklyReview>()
    for (const r of reviews) map.set(r.student_id, r)
    return map
  }, [reviews])

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase()
    return students.filter((s) => {
      if (q && !s.name.toLowerCase().includes(q)) return false
      if (filter === 'all') return true
      const r = reviewsByStudent.get(s.id)
      const st: WeeklyReviewStatus = r?.status ?? 'not_reviewed'
      return st === filter
    })
  }, [students, reviewsByStudent, filter, search])

  const counts = useMemo(() => {
    const acc: Record<WeeklyReviewStatus, number> = {
      on_track: 0, slight_delay: 0, severe_delay: 0, not_reviewed: 0,
    }
    for (const s of students) {
      const r = reviewsByStudent.get(s.id)
      acc[r?.status ?? 'not_reviewed'] += 1
    }
    return acc
  }, [students, reviewsByStudent])

  // ─── Mutations ────────────────────────────────────────────────────
  const saveReview = useCallback(
    async (student: DBStudent, patch: Partial<Omit<WeeklyReview, 'id'>>) => {
      try {
        const row = await upsertWeeklyReview({
          student_id: student.id,
          batch_id: student.batch_id,
          supervisor_id: mySupervisorTableId ?? student.supervisor_id,
          week_start_date: weekStart,
          status: (patch.status ?? reviewsByStudent.get(student.id)?.status ?? 'not_reviewed') as WeeklyReviewStatus,
          notes: patch.notes ?? reviewsByStudent.get(student.id)?.notes ?? null,
          action_taken: patch.action_taken ?? reviewsByStudent.get(student.id)?.action_taken ?? null,
          parent_contacted:
            patch.parent_contacted ??
            reviewsByStudent.get(student.id)?.parent_contacted ??
            false,
        })
        setReviews((prev) => {
          const others = prev.filter((r) => r.student_id !== student.id)
          return [...others, row]
        })
        toast.success('تم الحفظ')
      } catch (err) {
        console.error(err)
        toast.error('فشل حفظ المتابعة')
      }
    },
    [mySupervisorTableId, reviewsByStudent, weekStart]
  )

  const onQuickStatus = useCallback(
    (student: DBStudent, status: WeeklyReviewStatus) => {
      return saveReview(student, { status })
    },
    [saveReview]
  )

  const onEscalate = useCallback(
    async (student: DBStudent, remedialPlan: string, reason: string, rootCause: string) => {
      try {
        const existing = activeCases[student.id]
        let caseRow: StudentCase
        const escalationReason = reason.trim() || remedialPlan.slice(0, 80)
        if (!existing) {
          // Create case at stage 1, then escalate to stage 2
          caseRow = await createCase({
            student_id: student.id,
            batch_id: student.batch_id,
            trigger_reason: escalationReason,
            initial_remedial_plan: remedialPlan,
            root_cause: rootCause || null,
          })
          caseRow = await escalateCase(caseRow.id, 'stage_2_batch_manager', escalationReason)
        } else if (existing.current_stage === 'stage_1_supervisor') {
          caseRow = await escalateCase(existing.id, 'stage_2_batch_manager', escalationReason)
        } else {
          toast.error('الحالة بالفعل في مرحلة أعلى — راجع مدير الدفعة')
          return
        }
        setActiveCases((prev) => ({ ...prev, [student.id]: caseRow }))
        // Auto-save a severe_delay review so the board reflects escalation
        await saveReview(student, {
          status: 'severe_delay',
          action_taken: `تصعيد إلى مدير الدفعة. الخطة العلاجية: ${remedialPlan}`,
        })
        setEscalateOpen(null)
        toast.success('تم تصعيد الحالة إلى مدير الدفعة')
      } catch (err) {
        console.error(err)
        toast.error('تعذّر التصعيد — ربما بسبب صلاحيات RLS')
      }
    },
    [activeCases, saveReview]
  )

  // ─── UI ───────────────────────────────────────────────────────────
  if (loading) {
    return <div className="p-8 text-center text-[var(--text-muted)]">جارٍ تحميل طلابي…</div>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="card-static p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
              المتابعة الأسبوعية لطلابي
            </h1>
            <p className="text-sm text-[var(--text-muted)]">
              {weekLabel} · يبدأ الأحد {weekStart}
            </p>
          </div>
          <div className="flex items-start gap-3 flex-wrap">
            <Link
              href="/student-cases/timeline"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl flex-shrink-0"
              style={{
                background: 'rgba(192,138,72,0.14)', color: '#8B5A1E',
                border: '1px solid rgba(192,138,72,0.30)',
              }}
            >
              🕐 متابعة تصعيداتي
            </Link>
            <div className="grid grid-cols-4 gap-2 text-center text-xs">
              <KpiPill label="سير طبيعي"  count={counts.on_track}     color="emerald" />
              <KpiPill label="تأخر بسيط"  count={counts.slight_delay} color="amber" />
              <KpiPill label="تأخر كبير"  count={counts.severe_delay} color="rose" />
              <KpiPill label="لم يُراجع"  count={counts.not_reviewed} color="slate" />
            </div>
          </div>
        </div>
      </header>

      {/* Filter toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip active={filter === 'all'}         onClick={() => setFilter('all')} label={`الكل (${students.length})`} />
        <FilterChip active={filter === 'not_reviewed'} onClick={() => setFilter('not_reviewed')} label={`لم يُراجع (${counts.not_reviewed})`} />
        <FilterChip active={filter === 'severe_delay'} onClick={() => setFilter('severe_delay')} label={`تأخر كبير (${counts.severe_delay})`} />
        <FilterChip active={filter === 'slight_delay'} onClick={() => setFilter('slight_delay')} label={`تأخر بسيط (${counts.slight_delay})`} />
        <FilterChip active={filter === 'on_track'}     onClick={() => setFilter('on_track')}     label={`سير طبيعي (${counts.on_track})`} />
        <div className="flex-1" />
        <div className="relative">
          <Search className="absolute top-1/2 -translate-y-1/2 right-3 size-4 text-[var(--text-muted)]" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث باسم الطالب…"
            className="pr-9 pl-3 py-2 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] text-sm min-w-[220px]"
          />
        </div>
      </div>

      {/* Student cards */}
      {filteredStudents.length === 0 ? (
        <div className="card-static p-8 text-center text-[var(--text-muted)]">
          لا يوجد طلاب مطابقون للفلاتر الحالية.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredStudents.map((s) => {
            const review = reviewsByStudent.get(s.id) ?? null
            const activeCase = activeCases[s.id] ?? null
            const isOpen = expanded === s.id
            return (
              <StudentReviewCard
                key={s.id}
                student={s}
                review={review}
                activeCase={activeCase}
                isOpen={isOpen}
                onToggle={() => setExpanded(isOpen ? null : s.id)}
                onQuickStatus={(status) => onQuickStatus(s, status)}
                onSaveFull={(patch) => saveReview(s, patch)}
                onEscalate={() => setEscalateOpen(s)}
              />
            )
          })}
        </div>
      )}

      {/* Escalation modal */}
      {escalateOpen && (
        <EscalateModal
          student={escalateOpen}
          existingCase={activeCases[escalateOpen.id] ?? null}
          onClose={() => setEscalateOpen(null)}
          onConfirm={(remedialPlan, reason, rootCause) => onEscalate(escalateOpen, remedialPlan, reason, rootCause)}
        />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════════

function KpiPill({ label, count, color }: { label: string; count: number; color: 'emerald' | 'amber' | 'rose' | 'slate' }) {
  const colorMap: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    amber:   'bg-amber-50 text-amber-800 border-amber-200',
    rose:    'bg-rose-50 text-rose-800 border-rose-200',
    slate:   'bg-slate-50 text-slate-700 border-slate-200',
  }
  return (
    <div className={`rounded-xl border px-3 py-2 ${colorMap[color]}`}>
      <div className="text-[11px] opacity-80">{label}</div>
      <div className="text-lg font-bold leading-tight">{count}</div>
    </div>
  )
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
        active
          ? 'bg-[var(--accent-warm)] text-white border-[var(--accent-warm)]'
          : 'bg-[var(--bg-card)] text-[var(--text-primary)] border-[var(--border-card)] hover:bg-[var(--bg-hover)]'
      }`}
    >
      {label}
    </button>
  )
}

// ─── Student review card ────────────────────────────────────────────
interface CardProps {
  student: DBStudent
  review: WeeklyReview | null
  activeCase: StudentCase | null
  isOpen: boolean
  onToggle: () => void
  onQuickStatus: (status: WeeklyReviewStatus) => Promise<void>
  onSaveFull: (patch: Partial<Omit<WeeklyReview, 'id'>>) => Promise<void>
  onEscalate: () => void
}

function StudentReviewCard({
  student, review, activeCase, isOpen, onToggle, onQuickStatus, onSaveFull, onEscalate,
}: CardProps) {
  const [notes, setNotes] = useState(review?.notes ?? '')
  const [action, setAction] = useState(review?.action_taken ?? '')
  const [parentContacted, setParentContacted] = useState(!!review?.parent_contacted)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setNotes(review?.notes ?? '')
    setAction(review?.action_taken ?? '')
    setParentContacted(!!review?.parent_contacted)
  }, [review?.notes, review?.action_taken, review?.parent_contacted])

  const status: WeeklyReviewStatus = review?.status ?? 'not_reviewed'
  const lastUpdated = review?.updated_at ? timeAgoArabic(review.updated_at) : 'لم يُراجَع بعد'

  const handleSaveAll = async () => {
    setSaving(true)
    try {
      await onSaveFull({
        status,
        notes: notes.trim() || null,
        action_taken: action.trim() || null,
        parent_contacted: parentContacted,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <article className="card-interactive p-5 flex flex-col gap-3">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`inline-block size-2.5 rounded-full ${WEEKLY_STATUS_DOT[status]}`} />
            <h3 className="font-bold text-base truncate" style={{ color: 'var(--text-primary)' }}>
              {student.name}
            </h3>
          </div>
          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] flex-wrap">
            <span className="inline-flex items-center gap-1">
              <BookOpenCheck className="size-3.5" />
              {student.juz_completed} جزء
            </span>
            <span>·</span>
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" />
              {lastUpdated}
            </span>
            {activeCase && (
              <>
                <span>·</span>
                <span className={`px-2 py-0.5 rounded-full border text-[10px] ${STAGE_COLOR[activeCase.current_stage]}`}>
                  {STAGE_SHORT_LABEL[activeCase.current_stage]}
                </span>
                <Link href={`/student-cases/${activeCase.id}`} className="text-[var(--accent-warm)] text-[11px] underline inline-flex items-center gap-0.5">
                  <History className="size-3" /> السجل
                </Link>
              </>
            )}
          </div>
        </div>
        <span className={`shrink-0 px-2.5 py-1 rounded-full border text-[11px] font-medium ${WEEKLY_STATUS_COLOR[status]}`}>
          {WEEKLY_STATUS_LABEL[status]}
        </span>
      </div>

      {/* Quick status buttons */}
      <div className="grid grid-cols-4 gap-1.5 text-xs">
        <QuickStatus icon={<CheckCircle2 className="size-4" />} label="سير طبيعي" active={status === 'on_track'}     onClick={() => onQuickStatus('on_track')} color="emerald" />
        <QuickStatus icon={<AlertCircle  className="size-4" />} label="تأخر بسيط"  active={status === 'slight_delay'} onClick={() => onQuickStatus('slight_delay')} color="amber" />
        <QuickStatus icon={<AlertTriangle className="size-4" />} label="تأخر كبير" active={status === 'severe_delay'} onClick={() => onQuickStatus('severe_delay')} color="rose" />
        <button
          type="button"
          onClick={onToggle}
          className="px-2 py-1.5 rounded-xl border text-[var(--text-muted)] border-[var(--border-card)] hover:bg-[var(--bg-hover)] inline-flex items-center justify-center gap-1"
        >
          {isOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          التفاصيل
        </button>
      </div>

      {/* تصعيد سريع — يظهر تلقائياً عند تأخر كبير ولا توجد حالة مفتوحة في مرحلة أعلى */}
      {(status === 'severe_delay' || status === 'slight_delay') &&
       (!activeCase || activeCase.current_stage === 'stage_1_supervisor') && (
        <button
          type="button"
          onClick={onEscalate}
          className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-white transition active:scale-95"
          style={{
            background: 'linear-gradient(135deg, #B94838, #8B2F23)',
            boxShadow: '0 2px 10px rgba(185,72,56,0.30)',
          }}
        >
          <ShieldAlert className="size-4" />
          {activeCase ? 'تصعيد لمدير الدفعة الآن' : 'فتح حالة + تصعيد لمدير الدفعة'}
        </button>
      )}

      {/* Expanded body */}
      {isOpen && (
        <div className="space-y-3 pt-3 border-t border-[var(--border-card)]">
          <label className="block">
            <span className="text-xs font-medium text-[var(--text-muted)] inline-flex items-center gap-1 mb-1">
              <MessageSquare className="size-3.5" /> ملاحظات
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="ما الذي لاحظته هذا الأسبوع؟"
              className="w-full rounded-xl border border-[var(--border-card)] bg-[var(--bg-input)] p-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-[var(--text-muted)] mb-1 block">
              الإجراء المتخذ
            </span>
            <textarea
              value={action}
              onChange={(e) => setAction(e.target.value)}
              rows={2}
              placeholder="ما الذي قمت به (تذكير، مراجعة، تواصل)…"
              className="w-full rounded-xl border border-[var(--border-card)] bg-[var(--bg-input)] p-2 text-sm"
            />
          </label>
          <label className="inline-flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={parentContacted}
              onChange={(e) => setParentContacted(e.target.checked)}
              className="size-4 accent-[var(--accent-warm)]"
            />
            <Phone className="size-3.5 text-[var(--text-muted)]" />
            تم التواصل مع ولي الأمر
          </label>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            <button
              type="button"
              onClick={onEscalate}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 transition-colors"
            >
              <ShieldAlert className="size-4" />
              تصعيد لمدير الدفعة
            </button>
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={saving}
              className="btn-primary text-xs px-4 py-2"
            >
              {saving ? 'جارٍ الحفظ…' : 'حفظ المتابعة'}
            </button>
          </div>
        </div>
      )}
    </article>
  )
}

function QuickStatus({
  icon, label, active, onClick, color,
}: {
  icon: React.ReactNode
  label: string
  active: boolean
  onClick: () => void
  color: 'emerald' | 'amber' | 'rose'
}) {
  const activeMap: Record<string, string> = {
    emerald: 'bg-emerald-500 text-white border-emerald-500',
    amber:   'bg-amber-500 text-white border-amber-500',
    rose:    'bg-rose-500 text-white border-rose-500',
  }
  const idleMap: Record<string, string> = {
    emerald: 'text-emerald-700 border-[var(--border-card)] hover:bg-emerald-50',
    amber:   'text-amber-700 border-[var(--border-card)] hover:bg-amber-50',
    rose:    'text-rose-700 border-[var(--border-card)] hover:bg-rose-50',
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2 py-1.5 rounded-xl border text-[11px] font-medium inline-flex items-center justify-center gap-1 transition-colors ${
        active ? activeMap[color] : `bg-[var(--bg-card)] ${idleMap[color]}`
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

// ─── Escalation modal ───────────────────────────────────────────────
function EscalateModal({
  student, existingCase, onClose, onConfirm,
}: {
  student: DBStudent
  existingCase: StudentCase | null
  onClose: () => void
  onConfirm: (remedialPlan: string, reason: string, rootCause: string) => void
}) {
  const [remedialPlan, setRemedialPlan] = useState('')
  const [reason, setReason] = useState('')
  const [rootCause, setRootCause] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const MIN_PLAN_LENGTH = 30
  const planLen = remedialPlan.trim().length
  const planValid = planLen >= MIN_PLAN_LENGTH

  const alreadyAbove = existingCase && existingCase.current_stage !== 'stage_1_supervisor'

  const submit = async () => {
    if (!planValid) {
      toast.error(`الخطة العلاجية يجب ألا تقل عن ${MIN_PLAN_LENGTH} حرف`)
      return
    }
    setSubmitting(true)
    try {
      await onConfirm(remedialPlan.trim(), reason.trim(), rootCause.trim())
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
        className="card-static max-w-lg w-full p-0 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — gradient + brand */}
        <div
          className="relative px-6 py-5 overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #B94838 0%, #8B2F23 100%)' }}
        >
          <svg
            style={{ position: 'absolute', inset: 0, opacity: 0.18, pointerEvents: 'none' }}
            preserveAspectRatio="none" viewBox="0 0 800 200"
          >
            <g stroke="#fff" strokeWidth="0.8" fill="none">
              <ellipse cx="700" cy="170" rx="80" ry="50" />
              <ellipse cx="700" cy="170" rx="130" ry="80" />
              <path d="M-50 50 Q 100 70 200 40 T 450 90 T 850 60" />
            </g>
          </svg>
          <div className="relative flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold tracking-wider uppercase mb-1" style={{ color: 'rgba(255,255,255,0.75)' }}>
                قبل التصعيد
              </div>
              <h2 className="text-lg font-bold flex items-center gap-2 text-white" style={{ fontFamily: 'var(--font-noto-kufi), serif' }}>
                <ShieldAlert className="size-5" />
                وثّق الخطة العلاجية لـ {student.name}
              </h2>
              <p className="text-[12px] mt-2" style={{ color: 'rgba(255,255,255,0.85)' }}>
                اكتب الخطة العلاجية التي طبّقتها أو تنوي تطبيقها مع الطالب قبل رفع التصعيد.
                هذه الخطة ستكون متاحة لمدير الدفعة عند مراجعته للحالة.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex-shrink-0 w-8 h-8 rounded-lg text-white inline-flex items-center justify-center"
              style={{ background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.30)' }}
            >
              ×
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {alreadyAbove ? (
            <div className="rounded-xl p-3 text-sm"
              style={{ background: 'rgba(192,138,72,0.10)', border: '1px solid rgba(192,138,72,0.30)', color: '#7A4E1E' }}>
              هذه الحالة انتقلت بالفعل إلى مرحلة أعلى — تواصل مع مدير الدفعة.
            </div>
          ) : (
            <>
              {/* الخطة العلاجية — إلزامي */}
              <label className="block">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                    الخطة العلاجية المُطبَّقة <span style={{ color: '#B94838' }}>*</span>
                  </span>
                  <span
                    className="text-[11px] font-mono font-semibold"
                    style={{
                      color: planValid ? '#3F6E4B' : planLen > 0 ? '#8B5A1E' : 'var(--text-muted)',
                    }}
                  >
                    {planLen} / {MIN_PLAN_LENGTH} حرف
                  </span>
                </div>
                <textarea
                  value={remedialPlan}
                  onChange={(e) => setRemedialPlan(e.target.value)}
                  rows={4}
                  placeholder="مثلاً: تواصلت مع الطالب لمدة أسبوعين، خصصت له جلسة فردية يوم السبت، تابعت الحفظ يومياً، تواصلت مع ولي الأمر مرتين..."
                  className="w-full rounded-xl p-3 text-sm outline-none transition-colors"
                  style={{
                    background: 'var(--bg-subtle)',
                    border: `1.5px solid ${planValid ? 'rgba(90,143,103,0.50)' : planLen > 0 ? 'rgba(192,138,72,0.50)' : 'var(--border-soft)'}`,
                    color: 'var(--text-primary)',
                    minHeight: 100,
                  }}
                />
                {!planValid && planLen > 0 && (
                  <p className="text-[11px] mt-1" style={{ color: '#8B5A1E' }}>
                    تحتاج {MIN_PLAN_LENGTH - planLen} حرف إضافي
                  </p>
                )}
              </label>

              <label className="block">
                <span className="text-sm font-medium block mb-1.5" style={{ color: 'var(--text-primary)' }}>
                  سبب التصعيد المختصر <span className="text-[10px] font-normal" style={{ color: 'var(--text-muted)' }}>(اختياري)</span>
                </span>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="مثل: تأخر ٤ أسابيع متتالية"
                  className="w-full rounded-xl p-2.5 text-sm outline-none"
                  style={{
                    background: 'var(--bg-subtle)',
                    border: '1px solid var(--border-soft)',
                    color: 'var(--text-primary)',
                  }}
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium block mb-1.5" style={{ color: 'var(--text-primary)' }}>
                  السبب الجذري <span className="text-[10px] font-normal" style={{ color: 'var(--text-muted)' }}>(اختياري — تقييمك لأصل المشكلة)</span>
                </span>
                <textarea
                  value={rootCause}
                  onChange={(e) => setRootCause(e.target.value)}
                  rows={2}
                  placeholder="مثل: ظروف صحية، انشغال أسري، فقدان دافعية..."
                  className="w-full rounded-xl p-2.5 text-sm outline-none"
                  style={{
                    background: 'var(--bg-subtle)',
                    border: '1px solid var(--border-soft)',
                    color: 'var(--text-primary)',
                  }}
                />
              </label>
            </>
          )}

          <footer className="flex justify-end gap-2 pt-2 border-t" style={{ borderColor: 'var(--border-soft)' }}>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-semibold"
              style={{ border: '1px solid var(--border-soft)', color: 'var(--text-muted)' }}
            >
              إلغاء
            </button>
            {!alreadyAbove && (
              <button
                type="button"
                onClick={submit}
                disabled={submitting || !planValid}
                className="px-5 py-2 rounded-xl text-sm font-bold text-white inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: planValid
                    ? 'linear-gradient(135deg, #B94838, #8B2F23)'
                    : 'var(--bg-subtle)',
                  boxShadow: planValid ? '0 2px 10px rgba(185,72,56,0.30)' : 'none',
                }}
              >
                <ShieldAlert className="w-4 h-4" />
                {submitting ? 'جارٍ التصعيد…' : 'رفع التصعيد'}
              </button>
            )}
          </footer>
        </div>
      </div>
    </div>
  )
}
