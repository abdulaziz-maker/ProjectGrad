'use client'
import { useState, useEffect, use, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { getStudents, getQuranPlans, getStudentJuzProgress } from '@/lib/db'
import { calculateGap } from '@/lib/quran-progress'
import {
  PROGRESS_STATUS_LABELS,
  PROGRESS_STATUS_COLORS,
  PROGRESS_STATUS_BG,
  PROGRESS_STATUS_BORDER,
  type ProgressStatus,
  getToday,
  addDays,
} from '@/lib/quran-followup'
import {
  getFarReviewProgress,
  buildFarReviewSummary,
  type FarReviewSummary,
  type FarReviewSession,
} from '@/lib/quran-far-review'
import {
  ChevronRight, Loader2, BookOpen, TrendingUp, TrendingDown,
  Minus, AlertCircle, Calendar, CheckCircle2, Circle, ChevronLeft,
} from 'lucide-react'

// ─── Helpers ──────────────────────────────────────
function toAr(n: number | null | undefined): string {
  if (n == null) return '—'
  return Math.round(n).toLocaleString('ar-EG')
}

// ─── Period presets ───────────────────────────────
type PeriodKey = 'today' | 'week' | 'month'

// ─── Progress Card (حفظ) ─────────────────────────
function MemorizationCard({
  expected, actual, gap, status, totalPages, loading,
}: {
  expected: number | null; actual: number | null; gap: number | null
  status: ProgressStatus | null; totalPages: number; loading: boolean
}) {
  const statusKey = status ?? 'no_record'
  const gapPrefix = (gap ?? 0) > 0 ? '+' : ''
  const StatusIcon =
    statusKey === 'ahead'    ? TrendingUp :
    statusKey === 'on_track' ? Minus :
    statusKey === 'behind'   ? TrendingDown : AlertCircle

  return (
    <div className="card p-4 space-y-4">
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--gold)' }} />
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>حالة الحفظ</span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-black border"
              style={{ color: PROGRESS_STATUS_COLORS[statusKey], background: PROGRESS_STATUS_BG[statusKey], borderColor: PROGRESS_STATUS_BORDER[statusKey] }}>
              <StatusIcon className="w-3.5 h-3.5" />
              {PROGRESS_STATUS_LABELS[statusKey]}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: '📍 المتوقع', value: expected !== null ? `ص ${toAr(expected)}` : '—', color: 'var(--text-primary)' },
              { label: '📝 الفعلي',  value: actual   !== null ? `ص ${toAr(actual)}`   : '—', color: 'var(--text-primary)' },
              {
                label: '⚖️ الفجوة',
                value: gap !== null ? `${gapPrefix}${toAr(gap)} ص` : '—',
                color: gap === null ? 'var(--text-muted)' : gap > 5 ? '#4ade80' : gap >= -5 ? '#facc15' : '#f87171',
              },
            ].map(item => (
              <div key={item.label} className="rounded-2xl p-3 text-center"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-soft)' }}>
                <p className="text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>{item.label}</p>
                <p className="text-base font-black leading-tight" style={{ color: item.color }}>{item.value}</p>
              </div>
            ))}
          </div>
          {totalPages > 0 && (
            <div className="flex items-center justify-between px-1">
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>محفوظ في الفترة</span>
              <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{toAr(totalPages)} صفحة</span>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Session Progress Bar ─────────────────────────
function SessionBar({ session }: { session: FarReviewSession }) {
  const pct = Math.round(session.progress * 100)
  const pagesLeft = session.totalPages - session.currentPage

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-black" style={{ color: 'var(--text-primary)' }}>
            جزء {toAr(session.juzNumber)}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-md font-bold"
            style={{ background: 'rgba(192,138,72,0.15)', color: 'var(--gold)' }}>
            ص {toAr(session.pageFrom)} – {toAr(session.pageTo)}
          </span>
        </div>
        <span className="text-xs tabular-nums font-bold"
          style={{ color: pct === 100 ? '#4ade80' : 'var(--text-secondary)' }}>
          {pct === 100 ? '✓ مكتمل' : `${toAr(session.currentPage)} / ${toAr(session.totalPages)}`}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-elevated)' }}>
        <div className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            background: pct === 100
              ? 'linear-gradient(90deg, #4ade80, #22d3ee)'
              : 'linear-gradient(90deg, var(--gold), #D4A24C)',
          }} />
      </div>

      {pct > 0 && pct < 100 && (
        <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
          متبقي {toAr(pagesLeft)} صفحة لإكمال الجزء
        </p>
      )}
      {pct === 0 && (
        <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
          لم يبدأ بعد
        </p>
      )}
    </div>
  )
}

