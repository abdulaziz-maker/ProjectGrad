'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { getStudents, getSupervisors, upsertStudent, getJuzProgress, DBStudent, DBSupervisor } from '@/lib/db'
import { toHijriDisplay } from '@/lib/hijri'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

const BATCH_OPTIONS = [46, 48, 44, 42] as const
const PAGE_SIZE = 10

const emptyForm = {
  name: '',
  batch_id: 46 as number,
  supervisor_id: '',
  enrollment_date: '',
  status: 'active' as 'active' | 'suspended',
  notes: '',
}

export default function StudentsPage() {
  const { profile } = useAuth()
  const isSupervisor = profile?.role === 'supervisor' || profile?.role === 'teacher'
  const supervisorBatchId = profile?.batch_id ?? null

  const [students, setStudents] = useState<DBStudent[]>([])
  const [supervisors, setSupervisors] = useState<DBSupervisor[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [batchFilter, setBatchFilter] = useState<number | ''>('')
  const [statusFilter, setStatusFilter] = useState<'active' | 'suspended' | ''>('')
  const [page, setPage] = useState(1)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const [studs, sups, juzRows] = await Promise.all([getStudents(), getSupervisors(), getJuzProgress()])

        // احسب الأجزاء الحقيقية من juz_progress (المصدر الوحيد للحقيقة)
        const juzMap: Record<string, number> = {}
        for (const row of juzRows) {
          if (row.status === 'memorized') {
            juzMap[row.student_id] = (juzMap[row.student_id] || 0) + 1
          }
        }
        const corrected = studs
          .map(s => ({
            ...s,
            juz_completed: juzMap[s.id] ?? s.juz_completed,
            completion_percentage: Math.round(((juzMap[s.id] ?? s.juz_completed) / 30) * 100),
          }))
          .sort((a, b) => a.name.localeCompare(b.name, 'ar'))

        setStudents(corrected)
        setSupervisors(sups)
      } catch (err: any) {
        const msg = err?.message || 'خطأ غير معروف'
        toast.error('خطأ في تحميل البيانات: ' + msg)
        console.error('students load error:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const filtered = useMemo(() => {
    let list = students
    // Supervisors are locked to their batch
    if (isSupervisor && supervisorBatchId !== null) {
      list = list.filter(s => s.batch_id === supervisorBatchId)
    } else if (batchFilter !== '') {
      list = list.filter(s => s.batch_id === batchFilter)
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(s => s.name.toLowerCase().includes(q))
    }
    if (statusFilter !== '') list = list.filter(s => s.status === statusFilter)
    return list
  }, [students, search, batchFilter, statusFilter, isSupervisor, supervisorBatchId])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const totalCount = students.length
  const activeCount = students.filter(s => s.status === 'active').length
  const suspendedCount = students.filter(s => s.status === 'suspended').length

  const supervisorName = (id: string) => {
    const sup = supervisors.find(s => s.id === id)
    return sup ? sup.name : id
  }

  const openAdd = () => {
    setEditingId(null)
    setForm(emptyForm)
    setShowModal(true)
  }

  const openEdit = (s: DBStudent) => {
    setEditingId(s.id)
    setForm({
      name: s.name,
      batch_id: s.batch_id,
      supervisor_id: s.supervisor_id,
      enrollment_date: s.enrollment_date,
      status: s.status === 'graduated' ? 'active' : (s.status as 'active' | 'suspended'),
      notes: s.notes,
    })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.name.trim() || !form.supervisor_id) return
    setSaving(true)
    try {
      const supName = supervisorName(form.supervisor_id)
      const id = editingId ?? `s_${Date.now()}`
      const existing = editingId ? students.find(s => s.id === editingId) : null
      const student: DBStudent = {
        id,
        name: form.name.trim(),
        batch_id: form.batch_id,
        supervisor_id: form.supervisor_id,
        supervisor_name: supName,
        enrollment_date: form.enrollment_date,
        status: form.status,
        notes: form.notes,
        juz_completed: existing?.juz_completed ?? 0,
        completion_percentage: existing?.completion_percentage ?? 0,
        last_followup: existing?.last_followup ?? null,
      }
      await upsertStudent(student)
      if (editingId) {
        setStudents(prev => prev.map(s => s.id === editingId ? student : s))
        toast.success('تم تحديث بيانات الطالب')
      } else {
        setStudents(prev => [...prev, student])
        toast.success('تم إضافة الطالب بنجاح')
      }
      setShowModal(false)
    } catch (err) {
      toast.error('خطأ في الحفظ')
    } finally {
      setSaving(false)
    }
  }

  const hijriDate = form.enrollment_date ? toHijriDisplay(form.enrollment_date) : ''

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]" dir="rtl">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-[#6366f1] mx-auto" />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>جاري تحميل الطلاب...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-6 animate-fade-in-up" style={{ background: 'rgba(255,255,255,0.02)' }} dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>الطلاب</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>إدارة ومتابعة جميع الطلاب</p>
        </div>
        <button
          onClick={openAdd}
          className="btn-primary btn-ripple flex items-center gap-2 text-white px-4 py-2 rounded-xl text-sm font-medium"
        >
          <span className="text-lg leading-none">+</span>
          إضافة طالب
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6 stagger-children">
        <div className="card-static p-4">
          <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>إجمالي الطلاب</p>
          <p className="text-3xl font-bold font-mono" style={{ color: '#6366f1' }}>{totalCount}</p>
        </div>
        <div className="card-static p-4">
          <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>نشط</p>
          <p className="text-3xl font-bold font-mono text-emerald-600">{activeCount}</p>
        </div>
        <div className="card-static p-4">
          <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>متعثر</p>
          <p className="text-3xl font-bold font-mono text-red-500">{suspendedCount}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="card-static p-4 mb-4">
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="بحث باسم الطالب..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm flex-1 min-w-[160px] focus:outline-none focus:ring-2 focus:ring-[#6366f1]/20"
          />
          <select
            value={batchFilter}
            onChange={e => { setBatchFilter(e.target.value === '' ? '' : Number(e.target.value)); setPage(1) }}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6366f1]/20"
          >
            <option value="">كل الدفعات</option>
            {BATCH_OPTIONS.map(b => (
              <option key={b} value={b}>دفعة {b}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value as '' | 'active' | 'suspended'); setPage(1) }}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6366f1]/20"
          >
            <option value="">كل الحالات</option>
            <option value="active">نشط</option>
            <option value="suspended">متعثر</option>
          </select>
          <span className="flex items-center text-sm" style={{ color: 'var(--text-muted)' }}>{filtered.length} طالب</span>
        </div>
      </div>

      {/* Table */}
      <div className="card-static overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-right" style={{ background: 'rgba(99,102,241,0.06)', color: '#818cf8' }}>
                <th className="px-4 py-3 font-semibold">#</th>
                <th className="px-4 py-3 font-semibold">الاسم</th>
                <th className="px-4 py-3 font-semibold">الدفعة</th>
                <th className="px-4 py-3 font-semibold">المشرف</th>
                <th className="px-4 py-3 font-semibold">الأجزاء</th>
                <th className="px-4 py-3 font-semibold w-36">الإنجاز</th>
                <th className="px-4 py-3 font-semibold">الحالة</th>
                <th className="px-4 py-3 font-semibold text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-10" style={{ color: 'var(--text-muted)' }}>لا توجد نتائج</td>
                </tr>
              ) : (
                paginated.map((s, idx) => (
                  <tr key={s.id} className="hover:opacity-90 transition-colors">
                    <td className="px-4 py-3" style={{ color: 'var(--text-muted)' }}>{(page - 1) * PAGE_SIZE + idx + 1}</td>
                    <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>{s.name}</td>
                    <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>دفعة {s.batch_id}</td>
                    <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{s.supervisor_name}</td>
                    <td className="px-4 py-3 font-semibold font-mono" style={{ color: '#6366f1' }}>{s.juz_completed}/30</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="progress-bar flex-1">
                          <div
                            className={`progress-bar-fill ${
                              s.completion_percentage >= 80
                                ? 'green'
                                : s.completion_percentage >= 60
                                ? 'yellow'
                                : 'red'
                            }`}
                            style={{ width: `${Math.min(100, s.completion_percentage)}%` }}
                          />
                        </div>
                        <span className="text-xs font-mono w-8 text-left" style={{ color: 'var(--text-muted)' }}>{s.completion_percentage}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          s.status === 'active'
                            ? 'bg-emerald-50 text-emerald-700'
                            : s.status === 'suspended'
                            ? 'bg-red-50 text-red-600'
                            : 'bg-blue-50 text-blue-600'
                        }`}
                      >
                        {s.status === 'active' ? 'نشط' : s.status === 'suspended' ? 'متعثر' : 'متخرج'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <Link
                          href={`/students/${s.id}`}
                          className="text-xs px-3 py-1 rounded-lg font-medium transition-colors" style={{ background: 'rgba(99,102,241,0.12)', color: '#818cf8' }}
                        >
                          عرض
                        </Link>
                        <button
                          onClick={() => openEdit(s)}
                          className="text-xs px-3 py-1 rounded-lg font-medium transition-colors" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}
                        >
                          تعديل
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t" style={{ borderColor: 'var(--border-color)' }}>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              عرض {Math.min((page - 1) * PAGE_SIZE + 1, filtered.length)}–{Math.min(page * PAGE_SIZE, filtered.length)} من {filtered.length}
            </p>
            <div className="flex gap-1">
              <button
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                className="px-3 py-1.5 rounded-lg text-xs border border-gray-200 disabled:opacity-40 hover:opacity-80 transition-colors"
              >
                السابق
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                    p === page
                      ? 'bg-[#6366f1] text-white border-[#6366f1]'
                      : 'border-gray-200 hover:opacity-80'
                  }`}
                >
                  {p}
                </button>
              ))}
              <button
                disabled={page === totalPages}
                onClick={() => setPage(p => p + 1)}
                className="px-3 py-1.5 rounded-lg text-xs border border-gray-200 disabled:opacity-40 hover:opacity-80 transition-colors"
              >
                التالي
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" dir="rtl">
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
              <h2 className="text-base font-bold" style={{ color: '#6366f1' }}>
                {editingId ? 'تعديل بيانات الطالب' : 'إضافة طالب جديد'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-xl leading-none" style={{ color: 'var(--text-muted)' }}
              >
                ×
              </button>
            </div>

            <div className="px-6 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>الاسم</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6366f1]/20"
                  placeholder="اسم الطالب"
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>الدفعة</label>
                <select
                  value={form.batch_id}
                  onChange={e => setForm(f => ({ ...f, batch_id: Number(e.target.value) }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6366f1]/20"
                >
                  {BATCH_OPTIONS.map(b => (
                    <option key={b} value={b}>دفعة {b}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>المشرف</label>
                <select
                  value={form.supervisor_id}
                  onChange={e => setForm(f => ({ ...f, supervisor_id: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6366f1]/20"
                >
                  <option value="">اختر مشرفاً</option>
                  {supervisors.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>تاريخ الالتحاق</label>
                <input
                  type="date"
                  value={form.enrollment_date}
                  onChange={e => setForm(f => ({ ...f, enrollment_date: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6366f1]/20"
                />
                {hijriDate && (
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{hijriDate}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>الحالة</label>
                <select
                  value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value as 'active' | 'suspended' }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6366f1]/20"
                >
                  <option value="active">نشط</option>
                  <option value="suspended">متعثر</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>ملاحظات</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6366f1]/20 resize-none"
                  placeholder="ملاحظات إضافية..."
                />
              </div>
            </div>

            <div className="flex gap-3 px-6 pb-5 pt-2">
              <button
                onClick={handleSave}
                disabled={!form.name.trim() || !form.supervisor_id || saving}
                className="btn-primary btn-ripple flex-1 flex items-center justify-center gap-2 text-white py-2.5 rounded-xl text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingId ? 'حفظ التعديلات' : 'إضافة الطالب'}
              </button>
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 border py-2.5 rounded-xl text-sm font-medium transition-colors" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
