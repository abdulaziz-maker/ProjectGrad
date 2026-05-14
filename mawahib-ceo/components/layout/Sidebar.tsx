'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, GraduationCap, UserCog, BookOpenCheck, ScrollText,
  CalendarCheck, CalendarDays, Sparkles, Users, FileBarChart,
  Wallet, Settings, X, Database,
  ClipboardCheck, ListTodo, LogOut, ShieldCheck, ChevronLeft,
  NotebookPen, TrendingUp, Archive, AlertOctagon, ShieldAlert,
  Building2, Target, Activity, ArrowLeftRight,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { signOut } from '@/lib/auth'
import { UserRole } from '@/lib/auth'
import { BrandMark } from '@/components/ui/BrandMark'
import { TIMELINE_ENABLED } from '@/lib/timeline/flag'
import { STUDENT_CASES_ENABLED } from '@/lib/student-cases/flag'
import { getInboxCount } from '@/lib/student-cases/db'
import type { CaseStage } from '@/lib/student-cases/types'

interface NavItem {
  href: string
  icon: React.ElementType
  label: string
  badge: number
  roles?: UserRole[]
  superAdminOnly?: boolean
}

interface NavGroup {
  /** عنوان القسم — اختياري. لو ناقص، يظهر بدون header */
  label?: string
  items: NavItem[]
}

// التسميات الديناميكية حسب الدور تُطبَّق داخل المكوّن.
const navGroups: NavGroup[] = [
  // ─── أعلى القائمة: لوحة + مهام (بلا عنوان قسم) ───
  { items: [
    { href: '/admin/dashboard',   icon: LayoutDashboard, label: 'لوحة التحكم',   badge: 0, roles: ['ceo'] },
    { href: '/dashboard',         icon: LayoutDashboard, label: 'لوحة التحكم',   badge: 0, roles: ['supervisor', 'teacher'] },
    { href: '/manager/dashboard', icon: LayoutDashboard, label: 'لوحة الدفعة',   badge: 0, roles: ['batch_manager'] },
    { href: '/tasks',             icon: ListTodo,        label: 'مهامي اليومية', badge: 0, roles: ['ceo', 'batch_manager', 'supervisor', 'teacher'] },
  ]},

  // ─── قرآني ───
  { label: 'قرآني', items: [
    { href: '/quran-system/daily-records',  icon: BookOpenCheck, label: 'سجلات الحفظ',     badge: 0, roles: ['supervisor', 'teacher', 'batch_manager', 'ceo'] },
    { href: '/exams',                       icon: ClipboardCheck, label: 'جدول الاختبارات', badge: 0 },
    { href: '/batches',                     icon: Database,       label: 'قاعدة البيانات',   badge: 0 },
    { href: '/quran-system/batch-progress', icon: TrendingUp,     label: 'تقدم الحفظ',       badge: 0, roles: ['supervisor', 'teacher', 'batch_manager', 'ceo'] },
  ]},

  // ─── المتابعات ───
  { label: 'المتابعات', items: [
    { href: '/followups',            icon: NotebookPen,    label: 'متابعات الطلاب',    badge: 0, roles: ['supervisor', 'teacher', 'ceo'] },
    { href: '/followups/manager',    icon: NotebookPen,    label: 'متابعات الدفعة',    badge: 0, roles: ['batch_manager'] },
    { href: '/followups/schedule',   icon: CalendarDays,   label: 'جدول الأسبوع',      badge: 0, roles: ['supervisor', 'teacher', 'batch_manager', 'ceo'] },
    { href: '/followups/violations', icon: AlertOctagon,   label: 'إخلالات المتابعة',  badge: 0, roles: ['ceo', 'batch_manager'] },
    { href: '/followups/history',    icon: Archive,        label: 'أرشيف المتابعات',   badge: 0, roles: ['supervisor', 'teacher', 'batch_manager', 'ceo'] },
    { href: '/student-cases',        icon: ShieldAlert,    label: 'التصعيدات',         badge: 0, roles: ['ceo', 'batch_manager', 'supervisor', 'teacher', 'records_officer'] as UserRole[] },
  ]},

  // ─── (بلا عنوان) — تقارير ───
  { items: [
    { href: '/reports', icon: FileBarChart, label: 'تقارير الدفعات', badge: 0 },
  ]},

  // ─── (بلا عنوان) — متون + برامج ───
  { items: [
    { href: '/matn',     icon: ScrollText, label: 'رصد المتون',  badge: 0 },
    { href: '/programs', icon: Sparkles,    label: 'برامج الدفع', badge: 0 },
  ]},

  // ─── إداري ───
  { label: 'إداري', items: [
    { href: '/students',            icon: GraduationCap, label: 'طلاب الدفع',           badge: 0 },
    { href: '/manager/supervisors', icon: UserCog,       label: 'مشرفو دفعتي',          badge: 0, roles: ['batch_manager'] },
    { href: '/supervisors',         icon: UserCog,       label: 'المشرفون والمعلمون',   badge: 0, roles: ['ceo'] },
    { href: '/manager/assignments', icon: ArrowLeftRight, label: 'توزيع الطلاب',         badge: 0, roles: ['batch_manager', 'ceo'] },
    { href: '/attendance',          icon: CalendarCheck, label: 'الحضور والغياب',       badge: 0 },
    { href: '/meetings',            icon: Users,         label: 'الاجتماعات',           badge: 0 },
  ]},

  // ─── النظام ───
  { label: 'النظام', items: [
    { href: '/admin/users',     icon: ShieldCheck, label: 'إدارة الحسابات',  badge: 0, roles: ['ceo'] },
    { href: '/admin/bulk-plan', icon: Target,      label: 'إنشاء خطة جماعي', badge: 0, roles: ['ceo'] },
    { href: '/admin/tenants',   icon: Building2,   label: 'إدارة الحلقات',    badge: 0, roles: ['ceo'], superAdminOnly: true },
    { href: '/budget',          icon: Wallet,      label: 'الميزانية والعهد', badge: 0, roles: ['ceo'] },
    { href: '/admin/activity',  icon: Activity,    label: 'آخر نشاط',        badge: 0, superAdminOnly: true },
    { href: '/settings',        icon: Settings,    label: 'الإعدادات',       badge: 0, roles: ['ceo'] },
  ]},
]

