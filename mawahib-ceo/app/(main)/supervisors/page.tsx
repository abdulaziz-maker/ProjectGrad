'use client'
import { useState, useEffect, useMemo } from 'react'
import { getSupervisors, getStudents, getBatches, upsertSupervisor, type DBSupervisor, type DBStudent, type DBBatch } from '@/lib/db'
import {
  Users, Plus, Loader2, Search, GraduationCap, BookOpen, X, Save,
  UserCheck, ChevronLeft,
} from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'

function toAr(n: number): string { return n.toLocaleString('ar-EG') }

function isReportLate(date: string | null): boolean {
  if (!date) return true
  return (Date.now() - new Date(date).getTime()) / 86400000 > 7
}

// ─── بطاقة المشرف ────────────────────────────────────────────────────────
function SupervisorCard({ supervisor, students }: { supervisor: DBSupervisor; students: DBStudent[] }) {
  const myStudents = students.filter(s => s.supervisor_id === supervisor.id && (s.status === 'active' || !s.status))
  const avgProgress = myStudents.length > 0
    ? Math.round(myStudents.reduce((a, s) => a + (s.completion_percentage ?? 0), 0) / myStudents.length)
    : 0
  const late = isReportLate(supervisor.last_report_date)
  const initial = supervisor.name?.charAt(0) ?? 'م'

  return (
    <div className="rounded-2xl p-4 transition-all hover:shadow-md"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-soft)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white font-black text-lg shrink-0"
          style={{ background: 'linear-gradient(135deg, var(--accent-warm), color-mix(in srgb, var(--accent-warm) 80%, black))' }}>
          {initial}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-base truncate" style={{ color: 'var(--text-primary)' }}>{supervisor.name}</h3>
          <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{supervisor.specialty || 'مشرف'}</p>
        </div>
        {late && (
          <span className="text-[10px] font-bold px-2 py-1 rounded-lg whitespace-nowrap"
            style={{ background: 'rgba(185,72,56,0.1)', color: '#B94838' }}>
            تأخر التقرير
          </span>
        )}
      </div>

      {/* Stats — 3 columns */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <Stat icon={Users} value={myStudents.length} label="طالب" color="var(--accent-warm)" />
        <Stat value={`${toAr(avgProgress)}%`} label="متوسط التقدم"
          color={avgProgress >= 70 ? '#4ade80' : avgProgress >= 40 ? '#facc15' : '#f87171'} />
        <Stat
          value={supervisor.last_report_date
            ? new Date(supervisor.last_report_date).toLocaleDateString('ar-SA-u-nu-latn', { month: 'short', day: 'numeric' })
            : '—'}
          label="آخر تقرير"
          color="var(--text-secondary)"
        />
      </div>

      {/* Action — link to followups */}
      <Link href={`/followups/manager?supervisor=${supervisor.id}`}
        className="flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all active:scale-95"
        style={{ background: 'rgba(192,138,72,0.06)', color: 'var(--accent-warm)' }}>
        <span>عرض متابعات الطلاب</span>
        <ChevronLeft className="w-3.5 h-3.5" />
      </Link>
    </div>
  )
}

function Stat({ icon: Icon, value, label, color }: {
  icon?: React.ElementType; value: string | number; label: string; color: string
}) {
  return (
    <div className="rounded-xl p-2.5 text-center"
      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-faint)' }}>
      {Icon && <Icon className="w-3.5 h-3.5 mx-auto mb-1" style={{ color }} />}
      <p className="font-black text-base tabular-nums leading-none" style={{ color: 'var(--text-primary)' }}>
        {typeof value === 'number' ? toAr(value) : value}
      </p>
      <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>{label}</p>
    </div>
  )
}

