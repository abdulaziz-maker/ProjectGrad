'use client'
/**
 * /student-cases/timeline — متابعة التصعيدات (عرض الـtimelines الكاملة)
 *
 * يعرض كل الحالات النشطة + المنتهية حديثاً مع timeline كل واحدة (CaseStageStepper)
 *
 * صلاحيات الرؤية (يفرضها RLS):
 *   - المشرف: حالات طلابه فقط
 *   - مدير الدفعة: حالات دفعته
 *   - المدير التنفيذي / موظف السجلات: كل الحالات
 */
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Loader2, Clock, Filter, ChevronLeft, BookOpenCheck, Search,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { STUDENT_CASES_ENABLED } from '@/lib/student-cases/flag'
import { getCases, getCaseWithHistory } from '@/lib/student-cases/db'
import type { CaseWithStudent, CaseWithHistory, CaseStage } from '@/lib/student-cases/types'
import {
  STAGE_SHORT_LABEL, STAGE_COLOR, CASE_STATUS_LABEL, CASE_STATUS_COLOR,
  timeAgoArabic,
} from '@/lib/student-cases/format'
import CaseStageStepper from '@/components/student-cases/CaseStageStepper'

type FilterKey = 'all_active' | 'stage_1_supervisor' | 'stage_2_batch_manager' | 'stage_3_ceo' | 'closed_or_resolved'

const FILTERS: { k: FilterKey; l: string }[] = [
  { k: 'all_active',           l: 'كل النشطة' },
  { k: 'stage_1_supervisor',   l: 'عند المشرف' },
  { k: 'stage_2_batch_manager', l: 'عند مدير الدفعة' },
  { k: 'stage_3_ceo',          l: 'عند التنفيذي' },
  { k: 'closed_or_resolved',   l: 'منتهية' },
]