interface SidebarProps {
  open: boolean
  onClose: () => void
  collapsed: boolean
  onToggleCollapse: () => void
}

export default function Sidebar({ open, onClose, collapsed, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname()
  const router   = useRouter()
  const { profile } = useAuth()
  const role = profile?.role ?? 'ceo'

  // موظف السجلات: يرى فقط ٣ صفحات (خريطة الحفظ + الاختبارات + الطلاب)
  const RECORDS_OFFICER_PATHS = new Set(['/batches', '/exams', '/students'])

  // ─── Badge عدد التصعيدات الواردة (يجلب RLS-filtered) ───
  const [inboxCount, setInboxCount] = useState<number>(0)
  useEffect(() => {
    if (!STUDENT_CASES_ENABLED || !profile) return
    // المرحلة المتوقعة لكل دور
    const stage: CaseStage | null =
      role === 'supervisor' || role === 'teacher' ? 'stage_1_supervisor'
      : role === 'batch_manager'                  ? 'stage_2_batch_manager'
      : role === 'ceo'                             ? 'stage_3_ceo'
      : null
    if (!stage) return
    let alive = true
    getInboxCount(stage)
      .then(n => { if (alive) setInboxCount(n) })
      .catch(() => {})
    return () => { alive = false }
  }, [profile, role])

  // ─── تسميات ديناميكية حسب الدور ───
  const isMine = role === 'batch_manager' || role === 'supervisor' || role === 'teacher'

  // التصعيدات — التسمية موحَّدة الآن
  const studentCasesLabel = 'التصعيدات'

  // باقي البنود الديناميكية:
  const labelOverrides: Record<string, string> = {
    '/reports':  isMine ? 'تقارير دفعتي' : 'تقارير الدفعات',
    '/students': isMine ? 'طلاب دفعتي'   : 'طلاب الدفع',
    '/programs': isMine ? 'برامج دفعتي'  : 'برامج الدفع',
  }

  const isSuperAdmin = profile?.is_super_admin === true

  // فلترة العناصر داخل كل قسم + إزالة الأقسام الفارغة
  const visibleGroups = navGroups
    .map(group => ({
      label: group.label,
      items: group.items
        .filter(item => {
          if (item.superAdminOnly && !isSuperAdmin) return false
          if (role === 'records_officer') return RECORDS_OFFICER_PATHS.has(item.href)
          return !item.roles || item.roles.includes(role)
        })
        .map(item => {
          if (item.href === '/student-cases') {
            return { ...item, label: studentCasesLabel, badge: inboxCount > 0 ? inboxCount : 0 }
          }
          if (labelOverrides[item.href]) {
            return { ...item, label: labelOverrides[item.href] }
          }
          return item
        }),
    }))
    .filter(group => group.items.length > 0)

  // ⚡️ نتنقّل أولاً ثم نستدعي signOut في الخلفية — على الجوال تبدو العملية
  // فورية حتى لو تأخّرت شبكة Supabase.
  const handleSignOut = () => {
    router.replace('/login')
    signOut().catch(() => {})
  }

  const roleLabels: Record<string, string> = { ceo: 'المدير التنفيذي', batch_manager: 'مدير الدفعة', supervisor: 'مشرف', teacher: 'معلم', records_officer: 'موظف سجلات' }
  const roleLabel  = roleLabels[role] ?? 'مستخدم'
  const initial    = profile?.name?.charAt(0) ?? 'م'
  const width      = collapsed ? 76 : 268

  return (
    <>
      {/* Mobile overlay */}
      <div
        className={`fixed inset-0 z-40 lg:hidden transition-all duration-300 ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        style={{ backgroundColor: 'rgba(11,12,15,0.55)', backdropFilter: 'blur(8px)' }}
        onClick={onClose}
      />

      {/* Sidebar */}
      <aside
        className={`sidebar-root fixed top-0 right-0 h-full z-50 flex flex-col lg:relative lg:translate-x-0 ${
          open ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'
        }`}
        style={{
          width: `${width}px`,
          minWidth: `${width}px`,
          minHeight: '100vh',
          background: 'var(--bg-sidebar)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderLeft: '1px solid var(--border-color)',
          transition: 'transform 300ms ease, width 320ms cubic-bezier(0.4,0,0.2,1), min-width 320ms cubic-bezier(0.4,0,0.2,1)',
          overflow: 'hidden',
        }}
      >
        {/* ── HEADER ── */}
        <div
          className="flex items-center px-4 pt-5 pb-4"
          style={{ minHeight: 76, justifyContent: collapsed ? 'center' : 'space-between' }}
        >
          {/* Logo + name */}
          <div className="flex items-center gap-3 min-w-0">
            {collapsed ? (
              <div
                className="flex items-center justify-center"
                style={{
                  width: 40, height: 40, borderRadius: 12,
                  background: 'linear-gradient(135deg, var(--brand-from) 0%, var(--brand-to) 100%)',
                  boxShadow: '0 6px 14px rgba(26,27,32,0.18)',
                  flexShrink: 0,
                }}
              >
                <BrandMark size={22} color="var(--brand-on)" />
              </div>
            ) : (
              <div className="sidebar-label flex items-center gap-2.5 min-w-0">
                <div
                  className="flex items-center justify-center"
                  style={{
                    width: 40, height: 40, borderRadius: 12,
                    background: 'linear-gradient(135deg, var(--brand-from) 0%, var(--brand-to) 100%)',
                    boxShadow: '0 6px 14px rgba(26,27,32,0.18)',
                    flexShrink: 0,
                  }}
                >
                  <BrandMark size={24} color="var(--brand-on)" />
                </div>
                <div className="min-w-0">
                  <p
                    style={{
                      fontWeight: 800, fontSize: '0.86rem', color: 'var(--text-primary)', margin: 0, lineHeight: 1.2,
                      fontFamily: 'var(--font-noto-kufi, Noto Kufi Arabic)',
                      letterSpacing: '-0.005em',
                    }}
                  >
                    المواهب الناشئة
                  </p>
                  <p style={{ fontWeight: 500, fontSize: '0.62rem', color: 'var(--text-muted)', margin: 0, letterSpacing: '0.05em' }}>
                    EXECUTIVE · v2.0
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Mobile close */}
          {!collapsed && (
            <button
              onClick={onClose}
              className="lg:hidden p-1.5 flex-shrink-0"
              style={{ color: 'var(--text-muted)', borderRadius: 8, transition: 'color 200ms, background 200ms' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.background = 'var(--hover-bg)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = '' }}
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Divider */}
        <div style={{ height: 1, margin: '0 16px', background: 'linear-gradient(90deg, transparent, var(--border-color), transparent)' }} />

        {/* ── NAV ── */}
        <nav className="flex-1 px-2 py-3 overflow-y-auto overflow-x-hidden">
          {visibleGroups.map((group, gIdx) => (
            <div key={`group-${gIdx}`} className={gIdx > 0 ? 'mt-3' : ''}>
              {/* عنوان القسم (لو موجود وليس collapsed) */}
              {group.label && !collapsed && (
                <div
                  className="px-3 pt-1 pb-1.5 sidebar-label"
                  style={{
                    fontSize: '0.62rem',
                    fontWeight: 800,
                    letterSpacing: '0.12em',
                    color: 'var(--text-muted)',
                    textTransform: 'none',
                  }}>
                  {group.label}
                </div>
              )}
              {/* فاصل دقيق للأقسام في collapsed mode */}
              {group.label && collapsed && gIdx > 0 && (
                <div style={{
                  height: 1, margin: '6px 12px 8px',
                  background: 'linear-gradient(90deg, transparent, var(--border-color), transparent)',
                }} />
              )}
              <div className="space-y-0.5">
              {group.items.map(item => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className="flex items-center relative"
                style={{
                  gap: collapsed ? 0 : 12,
                  padding: collapsed ? '10px 0' : '10px 14px',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  borderRadius: 12,
                  backgroundColor: isActive ? 'rgba(192,138,72,0.10)' : 'transparent',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontWeight: isActive ? 600 : 500,
                  transition: 'all 200ms ease',
                  textDecoration: 'none',
                  minHeight: 42,
                }}
                onMouseEnter={e => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'var(--hover-bg)'
                    e.currentTarget.style.color = 'var(--text-primary)'
                    e.currentTarget.style.transform = 'translateX(-2px)'
                  }
                }}
                onMouseLeave={e => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'transparent'
                    e.currentTarget.style.color = 'var(--text-secondary)'
                    e.currentTarget.style.transform = ''
                  }
                }}
              >
                {/* Active accent bar — right edge (RTL) */}
                {isActive && (
                  <span style={{
                    position: 'absolute', right: 0, top: '50%',
                    transform: 'translateY(-50%)',
                    width: 3, height: '62%',
                    background: 'linear-gradient(180deg, var(--accent-warm), var(--accent-gold))',
                    borderRadius: '3px 0 0 3px',
                    boxShadow: '-4px 0 12px rgba(192,138,72,0.45)',
                  }} />
                )}

                {/* Icon */}
                <Icon
                  size={18}
                  className="flex-shrink-0"
                  style={{
                    color: isActive ? 'var(--accent-warm)' : undefined,
                    transition: 'color 200ms, filter 200ms, transform 200ms',
                  }}
                />

                {/* Label + badge */}
                {!collapsed && (
                  <span className="sidebar-label flex-1 flex items-center justify-between text-[13.5px]">
                    {item.label}
                    {item.badge > 0 && (
                      <span className="sidebar-badge" style={{
                        fontSize: '0.66rem', fontWeight: 700,
                        minWidth: 20, height: 20,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        borderRadius: 999,
                        background: isActive
                          ? 'linear-gradient(135deg, var(--accent-warm), var(--accent-gold))'
                          : 'rgba(192,138,72,0.16)',
                        color: isActive ? '#FFFFFF' : '#8B5A1E',
                        padding: '0 6px',
                        boxShadow: isActive ? '0 2px 6px rgba(192,138,72,0.35)' : undefined,
                      }}>
                        {item.badge}
                      </span>
                    )}
                  </span>
                )}

                {/* Collapsed badge dot */}
                {collapsed && item.badge > 0 && (
                  <span style={{
                    position: 'absolute', top: 6, left: 10,
                    width: 7, height: 7, borderRadius: '50%',
                    backgroundColor: 'var(--accent-warm)',
                    boxShadow: '0 0 6px rgba(192,138,72,0.7)',
                  }} />
                )}
              </Link>
            )
          })}
              </div>
            </div>
          ))}
        </nav>

        {/* ── COLLAPSE TOGGLE (desktop only) ── */}
        <div className="hidden lg:flex justify-center py-2 px-3">
          <button
            onClick={onToggleCollapse}
            className="sidebar-toggle-btn w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold"
            style={{
              color: 'var(--text-muted)',
              background: 'var(--hover-bg)',
              border: '1px solid var(--border-color)',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.color = '#8B5A1E'
              e.currentTarget.style.borderColor = 'rgba(192,138,72,0.35)'
              e.currentTarget.style.background = 'rgba(192,138,72,0.08)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = 'var(--text-muted)'
              e.currentTarget.style.borderColor = 'var(--border-color)'
              e.currentTarget.style.background = 'var(--hover-bg)'
            }}
            title={collapsed ? 'توسيع الشريط' : 'طي الشريط'}
          >
            <ChevronLeft
              size={15}
              style={{
                transform: collapsed ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 320ms cubic-bezier(0.34,1.56,0.64,1)',
              }}
            />
            {!collapsed && <span className="sidebar-label">طي الشريط</span>}
          </button>
        </div>

        {/* ── FOOTER ── */}
        <div style={{ borderTop: '1px solid var(--border-color)', padding: collapsed ? '12px 0' : '12px 14px' }}>
          {/* Avatar + info */}
          <div
            className="flex items-center mb-2"
            style={{ gap: collapsed ? 0 : 10, justifyContent: collapsed ? 'center' : 'flex-start' }}
          >
            <div style={{
              width: 36, height: 36, borderRadius: 10, flexShrink: 0,
              background: 'linear-gradient(135deg, var(--brand-from), var(--brand-to))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 10px rgba(26,27,32,0.18), inset 0 0 0 1px rgba(212,162,76,0.35)',
            }}>
              <span style={{ color: '#F6F4F0', fontSize: '0.85rem', fontWeight: 800, fontFamily: 'var(--font-noto-kufi, Noto Kufi Arabic)' }}>{initial}</span>
            </div>
            {!collapsed && (
              <div className="sidebar-label flex-1 min-w-0">
                <p style={{ color: 'var(--text-primary)', fontSize: '0.78rem', fontWeight: 700 }} className="truncate">
                  {profile?.name ?? roleLabel}
                </p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.66rem' }}>{roleLabel}</p>
              </div>
            )}
          </div>

          {/* Sign out — بارز دائماً (أحمر) حتى يكون واضحاً على الجوال */}
          <button
            onClick={handleSignOut}
            className="w-full flex items-center rounded-xl text-sm font-semibold active:scale-[0.98]"
            style={{
              color: 'var(--semantic-danger)',
              background: 'rgba(185,72,56,0.08)',
              border: '1px solid rgba(185,72,56,0.28)',
              gap: collapsed ? 0 : 8,
              padding: collapsed ? '10px 0' : '10px 12px',
              justifyContent: collapsed ? 'center' : 'flex-start',
              transition: 'background 200ms, transform 150ms, border-color 200ms',
              minHeight: 40,
            }}
            title={collapsed ? 'تسجيل الخروج' : undefined}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(185,72,56,0.16)'
              e.currentTarget.style.borderColor = 'rgba(185,72,56,0.45)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(185,72,56,0.08)'
              e.currentTarget.style.borderColor = 'rgba(185,72,56,0.28)'
            }}
          >
            <LogOut size={17} />
            {!collapsed && <span className="sidebar-label">تسجيل الخروج</span>}
          </button>
        </div>
      </aside>
    </>
  )
}
