'use client'
import { useState } from 'react'
import { Wallet, DollarSign, AlertCircle, CheckCircle, Plus, Download, TrendingDown, TrendingUp } from 'lucide-react'
import { formatCurrency, getStatusColor, getStatusLabel, getBatchName } from '@/lib/utils'

const BUDGET_RECORDS = [
  { id: 'b1', batch_id: 46, month: 3, year: 2026, allocated: 8000, spent: 6200, status: 'closed', notes: 'تم إغلاق العهدة في الموعد المحدد' },
  { id: 'b2', batch_id: 48, month: 3, year: 2026, allocated: 6000, spent: 4800, status: 'closed', notes: '' },
  { id: 'b3', batch_id: 46, month: 4, year: 2026, allocated: 8000, spent: 1500, status: 'open', notes: 'العهدة مفتوحة - يُغلق في 1 مايو' },
  { id: 'b4', batch_id: 48, month: 4, year: 2026, allocated: 6000, spent: 900, status: 'open', notes: '' },
  { id: 'b5', batch_id: 44, month: 4, year: 2026, allocated: 7000, spent: 2100, status: 'open', notes: '' },
  { id: 'b6', batch_id: 42, month: 4, year: 2026, allocated: 10000, spent: 3400, status: 'open', notes: 'ميزانية التخرج مضافة' },
]

const FEE_RECORDS = [
  { id: 'fee_1', student_name: 'أحمد الزنيدي', amount: 15800, paid_amount: 15800, status: 'paid' },
  { id: 'fee_2', student_name: 'أسامة الصقير', amount: 15800, paid_amount: 15800, status: 'paid' },
  { id: 'fee_3', student_name: 'أسامة رجب', amount: 15800, paid_amount: 15800, status: 'paid' },
  { id: 'fee_4', student_name: 'أنس عفاص', amount: 15800, paid_amount: 15800, status: 'paid' },
  { id: 'fee_5', student_name: 'إلياس الدويش', amount: 15800, paid_amount: 15800, status: 'paid' },
  { id: 'fee_6', student_name: 'حارث الجربا', amount: 15800, paid_amount: 15800, status: 'paid' },
  { id: 'fee_7', student_name: 'خالد ذيبان', amount: 15800, paid_amount: 15800, status: 'paid' },
  { id: 'fee_8', student_name: 'عاصم القحطاني', amount: 15800, paid_amount: 15800, status: 'paid' },
  { id: 'fee_9', student_name: 'عامر أحمد', amount: 15800, paid_amount: 15800, status: 'paid' },
  { id: 'fee_10', student_name: 'عبدالله آل سلطان', amount: 15800, paid_amount: 15800, status: 'paid' },
  { id: 'fee_11', student_name: 'عبدالله السقا', amount: 15800, paid_amount: 15800, status: 'paid' },
  { id: 'fee_12', student_name: 'عبدالله المشحم', amount: 15800, paid_amount: 15800, status: 'paid' },
  { id: 'fee_13', student_name: 'عبدالله النجار', amount: 15800, paid_amount: 15800, status: 'paid' },
  { id: 'fee_14', student_name: 'عبدالعزيز خلبوص', amount: 15800, paid_amount: 15800, status: 'paid' },
  { id: 'fee_15', student_name: 'عبدالعزيز القاسم', amount: 15800, paid_amount: 8000, status: 'partial' },
  { id: 'fee_16', student_name: 'عبدالملك التويجري', amount: 15800, paid_amount: 8000, status: 'partial' },
  { id: 'fee_17', student_name: 'عبدالملك الحربي', amount: 15800, paid_amount: 8000, status: 'partial' },
  { id: 'fee_18', student_name: 'عبدالملك القحطاني', amount: 15800, paid_amount: 0, status: 'exempt' },
  { id: 'fee_19', student_name: 'عبدالملك فهاد', amount: 15800, paid_amount: 0, status: 'pending' },
  { id: 'fee_20', student_name: 'عزام التويجري', amount: 15800, paid_amount: 0, status: 'pending' },
]

const ANNUAL_BUDGET = {
  total: 280000,
  spent: 142000,
  items: [
    { label: 'البرامج التربوية', allocated: 80000, spent: 38000 },
    { label: 'رسوم المعلمين', allocated: 120000, spent: 65000 },
    { label: 'المواد التعليمية', allocated: 30000, spent: 18000 },
    { label: 'الأنشطة والرحلات', allocated: 50000, spent: 21000 },
  ]
}

