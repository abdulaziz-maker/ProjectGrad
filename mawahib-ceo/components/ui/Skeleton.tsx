/**
 * Skeleton Loading Components
 * Use these to replace `if (loading) <Loader2 />` patterns with
 * content-aware skeleton screens that mirror the actual page layout.
 *
 * Usage:
 *   import { DashboardSkeleton } from '@/components/ui/Skeleton'
 *   if (loading) return <DashboardSkeleton />
 */

/* ── Base block ───────────────────────────────────────────── */
interface SkeletonProps {
  className?: string
  style?: React.CSSProperties
}
export function Sk({ className = '', style }: SkeletonProps) {
  return <div className={`skeleton ${className}`} style={style} />
}

/* ── Row of skeletons ─────────────────────────────────────── */
function SkRow({ children, gap = 12 }: { children: React.ReactNode; gap?: number }) {
  return <div className="skeleton-row" style={{ gap }}>{children}</div>
}

/* ─────────────────────────────────────────────────────────────
   PAGE-LEVEL SKELETONS
   ───────────────────────────────────────────────────────────── */

/** لوحة التحكم — 4 KPIs + 2 cards side-by-side */
export function DashboardSkeleton() {
  return (
    <div className="space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div className="space-y-2">
          <Sk className="skeleton-title" />
          <Sk className="skeleton-text-sm skeleton-third" />
        </div>
        <Sk style={{ height: 18, width: 160 }} />
      </div>

      {/* 4 KPI boxes */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card-static p-4 space-y-3">
            <SkRow>
              <Sk className="skeleton-icon" />
              <div className="flex-1 space-y-2">
                <Sk className="skeleton-text skeleton-2-3" />
                <Sk style={{ height: 28, width: '50%' }} />
              </div>
            </SkRow>
            <Sk className="skeleton-text-sm skeleton-half" />
          </div>
        ))}
      </div>

      {/* Main grid: big card + small card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 card-static p-4 space-y-3">
          <Sk className="skeleton-title skeleton-third" />
          {[...Array(5)].map((_, i) => (
            <SkRow key={i}>
              <Sk className="skeleton-avatar-sm" />
              <div className="flex-1 space-y-1.5">
                <Sk className="skeleton-text" />
                <Sk className="skeleton-text-sm skeleton-2-3" />
              </div>
              <Sk className="skeleton-badge" />
            </SkRow>
          ))}
        </div>
        <div className="card-static p-4 space-y-3">
          <Sk className="skeleton-title skeleton-half" />
          {[...Array(4)].map((_, i) => (
            <div key={i} className="space-y-1.5">
              <SkRow>
                <Sk className="skeleton-icon" style={{ borderRadius: 6 }} />
                <div className="flex-1 space-y-1">
                  <Sk className="skeleton-text skeleton-3-4" />
                  <Sk className="skeleton-text-sm skeleton-half" />
                </div>
              </SkRow>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** قائمة الطلاب — فلاتر + جدول صفوف */
export function StudentsSkeleton() {
  return (
    <div className="space-y-4" dir="rtl">
      {/* Search + filter bar */}
      <SkRow>
        <Sk className="skeleton-input flex-1" />
        <Sk className="skeleton-btn" />
        <Sk className="skeleton-btn" style={{ width: 70 }} />
      </SkRow>

      {/* Batch tabs */}
      <SkRow gap={8}>
        {[...Array(5)].map((_, i) => (
          <Sk key={i} className="skeleton-badge" style={{ width: 64 + i * 8 }} />
        ))}
      </SkRow>

      {/* Table rows */}
      <div className="card-static divide-y" style={{ borderColor: 'var(--border-soft)' }}>
        {[...Array(7)].map((_, i) => (
          <div key={i} className="p-3">
            <SkRow>
              <Sk className="skeleton-avatar" />
              <div className="flex-1 space-y-1.5">
                <Sk className="skeleton-text" style={{ width: `${55 + (i * 7) % 30}%` }} />
                <Sk className="skeleton-text-sm" style={{ width: `${35 + (i * 5) % 25}%` }} />
              </div>
              <Sk className="skeleton-badge" style={{ width: 56 }} />
              <Sk className="skeleton-badge" style={{ width: 70 }} />
              <Sk style={{ width: 28, height: 28, borderRadius: 6 }} />
            </SkRow>
          </div>
        ))}
      </div>
    </div>
  )
}

/** قائمة المشرفين — بطاقات grid */
export function SupervisorsSkeleton() {
  return (
    <div className="space-y-4" dir="rtl">
      <SkRow>
        <Sk className="skeleton-input flex-1" />
        <Sk className="skeleton-btn" />
      </SkRow>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="card-static p-4 space-y-3">
            <SkRow>
              <Sk className="skeleton-avatar" />
              <div className="flex-1 space-y-1.5">
                <Sk className="skeleton-text skeleton-3-4" />
                <Sk className="skeleton-text-sm skeleton-half" />
              </div>
            </SkRow>
            <div className="space-y-1.5">
              <Sk className="skeleton-text" />
              <Sk className="skeleton-text skeleton-2-3" />
            </div>
            <SkRow gap={8}>
              <Sk className="skeleton-badge" style={{ flex: 1 }} />
              <Sk className="skeleton-badge" style={{ flex: 1 }} />
            </SkRow>
          </div>
        ))}
      </div>
    </div>
  )
}

