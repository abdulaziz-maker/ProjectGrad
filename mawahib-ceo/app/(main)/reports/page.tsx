'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getBatches, getStudents, getAllAttendance, getExams, DBBatch } from '@/lib/db'
import { FileText, Download, Printer, BarChart2, PieChart, TrendingUp, Calendar, ArrowLeft, Sparkles } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart as RePieChart, Pie, Cell } from 'recharts'
import { PERFORMANCE_REPORTS_ENABLED } from '@/lib/performance/flag'

const REPORT_TYPES = [
  { id: 'monthly', label: 'التقرير الشهري', icon: Calendar, color: 'bg-blue-500/10 text-blue-400', desc: 'يُولَّد تلقائياً — أداء الطلاب والمشرفين والحضور' },
  { id: 'quarterly', label: 'التقرير الفصلي', icon: BarChart2, color: 'bg-indigo-500/10 text-indigo-400', desc: 'ملخص شامل مع مقارنة بالفصل السابق' },
  { id: 'program', label: 'تقرير برنامج تربوي', icon: TrendingUp, color: 'bg-purple-500/10 text-purple-400', desc: 'بعد كل برنامج طويل' },
  { id: 'teachers', label: 'تقرير أداء المعلمين', icon: PieChart, color: 'bg-orange-500/10 text-orange-400', desc: 'في نهاية كل فصل' },
]

const BATCH_COLORS = ['#C08A48', '#356B6E', '#a78bfa', '#38bdf8']

const PERFORMANCE_DATA = [
  { month: 'سبتمبر', d42: 88, d44: 72, d46: 61, d48: 45 },
  { month: 'أكتوبر', d42: 90, d44: 76, d46: 66, d48: 50 },
  { month: 'نوفمبر', d42: 92, d44: 80, d46: 70, d48: 55 },
  { month: 'ديسمبر', d42: 93, d44: 83, d46: 74, d48: 58 },
  { month: 'يناير', d42: 94, d44: 86, d46: 78, d48: 62 },
  { month: 'فبراير', d42: 95, d44: 89, d46: 82, d48: 66 },
  { month: 'مارس', d42: 96, d44: 91, d46: 85, d48: 72 },
]

