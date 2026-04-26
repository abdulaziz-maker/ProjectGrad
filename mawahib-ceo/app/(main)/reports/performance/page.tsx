'use client'
/**
 * /reports/performance — تقرير أداء الطلاب (Claude Design)
 *
 * هيكل الصفحة:
 *   ١) Hero header (عنوان + أزرار التحكم)
 *   ٢) Period segmented control + scrubber للفترات
 *   ٣) Thresholds settings (collapsible)
 *   ٤) Search + filter bar
 *   ٥) Density + view toggle
 *   ٦) Banner تعديل الأهداف (لما يكون مفعّلاً)
 *   ٧) الجدول
 *   ٨) Drawer إدارة المساقات
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  FileSpreadsheet, Printer, Settings2, Loader2, Search, Edit3,
  Plus, Trash2, ChevronLeft, ChevronRight, Palette, Sparkles,
  X,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { PERFORMANCE_REPORTS_ENABLED } from '@/lib/performance/flag'
import { getStudents, getBatches, type DBStudent, type DBBatch } from '@/lib/db'
import {
  getSubjects, createSubject, deleteSubject,
  getExclusions,
  getPeriods, createPeriod, deletePeriod, clonePeriodExpectations,
  getEntriesForPeriod, upsertEntry,
} from '@/lib/performance/db'
import type {
  ReportSubject, SubjectExclusion, PerformancePeriod, PerformanceEntry,
  EntryColumnKey, SubjectColumnsKind, SubjectTrack, PeriodType,
} from '@/lib/performance/types'
import { exportToExcel, exportToPdf } from '@/lib/performance/export'
import { HIJRI_MONTHS_AR, buildPeriodLabel } from '@/lib/performance/format'
import PerformanceTable from '@/components/performance/PerformanceTable'
import SubjectManager from '@/components/performance/SubjectManager'

const HIDDEN_KEY = 'performance:hidden_subjects_v2'
const THRESHOLDS_KEY = 'performance:thresholds_v2'
const DENSITY_KEY = 'performance:density'

type Density = 'compact' | 'medium' | 'cozy'

// ─── الفترات (شهري/فصلي/سنوي) ─────────
const PERIOD_TABS: { k: PeriodType; l: string }[] = [
  { k: 'month', l: 'شهري' },
  { k: 'term',  l: 'فصلي' },
  { k: 'year',  l: 'سنوي' },
]

export default function PerformanceReportPage() {
  const router = useRouter()
  const { profile, loading: authLoading } = useAuth()

  // ─── Feature gate ───
  useEffect(() => {
    if (!PERFORMANCE_REPORTS_ENABLED) router.replace('/dashboard')
  }, [router])

  // ─── الأدوار ───
  const role = profile?.role
  const isCeo = role === 'ceo'
  const canManagePeriods = isCeo || role === 'batch_manager' || role === 'records_officer'
  const canManageSubjects = isCeo || role === 'batch_manager' || role === 'records_officer' || role === 'supervisor' || role === 'teacher'
  const canEdit = canManageSubjects
  const myBatchId = profile?.batch_id ?? null

  // ─── الحالة الأساسية ───
  const [batches, setBatches] = useState<DBBatch[]>([])
  const [students, setStudents] = useState<DBStudent[]>([])
  const [subjects, setSubjects] = useState<ReportSubject[]>([])
  const [exclusions, setExclusions] = useState<SubjectExclusion[]>([])
  const [periods, setPeriods] = useState<PerformancePeriod[]>([])
  const [entries, setEntries] = useState<PerformanceEntry[]>([])

  const [selectedBatch, setSelectedBatch] = useState<number | null>(null)
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null)
  const [periodType, setPeriodType] = useState<PeriodType>('month')

  // UI state
  const [hiddenSubjectIds, setHiddenSubjectIds] = useState<Set<string>>(new Set())
  const [showSubjectDrawer, setShowSubjectDrawer] = useState(false)
  const [showThresholds, setShowThresholds] = useState(false)
  const [thresholds, setThresholds] = useState<{ green: number; red: number }>({ green: 81, red: 60 })
  const [density, setDensity] = useState<Density>('medium')
  const [search, setSearch] = useState('')
  const [editPlannedMode, setEditPlannedMode] = useState(false)
  const [showNewPeriod, setShowNewPeriod] = useState(false)
  const [exportMenuOpen, setExportMenuOpen] = useState(false)

  // new period form
  const [npType, setNpType] = useState<PeriodType>('month')
  const [npYear, setNpYear] = useState(1447)
  const [npMonth, setNpMonth] = useState(1)
  const [npTerm, setNpTerm] = useState(1)
  const [npBusy, setNpBusy] = useState(false)

  const [loading, setLoading] = useState(true)
  const [loadingPeriod, setLoadingPeriod] = useState(false)

  // ─── تحميل أولي ───
  useEffect(() => {
    if (authLoading) return
    let alive = true
    ;(async () => {
      try {
        const [b, st, su, ex] = await Promise.all([
          getBatches(), getStudents(), getSubjects(), getExclusions(),
        ])
        if (!alive) return
        setBatches(b); setStudents(st); setSubjects(su); setExclusions(ex)
        const initialBatch = myBatchId ?? b[0]?.id ?? null
        setSelectedBatch(initialBatch)

        // تحميل الإعدادات المحلية
        try {
          const rawHidden = localStorage.getItem(HIDDEN_KEY)
          if (rawHidden) setHiddenSubjectIds(new Set(JSON.parse(rawHidden)))
          const rawT = localStorage.getItem(THRESHOLDS_KEY)
          if (rawT) setThresholds(JSON.parse(rawT))
          const rawD = localStorage.getItem(DENSITY_KEY)
          if (rawD === 'compact' || rawD === 'medium' || rawD === 'cozy') setDensity(rawD)
        } catch { /* noop */ }
      } catch (err) {
        console.error(err)
        toast.error('تعذّر التحميل')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [authLoading, myBatchId])

  // ─── تحميل الفترات لما تتغيّر الدفعة ───
  useEffect(() => {
    if (selectedBatch == null) return
    let alive = true
    ;(async () => {
      try {
        const ps = await getPeriods(selectedBatch)
        if (!alive) return
        setPeriods(ps)
        // اختر فترة من نوع الـperiodType الحالي إن وُجدت
        const ofType = ps.filter(p => p.period_type === periodType)
        const fallback = ofType[0] ?? ps[0]
        setSelectedPeriodId(fallback?.id ?? null)
      } catch {
        toast.error('تعذّر تحميل الفترات')
      }
    })()
    return () => { alive = false }
  }, [selectedBatch, periodType])

  // ─── تحميل البيانات لما تتغيّر الفترة ───
  useEffect(() => {
    if (!selectedPeriodId) { setEntries([]); return }
    let alive = true
    setLoadingPeriod(true)
    ;(async () => {
      try {
        const es = await getEntriesForPeriod(selectedPeriodId)
        if (alive) setEntries(es)
      } catch {
        if (alive) toast.error('تعذّر تحميل البيانات')
      } finally {
        if (alive) setLoadingPeriod(false)
      }
    })()
    return () => { alive = false }
  }, [selectedPeriodId])

  // ─── مشتقات ───
  const batchStudents = useMemo(
    () => students
      .filter(s => s.batch_id === selectedBatch && (s.status === 'active' || !s.status))
      .filter(s => !search.trim() || s.name.includes(search.trim())),
    [students, selectedBatch, search]
  )
  const batchSubjects = useMemo(
    () => subjects.filter(s => s.batch_id == null || s.batch_id === selectedBatch),
    [subjects, selectedBatch]
  )
  const visibleSubjects = useMemo(
    () => batchSubjects.filter(s => !hiddenSubjectIds.has(s.id)),
    [batchSubjects, hiddenSubjectIds]
  )
  const periodsOfType = useMemo(
    () => periods.filter(p => p.period_type === periodType),
    [periods, periodType]
  )
  const selectedPeriod = useMemo(
    () => periods.find(p => p.id === selectedPeriodId) ?? null,
    [periods, selectedPeriodId]
  )
  const batchName = useMemo(
    () => batches.find(b => b.id === selectedBatch)?.name ?? `دفعة ${selectedBatch}`,
    [batches, selectedBatch]
  )

  // ─── persist UI prefs ───
  const persistHidden = useCallback((next: Set<string>) => {
    try { localStorage.setItem(HIDDEN_KEY, JSON.stringify(Array.from(next))) } catch {}
  }, [])
  const persistThresholds = useCallback((t: { green: number; red: number }) => {
    try { localStorage.setItem(THRESHOLDS_KEY, JSON.stringify(t)) } catch {}
  }, [])
  const persistDensity = useCallback((d: Density) => {
    try { localStorage.setItem(DENSITY_KEY, d) } catch {}
  }, [])

  const handleToggleHidden = useCallback((id: string) => {
    setHiddenSubjectIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      persistHidden(next)
      return next
    })
  }, [persistHidden])

  // ─── حفظ خلية ───
  const handleCellSave = useCallback(async (
    student_id: string, subject_id: string, column_key: EntryColumnKey,
    field: 'expected' | 'actual', value: number | null
  ) => {
    if (!selectedPeriodId) return
    try {
      const existing = entries.find(e =>
        e.student_id === student_id && e.subject_id === subject_id && e.column_key === column_key
      )
      const updated = await upsertEntry({
        period_id: selectedPeriodId,
        student_id, subject_id, column_key,
        expected: field === 'expected' ? value : existing?.expected ?? null,
        actual:   field === 'actual'   ? value : existing?.actual   ?? null,
      })
      setEntries(prev => {
        const others = prev.filter(e => e.id !== updated.id && !(
          e.student_id === student_id && e.subject_id === subject_id && e.column_key === column_key
        ))
        return [...others, updated]
      })
    } catch (err) {
      console.error(err)
      toast.error('تعذّر الحفظ')
      throw err
    }
  }, [selectedPeriodId, entries])

  // ─── إدارة المساقات ───
  const handleCreateSubject = useCallback(async (input: {
    name: string; track: SubjectTrack; columns_kind: SubjectColumnsKind
    single_label?: string | null; unit?: string | null
  }) => {
    await createSubject({ ...input, batch_id: selectedBatch })
    const next = await getSubjects()
    setSubjects(next)
  }, [selectedBatch])

  const handleDeleteSubject = useCallback(async (id: string) => {
    await deleteSubject(id)
    setSubjects(prev => prev.filter(s => s.id !== id))
  }, [])

  // ─── إدارة الفترات ───
  const handleCreatePeriod = useCallback(async () => {
    if (selectedBatch == null) { toast.error('اختر دفعة أولاً'); return }
    setNpBusy(true)
    try {
      const label = buildPeriodLabel(npType, npYear, npType === 'month' ? npMonth : npType === 'term' ? npTerm : null)
      const created = await createPeriod({
        batch_id: selectedBatch,
        period_type: npType,
        hijri_year: npYear,
        term_no: npType === 'term' ? npTerm : null,
        hijri_month: npType === 'month' ? npMonth : null,
        label,
      })
      const next = await getPeriods(selectedBatch)
      setPeriods(next)
      setSelectedPeriodId(created.id)
      setPeriodType(npType)
      setShowNewPeriod(false)
      toast.success(`أُضيفت: ${label}`)
    } catch (e: any) {
      toast.error(e?.message?.includes('duplicate') ? 'الفترة موجودة فعلاً' : 'تعذّر الإنشاء')
    } finally {
      setNpBusy(false)
    }
  }, [selectedBatch, npType, npYear, npMonth, npTerm])

  const handleDeletePeriod = useCallback(async (id: string, label: string) => {
    if (!confirm(`حذف "${label}" + كل بياناتها؟`)) return
    try {
      await deletePeriod(id)
      setPeriods(prev => prev.filter(p => p.id !== id))
      if (selectedPeriodId === id) setSelectedPeriodId(null)
      toast.success('حُذفت')
    } catch {
      toast.error('تعذّر الحذف')
    }
  }, [selectedPeriodId])

  const handleClonePeriod = useCallback(async (fromId: string, fromLabel: string) => {
    if (!selectedPeriodId || selectedPeriodId === fromId) {
      toast.error('اختر فترة هدف أولاً')
      return
    }
    if (!confirm(`نسخ المفترضات من "${fromLabel}" للفترة الحالية؟`)) return
    try {
      const n = await clonePeriodExpectations(fromId, selectedPeriodId)
      const es = await getEntriesForPeriod(selectedPeriodId)
      setEntries(es)
      toast.success(`نُسخ ${n} قيمة`)
    } catch {
      toast.error('تعذّر النسخ')
    }
  }, [selectedPeriodId])

  // ─── تصدير ───
  const handleExportExcel = useCallback(() => {
    if (!selectedPeriod) { toast.error('اختر فترة أولاً'); return }
    try {
      exportToExcel({
        reportTitle: `بيانات ${batchName} — ${selectedPeriod.label}`,
        batchName,
        periodLabel: selectedPeriod.label,
        students: batchStudents,
        subjects: visibleSubjects,
        entries,
        exclusions,
      })
      setExportMenuOpen(false)
    } catch (err) {
      console.error(err)
      toast.error('فشل التصدير')
    }
  }, [selectedPeriod, batchName, batchStudents, visibleSubjects, entries, exclusions])

  // ─── periodIndex helpers (للـscrubber) ───
  const periodIndex = useMemo(
    () => periodsOfType.findIndex(p => p.id === selectedPeriodId),
    [periodsOfType, selectedPeriodId]
  )
  const goPeriodPrev = () => {
    if (periodIndex > 0) setSelectedPeriodId(periodsOfType[periodIndex - 1].id)
  }
  const goPeriodNext = () => {
    if (periodIndex < periodsOfType.length - 1) setSelectedPeriodId(periodsOfType[periodIndex + 1].id)
  }

  // ─── UI ───
  if (!PERFORMANCE_REPORTS_ENABLED) return null
  if (loading || authLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--accent-warm)' }} />
      </div>
    )
  }

  return (
    <div className="space-y-4 animate-fade-in-up" id="perf-print-root">
      {/* ════════════ HERO ════════════ */}
      <div className="no-print flex items-end justify-between gap-3 flex-wrap mb-2">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span
              className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full"
              style={{ background: 'rgba(58,61,68,0.10)', color: '#1A1B20', letterSpacing: '0.04em' }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-warm)' }} />
              لوحة الأداء
            </span>
            <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
              {batchStudents.length} طالب · محدّث الآن
            </span>
          </div>
          <h1
            className="m-0"
            style={{
              fontFamily: 'var(--font-noto-kufi), serif',
              fontSize: 32, fontWeight: 700, letterSpacing: '-0.02em',
              color: 'var(--text-primary)',
            }}
          >
            قياس الأداء
          </h1>
          <p
            className="mt-1"
            style={{ color: 'var(--text-muted)', fontSize: 13.5 }}
          >
            متابعة المفترض والفعلي عبر المساقات القرآنية والشرعية والتربوية
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {canEdit && (
            <button
              type="button"
              onClick={() => setEditPlannedMode(s => !s)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-bold transition"
              style={
                editPlannedMode
                  ? {
                      background: 'linear-gradient(135deg, #C08A48, #8B5A1E)',
                      color: '#fff', border: '1.5px solid transparent',
                      boxShadow: '0 4px 14px rgba(192,138,72,0.35)',
                    }
                  : {
                      background: 'var(--bg-card, #fff)',
                      color: 'var(--accent-warm)',
                      border: '1.5px solid rgba(192,138,72,0.50)',
                    }
              }
            >
              <Edit3 className="w-3.5 h-3.5" />
              {editPlannedMode ? 'تعديل الأهداف — مفعّل' : 'تعديل الأهداف'}
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowSubjectDrawer(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[13px] font-bold transition"
            style={{
              background: 'var(--bg-card, #fff)', color: 'var(--text-primary)',
              border: '1px solid var(--border-soft)',
            }}
          >
            <Sparkles className="w-3.5 h-3.5" />
            إدارة المساقات
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setExportMenuOpen(s => !s)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[13px] font-bold transition"
              style={{
                background: 'var(--bg-card, #fff)', color: 'var(--text-primary)',
                border: '1px solid var(--border-soft)',
              }}
            >
              📥 تصدير
            </button>
            {exportMenuOpen && (
              <div
                style={{
                  position: 'absolute', top: '100%', left: 0, marginTop: 6, zIndex: 50,
                  background: 'var(--bg-card, #fff)', border: '1px solid var(--border-soft)',
                  borderRadius: 12, boxShadow: '0 12px 30px rgba(0,0,0,0.10)',
                  padding: 6, minWidth: 180,
                }}
              >
                <DropItem icon="📊" label="تصدير Excel" onClick={handleExportExcel} />
                <DropItem icon="🖨️" label="طباعة / PDF" onClick={() => { exportToPdf(); setExportMenuOpen(false) }} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ════════════ Period control + scrubber ════════════ */}
      <div
        className="no-print"
        style={{
          background: 'var(--bg-card, #fff)',
          border: '1px solid var(--border-soft)',
          borderRadius: 16, padding: 12,
          display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
        }}
      >
        {/* Batch selector */}
        <select
          value={selectedBatch ?? ''}
          onChange={(e) => setSelectedBatch(Number(e.target.value))}
          disabled={!isCeo}
          style={{
            padding: '8px 14px', background: 'var(--bg-subtle)',
            border: '1px solid var(--border-soft)', borderRadius: 10,
            fontSize: 13, fontWeight: 700, color: 'var(--text-primary)',
            outline: 'none', cursor: isCeo ? 'pointer' : 'not-allowed',
          }}
        >
          {batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>

        <div style={{ width: 1, height: 24, background: 'var(--border-soft)' }} />

        {/* Segmented period type */}
        <div style={{
          display: 'flex', background: 'var(--bg-subtle)', borderRadius: 10,
          padding: 3, gap: 2,
        }}>
          {PERIOD_TABS.map(p => {
            const active = periodType === p.k
            return (
              <button
                key={p.k}
                type="button"
                onClick={() => setPeriodType(p.k)}
                style={{
                  padding: '7px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: active ? 'var(--bg-card, #fff)' : 'transparent',
                  color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontSize: 12.5, fontWeight: 700,
                  boxShadow: active ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
                  transition: 'all 0.2s',
                }}
              >
                {p.l}
              </button>
            )
          })}
        </div>

        {/* Period scrubber */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0, overflowX: 'auto' }}>
          <button
            type="button"
            onClick={goPeriodPrev}
            disabled={periodIndex <= 0}
            style={{
              background: 'transparent', border: '1px solid var(--border-soft)',
              borderRadius: 8, padding: '6px 8px', cursor: periodIndex > 0 ? 'pointer' : 'default',
              color: 'var(--text-muted)', flexShrink: 0,
              opacity: periodIndex > 0 ? 1 : 0.4,
            }}
          >
            <ChevronRight className="w-3 h-3" />
          </button>
          {periodsOfType.length === 0 ? (
            <span style={{ fontSize: 12, color: 'var(--text-muted)', padding: '0 8px' }}>
              لا توجد فترات بعد
            </span>
          ) : (
            periodsOfType.map(p => {
              const active = p.id === selectedPeriodId
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedPeriodId(p.id)}
                  style={{
                    padding: '7px 13px', borderRadius: 9, flexShrink: 0,
                    border: `1px solid ${active ? 'var(--text-primary)' : 'var(--border-soft)'}`,
                    background: active ? 'rgba(58,61,68,0.08)' : 'transparent',
                    color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                    fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    position: 'relative',
                  }}
                >
                  {p.label}
                  {canManagePeriods && (
                    <span style={{ position: 'relative', display: 'inline-block', marginRight: 4 }}>
                      {/* أزرار صغيرة عند المرور */}
                    </span>
                  )}
                </button>
              )
            })
          )}
          <button
            type="button"
            onClick={goPeriodNext}
            disabled={periodIndex >= periodsOfType.length - 1}
            style={{
              background: 'transparent', border: '1px solid var(--border-soft)',
              borderRadius: 8, padding: '6px 8px',
              cursor: periodIndex < periodsOfType.length - 1 ? 'pointer' : 'default',
              color: 'var(--text-muted)', flexShrink: 0,
              opacity: periodIndex < periodsOfType.length - 1 ? 1 : 0.4,
            }}
          >
            <ChevronLeft className="w-3 h-3" />
          </button>
        </div>

        {/* New period + delete current */}
        {canManagePeriods && (
          <>
            <div style={{ width: 1, height: 24, background: 'var(--border-soft)' }} />
            {selectedPeriodId && (
              <button
                type="button"
                onClick={() => {
                  const p = periods.find(x => x.id === selectedPeriodId)
                  if (p) handleDeletePeriod(p.id, p.label)
                }}
                title="حذف الفترة الحالية"
                style={{
                  padding: '6px 8px', borderRadius: 8,
                  background: 'transparent', border: '1px solid var(--border-soft)',
                  color: '#B94838', cursor: 'pointer',
                }}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowNewPeriod(s => !s)}
              className="inline-flex items-center gap-1 text-[12px] font-bold px-3 py-2 rounded-lg"
              style={{ background: 'var(--accent-warm)', color: '#fff', border: 'none' }}
            >
              <Plus className="w-3 h-3" /> فترة
            </button>
          </>
        )}

        {/* Density toggle */}
        <div style={{ width: 1, height: 24, background: 'var(--border-soft)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>الكثافة</span>
          {([
            { k: 'compact', l: 'كثيف',  i: '☰' },
            { k: 'medium',  l: 'متوسط', i: '≡' },
            { k: 'cozy',    l: 'فسيح',  i: '☷' },
          ] as { k: Density; l: string; i: string }[]).map(d => (
            <button
              key={d.k}
              type="button"
              title={d.l}
              onClick={() => { setDensity(d.k); persistDensity(d.k) }}
              style={{
                width: 28, height: 28, borderRadius: 7,
                border: `1px solid ${density === d.k ? 'var(--text-primary)' : 'var(--border-soft)'}`,
                background: density === d.k ? 'rgba(58,61,68,0.08)' : 'transparent',
                color: density === d.k ? 'var(--text-primary)' : 'var(--text-muted)',
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {d.i}
            </button>
          ))}
        </div>
      </div>

      {/* New-period inline form */}
      {showNewPeriod && canManagePeriods && (
        <div
          className="no-print"
          style={{
            background: 'rgba(192,138,72,0.06)',
            border: '1.5px dashed rgba(192,138,72,0.50)',
            borderRadius: 14, padding: 12,
            display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap',
          }}
        >
          <div>
            <label style={labelStyle()}>نوع الفترة</label>
            <select value={npType} onChange={(e) => setNpType(e.target.value as PeriodType)} style={selectStyle()}>
              <option value="month">شهر</option>
              <option value="term">فصل</option>
              <option value="year">سنة</option>
            </select>
          </div>
          <div>
            <label style={labelStyle()}>السنة الهجرية</label>
            <input type="number" min={1440} max={1460} value={npYear}
              onChange={(e) => setNpYear(Number(e.target.value))}
              style={{ ...selectStyle(), width: 80, fontFamily: 'monospace' }} />
          </div>
          {npType === 'month' && (
            <div>
              <label style={labelStyle()}>الشهر</label>
              <select value={npMonth} onChange={(e) => setNpMonth(Number(e.target.value))} style={selectStyle()}>
                {HIJRI_MONTHS_AR.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
          )}
          {npType === 'term' && (
            <div>
              <label style={labelStyle()}>الفصل</label>
              <select value={npTerm} onChange={(e) => setNpTerm(Number(e.target.value))} style={selectStyle()}>
                <option value={1}>الأول</option>
                <option value={2}>الثاني</option>
              </select>
            </div>
          )}
          <button
            type="button"
            onClick={handleCreatePeriod}
            disabled={npBusy}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-bold text-white"
            style={{ background: 'linear-gradient(135deg, #C08A48, #8B5A1E)' }}
          >
            {npBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
            إنشاء
          </button>
          <button
            type="button"
            onClick={() => setShowNewPeriod(false)}
            className="px-3 py-2 rounded-lg text-[12px]"
            style={{ background: 'transparent', border: '1px solid var(--border-soft)', color: 'var(--text-muted)' }}
          >
            إلغاء
          </button>
          {/* Clone helper */}
          {periodsOfType.length > 1 && selectedPeriodId && (
            <div style={{ marginRight: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>أو انسخ المفترضات من:</span>
              {periodsOfType.filter(p => p.id !== selectedPeriodId).slice(0, 4).map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleClonePeriod(p.id, p.label)}
                  className="text-[11px] px-2 py-1 rounded-md font-semibold"
                  style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-soft)', color: 'var(--text-primary)' }}
                >
                  📋 {p.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ════════════ Thresholds ════════════ */}
      <div className="no-print" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => setShowThresholds(s => !s)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-bold"
          style={{
            background: showThresholds ? 'rgba(58,61,68,0.10)' : 'var(--bg-card, #fff)',
            border: `1px solid ${showThresholds ? 'var(--text-primary)' : 'var(--border-soft)'}`,
            color: showThresholds ? 'var(--text-primary)' : 'var(--text-muted)',
          }}
        >
          <Palette className="w-3.5 h-3.5" />
          معيار الألوان
        </button>
        {showThresholds && (
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '8px 14px', borderRadius: 10,
              background: 'var(--bg-card, #fff)', border: '1px solid var(--border-soft)',
              flexWrap: 'wrap', fontSize: 12,
            }}
          >
            <ThresholdCtrl
              dotColor="#B94838" label="أحمر إذا ≤"
              value={thresholds.red}
              onChange={(v) => {
                const t = { ...thresholds, red: Math.min(v, thresholds.green - 1) }
                setThresholds(t); persistThresholds(t)
              }}
            />
            <span style={{ width: 1, height: 18, background: 'var(--border-soft)' }} />
            <ThresholdCtrl
              dotColor="#5A8F67" label="أخضر إذا ≥"
              value={thresholds.green}
              onChange={(v) => {
                const t = { ...thresholds, green: Math.max(v, thresholds.red + 1) }
                setThresholds(t); persistThresholds(t)
              }}
            />
          </div>
        )}

        {/* Search */}
        <div
          style={{
            flex: 1, minWidth: 200,
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px', background: 'var(--bg-card, #fff)',
            border: '1px solid var(--border-soft)', borderRadius: 10,
          }}
        >
          <Search className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث عن طالب…"
            style={{
              flex: 1, border: 'none', background: 'transparent', outline: 'none',
              fontSize: 13, color: 'var(--text-primary)',
            }}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Edit-planned banner */}
      {editPlannedMode && (
        <div
          className="no-print"
          style={{
            padding: '10px 16px', borderRadius: 12,
            background: 'rgba(192,138,72,0.12)',
            border: '1px solid rgba(192,138,72,0.36)',
            display: 'flex', alignItems: 'center', gap: 10,
            fontSize: 12.5, color: '#8B5A1E', fontWeight: 600,
          }}
        >
          <span style={{ fontSize: 16 }}>✏️</span>
          <span>أنت في <strong>وضع تعديل الأهداف</strong> — انقر على أي رقم مفترض (المسبوق بـ /) لتعديله. النقر على خلية الفعلي معطّل في هذا الوضع.</span>
          <button
            type="button"
            onClick={() => setEditPlannedMode(false)}
            style={{
              marginRight: 'auto', padding: '4px 12px', borderRadius: 8,
              background: '#C08A48', color: '#fff', border: 'none', cursor: 'pointer',
              fontSize: 11.5, fontWeight: 700,
            }}
          >
            إنهاء
          </button>
        </div>
      )}

      {/* ════════════ Print header (only print) ════════════ */}
      <div className="hidden print:block text-center mb-4">
        <h1 className="text-2xl font-bold">المواهب الناشئة — تقرير أداء الطلاب</h1>
        <p className="text-sm mt-1">{batchName} · {selectedPeriod?.label ?? ''}</p>
      </div>

      {/* ════════════ Table ════════════ */}
      {loadingPeriod ? (
        <div className="card-static p-12 text-center">
          <Loader2 className="w-6 h-6 mx-auto animate-spin" style={{ color: 'var(--accent-warm)' }} />
        </div>
      ) : !selectedPeriodId ? (
        <div className="card-static p-8 text-center" style={{ color: 'var(--text-muted)' }}>
          أنشئ فترة جديدة (شهر/فصل/سنة) لبدء التقرير.
        </div>
      ) : (
        <PerformanceTable
          students={batchStudents}
          subjects={batchSubjects}
          entries={entries}
          exclusions={exclusions}
          hiddenSubjectIds={hiddenSubjectIds}
          thresholds={thresholds}
          density={density}
          readOnly={!canEdit}
          editPlannedMode={editPlannedMode}
          onCellSave={handleCellSave}
          onOpenStudent={(id) => router.push(`/students/${id}`)}
        />
      )}

      {/* ════════════ Subject Drawer ════════════ */}
      {showSubjectDrawer && (
        <SubjectManager
          subjects={batchSubjects}
          hiddenIds={hiddenSubjectIds}
          onToggleHidden={handleToggleHidden}
          onCreate={handleCreateSubject}
          onDelete={handleDeleteSubject}
          canManage={canManageSubjects}
          onClose={() => setShowSubjectDrawer(false)}
        />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════════════

function DropItem({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%',
        padding: '10px 12px', background: 'transparent', border: 'none',
        borderRadius: 8, color: 'var(--text-primary)',
        fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'right',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-subtle)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <span style={{ fontSize: 16 }}>{icon}</span>
      {label}
    </button>
  )
}

function ThresholdCtrl({
  dotColor, label, value, onChange,
}: { dotColor: string; label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 10, height: 10, borderRadius: 3, background: dotColor }} />
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <input
        type="number" min={0} max={100} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          width: 50, padding: '4px 8px', border: '1px solid var(--border-soft)',
          borderRadius: 6, fontSize: 12, fontFamily: 'monospace',
          background: 'var(--bg-subtle)', color: 'var(--text-primary)',
          textAlign: 'center', outline: 'none',
        }}
      />
      <span style={{ color: 'var(--text-muted)' }}>٪</span>
    </div>
  )
}

function labelStyle(): React.CSSProperties {
  return {
    display: 'block', fontSize: 11, fontWeight: 600,
    color: 'var(--text-muted)', marginBottom: 4,
  }
}

function selectStyle(): React.CSSProperties {
  return {
    padding: '8px 10px',
    background: 'var(--bg-card, #fff)',
    border: '1px solid var(--border-soft)',
    borderRadius: 8,
    fontSize: 12, fontWeight: 600,
    color: 'var(--text-primary)',
    outline: 'none',
  }
}
