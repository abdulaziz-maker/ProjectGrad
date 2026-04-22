'use client'
/**
 * /timeline — Executive Schedule dashboard.
 *
 * Phase 1: skeleton page that renders the batch selector + activity-type palette
 * so that permission flow can be verified for all 3 roles. Actual grid/calendar
 * UI arrives in Phase 4.
 *
 * Gated behind NEXT_PUBLIC_TIMELINE_ENABLED.
 */
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { TIMELINE_ENABLED } from '@/lib/timeline/flag'
import {
  getActivityTypes,
  getBatchesForTimeline,
  getActivities,
  getActiveCalendar,
  type TimelineBatchRef,
} from '@/lib/timeline/db'
import type {
  TimelineActivityType,
  TimelineActivity,
  TimelineCalendar,
} from '@/types/timeline'
import { useAuth } from '@/contexts/AuthContext'
import BatchTabs from '@/components/timeline/BatchTabs'
import {
  Calendar,
  Sparkles,
  ShieldAlert,
  Lock,
  Layers,
  Upload,
  AlertTriangle,
} from 'lucide-react'
import { toast } from 'sonner'
import { hijriYearLength } from '@/lib/timeline/hijri'

export default function TimelinePage() {
  const router = useRouter()
  const { profile, loading: authLoading } = useAuth()
  const role = profile?.role ?? null
  const isCrossBatch = role === 'ceo' || role === 'records_officer'
  const myBatchId = profile?.batch_id ?? null

  const [batches, setBatches] = useState<TimelineBatchRef[]>([])
  const [activityTypes, setActivityTypes] = useState<TimelineActivityType[]>([])
  const [activities, setActivities] = useState<TimelineActivity[]>([])
  const [activeCalendar, setActiveCalendarState] = useState<TimelineCalendar | null>(null)
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  // Feature flag gate — redirect if disabled.
  // Using router.replace avoids flash-of-404 for users who haven't enabled it.
  useEffect(() => {
    if (!TIMELINE_ENABLED) {
      router.replace('/dashboard')
    }
  }, [router])

  // Initial load — batches + activity types (role-agnostic; RLS gates activities).
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

        // Filter batches for non-cross-batch roles — UI-level guardrail in
        // addition to DB RLS on activities.
        const visibleBatches =
          !isCrossBatch && myBatchId != null ? b.filter((x) => x.id === myBatchId) : b

        setBatches(visibleBatches)
        setActivityTypes(t)
        setActiveCalendarState(ac)
        // Auto-select first batch (or user's own batch if locked).
        const initial =
          !isCrossBatch && myBatchId != null
            ? myBatchId
            : visibleBatches[0]?.id ?? null
        setSelectedBatchId(initial)
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

  // Fetch activities whenever the selected batch changes.
  useEffect(() => {
    if (!TIMELINE_ENABLED || selectedBatchId == null) {
      setActivities([])
      return
    }
    let alive = true
    ;(async () => {
      try {
        const data = await getActivities({ batchId: selectedBatchId })
        if (alive) setActivities(data)
      } catch (err) {
        console.error(err)
        if (alive) toast.error('تعذّر تحميل أنشطة الدفعة')
      }
    })()
    return () => {
      alive = false
    }
  }, [selectedBatchId])

  const currentBatch = useMemo(
    () => batches.find((b) => b.id === selectedBatchId) ?? null,
    [batches, selectedBatchId],
  )

  const canEditCurrentBatch = useMemo(() => {
    if (!profile) return false
    if (isCrossBatch) return true
    if (
      ['batch_manager', 'supervisor', 'teacher'].includes(role ?? '') &&
      selectedBatchId === myBatchId
    )
      return role !== 'supervisor' // supervisor read-only per spec
    return false
  }, [profile, role, isCrossBatch, selectedBatchId, myBatchId])

  if (!TIMELINE_ENABLED || authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            جاري تحميل الخطة الزمنية...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
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
            تخطيط الأنشطة السنوية وربطها بالتقويم الأكاديمي والميزانية
          </p>
        </div>
        <div
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold"
          style={{
            background: 'rgba(192,138,72,0.12)',
            border: '1px solid rgba(192,138,72,0.30)',
            color: '#7A4E1E',
          }}
        >
          <Sparkles className="w-3.5 h-3.5" />
          مرحلة البناء — Phase 1
        </div>
      </div>

      {/* Permission hint banner */}
      <div
        className="rounded-2xl p-3 flex items-center gap-2 text-xs"
        style={{
          background: isCrossBatch
            ? 'rgba(53,107,110,0.08)'
            : 'rgba(99,102,241,0.06)',
          border: `1px solid ${isCrossBatch ? 'rgba(53,107,110,0.30)' : 'rgba(99,102,241,0.25)'}`,
          color: 'var(--text-secondary)',
        }}
      >
        {isCrossBatch ? (
          <>
            <ShieldAlert className="w-4 h-4" style={{ color: '#356B6E' }} />
            <span>
              صلاحيتك: <b>كامل على جميع الدفعات</b> — ترى وتعدّل كل خطة.
            </span>
          </>
        ) : role === 'batch_manager' ? (
          <>
            <Layers className="w-4 h-4" style={{ color: '#6366f1' }} />
            <span>
              صلاحيتك: تعديل خطة <b>دفعتك فقط</b>.
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
          className="rounded-2xl p-3 flex items-center justify-between gap-3 flex-wrap"
          style={{
            background: 'rgba(53,107,110,0.06)',
            border: '1px solid rgba(53,107,110,0.25)',
          }}
        >
          <div className="flex items-center gap-2 text-xs" style={{ color: '#235052' }}>
            <Calendar className="w-4 h-4" />
            <span>
              التقويم النشط: <b>{activeCalendar.name}</b>{' '}
              <span className="font-mono opacity-75">
                ({activeCalendar.hijri_year}هـ — {hijriYearLength(activeCalendar.hijri_year)} يوم)
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
          className="rounded-2xl p-3 flex items-center justify-between gap-3 flex-wrap"
          style={{
            background: 'rgba(192,138,72,0.08)',
            border: '1px solid rgba(192,138,72,0.35)',
          }}
        >
          <div className="flex items-center gap-2 text-xs" style={{ color: '#7A4E1E' }}>
            <AlertTriangle className="w-4 h-4" />
            <span>
              لا يوجد تقويم نشط — ستحتاج تقويماً أكاديمياً قبل إنشاء الأنشطة.
            </span>
          </div>
          {isCrossBatch && (
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
          )}
        </div>
      )}

      {/* Batch tabs */}
      <BatchTabs
        batches={batches}
        selectedBatchId={selectedBatchId}
        onSelect={setSelectedBatchId}
        locked={!isCrossBatch}
      />

      {/* Current batch summary */}
      {currentBatch && (
        <div className="card-static p-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                الدفعة المختارة
              </p>
              <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                {currentBatch.name}
              </h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                المدير:{' '}
                <span style={{ color: 'var(--text-secondary)' }}>
                  {currentBatch.manager_name ?? '—'}
                </span>
                <span className="mx-2">•</span>
                عدد الطلاب:{' '}
                <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>
                  {currentBatch.student_count ?? '—'}
                </span>
              </p>
            </div>
            <div className="text-left">
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                عدد الأنشطة المخططة
              </p>
              <p
                className="text-2xl font-bold font-mono"
                style={{ color: '#C08A48' }}
              >
                {activities.length}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Activity types palette — read-only reference */}
      <div className="card-static p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3
            className="font-bold text-sm flex items-center gap-2"
            style={{ color: 'var(--text-primary)' }}
          >
            <Sparkles className="w-4 h-4" style={{ color: '#C08A48' }} />
            أنواع الأنشطة المتاحة ({activityTypes.length})
          </h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {activityTypes.map((t) => (
            <div
              key={t.id}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold"
              style={{
                background: `${t.default_color}18`,
                border: `1px solid ${t.default_color}55`,
                color: t.default_color,
              }}
              title={`${t.cost_model} — ${t.arabic_name}`}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: t.default_color }}
              />
              {t.arabic_name}
            </div>
          ))}
        </div>
      </div>

      {/* Phase-2 placeholder */}
      <div
        className="rounded-2xl p-6 text-center"
        style={{
          background: 'rgba(192,138,72,0.04)',
          border: '1px dashed rgba(192,138,72,0.35)',
        }}
      >
        <Calendar
          className="w-10 h-10 mx-auto mb-3 opacity-40"
          style={{ color: '#C08A48' }}
        />
        <p className="text-sm font-semibold" style={{ color: '#7A4E1E' }}>
          شبكة التقويم الزمنية قادمة في المرحلة الرابعة
        </p>
        <p
          className="text-xs mt-1"
          style={{ color: 'var(--text-muted)' }}
        >
          {canEditCurrentBatch
            ? 'ستتمكن من إضافة وتعديل الأنشطة في هذه الشاشة قريباً.'
            : 'ستتمكن من مطالعة خطة دفعتك بالتفصيل قريباً.'}
        </p>
      </div>
    </div>
  )
}
