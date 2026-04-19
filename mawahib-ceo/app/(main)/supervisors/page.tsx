'use client'
import { useState, useEffect } from 'react'
import { getStudents, getSupervisors, toggleFollowup, upsertSupervisor, DBStudent, DBSupervisor } from '@/lib/db'
import { getWeekStart } from '@/lib/hijri'
import { Star, Users, Plus, ChevronDown, ChevronUp, Check, X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

const TEACHERS = [
  { id: 't1', name: 'عبدالله المطوع', batch: 'دفعة 46', cert: 'إجازة في القرآن', status: 'active', rating: 4.5 },
  { id: 't2', name: 'سعد الغامدي', batch: 'دفعة 46', cert: 'بكالوريوس شريعة', status: 'active', rating: 4.0 },
  { id: 't3', name: 'محمد الحازمي', batch: 'دفعة 48', cert: 'إجازة في القرآن', status: 'active', rating: 3.5 },
  { id: 't4', name: 'خالد العتيبي', batch: 'دفعة 48', cert: 'ماجستير تربية', status: 'active', rating: 4.2 },
  { id: 't5', name: 'فيصل الشمري', batch: 'دفعة 46', cert: 'إجازة في القرآن', status: 'inactive', rating: 3.0 },
  { id: 't6', name: 'ياسر البلوي', batch: 'دفعة 46', cert: 'بكالوريوس تربية', status: 'active', rating: 4.8 },
  { id: 't7', name: 'وائل الدوسري', batch: 'دفعة 48', cert: 'إجازة في القرآن', status: 'active', rating: 4.1 },
  { id: 't8', name: 'أحمد الرشيدي', batch: 'دفعة 46', cert: 'ماجستير إسلامية', status: 'active', rating: 3.8 },
  { id: 't9', name: 'تركي السبيعي', batch: 'دفعة 48', cert: 'إجازة في القرآن', status: 'active', rating: 4.3 },
  { id: 't10', name: 'ناصر الحربي', batch: 'دفعة 46', cert: 'بكالوريوس شريعة', status: 'active', rating: 4.6 },
]

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} className={`w-3.5 h-3.5 ${i < Math.round(rating) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200'}`} />
      ))}
      <span className="text-xs mr-1" style={{ color: 'var(--text-muted)' }}>{rating}</span>
    </div>
  )
}

function isReportLate(date: string | null): boolean {
  if (!date) return true
  return (Date.now() - new Date(date).getTime()) / 86400000 > 7
}

interface AddSupervisorForm {
  name: string; specialty: string; batch_id: '46' | '48'; experience_years: string; notes: string
}
const EMPTY_FORM: AddSupervisorForm = { name: '', specialty: '', batch_id: '46', experience_years: '', notes: '' }

function SupervisorCard({
  supervisor, students, followups, weekOf, onToggle,
}: {
  supervisor: DBSupervisor
  students: DBStudent[]
  followups: Record<string, boolean>
  weekOf: string
  onToggle: (supervisorId: string, studentId: string, weekOf: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const assignedStudents = students.filter(s => s.supervisor_id === supervisor.id)
  const followedCount = assignedStudents.filter(s => followups[`${supervisor.id}_${s.id}_${weekOf}`]).length
  const late = isReportLate(supervisor.last_report_date)

  return (
    <div className="card-static overflow-hidden">
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>{supervisor.name}</h3>
              {late && <span className="text-xs bg-red-50 text-red-600 rounded-full px-2 py-0.5 font-medium">تأخر في الرفع</span>}
            </div>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{supervisor.specialty}</p>
          </div>
          <StarRating rating={supervisor.rating} />
        </div>

        <div className="grid grid-cols-3 gap-3 mt-4">
          <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.02)' }}>
            <Users className="w-4 h-4 mx-auto mb-1" style={{ color: '#C08A48' }} />
            <p className="text-lg font-bold font-mono" style={{ color: 'var(--text-primary)' }}>{supervisor.student_count}</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>طالب</p>
          </div>
          <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.02)' }}>
            <p className="font-bold text-xs mb-1" style={{ color: '#C08A48' }}>%</p>
            <p className="text-lg font-bold font-mono" style={{ color: 'var(--text-primary)' }}>{supervisor.avg_student_progress}</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>متوسط التقدم</p>
          </div>
          <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.02)' }}>
            <p className="font-bold text-xs mb-1" style={{ color: '#C08A48' }}>تقرير</p>
            <p className="text-xs font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>
              {supervisor.last_report_date
                ? new Date(supervisor.last_report_date).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' })
                : 'لا يوجد'}
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>آخر تقرير</p>
          </div>
        </div>

        <button
          onClick={() => setExpanded(v => !v)}
          className="mt-4 w-full flex items-center justify-between px-4 py-2.5 rounded-xl transition-colors font-medium text-sm" style={{ background: 'rgba(99,102,241,0.06)', color: '#C08A48' }}
        >
          <span>متابعة الطلاب هذا الأسبوع</span>
          <div className="flex items-center gap-2">
            <span className="text-xs rounded-full px-2 py-0.5" style={{ background: 'rgba(99,102,241,0.1)', color: '#C08A48' }}>
              تابع {followedCount} من {assignedStudents.length}
            </span>
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </button>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 px-5 pb-5">
          <div className="mt-3 space-y-2">
            {assignedStudents.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-3">لا يوجد طلاب مسجلون</p>
            ) : (
              assignedStudents.map(student => {
                const key = `${supervisor.id}_${student.id}_${weekOf}`
                const followed = !!followups[key]
                return (
                  <div key={student.id} className="flex items-center justify-between gap-3 py-2 px-3 rounded-xl">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${student.status === 'active' ? 'bg-green-400' : 'bg-gray-300'}`} />
                      <span className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>{student.name}</span>
                      <span className="text-xs flex-shrink-0 font-mono" style={{ color: 'var(--text-muted)' }}>{student.completion_percentage}%</span>
                    </div>
                    <button
                      onClick={() => onToggle(supervisor.id, student.id, weekOf)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex-shrink-0 ${
                        followed ? 'text-white shadow-sm' : 'bg-gray-100 hover:bg-gray-200'
                      }`}
                      style={followed ? { backgroundColor: '#C08A48' } : { color: 'var(--text-muted)' }}
                    >
                      {followed ? <><Check className="w-3.5 h-3.5" />تابعه</> : <><X className="w-3.5 h-3.5" />لم يتابعه</>}
                    </button>
                  </div>
                )
              })
            )}
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
            <span>أسبوع {weekOf}</span>
            <span className={followedCount === assignedStudents.length && assignedStudents.length > 0 ? 'font-semibold' : ''}
              style={followedCount === assignedStudents.length && assignedStudents.length > 0 ? { color: '#C08A48' } : undefined}>
              {followedCount === assignedStudents.length && assignedStudents.length > 0
                ? 'تابع جميع الطلاب'
                : `تابع ${followedCount} من ${assignedStudents.length} طالب`}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

