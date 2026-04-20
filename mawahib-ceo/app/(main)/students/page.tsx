'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { getStudents, getSupervisors, upsertStudent, getJuzProgress, DBStudent, DBSupervisor } from '@/lib/db'
import { toHijriDisplay } from '@/lib/hijri'
import { toast } from 'sonner'
import { Loader2, Download } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import * as XLSX from 'xlsx'

const BATCH_OPTIONS = [46, 48, 44, 42] as const
const PAGE_SIZE_OPTIONS = [10, 25, 50, 0] as const // 0 = عرض الكل
const DEFAULT_PAGE_SIZE = 25

const emptyForm = {
  name: '',
  batch_id: 46 as number,
  supervisor_id: '',
  enrollment_date: '',
  status: 'active' as 'active' | 'suspended',
  notes: '',
  national_id: '',
  birth_date: '',
  parent_phone: '',
}

/** تحقق من رقم الهوية (١٠ أرقام). فارغاً يُعتبر مقبولاً. */
function validateNationalId(v: string): string | null {
  if (!v) return null
  if (!/^\d{10}$/.test(v)) return 'رقم الهوية يجب أن يكون ١٠ أرقام'
  return null
}

/** تحقق من رقم الجوال (٩-١٥ رقم). فارغاً يُعتبر مقبولاً. */
function validatePhone(v: string): string | null {
  if (!v) return null
  if (!/^[0-9+]{9,15}$/.test(v)) return 'رقم الجوال غير صحيح (٩-١٥ رقم)'
  return null
}

