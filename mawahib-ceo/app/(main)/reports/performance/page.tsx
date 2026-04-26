'use client'
/**
 * /reports/performance — تقرير أداء الطلاب لكل دفعة × فترة
 *
 * الميّزات:
 *   - فلترة بالدفعة + الفترة (سنة/فصل/شهر)
 *   - مساقات ديناميكية (إضافة/إخفاء/استثناء طالب)
 *   - تعديل inline يحفظ تلقائياً
 *   - تصدير Excel + PDF (طباعة)
 *   - استنساخ مفترضات من فترة لأخرى
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  FileSpreadsheet, Printer, Settings2, Loader2, BookOpenCheck,
  Eye,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { PERFORMANCE_REPORTS_ENABLED } from '@/lib/performance/flag'
import { getStudents, getBatches, type DBStudent, type DBBatch } from '@/lib/db'
import {
  getSubjects, createSubject, deleteSubject,
  getExclusions, setExclusion,
  getPeriods, createPeriod, deletePeriod, clonePeriodExpectations,
  getEntriesForPeriod, upsertEntry,
} from '@/lib/performance/db'
import type {
  ReportSubject, SubjectExclusion, PerformancePeriod, PerformanceEntry,
  EntryColumnKey, SubjectColumnsKind, SubjectTrack, PeriodType,
} from '@/lib/performance/types'
import { exportToExcel, exportToPdf } from '@/lib/performance/export'
import PerformanceTable from '@/components/performance/PerformanceTable'
import PeriodManager from '@/components/performance/PeriodManager'
import SubjectManager from '@/components/performance/SubjectManager'

const HIDDEN_KEY = 'performance:hidden_subjects'

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
  const canManageExclusions = isCeo || role === 'batch_manager' || role === 'records_officer'
  const canEdit = canManageSubjects // المشرف يقدر يعدّل القيم لطلابه
  const myBatchId = profile?.batch_id ?? null

  // ─── البيانات الأساسية ───
  const [batches, setBatches] = useState<DBBatch[]>([])
  const [students, setStudents] = useState<DBStudent[]>([])
  const [subjects, setSubjects] = useState<ReportSubject[]>([])
  const [exclusions, setExclusions] = useState<SubjectExclusion[]>([])
  const [periods, setPeriods] = useState<PerformancePeriod[]>([])
  const [entries, setEntries] = useState<PerformanceEntry[]>([])

  const [selectedBatch, setSelectedBatch] = useState<number | null>(null)
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null)
  const [hiddenSubjectIds, setHiddenSubjectIds] = useState<Set<string>>(new Set())
  const [showSubjectManager, setShowSubjectManager] = useState(false)
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
        // تحديد الدفعة الأولى أو دفعة المستخدم
        const initialBatch = myBatchId ?? b[0]?.id ?? null
        setSelectedBatch(initialBatch)
        // قراءة الـhidden من localStorage
        try {
          const raw = localStorage.getItem(HIDDEN_KEY)
          if (raw) setHiddenSubjectIds(new Set(JSON.parse(raw)))
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
        setSelectedPeriodId(ps[0]?.id ?? null)
      } catch {
        toast.error('تعذّر تحميل الفترات')
      }
    })()
    return () => { alive = false }
  }, [selectedBatch])

  // ─── تحميل الـentries لما تتغيّر الفترة ───
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

  // ─── طلاب الدفعة المحدّدة ───
  const batchStudents = useMemo(
    () => students.filter(s => s.batch_id === selectedBatch && (s.status === 'active' || !s.status)),
    [students, selectedBatch]
  )
  const batchSubjects = useMemo(
    () => subjects.filter(s => s.batch_id == null || s.batch_id === selectedBatch),
    [subjects, selectedBatch]
  )
  const visibleSubjects = useMemo(
    () => batchSubjects.filter(s => !hiddenSubjectIds.has(s.id)),
    [batchSubjects, hiddenSubjectIds]
  )
  const selectedPeriod = useMemo(
    () => periods.find(p => p.id === selectedPeriodId) ?? null,
    [periods, selectedPeriodId]
  )
  const batchName = useMemo(
    () => batches.find(b => b.id === selectedBatch)?.name ?? `دفعة ${selectedBatch}`,
    [batches, selectedBatch]
  )

  // ─── handlers ───
  const persistHidden = useCallback((next: Set<string>) => {
    try { localStorage.setItem(HIDDEN_KEY, JSON.stringify(Array.from(next))) } catch { /* noop */ }
  }, [])

  const handleToggleHidden = useCallback((id: string) => {
    setHiddenSubjectIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      persistHidden(next)
      return next
    })
  }, [persistHidden])

  const handleCellSave = useCallback(async (
    student_id: string, subject_id: string, column_key: EntryColumnKey,
    field: 'expected' | 'actual', value: number | null
  ) => {
    if (!selectedPeriodId) return
    try {
      const updated = await upsertEntry({
        period_id: selectedPeriodId,
        student_id, subject_id, column_key,
        [field]: value,
        // اقرأ القيمة الأخرى من الحالة المحلية للحفاظ عليها
        [field === 'expected' ? 'actual' : 'expected']:
          entries.find(e =>
            e.student_id === student_id && e.subject_id === subject_id && e.column_key === column_key
          )?.[field === 'expected' ? 'actual' : 'expected'] ?? null,
      })
      setEntries(prev => {
        const others = prev.filter(e => e.id !== updated.id)
        return [...others, updated]
      })
    } catch (err) {
      console.error(err)
      toast.error('تعذّر الحفظ')
      throw err
    }
  }, [selectedPeriodId, entries])

  const handleToggleExclusion = useCallback(async (subjectId: string, studentId: string, currentlyExcluded: boolean) => {
    try {
      await setExclusion(subjectId, studentId, !currentlyExcluded)
      const refreshed = await getExclusions()
      setExclusions(refreshed)
      toast.success(currentlyExcluded ? 'أُعيد المساق للطالب' : 'تم استثناء الطالب')
    } catch {
      toast.error('تعذّر التنفيذ')
    }
  }, [])

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

  const handleCreatePeriod = useCallback(async (input: any) => {
    if (selectedBatch == null) { toast.error('اختر دفعة أولاً'); return }
    const created = await createPeriod({ ...input, batch_id: selectedBatch })
    const next = await getPeriods(selectedBatch)
    setPeriods(next)
    setSelectedPeriodId(created.id)
  }, [selectedBatch])

  const handleDeletePeriod = useCallback(async (id: string) => {
    await deletePeriod(id)
    setPeriods(prev => prev.filter(p => p.id !== id))
    if (selectedPeriodId === id) setSelectedPeriodId(null)
  }, [selectedPeriodId])

  const handleClonePeriod = useCallback(async (fromId: string, toId: string) => {
    const n = await clonePeriodExpectations(fromId, toId)
    toast.success(`نُسخ ${n} قيمة مفترضة`)
    const es = await getEntriesForPeriod(toId)
    setEntries(es)
  }, [])

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
    } catch (err) {
      console.error(err)
      toast.error('فشل التصدير')
    }
  }, [selectedPeriod, batchName, batchStudents, visibleSubjects, entries, exclusions])

  // ─── UI ───
  if (!PERFORMANCE_REPORTS_ENABLED) return null
  if (loading || authLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--accent-warm)' }} /></div>
  }

  const totalHidden = batchSubjects.length - visibleSubjects.length

  return (
    <div className="space-y-5 animate-fade-in-up" id="perf-print-root">
      {/* ── Header ── */}
      <div className="no-print flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="eyebrow-pill mb-2"><span className="eyebrow-dot" />تقارير الأداء</div>
          <h1 className="display-h1 m-0 flex items-center gap-3" style={{ color: 'var(--text-primary)' }}>
            <BookOpenCheck className="w-7 h-7" style={{ color: 'var(--accent-warm)' }} />
            تقرير إنجاز الطلاب
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            مساقات ديناميكية + ألوان حسب نسبة الإنجاز + تصدير Excel/PDF
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowSubjectManager(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border transition"
            style={{ borderColor: 'var(--border-soft)', color: 'var(--text-primary)', background: 'var(--bg-card, #fff)' }}
          >
            <Settings2 className="w-3.5 h-3.5" /> إدارة المساقات
            {totalHidden > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(192,138,72,0.18)', color: '#8B5A1E' }}>
                <Eye className="w-2.5 h-2.5" /> {totalHidden} مخفي
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl text-white transition"
            style={{ background: 'linear-gradient(135deg, #5A8F67, #3F6E4B)' }}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" /> تصدير Excel
          </button>
          <button
            type="button"
            onClick={exportToPdf}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl text-white transition"
            style={{ background: 'linear-gradient(135deg, #356B6E, #244A4C)' }}
          >
            <Printer className="w-3.5 h-3.5" /> طباعة / PDF
          </button>
        </div>
      </div>

      {/* ── Batch + Period filters ── */}
      <div className="no-print card-static p-4 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>الدفعة:</label>
          <select
            value={selectedBatch ?? ''}
            onChange={(e) => setSelectedBatch(Number(e.target.value))}
            disabled={!isCeo} // غير الـCEO ينظر دفعته فقط
            className="px-3 py-1.5 text-xs rounded-lg outline-none font-semibold disabled:opacity-70"
            style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-soft)', color: 'var(--text-primary)' }}
          >
            {batches.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
        {selectedBatch != null && (
          <PeriodManager
            batchId={selectedBatch}
            periods={periods}
            selectedId={selectedPeriodId}
            onSelect={setSelectedPeriodId}
            onCreate={handleCreatePeriod}
            onDelete={handleDeletePeriod}
            onClone={handleClonePeriod}
            canManage={canManagePeriods}
          />
        )}
      </div>

      {/* ── Print header (hidden on screen) ── */}
      <div className="hidden print:block text-center mb-4">
        <h1 className="text-2xl font-bold">المواهب الناشئة — تقرير أداء الطلاب</h1>
        <p className="text-sm mt-1">{batchName} · {selectedPeriod?.label ?? ''}</p>
      </div>

      {/* ── Table ── */}
      {loadingPeriod ? (
        <div className="card-static p-12 text-center"><Loader2 className="w-6 h-6 mx-auto animate-spin" style={{ color: 'var(--accent-warm)' }} /></div>
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
          readOnly={!canEdit}
          canManageExclusions={canManageExclusions}
          onCellSave={handleCellSave}
          onToggleHidden={handleToggleHidden}
          onToggleExclusion={handleToggleExclusion}
        />
      )}

      {/* ── Subject Manager Modal ── */}
      {showSubjectManager && (
        <SubjectManager
          subjects={batchSubjects}
          hiddenIds={hiddenSubjectIds}
          onToggleHidden={handleToggleHidden}
          onCreate={handleCreateSubject}
          onDelete={handleDeleteSubject}
          canManage={canManageSubjects}
          onClose={() => setShowSubjectManager(false)}
        />
      )}
    </div>
  )
}
