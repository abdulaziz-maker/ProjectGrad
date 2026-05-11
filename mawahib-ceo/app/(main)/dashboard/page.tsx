'use client'
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  getDashboardStats, getDashboardBatches,
  type DashboardStats,
} from '@/lib/teacher-dashboard'
import { localDateIso } from '@/lib/date'
import { formatHijriWithDay } from '@/lib/hijri'
import {
  BookOpen, Users, CheckCircle2, Clock, AlertTriangle,
  ChevronLeft, RotateCw, Loader2, CalendarCheck,
  ClipboardList, TrendingUp, BookMarked, ArrowLeft, Sparkles,
} from 'lucide-react'
import type { DBBatch } from '@/lib/db'

// ─── Helpers ─────────────────────────────────────────────────────
function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'صباح الخير'
  if (h < 17) return 'طاب مساؤك'
  return 'مساء النور'
}
function toAr(n: number): string { return n.toLocaleString('ar-EG') }

// ─── Main ─────────────────────────────────────────────────────────
export default function TeacherDashboardPage() {
  const { profile, loading: authLoading } = useAuth()
  const router = useRouter()

  const today = localDateIso(new Date())
  const isCeo = profile?.role === 'ceo' || profile?.role === 'records_officer'
  const isBatchManager = profile?.role === 'batch_manager'

  // قاعدة التوجيه: CEO → /admin/dashboard، مدير الدفعة → /manager/dashboard
  useEffect(() => {
    if (authLoading || !profile) return
    if (profile.role === 'ceo' || profile.role === 'records_officer') {
      router.replace('/admin/dashboard')
    } else if (profile.role === 'batch_manager') {
      router.replace('/manager/dashboard')
    }
  }, [profile, authLoading, router])

  // Batch selector (CEO فقط — يبقى للأمان حتى redirect)
  const [batches, setBatches]       = useState<DBBatch[]>([])
  const [selectedBatch, setSelectedBatch] = useState<number | null>(null)

  const [stats, setStats]     = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const activeBatchId = isCeo ? selectedBatch : (profile?.batch_id ?? null)

  useEffect(() => {
    if (!isCeo || authLoading) return
    getDashboardBatches().then(bs => {
      setBatches(bs)
      if (bs.length > 0) setSelectedBatch(bs[0].id)
    })
  }, [isCeo, authLoading])

  const fetchStats = useCallback(async (force = false) => {
    if (!activeBatchId) return
    if (force) setRefreshing(true)
    else setLoading(true)
    const s = await getDashboardStats(activeBatchId, today, force)
    setStats(s)
    setLoading(false)
    setRefreshing(false)
  }, [activeBatchId, today])

  useEffect(() => { fetchStats() }, [fetchStats])

  if (authLoading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--accent-warm)' }} />
    </div>
  )
  if (!profile) return null

  const todayHijri = formatHijriWithDay(today)
  const recordedPct = stats?.recordedPct ?? 0
  const pctColor =
    recordedPct >= 80 ? '#4ade80' :
    recordedPct >= 50 ? '#facc15' : '#f87171'

  const notRecordedList = stats?.notRecordedNames ?? []

  return (
    <div className="max-w-3xl mx-auto pb-10 space-y-4">

      {/* ─── الترحيب (مدمج وأنيق) ─── */}
      <header className="rounded-3xl p-5"
        style={{
          background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent-warm) 8%, var(--bg-card)), var(--bg-card))',
          border: '1px solid var(--border-soft)',
        }}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-bold mb-1" style={{ color: 'var(--accent-warm)' }}>
              {todayHijri}
            </p>
            <h1 className="text-lg sm:text-xl font-black truncate"
              style={{ color: 'var(--text-primary)' }}>
              {greeting()}، {profile.name?.split(' ')[0] || 'أستاذ'} 👋
            </h1>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              {stats && stats.totalStudents > 0
                ? `لديك ${toAr(stats.totalStudents)} طالب${stats.notRecordedToday > 0 ? ` · ${toAr(stats.notRecordedToday)} لم يُسجَّل لهم اليوم` : ' · اكتمل التسجيل ✓'}`
                : 'جارٍ التحميل...'}
            </p>
          </div>
          <button onClick={() => fetchStats(true)} disabled={refreshing}
            className="w-9 h-9 rounded-xl flex items-center justify-center disabled:opacity-40 active:scale-90 transition-all shrink-0"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-soft)' }}
            aria-label="تحديث">
            <RotateCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`}
              style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>
      </header>

      {/* ─── Batch Selector (CEO فقط — fallback قبل redirect) ─── */}
      {isCeo && batches.length > 0 && (
        <div className="rounded-2xl px-4 py-3"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-soft)' }}>
          <label className="text-[10px] font-bold block mb-2" style={{ color: 'var(--text-muted)' }}>
            اختر الدفعة
          </label>
          <div className="flex flex-wrap gap-2">
            {batches.map(b => (
              <button key={b.id} onClick={() => setSelectedBatch(b.id)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95"
                style={{
                  background: selectedBatch === b.id ? 'var(--accent-warm)' : 'var(--bg-card)',
                  color: selectedBatch === b.id ? '#fff' : 'var(--text-secondary)',
                  border: `1px solid ${selectedBatch === b.id ? 'var(--accent-warm)' : 'var(--border-soft)'}`,
                }}>
                {b.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ─── زر تسجيل اليوم — متوسط الحجم ─── */}
      <Link href="/quran-system/daily-records"
        className="group flex items-center justify-between gap-3 p-4 rounded-2xl transition-all active:scale-[0.98]"
        style={{
          background: 'linear-gradient(135deg, var(--accent-warm) 0%, color-mix(in srgb, var(--accent-warm) 70%, #000) 100%)',
          boxShadow: '0 8px 24px color-mix(in srgb, var(--accent-warm) 35%, transparent)',
        }}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(255,255,255,0.18)' }}>
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-white/70 text-[10px] font-bold mb-0.5">الآن</p>
            <p className="text-white text-base font-black truncate">تسجيل اليوم</p>
          </div>
        </div>
        <ArrowLeft className="w-5 h-5 text-white/80 group-hover:-translate-x-1 transition-transform shrink-0" />
      </Link>

      {/* ─── 4 stat cards مدمجة ─── */}
      {loading ? (
        <div className="grid grid-cols-2 gap-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-2xl h-24 animate-pulse"
              style={{ background: 'var(--bg-elevated)' }} />
          ))}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-2 gap-2.5">
          <CompactStat icon={Users}
            label="طلابي" value={stats.totalStudents}
            color="var(--accent-warm)" />
          <CompactStat icon={CheckCircle2}
            label="سُجِّل اليوم" value={`${toAr(stats.recordedPct)}%`}
            sub={`${toAr(stats.recordedToday)}/${toAr(stats.totalStudents)}`}
            color={pctColor} />
          <CompactStat icon={Clock}
            label="لم يُسجَّل" value={stats.notRecordedToday}
            color={stats.notRecordedToday === 0 ? '#4ade80' : '#f87171'}
            urgent={stats.notRecordedToday > 0} />
          <CompactStat icon={AlertTriangle}
            label="قريبو الاختبار" value={stats.nearExamCount}
            sub={stats.nearExamCount > 0 ? '≤ 4 أوجه' : 'لا أحد'}
            color={stats.nearExamCount > 0 ? '#facc15' : '#9ca3af'} />
        </div>
      ) : null}

      {/* ─── أولوياتك اليوم — قائمة من لم يُسجَّل لهم ─── */}
      {stats && notRecordedList.length > 0 && (
        <section className="rounded-2xl p-4"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-soft)' }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(248,113,113,0.1)' }}>
                <AlertTriangle className="w-4 h-4" style={{ color: '#f87171' }} />
              </div>
              <div>
                <h2 className="text-sm font-black" style={{ color: 'var(--text-primary)' }}>
                  أولوياتك اليوم
                </h2>
                <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  لم يُسجَّل لهم بعد · {toAr(notRecordedList.length)} طالب
                </p>
              </div>
            </div>
            <Link href="/quran-system/daily-records"
              className="text-xs font-bold px-3 py-1.5 rounded-lg"
              style={{ background: 'rgba(192,138,72,0.08)', color: 'var(--accent-warm)' }}>
              سجِّل الآن
            </Link>
          </div>
          <ul className="space-y-1.5">
            {notRecordedList.slice(0, 5).map((name, i) => (
              <li key={i} className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl"
                style={{ background: 'var(--bg-elevated)' }}>
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#f87171' }} />
                <span className="text-sm font-semibold truncate flex-1"
                  style={{ color: 'var(--text-primary)' }}>{name}</span>
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>لم يُسجَّل</span>
              </li>
            ))}
          </ul>
          {notRecordedList.length > 5 && (
            <p className="text-[11px] text-center mt-2.5" style={{ color: 'var(--text-muted)' }}>
              + {toAr(notRecordedList.length - 5)} طالب آخر
            </p>
          )}
        </section>
      )}

      {/* ─── حالة الإنجاز الكامل ─── */}
      {stats && stats.totalStudents > 0 && stats.notRecordedToday === 0 && (
        <section className="rounded-2xl p-5 text-center"
          style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.3)' }}>
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-2"
            style={{ background: 'rgba(74,222,128,0.15)' }}>
            <Sparkles className="w-6 h-6" style={{ color: '#4ade80' }} />
          </div>
          <p className="text-sm font-black" style={{ color: '#16a34a' }}>
            أحسنت! تم تسجيل جميع الطلاب اليوم
          </p>
          <p className="text-[11px] mt-1" style={{ color: 'var(--text-secondary)' }}>
            بارك الله في جهدك
          </p>
        </section>
      )}

      {/* ─── روابط سريعة 4 أعمدة ─── */}
      <section>
        <p className="text-[11px] font-bold mb-2 px-1" style={{ color: 'var(--text-muted)' }}>
          روابط سريعة
        </p>
        <div className="grid grid-cols-4 gap-2">
          <QuickLink href="/followups"         icon={ClipboardList} label="المتابعات"   color="#C08A48" />
          <QuickLink href="/quran-system/batch-progress" icon={TrendingUp} label="التقدم" color="#356B6E" />
          <QuickLink href="/exams"             icon={CalendarCheck} label="الاختبارات"  color="#5A8F67" />
          <QuickLink href="/quran-system/daily-records" icon={BookMarked} label="السجلات" color="#8B5A82" />
        </div>
      </section>

      {/* ─── رابط للوحة الكاملة (للـmanager/CEO قبل redirect) ─── */}
      {(isBatchManager || isCeo) && (
        <Link href={isCeo ? '/admin/dashboard' : '/manager/dashboard'}
          className="flex items-center justify-between px-4 py-3 rounded-2xl transition-all active:scale-[0.99]"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-soft)' }}>
          <span className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>
            {isCeo ? 'لوحة المدير التنفيذي الكاملة' : 'لوحة مدير الدفعة الكاملة'}
          </span>
          <ChevronLeft className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
        </Link>
      )}
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────
function CompactStat({
  icon: Icon, label, value, sub, color, urgent,
}: {
  icon: React.ElementType; label: string; value: string | number; sub?: string
  color: string; urgent?: boolean
}) {
  return (
    <div className="rounded-2xl p-3 transition-all"
      style={{
        background: urgent ? `${color}10` : 'var(--bg-card)',
        border: `1px solid ${urgent ? `${color}40` : 'var(--border-soft)'}`,
      }}>
      <div className="flex items-center gap-2 mb-1.5">
        <div className="w-6 h-6 rounded-lg flex items-center justify-center"
          style={{ background: `${color}18` }}>
          <Icon className="w-3.5 h-3.5" style={{ color }} />
        </div>
        <span className="text-[10px] font-bold" style={{ color }}>{label}</span>
      </div>
      <p className="text-2xl font-black leading-none tabular-nums"
        style={{ color: 'var(--text-primary)' }}>
        {typeof value === 'number' ? toAr(value) : value}
      </p>
      {sub && <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
    </div>
  )
}

function QuickLink({ href, icon: Icon, label, color }: {
  href: string; icon: React.ElementType; label: string; color: string
}) {
  return (
    <Link href={href}
      className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-2xl transition-all active:scale-95"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-soft)' }}>
      <div className="w-9 h-9 rounded-xl flex items-center justify-center"
        style={{ background: `${color}15` }}>
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <span className="text-[10px] font-bold text-center leading-tight"
        style={{ color: 'var(--text-secondary)' }}>{label}</span>
    </Link>
  )
}