export default function ReportsPage() {
  const [activeReport, setActiveReport] = useState('monthly')
  const [batches, setBatches] = useState<DBBatch[]>([])
  const [monthlyStats, setMonthlyStats] = useState({ totalStudents: 0, attendanceToday: 0, strugglingStudents: 0, juzsTestedThisMonth: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([getBatches(), getStudents(), getAllAttendance(), getExams()]).then(([b, students, attendance, exams]) => {
      setBatches(b)
      const today = new Date().toISOString().slice(0, 10)
      const todayAtt = attendance.filter(a => a.date === today)
      const presentToday = todayAtt.filter(a => a.status === 'present').length
      const totalToday = todayAtt.length || 1
      const struggling = students.filter(s => s.completion_percentage < 60).length
      const now = new Date()
      const monthExams = exams.filter(e => { const d = new Date(e.date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() })
      setMonthlyStats({
        totalStudents: students.length,
        attendanceToday: Math.round((presentToday / totalToday) * 100),
        strugglingStudents: struggling,
        juzsTestedThisMonth: monthExams.length,
      })
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const pieData = batches.map((b, i) => ({ name: b.name, value: b.student_count, color: BATCH_COLORS[i % BATCH_COLORS.length] }))
  const chartData = PERFORMANCE_DATA.map(d => ({ month: d.month, 'دفعة 46': d.d46, 'دفعة 48': d.d48 }))

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>التقارير</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>توليد وتصدير تقارير البرنامج</p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 px-4 py-2 text-sm border border-white/10 rounded-xl hover:bg-white/5" style={{ color: 'var(--text-secondary)' }}>
            <Printer className="w-4 h-4" />
            طباعة
          </button>
          <button className="btn-primary btn-ripple flex items-center gap-2 px-4 py-2 text-sm text-white rounded-xl">
            <Download className="w-4 h-4" />
            تحميل PDF
          </button>
        </div>
      </div>

      {/* ════════════ زر بارز: قياس الأداء الديناميكي ════════════ */}
      {PERFORMANCE_REPORTS_ENABLED && (
        <Link
          href="/reports/performance"
          className="block group rounded-2xl overflow-hidden relative transition-all hover:shadow-lg"
          style={{
            background: 'linear-gradient(135deg, #3A3D44 0%, #1A1B20 100%)',
            border: '1px solid rgba(192,138,72,0.30)',
            boxShadow: '0 4px 20px rgba(58,61,68,0.15)',
          }}
        >
          {/* topographic background */}
          <svg
            style={{ position: 'absolute', inset: 0, opacity: 0.18, pointerEvents: 'none' }}
            preserveAspectRatio="none"
            viewBox="0 0 800 200"
          >
            <g stroke="#C08A48" strokeWidth="0.8" fill="none">
              <ellipse cx="700" cy="170" rx="80" ry="50" />
              <ellipse cx="700" cy="170" rx="130" ry="80" />
              <ellipse cx="700" cy="170" rx="180" ry="110" />
              <path d="M-50 50 Q 100 70 200 40 T 450 90 T 850 60" />
              <path d="M-50 110 Q 150 130 300 100 T 600 150" />
            </g>
          </svg>

          <div className="relative px-6 py-5 flex items-center gap-5">
            <div
              className="flex-shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, #C08A48, #D4A24C)',
                boxShadow: '0 4px 14px rgba(192,138,72,0.45)',
              }}
            >
              <Sparkles className="w-7 h-7 text-white" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(192,138,72,0.20)', color: '#D4A24C', letterSpacing: '0.06em' }}
                >
                  جديد
                </span>
                <span className="text-[11px] font-semibold" style={{ color: '#D4A24C' }}>
                  مساقات ديناميكية + تصدير Excel/PDF
                </span>
              </div>
              <h2
                className="m-0 text-white"
                style={{ fontFamily: 'var(--font-noto-kufi), serif', fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}
              >
                قياس الأداء — تقرير إنجاز الطلاب
              </h2>
              <p className="mt-1 text-[12.5px]" style={{ color: 'rgba(255,255,255,0.70)' }}>
                لوحة احترافية بالمسارين العلمي والتربوي · المفترض/الفعلي · ألوان حسب الأداء · إدارة المساقات والاستثناءات
              </p>
            </div>

            <div
              className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold transition-all group-hover:translate-x-[-3px]"
              style={{
                background: 'rgba(255,255,255,0.10)',
                border: '1px solid rgba(255,255,255,0.20)',
                color: '#fff',
                backdropFilter: 'blur(8px)',
              }}
            >
              فتح اللوحة
              <ArrowLeft className="w-4 h-4" />
            </div>
          </div>
        </Link>
      )}

      {/* Report type cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">
        {REPORT_TYPES.map(rt => {
          const Icon = rt.icon
          return (
            <button
              key={rt.id}
              onClick={() => setActiveReport(rt.id)}
              className={`text-right p-4 rounded-2xl border-2 transition-all ${activeReport === rt.id ? 'border-indigo-500 bg-indigo-500/10' : 'border-white/5 bg-white/5 hover:border-white/10'}`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${rt.color}`}>
                <Icon className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{rt.label}</h3>
              <p className="text-xs mt-1 line-clamp-2" style={{ color: 'var(--text-muted)' }}>{rt.desc}</p>
            </button>
          )
        })}
      </div>

      {/* Monthly Report Preview */}
      {activeReport === 'monthly' && (
        <div className="space-y-5">
          <div className="card-static p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-bold" style={{ color: 'var(--text-primary)' }}>التقرير الشهري — مارس 2026</h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>تم التوليد تلقائياً</p>
              </div>
              <span className="text-xs bg-emerald-500/10 text-emerald-400 px-3 py-1 rounded-full font-medium">جاهز للتصدير</span>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              {[
                { label: 'إجمالي الطلاب', value: monthlyStats.totalStudents },
                { label: 'نسبة الحضور', value: `${monthlyStats.attendanceToday}%` },
                { label: 'الطلاب المتعثرون', value: monthlyStats.strugglingStudents },
                { label: 'أجزاء مختبرة', value: monthlyStats.juzsTestedThisMonth },
              ].map((item, i) => (
                <div key={i} className="bg-white/5 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold font-mono" style={{ color: 'var(--text-primary)' }}>{item.value}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{item.label}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div>
                <h3 className="font-bold text-sm mb-3" style={{ color: 'var(--text-primary)' }}>مقارنة الإنجاز الشهري</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="c46" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#C08A48" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#C08A48" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="c48" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#356B6E" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#356B6E" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
                    <Tooltip />
                    <Area type="monotone" dataKey="دفعة 46" stroke="#C08A48" fill="url(#c46)" strokeWidth={2} />
                    <Area type="monotone" dataKey="دفعة 48" stroke="#356B6E" fill="url(#c48)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div>
                <h3 className="font-bold text-sm mb-3" style={{ color: 'var(--text-primary)' }}>توزيع الطلاب على الدفعات</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <RePieChart>
                    <Pie data={pieData} cx="50%" cy="50%" outerRadius={75} dataKey="value" nameKey="name" label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false}>
                      {pieData.map((entry, index) => (
                        <Cell key={index} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </RePieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Batch performance summary */}
          <div className="card-static p-5">
            <h3 className="font-bold mb-4" style={{ color: 'var(--text-primary)' }}>أداء الدفعات</h3>
            <div className="space-y-3">
              {batches.map((batch, i) => (
                <div key={batch.id} className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: BATCH_COLORS[i % BATCH_COLORS.length] }} />
                  <span className="text-sm w-24" style={{ color: 'var(--text-secondary)' }}>{batch.name}</span>
                  <div className="progress-bar flex-1">
                    <div className="progress-bar-fill green" style={{ width: `${batch.completion_percentage}%`, backgroundColor: BATCH_COLORS[i % BATCH_COLORS.length] }} />
                  </div>
                  <span className="text-sm font-semibold font-mono w-12 text-left" style={{ color: 'var(--text-primary)' }}>{batch.completion_percentage}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Other report types placeholder */}
      {activeReport !== 'monthly' && (
        <div className="card-static p-12 text-center">
          <FileText className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
          <h3 className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{REPORT_TYPES.find(r => r.id === activeReport)?.label}</h3>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>سيتم توليد هذا التقرير قريباً</p>
          <button className="btn-primary btn-ripple mt-4 px-6 py-2.5 text-sm font-medium text-white rounded-xl">
            توليد التقرير
          </button>
        </div>
      )}
    </div>
  )
}
