'use client'
/**
 * CaseStageStepper — مسار التصعيد على نمط Hungerstation/تتبع الطلب
 *
 * المراحل:
 *   ① الطالب متعثر (تم الكشف)
 *   ② مع المشرف (المرحلة ١)
 *   ③ مع مدير الدفعة (المرحلة ٢)
 *   ④ مع المدير التنفيذي (المرحلة ٣)
 *   ⑤ تم الحل / مغلق
 *
 * كل مرحلة تظهر:
 *   - أيقونة دائرية
 *   - حالة (مكتمل ✓ / الحالي ◉ مع نبض / بانتظار ○)
 *   - تاريخ الانتقال (نسبي + هجري)
 *   - ممثّل (من قام بالتصعيد)
 *
 * يستقبل الـ transitions من قاعدة البيانات لاستخراج التواريخ الفعلية.
 */
import {
  AlertCircle, UserCheck, Users, ShieldAlert, CheckCircle2, Lock,
  Clock,
} from 'lucide-react'
import type { CaseTransition, CaseStage, CaseStatus } from '@/lib/student-cases/types'
import { STAGE_ORDER, timeAgoArabic } from '@/lib/student-cases/format'

interface Props {
  currentStage: CaseStage
  status: CaseStatus
  startedAt: string
  transitions: CaseTransition[]
  closedAt?: string | null
}

interface StepDef {
  rank: number
  key: 'opened' | 'stage_1_supervisor' | 'stage_2_batch_manager' | 'stage_3_ceo' | 'terminal'
  label: string
  short: string
  icon: React.ComponentType<{ className?: string }>
}

const STEPS: StepDef[] = [
  { rank: 0, key: 'opened',                 label: 'الطالب متعثّر',     short: 'كشف الحالة',  icon: AlertCircle },
  { rank: 1, key: 'stage_1_supervisor',     label: 'مع المشرف',          short: 'المرحلة ١',   icon: UserCheck   },
  { rank: 2, key: 'stage_2_batch_manager',  label: 'مع مدير الدفعة',     short: 'المرحلة ٢',   icon: Users       },
  { rank: 3, key: 'stage_3_ceo',            label: 'مع المدير التنفيذي', short: 'المرحلة ٣',   icon: ShieldAlert },
]