// ─── Far Review Card ──────────────────────────────
function FarReviewCard({ summary, loading }: { summary: FarReviewSummary | null; loading: boolean }) {
  const LEVEL_LABELS: Record<number, string> = { 0: '—', 1: 'المستوى ١ (١–١٠ أجزاء)', 2: 'المستوى ٢ (١١–٢٠ جزءاً)', 3: 'المستوى ٣ (٢١–٣٠ جزءاً)' }
  const LEVEL_DAILY: Record<number, string> = { 0: '', 1: 'جزء واحد يومياً', 2: 'جزءان يومياً', 3: '٣ أجزاء يومياً' }

  return (
    <div className="card p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-black text-sm" style={{ color: 'var(--text-primary)' }}>المراجعة البعيدة</h3>
        {summary && summary.level > 0 && (
          <span className="text-[10px] px-2 py-1 rounded-lg font-bold"
            style={{ background: 'rgba(53,107,110,0.15)', color: '#4db6c2', border: '1px solid rgba(53,107,110,0.3)' }}>
            {LEVEL_DAILY[summary.level]}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--gold)' }} />
        </div>
      ) : !summary || summary.memorizedCount === 0 ? (
        <div className="flex items-center gap-2 py-4 text-xs" style={{ color: 'var(--text-muted)' }}>
          <Circle className="w-3.5 h-3.5 flex-shrink-0" />
          لا توجد أجزاء محفوظة بعد
        </div>
      ) : (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'المحفوظ', value: toAr(summary.totalMemorized), sub: 'جزء', color: 'var(--text-primary)' },
              { label: 'المكتمل', value: toAr(summary.totalCompleted), sub: 'جزء', color: '#4ade80' },
              { label: 'المتبقي', value: toAr(summary.totalMemorized - summary.totalCompleted), sub: 'جزء', color: '#facc15' },
            ].map(s => (
              <div key={s.label} className="rounded-2xl p-3 text-center"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-soft)' }}>
                <p className="text-[10px] mb-0.5" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
                <p className="text-xl font-black tabular-nums" style={{ color: s.color }}>{s.value}</p>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{s.sub}</p>
              </div>
            ))}
          </div>

          {/* Active sessions */}
          {summary.activeSessions.length > 0 && (
            <div className="space-y-3 pt-1">
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                الجلسة الحالية
              </p>
              {summary.activeSessions.map(session => (
                <SessionBar key={session.juzNumber} session={session} />
              ))}
            </div>
          )}

          {/* Next juz hint */}
          {summary.nextJuzNumbers.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs"
              style={{ background: 'var(--bg-elevated)', border: '1px dashed var(--border-soft)' }}>
              <ChevronLeft className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
              <span style={{ color: 'var(--text-muted)' }}>
                التالي بعد الإكمال:
                <span className="font-bold mr-1" style={{ color: 'var(--text-secondary)' }}>
                  {summary.nextJuzNumbers.map(j => `جزء ${toAr(j)}`).join(' + ')}
                </span>
              </span>
            </div>
          )}

          {/* Completed juz badges */}
          {summary.completedJuz.length > 0 && (
            <div className="space-y-2 pt-1">
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                مكتملة ({toAr(summary.completedJuz.length)})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {summary.completedJuz.map(j => (
                  <span key={j}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold"
                    style={{ background: 'rgba(74,222,128,0.12)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.25)' }}>
                    <CheckCircle2 className="w-3 h-3" />
                    جزء {toAr(j)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Level label */}
          <p className="text-[10px] text-center" style={{ color: 'var(--text-muted)' }}>
            {LEVEL_LABELS[summary.level]}
          </p>
        </>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────
export default function StudentProgressPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: studentId } = use(params)
  const router = useRouter()

  const [studentName, setStudentName] = useState('')
  const [batchId,     setBatchId]     = useState<number | null>(null)
  const [hasPlan,     setHasPlan]     = useState<boolean | null>(null)
  const [period,      setPeriod]      = useState<PeriodKey>('today')
  const [customDate,  setCustomDate]  = useState(getToday())

  // Memorization gap state
  const [expected,   setExpected]   = useState<number | null>(null)
  const [actual,     setActual]     = useState<number | null>(null)
  const [gap,        setGap]        = useState<number | null>(null)
  const [status,     setStatus]     = useState<ProgressStatus | null>(null)
  const [totalPages, setTotalPages] = useState(0)
  const [gapLoading, setGapLoading] = useState(false)
  const [gapError,   setGapError]   = useState<string | null>(null)

  // Far review state
  const [farSummary,   setFarSummary]   = useState<FarReviewSummary | null>(null)
  const [farLoading,   setFarLoading]   = useState(true)

  // ── Load student meta + far review (once)
  useEffect(() => {
    getStudents().then(list => {
      const s = list.find(x => x.id === studentId)
      if (!s) return
      setStudentName(s.name)
      setBatchId(s.batch_id)
    })
    getQuranPlans(studentId).then(plans => setHasPlan(plans.length > 0))

    // Far review data — loaded once, no re-fetch on period change
    Promise.all([
      getStudentJuzProgress(studentId),
      getFarReviewProgress(studentId),
    ]).then(([juzProgress, farProgress]) => {
      const summary = buildFarReviewSummary(juzProgress, farProgress, studentId)
      setFarSummary(summary)
      setFarLoading(false)
    }).catch(() => setFarLoading(false))
  }, [studentId])

  // ── Load gap (re-runs on period/date change)
  async function loadGap(asOf: string) {
    if (!batchId) return
    setGapLoading(true); setGapError(null)
    try {
      const result = await calculateGap(studentId, batchId, asOf)
      setExpected(result.expected)
      setActual(result.actual)
      setGap(result.gap)
      setStatus(result.status)
      setTotalPages(result.totalPagesInPeriod)
    } catch { setGapError('حدث خطأ أثناء الحساب') }
    finally { setGapLoading(false) }
  }

  useEffect(() => {
    if (batchId === null) return
    const asOf = period === 'today' ? getToday()
                : period === 'week'  ? addDays(getToday(), 0)
                : customDate
    loadGap(asOf)
  }, [batchId, period, customDate]) // eslint-disable-line react-hooks/exhaustive-deps

  const PERIODS: { key: PeriodKey; label: string }[] = [
    { key: 'today', label: 'اليوم' },
    { key: 'week',  label: 'آخر أسبوع' },
    { key: 'month', label: 'آخر شهر' },
  ]

  const displayDate =
    period === 'today' ? getToday() :
    period === 'week'  ? addDays(getToday(), -6) : customDate

  return (
    <div className="space-y-5 max-w-lg mx-auto">

      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()}
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-soft)' }}>
          <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
        </button>
        <div>
          <h1 className="text-lg font-black" style={{ color: 'var(--text-primary)' }}>
            {studentName || 'تقدم الطالب'}
          </h1>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>تقرير الحفظ والمراجعة</p>
        </div>
      </div>

      {/* ── No plan notice ── */}
      {hasPlan === false && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-2xl text-sm"
          style={{ background: 'rgba(250,204,21,0.1)', color: '#facc15', border: '1px solid rgba(250,204,21,0.25)' }}>
          <BookOpen className="w-4 h-4 flex-shrink-0" />
          لا توجد خطة قرآنية نشطة — أضف خطة للطالب لتفعيل حسابات التقدم
        </div>
      )}

      {/* ══ قسم الحفظ ══════════════════════════════ */}
      <div className="space-y-3">
        <h2 className="text-xs font-black uppercase tracking-wider px-1"
          style={{ color: 'var(--text-muted)' }}>تقدم الحفظ</h2>

        {/* Period selector */}
        <div className="flex gap-2">
          {PERIODS.map(p => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className="flex-1 py-2 rounded-xl text-xs font-bold border transition-all"
              style={{
                background:  period === p.key ? 'var(--gold)' : 'var(--bg-elevated)',
                color:       period === p.key ? '#fff' : 'var(--text-secondary)',
                borderColor: period === p.key ? 'var(--gold)' : 'var(--border-soft)',
              }}>
              {p.label}
            </button>
          ))}
        </div>

        {period === 'month' && (
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            <Calendar className="w-3.5 h-3.5" />
            <span>حتى:</span>
            <input type="date" value={customDate} max={getToday()}
              onChange={e => setCustomDate(e.target.value)}
              className="px-2 py-1 rounded-lg border text-xs"
              style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-soft)', color: 'var(--text-primary)' }} />
          </div>
        )}

        {gapError && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm"
            style={{ background: 'rgba(248,113,113,0.1)', color: '#f87171', border: '1px solid rgba(248,113,113,0.25)' }}>
            <AlertCircle className="w-4 h-4 flex-shrink-0" />{gapError}
          </div>
        )}

        <MemorizationCard
          expected={expected} actual={actual} gap={gap}
          status={status} totalPages={totalPages} loading={gapLoading}
        />

        {!gapLoading && (
          <p className="text-center text-[10px]" style={{ color: 'var(--text-muted)' }}>
            الحساب حتى {displayDate}
          </p>
        )}
      </div>

      {/* ══ قسم المراجعة البعيدة ════════════════════ */}
      <div className="space-y-3">
        <h2 className="text-xs font-black uppercase tracking-wider px-1"
          style={{ color: 'var(--text-muted)' }}>المراجعة البعيدة</h2>
        <FarReviewCard summary={farSummary} loading={farLoading} />
      </div>

    </div>
  )
}
