'use client'
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import {
  getStudents, getBatches, getTexts, getAllTextUnits, getRecitationsForStudents,
  type DBStudent, type DBBatch, type DBText, type DBTextUnit, type DBRecitation,
} from '@/lib/db'
import {
  BookOpen, Users, CheckCircle2, AlertTriangle,
  ChevronDown, Calendar, TrendingUp, ChevronLeft, Settings2, Plus,
} from 'lucide-react'
import { MatnSkeleton } from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'

// ── ثوابت ──────────────────────────────────────────────────────────────
const MATN_START = new Date('2026-01-18')

function currentMatnWeek(): number {
  return Math.max(1, Math.ceil((Date.now() - MATN_START.getTime()) / (7 * 86400000)))
}

const LEVEL_LABELS: Record<number, string> = {
  1: 'الأول', 2: 'الثاني', 3: 'الثالث',
  4: 'الرابع', 5: 'الخامس', 6: 'السادس',
}

const SUBJECT_COLORS: Record<string, string> = {
  'علوم القرآن': '#6366f1', 'الفقه': '#06b6d4', 'العقيدة': '#8b5cf6',
  'اللغة': '#22c55e', 'التاريخ': '#f59e0b', 'الحديث': '#ef4444',
  'التربية الإيمانية': '#ec4899', 'مهارات': '#64748b',
}

// ألوان التقييم
const GRADE_DOT: Record<string, { bg: string; border: string; label: string }> = {
  'ممتاز':  { bg: '#EAF3DE', border: '#27500A', label: 'ممتاز' },
  'جيد':    { bg: '#EAF3DE', border: '#5A8A1A', label: 'جيد' },
  'مقبول':  { bg: '#FAEEDA', border: '#854F0B', label: 'مقبول' },
  'متعثر':  { bg: '#FCEBEB', border: '#791F1F', label: 'متعثر' },
}

const GRADE_DOT_NONE = { bg: 'rgba(255,255,255,0.06)', border: 'var(--border-soft)' }

// ── مكوّن بطاقة KPI ────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, sub, color }: {
  icon: typeof Users; label: string; value: string | number; sub?: string; color: string
}) {
  return (
    <div className="card-static p-4 flex items-start gap-3">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: `${color}15` }}>
        <Icon size={18} style={{ color }} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>{label}</p>
        <p className="text-lg font-bold mt-0.5" style={{ color: 'var(--text-primary)' }}>{value}</p>
        {sub && <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
      </div>
    </div>
  )
}

// ── مكوّن شريحة الطالب ─────────────────────────────────────────────────
function StudentChip({ student, recitation, onClick }: {
  student: DBStudent
  recitation: DBRecitation | undefined
  onClick: () => void
}) {
  const dot = recitation?.final_status ? GRADE_DOT[recitation.final_status] : null
  const assessed = !!recitation?.final_status
  const statusLabel = recitation?.final_status ?? 'لم يُرصد'

  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl transition-all active:scale-95"
      style={{
        background: assessed ? `${dot?.bg}` : 'var(--bg-card)',
        border: `2px solid ${dot?.border ?? GRADE_DOT_NONE.border}`,
        minWidth: '72px',
        minHeight: '80px',
      }}
    >
      {/* دائرة الحالة */}
      <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold"
        style={{
          background: assessed ? dot?.border : 'var(--bg-elevated)',
          color: assessed ? '#fff' : 'var(--text-muted)',
        }}>
        {student.name.charAt(0)}
      </div>
      {/* الاسم */}
      <span className="text-[10px] font-medium text-center leading-tight line-clamp-2"
        style={{ color: assessed ? dot?.border : 'var(--text-secondary)' }}>
        {student.name.split(' ').slice(0, 2).join(' ')}
      </span>
      {/* حالة */}
      <span className="text-[8px] font-medium px-1.5 py-0.5 rounded-full"
        style={{
          background: assessed ? `${dot?.border}20` : 'rgba(255,255,255,0.04)',
          color: assessed ? dot?.border : 'var(--text-muted)',
        }}>
        {statusLabel}
      </span>
    </button>
  )
}

