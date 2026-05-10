'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { getBatches, type DBBatch } from '@/lib/db'
import {
  buildQuranReport, computePeriodRange,
  type QuranReport, type ReportPeriod, type StudentReportRow,
} from '@/lib/reports/quran-report'
import { readReportCache, writeReportCache, clearReportCache } from '@/lib/reports/cache'
import {
  RefreshCw, Download, Printer, Search, Loader2,
  TrendingDown, TrendingUp, Users, BookOpen,
  ArrowUp, ArrowDown,
} from 'lucide-react'
import Link from 'next/link'

const PERIOD_OPTIONS: { value: ReportPeriod; label: string }[] = [
  { value: 'daily',     label: 'يومي' },
  { value: 'weekly',    label: 'أسبوعي' },
  { value: 'monthly',   label: 'شهري' },
  { value: 'quarterly', label: 'فصلي' },
  { value: 'yearly',    label: 'سنوي' },
  { value: 'custom',    label: 'مخصص' },
]

type SortKey = keyof Pick<StudentReportRow,
  'name'|'expected'|'actual'|'gap'|'errorsCount'|'alertsCount'|'hesitationsCount'|'examsTotal'|'attendancePct'>

function toAr(n: number): string { return n.toLocaleString('ar-EG') }

export default function QuranReportsPage() {
  const { profile, loading: authLoading } = useAuth()
  const isCeo = profile?.role === 'ceo' || profile?.role === 'records_officer'

  const [batches, setBatches] = useState<DBBatch[]>([])
  const [batchId, setBatchId] = useState<number | null>(null)
  const [period, setPeriod]   = useState<ReportPeriod>('weekly')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo,   setCustomTo]   = useState('')
  const [report, setReport]   = useState<QuranReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [search, setSearch]   = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('gap')
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('desc')
  const [fromCache, setFromCache] = useState(false)
  const [lastDurationMs, setLastDurationMs] = useState<number | null>(null)

  // ── جلب الدفعات ────────────────────────────────────────────────────
  useEffect(() => {
    if (authLoading) return
    getBatches().then(bs => {
      setBatches(bs)
      if (bs.length > 0 && batchId === null) {
        const initial = isCeo ? bs[0].id : (profile?.batch_id ?? bs[0].id)
        setBatchId(initial)
      }
    })
  }, [authLoading, isCeo, profile?.batch_id, batchId])

  // ── جلب التقرير ────────────────────────────────────────────────────
  const fetchReport = useCallback(async (force = false) => {
    if (batchId === null) return
    const batch = batches.find(b => b.id === batchId)
    if (!batch) return

    const cacheParams = {
      batchId, period,
      from: period === 'custom' ? customFrom : undefined,
      to:   period === 'custom' ? customTo   : undefined,
    }

    if (!force) {
      const cached = readReportCache(cacheParams)
      if (cached) { setReport(cached); setFromCache(true); setLastDurationMs(null); return }
    }

    setLoading(true); setFromCache(false)
    const start = performance.now()
    const r = await buildQuranReport({
      batchId, batchName: batch.name, period,
      customFrom: period === 'custom' ? customFrom : undefined,
      customTo:   period === 'custom' ? customTo   : undefined,
    })
    const dur = performance.now() - start
    setLastDurationMs(Math.round(dur))
    setReport(r)
    writeReportCache(cacheParams, r)
    setLoading(false)
  }, [batchId, batches, period, customFrom, customTo])

  useEffect(() => {
    if (batchId === null) return
    if (period === 'custom' && (!customFrom || !customTo)) return
    fetchReport()
  }, [batchId, period, customFrom, customTo, fetchReport])

  // ── الترتيب والفلترة ────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!report) return []
    const q = search.trim().toLowerCase()
    const filtered = q ? report.students.filter(s => s.name.toLowerCase().includes(q)) : report.students
    return [...filtered].sort((a, b) => {
      const va = a[sortKey] as number | string
      const vb = b[sortKey] as number | string
      if (typeof va === 'string' && typeof vb === 'string') {
        return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
      }
      const na = Number(va), nb = Number(vb)
      return sortDir === 'asc' ? na - nb : nb - na
    })
  }, [report, search, sortKey, sortDir])

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(k); setSortDir('desc') }
  }

  // ── التصدير ────────────────────────────────────────────────────────
  const exportToExcel = async () => {
    if (!report) return
    const XLSX = await import('xlsx')
    const headers = [
      'الاسم','المفترض','الفعلي','الفجوة','الأخطاء','التنبيهات','الترددات',
      'اختبارات','نجاح','رسوب','الحضور %',
    ]
    const rows = filtered.map(s => [
      s.name, s.expected, s.actual, s.gap,
      s.errorsCount, s.alertsCount, s.hesitationsCount,
      s.examsTotal, s.examsPassed, s.examsFailed, s.attendancePct,
    ])
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'تقرير القرآن')
    const filename = `تقرير-${report.batch.name}-${report.period.label}-${report.period.to}.xlsx`
    XLSX.writeFile(wb, filename)
  }

  const handlePrint = () => window.print()

  const handleRefresh = () => {
    clearReportCache()
    fetchReport(true)
  }

  // ── الواجهة ────────────────────────────────────────────────────────
  if (authLoading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--accent-warm)' }} />
    </div>
  )

  return (
    <div className="space-y-4 pb-10">
      {/* أنماط الطباعة */}
      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .print-only { display: block !important; }
          table { font-size: 11px; page-break-inside: auto; }
          tr { page-break-inside: avoid; page-break-after: auto; }
          thead { display: table-header-group; }
        }
        .print-only { display: none; }
      `}</style>

      {/* العنوان */}
      <div className="flex items-center justify-between flex-wrap gap-3 no-print">
        <div>
          <h1 className="text-xl font-black flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <BookOpen className="w-5 h-5" style={{ color: 'var(--accent-warm)' }} />
            تقارير القرآن
          </h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            تقارير شاملة قابلة للتصدير
          </p>
        </div>
        {report && (
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {fromCache ? '⚡ من الذاكرة' :
              lastDurationMs !== null ? `⏱ ${lastDurationMs}ms` : ''}
          </div>
        )}
      </div>

      {/* الـSelectors */}
      <div className="rounded-2xl p-4 space-y-3 no-print"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-soft)' }}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* الدفعة */}
          <div>
            <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-muted)' }}>الدفعة</label>
            <select
              value={batchId ?? ''}
              onChange={e => setBatchId(parseInt(e.target.value))}
              disabled={!isCeo && profile?.batch_id !== null}
              className="w-full px-3 py-2 rounded-xl text-sm outline-none"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
            >
              {batches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          {/* الفترة */}
          <div>
            <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-muted)' }}>الفترة</label>
            <select
              value={period}
              onChange={e => setPeriod(e.target.value as ReportPeriod)}
              className="w-full px-3 py-2 rounded-xl text-sm outline-none"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
            >
              {PERIOD_OPTIONS.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>

          {/* البحث */}
          <div>
            <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-muted)' }}>بحث بالاسم</label>
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="ابحث..."
                className="w-full pr-9 pl-3 py-2 rounded-xl text-sm outline-none"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
              />
            </div>
          </div>
        </div>

        {/* نطاق مخصص */}
        {period === 'custom' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-muted)' }}>من</label>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }} />
            </div>
            <div>
              <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-muted)' }}>إلى</label>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }} />
            </div>
          </div>
        )}

        {/* الأزرار */}
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50 transition-all active:scale-95"
            style={{ background: 'var(--accent-warm)' }}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            تحديث الآن
          </button>
          <button
            onClick={exportToExcel}
            disabled={!report || loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50 transition-all active:scale-95"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-soft)', color: 'var(--text-secondary)' }}
          >
            <Download className="w-4 h-4" />
            Excel
          </button>
          <button
            onClick={handlePrint}
            disabled={!report || loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50 transition-all active:scale-95"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-soft)', color: 'var(--text-secondary)' }}
          >
            <Printer className="w-4 h-4" />
            طباعة / PDF
          </button>
        </div>
      </div>

      {/* عنوان الطباعة */}
      {report && (
        <div className="print-only mb-4" style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: '18pt', fontWeight: 900 }}>تقرير القرآن — {report.batch.name}</h1>
          <p style={{ fontSize: '11pt', marginTop: 4 }}>الفترة: {report.period.label} ({report.period.from} ← {report.period.to})</p>
        </div>
      )}

      {/* الملخص */}
      {loading && !report ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-2xl h-24 animate-pulse" style={{ background: 'var(--bg-elevated)' }} />
          ))}
        </div>
      ) : report ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryCard label="إجمالي الطلاب" value={report.summary.totalStudents} icon={Users} color="#C08A48" />
            <SummaryCard label="نسبة الإنجاز" value={`${toAr(report.summary.avgCompletion)}%`}
              icon={report.summary.avgCompletion >= 80 ? TrendingUp : TrendingDown}
              color={report.summary.avgCompletion >= 80 ? '#4ade80' : '#f87171'} />
            <SummaryCard label="متوسط الفجوة" value={toAr(report.summary.avgGap)}
              icon={TrendingDown} color={report.summary.avgGap > 2 ? '#f87171' : '#4ade80'} />
            <SummaryCard label="الحضور" value={`${toAr(report.summary.avgAttendance)}%`}
              icon={Users} color="#356B6E" />
          </div>

          {/* الجدول */}
          <div className="rounded-2xl overflow-hidden"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-soft)' }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" dir="rtl">
                <thead style={{ background: 'var(--bg-elevated)' }}>
                  <tr>
                    <ThSort label="الاسم" k="name" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} align="right" />
                    <ThSort label="المفترض" k="expected" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                    <ThSort label="الفعلي" k="actual" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                    <ThSort label="الفجوة" k="gap" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                    <ThSort label="أخطاء" k="errorsCount" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                    <ThSort label="تنبيهات" k="alertsCount" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                    <ThSort label="ترددات" k="hesitationsCount" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                    <ThSort label="اختبارات" k="examsTotal" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                    <ThSort label="الحضور" k="attendancePct" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={9} className="text-center py-12" style={{ color: 'var(--text-muted)' }}>
                      لا توجد بيانات في هذه الفترة
                    </td></tr>
                  ) : filtered.map(s => (
                    <tr key={s.studentId} style={{ borderTop: '1px solid var(--border-faint)' }}>
                      <td className="px-3 py-2 font-semibold text-right">
                        <Link href={`/students/${s.studentId}`}
                          className="hover:underline" style={{ color: 'var(--text-primary)' }}>
                          {s.name}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums">{toAr(s.expected)}</td>
                      <td className="px-3 py-2 text-center tabular-nums">{toAr(s.actual)}</td>
                      <td className="px-3 py-2 text-center tabular-nums font-bold"
                        style={{ color: s.gap > 2 ? '#f87171' : s.gap > 0 ? '#facc15' : '#4ade80' }}>
                        {toAr(s.gap)}
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums">
                        {s.errorsCount > 0 ? <span style={{ color: '#f87171' }}>{toAr(s.errorsCount)}</span> : '—'}
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums">
                        {s.alertsCount > 0 ? <span style={{ color: '#facc15' }}>{toAr(s.alertsCount)}</span> : '—'}
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums">
                        {s.hesitationsCount > 0 ? toAr(s.hesitationsCount) : '—'}
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums">
                        {s.examsTotal > 0 ? (
                          <span>
                            <span style={{ color: '#4ade80' }}>{toAr(s.examsPassed)}</span>
                            {' / '}
                            <span>{toAr(s.examsTotal)}</span>
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums">
                        {s.attendancePct > 0 ? (
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-12 h-1.5 rounded-full overflow-hidden"
                              style={{ background: 'var(--bg-elevated)' }}>
                              <div style={{
                                width: `${s.attendancePct}%`, height: '100%',
                                background: s.attendancePct >= 80 ? '#4ade80' : s.attendancePct >= 50 ? '#facc15' : '#f87171',
                              }} />
                            </div>
                            <span className="text-xs">{s.attendancePct}%</span>
                          </div>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────
function SummaryCard({ label, value, icon: Icon, color }: {
  label: string; value: string | number; icon: React.ElementType; color: string
}) {
  return (
    <div className="rounded-2xl p-4"
      style={{ background: 'var(--bg-elevated)', border: `1px solid ${color}25` }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold" style={{ color }}>{label}</span>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${color}18` }}>
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
      </div>
      <p className="text-2xl font-black tabular-nums" style={{ color: 'var(--text-primary)' }}>
        {typeof value === 'number' ? toAr(value) : value}
      </p>
    </div>
  )
}

function ThSort({ label, k, sortKey, sortDir, onToggle, align = 'center' }: {
  label: string; k: SortKey; sortKey: SortKey; sortDir: 'asc'|'desc'
  onToggle: (k: SortKey) => void; align?: 'right'|'center'
}) {
  const active = sortKey === k
  return (
    <th
      onClick={() => onToggle(k)}
      className="px-3 py-2.5 text-xs font-bold cursor-pointer select-none whitespace-nowrap"
      style={{ color: active ? 'var(--accent-warm)' : 'var(--text-secondary)', textAlign: align }}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active && (sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
      </span>
    </th>
  )
}
