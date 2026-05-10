'use client'
import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { getStudents, getSupervisors, getDailyFollowups, type DBStudent, type DBSupervisor } from '@/lib/db'
import { type DailyFollowup, getFollowupWeekRange } from '@/lib/quran-followup'
import { formatHijri, toHijriShort, getDayNameAr, gregorianToHijri } from '@/lib/hijri'
import PageHeader from '@/components/ui/PageHeader'
import HijriDatePicker from '@/components/ui/HijriDatePicker'
import {
  History, User, Search, Filter, Calendar, FileText, AlertTriangle, CheckCircle2,
  TrendingUp, TrendingDown, ChevronDown, ChevronUp, X, Sparkles, Archive, Users, BarChart3,
} from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'

// Helper: resolve who supervised a given followup.
// Priority: actual executor (f.supervisor_id = profile UUID) → assigned supervisor (student.supervisor_id = sup_xxx) → null
function resolveFollowupSupervisor(
  f: DailyFollowup,
  student: DBStudent | undefined,
  supByUserId: Map<string, DBSupervisor>,
  supById: Map<string, DBSupervisor>,
): DBSupervisor | null {
  if (f.supervisor_id) {
    const byUid = supByUserId.get(f.supervisor_id)
    if (byUid) return byUid
    // some legacy rows may already store sup_xxx directly
    const byId = supById.get(f.supervisor_id)
    if (byId) return byId
  }
  if (student?.supervisor_id) {
    return supById.get(student.supervisor_id) ?? null
  }
  return null
}

// Build a "followup week" key for grouping — Sat→Thu range as ISO start.
function followupWeekKey(dateIso: string): string {
  const d = new Date(dateIso + 'T12:00:00')
  return getFollowupWeekRange(d).start
}