// ── مكوّن شريط الأسابيع ────────────────────────────────────────────────
function UnitTimeline({ units, selectedUnit, onSelect, recitations, studentCount }: {
  units: DBTextUnit[]
  selectedUnit: number
  onSelect: (unitNum: number) => void
  recitations: DBRecitation[]
  studentCount: number
}) {
  const week = currentMatnWeek()
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
      {units.map(u => {
        const isCurrent = u.unit_number === week
        const isSelected = u.unit_number === selectedUnit
        const isPast = u.unit_number < week
        const unitRecs = recitations.filter(r => r.text_unit_id === u.id && r.final_status)
        const pct = studentCount > 0 ? Math.round((unitRecs.length / studentCount) * 100) : 0
        const allDone = pct === 100
        const someDone = pct > 0

        return (
          <button key={u.id} onClick={() => onSelect(u.unit_number)}
            className="flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-lg transition-all flex-shrink-0"
            style={{
              minWidth: '44px',
              minHeight: '44px',
              background: isSelected
                ? 'rgba(99,102,241,0.15)'
                : allDone
                  ? 'rgba(39,80,10,0.1)'
                  : 'rgba(255,255,255,0.03)',
              border: `1.5px solid ${
                isSelected ? '#6366f1'
                : allDone ? '#27500A'
                : isCurrent ? '#854F0B'
                : 'var(--border-color)'
              }`,
            }}>
            <span className="text-[10px] font-bold" style={{
              color: isSelected ? '#6366f1'
                : allDone ? '#27500A'
                : isCurrent ? '#854F0B'
                : 'var(--text-muted)'
            }}>
              {u.unit_number}
            </span>
            {/* Mini progress indicator */}
            <div className="w-4 h-1 rounded-full" style={{
              background: allDone ? '#27500A'
                : someDone ? '#854F0B'
                : 'var(--border-color)'
            }} />
          </button>
        )
      })}
    </div>
  )
}

