'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Bell, Menu, Sun, Moon, CheckCheck, Trash2, ExternalLink } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import { useRouter } from 'next/navigation'
import {
  getNotifications, getUnreadCount, markNotificationRead,
  markAllRead, deleteNotification, type DBNotification,
} from '@/lib/db'

interface HeaderProps { onMenuClick: () => void }

const SEVERITY_COLORS: Record<string, string> = {
  error:   '#ef4444',
  warning: '#f59e0b',
  success: '#22c55e',
  info:    '#6366f1',
}

const TYPE_ICONS: Record<string, string> = {
  escalation:       '🔴',
  report:           '📊',
  alert:            '⚠️',
  achievement:      '🏆',
  level_transition: '🎯',
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)   return 'الآن'
  if (mins < 60)  return `منذ ${mins} د`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)   return `منذ ${hrs} س`
  return `منذ ${Math.floor(hrs / 24)} ي`
}

export default function Header({ onMenuClick }: HeaderProps) {
  const { profile } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const router = useRouter()

  const [notifications, setNotifications] = useState<DBNotification[]>([])
  const [unreadCount, setUnreadCount]     = useState(0)
  const [open, setOpen]                   = useState(false)
  const [loading, setLoading]             = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const role = profile?.role ?? undefined

  // ── جلب عدد غير المقروء دورياً ──────────────────────────────────────
  const fetchCount = useCallback(async () => {
    try { setUnreadCount(await getUnreadCount(role)) } catch { /* ignore */ }
  }, [role])

  useEffect(() => {
    fetchCount()
    const id = setInterval(fetchCount, 60_000)   // كل دقيقة
    return () => clearInterval(id)
  }, [fetchCount])

  // ── جلب القائمة عند الفتح ────────────────────────────────────────────
  const openDropdown = async () => {
    if (open) { setOpen(false); return }
    setOpen(true)
    setLoading(true)
    try {
      const data = await getNotifications(role, 20)
      setNotifications(data)
    } catch { /* ignore */ } finally { setLoading(false) }
  }

  // ── إغلاق عند الضغط خارج ────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleMarkRead = async (n: DBNotification) => {
    if (n.read) return
    await markNotificationRead(n.id).catch(() => {})
    setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x))
    setUnreadCount(c => Math.max(0, c - 1))
  }

  const handleMarkAll = async () => {
    await markAllRead(role).catch(() => {})
    setNotifications(prev => prev.map(x => ({ ...x, read: true })))
    setUnreadCount(0)
  }

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    await deleteNotification(id).catch(() => {})
    setNotifications(prev => prev.filter(x => x.id !== id))
    fetchCount()
  }

  // ── Labels ───────────────────────────────────────────────────────────
  const roleLabel = profile?.role === 'ceo' ? 'المدير التنفيذي'
    : profile?.role === 'supervisor' ? 'مشرف'
    : profile?.role === 'teacher'    ? 'معلم' : ''
  const displayName = profile?.name ?? roleLabel
  const initial     = displayName?.charAt(0) ?? 'م'

  return (
    <header
      className="animate-fade-in sticky top-0 z-30 px-4 sm:px-6 py-3 flex items-center justify-between"
      style={{
        background: 'var(--bg-header)',
        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--border-color)',
      }}
    >
      {/* Right: menu + title */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="w-10 h-10 flex items-center justify-center lg:hidden"
          style={{ borderRadius: '6px', border: '1px solid var(--border-soft)', color: 'var(--text-muted)', transition: 'color 200ms,background-color 200ms' }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.backgroundColor = 'var(--hover-bg)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)';   e.currentTarget.style.backgroundColor = 'transparent' }}
        >
          <Menu className="w-5 h-5" />
        </button>
        <div>
          <h1 className="font-semibold text-sm sm:text-base" style={{ color: 'var(--text-primary)' }}>
            المواهب الناشئة
          </h1>
          <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {new Date().toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
      </div>

      {/* Left: actions */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="w-9 h-9 flex items-center justify-center"
          style={{ borderRadius: '6px', color: 'var(--text-muted)', transition: 'color 200ms,background-color 200ms' }}
          onMouseEnter={e => { e.currentTarget.style.color = '#6366f1'; e.currentTarget.style.backgroundColor = 'rgba(99,102,241,0.08)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.backgroundColor = 'transparent' }}
          title={theme === 'dark' ? 'النمط النهاري' : 'النمط الليلي'}
        >
          {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
        </button>

        {/* Notification bell + dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={openDropdown}
            className="relative w-9 h-9 flex items-center justify-center"
            style={{ borderRadius: '6px', color: open ? '#6366f1' : 'var(--text-muted)', transition: 'color 200ms,background-color 200ms', backgroundColor: open ? 'rgba(99,102,241,0.08)' : 'transparent' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)' }}
            onMouseLeave={e => { if (!open) e.currentTarget.style.color = 'var(--text-muted)' }}
            title="الإشعارات"
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span
                className="absolute top-1 left-1 min-w-[16px] h-4 rounded-full flex items-center justify-center text-white animate-pulse"
                style={{ fontSize: '10px', fontWeight: 700, backgroundColor: '#ef4444', boxShadow: '0 0 8px rgba(239,68,68,0.5)', padding: '0 3px' }}
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {/* Dropdown */}
          {open && (
            <div
              className="absolute left-0 mt-2 w-80 sm:w-96 rounded-xl overflow-hidden shadow-2xl"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', zIndex: 50, top: '100%' }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border-soft)' }}>
                <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  الإشعارات {unreadCount > 0 && <span className="text-xs font-normal" style={{ color: '#ef4444' }}>({unreadCount} جديد)</span>}
                </span>
                <div className="flex items-center gap-2">
                  {unreadCount > 0 && (
                    <button onClick={handleMarkAll} title="تعيين الكل كمقروء" style={{ color: 'var(--text-muted)', transition: 'color 200ms' }} onMouseEnter={e => e.currentTarget.style.color = '#6366f1'} onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
                      <CheckCheck size={15} />
                    </button>
                  )}
                  <button onClick={() => { setOpen(false); router.push('/notifications') }} title="عرض الكل" style={{ color: 'var(--text-muted)', transition: 'color 200ms' }} onMouseEnter={e => e.currentTarget.style.color = '#6366f1'} onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
                    <ExternalLink size={14} />
                  </button>
                </div>
              </div>

              {/* List */}
              <div className="overflow-y-auto" style={{ maxHeight: '360px' }}>
                {loading ? (
                  <div className="py-10 flex justify-center" style={{ color: 'var(--text-muted)' }}>
                    <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></svg>
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="py-10 text-center text-sm" style={{ color: 'var(--text-muted)' }}>لا توجد إشعارات</div>
                ) : (
                  notifications.map(n => (
                    <div
                      key={n.id}
                      onClick={() => handleMarkRead(n)}
                      className="flex gap-3 px-4 py-3 cursor-pointer"
                      style={{ borderBottom: '1px solid var(--border-soft)', backgroundColor: n.read ? 'transparent' : 'rgba(99,102,241,0.04)', transition: 'background-color 150ms' }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--hover-bg)')}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = n.read ? 'transparent' : 'rgba(99,102,241,0.04)')}
                    >
                      {/* Severity indicator */}
                      <div className="shrink-0 mt-0.5 w-1.5 rounded-full self-stretch" style={{ backgroundColor: SEVERITY_COLORS[n.severity] ?? '#6366f1', opacity: n.read ? 0.3 : 1 }} />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium leading-snug truncate" style={{ color: n.read ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                            {TYPE_ICONS[n.type] ?? '🔔'} {n.title}
                          </p>
                          <button
                            onClick={e => handleDelete(n.id, e)}
                            className="shrink-0 opacity-0 group-hover:opacity-100"
                            style={{ color: 'var(--text-muted)', transition: 'color 150ms, opacity 150ms' }}
                            onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                            title="حذف"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                        <p className="text-xs mt-0.5 line-clamp-2" style={{ color: 'var(--text-muted)' }}>{n.body}</p>
                        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>{timeAgo(n.created_at)}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Footer */}
              <button
                onClick={() => { setOpen(false); router.push('/notifications') }}
                className="w-full py-2.5 text-sm font-medium"
                style={{ color: '#6366f1', borderTop: '1px solid var(--border-soft)', transition: 'background-color 150ms' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(99,102,241,0.06)')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                عرض جميع الإشعارات
              </button>
            </div>
          )}
        </div>

        <div className="hidden sm:block mx-1" style={{ width: '1px', height: '24px', backgroundColor: 'var(--border-color)' }} />

        {/* Avatar */}
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 flex items-center justify-center text-sm font-semibold shrink-0" style={{ borderRadius: '6px', backgroundColor: 'var(--bg-elevated)', border: '1px solid rgba(99,102,241,0.3)', color: '#6366f1' }}>
            {initial}
          </div>
          <div className="hidden sm:block leading-tight">
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{displayName}</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{roleLabel}</p>
          </div>
        </div>
      </div>
    </header>
  )
}
