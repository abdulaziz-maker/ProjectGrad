'use client'
import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import {
  buildStudentReport,
  type StudentReportDetail, type ReportPeriod,
} from '@/lib/reports/quran-report'
import { Loader2, RefreshCw } from 'lucide-react'

// lazy-load recharts (~200KB)
const LineChart       = dynamic(() => import('recharts').then(m => m.LineChart),       { ssr: false })
const Line            = dynamic(() => import('recharts').then(m => m.Line),            { ssr: false })
const BarChart        = dynamic(() => import('recharts').then(m => m.BarChart),        { ssr: false })
const Bar             = dynamic(() => import('recharts').then(m => m.Bar),             { ssr: false })
const XAxis           = dynamic(() => import('recharts').then(m => m.XAxis),           { ssr: false })
const YAxis           = dynamic(() => import('recharts').then(m => m.YAxis),           { ssr: false })
const CartesianGrid   = dynamic(() => import('recharts').then(m => m.CartesianGrid),   { ssr: false })
const Tooltip         = dynamic(() => import('recharts').then(m => m.Tooltip),         { ssr: false })
const Legend          = dynamic(() => import('recharts').then(m => m.Legend),          { ssr: false })
const ResponsiveContainer = dynamic(() => import('recharts').then(m => m.ResponsiveContainer), { ssr: false })

const PERIODS: { value: ReportPeriod; label: string }[] = [
  { value: 'weekly',    label: 'أسبوعي' },
  { value: 'monthly',   label: 'شهري' },
  { value: 'quarterly', label: 'فصلي' },
  { value: 'yearly',    label: 'سنوي' },
]

interface Props { studentId: string; studentName: string }

export default function StudentReportTab({ studentId, studentName }: Props) {
  const [period, setPeriod] = useState<ReportPeriod>('monthly')
  const [report, setReport] = useState<StudentReportDetail | null>(null)
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    const r = await buildStudentReport({ studentId, studentName, period })
    setReport(r)
    setLoading(false)
  }, [studentId, studentName, period])

  useEffect(() => { fetch() }, [fetch])

  return (
    <div className="space-y-5">
      {/* الفلاتر */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1.5 flex-wrap">
          {PERIODS.map(p => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95"
              style={{
                background: period === p.value ? 'var(--accent-warm)' : 'var(--bg-card)',
                color: period === p.value ? '#fff' : 'var(--text-secondary)',
                border: `1px solid ${period === p.value ? 'var(--accent-warm)' : 'var(--border-soft)'}`,
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <button
          onClick={fetch}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold disabled:opacity-50"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-soft)', color: 'var(--text-secondary)' }}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          تحديث
        </button>
      </div>

      {loading && !report ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-7 h-7 animate-spin" style={{ color: 'var(--accent-warm)' }} />
        </div>
      ) : report && report.timeline.length === 0 ? (
        <div className="text-center py-20 text-sm" style={{ color: 'var(--text-muted)' }}>
          لا توجد سجلات في هذه الفترة
        </div>
      ) : report ? (
        <>
          {/* Chart 1: الفعلي مقابل المفترض */}
          <div className="rounded-2xl p-4"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-soft)' }}>
            <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
              التقدم: الفعلي مقابل المفترض
            </h3>
            <div style={{ width: '100%', height: 250 }}>
              <ResponsiveContainer>
                <LineChart data={report.timeline} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-faint)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-soft)', borderRadius: 12, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="expected" stroke="#C08A48" name="المفترض" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="actual"   stroke="#4ade80" name="الفعلي"   strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 2: الأخطاء والتنبيهات أسبوعياً */}
          {report.weeklyStats.length > 0 && (
            <div className="rounded-2xl p-4"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-soft)' }}>
              <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
                الأخطاء والتنبيهات أسبوعياً
              </h3>
              <div style={{ width: '100%', height: 250 }}>
                <ResponsiveContainer>
                  <BarChart data={report.weeklyStats} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-faint)" />
                    <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-soft)', borderRadius: 12, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="errors"      fill="#f87171" name="أخطاء" />
                    <Bar dataKey="alerts"      fill="#facc15" name="تنبيهات" />
                    <Bar dataKey="hesitations" fill="#a78bfa" name="ترددات" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* جدول السجلات */}
          <div className="rounded-2xl overflow-hidden"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-soft)' }}>
            <h3 className="text-sm font-bold p-4 pb-2" style={{ color: 'var(--text-primary)' }}>
              السجلات اليومية ({report.followups.length})
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" dir="rtl">
                <thead style={{ background: 'var(--bg-elevated)' }}>
                  <tr>
                    <th className="px-3 py-2 text-xs font-bold text-right" style={{ color: 'var(--text-secondary)' }}>التاريخ</th>
                    <th className="px-3 py-2 text-xs font-bold text-center" style={{ color: 'var(--text-secondary)' }}>المفترض</th>
                    <th className="px-3 py-2 text-xs font-bold text-center" style={{ color: 'var(--text-secondary)' }}>الفعلي</th>
                    <th className="px-3 py-2 text-xs font-bold text-center" style={{ color: 'var(--text-secondary)' }}>الفجوة</th>
                    <th className="px-3 py-2 text-xs font-bold text-right" style={{ color: 'var(--text-secondary)' }}>ملاحظات</th>
                  </tr>
                </thead>
                <tbody>
                  {report.followups.slice(0, 30).map((f, i) => (
                    <tr key={i} style={{ borderTop: '1px solid var(--border-faint)' }}>
                      <td className="px-3 py-2 tabular-nums">{f.followup_date}</td>
                      <td className="px-3 py-2 text-center tabular-nums">{f.expected_position ?? '—'}</td>
                      <td className="px-3 py-2 text-center tabular-nums">{f.actual_position ?? '—'}</td>
                      <td className="px-3 py-2 text-center tabular-nums font-bold"
                        style={{ color: (f.gap ?? 0) > 2 ? '#f87171' : (f.gap ?? 0) > 0 ? '#facc15' : '#4ade80' }}>
                        {f.gap ?? 0}
                      </td>
                      <td className="px-3 py-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                        {f.delay_reasons?.length ? f.delay_reasons.join('، ') : f.notes || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {report.followups.length > 30 && (
              <p className="px-4 py-2 text-xs text-center" style={{ color: 'var(--text-muted)' }}>
                + {report.followups.length - 30} سجل آخر
              </p>
            )}
          </div>
        </>
      ) : null}
    </div>
  )
}
