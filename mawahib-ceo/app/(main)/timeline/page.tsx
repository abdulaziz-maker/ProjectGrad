'use client'
/**
 * /timeline — Executive Schedule dashboard (Phase 3 — live grid).
 *
 * Layout:
 *   ├─ header + permission banner + active calendar banner
 *   ├─ batch tabs + current batch summary
 *   ├─ TimelineControls (zoom / view / Gregorian toggle / filters / export)
 *   ├─ TimelineGrid (12×30 interactive grid)
 *   └─ ActivityEditModal (add/edit/delete)
 *
 * Gated behind NEXT_PUBLIC_TIMELINE_ENABLED.
 */
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { TIMELINE_ENABLED } from '@/lib/timeline/flag'
import {
  getActivityTypes,
  getBatchesForTimeline,
  getActivities,
  getActiveCalendar,
  getDays,
  moveActivity as dbMoveActivity,
  type TimelineBatchRef,
} from '@/lib/timeline/db'
import type {
  TimelineActivityType,
  TimelineActivity,
  TimelineCalendar,
  TimelineDay,
  TimelineActivityStatus,
} from '@/types/timeline'
import { useAuth } from '@/contexts/AuthContext'
import BatchTabs from '@/components/timeline/BatchTabs'
import TimelineGrid from '@/components/timeline/TimelineGrid'
import TimelineControls, {
  type ZoomLevel,
} from '@/components/timeline/TimelineControls'
import ActivityEditModal from '@/components/timeline/ActivityEditModal'
import {
  buildDayMap,
  type TimelineViewMode,
} from '@/lib/timeline/activity-helpers'
import {
  Calendar,
  Sparkles,
  ShieldAlert,
  Lock,
  Layers,
  Upload,
  AlertTriangle,
  Plus,
  DollarSign,
  Tag,
  Clock,
  Copy,
} from 'lucide-react'
import { hijriYearLength } from '@/lib/timeline/hijri'

