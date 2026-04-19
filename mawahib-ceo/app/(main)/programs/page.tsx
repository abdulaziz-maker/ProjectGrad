'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  getPrograms, upsertProgram, deleteProgram, getStudents,
  getProgramAttendance, saveProgramAttendance,
  DBProgram, DBStudent,
} from '@/lib/db'
import { toHijriShort } from '@/lib/hijri'
import { toast } from 'sonner'
import { Loader2, CheckCheck, Check, X, AlertCircle, Users as UsersIcon } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

type ProgAttStatus = 'present' | 'absent' | 'excused'
const PROG_ATT_META: Record<ProgAttStatus, { label: string; bg: string; bgSoft: string; textSoft: string; icon: typeof Check }> = {
  present: { label: 'حاضر',      bg: '#16a34a', bgSoft: '#f0fdf4', textSoft: '#15803d', icon: Check },
  absent:  { label: 'غائب',      bg: '#B94838', bgSoft: '#fef2f2', textSoft: '#b91c1c', icon: X },
  excused: { label: 'غائب بعذر', bg: '#eab308', bgSoft: '#fefce8', textSoft: '#854d0e', icon: AlertCircle },
}

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
  const role = profile?.role
  const isScopedToBatch = role === 'supervisor' || role === 'teacher' || role === 'batch_manager'
  const myBatchIdStr = profile?.batch_id ? String(profile.batch_id) : null

  const [programs, setPrograms] = useState<DBProgram[]>([])
  const [allStudents, setAllStudents] = useState<DBStudent[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(() => ({
    ...emptyForm(),
    batch_id: myBatchIdStr ?? '46',
  }))
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<DBProgram | null>(null)
  const [reportId, setReportId] = useState<string | null>(null)
  const [reportText, setReportText] = useState('')
  const [saving, setSaving] = useState(false)

  // حضور البرنامج
  const [attendanceFor, setAttendanceFor] = useState<DBProgram | null>(null)
  const [progAttRecords, setProgAttRecords] = useState<Record<string, ProgAttStatus>>({})
  const [progAttSaving, setProgAttSaving] = useState(false)

  useEffect(() => {
    Promise.all([getPrograms(), getStudents()])
      .then(([progs, studs]) => {
        // أي مستخدم مقيّد بدفعة (مشرف/معلم/مدير دفعة) يرى برامج دفعته فقط + 'all'
        const visible = (isScopedToBatch && myBatchIdStr)
          ? progs.filter(p => p.batch_id === myBatchIdStr || p.batch_id === 'all')
          : progs
        setPrograms(visible)
        setAllStudents(studs)
      })
      .catch(() => toast.error('خطأ في تحميل البرامج'))
      .finally(() => setLoading(false))
  }, [isScopedToBatch, myBatchIdStr])

  // Backward-compat: بعض أجزاء العرض القديمة تستخدم `isSupervisor`
  const isSupervisor = role === 'supervisor' || role === 'teacher'
  const supervisorBatchId = (isSupervisor && myBatchIdStr) ? myBatchIdStr : null

  // فتح مودال الحضور لبرنامج معيَّن
  const openAttendance = useCallback(async (prog: DBProgram) => {
    setAttendanceFor(prog)
    try {
      const existing = await getProgramAttendance(prog.id)
      const map: Record<string, ProgAttStatus> = {}
      for (const r of existing) map[r.student_id] = r.status
      setProgAttRecords(map)
    } catch {
      setProgAttRecords({})
    }
  }, [])

  const setProgAttStatus = (studentId: string, st: ProgAttStatus) =>
    setProgAttRecords(prev => ({ ...prev, [studentId]: st }))

  const markAllProgAtt = (status: ProgAttStatus, studentIds: string[]) => {
    setProgAttRecords(prev => {
      const next = { ...prev }
      for (const id of studentIds) next[id] = status
      return next
    })
  }

  const saveProgAttendance = async () => {
    if (!attendanceFor) return
    setProgAttSaving(true)
    try {
      await saveProgramAttendance(attendanceFor.id, progAttRecords)
      toast.success('تم حفظ حضور البرنامج')
      setAttendanceFor(null)
      setProgAttRecords({})
    } catch {
      toast.error('خطأ في حفظ الحضور')
    } finally {
      setProgAttSaving(false)
    }
  }

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
      // نحترم اختيار المشرف لحالة البرنامج (قد يختم برنامجاً مبكراً أو يعيد فتحه).
      // لو أراد الحالة التلقائية فأزرار الحالة في النموذج تعرض الخيارات الثلاثة.
      const updated = { ...editForm }
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
          <Loader2 className="w-8 h-8 animate-spin text-[#C08A48] mx-auto" />
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
                <div key={program.id} className="card-static border-2 p-6" style={{ borderColor: '#C08A48' }}>
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
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                        حالة البرنامج
                        <span className="text-[11px] font-normal mr-2" style={{ color: 'var(--text-muted)' }}>(يُحدَّد تلقائياً حسب التاريخ — يمكن تعديلها يدوياً)</span>
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {([
                          { val: 'upcoming',  label: 'قادم',   color: '#356B6E' },
                          { val: 'ongoing',   label: 'جارٍ',   color: '#C08A48' },
                          { val: 'completed', label: 'مكتمل',  color: '#5A8F67' },
                        ] as const).map(opt => {
                          const active = editForm.status === opt.val
                          return (
                            <button key={opt.val} type="button"
                              onClick={() => setEditForm({ ...editForm, status: opt.val })}
                              className="py-2.5 px-3 rounded-xl text-sm font-semibold transition-all active:scale-[0.98]"
                              style={{
                                background: active ? opt.color : 'var(--bg-card)',
                                color: active ? '#fff' : 'var(--text-secondary)',
                                border: `1.5px solid ${active ? opt.color : 'var(--border-color)'}`,
                                boxShadow: active ? `0 2px 8px ${opt.color}40` : 'none',
                              }}>
                              {opt.label}
                            </button>
                          )
                        })}
                      </div>
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
                        <span className="text-xs font-semibold" style={{ color: '#C08A48' }}>تقرير البرنامج: </span>
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
                  <div className="flex flex-col gap-2 shrink-0 w-36 sm:w-40">
                    <button onClick={() => openAttendance(program)}
                      className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-white whitespace-nowrap transition-all hover:opacity-90 active:scale-[0.98]"
                      style={{
                        background: 'linear-gradient(135deg, #C08A48 0%, #8B5A1E 100%)',
                        boxShadow: '0 2px 8px rgba(192,138,72,0.28), inset 0 0 0 1px rgba(255,255,255,0.08)',
                      }}>
                      <UsersIcon className="w-3.5 h-3.5 shrink-0" />
                      <span>تحضير الطلاب</span>
                    </button>
                    <button onClick={() => { setEditId(program.id); setEditForm({ ...program }); setShowForm(false) }}
                      className="w-full inline-flex items-center justify-center px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all hover:bg-[var(--bg-subtle)] active:scale-[0.98]"
                      style={{ border: '1px solid var(--border-color)', color: 'var(--text-secondary)', background: 'var(--bg-card)' }}>
                      تعديل
                    </button>
                    {!isReporting && (
                      <button onClick={() => { setReportId(program.id); setReportText(program.report || '') }}
                        className="btn-primary btn-ripple w-full inline-flex items-center justify-center px-3 py-2 rounded-xl text-xs font-semibold text-white whitespace-nowrap hover:opacity-90 active:scale-[0.98]">
                        تقرير
                      </button>
                    )}
                    <button onClick={() => handleDelete(program.id)}
                      className="w-full inline-flex items-center justify-center px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all hover:bg-red-50 active:scale-[0.98]"
                      style={{ border: '1px solid rgba(185,72,56,0.22)', color: '#B94838', background: 'transparent' }}>
                      حذف
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* مودال تحضير الطلاب داخل البرنامج */}
        {attendanceFor && (() => {
          const progStudents = attendanceFor.batch_id === 'all'
            ? allStudents
            : allStudents.filter(s => s.batch_id === Number(attendanceFor.batch_id))
          const studIds = progStudents.map(s => s.id)
          const presentCount = studIds.filter(id => progAttRecords[id] === 'present').length
          const absentCount = studIds.filter(id => progAttRecords[id] === 'absent').length
          const excusedCount = studIds.filter(id => progAttRecords[id] === 'excused').length

          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setAttendanceFor(null)}>
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col" dir="rtl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
                  <div>
                    <h2 className="text-base font-bold" style={{ color: '#C08A48' }}>تحضير الطلاب — {attendanceFor.name}</h2>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {BATCH_LABEL[attendanceFor.batch_id] ?? attendanceFor.batch_id} — {progStudents.length} طالب
                    </p>
                  </div>
                  <button onClick={() => setAttendanceFor(null)} className="text-xl leading-none" style={{ color: 'var(--text-muted)' }}>×</button>
                </div>

                <div className="px-6 py-3 border-b flex flex-wrap gap-2 items-center justify-between" style={{ borderColor: 'var(--border-color)' }}>
                  <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md" style={{ background: '#f0fdf4', color: '#15803d' }}>حاضر: {presentCount}</span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md" style={{ background: '#fef2f2', color: '#b91c1c' }}>غائب: {absentCount}</span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md" style={{ background: '#fefce8', color: '#854d0e' }}>بعذر: {excusedCount}</span>
                  </div>
                  <div className="quick-mark-buttons">
                    <button onClick={() => markAllProgAtt('present', studIds)} className="quick-mark-btn quick-mark-btn--sm" data-kind="present">
                      <span className="qm-icon"><CheckCheck className="w-3 h-3" /></span><span>تحضير</span>
                    </button>
                    <button onClick={() => markAllProgAtt('absent', studIds)} className="quick-mark-btn quick-mark-btn--sm" data-kind="absent">
                      <span className="qm-icon"><X className="w-3 h-3" /></span><span>تغييب</span>
                    </button>
                    <button onClick={() => markAllProgAtt('excused', studIds)} className="quick-mark-btn quick-mark-btn--sm" data-kind="excused">
                      <span className="qm-icon"><AlertCircle className="w-3 h-3" /></span><span>بعذر</span>
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-3">
                  {progStudents.length === 0 ? (
                    <p className="text-sm text-center py-8" style={{ color: 'var(--text-muted)' }}>لا يوجد طلاب في هذه الدفعة</p>
                  ) : (
                    <div className="attendance-roster space-y-2">
                      {progStudents.map((student, idx) => {
                        const st = progAttRecords[student.id]
                        const activeMeta = st ? PROG_ATT_META[st] : null
                        const initial = (student.name || '؟').trim().charAt(0)
                        return (
                          <div
                            key={student.id}
                            className="attendance-row card-static"
                            data-status={st ?? 'unset'}
                            style={{
                              // @ts-expect-error — CSS custom prop
                              '--row-accent': activeMeta?.bg ?? 'transparent',
                              '--row-tint': activeMeta ? `${activeMeta.bg}0D` : 'transparent',
                            }}
                          >
                            <div className="flex items-center gap-3 sm:gap-4 px-3 sm:px-4 py-2.5 sm:py-3">
                              <span className="attendance-row-accent" aria-hidden="true" />
                              <div
                                className="attendance-avatar shrink-0"
                                style={{
                                  background: activeMeta
                                    ? `linear-gradient(145deg, ${activeMeta.bg}, ${activeMeta.bg}CC)`
                                    : 'linear-gradient(145deg, #3A3D44, #1A1B20)',
                                  color: activeMeta ? '#fff' : '#E8C48A',
                                  boxShadow: activeMeta
                                    ? `0 4px 12px ${activeMeta.bg}40, inset 0 0 0 1px rgba(255,255,255,0.08)`
                                    : '0 4px 12px rgba(26,27,32,0.18), inset 0 0 0 1px rgba(192,138,72,0.20)',
                                }}
                              >
                                <span className="attendance-avatar-initial">{initial}</span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-[14px] font-bold truncate" style={{ color: 'var(--text-primary)', lineHeight: 1.3 }}>
                                  {student.name}
                                </p>
                                <p className="text-[11px] mt-0.5 font-mono" style={{ color: 'var(--text-muted)' }}>
                                  #{String(idx + 1).padStart(2, '0')}
                                  {activeMeta && (
                                    <>
                                      {' · '}
                                      <span style={{ color: activeMeta.bg, fontWeight: 700 }}>{activeMeta.label}</span>
                                    </>
                                  )}
                                </p>
                              </div>
                              <div role="radiogroup" aria-label={`حالة ${student.name}`} className="attendance-segment shrink-0">
                                {(['present','absent','excused'] as const).map(s => {
                                  const meta = PROG_ATT_META[s]
                                  const active = st === s
                                  const Icon = meta.icon
                                  return (
                                    <button
                                      key={s}
                                      role="radio"
                                      aria-checked={active}
                                      onClick={() => setProgAttStatus(student.id, s)}
                                      className="attendance-segment-btn"
                                      data-active={active}
                                      style={{
                                        // @ts-expect-error CSS var
                                        '--seg-color': meta.bg,
                                        '--seg-soft': meta.bgSoft,
                                      }}
                                      title={meta.label}
                                    >
                                      <Icon className="attendance-segment-icon" size={13} />
                                      <span className="attendance-segment-label">{meta.label}</span>
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                <div className="px-6 py-3 border-t flex gap-3" style={{ borderColor: 'var(--border-color)' }}>
                  <button
                    onClick={saveProgAttendance}
                    disabled={progAttSaving || progStudents.length === 0}
                    className="btn-primary btn-ripple flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-white text-sm font-medium disabled:opacity-50"
                  >
                    {progAttSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                    حفظ الحضور
                  </button>
                  <button
                    onClick={() => setAttendanceFor(null)}
                    className="flex-1 border py-2 rounded-xl text-sm font-medium"
                    style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
                  >
                    إلغاء
                  </button>
                </div>
              </div>
            </div>
          )
        })()}
      </div>
    </div>
  )
}
