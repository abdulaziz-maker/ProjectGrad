/**
 * /admin/activity — صفحة "آخر نشاط" (super_admin فقط)
 *
 * Server Component يقرأ snapshot كامل عبر Promise.all + يُعيد التحقق
 * server-side من صلاحية super_admin قبل أي استعلام.
 *
 * ⚠️ ملف جديد — لا يُعدّل أي ملف موجود.
 */
import { redirect } from 'next/navigation'
import { Activity, Users, BarChart3, Zap, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react'
import { getActivityAuth } from '@/lib/activity/server-auth'
import { fetchActivitySnapshot } from '@/lib/activity/queries'
import { OnlineUsersCard, RefreshButton } from './Interactive'

// إعادة التحقّق كل 60 ثانية + revalidatePath() عبر زر إعادة التحميل يلغي الـcache
export const revalidate = 60
export const dynamic = 'force-dynamic'  // نضمن إعادة التشغيل عند كل zيارة

function formatPct(p: number | null): { sign: '+' | '-' | ''; value: string; icon: typeof ArrowUpRight | typeof ArrowDownRight | typeof Minus; color: string } {
  if (p === null) return { sign: '+', value: 'جديد', icon: ArrowUpRight, color: '#5A8F67' }
  if (p === 0)    return { sign: '',  value: '0%',   icon: Minus,         color: 'var(--text-muted)' }
  const abs = Math.abs(p).toFixed(0)
  if (p > 0) return { sign: '+', value: `${abs}%`, icon: ArrowUpRight,   color: '#5A8F67' }
  return       { sign: '-', value: `${abs}%`, icon: ArrowDownRight, color: '#B94838' }
}

export default async function ActivityPage() {
  const auth = await getActivityAuth()
  if (!auth) redirect('/login?redirect=/admin/activity')
  if (!auth.isSuperAdmin) redirect('/dashboard')

  const snap = await fetchActivitySnapshot()
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
        <RefreshButton />
      </header>

      {/* بطاقتا الإحصائيات — grid responsive */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">

        {/* بطاقة "نشاط اليوم" */}
        <section
          className="rounded-2xl p-4 sm:p-5"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-soft)' }}
        >
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
            <Metric
              icon={Users}
              label="مستخدم فريد"
              value={today.unique_users_today}
              delta={deltaU}
              hint={`الأمس: ${today.unique_users_yesterday}`}
            />
            <Metric
              icon={BarChart3}
              label="إجمالي الجلسات"
              value={today.total_sessions_today}
              delta={deltaS}
              hint={`الأمس: ${today.total_sessions_yesterday}`}
            />
          </div>
        </section>

        {/* بطاقة "أعلى المتزامنين" */}
        <section
          className="rounded-2xl p-4 sm:p-5"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-soft)' }}
        >
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

      {/* قائمة آخر المتصلين */}
      <OnlineUsersCard users={online.map(u => ({
        user_id: u.user_id,
        name: u.name,
        role: u.role,
        batch_id: u.batch_id,
        last_activity: u.last_activity,
        page_path: u.page_path,
      }))} />

      {/* footer */}
      <p className="text-[10px] text-center pt-2" style={{ color: 'var(--text-muted)' }}>
        آخر تحديث: <span className="font-mono">{new Date(snap.generated_at).toLocaleTimeString('ar-SA')}</span>
        {' · '}
        نشاط 30 يوم كاملة + ملخصات سنة. السجل الأقدم يُحذف تلقائياً.
      </p>
    </div>
  )
}

// ─── مكوّنات تقديم داخلية (server) ──────────────────────
function Metric({
  icon: Icon, label, value, delta, hint,
}: {
  icon: typeof Users
  label: string
  value: number
  delta: ReturnType<typeof formatPct>
  hint: string
}) {
  const DeltaIcon = delta.icon
  return (
    <div className="rounded-xl p-3" style={{ background: 'var(--bg-subtle)' }}>
      <div className="flex items-center gap-1.5 mb-1.5" style={{ color: 'var(--text-muted)' }}>
        <Icon className="w-3 h-3" />
        <span className="text-[10.5px]">{label}</span>
      </div>
      <p className="text-2xl sm:text-3xl font-bold font-mono leading-none mb-1.5"
        style={{ color: 'var(--text-primary)' }}>
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
