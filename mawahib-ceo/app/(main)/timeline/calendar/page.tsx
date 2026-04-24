'use client'
/**
 * /timeline/calendar — list every saved academic calendar.
 *
 * Shows: name, Hijri year, day count, active badge.
 * Actions (CEO + records_officer only):
 *   - Activate (single-active invariant)
 *   - Delete (cascade wipes days)
 *   - Link to import
 *
 * Viewing a calendar's heatmap happens on /timeline/calendar/[id] (Phase 3 scope).
 * For Phase 2, clicking a row expands an inline preview below it.
 */
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { TIMELINE_ENABLED } from '@/lib/timeline/flag'
import {
  getCalendars,
  getDays,
  setActiveCalendar,
  deleteCalendar,
} from '@/lib/timeline/db'
import { useAuth } from '@/contexts/AuthContext'
import {
  Calendar,
  Upload,
  CheckCircle2,
  Trash2,
  Eye,
  EyeOff,
  ChevronLeft,
  Loader2,
} from 'lucide-react'
import type { TimelineCalendar, TimelineDay } from '@/types/timeline'
import CalendarHeatmap from '@/components/timeline/CalendarHeatmap'
import DayEditPopover from '@/components/timeline/DayEditPopover'
import { hijriYearLength } from '@/lib/timeline/hijri'

