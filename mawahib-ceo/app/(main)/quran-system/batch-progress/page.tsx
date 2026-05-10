'use client'
import { useState, useEffect, useMemo, useDeferredValue } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { getBatches } from '@/lib/db'
import { calculateBatchProgress } from '@/lib/quran-progress'
import {
  PROGRESS_STATUS_LABELS,
  PROGRESS_STATUS_COLORS,
  PROGRESS_STATUS_BG,
  PROGRESS_STATUS_BORDER,
  type StudentProgress,
  type ProgressStatus,
  getToday,
} from '@/lib/quran-followup'
import { Search, ChevronDown, ChevronUp, Loader2, BookOpen, TrendingUp, TrendingDown, Minus, AlertCircle } from 'lucide-react'

// ─── Arabic numerals ─────────────────────────────
function toAr(n: number | null | undefined): string {
  if (n == null) return '—'
  return Math.round(n).toLocaleString('ar-EG')
}

// ─── Status Badge ─────────────────────────────────
function StatusBadge({ status }: { status: ProgressStatus }) {
  const icon =
    status === 'ahead'     ? <TrendingUp className="w-3 h-3"  /> :
    status === 'on_track'  ? <Minus       className="w-3 h-3"  /> :
    status === 'behind'    ? <TrendingDown className="w-3 h-3" /> :
                             <AlertCircle  className="w-3 h-3"  />

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border"
      style={{
        color:       PROGRESS_STATUS_COLORS[status],
        background:  PROGRESS_STATUS_BG[status],
        borderColor: PROGRESS_STATUS_BORDER[status],
      }}>
      {icon}
      {PROGRESS_STATUS_LABELS[status]}
    </span>
  )
}

// ─── Gap Cell ────────────────────────────────────
function GapCell({ gap }: { gap: number | null }) {
  if (gap === null) return <span style={{ color: 'var(--text-muted)' }}>—</span>
  const color = gap > 5 ? '#4ade80' : gap >= -5 ? '#facc15' : '#f87171'
  const prefix = gap > 0 ? '+' : ''
  return (
    <span className="font-bold tabular-nums" style={{ color }}>
      {prefix}{toAr(gap)}
    </span>
  )
}

// ─── Sort config ──────────────────────────────────
type SortField = 'name' | 'expected' | 'actual' | 'gap'
type SortDir   = 'asc' | 'desc'

// ─── Page ─────────────────────────────────────────
const PAGE_SIZE = 25