export default function SupervisorsPage() {
  const [activeTab, setActiveTab] = useState<'supervisors' | 'teachers'>('supervisors')
  const [supervisors, setSupervisors] = useState<DBSupervisor[]>([])
  const [students, setStudents] = useState<DBStudent[]>([])
  const [followups, setFollowups] = useState<Record<string, boolean>>({})
  const [weekOf, setWeekOf] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [form, setForm] = useState<AddSupervisorForm>(EMPTY_FORM)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setWeekOf(getWeekStart())
    Promise.all([getSupervisors(), getStudents()])
      .then(([sups, studs]) => {
        setSupervisors(sups)
        setStudents(studs)
      })
      .catch(() => toast.error('خطأ في تحميل البيانات'))
      .finally(() => setLoading(false))
  }, [])

  async function handleToggle(supervisorId: string, studentId: string, week: string) {
    const key = `${supervisorId}_${studentId}_${week}`
    const newVal = !followups[key]
    setFollowups(prev => ({ ...prev, [key]: newVal }))
    try {
      await toggleFollowup(supervisorId, studentId, week, newVal)
    } catch {
      setFollowups(prev => ({ ...prev, [key]: !newVal }))
      toast.error('خطأ في الحفظ')
    }
  }

  async function handleAddSupervisor() {
    if (!form.name.trim() || !form.specialty.trim()) return
    const newSup: DBSupervisor = {
      id: `sup_${Date.now()}`,
      name: form.name.trim(),
      specialty: form.specialty.trim(),
      experience_years: parseInt(form.experience_years) || 0,
      notes: form.notes.trim(),
      rating: 4,
      student_count: 0,
      last_report_date: null,
      avg_student_progress: 0,
      age: 0,
      strengths: '',
      weaknesses: '',
      batch_id: parseInt(form.batch_id),
      user_id: null,
    }
    try {
      await upsertSupervisor(newSup)
      setSupervisors(prev => [...prev, newSup])
      setForm(EMPTY_FORM)
      setShowAddForm(false)
      toast.success('تم إضافة المشرف بنجاح')
    } catch {
      toast.error('خطأ في الحفظ')
    }
  }

  const supervisors46 = supervisors.filter(s => s.batch_id === 46 || (!s.batch_id && supervisors.indexOf(s) < 4))
  const supervisors48 = supervisors.filter(s => s.batch_id === 48 || (!s.batch_id && supervisors.indexOf(s) >= 4))

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]" dir="rtl">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin mx-auto" style={{ color: '#C08A48' }} />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>جاري تحميل البيانات...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in-up" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold" style={{ color: 'var(--text-primary)' }}>المشرفون والمعلمون</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>متابعة أداء فريق البرنامج</p>
        </div>
        {activeTab === 'supervisors' && (
          <button onClick={() => setShowAddForm(v => !v)}
            className="btn-primary btn-ripple flex items-center gap-2 px-4 py-2 text-white rounded-xl text-sm font-medium">
            <Plus className="w-4 h-4" />
            إضافة مشرف
          </button>
        )}
      </div>

      {showAddForm && activeTab === 'supervisors' && (
        <div className="card-static p-5">
          <h2 className="font-bold mb-4" style={{ color: 'var(--text-primary)' }}>إضافة مشرف جديد</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>الاسم *</label>
              <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="اسم المشرف"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#C08A48]" />
            </div>
            <div>
              <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>التخصص *</label>
              <input type="text" value={form.specialty} onChange={e => setForm(f => ({ ...f, specialty: e.target.value }))}
                placeholder="مثل: حفظ القرآن الكريم"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#C08A48]" />
            </div>
            <div>
              <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>الدفعة</label>
              <select value={form.batch_id} onChange={e => setForm(f => ({ ...f, batch_id: e.target.value as '46' | '48' }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#C08A48]">
                <option value="46">دفعة 46</option>
                <option value="48">دفعة 48</option>
              </select>
            </div>
            <div>
              <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>سنوات الخبرة</label>
              <input type="number" min="0" value={form.experience_years}
                onChange={e => setForm(f => ({ ...f, experience_years: e.target.value }))}
                placeholder="عدد السنوات"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#C08A48]" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>ملاحظات</label>
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={2} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#C08A48] resize-none" />
            </div>
          </div>
          <div className="flex gap-3 mt-4 justify-end">
            <button onClick={() => { setShowAddForm(false); setForm(EMPTY_FORM) }}
              className="px-4 py-2 text-sm hover:bg-gray-100 rounded-xl" style={{ color: 'var(--text-secondary)' }}>إلغاء</button>
            <button onClick={handleAddSupervisor} disabled={!form.name.trim() || !form.specialty.trim()}
              className="btn-primary btn-ripple px-4 py-2 text-white rounded-xl text-sm font-medium disabled:opacity-40">حفظ</button>
          </div>
        </div>
      )}

      <div className="flex gap-2 bg-gray-100 p-1 rounded-xl w-fit">
        {(['supervisors', 'teachers'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === tab ? 'bg-white shadow-sm' : ''}`}
            style={activeTab === tab ? { color: '#C08A48' } : { color: 'var(--text-muted)' }}>
            {tab === 'supervisors' ? 'المشرفون' : 'المعلمون'}
          </button>
        ))}
      </div>

      {activeTab === 'supervisors' && (
        <div className="space-y-8">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="h-px flex-1 bg-gray-200" />
              <h2 className="text-sm font-bold px-4 py-1.5 rounded-full whitespace-nowrap" style={{ color: '#C08A48', background: 'rgba(99,102,241,0.1)' }}>مشرفو دفعة 46</h2>
              <div className="h-px flex-1 bg-gray-200" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 stagger-children">
              {supervisors46.map(sup => (
                <SupervisorCard key={sup.id} supervisor={sup} students={students} followups={followups} weekOf={weekOf} onToggle={handleToggle} />
              ))}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="h-px flex-1 bg-gray-200" />
              <h2 className="text-sm font-bold px-4 py-1.5 rounded-full whitespace-nowrap" style={{ color: '#C08A48', background: 'rgba(99,102,241,0.1)' }}>مشرفو دفعة 48</h2>
              <div className="h-px flex-1 bg-gray-200" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 stagger-children">
              {supervisors48.map(sup => (
                <SupervisorCard key={sup.id} supervisor={sup} students={students} followups={followups} weekOf={weekOf} onToggle={handleToggle} />
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'teachers' && (
        <div className="card-static overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-bold" style={{ color: 'var(--text-primary)' }}>قائمة المعلمين</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{TEACHERS.length} معلم</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100" style={{ background: 'rgba(255,255,255,0.02)' }}>
                  <th className="text-right px-5 py-3 font-medium" style={{ color: 'var(--text-muted)' }}>#</th>
                  <th className="text-right px-5 py-3 font-medium" style={{ color: 'var(--text-muted)' }}>الاسم</th>
                  <th className="text-right px-5 py-3 font-medium" style={{ color: 'var(--text-muted)' }}>الدفعة</th>
                  <th className="text-right px-5 py-3 font-medium" style={{ color: 'var(--text-muted)' }}>المؤهل</th>
                  <th className="text-right px-5 py-3 font-medium" style={{ color: 'var(--text-muted)' }}>التقييم</th>
                  <th className="text-right px-5 py-3 font-medium" style={{ color: 'var(--text-muted)' }}>الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {TEACHERS.map((teacher, i) => (
                  <tr key={teacher.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3.5" style={{ color: 'var(--text-muted)' }}>{i + 1}</td>
                    <td className="px-5 py-3.5 font-medium" style={{ color: 'var(--text-primary)' }}>{teacher.name}</td>
                    <td className="px-5 py-3.5" style={{ color: 'var(--text-secondary)' }}>{teacher.batch}</td>
                    <td className="px-5 py-3.5" style={{ color: 'var(--text-secondary)' }}>{teacher.cert}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-0.5">
                        {Array.from({ length: 5 }, (_, i2) => (
                          <Star key={i2} className={`w-3.5 h-3.5 ${i2 < Math.round(teacher.rating) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200'}`} />
                        ))}
                        <span className="text-xs mr-1" style={{ color: 'var(--text-muted)' }}>{teacher.rating}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${teacher.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {teacher.status === 'active' ? 'نشط' : 'غير نشط'}
                      </span>
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