export default function StudentsPage() {
  const { profile } = useAuth()
  // مدير الدفعة والمشرف والمعلم: كل واحد منهم مقيَّد بدفعة واحدة فقط.
  // المدير التنفيذي (ceo) فقط يرى كل الدفعات.
  const role = profile?.role
  const isScopedToBatch = role === 'supervisor' || role === 'teacher' || role === 'batch_manager'
  const isSupervisor = role === 'supervisor' || role === 'teacher' // للاستخدامات الأقدم
  const myBatchId = profile?.batch_id ?? null
  const supervisorBatchId = myBatchId // alias للتوافق
  // ⚠️ SECURITY: لا نُظهر أي طلاب حتى يُحمَّل الملف الشخصي — يمنع التسرّب بين الأدوار
  const profileLoaded = profile !== null

  const [students, setStudents] = useState<DBStudent[]>([])
  const [supervisors, setSupervisors] = useState<DBSupervisor[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [batchFilter, setBatchFilter] = useState<number | ''>('')
  const [statusFilter, setStatusFilter] = useState<'active' | 'suspended' | ''>('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formErrors, setFormErrors] = useState<{ national_id?: string; parent_phone?: string }>({})

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
    // حتى يُحمَّل الملف الشخصي: لا نُظهر شيء. يمنع تسرّب بيانات دفعات أخرى
    // للمستخدم الحالي في اللحظة التي بين mount و profile fetch.
    if (!profileLoaded) return []
    let list = students
    // المستخدمون المقيَّدون بدفعة (مشرف/معلم/مدير دفعة): لا يرون إلا دفعتهم.
    // أي تسريب بيانات يُقصَى هنا client-side بالإضافة إلى حماية RLS على الخادم.
    if (isScopedToBatch) {
      // مقيَّد بدفعة لكن بدون batch_id → لا يُظهر شيء (بدل تجاوز الفلتر)
      if (myBatchId === null) return []
      list = list.filter(s => s.batch_id === myBatchId)
    } else if (batchFilter !== '') {
      list = list.filter(s => s.batch_id === batchFilter)
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(s => s.name.toLowerCase().includes(q))
    }
    if (statusFilter !== '') list = list.filter(s => s.status === statusFilter)
    return list
  }, [students, search, batchFilter, statusFilter, isScopedToBatch, myBatchId, profileLoaded])

  const effectivePageSize = pageSize === 0 ? filtered.length || 1 : pageSize
  const totalPages = Math.max(1, Math.ceil(filtered.length / effectivePageSize))
  const paginated = pageSize === 0
    ? filtered
    : filtered.slice((page - 1) * pageSize, page * pageSize)

  /** تصدير الطلاب المفلترين الحاليين إلى ملف Excel. */
  const exportToExcel = () => {
    const rows = filtered.map((s, i) => ({
      '#': i + 1,
      'الاسم': s.name,
      'الدفعة': s.batch_id,
      'المشرف': s.supervisor_name,
      'رقم الهوية': s.national_id ?? '',
      'تاريخ الميلاد': s.birth_date ?? '',
      'جوال ولي الأمر': s.parent_phone ?? '',
      'تاريخ الالتحاق': s.enrollment_date ?? '',
      'الحالة': s.status === 'active' ? 'نشط' : s.status === 'suspended' ? 'متعثر' : 'متخرج',
      'الأجزاء المحفوظة': s.juz_completed,
      'نسبة الإنجاز': `${s.completion_percentage}%`,
      'آخر متابعة': s.last_followup ?? '',
      'ملاحظات': s.notes ?? '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    // RTL للصفحة
    ws['!views'] = [{ RTL: true }]
    const wb = XLSX.utils.book_new()
    const batchLabel = batchFilter === '' ? 'كل_الدفعات' : `دفعة_${batchFilter}`
    XLSX.utils.book_append_sheet(wb, ws, 'الطلاب')
    const today = new Date().toISOString().split('T')[0]
    XLSX.writeFile(wb, `الطلاب_${batchLabel}_${today}.xlsx`)
    toast.success(`تم تصدير ${rows.length} طالب إلى Excel`)
  }

  // الإحصاءات على القائمة المفلترة حسب النطاق (فلا تُسرَّب أعداد دفعات أخرى)
  const scopedStudents = useMemo(() =>
    (isScopedToBatch && myBatchId !== null)
      ? students.filter(s => s.batch_id === myBatchId)
      : students
  , [students, isScopedToBatch, myBatchId])

  const totalCount = scopedStudents.length
  const activeCount = scopedStudents.filter(s => s.status === 'active').length
  const suspendedCount = scopedStudents.filter(s => s.status === 'suspended').length

  const supervisorName = (id: string) => {
    const sup = supervisors.find(s => s.id === id)
    return sup ? sup.name : id
  }

  const openAdd = () => {
    setEditingId(null)
    // عند المستخدم المقيَّد بدفعة: ثبّت batch_id على دفعته تلقائياً
    setForm({
      ...emptyForm,
      batch_id: (isScopedToBatch && myBatchId !== null) ? myBatchId : emptyForm.batch_id,
    })
    setFormErrors({})
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
      national_id: s.national_id ?? '',
      birth_date: s.birth_date ?? '',
      parent_phone: s.parent_phone ?? '',
    })
    setFormErrors({})
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.name.trim() || !form.supervisor_id) return

    // Validation
    const errs: { national_id?: string; parent_phone?: string } = {}
    const nidErr = validateNationalId(form.national_id)
    if (nidErr) errs.national_id = nidErr
    const phoneErr = validatePhone(form.parent_phone)
    if (phoneErr) errs.parent_phone = phoneErr
    if (Object.keys(errs).length > 0) {
      setFormErrors(errs)
      toast.error('يُرجى تصحيح الحقول المعلَّمة')
      return
    }
    setFormErrors({})

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
        national_id: form.national_id || '',
        birth_date: form.birth_date || null,
        parent_phone: form.parent_phone || '',
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
          <Loader2 className="w-8 h-8 animate-spin text-[#C08A48] mx-auto" />
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
        <div className="flex items-center gap-2">
          <button
            onClick={exportToExcel}
            disabled={filtered.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-colors disabled:opacity-50"
            style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)', background: 'var(--bg-card)' }}
          >
            <Download className="w-4 h-4" />
            تصدير Excel
          </button>
          <button
            onClick={openAdd}
            className="btn-primary btn-ripple flex items-center gap-2 text-white px-4 py-2 rounded-xl text-sm font-medium"
          >
            <span className="text-lg leading-none">+</span>
            إضافة طالب
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6 stagger-children">
        <div className="card-static p-4">
          <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>إجمالي الطلاب</p>
          <p className="text-3xl font-bold font-mono" style={{ color: '#C08A48' }}>{totalCount}</p>
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
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm flex-1 min-w-[160px] focus:outline-none focus:ring-2 focus:ring-[#C08A48]/20"
          />
          {isScopedToBatch && myBatchId !== null ? (
            /* المستخدمون المقيَّدون بدفعة: عرض اسم دفعتهم فقط بلا خيار تبديل */
            <div
              className="flex items-center border rounded-xl px-3 py-2 text-sm font-semibold"
              style={{ borderColor: 'var(--border-color)', color: '#C08A48', background: 'rgba(99,102,241,0.08)' }}
            >
              دفعة {myBatchId}
            </div>
          ) : (
            <select
              value={batchFilter}
              onChange={e => { setBatchFilter(e.target.value === '' ? '' : Number(e.target.value)); setPage(1) }}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C08A48]/20"
            >
              <option value="">كل الدفعات</option>
              {BATCH_OPTIONS.map(b => (
                <option key={b} value={b}>دفعة {b}</option>
              ))}
            </select>
          )}
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value as '' | 'active' | 'suspended'); setPage(1) }}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C08A48]/20"
          >
            <option value="">كل الحالات</option>
            <option value="active">نشط</option>
            <option value="suspended">متعثر</option>
          </select>
          <select
            value={pageSize}
            onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C08A48]/20"
            title="عدد الصفوف في الصفحة"
          >
            {PAGE_SIZE_OPTIONS.map(size => (
              <option key={size} value={size}>{size === 0 ? 'عرض الكل' : `${size} لكل صفحة`}</option>
            ))}
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
                    <td className="px-4 py-3" style={{ color: 'var(--text-muted)' }}>{(pageSize === 0 ? 0 : (page - 1) * pageSize) + idx + 1}</td>
                    <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>{s.name}</td>
                    <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>دفعة {s.batch_id}</td>
                    <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{s.supervisor_name}</td>
                    <td className="px-4 py-3 font-semibold font-mono" style={{ color: '#C08A48' }}>{s.juz_completed}/30</td>
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
        {pageSize !== 0 && totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t" style={{ borderColor: 'var(--border-color)' }}>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              عرض {Math.min((page - 1) * pageSize + 1, filtered.length)}–{Math.min(page * pageSize, filtered.length)} من {filtered.length}
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
                      ? 'bg-[#C08A48] text-white border-[#C08A48]'
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
              <h2 className="text-base font-bold" style={{ color: '#C08A48' }}>
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
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C08A48]/20"
                  placeholder="اسم الطالب"
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>الدفعة</label>
                {isScopedToBatch && myBatchId !== null ? (
                  /* المستخدمون المقيَّدون بدفعة: تثبيت الدفعة على دفعتهم */
                  <div
                    className="w-full border rounded-xl px-3 py-2 text-sm"
                    style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', background: 'rgba(99,102,241,0.04)' }}
                  >
                    دفعة {myBatchId}
                  </div>
                ) : (
                  <select
                    value={form.batch_id}
                    onChange={e => setForm(f => ({ ...f, batch_id: Number(e.target.value) }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C08A48]/20"
                  >
                    {BATCH_OPTIONS.map(b => (
                      <option key={b} value={b}>دفعة {b}</option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>المشرف</label>
                <select
                  value={form.supervisor_id}
                  onChange={e => setForm(f => ({ ...f, supervisor_id: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C08A48]/20"
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
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C08A48]/20"
                />
                {hijriDate && (
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{hijriDate}</p>
                )}
              </div>

              {/* البيانات الشخصية */}
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                  رقم الهوية الوطنية
                  <span className="text-[10px] mr-1" style={{ color: 'var(--text-muted)' }}>(١٠ أرقام — اختياري)</span>
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={10}
                  value={form.national_id}
                  onChange={e => setForm(f => ({ ...f, national_id: e.target.value.replace(/\D/g, '') }))}
                  className={`w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C08A48]/20 ${formErrors.national_id ? 'border-red-400' : 'border-gray-200'}`}
                  placeholder="1012345678"
                />
                {formErrors.national_id && (
                  <p className="text-[11px] text-red-500 mt-1">{formErrors.national_id}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>تاريخ الميلاد</label>
                <input
                  type="date"
                  value={form.birth_date}
                  onChange={e => setForm(f => ({ ...f, birth_date: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C08A48]/20"
                />
                {form.birth_date && (
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{toHijriDisplay(form.birth_date)}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                  رقم جوال ولي الأمر
                  <span className="text-[10px] mr-1" style={{ color: 'var(--text-muted)' }}>(اختياري)</span>
                </label>
                <input
                  type="tel"
                  inputMode="tel"
                  value={form.parent_phone}
                  onChange={e => setForm(f => ({ ...f, parent_phone: e.target.value }))}
                  className={`w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C08A48]/20 ${formErrors.parent_phone ? 'border-red-400' : 'border-gray-200'}`}
                  placeholder="05XXXXXXXX"
                />
                {formErrors.parent_phone && (
                  <p className="text-[11px] text-red-500 mt-1">{formErrors.parent_phone}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>الحالة</label>
                <select
                  value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value as 'active' | 'suspended' }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C08A48]/20"
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
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C08A48]/20 resize-none"
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