export default function TimelinePage() {
  const router = useRouter()
  const { profile, loading: authLoading } = useAuth()
  const role = profile?.role ?? null
  const userId = profile?.id ?? null
  const isCrossBatch = role === 'ceo' || role === 'records_officer'
  const myBatchId = profile?.batch_id ?? null

  const [batches, setBatches] = useState<TimelineBatchRef[]>([])
  const [activityTypes, setActivityTypes] = useState<TimelineActivityType[]>([])
  const [activities, setActivities] = useState<TimelineActivity[]>([])
  const [activeCalendar, setActiveCalendar] =
    useState<TimelineCalendar | null>(null)
  const [calendarDays, setCalendarDays] = useState<TimelineDay[]>([])
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [activitiesLoading, setActivitiesLoading] = useState(false)
  const [, startTransition] = useTransition()

  // Grid controls
  const [zoom, setZoom] = useState<ZoomLevel>(100)
  const [view, setView] = useState<TimelineViewMode>('year')
  const [focusMonth, setFocusMonth] = useState(1)
  const [showGregorian, setShowGregorian] = useState(true)

  // Filters
  const [selectedTypeIds, setSelectedTypeIds] = useState<string[]>([])
  const [selectedStatuses, setSelectedStatuses] = useState<
    TimelineActivityStatus[]
  >([])

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [editingActivity, setEditingActivity] =
    useState<TimelineActivity | null>(null)
  const [defaultStartIso, setDefaultStartIso] = useState<string | null>(null)

  // Feature flag gate
  useEffect(() => {
    if (!TIMELINE_ENABLED) router.replace('/dashboard')
  }, [router])

  // Initial load
  useEffect(() => {
    if (!TIMELINE_ENABLED || authLoading) return
    let alive = true
    ;(async () => {
      try {
        const [b, t, ac] = await Promise.all([
          getBatchesForTimeline(),
          getActivityTypes(),
          getActiveCalendar(),
        ])
        if (!alive) return

        const visibleBatches =
          !isCrossBatch && myBatchId != null
            ? b.filter((x) => x.id === myBatchId)
            : b

        setBatches(visibleBatches)
        setActivityTypes(t)
        setActiveCalendar(ac)

        const initial =
          !isCrossBatch && myBatchId != null
            ? myBatchId
            : visibleBatches[0]?.id ?? null
        setSelectedBatchId(initial)

        // Load calendar days if active calendar present
        if (ac) {
          const d = await getDays(ac.id)
          if (alive) setCalendarDays(d)
        }
      } catch (err) {
        console.error(err)
        toast.error('حدث خطأ أثناء تحميل بيانات الخطة الزمنية')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [authLoading, isCrossBatch, myBatchId])

  // Fetch activities when batch or calendar changes
  useEffect(() => {
    if (!TIMELINE_ENABLED || selectedBatchId == null || !activeCalendar) {
      setActivities([])
      return
    }
    let alive = true
    setActivitiesLoading(true)
    ;(async () => {
      try {
        const data = await getActivities({
          batchId: selectedBatchId,
          calendarId: activeCalendar.id,
        })
        if (alive) setActivities(data)
      } catch (err) {
        console.error(err)
        if (alive) toast.error('تعذّر تحميل أنشطة الدفعة')
      } finally {
        if (alive) setActivitiesLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [selectedBatchId, activeCalendar])

  const currentBatch = useMemo(
    () => batches.find((b) => b.id === selectedBatchId) ?? null,
    [batches, selectedBatchId],
  )

  const canEditCurrentBatch = useMemo(() => {
    if (!profile) return false
    if (isCrossBatch) return true
    if (
      ['batch_manager', 'teacher'].includes(role ?? '') &&
      selectedBatchId === myBatchId
    )
      return true
    return false
  }, [profile, role, isCrossBatch, selectedBatchId, myBatchId])

  const daysMap = useMemo(() => buildDayMap(calendarDays), [calendarDays])

  // Filter activities by active filters
  const filteredActivities = useMemo(() => {
    let out = activities
    if (selectedTypeIds.length > 0) {
      const s = new Set(selectedTypeIds)
      out = out.filter(
        (a) => a.activity_type_id !== null && s.has(a.activity_type_id),
      )
    }
    if (selectedStatuses.length > 0) {
      const s = new Set(selectedStatuses)
      out = out.filter((a) => s.has(a.status))
    }
    return out
  }, [activities, selectedTypeIds, selectedStatuses])

  // ── Grid event handlers
  const handleDayClick = useCallback(
    (iso: string) => {
      if (!canEditCurrentBatch) return
      setEditingActivity(null)
      setDefaultStartIso(iso)
      setModalOpen(true)
    },
    [canEditCurrentBatch],
  )

  const handleActivityEdit = useCallback((a: TimelineActivity) => {
    setEditingActivity(a)
    setDefaultStartIso(null)
    setModalOpen(true)
  }, [])

  const handleActivityMove = useCallback(
    async (id: string, newStartIso: string, newEndIso: string) => {
      // Optimistic update
      setActivities((prev) =>
        prev.map((a) =>
          a.id === id
            ? { ...a, start_date: newStartIso, end_date: newEndIso }
            : a,
        ),
      )
      try {
        await dbMoveActivity(id, newStartIso, newEndIso)
        toast.success('تم نقل النشاط')
      } catch (err) {
        console.error(err)
        toast.error('تعذّر النقل — تم التراجع')
        // Reload to revert
        if (selectedBatchId != null && activeCalendar) {
          const fresh = await getActivities({
            batchId: selectedBatchId,
            calendarId: activeCalendar.id,
          })
          setActivities(fresh)
        }
      }
    },
    [selectedBatchId, activeCalendar],
  )

  const handleActivitySaved = useCallback((saved: TimelineActivity) => {
    setActivities((prev) => {
      const idx = prev.findIndex((a) => a.id === saved.id)
      if (idx === -1) return [...prev, saved]
      const next = prev.slice()
      next[idx] = saved
      return next
    })
  }, [])

  const handleActivityDeleted = useCallback((id: string) => {
    setActivities((prev) => prev.filter((a) => a.id !== id))
  }, [])

  const handlePrint = useCallback(() => {
    window.print()
  }, [])

  // Open blank-create shortcut
  const handleAddActivityClick = useCallback(() => {
    if (!canEditCurrentBatch) return
    if (!activeCalendar) {
      toast.error('لا يوجد تقويم نشط — استورد تقويماً أولاً')
      return
    }
    if (calendarDays.length === 0) return
    setEditingActivity(null)
    const firstStudy =
      calendarDays.find((d) => d.day_type === 'study')?.hijri_date ??
      calendarDays[0].hijri_date
    setDefaultStartIso(firstStudy)
    setModalOpen(true)
  }, [canEditCurrentBatch, activeCalendar, calendarDays])

  // ── Render
  if (!TIMELINE_ENABLED || authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-[#C08A48] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            جاري تحميل الخطة الزمنية...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1
            className="text-2xl font-bold flex items-center gap-2"
            style={{ color: 'var(--text-primary)' }}
          >
            <Calendar className="w-6 h-6" style={{ color: '#C08A48' }} />
            الخطة الزمنية
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            شبكة سنوية هجرية تفاعلية — أضف الأنشطة، اسحبها، وعدّلها.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isCrossBatch ? (
            <>
              <Link
                href="/timeline/approvals"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition hover:bg-white/5"
                style={{
                  borderColor: 'rgba(185,72,56,0.45)',
                  color: '#8B2F23',
                  background: 'rgba(185,72,56,0.04)',
                }}
              >
                <Clock className="w-3.5 h-3.5" />
                الاعتمادات
              </Link>
              <Link
                href="/timeline/master"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition hover:bg-white/5"
                style={{
                  borderColor: 'rgba(192,138,72,0.45)',
                  color: '#4F46E5',
                  background: 'rgba(192,138,72,0.04)',
                }}
              >
                <Layers className="w-3.5 h-3.5" />
                العرض الموحَّد
              </Link>
              <Link
                href="/timeline/clone"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition hover:bg-white/5"
                style={{
                  borderColor: 'rgba(148,163,184,0.45)',
                  color: '#475569',
                  background: 'rgba(148,163,184,0.04)',
                }}
              >
                <Copy className="w-3.5 h-3.5" />
                القوالب
              </Link>
            </>
          ) : null}
          <Link
            href="/timeline/finance"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition hover:bg-white/5"
            style={{
              borderColor: 'rgba(53,107,110,0.45)',
              color: '#235052',
              background: 'rgba(53,107,110,0.04)',
            }}
          >
            <DollarSign className="w-3.5 h-3.5" />
            الميزانية
          </Link>
          <Link
            href="/timeline/activity-types"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition hover:bg-white/5"
            style={{
              borderColor: 'rgba(192,138,72,0.45)',
              color: '#7A4E1E',
              background: 'rgba(192,138,72,0.04)',
            }}
          >
            <Tag className="w-3.5 h-3.5" />
            الأنواع
          </Link>
          <div
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold"
            style={{
              background: 'rgba(53,107,110,0.08)',
              border: '1px solid rgba(53,107,110,0.30)',
              color: '#235052',
            }}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Phase 5 — workflow + استنساخ
          </div>
          {canEditCurrentBatch && activeCalendar ? (
            <button
              type="button"
              onClick={handleAddActivityClick}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-white transition active:scale-95"
              style={{
                background: 'linear-gradient(135deg, #C08A48, #9A6A2E)',
                boxShadow: '0 2px 10px rgba(192,138,72,0.35)',
              }}
            >
              <Plus className="w-4 h-4" />
              نشاط جديد
            </button>
          ) : null}
        </div>
      </div>

      {/* Permission banner */}
      <div
        className="rounded-xl p-2.5 flex items-center gap-2 text-xs"
        style={{
          background: isCrossBatch
            ? 'rgba(53,107,110,0.06)'
            : 'rgba(192,138,72,0.05)',
          border: `1px solid ${isCrossBatch ? 'rgba(53,107,110,0.25)' : 'rgba(192,138,72,0.25)'}`,
          color: 'var(--text-secondary)',
        }}
      >
        {isCrossBatch ? (
          <>
            <ShieldAlert className="w-4 h-4" style={{ color: '#356B6E' }} />
            <span>
              صلاحيتك: <b>كامل على جميع الدفعات</b> — أضف، عدّل، اسحب، احذف.
            </span>
          </>
        ) : role === 'batch_manager' ? (
          <>
            <Layers className="w-4 h-4" style={{ color: '#C08A48' }} />
            <span>
              صلاحيتك: إدارة خطة <b>دفعتك فقط</b>.
            </span>
          </>
        ) : (
          <>
            <Lock className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
            <span>
              صلاحيتك: <b>قراءة فقط</b> لخطة دفعتك.
            </span>
          </>
        )}
      </div>

      {/* Active calendar banner */}
      {activeCalendar ? (
        <div
          className="rounded-xl p-2.5 flex items-center justify-between gap-3 flex-wrap"
          style={{
            background: 'rgba(53,107,110,0.06)',
            border: '1px solid rgba(53,107,110,0.25)',
          }}
        >
          <div
            className="flex items-center gap-2 text-xs"
            style={{ color: '#235052' }}
          >
            <Calendar className="w-4 h-4" />
            <span>
              التقويم النشط: <b>{activeCalendar.name}</b>{' '}
              <span className="font-mono opacity-75">
                ({activeCalendar.hijri_year}هـ —{' '}
                {hijriYearLength(activeCalendar.hijri_year)} يوم)
              </span>
            </span>
          </div>
          <Link
            href="/timeline/calendar"
            className="text-xs font-semibold hover:underline"
            style={{ color: '#356B6E' }}
          >
            إدارة التقاويم ←
          </Link>
        </div>
      ) : (
        <div
          className="rounded-xl p-3 flex items-center justify-between gap-3 flex-wrap"
          style={{
            background: 'rgba(192,138,72,0.08)',
            border: '1px solid rgba(192,138,72,0.35)',
          }}
        >
          <div
            className="flex items-center gap-2 text-xs"
            style={{ color: '#7A4E1E' }}
          >
            <AlertTriangle className="w-4 h-4" />
            <span>لا يوجد تقويم نشط — استورد تقويماً أكاديمياً أولاً.</span>
          </div>
          {isCrossBatch ? (
            <Link
              href="/timeline/calendar/import"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white"
              style={{
                background: 'linear-gradient(135deg, #C08A48, #9A6A2E)',
                boxShadow: '0 2px 8px rgba(192,138,72,0.35)',
              }}
            >
              <Upload className="w-3.5 h-3.5" />
              استيراد تقويم
            </Link>
          ) : null}
        </div>
      )}

      {/* Batch tabs */}
      <BatchTabs
        batches={batches}
        selectedBatchId={selectedBatchId}
        onSelect={(id) => startTransition(() => setSelectedBatchId(id))}
        locked={!isCrossBatch}
      />

      {/* Current batch summary */}
      {currentBatch ? (
        <div className="card-static p-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                الدفعة المختارة
              </p>
              <h2
                className="text-lg font-bold"
                style={{ color: 'var(--text-primary)' }}
              >
                {currentBatch.name}
              </h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                المدير:{' '}
                <span style={{ color: 'var(--text-secondary)' }}>
                  {currentBatch.manager_name ?? '—'}
                </span>
                <span className="mx-2">•</span>
                الطلاب:{' '}
                <span
                  className="font-mono"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {currentBatch.student_count ?? '—'}
                </span>
              </p>
            </div>
            <div className="text-left">
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                الأنشطة المعروضة
              </p>
              <p
                className="text-2xl font-bold font-mono"
                style={{ color: '#C08A48' }}
              >
                {filteredActivities.length}
                {filteredActivities.length !== activities.length ? (
                  <span
                    className="text-xs font-semibold mr-1"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    / {activities.length}
                  </span>
                ) : null}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {/* Grid + Controls */}
      {activeCalendar ? (
        <div className="space-y-3">
          <TimelineControls
            zoom={zoom}
            setZoom={setZoom}
            view={view}
            setView={setView}
            focusMonth={focusMonth}
            setFocusMonth={setFocusMonth}
            showGregorian={showGregorian}
            setShowGregorian={setShowGregorian}
            allTypes={activityTypes}
            selectedTypeIds={selectedTypeIds}
            setSelectedTypeIds={(ids) =>
              startTransition(() => setSelectedTypeIds(ids))
            }
            selectedStatuses={selectedStatuses}
            setSelectedStatuses={(s) =>
              startTransition(() => setSelectedStatuses(s))
            }
            onPrint={handlePrint}
          />

          {activitiesLoading ? (
            <div
              className="rounded-2xl p-8 text-center text-xs"
              style={{ color: 'var(--text-muted)' }}
            >
              جاري تحميل أنشطة الدفعة...
            </div>
          ) : (
            <TimelineGrid
              hijriYear={activeCalendar.hijri_year}
              days={calendarDays}
              activities={filteredActivities}
              activityTypes={activityTypes}
              zoom={zoom}
              view={view}
              focusMonth={focusMonth}
              showGregorian={showGregorian}
              canEdit={canEditCurrentBatch}
              onDayClick={handleDayClick}
              onActivityEdit={handleActivityEdit}
              onActivityMove={handleActivityMove}
            />
          )}

          <p
            className="text-[11px] text-center"
            style={{ color: 'var(--text-muted)' }}
          >
            {canEditCurrentBatch
              ? 'اضغط على يوم فارغ لإضافة نشاط • اضغط على نشاط للتعديل • اسحب نشاطاً لتغيير تاريخه'
              : 'مرّر فوق يوم لعرض التفاصيل'}
          </p>
        </div>
      ) : null}

      {/* Activity edit modal */}
      {activeCalendar && selectedBatchId != null ? (
        <ActivityEditModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          activity={editingActivity}
          onSaved={handleActivitySaved}
          onDeleted={handleActivityDeleted}
          activityTypes={activityTypes}
          daysMap={daysMap}
          hijriYear={activeCalendar.hijri_year}
          batchId={selectedBatchId}
          calendarId={activeCalendar.id}
          studentCount={currentBatch?.student_count ?? 0}
          defaultStartIso={defaultStartIso}
          canEdit={canEditCurrentBatch}
          canApprove={isCrossBatch}
          userId={userId}
        />
      ) : null}
    </div>
  )
}