// ── مكوّن بطاقة المتن ──────────────────────────────────────────────────
function MatnCard({ text, units, students, recitations, onStudentClick }: {
  text: DBText
  units: DBTextUnit[]
  students: DBStudent[]
  recitations: DBRecitation[]
  onStudentClick: (textId: string, unitId: string, unitNum: number, studentId: string) => void
}) {
  const week = currentMatnWeek()
  const maxUnit = units.length
  const defaultUnit = Math.min(week, maxUnit)
  const [selectedUnit, setSelectedUnit] = useState(defaultUnit)
  const subjectColor = SUBJECT_COLORS[text.subject] ?? '#6366f1'

  // المقرر المحدد
  const activeUnitData = units.find(u => u.unit_number === selectedUnit)

  // تسميعات هذا المقرر
  const unitRecitations = useMemo(() => {
    if (!activeUnitData) return new Map<string, DBRecitation>()
    const map = new Map<string, DBRecitation>()
    for (const r of recitations) {
      if (r.text_unit_id === activeUnitData.id) map.set(r.student_id, r)
    }
    return map
  }, [recitations, activeUnitData])

  // إحصائيات
  const assessed = unitRecitations.size
  const assessedPct = students.length > 0 ? Math.round((assessed / students.length) * 100) : 0
  const isTextDone = week > maxUnit
  const mutqinCount = Array.from(unitRecitations.values()).filter(r =>
    r.final_status === 'ممتاز' || r.final_status === 'جيد'
  ).length
  const mutaaththirCount = Array.from(unitRecitations.values()).filter(r =>
    r.final_status === 'متعثر'
  ).length

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>

      {/* رأس البطاقة */}
      <div className="p-4 pb-3">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: subjectColor }} />
              <h3 className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                {text.name_ar}
              </h3>
              {isTextDone && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                  style={{ background: '#EAF3DE', color: '#27500A' }}>
                  مكتمل
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                style={{ background: `${subjectColor}18`, color: subjectColor }}>
                {text.subject}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' }}>
                {text.type}
              </span>
              <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                {text.total_lines} سطر · {maxUnit} مقرر
              </span>
            </div>
          </div>

          {/* نسبة الرصد */}
          <div className="text-left flex-shrink-0">
            <p className="text-lg font-bold" style={{
              color: assessedPct === 100 ? '#27500A'
                : assessedPct >= 50 ? '#854F0B'
                : 'var(--text-muted)'
            }}>
              {assessed}/{students.length}
            </p>
            <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>تم الرصد</p>
          </div>
        </div>

        {/* شريط التقدم الكلي */}
        <div className="h-2 rounded-full overflow-hidden mb-3" style={{ background: 'var(--progress-track)' }}>
          <div className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${assessedPct}%`,
              background: assessedPct === 100 ? '#27500A'
                : assessedPct >= 50 ? '#854F0B'
                : 'var(--text-muted)',
            }} />
        </div>

        {/* شريط الأسابيع / المقررات */}
        <UnitTimeline
          units={units}
          selectedUnit={selectedUnit}
          onSelect={setSelectedUnit}
          recitations={recitations}
          studentCount={students.length}
        />
      </div>

      {/* تفاصيل المقرر المحدد */}
      {activeUnitData && (
        <div style={{ borderTop: '1px solid var(--border-color)' }}>
          {/* معلومات المقرر */}
          <div className="px-4 py-2.5 flex items-center justify-between flex-wrap gap-2"
            style={{ background: 'rgba(255,255,255,0.02)' }}>
            <div className="flex items-center gap-2">
              <Calendar size={13} style={{ color: 'var(--text-muted)' }} />
              <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                المقرر {selectedUnit}
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' }}>
                أسطر {activeUnitData.start_line}–{activeUnitData.end_line}
              </span>
            </div>
            <div className="flex items-center gap-3 text-[10px]" style={{ color: 'var(--text-muted)' }}>
              {mutqinCount > 0 && (
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full" style={{ background: '#27500A' }} />
                  {mutqinCount} متقن
                </span>
              )}
              {mutaaththirCount > 0 && (
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full" style={{ background: '#791F1F' }} />
                  {mutaaththirCount} متعثر
                </span>
              )}
            </div>
          </div>

          {/* شبكة الطلاب */}
          <div className="p-3">
            {students.length === 0 ? (
              <EmptyState icon={<Users size={20} />} title="لا يوجد طلاب" compact />
            ) : (
              <div className="grid gap-2" style={{
                gridTemplateColumns: 'repeat(auto-fill, minmax(76px, 1fr))',
              }}>
                {students
                  .sort((a, b) => {
                    const ra = unitRecitations.get(a.id)
                    const rb = unitRecitations.get(b.id)
                    // غير المرصودين أولاً
                    if (!ra?.final_status && rb?.final_status) return -1
                    if (ra?.final_status && !rb?.final_status) return 1
                    return a.name.localeCompare(b.name, 'ar')
                  })
                  .map(st => (
                    <StudentChip
                      key={st.id}
                      student={st}
                      recitation={unitRecitations.get(st.id)}
                      onClick={() => onStudentClick(text.id, activeUnitData.id, selectedUnit, st.id)}
                    />
                  ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── الصفحة الرئيسية ────────────────────────────────────────────────────
export default function MatnPage() {
  const { profile } = useAuth()
  const router = useRouter()
  const isCeo = profile?.role === 'ceo'
  // من يملك صلاحية إدارة المتون؟ المدير التنفيذي ومدير الدفعة.
  const canManageMatn = isCeo || profile?.role === 'batch_manager'
  const myBatchId = profile?.batch_id ?? null
  const week = currentMatnWeek()

  const [loading, setLoading] = useState(true)
  const [students, setStudents] = useState<DBStudent[]>([])
  const [batches, setBatches] = useState<DBBatch[]>([])
  const [texts, setTexts] = useState<DBText[]>([])
  const [textUnits, setTextUnits] = useState<DBTextUnit[]>([])
  const [recitations, setRecitations] = useState<DBRecitation[]>([])
  const [selectedBatch, setSelectedBatch] = useState<number | 'all'>('all')
  const [selectedLevel, setSelectedLevel] = useState<number>(1)

  // ── تحميل البيانات ──
  useEffect(() => {
    const init = async () => {
      const [s, b, t, tu] = await Promise.all([
        getStudents(), getBatches(), getTexts(), getAllTextUnits(),
      ])
      const activeStudents = s.filter(st => st.status === 'active' || !st.status)
      setStudents(activeStudents)
      setBatches(b)
      setTexts(t)
      setTextUnits(tu)

      const ids = activeStudents.map(st => st.id)
      if (ids.length > 0) {
        const recs = await getRecitationsForStudents(ids).catch(() => [] as DBRecitation[])
        setRecitations(recs)
      }
      if (myBatchId) setSelectedBatch(myBatchId)
    }
    init().catch(console.error).finally(() => setLoading(false))
  }, [myBatchId])

  // ── الطلاب المعروضون ──
  const visibleStudents = useMemo(() => {
    if (profile?.role === 'supervisor' || profile?.role === 'teacher' || profile?.role === 'batch_manager') {
      return myBatchId ? students.filter(s => s.batch_id === myBatchId) : []
    }
    return selectedBatch === 'all' ? students : students.filter(s => s.batch_id === selectedBatch)
  }, [students, selectedBatch, profile, myBatchId])

  // ── متون المستوى المحدد ──
  const levelTexts = useMemo(
    () => texts.filter(t => t.level_id === selectedLevel).sort((a, b) => a.order_in_level - b.order_in_level),
    [texts, selectedLevel],
  )

  // ── وحدات المقررات مجمعة حسب المتن ──
  const unitsByText = useMemo(() => {
    const map = new Map<string, DBTextUnit[]>()
    for (const u of textUnits) {
      const arr = map.get(u.text_id) || []
      arr.push(u)
      map.set(u.text_id, arr)
    }
    return map
  }, [textUnits])

  // ── تسميعات مجمعة حسب المتن ──
  const recsByText = useMemo(() => {
    const map = new Map<string, DBRecitation[]>()
    for (const r of recitations) {
      const arr = map.get(r.text_id) || []
      arr.push(r)
      map.set(r.text_id, arr)
    }
    return map
  }, [recitations])

  // ── إحصائيات المستويات ──
  const levelStats = useMemo(() => {
    const studentIds = new Set(visibleStudents.map(s => s.id))
    return [1, 2, 3, 4, 5, 6].map(lvl => {
      const lvlTexts = texts.filter(t => t.level_id === lvl)
      let totalPossible = 0
      let totalAssessed = 0
      for (const t of lvlTexts) {
        const units = unitsByText.get(t.id) || []
        const maxUnit = Math.min(week, units.length)
        for (let u = 0; u < maxUnit; u++) {
          const unit = units[u]
          if (!unit) continue
          totalPossible += visibleStudents.length
          const recs = (recsByText.get(t.id) || []).filter(
            r => r.text_unit_id === unit.id && r.final_status && studentIds.has(r.student_id)
          )
          totalAssessed += recs.length
        }
      }
      const pct = totalPossible > 0 ? Math.round((totalAssessed / totalPossible) * 100) : 0
      return { lvl, pct, textCount: lvlTexts.length }
    })
  }, [texts, visibleStudents, unitsByText, recsByText, week])

  // ── إحصائيات KPI للمستوى الحالي ──
  const kpiStats = useMemo(() => {
    const studentIds = new Set(visibleStudents.map(s => s.id))
    let assessedThisWeek = 0
    let totalThisWeek = 0
    let mutqinTotal = 0
    let assessedTotal = 0
    const mutaaththirStudents = new Set<string>()

    for (const t of levelTexts) {
      const units = unitsByText.get(t.id) || []
      const currentUnit = units.find(u => u.unit_number === Math.min(week, units.length))
      if (!currentUnit) continue

      totalThisWeek += visibleStudents.length
      const recs = (recsByText.get(t.id) || []).filter(
        r => r.text_unit_id === currentUnit.id && studentIds.has(r.student_id)
      )
      for (const r of recs) {
        if (r.final_status) {
          assessedThisWeek++
          assessedTotal++
          if (r.final_status === 'ممتاز' || r.final_status === 'جيد') mutqinTotal++
          if (r.final_status === 'متعثر') mutaaththirStudents.add(r.student_id)
        }
      }
    }

    const mutqinPct = assessedTotal > 0 ? Math.round((mutqinTotal / assessedTotal) * 100) : 0
    return {
      totalStudents: visibleStudents.length,
      assessedThisWeek,
      totalThisWeek,
      mutqinPct,
      mutaaththirCount: mutaaththirStudents.size,
    }
  }, [visibleStudents, levelTexts, unitsByText, recsByText, week])

  // ── الانتقال لشاشة التسميع ──
  const handleStudentClick = (textId: string, unitId: string, unitNum: number, studentId: string) => {
    router.push(`/matn/assess?textId=${textId}&unitId=${unitId}&unit=${unitNum}&studentId=${studentId}`)
  }

  // ── شاشة التحميل ──
  if (loading) return <MatnSkeleton />

  return (
    <div className="space-y-5 max-w-3xl mx-auto">

      {/* ── العنوان + فلتر الدفعة ── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <BookOpen size={20} style={{ color: '#6366f1' }} />
            رصد المتون
          </h1>
          <p className="text-xs mt-0.5 flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
            <Calendar size={11} />
            الأسبوع {week} · {visibleStudents.length} طالب · {texts.length} متن
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* زر بارز: إضافة متن — ينقل إلى شاشة الإدارة ويفتح نموذج الإضافة */}
          {canManageMatn && (
            <button onClick={() => router.push('/matn/manage?action=add')}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 shadow-md hover:shadow-lg"
              style={{
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                minHeight: '44px',
              }}>
              <Plus size={16} />
              إضافة متن
            </button>
          )}
          {/* زر بارز: تعديل المتون */}
          {canManageMatn && (
            <button onClick={() => router.push('/matn/manage')}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 shadow-md hover:shadow-lg"
              style={{
                background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                minHeight: '44px',
              }}>
              <Settings2 size={16} />
              تعديل المتون
            </button>
          )}

          {isCeo && (
          <div className="relative">
            <select value={selectedBatch === 'all' ? 'all' : String(selectedBatch)}
              onChange={e => setSelectedBatch(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="text-sm pl-7 pr-3 py-2 rounded-xl appearance-none outline-none"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', minHeight: '44px' }}>
              <option value="all">كل الدفعات</option>
              {batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <ChevronDown size={12} className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: 'var(--text-muted)' }} />
          </div>
          )}
        </div>
      </div>

      {/* ── تبويبات المستويات ── */}
      <div className="grid grid-cols-6 gap-1.5">
        {levelStats.map(({ lvl, pct, textCount }) => {
          const isActive = selectedLevel === lvl
          return (
            <button key={lvl} onClick={() => setSelectedLevel(lvl)}
              className="rounded-xl p-2.5 text-center transition-all"
              style={{
                minHeight: '44px',
                background: isActive ? 'rgba(99,102,241,0.12)' : 'var(--bg-card)',
                border: `1.5px solid ${isActive ? '#6366f1' : 'var(--border-color)'}`,
              }}>
              <p className="text-xs font-bold" style={{
                color: isActive ? '#6366f1' : 'var(--text-muted)'
              }}>
                م{lvl}
              </p>
              <p className="text-sm font-bold mt-0.5" style={{
                color: isActive ? '#6366f1' : 'var(--text-primary)'
              }}>
                {pct}%
              </p>
              <div className="mt-1 h-1 rounded-full overflow-hidden" style={{ background: 'var(--progress-track)' }}>
                <div className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${pct}%`,
                    background: pct >= 80 ? '#27500A' : pct >= 40 ? '#854F0B' : 'var(--text-muted)',
                  }} />
              </div>
              <p className="text-[9px] mt-1" style={{ color: 'var(--text-muted)' }}>{textCount} متن</p>
            </button>
          )
        })}
      </div>

      {/* ── بطاقات KPI ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard
          icon={Users}
          label="طلاب نشطين"
          value={kpiStats.totalStudents}
          color="#6366f1"
        />
        <KpiCard
          icon={CheckCircle2}
          label="تم الرصد"
          value={`${kpiStats.assessedThisWeek}/${kpiStats.totalThisWeek}`}
          sub={`هذا الأسبوع — المستوى ${LEVEL_LABELS[selectedLevel]}`}
          color="#27500A"
        />
        <KpiCard
          icon={TrendingUp}
          label="نسبة الإتقان"
          value={`${kpiStats.mutqinPct}%`}
          sub="ممتاز + جيد"
          color="#27500A"
        />
        <KpiCard
          icon={AlertTriangle}
          label="طلاب متعثرون"
          value={kpiStats.mutaaththirCount}
          sub="يحتاجون متابعة"
          color="#791F1F"
        />
      </div>

      {/* ── عنوان المستوى ── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-bold" style={{ color: 'var(--text-primary)' }}>
            المستوى {LEVEL_LABELS[selectedLevel]}
          </h2>
          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {levelTexts.length} متن · اضغط على الطالب لبدء التسميع
          </p>
        </div>
        {/* دليل الألوان */}
        <div className="flex items-center gap-3 flex-wrap text-[10px]" style={{ color: 'var(--text-muted)' }}>
          {[
            { color: '#27500A', label: 'ممتاز/جيد' },
            { color: '#854F0B', label: 'مقبول' },
            { color: '#791F1F', label: 'متعثر' },
          ].map(({ color, label }) => (
            <span key={label} className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ background: color }} /> {label}
            </span>
          ))}
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ border: '1px solid var(--text-muted)' }} /> لم يُرصد
          </span>
        </div>
      </div>

      {/* ── بطاقات المتون ── */}
      {levelTexts.length === 0 ? (
        <EmptyState
          icon={<BookOpen size={28} />}
          title="لا توجد متون لهذا المستوى"
          message="لم يتم إضافة أي متون لهذا المستوى بعد"
        />
      ) : (
        <div className="space-y-4">
          {levelTexts.map(text => (
            <MatnCard
              key={text.id}
              text={text}
              units={unitsByText.get(text.id) || []}
              students={visibleStudents}
              recitations={recsByText.get(text.id) || []}
              onStudentClick={handleStudentClick}
            />
          ))}
        </div>
      )}
    </div>
  )
}