export default function EscalationTimelinePage() {
  const router = useRouter()
  const { profile, loading: authLoading } = useAuth()

  const [cases, setCases] = useState<CaseWithStudent[]>([])
  const [casesWithHistory, setCasesWithHistory] = useState<Record<string, CaseWithHistory>>({})
  const [filter, setFilter] = useState<FilterKey>('all_active')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Feature flag
  useEffect(() => {
    if (!STUDENT_CASES_ENABLED) router.replace('/dashboard')
  }, [router])

  // Initial load — RLS يفلتر حسب الدور تلقائياً
  useEffect(() => {
    if (authLoading) return
    let alive = true
    ;(async () => {
      try {
        const all = await getCases()
        if (alive) setCases(all)
      } catch (err) {
        console.error(err)
        toast.error('تعذّر تحميل التصعيدات')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [authLoading])

  const filtered = useMemo(() => {
    let list = cases
    if (filter === 'all_active') list = cases.filter(c => c.status === 'active')
    else if (filter === 'closed_or_resolved') list = cases.filter(c => c.current_stage === 'resolved' || c.current_stage === 'closed')
    else list = cases.filter(c => c.current_stage === filter)

    const q = search.trim()
    if (q) list = list.filter(c => c.student_name.includes(q))
    return list
  }, [cases, filter, search])

  const counts = useMemo(() => {
    const c = { stage_1_supervisor: 0, stage_2_batch_manager: 0, stage_3_ceo: 0, closed: 0, active: 0 }
    for (const x of cases) {
      if (x.current_stage === 'closed' || x.current_stage === 'resolved') c.closed++
      else {
        c.active++
        if (x.current_stage === 'stage_1_supervisor') c.stage_1_supervisor++
        if (x.current_stage === 'stage_2_batch_manager') c.stage_2_batch_manager++
        if (x.current_stage === 'stage_3_ceo') c.stage_3_ceo++
      }
    }
    return c
  }, [cases])

  // Lazy load timeline data when expanding
  const handleExpand = async (caseId: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(caseId)) next.delete(caseId)
      else next.add(caseId)
      return next
    })
    if (!casesWithHistory[caseId]) {
      try {
        const detailed = await getCaseWithHistory(caseId)
        if (detailed) {
          setCasesWithHistory(prev => ({ ...prev, [caseId]: detailed }))
        }
      } catch {
        // الـRLS قد يمنع الجلب — تجاهل بصمت
      }
    }
  }

  if (!STUDENT_CASES_ENABLED) return null
  if (loading || authLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--accent-warm)' }} />
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-fade-in-up">
      {/* Hero */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="eyebrow-pill mb-2">
            <span className="eyebrow-dot" />
            متابعة التصعيدات
          </div>
          <h1
            className="m-0 flex items-center gap-3"
            style={{ fontFamily: 'var(--font-noto-kufi), serif', fontSize: 28, fontWeight: 700, color: 'var(--text-primary)' }}
          >
            <Clock className="w-7 h-7" style={{ color: 'var(--accent-warm)' }} />
            رحلة كل تصعيد
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
            اضغط على أي حالة لرؤية مسارها الكامل من المشرف إلى المدير التنفيذي
          </p>
        </div>
        <Link
          href="/student-cases"
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-xl border"
          style={{ borderColor: 'var(--border-soft)', color: 'var(--text-primary)', background: 'var(--bg-card, #fff)' }}
        >
          <ChevronLeft className="w-4 h-4" />
          الرجوع للحالات
        </Link>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatChip label="نشطة" value={counts.active} color="#C08A48" />
        <StatChip label="عند المشرف" value={counts.stage_1_supervisor} color="#356B6E" />
        <StatChip label="عند مدير الدفعة" value={counts.stage_2_batch_manager} color="#5D4256" />
        <StatChip label="عند التنفيذي" value={counts.stage_3_ceo} color="#B94838" />
        <StatChip label="منتهية" value={counts.closed} color="#5A8F67" />
      </div>

      {/* Filters + Search */}
      <div className="card-static p-3 flex items-center gap-2 flex-wrap">
        <Filter className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map(f => {
            const active = filter === f.k
            return (
              <button
                key={f.k}
                type="button"
                onClick={() => setFilter(f.k)}
                className="px-3 py-1.5 rounded-full text-xs font-bold transition"
                style={
                  active
                    ? {
                        background: 'var(--accent-warm)', color: '#fff',
                        border: '1px solid var(--accent-warm)',
                      }
                    : {
                        background: 'var(--bg-card, #fff)', color: 'var(--text-primary)',
                        border: '1px solid var(--border-soft)',
                      }
                }
              >
                {f.l}
              </button>
            )
          })}
        </div>
        <div className="flex-1" />
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
          style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-soft)', minWidth: 200 }}
        >
          <Search className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث باسم الطالب…"
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: 'var(--text-primary)' }}
          />
        </div>
      </div>

      {/* Cases list */}
      {filtered.length === 0 ? (
        <div className="card-static p-12 text-center" style={{ color: 'var(--text-muted)' }}>
          <Clock className="w-10 h-10 mx-auto mb-2 opacity-40" />
          لا توجد تصعيدات مطابقة للفلتر.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(c => {
            const isOpen = expanded.has(c.id)
            const detailed = casesWithHistory[c.id]
            return (
              <article key={c.id} className="card-static p-0 overflow-hidden">
                {/* Row header — clickable */}
                <button
                  type="button"
                  onClick={() => handleExpand(c.id)}
                  className="w-full flex items-center justify-between gap-3 p-4 text-right"
                  style={{ background: 'transparent' }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <BookOpenCheck className="w-4 h-4" style={{ color: 'var(--accent-warm)' }} />
                      <h3 className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>
                        {c.student_name}
                      </h3>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${STAGE_COLOR[c.current_stage]}`}
                      >
                        {STAGE_SHORT_LABEL[c.current_stage]}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border ${CASE_STATUS_COLOR[c.status]}`}>
                        {CASE_STATUS_LABEL[c.status]}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      <span>الدفعة: {c.batch_name ?? c.batch_id}</span>
                      <span>·</span>
                      <span>منذ {timeAgoArabic(c.started_at)}</span>
                      <span>·</span>
                      <span className="truncate max-w-md" title={c.trigger_reason}>
                        {c.trigger_reason}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Link
                      href={`/student-cases/${c.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-[11px] font-bold px-2.5 py-1 rounded-lg"
                      style={{
                        background: 'rgba(192,138,72,0.14)', color: '#8B5A1E',
                        border: '1px solid rgba(192,138,72,0.30)',
                      }}
                    >
                      تفاصيل ←
                    </Link>
                    <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>
                      {isOpen ? '▲' : '▼'}
                    </span>
                  </div>
                </button>

                {/* Expanded timeline */}
                {isOpen && (
                  <div className="border-t" style={{ borderColor: 'var(--border-soft)' }}>
                    <div className="p-4">
                      {detailed ? (
                        <CaseStageStepper
                          currentStage={detailed.current_stage}
                          status={detailed.status}
                          startedAt={detailed.started_at}
                          transitions={detailed.transitions}
                          closedAt={detailed.closed_at}
                        />
                      ) : (
                        <div className="text-center py-6">
                          <Loader2 className="w-5 h-5 mx-auto animate-spin" style={{ color: 'var(--accent-warm)' }} />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StatChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      className="rounded-xl p-3 flex items-center gap-3"
      style={{
        background: `linear-gradient(135deg, ${color}12, ${color}04)`,
        border: `1px solid ${color}26`,
      }}
    >
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-white"
        style={{ background: color, fontSize: 14 }}
      >
        {value}
      </div>
      <div className="text-[12px] font-semibold" style={{ color: 'var(--text-primary)' }}>
        {label}
      </div>
    </div>
  )
}
