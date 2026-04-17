'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, Users, UserCheck, BookOpen,
  CalendarCheck, Star, MessageSquare, FileText,
  Wallet, Settings, X, Grid3x3,
  ClipboardCheck, ListChecks, LogOut, ShieldCheck, ChevronLeft, Bell,
  ClipboardList, Target, ArrowLeftRight, BookHeart,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import { signOut } from '@/lib/auth'
import { UserRole } from '@/lib/auth'

interface NavItem {
  href: string
  icon: React.ElementType
  label: string
  badge: number
  roles?: UserRole[]
}

const navItems: NavItem[] = [
  // === المدير التنفيذي ===
  { href: '/admin/dashboard', icon: LayoutDashboard, label: 'لوحة التحكم',      badge: 0, roles: ['ceo'] },
  { href: '/tasks',       icon: ListChecks,      label: 'مهامي اليومية',          badge: 3,  roles: ['ceo'] },

  // === مدير الدفعة ===
  { href: '/manager/dashboard',    icon: LayoutDashboard, label: 'لوحة الدفعة',        badge: 0, roles: ['batch_manager'] },
  { href: '/manager/supervisors',  icon: UserCheck,       label: 'مشرفو دفعتي',        badge: 0, roles: ['batch_manager'] },
  { href: '/manager/assignments',  icon: ArrowLeftRight,  label: 'تكليف المشرفين',      badge: 0, roles: ['batch_manager'] },
  { href: '/followups/manager',    icon: ClipboardList,   label: 'متابعات الدفعة',      badge: 0, roles: ['batch_manager'] },
  { href: '/manager/reports',      icon: FileText,        label: 'تقارير الدفعة',       badge: 0, roles: ['batch_manager'] },

  // === المشرف / المعلم ===
  { href: '/dashboard',       icon: LayoutDashboard, label: 'لوحة التحكم',      badge: 0, roles: ['supervisor', 'teacher'] },
  { href: '/followups',       icon: ClipboardList,   label: 'المتابعات',         badge: 0, roles: ['supervisor', 'teacher', 'ceo'] },
  { href: '/followups/checklist', icon: ListChecks,  label: 'قائمة اليوم',       badge: 0, roles: ['supervisor', 'teacher'] },

  // === مشترك ===
  { href: '/batches',     icon: Grid3x3,         label: 'خريطة الطلاب والحفظ',   badge: 0 },
  { href: '/matn',        icon: BookOpen,        label: 'رصد المتون',             badge: 0 },
  { href: '/exams',       icon: ClipboardCheck,  label: 'جدول الاختبارات',        badge: 2 },
  { href: '/students',    icon: Users,           label: 'الطلاب',                 badge: 0 },
  { href: '/supervisors', icon: UserCheck,       label: 'المشرفون والمعلمون',     badge: 1,  roles: ['ceo'] },
  { href: '/attendance',  icon: CalendarCheck,   label: 'الحضور والغياب',         badge: 0 },
  { href: '/programs',    icon: Star,            label: 'البرامج التربوية',       badge: 2 },
  { href: '/meetings',    icon: MessageSquare,   label: 'الاجتماعات',             badge: 1 },
  { href: '/admin/bulk-plan', icon: Target,      label: 'إنشاء خطة جماعي',        badge: 0,  roles: ['ceo'] },
  { href: '/matn/manage',     icon: BookOpen,    label: 'إدارة المتون',            badge: 0,  roles: ['ceo'] },
  { href: '/reminders/saved', icon: BookHeart,   label: 'التذكيرات المحفوظة',    badge: 0 },
  { href: '/reports',         icon: FileText,     label: 'التقارير',               badge: 0 },
  { href: '/notifications',   icon: Bell,         label: 'الإشعارات',              badge: 0 },
  { href: '/budget',      icon: Wallet,          label: 'الميزانية والعهد',       badge: 5,  roles: ['ceo'] },
  { href: '/admin/users', icon: ShieldCheck,     label: 'إدارة الحسابات',         badge: 0,  roles: ['ceo'] },
  { href: '/settings',    icon: Settings,        label: 'الإعدادات',              badge: 0,  roles: ['ceo'] },
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
  const { theme } = useTheme()
  const role = profile?.role ?? 'ceo'

  const visibleItems = navItems.filter(item => !item.roles || item.roles.includes(role))

  const handleSignOut = async () => {
    await signOut()
    router.replace('/login')
  }

  const roleLabels: Record<string, string> = { ceo: 'المدير التنفيذي', batch_manager: 'مدير الدفعة', supervisor: 'مشرف', teacher: 'معلم' }
  const roleLabel  = roleLabels[role] ?? 'مستخدم'
  const initial    = profile?.name?.charAt(0) ?? 'م'
  const width      = collapsed ? 68 : 260

  return (
    <>
      {/* Mobile overlay */}
      <div
        className={`fixed inset-0 z-40 lg:hidden transition-all duration-300 ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}
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
          style={{ minHeight: 72, justifyContent: collapsed ? 'center' : 'space-between' }}
        >
          {/* Logo + name */}
          <div className="flex items-center gap-3 min-w-0">
            {collapsed ? (
              <BookOpen size={22} style={{ color: '#6366f1', flexShrink: 0 }} />
            ) : (
              <div className="sidebar-label flex items-center gap-2.5 min-w-0">
                <BookOpen size={20} style={{ color: '#6366f1', flexShrink: 0 }} />
                <div className="min-w-0">
                  <p style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--text-primary)', margin: 0, lineHeight: 1.2 }}>المواهب الناشئة</p>
                  <p style={{ fontWeight: 400, fontSize: '0.6rem', color: 'var(--text-muted)', margin: 0, opacity: 0.7 }}>Emerging Talent</p>
                </div>
              </div>
            )}
          </div>

          {/* Mobile close */}
          {!collapsed && (
            <button
              onClick={onClose}
              className="lg:hidden p-1.5 flex-shrink-0"
              style={{ color: 'var(--text-muted)', borderRadius: 6, transition: 'color 200ms, background 200ms' }}
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
        <nav className="flex-1 px-2 py-3 overflow-y-auto overflow-x-hidden space-y-0.5">
          {visibleItems.map(item => {
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
                  padding: collapsed ? '10px 0' : '9px 12px',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  borderRadius: 8,
                  backgroundColor: isActive ? 'rgba(99,102,241,0.1)' : 'transparent',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                  transition: 'all 200ms ease',
                  textDecoration: 'none',
                  minHeight: 40,
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
                    e.currentTarget.style.color = 'var(--text-muted)'
                    e.currentTarget.style.transform = ''
                  }
                }}
              >
                {/* Active accent bar */}
                {isActive && (
                  <span style={{
                    position: 'absolute', left: 0, top: '50%',
                    transform: 'translateY(-50%)',
                    width: 3, height: '65%',
                    backgroundColor: '#6366f1',
                    borderRadius: '0 3px 3px 0',
                    boxShadow: '0 0 8px rgba(99,102,241,0.6)',
                  }} />
                )}

                {/* Icon */}
                <Icon
                  size={18}
                  className="flex-shrink-0"
                  style={{
                    color: isActive ? '#6366f1' : undefined,
                    filter: isActive ? 'drop-shadow(0 0 6px rgba(99,102,241,0.5))' : undefined,
                    transition: 'color 200ms, filter 200ms, transform 200ms',
                  }}
                />

                {/* Label + badge */}
                {!collapsed && (
                  <span className="sidebar-label flex-1 flex items-center justify-between text-sm font-medium">
                    {item.label}
                    {item.badge > 0 && (
                      <span className="sidebar-badge" style={{
                        fontSize: '0.65rem', fontWeight: 700,
                        minWidth: 20, height: 18,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        borderRadius: 6,
                        backgroundColor: 'rgba(99,102,241,0.15)',
                        color: '#818cf8',
                        padding: '0 5px',
                      }}>
                        {item.badge}
                      </span>
                    )}
                  </span>
                )}

                {/* Collapsed badge dot */}
                {collapsed && item.badge > 0 && (
                  <span style={{
                    position: 'absolute', top: 6, left: 8,
                    width: 7, height: 7, borderRadius: '50%',
                    backgroundColor: '#6366f1',
                    boxShadow: '0 0 6px rgba(99,102,241,0.7)',
                  }} />
                )}
              </Link>
            )
          })}
        </nav>

        {/* ── COLLAPSE TOGGLE (desktop only) ── */}
        <div className="hidden lg:flex justify-center py-2 px-3">
          <button
            onClick={onToggleCollapse}
            className="sidebar-toggle-btn w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium"
            style={{
              color: 'var(--text-muted)',
              background: 'var(--hover-bg)',
              border: '1px solid var(--border-color)',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.color = '#6366f1'
              e.currentTarget.style.borderColor = 'rgba(99,102,241,0.35)'
              e.currentTarget.style.background = 'rgba(99,102,241,0.06)'
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
              width: 32, height: 32, borderRadius: 8, flexShrink: 0,
              border: '1px solid rgba(99,102,241,0.35)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ color: '#6366f1', fontSize: '0.75rem', fontWeight: 700 }}>{initial}</span>
            </div>
            {!collapsed && (
              <div className="sidebar-label flex-1 min-w-0">
                <p style={{ color: 'var(--text-primary)', fontSize: '0.75rem', fontWeight: 600 }} className="truncate">
                  {profile?.name ?? roleLabel}
                </p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>{roleLabel}</p>
              </div>
            )}
          </div>

          {/* Sign out */}
          <button
            onClick={handleSignOut}
            className="w-full flex items-center rounded-lg text-sm"
            style={{
              color: 'var(--text-muted)',
              gap: collapsed ? 0 : 8,
              padding: collapsed ? '8px 0' : '7px 10px',
              justifyContent: collapsed ? 'center' : 'flex-start',
              transition: 'color 200ms, background 200ms',
            }}
            title={collapsed ? 'تسجيل الخروج' : undefined}
            onMouseEnter={e => {
              e.currentTarget.style.color = '#ef4444'
              e.currentTarget.style.background = 'rgba(239,68,68,0.06)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = 'var(--text-muted)'
              e.currentTarget.style.background = ''
            }}
          >
            <LogOut size={16} />
            {!collapsed && <span className="sidebar-label">تسجيل الخروج</span>}
          </button>
        </div>
      </aside>
    </>
  )
}