export default function FollowupsHistoryPage() {
  const { profile } = useAuth()
  const isCeo = profile?.role === 'ceo'
  const isManager = profile?.role === 'batch_manager'
  const isSupervisor = profile?.role === 'supervisor' || profile?.role === 'teacher'

  const [students, setStudents] = useState<DBStudent[]>([])
  const [supervisors, setSupervisors] = useState<DBSupervisor[]>([])
  const [followups, setFollowups] = useState<DailyFollowup[]>([])
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)

  // فلاتر
  const [selectedStudent, setSelectedStudent] = useState<string>('')
  const [selectedSupervisor, setSelectedSupervisor] = useState<string>('')
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  const [searchTerm, setSearchTerm] = useState<string>('')
  const [filterType, setFilterType] = useState<'all' | 'with_notes' | 'with_reasons' | 'delayed' | 'on_track'>('all')

  const [expandedId, setExpandedId] = useState<number | string | null>(null)

  // عرض: كل الطلاب (مَجموع حسب الطالب — الافتراضي) أو متابعات الأسبوع الحالي
  const [viewMode, setViewMode] = useState<'all_students' | 'this_week'>('all_students')
  // تَقسيم زمني للعرض الجديد
  const [breakdown, setBreakdown] = useState<'all' | 'year' | 'month' | 'week'>('all')
  // طالب موسَّع في عرض "حسب الطالب"
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null)
  // متابعة لعرض تفاصيلها (modal)
  const [detailFollowup, setDetailFollowup] = useState<DailyFollowup | null>(null)

  // ── خرائط البحث عن المشرف ────────────────────────
  const supByUserId = useMemo(() => {
    const m = new Map<string, DBSupervisor>()
    supervisors.forEach(sv => { if (sv.user_id) m.set(sv.user_id, sv) })
    return m
  }, [supervisors])

  const supById = useMemo(() => {
    const m = new Map<string, DBSupervisor>()
    supervisors.forEach(sv => m.set(sv.id, sv))
    return m
  }, [supervisors])

  const studentById = useMemo(() => {
    const m = new Map<string, DBStudent>()
    students.forEach(s => m.set(s.id, s))
    return m
  }, [students])

  // الطلاب المرئيون لهذا المستخدم
  const visibleStudents = useMemo(() => {
    if (isCeo) return students
    if (isManager && profile?.batch_id) return students.filter(s => s.batch_id === profile.batch_id)
    if (isSupervisor && profile?.id) {
      const mySup = supervisors.find(sv => sv.user_id === profile.id)
      if (mySup) return students.filter(s => s.supervisor_id === mySup.id)
    }
    return students
  }, [students, supervisors, isCeo, isManager, isSupervisor, profile])

  const visibleSupervisors = useMemo(() => {
    if (isCeo) return supervisors
    if (isManager && profile?.batch_id) return supervisors.filter(s => s.batch_id === profile.batch_id)
    return supervisors
  }, [supervisors, isCeo, isManager, profile])

  // ── تحميل أولي + بحث افتراضي بآخر ٣٠ يوم ──
  useEffect(() => {
    async function load() {
      try {
        const [s, sups, initialFollowups] = await Promise.all([
          getStudents(),
          getSupervisors(),
          // افتراضياً اعرض كل المتابعات الأخيرة (آخر ٣٠ يوم) لتجنّب الصفحة الفارغة
          (() => {
            const d = new Date()
            d.setDate(d.getDate() - 30)
            const y = d.getFullYear()
            const m = String(d.getMonth() + 1).padStart(2, '0')
            const dd = String(d.getDate()).padStart(2, '0')
            return getDailyFollowups({ dateFrom: `${y}-${m}-${dd}` })
          })(),
        ])
        setStudents(s)
        setSupervisors(sups)
        setFollowups(initialFollowups)
      } catch (err) {
        console.error(err)
        toast.error('خطأ في تحميل البيانات')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // ── البحث (يستدعى يدوياً أو تلقائياً عند تغيّر الفلاتر) ──
  async function handleSearch(silent = false) {
    setSearching(true)
    try {
      const filters: Parameters<typeof getDailyFollowups>[0] = {}
      if (selectedStudent) filters.studentId = selectedStudent
      if (selectedSupervisor) {
        // daily_followups.supervisor_id يَخزن profile UUID (user_id) لا sup_xxx
        // لذا نُحوّل الـsup_xxx → user_id قبل تمريره للـDB
        const sup = supervisors.find(sv => sv.id === selectedSupervisor)
        if (sup?.user_id) filters.supervisorId = sup.user_id
        // لو لم يكن للمشرف user_id (حساب غير مُفعَّل)، نُهمل فلتر DB ونعتمد على client-side
      }
      if (dateFrom) filters.dateFrom = dateFrom
      if (dateTo) filters.dateTo = dateTo
      const data = await getDailyFollowups(filters)
      setFollowups(data)
      if (!silent) {
        if (data.length === 0) toast.info('لا توجد متابعات تطابق البحث')
        else toast.success(`عُثر على ${data.length} متابعة`)
      }
    } catch (err) {
      console.error(err)
      if (!silent) toast.error('خطأ في البحث')
    } finally {
      setSearching(false)
    }
  }

  // ── auto-search عند تغيّر فلاتر الـDB (طالب/مشرف/تواريخ) ──
  useEffect(() => {
    if (loading) return
    const t = setTimeout(() => { handleSearch(true) }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStudent, selectedSupervisor, dateFrom, dateTo])

  function clearFilters() {
    setSelectedStudent('')
    setSelectedSupervisor('')
    setDateFrom('')
    setDateTo('')
    setSearchTerm('')
    setFilterType('all')
    setFollowups([])
  }

  // ── طبَع المتابعات وفق فلتر النص + النوع ──
  const filteredFollowups = useMemo(() => {
    let list = followups
    // فلترة بالنوع
    if (filterType === 'with_notes') list = list.filter(f => f.notes && f.notes.trim().length > 0)
    else if (filterType === 'with_reasons') list = list.filter(f => Array.isArray(f.delay_reasons) && f.delay_reasons.length > 0)
    else if (filterType === 'delayed') list = list.filter(f => f.gap != null && f.gap < 0)
    else if (filterType === 'on_track') list = list.filter(f => f.gap != null && f.gap >= 0)

    // فلترة بالنص
    const q = searchTerm.trim().toLowerCase()
    if (q) {
      list = list.filter(f => {
        const haystack = `${f.notes || ''} ${f.near_review || ''} ${f.far_review || ''} ${(f.delay_reasons || []).join(' ')} ${(f.treatment_actions || []).join(' ')}`.toLowerCase()
        return haystack.includes(q)
      })
    }
    // ضمان الترتيب — الأحدث أولاً
    list = [...list].sort((a, b) => b.followup_date.localeCompare(a.followup_date))

    // فلتر المشرف client-side — يُغطي:
    // ١. الصفوف العادية: supervisor_id = user_id (UUID)
    // ٢. الصفوف القديمة: supervisor_id = sup_xxx slug
    // ٣. حالة المشرف بدون user_id (حساب غير مُفعَّل) حيث تجاهلنا فلتر DB
    if (selectedSupervisor) {
      const sup = supervisors.find(sv => sv.id === selectedSupervisor)
      if (sup) {
        list = list.filter(f =>
          f.supervisor_id === sup.user_id || // UUID (الحالة المعتادة)
          f.supervisor_id === sup.id          // sup_xxx (legacy)
        )
      }
    }

    // قيد الـrole: لو مشرف، أرنا فقط متابعاته أو متابعات طلابه
    // ملاحظة: f.supervisor_id يَحمل UUID للـprofile، لا sup_xxx — نَقارن مع mySup.user_id.
    if (isSupervisor && profile?.id) {
      const mySup = supervisors.find(sv => sv.user_id === profile.id)
      if (mySup) {
        const myStudentIds = new Set(students.filter(s => s.supervisor_id === mySup.id).map(s => s.id))
        list = list.filter(f => myStudentIds.has(f.student_id) || f.supervisor_id === mySup.user_id)
      }
    }
    return list
  }, [followups, filterType, searchTerm, selectedSupervisor, isSupervisor, profile, supervisors, students])

  // إحصائيات سريعة
  const stats = useMemo(() => {
    const total = filteredFollowups.length
    const onTrack = filteredFollowups.filter(f => f.gap != null && f.gap >= 0).length
    const delayed = filteredFollowups.filter(f => f.gap != null && f.gap < 0).length
    const withNotes = filteredFollowups.filter(f => f.notes && f.notes.trim()).length
    const exams = filteredFollowups.filter(f => f.is_exam_day).length
    return { total, onTrack, delayed, withNotes, exams }
  }, [filteredFollowups])

  // ── تَجميع "حسب الطالب" ───────────────────────────────
  // لكل طالب مرئي: total + breakdown سنة/شهر/أسبوع + قائمة المتابعات.
  type StudentStat = {
    student: DBStudent
    total: number
    byYear: Map<number, number>           // 1447 → 16
    byMonth: Map<string, number>          // "1447-11" → 8 (year-month)
    byWeek: Map<string, number>           // weekStartIso → 3
    items: DailyFollowup[]                // sorted desc
  }

  const studentStats = useMemo<StudentStat[]>(() => {
    const map = new Map<string, StudentStat>()
    visibleStudents.forEach(s => {
      map.set(s.id, {
        student: s,
        total: 0,
        byYear: new Map(),
        byMonth: new Map(),
        byWeek: new Map(),
        items: [],
      })
    })
    for (const f of filteredFollowups) {
      const stat = map.get(f.student_id)
      if (!stat) continue
      stat.total++
      stat.items.push(f)
      const h = gregorianToHijri(f.followup_date)
      stat.byYear.set(h.year, (stat.byYear.get(h.year) ?? 0) + 1)
      const ym = `${h.year}-${String(h.month).padStart(2, '0')}`
      stat.byMonth.set(ym, (stat.byMonth.get(ym) ?? 0) + 1)
      const wk = followupWeekKey(f.followup_date)
      stat.byWeek.set(wk, (stat.byWeek.get(wk) ?? 0) + 1)
    }
    // ترتيب الـitems لكل طالب — الأحدث أولاً
    map.forEach(s => s.items.sort((a, b) => b.followup_date.localeCompare(a.followup_date)))
    // ارجع كقائمة مَرتّبة: الأكثر متابعةً أولاً ثم اسم الطالب
    return Array.from(map.values()).sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total
      return a.student.name.localeCompare(b.student.name, 'ar')
    })
  }, [visibleStudents, filteredFollowups])

  // ── متابعات الأسبوع المحاسبي الحالي (السبت→الخميس) ──
  // يُحسَب من تاريخ "اليوم" — يَتجدّد تلقائياً مع كل أسبوع جديد.
  const thisWeekFollowups = useMemo(() => {
    const wk = getFollowupWeekRange(new Date())
    return filteredFollowups
      .filter(f => f.followup_date >= wk.start && f.followup_date <= wk.end)
      .sort((a, b) => b.followup_date.localeCompare(a.followup_date))
  }, [filteredFollowups])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>جاري التحميل...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-fade-in-up">
      <PageHeader
        eyebrow="أرشيف المتابعات"
        title="استعراض المتابعات الماضية"
        subtitle="ابحث في تاريخ متابعات الطلاب الكامل — تظل البيانات محفوظة بلا تاريخ انتهاء"
        actions={
          <Link
            href="/followups"
            className="px-3 py-2 text-sm font-semibold rounded-xl border transition-colors"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border-soft)', color: 'var(--text-secondary)' }}
          >
            ← المتابعات
          </Link>
        }
      />

      {/* ── لوحة الفلترة ── */}
      <div className="card-static p-4 space-y-3">
        <div className="flex items-center gap-2 pb-2 border-b" style={{ borderColor: 'var(--border-soft)' }}>
          <Filter className="w-4 h-4" style={{ color: 'var(--accent-teal)' }} />
          <h3 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>بحث متقدّم</h3>
          {followups.length > 0 && (
            <button
              onClick={clearFilters}
              className="mr-auto text-[11px] font-semibold px-2 py-1 rounded transition-colors"
              style={{ background: 'rgba(178,106,100,0.10)', color: '#B26A64' }}
            >
              <X className="w-3 h-3 inline ml-1" />
              مسح الفلاتر
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* الطالب */}
          <div>
            <label className="block text-[11px] font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>
              <User className="w-3 h-3 inline ml-1" />
              الطالب
            </label>
            <select
              value={selectedStudent}
              onChange={e => setSelectedStudent(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border"
              style={{ background: 'var(--bg-body)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
            >
              <option value="">— كل الطلاب —</option>
              {visibleStudents.map(s => (
                <option key={s.id} value={s.id}>{s.name} {s.batch_id ? `(د${s.batch_id})` : ''}</option>
              ))}
            </select>
          </div>

          {/* المشرف */}
          {(isCeo || isManager) && (
            <div>
              <label className="block text-[11px] font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>
                المشرف
              </label>
              <select
                value={selectedSupervisor}
                onChange={e => setSelectedSupervisor(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border"
                style={{ background: 'var(--bg-body)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
              >
                <option value="">— كل المشرفين —</option>
                {visibleSupervisors.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* من تاريخ */}
          <div>
            <label className="block text-[11px] font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>
              <Calendar className="w-3 h-3 inline ml-1" />
              من تاريخ
            </label>
            <HijriDatePicker value={dateFrom} onChange={setDateFrom} compact />
          </div>

          {/* إلى تاريخ */}
          <div>
            <label className="block text-[11px] font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>
              <Calendar className="w-3 h-3 inline ml-1" />
              إلى تاريخ
            </label>
            <HijriDatePicker value={dateTo} onChange={setDateTo} compact />
          </div>
        </div>

        {/* بحث نصي + زر البحث */}
        <div className="flex flex-col md:flex-row gap-2">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="ابحث في الملاحظات والمراجعات والأسباب..."
              className="w-full pr-9 pl-3 py-2 text-sm rounded-lg border"
              style={{ background: 'var(--bg-body)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
            />
          </div>
          <button
            onClick={() => handleSearch(false)}
            disabled={searching}
            className="btn-primary btn-ripple px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 flex items-center gap-1.5"
          >
            {searching ? (
              <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Search className="w-3.5 h-3.5" />
            )}
            بحث
          </button>
        </div>

        {/* فلتر النوع */}
        {followups.length > 0 && (
          <div className="flex gap-2 flex-wrap pt-2 border-t" style={{ borderColor: 'var(--border-soft)' }}>
            {[
              { id: 'all',          label: 'الكل',         icon: Archive },
              { id: 'with_notes',   label: 'بها ملاحظات', icon: FileText },
              { id: 'with_reasons', label: 'بها أسباب تأخر', icon: AlertTriangle },
              { id: 'delayed',      label: 'متأخر فقط',   icon: TrendingDown },
              { id: 'on_track',     label: 'منتظم فقط',   icon: TrendingUp },
            ].map(t => {
              const active = filterType === t.id
              const Icon = t.icon
              return (
                <button
                  key={t.id}
                  onClick={() => setFilterType(t.id as typeof filterType)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  style={{
                    background: active ? 'var(--accent-teal)' : 'var(--bg-elevated)',
                    color: active ? '#fff' : 'var(--text-secondary)',
                  }}
                >
                  <Icon className="w-3 h-3" />
                  {t.label}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ── إحصائيات النتائج ── */}
      {filteredFollowups.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatChip icon={<Archive className="w-4 h-4" />} value={stats.total} label="نتيجة" color="#356B6E" bg="rgba(53,107,110,0.10)" />
          <StatChip icon={<TrendingUp className="w-4 h-4" />} value={stats.onTrack} label="منتظم" color="#5A8F67" bg="rgba(90,143,103,0.10)" />
          <StatChip icon={<TrendingDown className="w-4 h-4" />} value={stats.delayed} label="متأخر" color="#B26A64" bg="rgba(178,106,100,0.10)" />
          <StatChip icon={<FileText className="w-4 h-4" />} value={stats.withNotes} label="بها ملاحظات" color="#8a5e1a" bg="rgba(192,138,72,0.10)" />
          <StatChip icon={<Sparkles className="w-4 h-4" />} value={stats.exams} label="يوم اختبار" color="#5D4256" bg="rgba(93,66,86,0.10)" />
        </div>
      )}

      {/* ── Tab toggle: كل الطلاب | هذا الأسبوع ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setViewMode('all_students')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
          style={{
            background: viewMode === 'all_students' ? 'var(--accent-teal)' : 'var(--bg-elevated)',
            color: viewMode === 'all_students' ? '#fff' : 'var(--text-secondary)',
          }}
        >
          <Users className="w-3 h-3" />
          كل الطلاب
        </button>
        <button
          onClick={() => setViewMode('this_week')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
          style={{
            background: viewMode === 'this_week' ? 'var(--accent-teal)' : 'var(--bg-elevated)',
            color: viewMode === 'this_week' ? '#fff' : 'var(--text-secondary)',
          }}
        >
          <Calendar className="w-3 h-3" />
          متابعات الأسبوع
        </button>

        {viewMode === 'all_students' && (
          <div className="flex items-center gap-1.5 mr-auto">
            <BarChart3 className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
            <span className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>تَقسيم:</span>
            {([
              { id: 'all',   label: 'إجمالي' },
              { id: 'year',  label: 'سنة هـ' },
              { id: 'month', label: 'شهر هـ' },
              { id: 'week',  label: 'أسبوع' },
            ] as const).map(b => (
              <button
                key={b.id}
                onClick={() => setBreakdown(b.id)}
                className="px-2 py-1 rounded text-[10px] font-semibold transition-all"
                style={{
                  background: breakdown === b.id ? 'rgba(53,107,110,0.15)' : 'transparent',
                  color: breakdown === b.id ? 'var(--accent-teal)' : 'var(--text-muted)',
                  border: `1px solid ${breakdown === b.id ? 'rgba(53,107,110,0.30)' : 'var(--border-soft)'}`,
                }}
              >
                {b.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── النتائج ── */}
      {followups.length === 0 && !searching ? (
        <div className="card-static p-10 text-center space-y-3">
          <History className="w-14 h-14 mx-auto opacity-40" style={{ color: 'var(--accent-teal)' }} />
          <p className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>لا متابعات في آخر ٣٠ يوم</p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            عدّل نطاق التاريخ من الفلاتر أعلاه للرجوع لتاريخ أبعد
          </p>
        </div>
      ) : filteredFollowups.length === 0 ? (
        <div className="card-static p-8 text-center" style={{ color: 'var(--text-muted)' }}>
          لا نتائج تطابق الفلاتر الحالية
        </div>
      ) : viewMode === 'all_students' ? (
        <ByStudentView
          stats={studentStats}
          breakdown={breakdown}
          expandedStudentId={expandedStudentId}
          onToggleStudent={(id) => setExpandedStudentId(prev => prev === id ? null : id)}
          supByUserId={supByUserId}
          supById={supById}
          studentById={studentById}
          onShowDetail={(f) => setDetailFollowup(f)}
        />
      ) : thisWeekFollowups.length === 0 ? (
        <div className="card-static p-8 text-center text-sm space-y-2" style={{ color: 'var(--text-muted)' }}>
          <Calendar className="w-10 h-10 mx-auto opacity-30" />
          <p>لا متابعات في أسبوع المحاسبة الحالي</p>
          <p className="text-[11px]">أسبوع: {toHijriShort(getFollowupWeekRange(new Date()).start)} → {toHijriShort(getFollowupWeekRange(new Date()).end)}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {thisWeekFollowups.map(f => {
            const student = studentById.get(f.student_id)
            const sup = resolveFollowupSupervisor(f, student, supByUserId, supById)
            const isExpanded = expandedId === (f.id ?? `${f.student_id}-${f.followup_date}`)
            const id = f.id ?? `${f.student_id}-${f.followup_date}`

            const hasNotes = f.notes && f.notes.trim().length > 0
            const hasReasons = Array.isArray(f.delay_reasons) && f.delay_reasons.length > 0
            const hasActions = Array.isArray(f.treatment_actions) && f.treatment_actions.length > 0
            const hasReviews = (f.near_review && f.near_review.trim()) || (f.far_review && f.far_review.trim())
            const hasContent = hasNotes || hasReasons || hasActions || hasReviews

            const gapClass = f.gap == null ? 'gray' : f.gap >= 0 ? 'green' : f.gap >= -5 ? 'amber' : 'red'
            const gapColors: Record<string, { bg: string; border: string; color: string }> = {
              green: { bg: 'rgba(90,143,103,0.08)',  border: 'rgba(90,143,103,0.30)',  color: '#3F6E4B' },
              amber: { bg: 'rgba(192,138,72,0.08)',  border: 'rgba(192,138,72,0.30)',  color: '#8a5e1a' },
              red:   { bg: 'rgba(185,72,56,0.08)',   border: 'rgba(185,72,56,0.30)',   color: '#B94838' },
              gray:  { bg: 'rgba(150,150,150,0.06)', border: 'rgba(150,150,150,0.20)', color: 'var(--text-muted)' },
            }
            const gC = gapColors[gapClass]

            return (
              <div
                key={id}
                className="rounded-xl border transition-all overflow-hidden"
                style={{ background: gC.bg, borderColor: gC.border }}
              >
                <button
                  onClick={() => setExpandedId(isExpanded ? null : id)}
                  className="w-full flex items-center gap-3 p-3 text-right hover:bg-black/[0.02] transition-colors"
                >
                  {/* تاريخ */}
                  <div className="flex flex-col items-center justify-center min-w-[64px] flex-shrink-0">
                    <span className="font-mono font-bold text-base" style={{ color: gC.color }}>
                      {toHijriShort(f.followup_date)}
                    </span>
                    <span className="text-[9px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {getDayNameAr(f.followup_date)}
                    </span>
                  </div>

                  {/* الطالب + المشرف */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h4 className="font-bold text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                        {student?.name || 'طالب محذوف'}
                      </h4>
                      {f.is_exam_day && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-bold"
                          style={{ background: 'rgba(192,138,72,0.20)', color: '#8a5e1a' }}>
                          اختبار
                        </span>
                      )}
                      {hasContent && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-medium"
                          style={{ background: 'rgba(53,107,110,0.10)', color: 'var(--accent-teal)' }}>
                          + تفاصيل
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {sup?.name || 'بدون مشرف'}
                      {student?.batch_id ? ` — دفعة ${student.batch_id}` : ''}
                    </p>
                  </div>

                  {/* الأوجه */}
                  <div className="text-center flex-shrink-0 px-2">
                    <p className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      {f.expected_position} <span className="opacity-60">→</span>
                    </p>
                    <p className="font-mono font-bold text-base" style={{ color: gC.color }}>
                      {f.actual_position ?? '—'}
                    </p>
                    {f.gap != null && (
                      <p className="font-mono text-[10px] font-semibold" style={{ color: gC.color }}>
                        {f.gap > 0 ? `+${f.gap}` : f.gap}
                      </p>
                    )}
                  </div>

                  {isExpanded ? <ChevronUp className="w-4 h-4 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 flex-shrink-0" />}
                </button>

                {/* التفاصيل الموسّعة */}
                {isExpanded && hasContent && (
                  <div className="p-3 pt-0 space-y-2 bg-white/40">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                      {f.near_review && (
                        <DetailBlock label="مراجعة قريبة" value={f.near_review} icon={<Sparkles className="w-3 h-3" />} color="#3F6E4B" />
                      )}
                      {f.far_review && (
                        <DetailBlock label="مراجعة بعيدة" value={f.far_review} icon={<Sparkles className="w-3 h-3" />} color="var(--accent-teal)" />
                      )}
                    </div>
                    {hasReasons && (
                      <DetailList label="أسباب التأخر" items={f.delay_reasons || []} color="#B26A64" bg="rgba(178,106,100,0.10)" />
                    )}
                    {hasActions && (
                      <DetailList label="الإجراءات العلاجية" items={f.treatment_actions || []} color="#3F6E4B" bg="rgba(90,143,103,0.10)" />
                    )}
                    {hasNotes && (
                      <div className="rounded-lg p-2.5 bg-white" style={{ border: '1px solid rgba(192,138,72,0.20)' }}>
                        <p className="text-[10px] font-semibold mb-1 flex items-center gap-1" style={{ color: '#8a5e1a' }}>
                          <FileText className="w-3 h-3" /> ملاحظات إضافية
                        </p>
                        <p className="text-xs whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>{f.notes}</p>
                      </div>
                    )}
                  </div>
                )}
                {isExpanded && !hasContent && (
                  <div className="p-3 pt-0 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                    لا تفاصيل إضافية في هذه المتابعة
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Modal تفاصيل متابعة (من عرض حسب الطالب) ── */}
      {detailFollowup && (
        <FollowupDetailModal
          followup={detailFollowup}
          student={studentById.get(detailFollowup.student_id)}
          supervisor={resolveFollowupSupervisor(
            detailFollowup,
            studentById.get(detailFollowup.student_id),
            supByUserId,
            supById,
          )}
          onClose={() => setDetailFollowup(null)}
        />
      )}
    </div>
  )
}

// ─── ByStudentView: عرض إحصاء حسب الطالب ────────────────
function ByStudentView({
  stats, breakdown, expandedStudentId, onToggleStudent,
  supByUserId, supById, studentById, onShowDetail,
}: {
  stats: Array<{
    student: DBStudent
    total: number
    byYear: Map<number, number>
    byMonth: Map<string, number>
    byWeek: Map<string, number>
    items: DailyFollowup[]
  }>
  breakdown: 'all' | 'year' | 'month' | 'week'
  expandedStudentId: string | null
  onToggleStudent: (id: string) => void
  supByUserId: Map<string, DBSupervisor>
  supById: Map<string, DBSupervisor>
  studentById: Map<string, DBStudent>
  onShowDetail: (f: DailyFollowup) => void
}) {
  // تَجميع الطلاب حسب الدفعة
  const byBatch = useMemo(() => {
    const m = new Map<number, typeof stats>()
    for (const s of stats) {
      const k = s.student.batch_id ?? 0
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(s)
    }
    return Array.from(m.entries()).sort((a, b) => a[0] - b[0])
  }, [stats])

  if (stats.length === 0) {
    return (
      <div className="card-static p-8 text-center" style={{ color: 'var(--text-muted)' }}>
        لا طلاب مرئيون
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {byBatch.map(([batchId, list]) => (
        <div key={batchId} className="space-y-2">
          <h3 className="text-xs font-bold pr-1" style={{ color: 'var(--text-secondary)' }}>
            دفعة {batchId} <span className="opacity-50">({list.length} طالب)</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {list.map(s => (
              <StudentRow
                key={s.student.id}
                stat={s}
                breakdown={breakdown}
                expanded={expandedStudentId === s.student.id}
                onToggle={() => onToggleStudent(s.student.id)}
                supByUserId={supByUserId}
                supById={supById}
                studentById={studentById}
                onShowDetail={onShowDetail}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── StudentRow: بطاقة طالب واحدة ────────────────
function StudentRow({
  stat, breakdown, expanded, onToggle,
  supByUserId, supById, studentById, onShowDetail,
}: {
  stat: {
    student: DBStudent
    total: number
    byYear: Map<number, number>
    byMonth: Map<string, number>
    byWeek: Map<string, number>
    items: DailyFollowup[]
  }
  breakdown: 'all' | 'year' | 'month' | 'week'
  expanded: boolean
  onToggle: () => void
  supByUserId: Map<string, DBSupervisor>
  supById: Map<string, DBSupervisor>
  studentById: Map<string, DBStudent>
  onShowDetail: (f: DailyFollowup) => void
}) {
  const breakdownChips = useMemo(() => {
    const out: Array<{ label: string; count: number }> = []
    if (breakdown === 'year' || breakdown === 'all') {
      const sorted = Array.from(stat.byYear.entries()).sort((a, b) => b[0] - a[0])
      for (const [year, count] of sorted) out.push({ label: `${year}هـ`, count })
    }
    if (breakdown === 'month') {
      const sorted = Array.from(stat.byMonth.entries()).sort((a, b) => b[0].localeCompare(a[0]))
      for (const [ym, count] of sorted) {
        const [y, m] = ym.split('-')
        // monthName من gregorianToHijri لأي تاريخ في هذا الشهر — نأخذ من أحد items
        const sample = stat.items.find(f => {
          const h = gregorianToHijri(f.followup_date)
          return h.year === Number(y) && h.month === Number(m)
        })
        const monthLabel = sample ? gregorianToHijri(sample.followup_date).monthName : `شهر ${m}`
        out.push({ label: `${monthLabel} ${y}`, count })
      }
    }
    if (breakdown === 'week') {
      const sorted = Array.from(stat.byWeek.entries()).sort((a, b) => b[0].localeCompare(a[0]))
      for (const [weekStart, count] of sorted) {
        const h = gregorianToHijri(weekStart)
        out.push({ label: `أسبوع ${h.day} ${h.monthName}`, count })
      }
    }
    return out.slice(0, 6) // حدّ أقصى لتجنّب فيض
  }, [stat, breakdown])

  const accent = stat.total === 0 ? '#999' : stat.total < 4 ? '#B26A64' : stat.total < 10 ? '#8a5e1a' : '#3F6E4B'

  // آخر متابعة (الأحدث بعد الترتيب التنازلي في items)
  const latest = stat.items[0]
  const latestGapColor = latest?.gap == null ? 'var(--text-muted)' : latest.gap >= 0 ? '#3F6E4B' : latest.gap >= -5 ? '#8a5e1a' : '#B94838'

  return (
    <div className="rounded-xl border overflow-hidden" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
      <button
        onClick={onToggle}
        className="w-full text-right p-3 flex items-center gap-3 hover:bg-black/[0.015] transition-colors"
      >
        <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 font-bold text-sm"
          style={{ background: `${accent}15`, color: accent, border: `1px solid ${accent}30` }}>
          {stat.student.name.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm truncate" style={{ color: 'var(--text-primary)' }}>
            {stat.student.name}
          </p>
          <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
            <strong className="font-mono text-base ml-1" style={{ color: accent }}>{stat.total}</strong>
            متابعة
          </p>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 flex-shrink-0" />}
      </button>

      {/* سطر ملخّص آخر متابعة (موجز) */}
      {latest && (
        <div className="px-3 pb-2 -mt-1">
          <div className="flex items-center gap-2 text-[10px] flex-wrap" style={{ color: 'var(--text-muted)' }}>
            <span className="inline-flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              <span>آخر:</span>
              <strong className="font-mono" style={{ color: 'var(--text-secondary)' }}>{toHijriShort(latest.followup_date)}</strong>
            </span>
            <span className="opacity-50">·</span>
            <span>
              مفترض <strong className="font-mono" style={{ color: 'var(--text-secondary)' }}>{latest.expected_position}</strong>
            </span>
            <span>
              فعلي <strong className="font-mono" style={{ color: 'var(--text-secondary)' }}>{latest.actual_position ?? '—'}</strong>
            </span>
            {latest.gap != null && (
              <span className="font-mono font-bold px-1.5 py-0.5 rounded"
                style={{ color: latestGapColor, background: `${latestGapColor}15` }}>
                {latest.gap > 0 ? `+${latest.gap}` : latest.gap}
              </span>
            )}
          </div>
        </div>
      )}

      {/* breakdown chips */}
      {breakdownChips.length > 0 && (
        <div className="px-3 pb-2 flex flex-wrap gap-1">
          {breakdownChips.map((c, i) => (
            <span key={i} className="text-[10px] px-1.5 py-0.5 rounded font-medium"
              style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
              {c.label}: <strong className="font-mono" style={{ color: 'var(--text-secondary)' }}>{c.count}</strong>
            </span>
          ))}
        </div>
      )}

      {/* expanded list */}
      {expanded && (
        <div className="border-t bg-white/40" style={{ borderColor: 'var(--border-soft)' }}>
          {stat.items.length === 0 ? (
            <p className="p-3 text-[11px] text-center" style={{ color: 'var(--text-muted)' }}>لا متابعات</p>
          ) : (
            <ul className="divide-y" style={{ borderColor: 'var(--border-soft)' }}>
              {stat.items.map(f => {
                const sup = resolveFollowupSupervisor(f, studentById.get(f.student_id), supByUserId, supById)
                const id = f.id ?? `${f.student_id}-${f.followup_date}`
                return (
                  <li key={id} className="px-3 py-2 flex items-center gap-2 text-[11px]">
                    <span className="font-mono font-bold text-[11px] min-w-[60px]" style={{ color: 'var(--text-secondary)' }}>
                      {toHijriShort(f.followup_date)}
                    </span>
                    <span className="opacity-60" style={{ color: 'var(--text-muted)' }}>·</span>
                    <span className="flex-1 truncate" style={{ color: 'var(--text-primary)' }}>
                      {sup?.name || 'بدون مشرف'}
                    </span>
                    <button
                      onClick={() => onShowDetail(f)}
                      className="text-[10px] font-semibold px-2 py-0.5 rounded transition-colors"
                      style={{ background: 'rgba(53,107,110,0.10)', color: 'var(--accent-teal)' }}
                    >
                      تفاصيل
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

// ─── FollowupDetailModal: تفاصيل متابعة واحدة ────────────────
function FollowupDetailModal({
  followup, student, supervisor, onClose,
}: {
  followup: DailyFollowup
  student: DBStudent | undefined
  supervisor: DBSupervisor | null
  onClose: () => void
}) {
  const f = followup
  const hasNotes = f.notes && f.notes.trim().length > 0
  const hasReasons = Array.isArray(f.delay_reasons) && f.delay_reasons.length > 0
  const hasActions = Array.isArray(f.treatment_actions) && f.treatment_actions.length > 0
  const hasContent = hasNotes || hasReasons || hasActions || f.near_review || f.far_review

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div
        className="card-static max-w-lg w-full max-h-[90vh] overflow-y-auto p-5 space-y-3"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 pb-2 border-b" style={{ borderColor: 'var(--border-soft)' }}>
          <div>
            <h3 className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>
              {student?.name || 'طالب'}
            </h3>
            <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
              {formatHijri(f.followup_date)}
              {supervisor ? ` · ${supervisor.name}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-black/5">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg p-2 text-center" style={{ background: 'var(--bg-elevated)' }}>
            <p className="text-[9px] mb-0.5" style={{ color: 'var(--text-muted)' }}>المفترض</p>
            <p className="font-mono font-bold text-sm" style={{ color: 'var(--text-primary)' }}>{f.expected_position}</p>
          </div>
          <div className="rounded-lg p-2 text-center" style={{ background: 'var(--bg-elevated)' }}>
            <p className="text-[9px] mb-0.5" style={{ color: 'var(--text-muted)' }}>الفعلي</p>
            <p className="font-mono font-bold text-sm" style={{ color: 'var(--text-primary)' }}>{f.actual_position ?? '—'}</p>
          </div>
          <div className="rounded-lg p-2 text-center" style={{ background: 'var(--bg-elevated)' }}>
            <p className="text-[9px] mb-0.5" style={{ color: 'var(--text-muted)' }}>الفجوة</p>
            <p className="font-mono font-bold text-sm" style={{ color: f.gap == null ? 'var(--text-muted)' : f.gap >= 0 ? '#3F6E4B' : '#B94838' }}>
              {f.gap == null ? '—' : f.gap > 0 ? `+${f.gap}` : f.gap}
            </p>
          </div>
        </div>

        {!hasContent ? (
          <p className="text-center text-xs py-4" style={{ color: 'var(--text-muted)' }}>لا تفاصيل إضافية</p>
        ) : (
          <div className="space-y-2">
            {f.near_review && <DetailBlock label="مراجعة قريبة" value={f.near_review} icon={<Sparkles className="w-3 h-3" />} color="#3F6E4B" />}
            {f.far_review && <DetailBlock label="مراجعة بعيدة" value={f.far_review} icon={<Sparkles className="w-3 h-3" />} color="var(--accent-teal)" />}
            {hasReasons && <DetailList label="أسباب التأخر" items={f.delay_reasons || []} color="#B26A64" bg="rgba(178,106,100,0.10)" />}
            {hasActions && <DetailList label="الإجراءات العلاجية" items={f.treatment_actions || []} color="#3F6E4B" bg="rgba(90,143,103,0.10)" />}
            {hasNotes && (
              <div className="rounded-lg p-2.5 bg-white" style={{ border: '1px solid rgba(192,138,72,0.20)' }}>
                <p className="text-[10px] font-semibold mb-1 flex items-center gap-1" style={{ color: '#8a5e1a' }}>
                  <FileText className="w-3 h-3" /> ملاحظات
                </p>
                <p className="text-xs whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>{f.notes}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function StatChip({
  icon, value, label, color, bg,
}: { icon: React.ReactNode; value: number; label: string; color: string; bg: string }) {
  return (
    <div className="card-static p-3 flex items-center gap-2.5">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: bg, color }}>
        {icon}
      </div>
      <div>
        <p className="font-mono font-bold text-lg leading-none" style={{ color: 'var(--text-primary)' }}>{value}</p>
        <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>{label}</p>
      </div>
    </div>
  )
}

function DetailBlock({ label, value, icon, color }: { label: string; value: string; icon: React.ReactNode; color: string }) {
  return (
    <div className="rounded-lg p-2.5 bg-white" style={{ border: `1px solid ${color}30` }}>
      <p className="text-[10px] font-semibold mb-1 flex items-center gap-1" style={{ color }}>
        {icon} {label}
      </p>
      <p className="text-xs" style={{ color: 'var(--text-primary)' }}>{value}</p>
    </div>
  )
}

function DetailList({ label, items, color, bg }: { label: string; items: string[]; color: string; bg: string }) {
  return (
    <div className="rounded-lg p-2.5" style={{ background: bg, border: `1px solid ${color}30` }}>
      <p className="text-[10px] font-semibold mb-1.5" style={{ color }}>{label}</p>
      <div className="flex flex-wrap gap-1">
        {items.map((it, i) => (
          <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-white font-medium"
            style={{ color, border: `1px solid ${color}40` }}>
            {it}
          </span>
        ))}
      </div>
    </div>
  )
}
