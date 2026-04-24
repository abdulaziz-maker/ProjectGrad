'use client'
/**
 * /timeline/clone — Plan Template system (Phase 5B).
 *
 * Two tools on one page:
 *   1. "Save as template" — freezes the active plan of a batch into a template row
 *   2. "Apply template" — projects a template onto a target calendar+batch and creates draft activities
 *
 * Only CEO + records_officer can use this page (DB RLS also enforces).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  Copy,
  Save,
  Sparkles,
  ChevronLeft,
  Loader2,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Trash2,
  Download,
  Wand2,
} from 'lucide-react'
import { TIMELINE_ENABLED } from '@/lib/timeline/flag'
import {
  getCalendars,
  getActivities,
  getCostsForActivities,
  getDays,
  getActivityTypes,
  getBatchesForTimeline,
  createPlanTemplate,
  getPlanTemplates,
  deletePlanTemplate,
  bulkInsertActivities,
  replaceActivityCosts,
  type TimelineBatchRef,
} from '@/lib/timeline/db'
import {
  buildTemplateData,
  projectTemplateOnYear,
  detectAppliedConflicts,
  materializeApplied,
  type PlanTemplateData,
  type AppliedActivity,
} from '@/lib/timeline/template-engine'
import { useAuth } from '@/contexts/AuthContext'
import { HIJRI_MONTHS_AR } from '@/lib/timeline/hijri'
import type {
  TimelineActivity,
  TimelineActivityCost,
  TimelineActivityType,
  TimelineCalendar,
  TimelineDay,
  TimelinePlanTemplate,
} from '@/types/timeline'

export default function CloneTemplatePage() {
  const router = useRouter()
  const { profile, loading: authLoading } = useAuth()
  const role = profile?.role ?? null
  const userId = profile?.id ?? null
  const isCrossBatch = role === 'ceo' || role === 'records_officer'

  const [calendars, setCalendars] = useState<TimelineCalendar[]>([])
  const [batches, setBatches] = useState<TimelineBatchRef[]>([])
  const [types, setTypes] = useState<TimelineActivityType[]>([])
  const [templates, setTemplates] = useState<TimelinePlanTemplate[]>([])
  const [loading, setLoading] = useState(true)

  // ── Save form
  const [saveSourceCalId, setSaveSourceCalId] = useState<string | null>(null)
  const [saveSourceBatchId, setSaveSourceBatchId] = useState<number | null>(null)
  const [saveName, setSaveName] = useState('')
  const [saving, setSaving] = useState(false)

  // ── Apply form
  const [applyTemplateId, setApplyTemplateId] = useState<string | null>(null)
  const [applyTargetCalId, setApplyTargetCalId] = useState<string | null>(null)
  const [applyTargetBatchId, setApplyTargetBatchId] = useState<number | null>(null)
  const [preview, setPreview] = useState<AppliedActivity[]>([])
  const [previewConflicts, setPreviewConflicts] = useState<
    Array<{ ruleIdx: number; message: string }>
  >([])
  const [targetDays, setTargetDays] = useState<TimelineDay[]>([])
  const [previewing, setPreviewing] = useState(false)
  const [applying, setApplying] = useState(false)

  useEffect(() => {
    if (!TIMELINE_ENABLED) router.replace('/dashboard')
  }, [router])

  useEffect(() => {
    if (!TIMELINE_ENABLED || authLoading) return
    if (!isCrossBatch) {
      setLoading(false)
      return
    }
    let alive = true
    ;(async () => {
      try {
        const [cs, bs, ts, tpls] = await Promise.all([
          getCalendars(),
          getBatchesForTimeline(),
          getActivityTypes(),
          getPlanTemplates(),
        ])
        if (!alive) return
        setCalendars(cs)
        setBatches(bs)
        setTypes(ts)
        setTemplates(tpls)
        if (cs.length > 0) setSaveSourceCalId(cs.find((c) => c.is_active)?.id ?? cs[0].id)
        if (bs.length > 0) setSaveSourceBatchId(bs[0].id)
      } catch (err) {
        console.error(err)
        toast.error('تعذّر تحميل البيانات')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [authLoading, isCrossBatch])

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === applyTemplateId) ?? null,
    [templates, applyTemplateId],
  )
  const selectedTargetCal = useMemo(
    () => calendars.find((c) => c.id === applyTargetCalId) ?? null,
    [calendars, applyTargetCalId],
  )

  // ── Save current plan as template
  const handleSaveTemplate = useCallback(async () => {
    if (!saveSourceCalId || saveSourceBatchId == null) return
    if (!saveName.trim()) {
      toast.error('اكتب اسماً للقالب')
      return
    }
    const sourceCal = calendars.find((c) => c.id === saveSourceCalId)
    if (!sourceCal) return
    setSaving(true)
    try {
      const activities = await getActivities({
        batchId: saveSourceBatchId,
        calendarId: saveSourceCalId,
      })
      if (activities.length === 0) {
        toast.error('لا توجد أنشطة في هذه الخطة لحفظها')
        return
      }
      const costs = await getCostsForActivities(activities.map((a) => a.id))
      const costsByActivity = new Map<string, TimelineActivityCost[]>()
      for (const c of costs) {
        const arr = costsByActivity.get(c.activity_id) ?? []
        arr.push(c)
        costsByActivity.set(c.activity_id, arr)
      }
      const templateData = buildTemplateData(
        activities,
        costsByActivity,
        sourceCal.hijri_year,
      )
      const tpl = await createPlanTemplate({
        name: saveName.trim(),
        batchId: saveSourceBatchId,
        templateData,
        sourceYear: sourceCal.hijri_year,
        createdBy: userId,
      })
      setTemplates((prev) => [tpl, ...prev])
      setSaveName('')
      toast.success(`تم حفظ قالب "${tpl.name}" (${templateData.activities.length} نشاط)`)
    } catch (err) {
      console.error(err)
      toast.error('تعذّر حفظ القالب')
    } finally {
      setSaving(false)
    }
  }, [saveSourceCalId, saveSourceBatchId, saveName, calendars, userId])

  // ── Preview apply
  const handlePreview = useCallback(async () => {
    if (!selectedTemplate || !selectedTargetCal) return
    setPreviewing(true)
    try {
      const tdata = selectedTemplate.template_data as PlanTemplateData
      if (!tdata || tdata.version !== 1) {
        toast.error('صيغة القالب غير معروفة')
        return
      }
      const applied = projectTemplateOnYear(tdata, selectedTargetCal.hijri_year)
      const ds = await getDays(selectedTargetCal.id)
      const conflicts = detectAppliedConflicts(applied, ds)
      setPreview(applied)
      setTargetDays(ds)
      setPreviewConflicts(conflicts)
    } catch (err) {
      console.error(err)
      toast.error('تعذّر إنشاء المعاينة')
    } finally {
      setPreviewing(false)
    }
  }, [selectedTemplate, selectedTargetCal])

  // ── Apply (create activities as draft)
  const handleApply = useCallback(async () => {
    if (!selectedTargetCal || applyTargetBatchId == null || preview.length === 0) return
    setApplying(true)
    try {
      const { activities: actRows, costsPerActivity } = materializeApplied({
        applied: preview,
        batchId: applyTargetBatchId,
        calendarId: selectedTargetCal.id,
        proposedBy: userId,
        defaultStatus: 'draft',
        dropSkipped: true,
      })
      const inserted = await bulkInsertActivities(actRows)
      // Activities inserted without IDs returned. We need to re-fetch to attach costs.
      if (inserted > 0) {
        const refreshed = await getActivities({
          batchId: applyTargetBatchId,
          calendarId: selectedTargetCal.id,
        })
        // Match by (title, start_date, end_date) — best-effort reattach
        for (let i = 0; i < actRows.length; i++) {
          const r = actRows[i]
          const costs = costsPerActivity[i]
          if (!costs || costs.length === 0) continue
          const match = refreshed.find(
            (a) =>
              a.title === r.title &&
              a.start_date === r.start_date &&
              a.end_date === r.end_date &&
              a.batch_id === r.batch_id,
          )
          if (match) {
            await replaceActivityCosts(
              match.id,
              costs.map((c) => ({
                cost_type: c.cost_type,
                amount: c.amount,
                per_student: c.per_student,
                estimated_students: c.estimated_students ?? null,
                notes: c.notes ?? null,
                receipt_url: null,
              })),
            )
          }
        }
      }
      toast.success(`تم إنشاء ${inserted} نشاط كمسودة`)
      setPreview([])
      setPreviewConflicts([])
    } catch (err) {
      console.error(err)
      toast.error('تعذّر التطبيق')
    } finally {
      setApplying(false)
    }
  }, [selectedTargetCal, applyTargetBatchId, preview, userId])

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm('حذف هذا القالب؟')) return
    try {
      await deletePlanTemplate(id)
      setTemplates((prev) => prev.filter((t) => t.id !== id))
      if (applyTemplateId === id) {
        setApplyTemplateId(null)
        setPreview([])
      }
      toast.success('تم الحذف')
    } catch (err) {
      console.error(err)
      toast.error('تعذّر الحذف')
    }
  }

  if (!TIMELINE_ENABLED || authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin mx-auto" style={{ color: '#C08A48' }} />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            جاري التحميل...
          </p>
        </div>
      </div>
    )
  }

  if (!isCrossBatch) {
    return (
      <div className="space-y-4">
        <Link
          href="/timeline"
          className="text-xs font-semibold inline-flex items-center gap-1 hover:underline"
          style={{ color: '#C08A48' }}
        >
          <ChevronLeft className="w-3.5 h-3.5" /> رجوع
        </Link>
        <div
          className="rounded-2xl p-8 text-center"
          style={{
            background: 'rgba(185,72,56,0.06)',
            border: '1px solid rgba(185,72,56,0.25)',
          }}
        >
          <ShieldAlert className="w-10 h-10 mx-auto mb-3 opacity-60" style={{ color: '#8B2F23' }} />
          <p className="text-sm font-semibold" style={{ color: '#8B2F23' }}>
            هذه الصفحة مخصّصة للمدير التنفيذي وموظف السجلات فقط.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-fade-in-up">
      {/* Header */}
      <div>
        <Link
          href="/timeline"
          className="text-xs font-semibold inline-flex items-center gap-1 hover:underline mb-1"
          style={{ color: '#C08A48' }}
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          رجوع للخطة الزمنية
        </Link>
        <h1
          className="text-2xl font-bold flex items-center gap-2"
          style={{ color: 'var(--text-primary)' }}
        >
          <Copy className="w-6 h-6" style={{ color: '#C08A48' }} />
          القوالب والاستنساخ السنوي
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
          احفظ خطة السنة الحالية كقالب، ثم طبّقها على سنة/دفعة جديدة بنقرة واحدة.
        </p>
      </div>

      {/* Save template */}
      <div className="card-static p-4 space-y-3">
        <h2
          className="text-base font-bold flex items-center gap-2"
          style={{ color: 'var(--text-primary)' }}
        >
          <Save className="w-4 h-4" style={{ color: '#C08A48' }} />
          ١. حفظ خطة حالية كقالب
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
              التقويم المصدر
            </label>
            <select
              value={saveSourceCalId ?? ''}
              onChange={(e) => setSaveSourceCalId(e.target.value || null)}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{
                background: 'var(--bg-subtle)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
              }}
            >
              {calendars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.hijri_year}هـ)
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
              الدفعة المصدر
            </label>
            <select
              value={saveSourceBatchId ?? ''}
              onChange={(e) =>
                setSaveSourceBatchId(e.target.value ? Number(e.target.value) : null)
              }
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{
                background: 'var(--bg-subtle)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
              }}
            >
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
              اسم القالب
            </label>
            <input
              type="text"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="مثال: خطة 1447هـ — الدفعة 48"
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{
                background: 'var(--bg-subtle)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={handleSaveTemplate}
          disabled={saving || !saveSourceCalId || saveSourceBatchId == null || !saveName.trim()}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-50 transition active:scale-95"
          style={{
            background: 'linear-gradient(135deg, #C08A48, #9A6A2E)',
            boxShadow: '0 2px 10px rgba(192,138,72,0.35)',
          }}
        >
          <Save className="w-4 h-4" />
          {saving ? 'جاري الحفظ...' : 'حفظ كقالب'}
        </button>
      </div>

      {/* Existing templates */}
      <div className="card-static p-4 space-y-3">
        <h2
          className="text-base font-bold flex items-center gap-2"
          style={{ color: 'var(--text-primary)' }}
        >
          <Sparkles className="w-4 h-4" style={{ color: '#C08A48' }} />
          ٢. القوالب المحفوظة ({templates.length})
        </h2>
        {templates.length === 0 ? (
          <p className="text-xs text-center py-6" style={{ color: 'var(--text-muted)' }}>
            لا توجد قوالب محفوظة بعد.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {templates.map((t) => {
              const td = t.template_data as PlanTemplateData | undefined
              const count = td?.activities?.length ?? 0
              const active = applyTemplateId === t.id
              return (
                <div
                  key={t.id}
                  className="rounded-xl p-3 space-y-2"
                  style={{
                    background: active ? 'rgba(192,138,72,0.08)' : 'var(--bg-subtle)',
                    border: `1.5px solid ${active ? '#C08A48' : 'var(--border-soft)'}`,
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
                        {t.name}
                      </p>
                      <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        {t.source_year ? `السنة المصدر: ${t.source_year}هـ • ` : ''}
                        {count} نشاط
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteTemplate(t.id)}
                      className="p-1 rounded-md hover:bg-white/10"
                      aria-label="حذف"
                    >
                      <Trash2 className="w-3.5 h-3.5" style={{ color: '#8B2F23' }} />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setApplyTemplateId(t.id)
                      setPreview([])
                      setPreviewConflicts([])
                    }}
                    className="w-full inline-flex items-center justify-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-md transition"
                    style={{
                      background: active ? '#C08A48' : 'transparent',
                      color: active ? 'white' : '#7A4E1E',
                      border: `1px solid ${active ? '#C08A48' : 'rgba(192,138,72,0.35)'}`,
                    }}
                  >
                    {active ? '✓ مختار' : 'اختيار للتطبيق'}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Apply template */}
      {applyTemplateId ? (
        <div className="card-static p-4 space-y-3">
          <h2
            className="text-base font-bold flex items-center gap-2"
            style={{ color: 'var(--text-primary)' }}
          >
            <Wand2 className="w-4 h-4" style={{ color: '#C08A48' }} />
            ٣. تطبيق القالب
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                التقويم المستهدف
              </label>
              <select
                value={applyTargetCalId ?? ''}
                onChange={(e) => {
                  setApplyTargetCalId(e.target.value || null)
                  setPreview([])
                }}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{
                  background: 'var(--bg-subtle)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                }}
              >
                <option value="">-- اختر --</option>
                {calendars.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.hijri_year}هـ)
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                الدفعة المستهدفة
              </label>
              <select
                value={applyTargetBatchId ?? ''}
                onChange={(e) =>
                  setApplyTargetBatchId(e.target.value ? Number(e.target.value) : null)
                }
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{
                  background: 'var(--bg-subtle)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                }}
              >
                <option value="">-- اختر --</option>
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="button"
            onClick={handlePreview}
            disabled={!applyTargetCalId || previewing}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition disabled:opacity-50"
            style={{
              background: 'transparent',
              border: '1px solid #356B6E',
              color: '#235052',
            }}
          >
            <Download className="w-4 h-4" />
            {previewing ? 'جاري التجهيز...' : 'معاينة التوزيع'}
          </button>

          {/* Preview */}
          {preview.length > 0 ? (
            <div className="space-y-3 pt-3 border-t" style={{ borderColor: 'var(--border-soft)' }}>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  معاينة: {preview.filter((p) => !p.skipped).length} نشاط قابل للإنشاء
                  {preview.filter((p) => p.skipped).length > 0
                    ? ` (${preview.filter((p) => p.skipped).length} متخطَّى)`
                    : ''}
                </p>
                {previewConflicts.length > 0 ? (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold"
                    style={{
                      background: 'rgba(192,138,72,0.12)',
                      color: '#7A4E1E',
                      border: '1px solid rgba(192,138,72,0.35)',
                    }}
                  >
                    <AlertTriangle className="w-3 h-3" />
                    {previewConflicts.length} تنبيه
                  </span>
                ) : (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold"
                    style={{
                      background: 'rgba(53,107,110,0.12)',
                      color: '#235052',
                      border: '1px solid rgba(53,107,110,0.3)',
                    }}
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    لا توجد تعارضات
                  </span>
                )}
              </div>

              {previewConflicts.length > 0 ? (
                <ul
                  className="rounded-xl p-3 space-y-1 text-xs"
                  style={{
                    background: 'rgba(192,138,72,0.06)',
                    border: '1px solid rgba(192,138,72,0.25)',
                    color: '#7A4E1E',
                  }}
                >
                  {previewConflicts.slice(0, 6).map((c, i) => (
                    <li key={i} className="flex items-start gap-1">
                      <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                      <span>{c.message}</span>
                    </li>
                  ))}
                  {previewConflicts.length > 6 ? (
                    <li className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      …و{previewConflicts.length - 6} تنبيهاً آخر
                    </li>
                  ) : null}
                </ul>
              ) : null}

              <div className="overflow-x-auto">
                <table className="w-full text-xs" style={{ direction: 'rtl' }}>
                  <thead>
                    <tr
                      className="border-b"
                      style={{ borderColor: 'var(--border-color)' }}
                    >
                      <th className="text-right p-2 font-bold" style={{ color: 'var(--text-muted)' }}>#</th>
                      <th className="text-right p-2 font-bold" style={{ color: 'var(--text-muted)' }}>النشاط</th>
                      <th className="text-right p-2 font-bold" style={{ color: 'var(--text-muted)' }}>من</th>
                      <th className="text-right p-2 font-bold" style={{ color: 'var(--text-muted)' }}>إلى</th>
                      <th className="text-right p-2 font-bold" style={{ color: 'var(--text-muted)' }}>الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, 40).map((a, i) => {
                      const start = a.start_hijri_iso.split('-')
                      const end = a.end_hijri_iso.split('-')
                      return (
                        <tr key={i} className="border-b" style={{ borderColor: 'var(--border-soft)' }}>
                          <td className="p-2 font-mono" style={{ color: 'var(--text-muted)' }}>{i + 1}</td>
                          <td className="p-2 font-semibold" style={{ color: 'var(--text-primary)' }}>
                            {a.rule.title}
                          </td>
                          <td className="p-2 font-mono" style={{ color: 'var(--text-secondary)' }}>
                            {start[2]} {HIJRI_MONTHS_AR[Number(start[1]) - 1]}
                          </td>
                          <td className="p-2 font-mono" style={{ color: 'var(--text-secondary)' }}>
                            {end[2]} {HIJRI_MONTHS_AR[Number(end[1]) - 1]}
                          </td>
                          <td className="p-2">
                            {a.skipped ? (
                              <span className="text-[10px]" style={{ color: '#8B2F23' }}>متخطَّى</span>
                            ) : a.clamped ? (
                              <span className="text-[10px]" style={{ color: '#7A4E1E' }}>معدَّل</span>
                            ) : (
                              <span className="text-[10px]" style={{ color: '#235052' }}>✓</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {preview.length > 40 ? (
                  <p className="text-[10px] text-center mt-2" style={{ color: 'var(--text-muted)' }}>
                    …و{preview.length - 40} صف آخر
                  </p>
                ) : null}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleApply}
                  disabled={applyTargetBatchId == null || applying}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-50 transition active:scale-95"
                  style={{
                    background: 'linear-gradient(135deg, #356B6E, #244A4C)',
                    boxShadow: '0 2px 10px rgba(53,107,110,0.35)',
                  }}
                >
                  <ArrowRight className="w-4 h-4" />
                  {applying ? 'جاري الإنشاء...' : 'تطبيق (إنشاء كمسودة)'}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
