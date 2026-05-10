'use client'
import { useState, useEffect, useMemo, useDeferredValue, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { getStudents, getBatches, getQuranPlans, getBatchSchedule, getQuranDailyRecords, getLastQuranRecord, upsertQuranDailyRecord, getStudentJuzProgress, DBStudent, DBBatch, DBQuranDailyRecord } from '@/lib/db'
import { getFarReviewProgress, buildFarReviewSummary, JUZ_PAGE_RANGES } from '@/lib/quran-far-review'
// NOTE: getQuranPlans is also called per-student inside RecordSheet for reliability
import { todayStr, addDays, toHijriDisplay } from '@/lib/hijri'
import { calculateExpectedPosition, type QuranPlan, type BatchScheduleEntry } from '@/lib/quran-followup'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from 'sonner'
import { ChevronRight, ChevronLeft, Search, BookOpen, X, CheckCircle2, Clock, Loader2, BookMarked } from 'lucide-react'

// ─── Helpers ─────────────────────────────────────

function pageToJuz(page: number | null): number {
  if (!page || page < 1) return 1
  return Math.min(30, Math.ceil(page / 20))
}

function pagesDiff(from: number | null, to: number | null): number {
  if (!from || !to || to < from) return 0
  return to - from + 1
}

function juzLabel(page: number | null): string {
  if (!page) return ''
  return `الجزء ${pageToJuz(page)}`
}

function toAr(n: number): string {
  return n.toLocaleString('ar-EG')
}

// ─── TriCard — بطاقة toggle بثلاث حالات ─────────

interface TriCardProps {
  value: boolean | null
  onChange: (v: boolean | null) => void
  title: string
  labelTrue: string
  labelFalse: string
  colorTrue: string
  bgTrue: string
}

function TriCard({ value, onChange, title, labelTrue, labelFalse, colorTrue, bgTrue }: TriCardProps) {
  // null → true → false → null
  function cycle() {
    onChange(value === null ? true : value === true ? false : null)
  }

  const isTrue  = value === true
  const isFalse = value === false
  const isNull  = value === null

  return (
    <button
      onClick={cycle}
      className="flex-1 flex flex-col items-center gap-2 py-4 rounded-2xl transition-all active:scale-[0.97]"
      style={{
        background: isTrue ? bgTrue : isFalse ? 'rgba(138,134,124,0.10)' : 'var(--bg-elevated)',
        border: `1.5px solid ${isTrue ? colorTrue : isFalse ? 'rgba(138,134,124,0.25)' : 'var(--border-soft)'}`,
        boxShadow: isTrue ? `0 4px 16px ${colorTrue}30` : 'none',
      }}
    >
      {/* Title text */}
      <span className="text-base font-black tracking-wide" style={{
        color: isTrue ? colorTrue : isFalse ? '#8A867C' : 'var(--text-secondary)',
      }}>
        {title}
      </span>

      {/* Status label */}
      <span className="text-xs font-bold leading-tight text-center" style={{
        color: isTrue ? colorTrue : isFalse ? '#8A867C' : 'var(--text-muted)',
      }}>
        {isNull ? <span style={{ color: 'var(--text-muted)' }}>اضغط للتحديد</span>
          : isTrue  ? labelTrue
          : labelFalse}
      </span>

      {/* State indicator */}
      <div className="flex items-center gap-1">
        {[null, true, false].map((v, i) => (
          <div key={i} className="rounded-full transition-all"
            style={{
              width: value === v ? 16 : 5,
              height: 5,
              background: value === v
                ? isTrue ? colorTrue : isFalse ? '#8A867C' : 'var(--text-muted)'
                : 'var(--border-soft)',
            }} />
        ))}
      </div>
    </button>
  )
}

// ─── RatingRow — تردد / تنبيه / خطأ ─────────────

interface RatingRowProps {
  hesitations: number
  corrections: number
  mistakes: number
  onHesitations: (v: number) => void
  onCorrections: (v: number) => void
  onMistakes: (v: number) => void
}

function RatingRow({ hesitations, corrections, mistakes, onHesitations, onCorrections, onMistakes }: RatingRowProps) {
  const items = [
    { label: 'تردد',  value: hesitations, set: onHesitations, color: '#E3B44A', bg: 'rgba(227,180,74,0.12)'  },
    { label: 'تنبيه', value: corrections, set: onCorrections, color: '#C08A48', bg: 'rgba(192,138,72,0.12)'  },
    { label: 'خطأ',  value: mistakes,    set: onMistakes,    color: '#D96B5A', bg: 'rgba(217,107,90,0.12)'  },
  ]
  return (
    <div className="grid grid-cols-3 gap-2 mt-3">
      {items.map(it => {
        const active = it.value > 0
        return (
          <div key={it.label}
            className="flex flex-col items-center gap-2 rounded-2xl py-3 px-1 transition-all"
            style={{
              background: active ? it.bg : 'var(--bg-card)',
              border: `1.5px solid ${active ? it.color + '55' : 'var(--border-soft)'}`,
            }}
          >
            {/* Label */}
            <span className="text-[10px] font-bold tracking-wide uppercase"
              style={{ color: active ? it.color : 'var(--text-muted)' }}>
              {it.label}
            </span>

            {/* Count circle */}
            <div className="w-9 h-9 rounded-full flex items-center justify-center font-black text-base transition-all"
              style={{
                background: active ? it.color : 'var(--bg-elevated)',
                color: active ? '#fff' : 'var(--text-muted)',
                boxShadow: active ? `0 4px 12px ${it.color}50` : 'none',
              }}>
              {it.value}
            </div>

            {/* +/− */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => it.set(Math.max(0, it.value - 1))}
                disabled={it.value === 0}
                className="w-7 h-7 rounded-xl flex items-center justify-center text-lg font-bold transition-all disabled:opacity-25 active:scale-90"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
              >−</button>
              <button
                onClick={() => it.set(it.value + 1)}
                className="w-7 h-7 rounded-xl flex items-center justify-center text-lg font-bold transition-all active:scale-90"
                style={{ background: it.color + '22', color: it.color }}
              >+</button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── PageRangeCard — نطاق صفحات + جزء + أوجه ────

interface PageRangeCardProps {
  icon: React.ReactNode
  title: string
  iconColor: string
  fromVal: string
  toVal: string
  onFromChange: (v: string) => void
  onToChange: (v: string) => void
  ringColor: string
  optional?: boolean
  children?: React.ReactNode
}

function PageRangeCard({ icon, title, iconColor, fromVal, toVal, onFromChange, onToChange, ringColor, optional, children }: PageRangeCardProps) {
  const fromNum = parseInt(fromVal) || null
  const toNum   = parseInt(toVal)   || null
  const pages   = pagesDiff(fromNum, toNum)
  const hasRange = fromNum && toNum && toNum >= fromNum

  return (
    <div className="rounded-2xl p-4" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-soft)' }}>
      <div className="flex items-center gap-2 mb-3">
        <span style={{ color: iconColor }}>{icon}</span>
        <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</span>
        {optional && <span className="text-xs mr-auto" style={{ color: 'var(--text-muted)' }}>اختياري</span>}
        {hasRange && (
          <span className="text-xs font-bold px-2 py-0.5 rounded-full mr-auto"
            style={{ background: `${iconColor}22`, color: iconColor }}>
            {toAr(pages)} {pages === 1 ? 'وجه' : 'أوجه'} · {juzLabel(toNum)}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[{ label: 'من صفحة', val: fromVal, set: onFromChange }, { label: 'إلى صفحة', val: toVal, set: onToChange }].map(f => (
          <div key={f.label}>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>{f.label}</label>
            <input
              type="number" min={1} max={604}
              value={f.val}
              onChange={e => f.set(e.target.value)}
              placeholder="—"
              className={`w-full px-3 py-2.5 rounded-xl text-center font-bold border outline-none focus:ring-2 ${ringColor}`}
              style={{ direction: 'ltr', background: 'var(--bg-card)', borderColor: 'var(--border-color)', color: 'var(--text-primary)', fontSize: f.val ? '1.1rem' : '0.9rem' }}
            />
          </div>
        ))}
      </div>
      {children}
    </div>
  )
}

// ─── PlanProgressCard ─────────────────────────────

interface PlanProgressCardProps {
  expectedPosition: number | null
  lastRecord: DBQuranDailyRecord | null
  noPlan?: boolean
}

function PlanProgressCard({ expectedPosition, lastRecord, noPlan }: PlanProgressCardProps) {
  const lastPage = lastRecord?.memorization_to_page ?? null
  const gap = expectedPosition !== null && lastPage !== null ? lastPage - expectedPosition : null

  const gapColor  = gap === null ? 'var(--text-muted)'
    : gap >= 0  ? '#4ade80'   // متقدم أو مطابق
    : gap >= -5 ? '#facc15'   // تأخر بسيط
    : '#f87171'               // تأخر كبير

  const gapLabel = gap === null    ? '—'
    : gap === 0                    ? 'مطابق للخطة'
    : gap > 0                      ? `متقدم بـ ${toAr(gap)} صفحة`
    : `متأخر بـ ${toAr(Math.abs(gap))} صفحة`

  // لا توجد خطة — أظهر البطاقة مع رسالة توضيحية
  if (noPlan) {
    return (
      <div className="rounded-2xl px-4 py-3 flex items-center gap-2"
        style={{ background: 'var(--bg-elevated)', border: '1px dashed var(--border-soft)' }}>
        <BookOpen className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
        <div>
          <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>لا توجد خطة قرآنية نشطة</p>
          <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>أضف خطة للطالب لتفعيل تتبع التقدم</p>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl px-4 py-3 flex items-center gap-3"
      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-soft)' }}>
      {/* المتوقع */}
      <div className="flex-1 text-center">
        <p className="text-[10px] mb-0.5" style={{ color: 'var(--text-muted)' }}>📍 المتوقع اليوم</p>
        <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
          {expectedPosition !== null ? `ص. ${toAr(Math.round(expectedPosition))}` : '—'}
        </p>
      </div>
      {/* فاصل */}
      <div className="w-px self-stretch" style={{ background: 'var(--border-soft)' }} />
      {/* آخر تسجيل */}
      <div className="flex-1 text-center">
        <p className="text-[10px] mb-0.5" style={{ color: 'var(--text-muted)' }}>📝 آخر تسجيل</p>
        <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
          {lastPage !== null ? `ص. ${toAr(lastPage)}` : '—'}
        </p>
      </div>
      {/* فاصل */}
      <div className="w-px self-stretch" style={{ background: 'var(--border-soft)' }} />
      {/* الفارق */}
      <div className="flex-1 text-center">
        <p className="text-[10px] mb-0.5" style={{ color: 'var(--text-muted)' }}>⚖️ الفارق</p>
        <p className="text-sm font-bold leading-tight" style={{ color: gapColor }}>
          {gapLabel}
        </p>
      </div>
    </div>
  )
}

// ─── RecordSheet ──────────────────────────────────

interface RecordSheetProps {
  student: DBStudent
  date: string
  existing: DBQuranDailyRecord | null
  recordedBy: string
  batchId: number
  scheduleMap: Map<string, string>
  onClose: () => void
  onSaved: (record: DBQuranDailyRecord) => void
}

interface FarReviewHint {
  juzNumber:   number
  pageFrom:    number
  pageTo:      number
  nextAbsPage: number   // الصفحة التي يجب أن يبدأ منها الطالب
  progressPct: number   // 0..100
}

function RecordSheet({ student, date, existing, recordedBy, batchId, scheduleMap, onClose, onSaved }: RecordSheetProps) {
  const [loadingLast, setLoadingLast] = useState(true)
  const [lastRecord,  setLastRecord]  = useState<DBQuranDailyRecord | null>(null)
  const [plan,        setPlan]        = useState<QuranPlan | null>(null)
  const [saving,      setSaving]      = useState(false)
  const [farHint,     setFarHint]     = useState<FarReviewHint | null>(null)

  // حساب الصفحة المتوقعة — يُعاد عند تغيّر الخطة أو الجدول
  const expectedPosition = useMemo(() => {
    if (!plan) return null
    const effectiveDate = plan.end_date && date > plan.end_date ? plan.end_date : date
    return calculateExpectedPosition(
      plan.start_position, plan.start_date, effectiveDate, plan.daily_rate, scheduleMap
    ).position
  }, [plan, scheduleMap, date])

  // Memorization
  const [memFrom, setMemFrom] = useState('')
  const [memTo,   setMemTo]   = useState('')
  const [memHes,  setMemHes]  = useState(0)
  const [memCor,  setMemCor]  = useState(0)
  const [memMis,  setMemMis]  = useState(0)

  // Tafseer / Repeat — ثلاث حالات
  const [tafseer,  setTafseer]  = useState<boolean | null>(null)
  const [repeated, setRepeated] = useState<boolean | null>(null)

  // Close review
  const [closeFrom, setCloseFrom] = useState('')
  const [closeTo,   setCloseTo]   = useState('')
  const [closeHes,  setCloseHes]  = useState(0)
  const [closeCor,  setCloseCor]  = useState(0)
  const [closeMis,  setCloseMis]  = useState(0)

  // Far review
  const [farFrom, setFarFrom] = useState('')
  const [farTo,   setFarTo]   = useState('')
  const [farHes,  setFarHes]  = useState(0)
  const [farCor,  setFarCor]  = useState(0)
  const [farMis,  setFarMis]  = useState(0)

  useEffect(() => {
    // تحميل الخطة النشطة للطالب — دائماً بغض النظر عن existing
    getQuranPlans(student.id).then(plans => setPlan(plans[0] ?? null))

    if (existing) {
      setMemFrom(existing.memorization_from_page?.toString() ?? '')
      setMemTo(existing.memorization_to_page?.toString() ?? '')
      setMemHes(existing.memorization_hesitations ?? 0)
      setMemCor(existing.memorization_corrections ?? 0)
      setMemMis(existing.memorization_mistakes ?? 0)
      setTafseer(existing.tafseer_completed ?? null)
      setRepeated(existing.repeated ?? null)
      setCloseFrom(existing.close_review_from_page?.toString() ?? '')
      setCloseTo(existing.close_review_to_page?.toString() ?? '')
      setCloseHes(existing.close_review_hesitations ?? 0)
      setCloseCor(existing.close_review_corrections ?? 0)
      setCloseMis(existing.close_review_mistakes ?? 0)
      setFarFrom(existing.far_review_from_page?.toString() ?? '')
      setFarTo(existing.far_review_to_page?.toString() ?? '')
      setFarHes(existing.far_review_hesitations ?? 0)
      setFarCor(existing.far_review_corrections ?? 0)
      setFarMis(existing.far_review_mistakes ?? 0)
      setLoadingLast(false)
    } else {
      Promise.all([
        getLastQuranRecord(student.id),
        getFarReviewProgress(student.id),
        getStudentJuzProgress(student.id),
      ]).then(([rec, farProgress, juzProgress]) => {
        setLastRecord(rec)
        if (rec?.memorization_to_page) setMemFrom((rec.memorization_to_page + 1).toString())

        // احسب الجزء الحالي للمراجعة البعيدة
        const summary = buildFarReviewSummary(juzProgress, farProgress, student.id)
        const active  = summary.activeSessions[0]
        if (active) {
          const nextAbsPage = active.pageFrom + active.currentPage  // 0=لم يبدأ → pageFrom
          setFarHint({
            juzNumber:   active.juzNumber,
            pageFrom:    active.pageFrom,
            pageTo:      active.pageTo,
            nextAbsPage: Math.min(nextAbsPage, active.pageTo),
            progressPct: Math.round(active.progress * 100),
          })
        }

        setLoadingLast(false)
      })
    }
  }, [student.id, existing])

  const memFromNum = parseInt(memFrom) || null
  const memToNum   = parseInt(memTo)   || null
  const pages      = pagesDiff(memFromNum, memToNum)
  const hasMemorization = !!(memFromNum && memToNum && memToNum >= memFromNum)

  const closeFromNum = parseInt(closeFrom) || null
  const closeToNum   = parseInt(closeTo)   || null
  const hasCloseReview = !!(closeFromNum && closeToNum && closeToNum >= closeFromNum)

  const farFromNum = parseInt(farFrom) || null
  const farToNum   = parseInt(farTo)   || null
  const hasFarReview = !!(farFromNum && farToNum && farToNum >= farFromNum)

  // أي قسم فيه إدخال جزئي (نطاق غير مكتمل أو مقلوب)
  const memPartial   = (memFrom || memTo) && !hasMemorization
  const closePartial = (closeFrom || closeTo) && !hasCloseReview
  const farPartial   = (farFrom || farTo) && !hasFarReview

  // يكفي تعبئة أي قسم من الخمسة (حفظ / قريبة / بعيدة / تفسير / تكرار)
  const hasTafseerOrRepeat = tafseer !== null || repeated !== null
  const canSave = (hasMemorization || hasCloseReview || hasFarReview || hasTafseerOrRepeat)
                  && !memPartial && !closePartial && !farPartial

  async function handleSave() {
    if (memPartial)   { toast.error('أكمل نطاق الحفظ (من/إلى) أو امسحه'); return }
    if (closePartial) { toast.error('أكمل نطاق المراجعة القريبة (من/إلى) أو امسحه'); return }
    if (farPartial)   { toast.error('أكمل نطاق المراجعة البعيدة (من/إلى) أو امسحه'); return }
    if (!canSave) {
      toast.error('سجّل قسماً واحداً على الأقل: حفظ أو مراجعة أو تفسير أو تكرار'); return
    }
    setSaving(true)
    try {
      const record = {
        student_id: student.id, batch_id: batchId,
        plan_id: plan?.id ?? null,   // plan_id على مستوى السجل كله — مرتبط بالخطة النشطة
        recorded_at: date, recorded_by: recordedBy,
        memorization_from_page: hasMemorization ? memFromNum : null,
        memorization_to_page:   hasMemorization ? memToNum   : null,
        memorization_hesitations: hasMemorization ? memHes : 0,
        memorization_corrections: hasMemorization ? memCor : 0,
        memorization_mistakes:    hasMemorization ? memMis : 0,
        tafseer_completed: tafseer, repeated,
        close_review_from_page: hasCloseReview ? closeFromNum : null,
        close_review_to_page:   hasCloseReview ? closeToNum   : null,
        close_review_hesitations: hasCloseReview ? closeHes : 0,
        close_review_corrections: hasCloseReview ? closeCor : 0,
        close_review_mistakes:    hasCloseReview ? closeMis : 0,
        far_review_from_page: hasFarReview ? farFromNum : null,
        far_review_to_page:   hasFarReview ? farToNum   : null,
        far_review_hesitations: hasFarReview ? farHes : 0,
        far_review_corrections: hasFarReview ? farCor : 0,
        far_review_mistakes:    hasFarReview ? farMis : 0,
      }
      await upsertQuranDailyRecord(record)
      toast.success(`تم تسجيل سجل ${student.name}`)
      onSaved({ id: existing?.id ?? '', created_at: existing?.created_at ?? date, updated_at: date, ...record })
    } catch (err) {
      console.error(err); toast.error('حدث خطأ أثناء الحفظ')
    } finally { setSaving(false) }
  }

  return createPortal(
    <>
      <div className="fixed inset-0 bg-black/60 z-[9998]" onClick={onClose} />
      {/* على الجوال: bottom sheet — على اللابتوب: modal مُركَّز */}
      <div className={[
        'fixed z-[9999] flex flex-col',
        // Mobile
        'bottom-0 inset-x-0 rounded-t-3xl',
        // Desktop: override to centered modal
        'lg:inset-auto lg:top-1/2 lg:left-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2',
        'lg:w-[560px] lg:rounded-3xl',
      ].join(' ')}
        style={{ background: 'var(--bg-card)', maxHeight: '92dvh', boxShadow: '0 -8px 40px rgba(0,0,0,0.5), 0 24px 60px rgba(0,0,0,0.4)' }}>

        {/* Handle — جوال فقط */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0 lg:hidden">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border-soft)' }}>
          <div>
            <h3 className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>{student.name}</h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {toHijriDisplay(date)}
              {lastRecord && !existing && <span className="mr-2 opacity-70">· آخر صفحة: {lastRecord.memorization_to_page}</span>}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10">
            <X className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {/* ── بطاقة المتوقع vs الفعلي — تظهر دائماً كمرجع للمعلم ── */}
          <PlanProgressCard
            expectedPosition={expectedPosition}
            lastRecord={existing ?? lastRecord}
            noPlan={!plan}
          />

          {loadingLast ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--text-muted)' }} />
            </div>
          ) : (
            <>
              {/* ── الحفظ الجديد ── */}
              <PageRangeCard
                icon={<BookOpen className="w-4 h-4" />} iconColor="#C08A48"
                title="الحفظ الجديد"
                fromVal={memFrom} toVal={memTo}
                onFromChange={setMemFrom} onToChange={setMemTo}
                ringColor="focus:ring-yellow-500/40"
              >
                <RatingRow
                  hesitations={memHes} corrections={memCor} mistakes={memMis}
                  onHesitations={setMemHes} onCorrections={setMemCor} onMistakes={setMemMis}
                />
              </PageRangeCard>

              {/* ── التفسير والتكرار ── */}
              <div className="flex gap-3">
                <TriCard
                  value={tafseer} onChange={setTafseer}
                  title="تفسير"
                  labelTrue="فسّر ✓" labelFalse="لم يفسّر"
                  colorTrue="#B85C5C" bgTrue="rgba(184,92,92,0.12)"
                />
                <TriCard
                  value={repeated} onChange={setRepeated}
                  title="تكرار"
                  labelTrue="كرّر ✓" labelFalse="لم يكرّر"
                  colorTrue="#4A78B5" bgTrue="rgba(74,120,181,0.12)"
                />
              </div>

              {/* ── المراجعة القريبة ── */}
              <PageRangeCard
                icon={<BookMarked className="w-4 h-4" />} iconColor="#a78bfa"
                title="مراجعة قريبة" optional
                fromVal={closeFrom} toVal={closeTo}
                onFromChange={setCloseFrom} onToChange={setCloseTo}
                ringColor="focus:ring-purple-500/30"
              >
                {(closeFrom || closeTo) && (
                  <RatingRow
                    hesitations={closeHes} corrections={closeCor} mistakes={closeMis}
                    onHesitations={setCloseHes} onCorrections={setCloseCor} onMistakes={setCloseMis}
                  />
                )}
              </PageRangeCard>

              {/* ── المراجعة البعيدة ── */}
              <PageRangeCard
                icon={<BookMarked className="w-4 h-4" />} iconColor="#38bdf8"
                title="مراجعة بعيدة" optional
                fromVal={farFrom} toVal={farTo}
                onFromChange={setFarFrom} onToChange={setFarTo}
                ringColor="focus:ring-sky-500/30"
              >
                {/* اقتراح الجزء الحالي — يظهر فقط للسجلات الجديدة */}
                {farHint && !existing && (
                  <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-xl"
                    style={{ background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.25)' }}>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold" style={{ color: '#38bdf8' }}>
                        الجزء {farHint.juzNumber} · ص.{farHint.pageFrom}–{farHint.pageTo}
                      </p>
                      <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {farHint.progressPct > 0
                          ? `وصل إلى ص.${farHint.nextAbsPage} · ${farHint.progressPct}% مكتمل`
                          : 'لم يبدأ بعد'}
                      </p>
                    </div>
                    {/* زر لملء "من صفحة" تلقائياً */}
                    {!farFrom && (
                      <button
                        onClick={() => setFarFrom(farHint.nextAbsPage.toString())}
                        className="text-xs font-bold px-3 py-1.5 rounded-lg flex-shrink-0 active:scale-95 transition-transform"
                        style={{ background: 'rgba(56,189,248,0.18)', color: '#38bdf8' }}
                      >
                        تطبيق
                      </button>
                    )}
                  </div>
                )}
                {(farFrom || farTo) && (
                  <RatingRow
                    hesitations={farHes} corrections={farCor} mistakes={farMis}
                    onHesitations={setFarHes} onCorrections={setFarCor} onMistakes={setFarMis}
                  />
                )}
              </PageRangeCard>
            </>
          )}
        </div>

        {/* Save */}
        <div className="px-5 pb-6 pt-3 flex-shrink-0" style={{ borderTop: '1px solid var(--border-soft)' }}>
          <button
            onClick={handleSave}
            disabled={saving || loadingLast || !canSave}
            className="w-full py-4 rounded-2xl font-bold text-base transition-all disabled:opacity-40"
            style={{
              background: canSave ? 'linear-gradient(135deg, #C08A48, #D4A24C)' : 'var(--bg-elevated)',
              color: canSave ? 'white' : 'var(--text-muted)',
              boxShadow: canSave ? '0 4px 16px rgba(192,138,72,0.35)' : 'none',
            }}
          >
            {saving
              ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />جارٍ الحفظ...</span>
              : <>{existing ? 'تحديث السجل' : 'تسجيل السجل'}{hasMemorization && <span className="text-sm font-normal opacity-80 mr-2">({toAr(pages)} {pages === 1 ? 'وجه' : 'أوجه'})</span>}</>
            }
          </button>
        </div>
      </div>
    </>,
    document.body
  )
}

// ─── StudentCard ──────────────────────────────────

function StudentCard({ student, rec, onOpen }: { student: DBStudent; rec: DBQuranDailyRecord | undefined; onOpen: () => void }) {
  const recorded = !!rec
  const memPages = pagesDiff(rec?.memorization_from_page ?? null, rec?.memorization_to_page ?? null)
  const closePages = pagesDiff(rec?.close_review_from_page ?? null, rec?.close_review_to_page ?? null)
  const farPages = pagesDiff(rec?.far_review_from_page ?? null, rec?.far_review_to_page ?? null)

  return (
    <button
      onClick={onOpen}
      className="w-full text-right card-static p-4 flex items-start gap-3 hover:bg-white/5 transition-colors active:scale-[0.99]"
    >
      {/* Status icon */}
      <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{
          background: recorded ? 'rgba(53,107,110,0.15)' : 'rgba(255,255,255,0.05)',
          border: `1.5px solid ${recorded ? '#356B6E' : 'var(--border-soft)'}`,
        }}>
        {recorded
          ? <CheckCircle2 className="w-5 h-5" style={{ color: '#356B6E' }} />
          : <Clock className="w-5 h-5" style={{ color: 'var(--text-muted)' }} />}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{student.name}</p>

        {recorded && rec ? (
          <div className="mt-1.5 space-y-1">
            {/* حفظ */}
            {rec.memorization_from_page && rec.memorization_to_page && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <BookOpen className="w-3 h-3 flex-shrink-0" style={{ color: '#C08A48' }} />
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  ص {rec.memorization_from_page}–{rec.memorization_to_page}
                  <span className="mr-1 opacity-70">({toAr(memPages)} أوجه · {juzLabel(rec.memorization_to_page)})</span>
                </span>
                {(rec.memorization_mistakes > 0 || rec.memorization_hesitations > 0) && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(217,107,90,0.15)', color: '#D96B5A' }}>
                    {rec.memorization_mistakes > 0 && `${toAr(rec.memorization_mistakes)} خطأ`}
                    {rec.memorization_hesitations > 0 && ` ${toAr(rec.memorization_hesitations)} تردد`}
                  </span>
                )}
              </div>
            )}
            {/* قريبة */}
            {rec.close_review_from_page && rec.close_review_to_page && (
              <div className="flex items-center gap-1.5">
                <BookMarked className="w-3 h-3 flex-shrink-0" style={{ color: '#a78bfa' }} />
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  قريبة: {toAr(closePages)} أوجه · {juzLabel(rec.close_review_to_page)}
                </span>
              </div>
            )}
            {/* بعيدة */}
            {rec.far_review_from_page && rec.far_review_to_page && (
              <div className="flex items-center gap-1.5">
                <BookMarked className="w-3 h-3 flex-shrink-0" style={{ color: '#38bdf8' }} />
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  بعيدة: {toAr(farPages)} أوجه · {juzLabel(rec.far_review_to_page)}
                </span>
              </div>
            )}
            {/* تفسير / تكرار */}
            {(rec.tafseer_completed !== null || rec.repeated !== null) && (
              <div className="flex items-center gap-2 mt-0.5">
                {rec.tafseer_completed === true  && <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(53,107,110,0.15)', color: '#356B6E' }}>فسّر ✓</span>}
                {rec.tafseer_completed === false && <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(138,134,124,0.15)', color: '#8A867C' }}>لم يفسّر</span>}
                {rec.repeated === true  && <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(192,138,72,0.15)', color: '#C08A48' }}>كرّر ✓</span>}
                {rec.repeated === false && <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(138,134,124,0.15)', color: '#8A867C' }}>لم يكرّر</span>}
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>لم يُسجَّل بعد</p>
        )}
      </div>

      {/* أوجه badge */}
      {recorded && memPages > 0 && (
        <div className="flex-shrink-0 text-xs font-bold px-2.5 py-1 rounded-xl self-start"
          style={{ background: 'rgba(192,138,72,0.12)', color: '#C08A48' }}>
          {toAr(memPages)} أوجه
        </div>
      )}
    </button>
  )
}

// ─── Main Page ────────────────────────────────────

export default function QuranDailyRecordsPage() {
  const { profile } = useAuth()
  const myBatchId  = profile?.batch_id ?? null
  const recordedBy = profile?.id ?? ''
  const role       = profile?.role
  const isCeo      = role === 'ceo' || role === 'records_officer'

  const [batches,        setBatches]        = useState<DBBatch[]>([])
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null)
  const effectiveBatchId = isCeo ? selectedBatchId : myBatchId

  const [date,        setDate]        = useState(todayStr())
  const [students,    setStudents]    = useState<DBStudent[]>([])
  const [records,     setRecords]     = useState<DBQuranDailyRecord[]>([])
  const [plans,       setPlans]       = useState<QuranPlan[]>([])
  const [schedule,    setSchedule]    = useState<BatchScheduleEntry[]>([])
  const [loading,     setLoading]     = useState(true)
  const [search,      setSearch]      = useState('')
  const deferredSearch = useDeferredValue(search)
  const [activeSheet, setActiveSheet] = useState<DBStudent | null>(null)

  // scheduleMap محسوبة مرة واحدة
  const scheduleMap = useMemo(() => {
    const m = new Map<string, string>()
    schedule.forEach(e => m.set(e.date, e.day_type))
    return m
  }, [schedule])

  // planMap: student_id → QuranPlan
  const planMap = useMemo(() => {
    const m = new Map<string, QuranPlan>()
    plans.forEach(p => m.set(p.student_id, p))
    return m
  }, [plans])

  // CEO: تحميل الدفعات
  useEffect(() => {
    if (!isCeo) return
    getBatches().then(b => { setBatches(b); if (b.length > 0) setSelectedBatchId(b[0].id) })
  }, [isCeo])

  // تحميل الطلاب + الخطط + الجدول عند تغيير الدفعة
  useEffect(() => {
    if (effectiveBatchId === null) return
    setSearch('')
    Promise.all([
      getStudents(),
      getQuranPlans(),
      getBatchSchedule(effectiveBatchId),
    ]).then(([allStudents, allPlans, batchSched]) => {
      setStudents(allStudents.filter(s => s.batch_id === effectiveBatchId && s.status === 'active'))
      setPlans(allPlans)
      setSchedule(batchSched)
    })
  }, [effectiveBatchId])

  // تحميل السجلات
  const loadRecords = useCallback(async () => {
    if (!effectiveBatchId) return
    setLoading(true)
    try { setRecords(await getQuranDailyRecords(effectiveBatchId, date)) }
    finally { setLoading(false) }
  }, [effectiveBatchId, date])

  useEffect(() => { loadRecords() }, [loadRecords])

  const recordMap = useMemo(() => {
    const m = new Map<string, DBQuranDailyRecord>()
    records.forEach(r => m.set(r.student_id, r))
    return m
  }, [records])

  const filteredStudents = useMemo(() => {
    if (!deferredSearch.trim()) return students
    const q = deferredSearch.toLowerCase()
    return students.filter(s => s.name.toLowerCase().includes(q))
  }, [students, deferredSearch])

  const recordedCount = records.length
  const totalCount    = students.length
  const progressPct   = totalCount > 0 ? Math.round((recordedCount / totalCount) * 100) : 0
  const isToday       = date === todayStr()

  function handleSaved(record: DBQuranDailyRecord) {
    setRecords(prev => {
      const idx = prev.findIndex(r => r.student_id === record.student_id)
      if (idx >= 0) { const c = [...prev]; c[idx] = record; return c }
      return [...prev, record]
    })
    setActiveSheet(null)
  }

  if (!isCeo && !myBatchId) return (
    <div className="flex items-center justify-center h-64">
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>لا توجد دفعة مرتبطة بحسابك.</p>
    </div>
  )

  return (
    <div className="space-y-5 animate-fade-in-up pb-8">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>سجلات الحفظ اليومية</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>تسجيل الحفظ والمراجعة اليومية للطلاب</p>
      </div>

      {/* Batch Selector — CEO */}
      {isCeo && batches.length > 0 && (
        <div>
          <p className="text-xs mb-2 font-medium" style={{ color: 'var(--text-muted)' }}>اختر الدفعة</p>
          {batches.length <= 5 ? (
            <div className="flex gap-1 p-1 rounded-2xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-soft)' }}>
              {batches.map(b => (
                <button key={b.id} onClick={() => setSelectedBatchId(b.id)}
                  className="flex-1 py-2 rounded-xl text-sm font-bold transition-all"
                  style={selectedBatchId === b.id
                    ? { background: 'linear-gradient(135deg, #C08A48, #D4A24C)', color: '#fff', boxShadow: '0 2px 8px rgba(192,138,72,0.35)' }
                    : { color: 'var(--text-secondary)' }}>
                  {b.name}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {batches.map(b => (
                <button key={b.id} onClick={() => setSelectedBatchId(b.id)}
                  className="flex-shrink-0 px-4 py-2 rounded-xl text-sm font-bold transition-all"
                  style={selectedBatchId === b.id
                    ? { background: 'linear-gradient(135deg, #C08A48, #D4A24C)', color: '#fff' }
                    : { background: 'var(--bg-card)', border: '1px solid var(--border-soft)', color: 'var(--text-secondary)' }}>
                  {b.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Date nav */}
      <div className="card-static p-4 flex items-center gap-3">
        <button onClick={() => setDate(d => addDays(d, -1))}
          className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-white/10 transition-colors"
          style={{ border: '1px solid var(--border-soft)' }}>
          <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
        </button>
        <div className="flex-1 text-center">
          <p className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>{toHijriDisplay(date)}</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {new Date(date + 'T12:00:00').toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <button onClick={() => { const n = addDays(date, 1); if (n <= todayStr()) setDate(n) }}
          disabled={isToday}
          className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-white/10 transition-colors disabled:opacity-30"
          style={{ border: '1px solid var(--border-soft)' }}>
          <ChevronLeft className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
        </button>
      </div>

      {/* Progress */}
      <div className="card-static p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>تم التسجيل</span>
          <span className="text-sm font-bold font-mono" style={{ color: 'var(--text-primary)' }}>{recordedCount} / {totalCount}</span>
        </div>
        <div className="progress-bar">
          <div className="progress-bar-fill" style={{
            width: `${progressPct}%`,
            background: progressPct === 100 ? 'linear-gradient(90deg,#356B6E,#4a9a9e)' : 'linear-gradient(90deg,#C08A48,#D4A24C)',
            transition: 'width 0.4s ease',
          }} />
        </div>
        <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
          {progressPct === 100 ? '✅ تم تسجيل جميع الطلاب' : `${totalCount - recordedCount} طالب لم يُسجَّل بعد`}
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
        <input type="text" placeholder="بحث باسم الطالب..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="w-full pr-9 px-4 py-2.5 rounded-xl border outline-none focus:ring-2 focus:ring-yellow-500/30 text-sm"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} />
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--text-muted)' }} />
        </div>
      ) : (
        <div className="space-y-2">
          {filteredStudents.length === 0
            ? <div className="card-static p-8 text-center"><p className="text-sm" style={{ color: 'var(--text-muted)' }}>لا يوجد طلاب</p></div>
            : filteredStudents.map(student => (
                <StudentCard
                  key={student.id}
                  student={student}
                  rec={recordMap.get(student.id)}
                  onOpen={() => setActiveSheet(student)}
                />
              ))
          }
        </div>
      )}

      {/* Sheet */}
      {activeSheet && effectiveBatchId && (
        <RecordSheet
          student={activeSheet} date={date}
          existing={recordMap.get(activeSheet.id) ?? null}
          recordedBy={recordedBy} batchId={effectiveBatchId}
          scheduleMap={scheduleMap}
          onClose={() => setActiveSheet(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
