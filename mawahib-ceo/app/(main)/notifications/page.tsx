'use client'
import { useState, useEffect, useCallback } from 'react'
import {
  Bell, CheckCheck, Trash2, Filter, RefreshCw,
  AlertTriangle, BarChart2, Trophy, Target, Info,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import {
  getNotifications, markNotificationRead, markAllRead,
  deleteNotification, type DBNotification,
} from '@/lib/db'

// ── Constants ──────────────────────────────────────────────────────────
const SEVERITY_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  error:   { bg: 'rgba(239,68,68,0.08)',   text: '#B94838', dot: '#B94838' },
  warning: { bg: 'rgba(245,158,11,0.08)',  text: '#C9972C', dot: '#C9972C' },
  success: { bg: 'rgba(34,197,94,0.08)',   text: '#5A8F67', dot: '#5A8F67' },
  info:    { bg: 'rgba(99,102,241,0.08)',  text: '#C08A48', dot: '#C08A48' },
}

const TYPE_META: Record<string, { icon: React.ReactNode; label: string }> = {
  escalation:       { icon: <AlertTriangle size={16} />, label: 'تصعيد' },
  report:           { icon: <BarChart2 size={16} />,     label: 'تقرير' },
  alert:            { icon: <Bell size={16} />,          label: 'تنبيه' },
  achievement:      { icon: <Trophy size={16} />,        label: 'إنجاز' },
  level_transition: { icon: <Target size={16} />,        label: 'انتقال مستوى' },
}

const FILTER_TABS = [
  { key: 'all',       label: 'الكل' },
  { key: 'unread',    label: 'غير مقروء' },
  { key: 'escalation', label: 'تصعيدات' },
  { key: 'report',    label: 'تقارير' },
  { key: 'alert',     label: 'تنبيهات' },
]

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)   return 'الآن'
  if (mins < 60)  return `منذ ${mins} دقيقة`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)   return `منذ ${hrs} ساعة`
  const days = Math.floor(hrs / 24)
  if (days < 7)   return `منذ ${days} يوم`
  return new Date(iso).toLocaleDateString('ar-SA-u-nu-latn')
}

