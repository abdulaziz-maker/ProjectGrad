'use client'
import { useState, useEffect, useMemo, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import {
  getStudents, getTexts, getAllTextUnits, getRecitationsByUnit, upsertRecitation,
  computeFinalStatus,
  type DBStudent, type DBText, type DBTextUnit, type DBRecitation,
  type RecitationGrade, type FinalStatus,
} from '@/lib/db'
import {
  ChevronRight, ChevronLeft, Loader2, Save, Mic, MicOff,
  BookOpen, ArrowRight, CheckCircle2, FileText,
} from 'lucide-react'
import { GenericSkeleton } from '@/components/ui/Skeleton'

// ── ألوان التقييم ───────────────────────────────────────────────────────
const GRADE_COLORS: Record<RecitationGrade, { bg: string; text: string; border: string; activeBg: string }> = {
  mutqin:      { bg: 'rgba(39,80,10,0.08)', text: '#27500A', border: '#27500A', activeBg: '#EAF3DE' },
  daeef:       { bg: 'rgba(133,79,11,0.08)', text: '#854F0B', border: '#854F0B', activeBg: '#FAEEDA' },
  mutaaththir: { bg: 'rgba(121,31,31,0.08)', text: '#791F1F', border: '#791F1F', activeBg: '#FCEBEB' },
}

const GRADE_LABELS: Record<RecitationGrade, string> = {
  mutqin: 'متقن',
  daeef: 'ضعيف',
  mutaaththir: 'متعثر',
}

const FINAL_COLORS: Record<string, { bg: string; text: string }> = {
  'ممتاز': { bg: '#EAF3DE', text: '#27500A' },
  'جيد':   { bg: '#EAF3DE', text: '#27500A' },
  'مقبول': { bg: '#FAEEDA', text: '#854F0B' },
  'متعثر': { bg: '#FCEBEB', text: '#791F1F' },
}

const CATEGORY_LABELS = [
  { key: 'new_memo_status' as const, label: 'حفظ جديد', icon: BookOpen, desc: 'المقطع الجديد لهذا الأسبوع' },
  { key: 'ghareeb_status' as const, label: 'غريب', icon: FileText, desc: 'غريب الألفاظ والمعاني' },
  { key: 'near_review_status' as const, label: 'مراجعة قريبة', icon: ArrowRight, desc: 'مراجعة المقاطع الأخيرة' },
  { key: 'far_review_status' as const, label: 'مراجعة بعيدة', icon: ArrowRight, desc: 'مراجعة من بداية المتن' },
]

type CategoryKey = typeof CATEGORY_LABELS[number]['key']

// ── مكوّن مجموعة التقييم ────────────────────────────────────────────────
function GradeGroup({ label, desc, icon: Icon, value, onChange }: {
  label: string
  desc: string
  icon: typeof BookOpen
  value: RecitationGrade | null
  onChange: (grade: RecitationGrade) => void
}) {
  const grades: RecitationGrade[] = ['mutqin', 'daeef', 'mutaaththir']

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
      {/* عنوان المحور */}
      <div className="px-4 py-3 flex items-center gap-3"
        style={{ borderBottom: '1px solid var(--border-color)' }}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: 'rgba(99,102,241,0.1)' }}>
          <Icon size={16} style={{ color: '#C08A48' }} />
        </div>
        <div>
          <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{label}</p>
          <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{desc}</p>
        </div>
      </div>

      {/* أزرار التقييم */}
      <div className="p-3 grid grid-cols-3 gap-2">
        {grades.map(g => {
          const isActive = value === g
          const c = GRADE_COLORS[g]
          return (
            <button
              key={g}
              onClick={() => onChange(g)}
              className="rounded-xl py-3 px-2 font-bold text-sm transition-all active:scale-95"
              style={{
                minHeight: '52px',
                background: isActive ? c.activeBg : c.bg,
                border: `2px solid ${isActive ? c.border : 'transparent'}`,
                color: c.text,
                boxShadow: isActive ? `0 0 12px ${c.border}30` : 'none',
              }}
            >
              {GRADE_LABELS[g]}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── المحتوى الرئيسي لشاشة التسميع ──────────────────────────────────────
function AssessContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { profile } = useAuth()

  const textId = searchParams.get('textId') ?? ''
  const unitId = searchParams.get('unitId') ?? ''
  const unitNum = Number(searchParams.get('unit') || '1')
  const initialStudentId = searchParams.get('studentId') ?? ''

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [text, setText] = useState<DBText | null>(null)
  const [unit, setUnit] = useState<DBTextUnit | null>(null)
  const [students, setStudents] = useState<DBStudent[]>([])
  const [existingRecs, setExistingRecs] = useState<Map<string, DBRecitation>>(new Map())
  const [currentStudentIdx, setCurrentStudentIdx] = useState(0)

  // بيانات النموذج
  const [newMemo, setNewMemo] = useState<RecitationGrade | null>(null)
  const [ghareeb, setGhareeb] = useState<RecitationGrade | null>(null)
  const [nearReview, setNearReview] = useState<RecitationGrade | null>(null)
  const [farReview, setFarReview] = useState<RecitationGrade | null>(null)
  const [notes, setNotes] = useState('')

  // ── تحميل البيانات ──
  useEffect(() => {
    const init = async () => {
      const [allTexts, allUnits, allStudents] = await Promise.all([
        getTexts(),
        getAllTextUnits(),
        getStudents(),
      ])

      const foundText = allTexts.find(t => t.id === textId)
      const foundUnit = allUnits.find(u => u.id === unitId)
      setText(foundText || null)
      setUnit(foundUnit || null)

      // تصفية الطلاب حسب الدفعة
      const batchId = profile?.batch_id
      const activeStudents = allStudents
        .filter(s => s.status === 'active' || !s.status)
        .filter(s => {
          if (profile?.role === 'ceo') return true
          return batchId ? s.batch_id === batchId : true
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'ar'))
      setStudents(activeStudents)

      // تحميل التسميعات الموجودة
      if (foundUnit) {
        const recs = await getRecitationsByUnit(foundUnit.id).catch(() => [] as DBRecitation[])
        const recsMap = new Map<string, DBRecitation>()
        for (const r of recs) recsMap.set(r.student_id, r)
        setExistingRecs(recsMap)
      }

      // تحديد الطالب المبدئي
      const startIdx = activeStudents.findIndex(s => s.id === initialStudentId)
      setCurrentStudentIdx(startIdx >= 0 ? startIdx : 0)
    }
    init().catch(console.error).finally(() => setLoading(false))
  }, [textId, unitId, initialStudentId, profile])

  // الطالب الحالي
  const currentStudent = students[currentStudentIdx] ?? null

  // تحميل بيانات الطالب عند التبديل
  useEffect(() => {
    if (!currentStudent) return
    const rec = existingRecs.get(currentStudent.id)
    if (rec) {
      setNewMemo(rec.new_memo_status)
      setGhareeb(rec.ghareeb_status)
      setNearReview(rec.near_review_status)
      setFarReview(rec.far_review_status)
      setNotes(rec.notes ?? '')
    } else {
      setNewMemo(null)
      setGhareeb(null)
      setNearReview(null)
      setFarReview(null)
      setNotes('')
    }
    setSaved(false)
  }, [currentStudentIdx, currentStudent, existingRecs])

  // الحالة النهائية المحسوبة
  const finalStatus = useMemo(
    () => computeFinalStatus(newMemo, ghareeb, nearReview, farReview),
    [newMemo, ghareeb, nearReview, farReview],
  )
  const finalColor = finalStatus ? FINAL_COLORS[finalStatus] : null

  // عدد المحاور المملوءة
  const filledCount = [newMemo, ghareeb, nearReview, farReview].filter(Boolean).length

  // ── حفظ التقييم ──
  const handleSave = useCallback(async () => {
    if (!currentStudent || !text || !unit) return
    setSaving(true)
    try {
      await upsertRecitation({
        student_id: currentStudent.id,
        text_id: text.id,
        text_unit_id: unit.id,
        week_number: unitNum,
        new_memo_status: newMemo,
        ghareeb_status: ghareeb,
        near_review_status: nearReview,
        far_review_status: farReview,
        notes: notes || null,
        assessed_by: profile?.name ?? profile?.id ?? null,
      })

      // تحديث الكاش المحلي
      const updatedRec: DBRecitation = {
        id: existingRecs.get(currentStudent.id)?.id ?? '',
        student_id: currentStudent.id,
        text_id: text.id,
        text_unit_id: unit.id,
        week_number: unitNum,
        new_memo_status: newMemo,
        ghareeb_status: ghareeb,
        near_review_status: nearReview,
        far_review_status: farReview,
        final_status: finalStatus,
        notes: notes || null,
        voice_note_url: null,
        assessed_by: profile?.name ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      setExistingRecs(prev => {
        const next = new Map(prev)
        next.set(currentStudent.id, updatedRec)
        return next
      })

      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      console.error('Save error:', err)
    } finally {
      setSaving(false)
    }
  }, [currentStudent, text, unit, unitNum, newMemo, ghareeb, nearReview, farReview, notes, profile, finalStatus, existingRecs])

  // ── التنقل بين الطلاب ──
  const goToStudent = (delta: number) => {
    const newIdx = currentStudentIdx + delta
    if (newIdx >= 0 && newIdx < students.length) {
      setCurrentStudentIdx(newIdx)
    }
  }

  // عدد المرصودين
  const assessedCount = Array.from(existingRecs.values()).filter(r => r.final_status).length

  // ── شاشة التحميل ──
  if (loading) return <GenericSkeleton rows={4} />

  if (!text || !unit || !currentStudent) return (
    <div className="text-center py-16">
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>لم يتم العثور على البيانات</p>
      <button onClick={() => router.push('/matn')}
        className="mt-4 text-sm px-4 py-2 rounded-xl"
        style={{ background: 'rgba(99,102,241,0.1)', color: '#C08A48' }}>
        العودة للمتون
      </button>
    </div>
  )

  return (
    <div className="max-w-lg mx-auto space-y-4 pb-8">

      {/* ── رأس الصفحة ── */}
      <div className="flex items-center gap-3 mb-2">
        <button onClick={() => router.push('/matn')}
          className="w-11 h-11 rounded-xl flex items-center justify-center"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <ChevronRight size={18} style={{ color: 'var(--text-secondary)' }} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold truncate" style={{ color: 'var(--text-primary)' }}>
            تسميع الطالب
          </h1>
          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {text.name_ar} — المقرر {unitNum} (أسطر {unit.start_line}–{unit.end_line})
          </p>
        </div>
        <div className="text-left flex-shrink-0">
          <p className="text-xs font-bold" style={{ color: '#C08A48' }}>{assessedCount}/{students.length}</p>
          <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>تم الرصد</p>
        </div>
      </div>

      {/* ── بطاقة الطالب ── */}
      <div className="rounded-2xl p-4 flex items-center gap-3"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <div className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold"
          style={{ background: 'rgba(99,102,241,0.12)', color: '#C08A48' }}>
          {currentStudent.name.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold truncate" style={{ color: 'var(--text-primary)' }}>
            {currentStudent.name}
          </p>
          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            الطالب {currentStudentIdx + 1} من {students.length}
          </p>
        </div>
        {/* الحالة النهائية */}
        {finalStatus && finalColor && (
          <div className="px-3 py-1.5 rounded-xl text-sm font-bold"
            style={{ background: finalColor.bg, color: finalColor.text }}>
            {finalStatus}
          </div>
        )}
      </div>

      {/* ── مؤشر التعبئة ── */}
      <div className="flex items-center gap-2">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="flex-1 h-1.5 rounded-full transition-all duration-300"
            style={{
              background: i < filledCount
                ? (finalStatus === 'ممتاز' || finalStatus === 'جيد')
                  ? '#27500A'
                  : finalStatus === 'متعثر'
                    ? '#791F1F'
                    : '#854F0B'
                : 'var(--progress-track)',
            }} />
        ))}
      </div>

      {/* ── مجموعات التقييم الأربع ── */}
      {CATEGORY_LABELS.map(({ key, label, icon, desc }) => {
        const value = key === 'new_memo_status' ? newMemo
          : key === 'ghareeb_status' ? ghareeb
          : key === 'near_review_status' ? nearReview
          : farReview
        const setter = key === 'new_memo_status' ? setNewMemo
          : key === 'ghareeb_status' ? setGhareeb
          : key === 'near_review_status' ? setNearReview
          : setFarReview
        return (
          <GradeGroup
            key={key}
            label={label}
            desc={desc}
            icon={icon}
            value={value}
            onChange={setter}
          />
        )
      })}

      {/* ── الملاحظات ── */}
      <div className="rounded-2xl overflow-hidden"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <div className="px-4 py-3 flex items-center gap-2"
          style={{ borderBottom: '1px solid var(--border-color)' }}>
          <FileText size={14} style={{ color: 'var(--text-muted)' }} />
          <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>ملاحظات</span>
        </div>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="أضف ملاحظاتك عن أداء الطالب..."
          rows={3}
          className="w-full px-4 py-3 text-sm resize-none"
          style={{
            background: 'transparent',
            color: 'var(--text-primary)',
            border: 'none',
            outline: 'none',
          }}
        />
      </div>

      {/* ── زر التسجيل الصوتي (placeholder) ── */}
      <button
        className="w-full rounded-2xl py-3 flex items-center justify-center gap-2 text-sm font-medium transition-all active:scale-98"
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          color: 'var(--text-muted)',
          minHeight: '48px',
        }}>
        <Mic size={16} />
        تسجيل ملاحظة صوتية (قريباً)
      </button>

      {/* ── زر الحفظ ── */}
      <button
        onClick={handleSave}
        disabled={saving || filledCount === 0}
        className="w-full rounded-2xl py-4 flex items-center justify-center gap-2 text-base font-bold transition-all active:scale-98 disabled:opacity-50"
        style={{
          minHeight: '56px',
          background: saved
            ? '#27500A'
            : filledCount > 0
              ? 'linear-gradient(135deg, #C08A48 0%, #4f46e5 100%)'
              : 'var(--bg-elevated)',
          color: '#fff',
          border: 'none',
        }}>
        {saving ? (
          <Loader2 size={18} className="animate-spin" />
        ) : saved ? (
          <>
            <CheckCircle2 size={18} />
            تم الحفظ
          </>
        ) : (
          <>
            <Save size={18} />
            حفظ التقييم
          </>
        )}
      </button>

      {/* ── التنقل بين الطلاب ── */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => goToStudent(-1)}
          disabled={currentStudentIdx === 0}
          className="rounded-2xl py-3.5 flex items-center justify-center gap-2 text-sm font-medium transition-all active:scale-95 disabled:opacity-30"
          style={{
            minHeight: '52px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-secondary)',
          }}>
          <ChevronRight size={16} />
          السابق
        </button>
        <button
          onClick={() => goToStudent(1)}
          disabled={currentStudentIdx === students.length - 1}
          className="rounded-2xl py-3.5 flex items-center justify-center gap-2 text-sm font-medium transition-all active:scale-95 disabled:opacity-30"
          style={{
            minHeight: '52px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-secondary)',
          }}>
          التالي
          <ChevronLeft size={16} />
        </button>
      </div>

      {/* ── شريط الطلاب السريع ── */}
      <div className="rounded-2xl p-3"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <p className="text-[10px] font-medium mb-2" style={{ color: 'var(--text-muted)' }}>
          التنقل السريع
        </p>
        <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ WebkitOverflowScrolling: 'touch' }}>
          {students.map((st, idx) => {
            const rec = existingRecs.get(st.id)
            const isActive = idx === currentStudentIdx
            const assessed = !!rec?.final_status
            const dotColor = assessed
              ? (rec.final_status === 'ممتاز' || rec.final_status === 'جيد')
                ? '#27500A'
                : rec.final_status === 'متعثر'
                  ? '#791F1F'
                  : '#854F0B'
              : 'var(--border-soft)'

            return (
              <button key={st.id}
                onClick={() => setCurrentStudentIdx(idx)}
                className="flex flex-col items-center gap-1 p-1.5 rounded-lg flex-shrink-0 transition-all"
                style={{
                  minWidth: '44px',
                  background: isActive ? 'rgba(99,102,241,0.12)' : 'transparent',
                  border: `1.5px solid ${isActive ? '#C08A48' : 'transparent'}`,
                }}>
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold"
                  style={{
                    background: assessed ? dotColor : 'var(--bg-elevated)',
                    color: assessed ? '#fff' : 'var(--text-muted)',
                  }}>
                  {st.name.charAt(0)}
                </div>
                <span className="text-[8px] truncate max-w-[40px]"
                  style={{ color: isActive ? '#C08A48' : 'var(--text-muted)' }}>
                  {st.name.split(' ')[0]}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── الصفحة الرئيسية مع Suspense ────────────────────────────────────────
export default function AssessPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[60vh] gap-3">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#C08A48' }} />
        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>جاري التحميل...</span>
      </div>
    }>
      <AssessContent />
    </Suspense>
  )
}