export default function CaseStageStepper({ currentStage, status, startedAt, transitions, closedAt }: Props) {
  const currentRank = STAGE_ORDER[currentStage] ?? 1
  const isClosed = currentStage === 'resolved' || currentStage === 'closed'
  const closedKind: 'resolved' | 'closed' | null =
    currentStage === 'resolved' ? 'resolved' : currentStage === 'closed' ? 'closed' : null

  // اربط كل مرحلة بتاريخ دخولها (من جدول transitions)
  // الترتيب التصاعدي حسب transitioned_at ليأخذ آخر دخول لكل to_stage
  const sortedAsc = [...transitions].sort((a, b) =>
    a.transitioned_at.localeCompare(b.transitioned_at)
  )
  const stageEnteredMap = new Map<string, string>()
  for (const t of sortedAsc) {
    if (!stageEnteredMap.has(t.to_stage)) {
      stageEnteredMap.set(t.to_stage, t.transitioned_at)
    }
  }

  // المرحلة "opened" = startedAt
  const dateForStep = (key: StepDef['key']): string | null => {
    if (key === 'opened') return startedAt
    if (key === 'terminal') return closedAt ?? null
    return stageEnteredMap.get(key) ?? null
  }

  // ─── الألوان ─────────────────────────────────────────────
  const colors = {
    completed: { bg: '#5A8F67', ring: 'rgba(90,143,103,0.25)', text: '#fff', line: '#5A8F67' },
    current:   { bg: '#C08A48', ring: 'rgba(192,138,72,0.30)', text: '#fff', line: 'transparent' },
    pending:   { bg: 'var(--bg-subtle)', ring: 'transparent',  text: 'var(--text-muted)', line: 'var(--border-soft)' },
    resolved:  { bg: '#5A8F67', ring: 'rgba(90,143,103,0.30)', text: '#fff', line: '#5A8F67' },
    closed:    { bg: '#5D4256', ring: 'rgba(93,66,86,0.30)',   text: '#fff', line: '#5D4256' },
  } as const

  type ColorState = keyof typeof colors

  const stateForStep = (s: StepDef): ColorState => {
    if (s.rank === 0) return 'completed' // الكشف دائماً مكتمل
    if (isClosed) {
      // عند الإغلاق: كل المراحل التي مرّ بها مكتملة
      const reachedThisStage = stageEnteredMap.has(s.key)
      if (reachedThisStage) return 'completed'
      return 'pending'
    }
    if (s.rank < currentRank) return 'completed'
    if (s.rank === currentRank) return 'current'
    return 'pending'
  }

  return (
    <div
      className="rounded-2xl p-5"
      style={{
        background: 'linear-gradient(135deg, rgba(192,138,72,0.04), rgba(53,107,110,0.04))',
        border: '1px solid var(--border-soft)',
      }}
    >
      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <h3 className="font-bold text-sm flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <Clock className="w-4 h-4" style={{ color: 'var(--accent-warm)' }} />
          مسار التصعيد
        </h3>
        {isClosed && closedKind && (
          <span
            className="text-[11px] font-bold px-2.5 py-1 rounded-full inline-flex items-center gap-1"
            style={{
              background: closedKind === 'resolved' ? 'rgba(90,143,103,0.12)' : 'rgba(93,66,86,0.12)',
              color: closedKind === 'resolved' ? '#3F6E4B' : '#5D4256',
              border: `1px solid ${closedKind === 'resolved' ? 'rgba(90,143,103,0.30)' : 'rgba(93,66,86,0.30)'}`,
            }}
          >
            {closedKind === 'resolved' ? <CheckCircle2 className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
            {closedKind === 'resolved' ? 'تم الحل بنجاح' : 'مغلقة بقرار'}
          </span>
        )}
      </div>

      {/* ── Stepper ── */}
      <ol className="relative grid grid-cols-4 gap-2">
        {STEPS.map((step, i) => {
          const state = stateForStep(step)
          const c = colors[state]
          const date = dateForStep(step.key)
          const Icon = step.icon
          const nextState = i < STEPS.length - 1 ? stateForStep(STEPS[i + 1]) : null
          // الخط الواصل: يكون completed-color فقط لو المرحلة التالية وُصلت
          const lineColor =
            nextState === 'completed' || nextState === 'current' ? '#C08A48' : 'var(--border-soft)'

          return (
            <li key={step.key} className="flex flex-col items-center text-center relative">
              {/* الخط الواصل للخطوة التالية — مرسوم على المحور الأفقي */}
              {i < STEPS.length - 1 && (
                <div
                  className="absolute top-5 left-[-50%] right-[50%] h-0.5 z-0 transition-colors"
                  style={{ background: lineColor }}
                  aria-hidden
                />
              )}

              {/* الدائرة */}
              <div
                className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all ${
                  state === 'current' ? 'animate-pulse-soft' : ''
                }`}
                style={{
                  background: c.bg,
                  color: c.text,
                  boxShadow: state === 'current' ? `0 0 0 6px ${c.ring}` : state === 'completed' ? `0 0 0 3px ${c.ring}` : 'none',
                }}
              >
                {state === 'completed' ? (
                  <CheckCircle2 className="w-5 h-5" />
                ) : (
                  <Icon className="w-5 h-5" />
                )}
              </div>

              {/* الاسم */}
              <p
                className="mt-2 text-[11px] font-bold leading-tight"
                style={{
                  color:
                    state === 'pending' ? 'var(--text-muted)' : 'var(--text-primary)',
                }}
              >
                {step.label}
              </p>

              {/* التاريخ */}
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {state === 'pending'
                  ? 'بانتظار'
                  : date
                  ? timeAgoArabic(date)
                  : '—'}
              </p>

              {/* badge حالة دقيقة */}
              {state === 'current' && (
                <span
                  className="mt-1 inline-block text-[9px] font-bold px-2 py-0.5 rounded-full"
                  style={{
                    background: 'rgba(192,138,72,0.18)',
                    color: '#8B5A1E',
                    border: '1px solid rgba(192,138,72,0.40)',
                  }}
                >
                  الآن
                </span>
              )}
              {state === 'completed' && step.key !== 'opened' && (
                <span
                  className="mt-1 inline-block text-[9px] font-semibold px-2 py-0.5 rounded-full"
                  style={{
                    background: 'rgba(90,143,103,0.12)',
                    color: '#3F6E4B',
                  }}
                >
                  ✓ تم
                </span>
              )}
            </li>
          )
        })}
      </ol>

      {/* خط زمني تفصيلي تحت — تواريخ هجرية */}
      <div className="mt-5 pt-4 border-t" style={{ borderColor: 'var(--border-soft)' }}>
        <div className="text-[11px] space-y-1.5" style={{ color: 'var(--text-muted)' }}>
          {sortedAsc.length === 0 ? (
            <p>الحالة فُتحت حديثاً — لا انتقالات بعد.</p>
          ) : (
            sortedAsc.map((t) => (
              <div key={t.id} className="flex items-baseline gap-2 flex-wrap">
                <span className="font-mono">●</span>
                <span style={{ color: 'var(--text-primary)' }} className="font-medium">
                  {transitionLabel(t.from_stage as CaseStage | null, t.to_stage as CaseStage)}
                </span>
                <span className="opacity-70">
                  · {new Date(t.transitioned_at).toLocaleDateString('ar-SA-u-ca-islamic-umalqura', {
                    year: 'numeric', month: 'long', day: 'numeric'
                  })}
                </span>
                {t.reason && (
                  <span className="opacity-80 truncate max-w-md" title={t.reason}>
                    — {t.reason}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function transitionLabel(from: CaseStage | null, to: CaseStage): string {
  const labelOf: Partial<Record<CaseStage, string>> = {
    stage_1_supervisor:    'المشرف',
    stage_2_batch_manager: 'مدير الدفعة',
    stage_3_ceo:           'المدير التنفيذي',
    resolved:              'الحل النهائي',
    closed:                'الإغلاق',
  }
  if (!from) return `فُتحت الحالة — انتقلت إلى ${labelOf[to] ?? to}`
  return `من ${labelOf[from] ?? from} → إلى ${labelOf[to] ?? to}`
}