// ── Main Component ─────────────────────────────────────────────────────
export default function NotificationsPage() {
  const { profile } = useAuth()
  const role = profile?.role ?? undefined

  const [notifications, setNotifications] = useState<DBNotification[]>([])
  const [loading, setLoading]   = useState(true)
  const [filter, setFilter]     = useState('all')
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true)
    else setRefreshing(true)
    try {
      const data = await getNotifications(role, 100)
      setNotifications(data)
    } catch { /* ignore */ } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [role])

  useEffect(() => { load() }, [load])

  // ── Derived ───────────────────────────────────────────────────────────
  const filtered = notifications.filter(n => {
    if (filter === 'unread') return !n.read
    if (filter === 'all')    return true
    return n.type === filter
  })

  const unreadCount = notifications.filter(n => !n.read).length

  // ── Actions ────────────────────────────────────────────────────────────
  const handleRead = async (n: DBNotification) => {
    if (n.read) return
    await markNotificationRead(n.id).catch(() => {})
    setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x))
  }

  const handleMarkAll = async () => {
    await markAllRead(role).catch(() => {})
    setNotifications(prev => prev.map(x => ({ ...x, read: true })))
  }

  const handleDelete = async (id: string) => {
    await deleteNotification(id).catch(() => {})
    setNotifications(prev => prev.filter(x => x.id !== id))
  }

  const handleClearRead = async () => {
    await fetch('/api/notifications?clear_read=true', { method: 'DELETE' }).catch(() => {})
    setNotifications(prev => prev.filter(x => !x.read))
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto space-y-4" dir="rtl">

      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Bell size={22} style={{ color: '#C08A48' }} />
            الإشعارات
          </h1>
          {unreadCount > 0 && (
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {unreadCount} إشعار غير مقروء
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => load(false)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm"
            style={{ border: '1px solid var(--border-soft)', color: 'var(--text-muted)', transition: 'all 150ms' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#C08A48'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-soft)'}
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            تحديث
          </button>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAll}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm"
              style={{ border: '1px solid var(--border-soft)', color: 'var(--text-muted)', transition: 'all 150ms' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = '#5A8F67'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-soft)'}
            >
              <CheckCheck size={14} />
              تعيين الكل كمقروء
            </button>
          )}
          {notifications.some(n => n.read) && (
            <button
              onClick={handleClearRead}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm"
              style={{ border: '1px solid var(--border-soft)', color: 'var(--text-muted)', transition: 'all 150ms' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#B94838'; e.currentTarget.style.color = '#B94838' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-soft)'; e.currentTarget.style.color = 'var(--text-muted)' }}
            >
              <Trash2 size={14} />
              حذف المقروءة
            </button>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div
        className="flex gap-1 p-1 rounded-xl overflow-x-auto"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-soft)' }}
      >
        {FILTER_TABS.map(tab => {
          const count = tab.key === 'all' ? notifications.length
            : tab.key === 'unread' ? unreadCount
            : notifications.filter(n => n.type === tab.key).length
          const active = filter === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-all"
              style={{
                fontWeight: active ? 600 : 400,
                backgroundColor: active ? 'var(--bg-card)' : 'transparent',
                color: active ? '#C08A48' : 'var(--text-muted)',
                boxShadow: active ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              <Filter size={13} />
              {tab.label}
              {count > 0 && (
                <span
                  className="text-xs rounded-full px-1.5 py-0.5"
                  style={{ backgroundColor: active ? 'rgba(99,102,241,0.12)' : 'var(--bg-card)', color: active ? '#C08A48' : 'var(--text-muted)', minWidth: '20px', textAlign: 'center' }}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Notification list */}
      {loading ? (
        <div className="py-20 flex justify-center">
          <svg className="animate-spin w-7 h-7" viewBox="0 0 24 24" fill="none" style={{ color: '#C08A48' }}>
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25"/>
            <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
          </svg>
        </div>
      ) : filtered.length === 0 ? (
        <div
          className="py-20 flex flex-col items-center gap-3 rounded-2xl"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-soft)' }}
        >
          <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: 'var(--bg-elevated)' }}>
            <Info size={28} style={{ color: 'var(--text-muted)' }} />
          </div>
          <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>لا توجد إشعارات</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(n => {
            const sev = SEVERITY_COLORS[n.severity] ?? SEVERITY_COLORS.info
            const meta = TYPE_META[n.type] ?? { icon: <Bell size={16} />, label: n.type }
            return (
              <div
                key={n.id}
                className="card-interactive flex gap-4 p-4 rounded-2xl cursor-pointer"
                style={{
                  background: n.read ? 'var(--bg-card)' : sev.bg,
                  border: `1px solid ${n.read ? 'var(--border-soft)' : sev.dot + '33'}`,
                  opacity: n.read ? 0.75 : 1,
                  transition: 'all 200ms',
                }}
                onClick={() => handleRead(n)}
              >
                {/* Icon */}
                <div
                  className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center mt-0.5"
                  style={{ backgroundColor: sev.bg, color: sev.text, border: `1px solid ${sev.dot}22` }}
                >
                  {meta.icon}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className="text-xs font-medium px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: sev.bg, color: sev.text }}
                        >
                          {meta.label}
                        </span>
                        {!n.read && (
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: sev.dot }} />
                        )}
                      </div>
                      <h3 className="text-sm font-semibold mt-1 leading-snug" style={{ color: 'var(--text-primary)' }}>
                        {n.title}
                      </h3>
                      <p className="text-sm mt-1 whitespace-pre-line" style={{ color: 'var(--text-muted)', lineHeight: '1.5' }}>
                        {n.body}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <button
                        onClick={e => { e.stopPropagation(); handleDelete(n.id) }}
                        className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100"
                        style={{ color: 'var(--text-muted)', transition: 'color 150ms, background-color 150ms' }}
                        onMouseEnter={e => { e.currentTarget.style.color = '#B94838'; e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.08)' }}
                        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.backgroundColor = 'transparent' }}
                      >
                        <Trash2 size={14} />
                      </button>
                      <span className="text-xs" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
                        {timeAgo(n.created_at)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
