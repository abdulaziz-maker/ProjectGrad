'use client'

import { useState, useEffect } from 'react'
import { getPrograms, upsertProgram, deleteProgram, DBProgram } from '@/lib/db'
import { toHijriShort } from '@/lib/hijri'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

const TYPE_LABELS: Record<string, string> = {
  safra: 'سفرة', mabit: 'مبيت', nadi: 'نادي / رحلة',
}
const TYPE_COLORS: Record<string, string> = {
  safra: 'bg-emerald-100 text-emerald-800',
  mabit: 'bg-blue-100 text-blue-800',
  nadi: 'bg-purple-100 text-purple-800',
}
const STATUS_LABELS: Record<string, string> = { upcoming: 'قادم', ongoing: 'جارٍ', completed: 'مكتمل' }
const STATUS_COLORS: Record<string, string> = {
  upcoming: 'bg-amber-100 text-amber-800',
  ongoing: 'bg-sky-100 text-sky-800',
  completed: 'bg-green-100 text-green-800',
}
const BATCH_OPTIONS = [
  { value: '46', label: 'دفعة 46' }, { value: '48', label: 'دفعة 48' },
  { value: '44', label: 'دفعة 44' }, { value: '42', label: 'دفعة 42' },
  { value: 'all', label: 'جميع الدفعات' },
]
const BATCH_LABEL: Record<string, string> = { '46': 'دفعة 46', '48': 'دفعة 48', '44': 'دفعة 44', '42': 'دفعة 42', 'all': 'جميع الدفعات' }

function emptyForm() {
  return { name: '', batch_id: '46', type: 'safra', start_date: '', end_date: '', location: '', budget: 0, objectives: '' }
}
function computeStatus(start: string, end: string): string {
  const today = new Date().toISOString().split('T')[0]
  if (end < today) return 'completed'
  if (start <= today && end >= today) return 'ongoing'
  return 'upcoming'
}

