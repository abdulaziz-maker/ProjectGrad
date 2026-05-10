'use client'
// ──────────────────────────────────────────────────────────────────────────
// بطاقة تنبيه "المتابعة الأسبوعية" — مدمجة وقابلة للطي
// تُعرض لـ CEO / مدير الدفعة (لا تُعرض للمشرف لأنها تكشف حالات مشرفين آخرين)
// المشرف يستخدم singleSupervisor=true لرؤية حالته فقط في صفحة /followups
// ──────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, UserCheck, Users } from 'lucide-react'
import Link from 'next/link'
import {
  type SupervisorWeeklyStatus,
  LEVEL_META,
  formatDaysSince,
} from '@/lib/supervisor-tracking'

interface Props {
  /** قائمة حالات المشرفين — تمرّر فارغة للإخفاء التلقائي */
  statuses: SupervisorWeeklyStatus[]
  /** عنوان البطاقة (يختلف حسب الدور) */
  title?: string
  /** هل هذه بطاقة لمشرف واحد (يشوف نفسه) أم قائمة مشرفين؟ */
  singleSupervisor?: boolean
  /** المحتوى يُعرض فقط عند وجود تأخير — false يعرض حتى في الحالة الخضراء */
  alertsOnly?: boolean
  /** قابلية الطي — مفيد للوحات مزدحمة. الافتراضي: مغلق عندما alertsOnly=true */
  collapsible?: boolean
  /** الافتراضي: مفتوح أو مغلق عند التحميل */
  defaultOpen?: boolean
}

export default function SupervisorTrackingAlert({
  statuses,
  title = 'المتابعة الأسبوعية للمشرفين',
  singleSupervisor = false,
  alertsOnly = false,
  collapsible = false,
  defaultOpen = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen)

  if (statuses.length === 0) return null

  const withIssues = statuses.filter(s => s.worstLevel !== 'ok')
  const allOk = withIssues.length === 0
  if (alertsOnly && allOk) return null

  const totalPending = statuses.reduce((acc, s) => acc + s.pendingThisWeek, 0)
  const totalStudents = statuses.reduce((acc, s) => acc + s.totalStudents, 0)
  const hasCritical = statuses.some(s => s.worstLevel === 'critical')

  const accentColor = hasCritical ? '#B94838' : !allOk ? '#C08A48' : '#5A8F67'
  const accentBg = hasCritical
    ? 'rgba(185,72,56,0.10)'
    : !allOk
    ? 'rgba(192,138,72,0.10)'
    : 'rgba(90,143,103,0.10)'
  const accentBorder = hasCritical
    ? 'rgba(185,72,56,0.30)'
    : !allOk
    ? 'rgba(192,138,72,0.30)'
    : 'rgba(90,143,103,0.30)'

  // ─── الشكل المدمج: شريط واحد + زر طي ─────────────────────────
  return (
    <div
      className="rounded-xl overflow-hidden transition-all"
      style={{
        background: accentBg,
        border: `1px solid ${accentBorder}`,
      }}
    >
      {/* الشريط العلوي — دائماً ظاهر */}
      <button
        type="button"
        onClick={() => collapsible && setOpen(o => !o)}
        disabled={!collapsible}
        className={`w-full flex items-center gap-3 px-4 py-2.5 text-right ${collapsible ? 'cursor-pointer hover:opacity-90' : 'cursor-default'}`}
      >
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: accentColor, color: '#fff' }}
        >
          {allOk ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-[13px] truncate" style={{ color: 'var(--text-primary)' }}>
              {title}
            </span>
            {!allOk && (
              <span
                className="text-[11px] font-mono font-bold px-1.5 py-0.5 rounded"
                style={{ background: accentColor, color: '#fff' }}
              >
                {totalPending}/{totalStudents}
              </span>
            )}
          </div>
          {!allOk && (
            <p className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
              {singleSupervisor
                ? `${totalPending} طالب لم يُتابعوا هذا الأسبوع`
                : `${withIssues.length} مشرف بحاجة إجراء — ${totalPending} طالب`}
            </p>
          )}
        </div>

        {collapsible && (
          <div className="flex-shrink-0" style={{ color: accentColor }}>
            {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        )}
      </button>

      {/* التفاصيل — تظهر فقط عند الفتح أو إذا لم يكن قابل للطي */}
      {(!collapsible || open) && !allOk && (
        <div className="px-3 pb-3 pt-1 space-y-1.5">
          {withIssues
            .sort((a, b) => b.pendingThisWeek - a.pendingThisWeek)
            .map(st => {
              const meta = LEVEL_META[st.worstLevel]
              return (
                <div
                  key={st.supervisorId}
                  className="rounded-lg px-3 py-2"
                  style={{ background: 'var(--bg-card, #fff)', border: `1px solid ${meta.border}` }}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap mb-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <UserCheck className="w-3.5 h-3.5 flex-shrink-0" style={{ color: meta.color }} />
                      <span className="font-semibold text-[12px] truncate" style={{ color: 'var(--text-primary)' }}>
                        {singleSupervisor ? 'طلابك المتأخرون' : st.supervisorName}
                      </span>
                      {!singleSupervisor && (
                        <span
                          className="text-[9px] px-1.5 py-0.5 rounded font-bold flex-shrink-0"
                          style={{ background: meta.bg, color: meta.color }}
                        >
                          {meta.label}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] flex items-center gap-1 font-medium font-mono" style={{ color: 'var(--text-muted)' }}>
                      <Users className="w-3 h-3" />
                      {st.followedThisWeek}/{st.totalStudents}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {st.overdueStudents.slice(0, 5).map(s => {
                      const lm = LEVEL_META[s.level]
                      return (
                        <Link
                          key={s.studentId}
                          href={`/students/${s.studentId}`}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition hover:opacity-80"
                          style={{ background: lm.bg, color: lm.color, border: `1px solid ${lm.border}` }}
                        >
                          <span>{s.studentName}</span>
                          <span className="font-mono opacity-70">·{formatDaysSince(s.daysSince)}</span>
                        </Link>
                      )
                    })}
                    {st.overdueStudents.length > 5 && (
                      <span
                        className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono"
                        style={{ color: 'var(--text-muted)', background: 'var(--bg-subtle)' }}
                      >
                        +{st.overdueStudents.length - 5}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
        </div>
      )}
    </div>
  )
}
