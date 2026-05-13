'use client'
/**
 * /admin/activity — صفحة "آخر نشاط" (super_admin فقط).
 *
 * Client component متّسق مع باقي صفحات المشروع.
 * يجلب البيانات من /api/admin/activity/snapshot كل 60s + زر refresh يدوي.
 */
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import {
  Activity, Users, BarChart3, Zap, ArrowUpRight, ArrowDownRight, Minus,
  RefreshCw, Loader2, Eye, EyeOff, GraduationCap, Clock,
} from 'lucide-react'

// ─── types ──────────────────────────────────────────────────
interface OnlineUser {
  user_id: string
  name: string
  role: string | null
  batch_id: number | null
  tenant_id: number | null
  last_activity: string
  page_path: string
}
interface TodayStats {
  unique_users_today: number
  total_sessions_today: number
  unique_users_yesterday: number
  total_sessions_yesterday: number
  delta_users_pct: number | null
  delta_sessions_pct: number | null
}
interface ConcurrentStats { max_today: number; max_30d: number }
interface Snapshot {
  online: OnlineUser[]
  today: TodayStats
  concurrent: ConcurrentStats
  generated_at: string
}

// ─── helpers ────────────────────────────────────────────────
function timeAgoAr(iso: string): string {
  const diff = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (diff < 60)    return 'الآن'
  if (diff < 3600)  return `قبل ${Math.floor(diff / 60)} د`
  if (diff < 86400) return `قبل ${Math.floor(diff / 3600)} س`
  return `قبل ${Math.floor(diff / 86400)} يوم`
}
function roleLabelAr(role: string | null): string {
  switch (role) {
    case 'ceo':             return 'مدير تنفيذي'
    case 'batch_manager':   return 'مدير دفعة'
    case 'supervisor':      return 'مشرف'
    case 'teacher':         return 'معلم'
    case 'records_officer': return 'موظف سجلات'
    default:                return role ?? '—'
  }
}
function formatPct(p: number | null) {
  if (p === null) return { sign: '+' as const, value: 'جديد', Icon: ArrowUpRight, color: '#5A8F67' }
  if (p === 0)    return { sign: ''  as const, value: '0%',   Icon: Minus,        color: 'var(--text-muted)' }
  const abs = Math.abs(p).toFixed(0)
  if (p > 0) return { sign: '+' as const, value: `${abs}%`, Icon: ArrowUpRight,   color: '#5A8F67' }
  return       { sign: '-' as const, value: `${abs}%`, Icon: ArrowDownRight, color: '#B94838' }
}