export default function BudgetPage() {
  const [activeTab, setActiveTab] = useState<'budget' | 'fees'>('budget')

  const totalAllocated = BUDGET_RECORDS.filter(b => b.status === 'open').reduce((sum, b) => sum + b.allocated, 0)
  const totalSpent = BUDGET_RECORDS.filter(b => b.status === 'open').reduce((sum, b) => sum + b.spent, 0)

  const paidFees = FEE_RECORDS.filter(f => f.status === 'paid').length
  const pendingFees = FEE_RECORDS.filter(f => f.status === 'pending').length
  const totalFeesCollected = FEE_RECORDS.reduce((sum, f) => sum + f.paid_amount, 0)

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>الميزانية والعهد</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>متابعة المصروفات والرسوم الدراسية</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">
        <div className="card-static p-4">
          <div className="flex items-center gap-2 mb-1">
            <Wallet className="w-4 h-4 text-blue-500" />
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>الميزانية الكلية</p>
          </div>
          <p className="text-xl font-extrabold font-mono" style={{ color: 'var(--text-primary)' }}>{formatCurrency(ANNUAL_BUDGET.total)}</p>
        </div>
        <div className="card-static p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown className="w-4 h-4 text-red-400" />
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>المصروف حتى الآن</p>
          </div>
          <p className="text-xl font-extrabold font-mono" style={{ color: 'var(--text-primary)' }}>{formatCurrency(ANNUAL_BUDGET.spent)}</p>
        </div>
        <div className="card-static p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>رسوم مُحصَّلة</p>
          </div>
          <p className="text-xl font-extrabold font-mono" style={{ color: 'var(--text-primary)' }}>{formatCurrency(totalFeesCollected)}</p>
        </div>
        <div className="card-static p-4">
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle className="w-4 h-4 text-red-400" />
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>رسوم متأخرة</p>
          </div>
          <p className="text-xl font-extrabold font-mono text-red-400">{pendingFees}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white/5 p-1 rounded-xl w-fit">
        <button onClick={() => setActiveTab('budget')} className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'budget' ? 'bg-white/10 shadow-sm' : ''}`} style={{ color: activeTab === 'budget' ? 'var(--text-primary)' : 'var(--text-muted)' }}>
          العهد والميزانية
        </button>
        <button onClick={() => setActiveTab('fees')} className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'fees' ? 'bg-white/10 shadow-sm' : ''}`} style={{ color: activeTab === 'fees' ? 'var(--text-primary)' : 'var(--text-muted)' }}>
          الرسوم الدراسية
        </button>
      </div>

      {/* Budget Tab */}
      {activeTab === 'budget' && (
        <div className="space-y-5">
          {/* Annual budget overview */}
          <div className="card-static p-5">
            <h2 className="font-bold mb-4" style={{ color: 'var(--text-primary)' }}>الميزانية السنوية — بنود الصرف</h2>
            <div className="space-y-4">
              {ANNUAL_BUDGET.items.map((item, i) => {
                const pct = Math.round((item.spent / item.allocated) * 100)
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between text-sm mb-1.5">
                      <span className="font-medium" style={{ color: 'var(--text-secondary)' }}>{item.label}</span>
                      <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                        <span>المصروف: <strong className="font-mono" style={{ color: 'var(--text-primary)' }}>{formatCurrency(item.spent)}</strong></span>
                        <span>المخطط: <strong className="font-mono" style={{ color: 'var(--text-primary)' }}>{formatCurrency(item.allocated)}</strong></span>
                        <span className={`font-semibold ${pct > 80 ? 'text-red-600' : pct > 60 ? 'text-yellow-600' : 'text-green-600'}`}>{pct}%</span>
                      </div>
                    </div>
                    <div className="progress-bar">
                      <div
                        className={`progress-bar-fill ${pct > 80 ? 'red' : pct > 60 ? 'yellow' : 'green'}`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Monthly budget records */}
          <div className="card-static overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
              <h2 className="font-bold" style={{ color: 'var(--text-primary)' }}>عهدة أبريل 2026</h2>
              <div className="flex gap-2">
                <button className="flex items-center gap-2 px-3 py-1.5 text-xs border border-white/10 rounded-lg hover:bg-white/5" style={{ color: 'var(--text-secondary)' }}>
                  <Plus className="w-3.5 h-3.5" />
                  تسجيل مصروف
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white/5 border-b border-white/5">
                    <th className="text-right px-5 py-3 font-semibold" style={{ color: 'var(--text-muted)' }}>الدفعة</th>
                    <th className="text-right px-5 py-3 font-semibold" style={{ color: 'var(--text-muted)' }}>المخصص</th>
                    <th className="text-right px-5 py-3 font-semibold" style={{ color: 'var(--text-muted)' }}>المصروف</th>
                    <th className="text-right px-5 py-3 font-semibold" style={{ color: 'var(--text-muted)' }}>المتبقي</th>
                    <th className="text-right px-5 py-3 font-semibold" style={{ color: 'var(--text-muted)' }}>الحالة</th>
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {BUDGET_RECORDS.filter(b => b.month === 4).map(record => {
                    const remaining = record.allocated - record.spent
                    return (
                      <tr key={record.id} className="border-b border-white/5 hover:bg-white/5">
                        <td className="px-5 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>{getBatchName(record.batch_id!)}</td>
                        <td className="px-5 py-3 font-mono" style={{ color: 'var(--text-secondary)' }}>{formatCurrency(record.allocated)}</td>
                        <td className="px-5 py-3 font-mono" style={{ color: 'var(--text-secondary)' }}>{formatCurrency(record.spent)}</td>
                        <td className="px-5 py-3">
                          <span className={`font-semibold font-mono ${remaining < 1000 ? 'text-red-400' : 'text-emerald-400'}`}>
                            {formatCurrency(remaining)}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${record.status === 'open' ? 'bg-blue-500/10 text-blue-400' : 'bg-white/5 text-gray-400'}`}>
                            {record.status === 'open' ? 'مفتوح' : 'مغلق'}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          {record.status === 'open' && (
                            <button className="text-xs text-indigo-400 hover:text-indigo-300 font-medium">إغلاق العهدة</button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-3 bg-amber-500/10 border-t border-amber-500/20">
              <p className="text-xs text-amber-400 flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5" />
                تذكير: موعد إغلاق العهدة الشهرية هو اليوم الأول من كل شهر
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Fees Tab */}
      {activeTab === 'fees' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex gap-4 text-sm">
              <span style={{ color: 'var(--text-secondary)' }}>مسدد: <strong className="text-emerald-400 font-mono">{paidFees}</strong></span>
              <span style={{ color: 'var(--text-secondary)' }}>متأخر: <strong className="text-red-400 font-mono">{pendingFees}</strong></span>
            </div>
            <div className="flex gap-2 text-xs">
              <div className="bg-blue-500/10 text-blue-400 px-3 py-1.5 rounded-lg">الرسوم الكاملة: 15,800 ريال</div>
              <div className="bg-yellow-500/10 text-yellow-400 px-3 py-1.5 rounded-lg">خصم الإخوة: 20%</div>
            </div>
          </div>
          <div className="card-static overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white/5 border-b border-white/5">
                  <th className="text-right px-5 py-3 font-semibold" style={{ color: 'var(--text-muted)' }}>الطالب</th>
                  <th className="text-right px-5 py-3 font-semibold" style={{ color: 'var(--text-muted)' }}>الرسوم</th>
                  <th className="text-right px-5 py-3 font-semibold" style={{ color: 'var(--text-muted)' }}>المدفوع</th>
                  <th className="text-right px-5 py-3 font-semibold" style={{ color: 'var(--text-muted)' }}>المتبقي</th>
                  <th className="text-right px-5 py-3 font-semibold" style={{ color: 'var(--text-muted)' }}>الحالة</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {FEE_RECORDS.map(fee => (
                  <tr key={fee.id} className={`border-b border-white/5 hover:bg-white/5 ${fee.status === 'pending' ? 'bg-red-500/5' : ''}`}>
                    <td className="px-5 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>{fee.student_name}</td>
                    <td className="px-5 py-3 font-mono" style={{ color: 'var(--text-secondary)' }}>{formatCurrency(fee.amount)}</td>
                    <td className="px-5 py-3 text-emerald-400 font-medium font-mono">{formatCurrency(fee.paid_amount)}</td>
                    <td className="px-5 py-3">
                      <span className={`font-mono ${fee.amount - fee.paid_amount > 0 ? 'text-red-400 font-medium' : ''}`} style={fee.amount - fee.paid_amount <= 0 ? { color: 'var(--text-muted)' } : undefined}>
                        {formatCurrency(fee.amount - fee.paid_amount)}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(fee.status)}`}>
                        {getStatusLabel(fee.status)}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {fee.status !== 'paid' && fee.status !== 'exempt' && (
                        <button className="text-xs text-indigo-400 hover:text-indigo-300 font-medium">تسجيل دفعة</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