export default function BatchProgressPage() {
  const { profile } = useAuth()
  const isCeo = profile?.role === 'ceo' || profile?.role === 'batch_manager'

  // ── Batch selector (CEO/manager يرى كل الدفعات)
  const [batches,     setBatches]     = useState<{ id: number; name: string }[]>([])
  const [batchId,     setBatchId]     = useState<number | null>(null)

  // ── Data
  const [progress,    setProgress]    = useState<StudentProgress[]>([])
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [asOfDate,    setAsOfDate]    = useState(getToday())
  const [loadedDate,  setLoadedDate]  = useState<string | null>(null) // التاريخ الذي حُسبت عنده

  // ── Client-side filter/sort (بلا re-fetch)
  const [statusFilter, setStatusFilter] = useState<ProgressStatus | 'all'>('all')
  const [sortField,    setSortField]    = useState<SortField>('gap')
  const [sortDir,      setSortDir]      = useState<SortDir>('asc')
  const [searchRaw,    setSearchRaw]    = useState('')
  const search = useDeferredValue(searchRaw)
  const [page,         setPage]         = useState(0)

  // ── Load batches
  useEffect(() => {
    if (isCeo) {
      getBatches().then(list => {
        setBatches(list.map(b => ({ id: b.id, name: b.name })))
        if (list.length > 0) setBatchId(list[0].id)
      })
    } else if (profile?.batch_id) {
      setBatchId(profile.batch_id)
    }
  }, [isCeo, profile?.batch_id])

  // ── Load progress (مرة واحدة عند فتح الصفحة أو تغيير الدفعة/التاريخ)
  async function loadProgress() {
    if (!batchId) return
    setLoading(true); setError(null)
    try {
      const data = await calculateBatchProgress(batchId, asOfDate)
      setProgress(data)
      setLoadedDate(asOfDate)
      setPage(0) // reset pagination
    } catch (e) {
      console.error(e)
      setError('حدث خطأ أثناء تحميل البيانات')
    } finally { setLoading(false) }
  }

  useEffect(() => { loadProgress() }, [batchId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Filter + Sort (client-side فقط — بلا re-fetch)
  const filtered = useMemo(() => {
    let rows = progress
    if (statusFilter !== 'all')
      rows = rows.filter(r => r.status === statusFilter)
    if (search.trim())
      rows = rows.filter(r => r.name.includes(search.trim()))
    return [...rows].sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'name':
          cmp = a.name.localeCompare(b.name, 'ar'); break
        case 'expected':
          cmp = (a.expected ?? -1) - (b.expected ?? -1); break
        case 'actual':
          cmp = (a.actual ?? -1) - (b.actual ?? -1); break
        case 'gap':
          // null في النهاية
          if (a.gap === null && b.gap === null) cmp = 0
          else if (a.gap === null) cmp = 1
          else if (b.gap === null) cmp = -1
          else cmp = a.gap - b.gap
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [progress, statusFilter, search, sortField, sortDir])

  // ── Stats summary
  const stats = useMemo(() => ({
    total:    progress.length,
    ahead:    progress.filter(r => r.status === 'ahead').length,
    on_track: progress.filter(r => r.status === 'on_track').length,
    behind:   progress.filter(r => r.status === 'behind').length,
    no_record:progress.filter(r => r.status === 'no_record').length,
  }), [progress])

  // ── Pagination
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)

  // ── Sort toggle
  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ChevronDown className="w-3 h-3 opacity-30" />
    return sortDir === 'asc'
      ? <ChevronUp   className="w-3 h-3" style={{ color: 'var(--gold)' }} />
      : <ChevronDown className="w-3 h-3" style={{ color: 'var(--gold)' }} />
  }

  const STATUS_FILTERS: { value: ProgressStatus | 'all'; label: string }[] = [
    { value: 'all',      label: 'الكل' },
    { value: 'behind',   label: 'متأخر' },
    { value: 'on_track', label: 'منتظم' },
    { value: 'ahead',    label: 'متقدم' },
    { value: 'no_record',label: 'لم يُسجَّل' },
  ]

  return (
    <div className="space-y-5 max-w-4xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-black" style={{ color: 'var(--text-primary)' }}>
            تقدم الحفظ
          </h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            مقارنة المتوقع بالفعلي لكل طالب
            {loadedDate && <span className="mr-1 opacity-70">· حُسب في {loadedDate}</span>}
          </p>
        </div>

        {/* Date picker + reload */}
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={asOfDate}
            onChange={e => setAsOfDate(e.target.value)}
            className="px-3 py-1.5 rounded-xl text-xs font-medium border"
            style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-soft)', color: 'var(--text-primary)' }}
          />
          <button
            onClick={loadProgress}
            disabled={loading}
            className="px-4 py-1.5 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
            style={{ background: 'var(--gold)', color: '#fff' }}
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'احسب'}
          </button>
        </div>
      </div>

      {/* ── Batch selector (CEO/manager) ── */}
      {isCeo && batches.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {batches.map(b => (
            <button
              key={b.id}
              onClick={() => setBatchId(b.id)}
              className="px-3 py-1.5 rounded-xl text-xs font-bold border transition-all"
              style={{
                background:  batchId === b.id ? 'var(--gold)' : 'var(--bg-elevated)',
                color:       batchId === b.id ? '#fff' : 'var(--text-secondary)',
                borderColor: batchId === b.id ? 'var(--gold)' : 'var(--border-soft)',
              }}
            >{b.name}</button>
          ))}
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm"
          style={{ background: 'rgba(248,113,113,0.1)', color: '#f87171', border: '1px solid rgba(248,113,113,0.25)' }}>
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}

      {/* ── Stats cards ── */}
      {!loading && progress.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'متأخرون',   value: stats.behind,   color: '#f87171' },
            { label: 'منتظمون',   value: stats.on_track, color: '#facc15' },
            { label: 'متقدمون',   value: stats.ahead,    color: '#4ade80' },
            { label: 'لم يُسجَّل', value: stats.no_record,color: 'var(--text-muted)' },
          ].map(s => (
            <div key={s.label} className="card p-3 text-center">
              <p className="text-2xl font-black tabular-nums" style={{ color: s.color }}>{toAr(s.value)}</p>
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Filter + Search bar ── */}
      {!loading && progress.length > 0 && (
        <div className="flex gap-2 flex-wrap items-center">
          {/* Status filter */}
          <div className="flex gap-1">
            {STATUS_FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => { setStatusFilter(f.value); setPage(0) }}
                className="px-3 py-1 rounded-xl text-xs font-bold border transition-all"
                style={{
                  background:  statusFilter === f.value ? 'var(--gold)' : 'var(--bg-elevated)',
                  color:       statusFilter === f.value ? '#fff' : 'var(--text-secondary)',
                  borderColor: statusFilter === f.value ? 'var(--gold)' : 'var(--border-soft)',
                }}
              >{f.label}</button>
            ))}
          </div>
          {/* Search */}
          <div className="relative flex-1 min-w-[140px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
              style={{ color: 'var(--text-muted)' }} />
            <input
              placeholder="بحث باسم الطالب…"
              value={searchRaw}
              onChange={e => { setSearchRaw(e.target.value); setPage(0) }}
              className="w-full pr-8 pl-3 py-1.5 rounded-xl text-xs border"
              style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-soft)', color: 'var(--text-primary)' }}
            />
          </div>
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div className="flex flex-col items-center gap-3 py-16">
          <Loader2 className="w-7 h-7 animate-spin" style={{ color: 'var(--gold)' }} />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>جاري حساب التقدم…</p>
        </div>
      )}

      {/* ── Table ── */}
      {!loading && filtered.length > 0 && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" dir="rtl">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-soft)', background: 'var(--bg-elevated)' }}>
                  {[
                    { field: 'name',     label: 'الطالب',  cls: 'w-32 text-right' },
                    { field: 'expected', label: 'المتوقع', cls: 'w-20 text-center' },
                    { field: 'actual',   label: 'الفعلي',  cls: 'w-20 text-center' },
                    { field: 'gap',      label: 'الفجوة',  cls: 'w-20 text-center' },
                  ].map(col => (
                    <th
                      key={col.field}
                      onClick={() => toggleSort(col.field as SortField)}
                      className={`${col.cls} px-3 py-2.5 text-xs font-bold cursor-pointer select-none`}
                      style={{ color: sortField === col.field ? 'var(--gold)' : 'var(--text-muted)' }}
                    >
                      <span className="inline-flex items-center gap-1">
                        {col.label}
                        <SortIcon field={col.field as SortField} />
                      </span>
                    </th>
                  ))}
                  <th className="px-3 py-2.5 text-xs font-bold text-center" style={{ color: 'var(--text-muted)' }}>
                    الحالة
                  </th>
                  <th className="px-3 py-2.5 text-xs font-bold text-center" style={{ color: 'var(--text-muted)' }}>
                    محفوظ
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((row, i) => (
                  <tr
                    key={row.studentId}
                    style={{
                      borderBottom: i < paginated.length - 1 ? '1px solid var(--border-soft)' : 'none',
                      background: i % 2 === 0 ? 'transparent' : 'var(--bg-elevated)',
                    }}
                  >
                    <td className="px-3 py-3 font-medium text-right" style={{ color: 'var(--text-primary)' }}>
                      {row.name}
                    </td>
                    <td className="px-3 py-3 text-center tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                      {row.expected !== null ? `ص ${toAr(row.expected)}` : '—'}
                    </td>
                    <td className="px-3 py-3 text-center tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                      {row.actual !== null ? `ص ${toAr(row.actual)}` : '—'}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <GapCell gap={row.gap} />
                    </td>
                    <td className="px-3 py-3 text-center">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="px-3 py-3 text-center tabular-nums text-xs" style={{ color: 'var(--text-muted)' }}>
                      {row.totalPagesInPeriod > 0 ? `${toAr(row.totalPagesInPeriod)} ص` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3"
              style={{ borderTop: '1px solid var(--border-soft)' }}>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {toAr(filtered.length)} طالب
              </span>
              <div className="flex gap-1">
                {Array.from({ length: totalPages }, (_, i) => (
                  <button
                    key={i}
                    onClick={() => setPage(i)}
                    className="w-7 h-7 rounded-lg text-xs font-bold transition-all"
                    style={{
                      background: page === i ? 'var(--gold)' : 'var(--bg-elevated)',
                      color:      page === i ? '#fff' : 'var(--text-muted)',
                    }}
                  >{i + 1}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Empty ── */}
      {!loading && !error && progress.length === 0 && batchId && (
        <div className="flex flex-col items-center gap-3 py-16">
          <BookOpen className="w-10 h-10 opacity-20" style={{ color: 'var(--text-muted)' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
            لا توجد بيانات للدفعة المحددة
          </p>
          <p className="text-xs text-center max-w-xs" style={{ color: 'var(--text-muted)' }}>
            تأكد من أن الطلاب لديهم خطط قرآنية نشطة وسجلات حفظ
          </p>
        </div>
      )}
    </div>
  )
}
