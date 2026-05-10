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
import WisdomCard from '@/components/ui/WisdomCard'
import {
  BookOpen, Users, CheckCircle2, Clock, AlertTriangle,
  ChevronLeft, RotateCw, Loader2, CalendarCheck,
  ClipboardList, TrendingUp, BookMarked,
} from 'lucide-react'
import type { DBBatch } from '@/lib/db'

// ─── Helper ──────────────────────────────────────────────────────
function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'صباح الخير'
  if (h < 17) return 'طاب مساؤك'
  return 'مساء النور'
}

function toAr(n: number): string {
  return n.toLocaleString('ar-EG')
}

// ─── StatCard ─────────────────────────────────────────────────────
function StatCard({
  label, value, sub, icon: Icon, color, bg,
}: {
  label: string; value: string | number; sub?: string
  icon: React.ElementType; color: string; bg: string
}) {
  return (
    <div className="rounded-2xl p-4 flex flex-col gap-2"
      style={{ background: bg, border: `1px solid ${color}25` }}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold" style={{ color }}>{label}</span>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background: `${color}18` }}>
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
      </div>
      <p className="text-3xl font-black leading-none" style={{ color: 'var(--text-primary)' }}>
        {typeof value === 'number' ? toAr(value) : value}
      </p>
      {sub && <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
    </div>
  )
}

// ─── QuickLink ────────────────────────────────────────────────────
function QuickLink({ href, icon: Icon, label, color }: {
  href: string; icon: React.ElementType; label: string; color: string
}) {
  return (
    <Link href={href}
      className="flex flex-col items-center gap-2 py-4 px-3 rounded-2xl flex-1 transition-all active:scale-95"
      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-soft)' }}>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center"
        style={{ background: `${color}18` }}>
        <Icon className="w-5 h-5" style={{ color }} />
      </div>
      <span className="text-xs font-bold text-center leading-tight"
        style={{ color: 'var(--text-secondary)' }}>{label}</span>
    </Link>
  )
}

