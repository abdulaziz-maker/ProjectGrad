'use client'
/**
 * أجزاء تفاعلية لصفحة /admin/activity:
 *  - زر إعادة التحميل (يستدعي server action `refreshActivity`)
 *  - toggle لإظهار/إخفاء معلومات الحلقة (state محلي)
 *  - بطاقة "آخر المتصلين" التي تستهلك الـtoggle
 *
 * ⚠️ ملف جديد — لا يُعدّل أي ملف موجود.
 */
import { useState, useTransition } from 'react'
import { RefreshCw, Eye, EyeOff, Loader2, GraduationCap, Clock } from 'lucide-react'
import { refreshActivity } from './actions'

// ─── زر إعادة التحميل ─────────────────────────────────────
export function RefreshButton() {
  const [isPending, startTransition] = useTransition()
  return (
    <button
      onClick={() => startTransition(() => { void refreshActivity() })}
      disabled={isPending}
      className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition active:scale-95 disabled:opacity-50"
      style={{
        background: 'rgba(53,107,110,0.10)',
        color: '#235052',
        border: '1px solid rgba(53,107,110,0.35)',
      }}
      aria-label="إعادة التحميل"
    >
      {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
      {isPending ? 'يحدّث…' : 'إعادة التحميل'}
    </button>
  )
}

// ─── بطاقة آخر المتصلين + toggle ──────────────────────────
export interface OnlineUserRow {
  user_id: string
  name: string
  role: string | null
  batch_id: number | null
  last_activity: string
  page_path: string
}

function timeAgoAr(iso: string): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (diffSec < 60)  return 'الآن'
  if (diffSec < 3600) {
    const m = Math.floor(diffSec / 60)
    return `قبل ${m} د`
  }
  if (diffSec < 86400) {
    const h = Math.floor(diffSec / 3600)
    return `قبل ${h} س`
  }
  const d = Math.floor(diffSec / 86400)
  return `قبل ${d} يوم`
}

function roleLabelAr(role: string | null): string {
  switch (role) {
    case 'ceo':            return 'مدير تنفيذي'
    case 'batch_manager':  return 'مدير دفعة'
    case 'supervisor':     return 'مشرف'
    case 'teacher':        return 'معلم'
    case 'records_officer':return 'موظف سجلات'
    default:               return role ?? '—'
  }
}

export function OnlineUsersCard({ users }: { users: OnlineUserRow[] }) {
  const [showHalqa, setShowHalqa] = useState(true)

  return (
    <section
      className="rounded-2xl p-4 sm:p-5"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-soft)' }}
    >
      <header className="flex items-center justify-between gap-3 mb-3 sm:mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#5A8F67' }} />
          <h2 className="font-bold text-sm sm:text-base truncate" style={{ color: 'var(--text-primary)' }}>
            آخر المتصلين <span className="font-mono text-xs opacity-70">({users.length})</span>
          </h2>
        </div>
        <button
          onClick={() => setShowHalqa(v => !v)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition active:scale-95 shrink-0"
          style={{
            background: showHalqa ? 'rgba(192,138,72,0.12)' : 'var(--bg-elevated)',
            color: showHalqa ? '#8B5A1E' : 'var(--text-muted)',
            border: '1px solid var(--border-soft)',
          }}
        >
          {showHalqa ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
          {showHalqa ? 'إخفاء الحلقة' : 'إظهار الحلقة'}
        </button>
      </header>

      {users.length === 0 ? (
        <p className="text-center text-xs py-8" style={{ color: 'var(--text-muted)' }}>
          لا توجد جلسات نشطة في آخر ٢٤ ساعة.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {users.map((u, i) => (
            <li
              key={u.user_id}
              className="flex items-center gap-3 px-3 py-2 rounded-xl"
              style={{
                background: i % 2 === 0 ? 'var(--bg-subtle)' : 'transparent',
                border: '1px solid var(--border-faint)',
              }}
            >
              <span
                className="font-mono text-[10px] w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                style={{ background: 'rgba(53,107,110,0.10)', color: '#235052' }}
              >
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
              <span
                className="inline-flex items-center gap-1 text-[10.5px] font-bold shrink-0"
                style={{ color: 'var(--text-muted)' }}
                title={u.page_path}
              >
                <Clock className="w-3 h-3" />
                {timeAgoAr(u.last_activity)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