export default function CalendarListPage() {
  const router = useRouter()
  const { profile, loading: authLoading } = useAuth()
  const role = profile?.role ?? null
  const canManage = role === 'ceo' || role === 'records_officer'

  const [calendars, setCalendars] = useState<TimelineCalendar[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [expandedDays, setExpandedDays] = useState<TimelineDay[]>([])
  const [expandedLoading, setExpandedLoading] = useState(false)
  const [actionBusyId, setActionBusyId] = useState<string | null>(null)
  const [editingDay, setEditingDay] = useState<TimelineDay | null>(null)

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
        const data = await getCalendars()
        if (alive) setCalendars(data)
      } catch (err) {
        console.error(err)
        toast.error('تعذّر تحميل قائمة التقاويم')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [authLoading])

  const loadExpandedDays = useCallback(async (calendarId: string) => {
    setExpandedLoading(true)
    try {
      const data = await getDays(calendarId)
      setExpandedDays(data)
    } catch (err) {
      console.error(err)
      toast.error('تعذّر تحميل أيام التقويم')
    } finally {
      setExpandedLoading(false)
    }
  }, [])

  const handleExpand = useCallback(
    (id: string) => {
      if (expandedId === id) {
        setExpandedId(null)
        setExpandedDays([])
        return
      }
      setExpandedId(id)
      loadExpandedDays(id)
    },
    [expandedId, loadExpandedDays],
  )

  const handleActivate = async (id: string) => {
    if (!canManage) return
    setActionBusyId(id)
    try {
      await setActiveCalendar(id)
      setCalendars((prev) =>
        prev.map((c) => ({ ...c, is_active: c.id === id })),
      )
      toast.success('تم تفعيل التقويم')
    } catch (err) {
      console.error(err)
      toast.error('تعذّر تفعيل التقويم')
    } finally {
      setActionBusyId(null)
    }
  }

  const handleDelete = async (id: string) => {
    if (!canManage) return
    if (!confirm('هل تريد حذف هذا التقويم؟ سيتم حذف كل أيامه معه.')) return
    setActionBusyId(id)
    try {
      await deleteCalendar(id)
      setCalendars((prev) => prev.filter((c) => c.id !== id))
      if (expandedId === id) {
        setExpandedId(null)
        setExpandedDays([])
      }
      toast.success('تم حذف التقويم')
    } catch (err) {
      console.error(err)
      toast.error('تعذّر حذف التقويم')
    } finally {
      setActionBusyId(null)
    }
  }

  const handleDaySaved = (updated: TimelineDay) => {
    setExpandedDays((prev) => prev.map((d) => (d.id === updated.id ? updated : d)))
  }

  if (!TIMELINE_ENABLED || authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin mx-auto" style={{ color: '#C08A48' }} />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            جاري تحميل التقاويم...
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
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/timeline"
              className="text-xs font-semibold inline-flex items-center gap-1 hover:underline"
              style={{ color: '#C08A48' }}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              رجوع للخطة الزمنية
            </Link>
          </div>
          <h1
            className="text-2xl font-bold flex items-center gap-2"
            style={{ color: 'var(--text-primary)' }}
          >
            <Calendar className="w-6 h-6" style={{ color: '#C08A48' }} />
            التقاويم الأكاديمية
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            الأولوية للتقويم الهجري. الميلادي مساند لعرض التواريخ فقط.
          </p>
        </div>
        {canManage && (
          <Link
            href="/timeline/calendar/import"
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white rounded-xl transition active:scale-95"
            style={{
              background: 'linear-gradient(135deg, #C08A48, #9A6A2E)',
              boxShadow: '0 2px 10px rgba(192,138,72,0.35)',
            }}
          >
            <Upload className="w-4 h-4" />
            استيراد تقويم جديد
          </Link>
        )}
      </div>

      {/* Empty state */}
      {calendars.length === 0 && (
        <div
          className="rounded-2xl p-8 text-center"
          style={{
            background: 'rgba(192,138,72,0.04)',
            border: '1px dashed rgba(192,138,72,0.35)',
          }}
        >
          <Calendar className="w-10 h-10 mx-auto mb-3 opacity-40" style={{ color: '#C08A48' }} />
          <p className="text-sm font-semibold" style={{ color: '#7A4E1E' }}>
            لا توجد تقاويم محفوظة بعد
          </p>
          {canManage ? (
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              ابدأ بـ <Link href="/timeline/calendar/import" className="underline font-semibold" style={{ color: '#C08A48' }}>استيراد تقويم</Link> من ملف CSV/Excel.
            </p>
          ) : (
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              لم يقم المدير التنفيذي باستيراد أي تقويم بعد.
            </p>
          )}
        </div>
      )}

      {/* Calendar rows */}
      <div className="space-y-3">
        {calendars.map((c) => {
          const expanded = expandedId === c.id
          const busy = actionBusyId === c.id
          const expected = hijriYearLength(c.hijri_year)
          return (
            <div
              key={c.id}
              className="card-static overflow-hidden"
              style={{
                borderColor: c.is_active ? 'rgba(53,107,110,0.45)' : undefined,
                background: c.is_active ? 'rgba(53,107,110,0.04)' : undefined,
              }}
            >
              <div className="p-4 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 flex-wrap">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{
                      background: c.is_active ? 'rgba(53,107,110,0.15)' : 'rgba(192,138,72,0.12)',
                      border: `1px solid ${c.is_active ? 'rgba(53,107,110,0.4)' : 'rgba(192,138,72,0.3)'}`,
                    }}
                  >
                    <Calendar className="w-5 h-5" style={{ color: c.is_active ? '#356B6E' : '#C08A48' }} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
                        {c.name}
                      </h3>
                      {c.is_active && (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold"
                          style={{
                            background: 'rgba(53,107,110,0.15)',
                            color: '#235052',
                            border: '1px solid rgba(53,107,110,0.4)',
                          }}
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          نشِط
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      <span className="font-mono font-semibold">{c.hijri_year}هـ</span>
                      <span className="mx-1.5">•</span>
                      ميلادي: <span className="font-mono">{c.gregorian_year_start}</span>
                      {c.gregorian_year_start !== c.gregorian_year_end && (
                        <> — <span className="font-mono">{c.gregorian_year_end}</span></>
                      )}
                      <span className="mx-1.5">•</span>
                      المتوقّع: <span className="font-mono">{expected}</span> يوم
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => handleExpand(c.id)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border transition hover:bg-white/5"
                    style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
                  >
                    {expanded ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {expanded ? 'إخفاء' : 'عرض'}
                  </button>
                  {canManage && !c.is_active && (
                    <button
                      type="button"
                      onClick={() => handleActivate(c.id)}
                      disabled={busy}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition active:scale-95 disabled:opacity-50"
                      style={{ background: 'linear-gradient(135deg, #356B6E, #244A4C)' }}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      تفعيل
                    </button>
                  )}
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => handleDelete(c.id)}
                      disabled={busy}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition disabled:opacity-50"
                      style={{
                        background: 'rgba(185,72,56,0.08)',
                        color: '#8B2F23',
                        border: '1px solid rgba(185,72,56,0.25)',
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      حذف
                    </button>
                  )}
                </div>
              </div>

              {/* Expanded heatmap */}
              {expanded && (
                <div className="border-t" style={{ borderColor: 'var(--border-soft)' }}>
                  <div className="p-4">
                    {expandedLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#C08A48' }} />
                      </div>
                    ) : (
                      <CalendarHeatmap
                        days={expandedDays}
                        hijriYear={c.hijri_year}
                        onDayClick={canManage ? setEditingDay : undefined}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Day edit modal */}
      <DayEditPopover
        day={editingDay}
        onClose={() => setEditingDay(null)}
        onSaved={handleDaySaved}
        canEdit={canManage}
      />
    </div>
  )
}