// ─── Main ─────────────────────────────────────────────────────────
export default function TeacherDashboardPage() {
  const { profile, loading: authLoading } = useAuth()
  const router = useRouter()

  const today = localDateIso(new Date())
  const isCeo = profile?.role === 'ceo' || profile?.role === 'records_officer'
  const isBatchManager = profile?.role === 'batch_manager'

  // Batch selector (CEO فقط)
  const [batches, setBatches]       = useState<DBBatch[]>([])
  const [selectedBatch, setSelectedBatch] = useState<number | null>(null)

  const [stats, setStats]     = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // تحديد الدفعة الفعلية لجلب الإحصائيات
  const activeBatchId = isCeo ? selectedBatch : (profile?.batch_id ?? null)

  // جلب الدفعات للـCEO
  useEffect(() => {
    if (!isCeo || authLoading) return
    getDashboardBatches().then(bs => {
      setBatches(bs)
      if (bs.length > 0) setSelectedBatch(bs[0].id)
    })
  }, [isCeo, authLoading])

  // جلب الإحصائيات
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

  // ── التوجيه ──────────────────────────────────────────────────────
  // لا نُعيد توجيه — كل الأدوار تصل لهذه الصفحة

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--accent-warm)' }} />
      </div>
    )
  }

  if (!profile) return null

  const todayHijri = formatHijriWithDay(today)
  const roleName =
    profile.role === 'teacher'       ? 'معلم' :
    profile.role === 'supervisor'    ? 'مشرف' :
    profile.role === 'batch_manager' ? 'مدير دفعة' :
    profile.role === 'ceo'           ? 'المدير التنفيذي' : 'مسجّل'

  const recordedPct = stats?.recordedPct ?? 0
  const pctColor =
    recordedPct >= 80 ? '#4ade80' :
    recordedPct >= 50 ? '#facc15' : '#f87171'

  return (
    <div className="space-y-4 pb-8 max-w-lg mx-auto">

      {/* ── الترحيب ─────────────────────────────────────── */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
            {roleName} · {todayHijri}
          </p>
          <h1 className="text-xl font-black mt-0.5" style={{ color: 'var(--text-primary)' }}>
            {greeting()}، {profile.name?.split(' ')[0] || 'أستاذ'} 👋
          </h1>
        </div>
        {/* زر تحديث */}
        <button
          onClick={() => fetchStats(true)}
          disabled={refreshing}
          className="w-9 h-9 rounded-xl flex items-center justify-center transition-all active:scale-90 disabled:opacity-40"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-soft)' }}
          aria-label="تحديث"
        >
          <RotateCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`}
            style={{ color: 'var(--text-muted)' }} />
        </button>
      </div>

      {/* ── التذكير الإيماني ─────────────────────────────── */}
      <WisdomCard />

      {/* ── Batch Selector (CEO فقط) ─────────────────────── */}
      {isCeo && batches.length > 0 && (
        <div className="rounded-2xl px-4 py-3"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-soft)' }}>
          <label className="text-xs font-semibold block mb-2"
            style={{ color: 'var(--text-muted)' }}>اختر الدفعة</label>
          <div className="flex flex-wrap gap-2">
            {batches.map(b => (
              <button key={b.id}
                onClick={() => setSelectedBatch(b.id)}
                className="px-3 py-1.5 rounded-xl text-sm font-bold transition-all active:scale-95"
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

      {/* ── زر تسجيل اليوم ──────────────────────────────── */}
      <Link href="/quran-system/daily-records"
        className="flex items-center justify-between gap-4 p-5 rounded-2xl transition-all active:scale-[0.98]"
        style={{
          background: 'linear-gradient(135deg, #C08A48 0%, #8B5A1E 100%)',
          boxShadow: '0 8px 24px rgba(192,138,72,0.35)',
        }}>
        <div>
          <p className="text-white/70 text-xs font-semibold mb-0.5">الآن</p>
          <p className="text-white text-xl font-black">تسجيل اليوم</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center">
            <BookOpen className="w-6 h-6 text-white" />
          </div>
          <ChevronLeft className="w-5 h-5 text-white/60" />
        </div>
      </Link>

      {/* ── الإحصائيات ─────────────────────────────────── */}
      {loading ? (
        <div className="grid grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-2xl h-28 animate-pulse"
              style={{ background: 'var(--bg-elevated)' }} />
          ))}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            label="إجمالي الطلاب"
            value={stats.totalStudents}
            icon={Users}
            color="#C08A48"
            bg="rgba(192,138,72,0.06)"
          />
          <StatCard
            label="مسجّلون اليوم"
            value={`${toAr(stats.recordedPct)}%`}
            sub={`${toAr(stats.recordedToday)} من ${toAr(stats.totalStudents)}`}
            icon={CheckCircle2}
            color={pctColor}
            bg={`${pctColor}0f`}
          />
          <StatCard
            label="لم يُسجَّل بعد"
            value={stats.notRecordedToday}
            sub={stats.notRecordedNames.length > 0
              ? stats.notRecordedNames.slice(0, 3).join('، ') + (stats.notRecordedNames.length > 3 ? '…' : '')
              : 'الجميع مسجّلون ✓'}
            icon={Clock}
            color={stats.notRecordedToday === 0 ? '#4ade80' : '#f87171'}
            bg={stats.notRecordedToday === 0 ? 'rgba(74,222,128,0.06)' : 'rgba(248,113,113,0.06)'}
          />
          <StatCard
            label="قريبو الاختبار"
            value={stats.nearExamCount}
            sub={stats.nearExamCount > 0 ? '≤ 4 أوجه' : 'لا أحد الآن'}
            icon={AlertTriangle}
            color={stats.nearExamCount > 0 ? '#facc15' : '#4ade80'}
            bg={stats.nearExamCount > 0 ? 'rgba(250,204,21,0.06)' : 'rgba(74,222,128,0.06)'}
          />
        </div>
      ) : null}

      {/* ── روابط سريعة ──────────────────────────────────── */}
      <div>
        <p className="text-xs font-semibold mb-2 px-1" style={{ color: 'var(--text-muted)' }}>
          روابط سريعة
        </p>
        <div className="flex gap-2">
          <QuickLink href="/followups"        icon={ClipboardList} label="المتابعات"   color="#C08A48" />
          <QuickLink href="/quran-system/batch-progress" icon={TrendingUp} label="التقدم"  color="#356B6E" />
          <QuickLink href="/exams"            icon={CalendarCheck} label="الاختبارات"  color="#5A8F67" />
          <QuickLink href="/quran-system/daily-records" icon={BookMarked} label="سجلات الحفظ" color="#8B5A82" />
        </div>
      </div>

      {/* ── رابط للوحة الكاملة (مدير الدفعة / CEO) ─────── */}
      {(isBatchManager || isCeo) && (
        <Link
          href={isCeo ? '/admin/dashboard' : '/manager/dashboard'}
          className="flex items-center justify-between px-4 py-3 rounded-2xl transition-all active:scale-[0.99]"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-soft)' }}>
          <span className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
            {isCeo ? 'لوحة المدير التنفيذي الكاملة' : 'لوحة مدير الدفعة الكاملة'}
          </span>
          <ChevronLeft className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
        </Link>
      )}

    </div>
  )
}