/** إدارة المتون — بطاقات مع جدول */
export function MatnSkeleton() {
  return (
    <div className="space-y-4" dir="rtl">
      <SkRow>
        <Sk className="skeleton-title flex-1" />
        <Sk className="skeleton-btn" />
      </SkRow>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="card-static p-4 space-y-3">
            <SkRow>
              <Sk className="skeleton-icon skeleton-circle" />
              <div className="flex-1 space-y-1.5">
                <Sk className="skeleton-text skeleton-2-3" />
                <Sk className="skeleton-text-sm skeleton-half" />
              </div>
              <Sk className="skeleton-badge" />
            </SkRow>
            <Sk style={{ height: 6, width: '100%', borderRadius: 99 }} />
            <SkRow gap={8}>
              {[...Array(3)].map((_, j) => (
                <Sk key={j} className="skeleton-badge" style={{ flex: 1 }} />
              ))}
            </SkRow>
          </div>
        ))}
      </div>
    </div>
  )
}

/** الحضور — جدول مع رؤوس */
export function AttendanceSkeleton() {
  return (
    <div className="space-y-4" dir="rtl">
      <SkRow>
        <Sk className="skeleton-input" style={{ width: 180 }} />
        <Sk className="skeleton-btn" />
        <Sk className="skeleton-btn" />
      </SkRow>
      <div className="card-static overflow-hidden">
        {/* Table header */}
        <div className="p-3 border-b" style={{ borderColor: 'var(--border-soft)' }}>
          <SkRow>
            <Sk className="skeleton-text-sm" style={{ width: 80 }} />
            <Sk className="skeleton-text-sm" style={{ width: 60 }} />
            <Sk className="skeleton-text-sm" style={{ width: 90 }} />
            <Sk className="skeleton-text-sm" style={{ width: 70 }} />
          </SkRow>
        </div>
        {[...Array(8)].map((_, i) => (
          <div key={i} className="p-3 border-b last:border-0" style={{ borderColor: 'var(--border-soft)' }}>
            <SkRow>
              <Sk className="skeleton-avatar-sm" />
              <Sk className="skeleton-text" style={{ width: `${120 + (i * 13) % 60}px` }} />
              <div className="flex-1" />
              <Sk className="skeleton-badge" />
              <Sk className="skeleton-badge" style={{ width: 56 }} />
            </SkRow>
          </div>
        ))}
      </div>
    </div>
  )
}