export default function ActivityPage() {
  const router = useRouter()
  const { profile, loading: authLoading } = useAuth()
  const [snap, setSnap]         = useState<Snapshot | null>(null)
  const [loading, setLoading]   = useState(true)
  const [refreshing, setRef]    = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [showHalqa, setShowHalqa] = useState(true)

  // حماية: super_admin فقط
  useEffect(() => {
    if (authLoading) return
    if (!profile) return
    if (!profile.is_super_admin) router.replace('/dashboard')
  }, [profile, authLoading, router])

  const fetchSnapshot = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch('/api/admin/activity/snapshot', { cache: 'no-store', signal })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const data = (await res.json()) as Snapshot
      setSnap(data)
      setError(null)
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'فشل التحميل')
    } finally {
      setLoading(false)
      setRef(false)
    }
  }, [])

  // أول جلب + auto-refresh كل 60s
  useEffect(() => {
    if (authLoading || !profile?.is_super_admin) return
    const ctrl = new AbortController()
    fetchSnapshot(ctrl.signal)
    const id = setInterval(() => { fetchSnapshot() }, 60_000)
    return () => { ctrl.abort(); clearInterval(id) }
  }, [authLoading, profile?.is_super_admin, fetchSnapshot])

  const handleRefresh = () => { setRef(true); fetchSnapshot() }

  // حالات الواجهة
  if (authLoading || (loading && !snap)) {
    return (
      <div className="p-6 text-center" style={{ color: 'var(--text-muted)' }}>
        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
        جارٍ التحميل…
      </div>
    )
  }
  if (!profile?.is_super_admin) return null
  if (error && !snap) {
    return (
      <div className="card-static p-6 text-center max-w-md mx-auto">
        <p className="text-sm font-bold mb-2" style={{ color: '#B94838' }}>تعذّر التحميل</p>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{error}</p>
        <button onClick={handleRefresh} className="mt-3 text-xs px-3 py-1.5 rounded-lg border" style={{ borderColor: 'var(--border-color)' }}>
          إعادة المحاولة
        </button>
      </div>
    )
  }
  if (!snap) return null

  const { online, today, concurrent } = snap
  const deltaU = formatPct(today.delta_users_pct)
  const deltaS = formatPct(today.delta_sessions_pct)

  return (
    <div className="space-y-5 animate-fade-in-up">

      {/* Header */}
      <header className="flex items-start justify-between flex-wrap gap-3">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold mb-2"
            style={{ background: 'rgba(53,107,110,0.10)', color: '#235052' }}>
            <Activity className="w-3 h-3" />
            <span>SUPER ADMIN</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            آخر نشاط في الموقع
          </h1>
          <p className="text-xs sm:text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            تتبّع المستخدمين النشطين والجلسات اليومية والذروة.
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition active:scale-95 disabled:opacity-50"
          style={{ background: 'rgba(53,107,110,0.10)', color: '#235052', border: '1px solid rgba(53,107,110,0.35)' }}
        >
          {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {refreshing ? 'يحدّث…' : 'إعادة التحميل'}
        </button>
      </header>

      {/* بطاقتا الإحصائيات */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">

        {/* نشاط اليوم */}
        <section className="rounded-2xl p-4 sm:p-5"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-soft)' }}>
          <header className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(192,138,72,0.12)' }}>
              <Users className="w-4 h-4" style={{ color: '#8B5A1E' }} />
            </div>
            <h2 className="font-bold text-sm sm:text-base" style={{ color: 'var(--text-primary)' }}>
              نشاط اليوم
            </h2>
          </header>
          <div className="grid grid-cols-2 gap-3">
            <Metric Icon={Users}     label="مستخدم فريد"   value={today.unique_users_today}   delta={deltaU} hint={`الأمس: ${today.unique_users_yesterday}`} />
            <Metric Icon={BarChart3} label="إجمالي الجلسات" value={today.total_sessions_today} delta={deltaS} hint={`الأمس: ${today.total_sessions_yesterday}`} />
          </div>
        </section>

        {/* أعلى المتزامنين */}
        <section className="rounded-2xl p-4 sm:p-5"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-soft)' }}>
          <header className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(91,33,182,0.10)' }}>
              <Zap className="w-4 h-4" style={{ color: '#5B21B6' }} />
            </div>
            <h2 className="font-bold text-sm sm:text-base" style={{ color: 'var(--text-primary)' }}>
              أعلى متصلين متزامنين
            </h2>
          </header>
          <div className="grid grid-cols-2 gap-3">
            <BigNumber label="اليوم"     value={concurrent.max_today} accent="#5B21B6" />
            <BigNumber label="آخر ٣٠ يوم" value={concurrent.max_30d}   accent="#235052" />
          </div>
          <p className="text-[10px] mt-3 pt-3" style={{ color: 'var(--text-muted)', borderTop: '1px solid var(--border-faint)' }}>
            يُحسب على نوافذ زمنية مدتها ٥ دقائق.
          </p>
        </section>
      </div>

      {/* آخر المتصلين */}
      <section className="rounded-2xl p-4 sm:p-5"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-soft)' }}>
        <header className="flex items-center justify-between gap-3 mb-3 sm:mb-4">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#5A8F67' }} />
            <h2 className="font-bold text-sm sm:text-base truncate" style={{ color: 'var(--text-primary)' }}>
              آخر المتصلين <span className="font-mono text-xs opacity-70">({online.length})</span>
            </h2>
          </div>
          <button
            onClick={() => setShowHalqa(v => !v)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition active:scale-95 shrink-0"
            style={{
              background: showHalqa ? 'rgba(192,138,72,0.12)' : 'var(--bg-elevated)',
              color: showHalqa ? '#8B5A1E' : 'var(--text-muted)',
              border: '1px solid var(--border-soft)',
            }}>
            {showHalqa ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            {showHalqa ? 'إخفاء الحلقة' : 'إظهار الحلقة'}
          </button>
        </header>

        {online.length === 0 ? (
          <p className="text-center text-xs py-8" style={{ color: 'var(--text-muted)' }}>
            لا توجد جلسات نشطة في آخر ٢٤ ساعة.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {online.map((u, i) => (
              <li key={u.user_id} className="flex items-center gap-3 px-3 py-2 rounded-xl"
                style={{
                  background: i % 2 === 0 ? 'var(--bg-subtle)' : 'transparent',
                  border: '1px solid var(--border-faint)',
                }}>
                <span className="font-mono text-[10px] w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(53,107,110,0.10)', color: '#235052' }}>
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                    {u.name}
                  </p>
                  {showHalqa && (
                    <p className="text-[10.5px] flex items-center gap-1.5 mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      <GraduationCap className="w-3 h-3 shrink-0" />
                      <span>{roleLabelAr(u.role)}</span>
                      {u.batch_id != null && (
                        <>
                          <span className="opacity-50">·</span>
                          <span className="font-mono">دفعة {u.batch_id}</span>
                        </>
                      )}
                    </p>
                  )}
                </div>
                <span className="inline-flex items-center gap-1 text-[10.5px] font-bold shrink-0"
                  style={{ color: 'var(--text-muted)' }} title={u.page_path}>
                  <Clock className="w-3 h-3" />
                  {timeAgoAr(u.last_activity)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-[10px] text-center pt-2" style={{ color: 'var(--text-muted)' }}>
        آخر تحديث: <span className="font-mono">{new Date(snap.generated_at).toLocaleTimeString('ar-SA')}</span>
        {' · '}
        نشاط 30 يوم كاملة + ملخصات سنة. السجل الأقدم يُحذف تلقائياً.
      </p>
    </div>
  )
}

// ─── presentational ──────────────────────────────────────────
function Metric({ Icon, label, value, delta, hint }: {
  Icon: typeof Users
  label: string
  value: number
  delta: ReturnType<typeof formatPct>
  hint: string
}) {
  const DeltaIcon = delta.Icon
  return (
    <div className="rounded-xl p-3" style={{ background: 'var(--bg-subtle)' }}>
      <div className="flex items-center gap-1.5 mb-1.5" style={{ color: 'var(--text-muted)' }}>
        <Icon className="w-3 h-3" />
        <span className="text-[10.5px]">{label}</span>
      </div>
      <p className="text-2xl sm:text-3xl font-bold font-mono leading-none mb-1.5" style={{ color: 'var(--text-primary)' }}>
        {value}
      </p>
      <div className="flex items-center gap-1 text-[10px]">
        <DeltaIcon className="w-3 h-3" style={{ color: delta.color }} />
        <span className="font-mono font-bold" style={{ color: delta.color }}>
          {delta.sign}{delta.value}
        </span>
        <span className="opacity-60" style={{ color: 'var(--text-muted)' }}>· {hint}</span>
      </div>
    </div>
  )
}

function BigNumber({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="rounded-xl p-3 text-center" style={{ background: 'var(--bg-subtle)' }}>
      <p className="text-[10.5px] mb-1" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <p className="text-3xl sm:text-4xl font-bold font-mono leading-none" style={{ color: accent }}>
        {value}
      </p>
    </div>
  )
}