export default function ProgramsPage() {
  const { profile } = useAuth()
  const isSupervisor = profile?.role === 'supervisor' || profile?.role === 'teacher'
  const supervisorBatchId = profile?.batch_id ? String(profile.batch_id) : null

  const [programs, setPrograms] = useState<DBProgram[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(() => ({
    ...emptyForm(),
    batch_id: supervisorBatchId ?? '46',
  }))
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<DBProgram | null>(null)
  const [reportId, setReportId] = useState<string | null>(null)
  const [reportText, setReportText] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getPrograms()
      .then(data => {
        // Supervisors only see programs for their batch
        const visible = (isSupervisor && supervisorBatchId)
          ? data.filter(p => p.batch_id === supervisorBatchId || p.batch_id === 'all')
          : data
        setPrograms(visible)
      })
      .catch(() => toast.error('خطأ في تحميل البرامج'))
      .finally(() => setLoading(false))
  }, [isSupervisor, supervisorBatchId])

  async function handleAdd() {
    if (!form.name || !form.start_date || !form.end_date) return
    setSaving(true)
    try {
      const newProgram: DBProgram = {
        id: `prog_${Date.now()}`,
        name: form.name,
        batch_id: form.batch_id,
        type: form.type,
        start_date: form.start_date,
        end_date: form.end_date,
        location: form.location,
        budget: form.budget,
        objectives: form.objectives,
        report: '',
        status: computeStatus(form.start_date, form.end_date),
      }
      await upsertProgram(newProgram)
      setPrograms(prev => [...prev, newProgram])
      setForm({ ...emptyForm(), batch_id: supervisorBatchId ?? '46' })
      setShowForm(false)
      toast.success('تم إضافة البرنامج بنجاح')
    } catch {
      toast.error('خطأ في الحفظ')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteProgram(id)
      setPrograms(prev => prev.filter(p => p.id !== id))
      toast.success('تم حذف البرنامج')
    } catch {
      toast.error('خطأ في الحذف')
    }
  }

  async function handleEditSave() {
    if (!editForm) return
    setSaving(true)
    try {
      const updated = { ...editForm, status: computeStatus(editForm.start_date, editForm.end_date) }
      await upsertProgram(updated)
      setPrograms(prev => prev.map(p => p.id === updated.id ? updated : p))
      setEditId(null)
      setEditForm(null)
      toast.success('تم تحديث البرنامج')
    } catch {
      toast.error('خطأ في الحفظ')
    } finally {
      setSaving(false)
    }
  }

  async function handleReportSave(id: string) {
    const program = programs.find(p => p.id === id)
    if (!program) return
    try {
      const updated = { ...program, report: reportText }
      await upsertProgram(updated)
      setPrograms(prev => prev.map(p => p.id === id ? updated : p))
      setReportId(null)
      setReportText('')
      toast.success('تم حفظ التقرير')
    } catch {
      toast.error('خطأ في الحفظ')
    }
  }

  const total = programs.length
  const upcoming = programs.filter(p => p.status === 'upcoming').length
  const completed = programs.filter(p => p.status === 'completed').length

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]" dir="rtl">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-[#6366f1] mx-auto" />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>جاري تحميل البرامج...</p>
        </div>
      </div>
    )
  }

  return (
    <div dir="rtl" className="min-h-screen p-6">
      <div className="max-w-5xl mx-auto space-y-6 animate-fade-in-up">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>البرامج والرحلات</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>إدارة جميع البرامج والأنشطة التربوية</p>
          </div>
          <button onClick={() => { setShowForm(!showForm); setEditId(null) }}
            className="btn-primary btn-ripple flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-medium hover:opacity-90">
            <span className="text-lg leading-none">{showForm ? '✕' : '+'}</span>
            {showForm ? 'إلغاء' : 'إضافة برنامج'}
          </button>
        </div>

        <div className="grid grid-cols-3 gap-4 stagger-children">
          {[
            { label: 'إجمالي البرامج', value: total, color: '', colorStyle: 'var(--text-primary)', bg: '' },
            { label: 'برامج قادمة', value: upcoming, color: 'text-amber-500', colorStyle: '', bg: '' },
            { label: 'برامج مكتملة', value: completed, color: 'text-green-500', colorStyle: '', bg: '' },
          ].map(stat => (
            <div key={stat.label} className={`card-static p-5 text-center`}>
              <div className={`text-3xl font-bold font-mono ${stat.color}`} style={stat.colorStyle ? { color: stat.colorStyle } : {}}>{stat.value}</div>
              <div className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>{stat.label}</div>
            </div>
          ))}
        </div>

        {showForm && (
          <div className="card-static p-6">
            <h2 className="text-lg font-bold mb-5" style={{ color: 'var(--text-primary)' }}>إضافة برنامج جديد</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>اسم البرنامج *</label>
                <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="مثال: رحلة الإيمان"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-200" />
              </div>
              {!isSupervisor && (
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>الدفعة</label>
                  <select value={form.batch_id} onChange={e => setForm({ ...form, batch_id: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-200">
                    {BATCH_OPTIONS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>نوع البرنامج</label>
                <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-200">
                  <option value="safra">سفرة — رحلة مطولة (4 أيام+)</option>
                  <option value="mabit">مبيت — برنامج قصير (ليلة أو يومان)</option>
                  <option value="nadi">نادي / رحلة — يوم واحد</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>الموقع</label>
                <input type="text" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })}
                  placeholder="مثال: مخيم الهدا - الطائف"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-200" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>تاريخ البداية *</label>
                <input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-200" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>تاريخ النهاية *</label>
                <input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-200" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>الميزانية (ريال)</label>
                <input type="number" value={form.budget || ''} onChange={e => setForm({ ...form, budget: Number(e.target.value) })}
                  placeholder="0"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-200" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>الأهداف</label>
                <input type="text" value={form.objectives} onChange={e => setForm({ ...form, objectives: e.target.value })}
                  placeholder="أهداف البرنامج التربوية"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-200" />
              </div>
            </div>
            <div className="mt-5 flex justify-end">
              <button onClick={handleAdd} disabled={!form.name || !form.start_date || !form.end_date || saving}
                className="btn-primary btn-ripple flex items-center gap-2 px-6 py-2.5 rounded-xl text-white text-sm font-medium disabled:opacity-40">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                حفظ البرنامج
              </button>
            </div>
          </div>
        )}

        <div className="space-y-4 stagger-children">
          {programs.length === 0 && (
            <div className="card-static p-10 text-center" style={{ color: 'var(--text-muted)' }}>
              لا توجد برامج مضافة بعد
            </div>
          )}

          {programs.map(program => {
            const isEditing = editId === program.id
            const isReporting = reportId === program.id

            if (isEditing && editForm) {
              return (
                <div key={program.id} className="card-static border-2 p-6" style={{ borderColor: '#6366f1' }}>
                  <h3 className="text-base font-bold mb-4" style={{ color: 'var(--text-primary)' }}>تعديل البرنامج</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>الاسم</label>
                      <input type="text" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-200" />
                    </div>
                    {!isSupervisor && (
                      <div>
                        <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>الدفعة</label>
                        <select value={editForm.batch_id} onChange={e => setEditForm({ ...editForm, batch_id: e.target.value })}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-200">
                          {BATCH_OPTIONS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                        </select>
                      </div>
                    )}
                    <div>
                      <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>النوع</label>
                      <select value={editForm.type} onChange={e => setEditForm({ ...editForm, type: e.target.value })}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-200">
                        <option value="safra">سفرة</option>
                        <option value="mabit">مبيت</option>
                        <option value="nadi">نادي / رحلة</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>الموقع</label>
                      <input type="text" value={editForm.location} onChange={e => setEditForm({ ...editForm, location: e.target.value })}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-200" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>تاريخ البداية</label>
                      <input type="date" value={editForm.start_date} onChange={e => setEditForm({ ...editForm, start_date: e.target.value })}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-200" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>تاريخ النهاية</label>
                      <input type="date" value={editForm.end_date} onChange={e => setEditForm({ ...editForm, end_date: e.target.value })}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-200" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>الميزانية</label>
                      <input type="number" value={editForm.budget} onChange={e => setEditForm({ ...editForm, budget: Number(e.target.value) })}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-200" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>الأهداف</label>
                      <input type="text" value={editForm.objectives} onChange={e => setEditForm({ ...editForm, objectives: e.target.value })}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-200" />
                    </div>
                  </div>
                  <div className="mt-4 flex gap-3 justify-end">
                    <button onClick={() => { setEditId(null); setEditForm(null) }}
                      className="px-4 py-2 rounded-xl border border-white/10 text-sm" style={{ color: 'var(--text-secondary)' }}>إلغاء</button>
                    <button onClick={handleEditSave} disabled={saving}
                      className="btn-primary btn-ripple flex items-center gap-2 px-5 py-2 rounded-xl text-white text-sm font-medium hover:opacity-90 disabled:opacity-50">
                      {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                      حفظ التعديلات
                    </button>
                  </div>
                </div>
              )
            }

            return (
              <div key={program.id} className="card p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{program.name}</h3>
                      <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${TYPE_COLORS[program.type] ?? 'bg-gray-100 text-gray-700'}`}>
                        {TYPE_LABELS[program.type] ?? program.type}
                      </span>
                      <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[program.status] ?? 'bg-gray-100 text-gray-700'}`}>
                        {STATUS_LABELS[program.status] ?? program.status}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      <div>
                        <span className="text-xs block mb-0.5" style={{ color: 'var(--text-muted)' }}>الدفعة</span>
                        <p className="font-medium" style={{ color: 'var(--text-secondary)' }}>{BATCH_LABEL[program.batch_id] ?? `دفعة ${program.batch_id}`}</p>
                      </div>
                      <div>
                        <span className="text-xs block mb-0.5" style={{ color: 'var(--text-muted)' }}>الموقع</span>
                        <p className="font-medium text-gray-700 truncate">{program.location || '—'}</p>
                      </div>
                      <div>
                        <span className="text-xs block mb-0.5" style={{ color: 'var(--text-muted)' }}>تاريخ البداية</span>
                        <p className="font-medium" style={{ color: 'var(--text-secondary)' }}>{toHijriShort(program.start_date)}</p>
                      </div>
                      <div>
                        <span className="text-xs block mb-0.5" style={{ color: 'var(--text-muted)' }}>تاريخ النهاية</span>
                        <p className="font-medium" style={{ color: 'var(--text-secondary)' }}>{toHijriShort(program.end_date)}</p>
                      </div>
                      {program.budget > 0 && (
                        <div>
                          <span className="text-xs block mb-0.5" style={{ color: 'var(--text-muted)' }}>الميزانية</span>
                          <p className="font-medium" style={{ color: 'var(--text-secondary)' }}>{program.budget.toLocaleString('ar-SA')} ر.س</p>
                        </div>
                      )}
                      {program.objectives && (
                        <div className="col-span-2 md:col-span-3">
                          <span className="text-xs block mb-0.5" style={{ color: 'var(--text-muted)' }}>الأهداف</span>
                          <p style={{ color: 'var(--text-secondary)' }}>{program.objectives}</p>
                        </div>
                      )}
                    </div>
                    {program.report && (
                      <div className="mt-3 border border-indigo-500/20 rounded-xl px-4 py-3" style={{ background: 'rgba(99,102,241,0.06)' }}>
                        <span className="text-xs font-semibold" style={{ color: '#6366f1' }}>تقرير البرنامج: </span>
                        <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{program.report}</span>
                      </div>
                    )}
                    {isReporting && (
                      <div className="mt-3 space-y-2">
                        <textarea value={reportText} onChange={e => setReportText(e.target.value)} rows={3}
                          placeholder="اكتب تقرير البرنامج هنا..."
                          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-200 resize-none" />
                        <div className="flex gap-2">
                          <button onClick={() => { setReportId(null); setReportText('') }}
                            className="px-3 py-1.5 rounded-lg border border-white/10 text-xs" style={{ color: 'var(--text-secondary)' }}>إلغاء</button>
                          <button onClick={() => handleReportSave(program.id)}
                            className="btn-primary btn-ripple px-4 py-1.5 rounded-lg text-white text-xs font-medium hover:opacity-90">حفظ التقرير</button>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    <button onClick={() => { setEditId(program.id); setEditForm({ ...program }); setShowForm(false) }}
                      className="px-3 py-1.5 rounded-lg border border-white/10 text-xs" style={{ color: 'var(--text-secondary)' }}>تعديل</button>
                    {program.status === 'completed' && !isReporting && (
                      <button onClick={() => { setReportId(program.id); setReportText(program.report || '') }}
                        className="btn-primary btn-ripple px-3 py-1.5 rounded-lg text-xs font-medium text-white hover:opacity-90">تقرير</button>
                    )}
                    <button onClick={() => handleDelete(program.id)}
                      className="px-3 py-1.5 rounded-lg border border-red-100 text-xs text-red-500 hover:bg-red-50">حذف</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