// ─── Main ──────────────────────────────────────────────────────────────
export default function SupervisorsPage() {
  const [activeTab, setActiveTab] = useState<'supervisors' | 'teachers'>('supervisors')
  const [supervisors, setSupervisors] = useState<DBSupervisor[]>([])
  const [students, setStudents]       = useState<DBStudent[]>([])
  const [batches, setBatches]         = useState<DBBatch[]>([])
  const [search, setSearch]           = useState('')
  const [loading, setLoading]         = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [form, setForm] = useState({
    name: '', specialty: 'حفظ القرآن الكريم', batch_id: '', experience_years: '', notes: '',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([getSupervisors(), getStudents(), getBatches()])
      .then(([sups, studs, bts]) => {
        setSupervisors(sups)
        setStudents(studs)
        setBatches(bts)
        if (bts.length > 0) setForm(f => ({ ...f, batch_id: String(bts[0].id) }))
      })
      .catch(() => toast.error('خطأ في تحميل البيانات'))
      .finally(() => setLoading(false))
  }, [])

  // فلتر بالاسم
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? supervisors.filter(s => s.name?.toLowerCase().includes(q)) : supervisors
  }, [supervisors, search])

  // تجميع المشرفين حسب الدفعة (تلقائياً يعرض دفعات الـtenant الحالي فقط — RLS)
  const groupedByBatch = useMemo(() => {
    const map = new Map<number, DBSupervisor[]>()
    for (const s of filtered) {
      if (s.batch_id == null) continue
      const list = map.get(s.batch_id) ?? []
      list.push(s)
      map.set(s.batch_id, list)
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0])
  }, [filtered])

  // قائمة المعلمين (تستخدم نفس supervisors جدول لكن تختار التخصص "تعليم" أو حسب الـrating)
  const teachers = filtered

  async function handleAdd() {
    if (!form.name.trim() || !form.batch_id) return
    setSaving(true)
    const newSup: DBSupervisor = {
      id: `sup_${Date.now()}`,
      name: form.name.trim(),
      specialty: form.specialty.trim() || 'حفظ القرآن الكريم',
      experience_years: parseInt(form.experience_years) || 0,
      notes: form.notes.trim(),
      rating: 4,
      student_count: 0,
      last_report_date: null,
      avg_student_progress: 0,
      age: 0, strengths: '', weaknesses: '',
      batch_id: parseInt(form.batch_id),
      user_id: null,
    }
    try {
      await upsertSupervisor(newSup)
      setSupervisors(prev => [...prev, newSup])
      setForm(f => ({ ...f, name: '', experience_years: '', notes: '' }))
      setShowAddForm(false)
      toast.success('تم إضافة المشرف')
    } catch {
      toast.error('خطأ في الحفظ')
    } finally { setSaving(false) }
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--accent-warm)' }} />
    </div>
  )

  return (
    <div className="space-y-5 pb-8 max-w-6xl mx-auto" dir="rtl">

      {/* ─── الرأس ─── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(192,138,72,0.12)' }}>
            <UserCheck className="w-5 h-5" style={{ color: 'var(--accent-warm)' }} />
          </div>
          <div>
            <h1 className="text-xl font-black" style={{ color: 'var(--text-primary)' }}>
              المشرفون والمعلمون
            </h1>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              متابعة فريق البرنامج · {toAr(supervisors.length)} مشرف
            </p>
          </div>
        </div>
        <button onClick={() => setShowAddForm(v => !v)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white transition-all active:scale-95"
          style={{ background: 'var(--accent-warm)' }}>
          <Plus className="w-4 h-4" />
          إضافة مشرف
        </button>
      </div>

      {/* ─── شريط البحث + التبويبات ─── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ابحث عن مشرف بالاسم..."
            className="w-full pr-9 pl-3 py-2.5 rounded-xl text-sm outline-none"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-soft)', color: 'var(--text-primary)' }} />
        </div>
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--bg-elevated)' }}>
          {(['supervisors', 'teachers'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className="px-4 py-2 rounded-lg text-sm font-bold transition-all"
              style={{
                background: activeTab === tab ? 'var(--bg-card)' : 'transparent',
                color: activeTab === tab ? 'var(--accent-warm)' : 'var(--text-muted)',
                boxShadow: activeTab === tab ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}>
              {tab === 'supervisors' ? 'المشرفون' : 'المعلمون'}
            </button>
          ))}
        </div>
      </div>

      {/* ─── نموذج الإضافة ─── */}
      {showAddForm && (
        <div className="rounded-2xl p-5 space-y-3"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-soft)' }}>
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>إضافة مشرف جديد</h2>
            <button onClick={() => setShowAddForm(false)} className="opacity-60 hover:opacity-100">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="الاسم *">
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="اسم المشرف" className="input" />
            </Field>
            <Field label="الدفعة *">
              <select value={form.batch_id} onChange={e => setForm(f => ({ ...f, batch_id: e.target.value }))}
                className="input">
                {batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Field>
            <Field label="التخصص">
              <input value={form.specialty} onChange={e => setForm(f => ({ ...f, specialty: e.target.value }))}
                placeholder="مثل: حفظ القرآن الكريم" className="input" />
            </Field>
            <Field label="سنوات الخبرة">
              <input type="number" min="0" value={form.experience_years}
                onChange={e => setForm(f => ({ ...f, experience_years: e.target.value }))}
                placeholder="0" className="input" />
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowAddForm(false)}
              className="px-4 py-2 rounded-xl text-sm font-semibold"
              style={{ color: 'var(--text-secondary)' }}>إلغاء</button>
            <button onClick={handleAdd} disabled={!form.name.trim() || !form.batch_id || saving}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50"
              style={{ background: 'var(--accent-warm)' }}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              حفظ
            </button>
          </div>
        </div>
      )}

      {/* ─── المحتوى ─── */}
      {filtered.length === 0 ? (
        <EmptyState message={search ? 'لا توجد نتائج' : 'لا يوجد مشرفون بعد'} />
      ) : activeTab === 'supervisors' ? (
        <div className="space-y-6">
          {groupedByBatch.map(([batchId, sups]) => {
            const batch = batches.find(b => b.id === batchId)
            return (
              <section key={batchId}>
                <div className="flex items-center gap-3 mb-3">
                  <h2 className="text-sm font-black px-3 py-1.5 rounded-lg whitespace-nowrap"
                    style={{ background: 'rgba(192,138,72,0.08)', color: 'var(--accent-warm)' }}>
                    مشرفو {batch?.name ?? `دفعة ${batchId}`}
                  </h2>
                  <div className="h-px flex-1" style={{ background: 'var(--border-faint)' }} />
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{toAr(sups.length)}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {sups.map(s => <SupervisorCard key={s.id} supervisor={s} students={students} />)}
                </div>
              </section>
            )
          })}
        </div>
      ) : (
        // ─── تبويب المعلمين ─── (يستخدم نفس البيانات بـlist مدمج)
        <div className="rounded-2xl overflow-hidden"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-soft)' }}>
          <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border-faint)' }}>
            <h2 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
              قائمة المعلمين
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{toAr(teachers.length)} معلم</p>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--border-faint)' }}>
            {teachers.map((t, i) => {
              const myStudents = students.filter(s => s.supervisor_id === t.id && (s.status === 'active' || !s.status))
              const batch = batches.find(b => b.id === t.batch_id)
              return (
                <div key={t.id} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--bg-elevated)]">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold"
                    style={{ background: 'rgba(192,138,72,0.1)', color: 'var(--accent-warm)' }}>
                    {toAr(i + 1)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{t.name}</p>
                    <p className="text-xs mt-0.5 flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
                      <BookOpen className="w-3 h-3" />
                      {t.specialty || 'حفظ القرآن الكريم'} · {batch?.name ?? `دفعة ${t.batch_id}`}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="font-black text-sm tabular-nums" style={{ color: 'var(--text-primary)' }}>{toAr(myStudents.length)}</p>
                    <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>طالب</p>
                  </div>
                  <Link href={`/followups/manager?supervisor=${t.id}`}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95"
                    style={{ background: 'rgba(192,138,72,0.08)', color: 'var(--accent-warm)' }}>
                    عرض
                  </Link>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <style jsx>{`
        .input {
          width: 100%;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          color: var(--text-primary);
          border-radius: 0.75rem;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          outline: none;
        }
        .input:focus { border-color: var(--accent-warm); }
      `}</style>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>{label}</label>
      {children}
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 rounded-2xl"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-soft)' }}>
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
        style={{ background: 'var(--bg-elevated)' }}>
        <GraduationCap className="w-7 h-7" style={{ color: 'var(--text-muted)' }} />
      </div>
      <p className="text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>{message}</p>
    </div>
  )
}