/** المهام — قسم مع قائمة */
export function TasksSkeleton() {
  return (
    <div className="space-y-4" dir="rtl">
      {[...Array(2)].map((_, sec) => (
        <div key={sec} className="space-y-2">
          <SkRow>
            <Sk style={{ width: 120, height: 18 }} />
            <Sk className="skeleton-badge" style={{ width: 32 }} />
          </SkRow>
          <div className="card-static divide-y" style={{ borderColor: 'var(--border-soft)' }}>
            {[...Array(4)].map((_, i) => (
              <div key={i} className="p-3">
                <SkRow>
                  <Sk style={{ width: 18, height: 18, borderRadius: 4 }} />
                  <div className="flex-1 space-y-1">
                    <Sk className="skeleton-text" style={{ width: `${50 + (i * 9) % 35}%` }} />
                    <Sk className="skeleton-text-sm skeleton-third" />
                  </div>
                  <Sk className="skeleton-badge" style={{ width: 48 }} />
                </SkRow>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/** لوحة الأدمن — KPIs + table */
export function AdminDashboardSkeleton() {
  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex items-end justify-between">
        <div className="space-y-2">
          <Sk className="skeleton-title" />
          <Sk className="skeleton-text-sm skeleton-half" />
        </div>
        <Sk className="skeleton-btn" />
      </div>

      {/* 3 KPI boxes */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="card-static p-4 space-y-2">
            <SkRow>
              <Sk className="skeleton-icon" />
              <Sk className="skeleton-text skeleton-half" />
            </SkRow>
            <Sk style={{ height: 30, width: '40%' }} />
          </div>
        ))}
      </div>

      {/* Users table */}
      <div className="card-static overflow-hidden">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="p-3 border-b last:border-0" style={{ borderColor: 'var(--border-soft)' }}>
            <SkRow>
              <Sk className="skeleton-avatar" />
              <div className="flex-1 space-y-1.5">
                <Sk className="skeleton-text" style={{ width: `${100 + (i * 17) % 80}px` }} />
                <Sk className="skeleton-text-sm" style={{ width: `${80 + (i * 11) % 60}px` }} />
              </div>
              <Sk className="skeleton-badge" />
              <Sk style={{ width: 28, height: 28, borderRadius: 6 }} />
            </SkRow>
          </div>
        ))}
      </div>
    </div>
  )
}

/** صفحة المستخدمين (admin/users) */
export function UsersSkeleton() {
  return (
    <div className="space-y-4" dir="rtl">
      <SkRow>
        <Sk className="skeleton-title flex-1" />
        <Sk className="skeleton-btn" />
      </SkRow>
      <div className="card-static divide-y" style={{ borderColor: 'var(--border-soft)' }}>
        {[...Array(6)].map((_, i) => (
          <div key={i} className="p-4">
            <SkRow>
              <Sk className="skeleton-avatar" />
              <div className="flex-1 space-y-1.5">
                <Sk className="skeleton-text" style={{ width: `${100 + (i * 23) % 90}px` }} />
                <Sk className="skeleton-text-sm" style={{ width: `${130 + (i * 17) % 70}px` }} />
              </div>
              <Sk className="skeleton-badge" />
              <Sk className="skeleton-badge" style={{ width: 56 }} />
              <Sk style={{ width: 28, height: 28, borderRadius: 6 }} />
            </SkRow>
          </div>
        ))}
      </div>
    </div>
  )
}

/** صفحة تفاصيل الطالب */
export function StudentDetailSkeleton() {
  return (
    <div className="space-y-4" dir="rtl">
      {/* Profile header */}
      <div className="card-static p-5">
        <SkRow gap={16}>
          <Sk style={{ width: 64, height: 64, borderRadius: '50%' }} />
          <div className="flex-1 space-y-2">
            <Sk style={{ height: 24, width: 200 }} />
            <Sk className="skeleton-text skeleton-2-3" />
            <SkRow gap={8}>
              {[...Array(3)].map((_, i) => (
                <Sk key={i} className="skeleton-badge" />
              ))}
            </SkRow>
          </div>
        </SkRow>
      </div>

      {/* Tabs */}
      <SkRow gap={6}>
        {[...Array(4)].map((_, i) => (
          <Sk key={i} style={{ height: 34, width: 90, borderRadius: 8 }} />
        ))}
      </SkRow>

      {/* Content card */}
      <div className="card-static p-4 space-y-3">
        {[...Array(5)].map((_, i) => (
          <SkRow key={i}>
            <Sk style={{ width: 100, height: 13 }} />
            <Sk className="skeleton-text flex-1" style={{ width: `${50 + (i * 9) % 30}%` }} />
          </SkRow>
        ))}
      </div>
    </div>
  )
}

/** Generic — بسيط لأي صفحة مجهولة */
export function GenericSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3" dir="rtl">
      <Sk className="skeleton-title" />
      {[...Array(rows)].map((_, i) => (
        <div key={i} className="card-static p-4 space-y-2">
          <SkRow>
            <Sk className="skeleton-icon" />
            <div className="flex-1 space-y-1.5">
              <Sk className="skeleton-text" style={{ width: `${50 + (i * 9) % 35}%` }} />
              <Sk className="skeleton-text-sm skeleton-2-3" />
            </div>
          </SkRow>
        </div>
      ))}
    </div>
  )
}
