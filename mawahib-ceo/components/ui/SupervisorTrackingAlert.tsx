'use client'
// ──────────────────────────────────────────────────────────────────────────
// بطاقة تنبيه "المتابعة الأسبوعية" — تُعرض لـ CEO / مدير الدفعة / المشرف
// تكشف بوضوح أي طالب لم يُتابَع هذا الأسبوع + ترسل إشارة بصرية.
// ──────────────────────────────────────────────────────────────────────────

import { AlertTriangle, CheckCircle2, UserCheck, Users } from 'lucide-react'
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
}

export default function SupervisorTrackingAlert({
  statuses,
  title = 'المتابعة الأسبوعية للمشرفين',
  singleSupervisor = false,
  alertsOnly = false,
}: Props) {
  if (statuses.length === 0) return null

  const withIssues = statuses.filter(s => s.worstLevel !== 'ok')
  const allOk = withIssues.length === 0

  if (alertsOnly && allOk) return null

  const totalPending = statuses.reduce((acc, s) => acc + s.pendingThisWeek, 0)
  const totalStudents = statuses.reduce((acc, s) => acc + s.totalStudents, 0)
  const hasCritical = statuses.some(s => s.worstLevel === 'critical')

  return (
    <div
      className="card-static p-5"
      style={{
        borderRight: hasCritical
          ? '4px solid #B94838'
          : !allOk
          ? '4px solid #C08A48'
          : '4px solid #5A8F67',
      }}
    >
      <div className="flex items-start gap-3 mb-4 flex-wrap">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{
            background: hasCritical
              ? 'rgba(185,72,56,0.12)'
              : !allOk
              ? 'rgba(192,138,72,0.12)'
              : 'rgba(90,143,103,0.12)',
            color: hasCritical ? '#B94838' : !allOk ? '#8B5A1E' : '#5A8F67',
          }}
        >
          {allOk ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>
            {title}
          </h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {allOk ? (
              singleSupervisor
                ? `تم متابعة جميع طلابك هذا الأسبوع (${statuses[0].totalStudents})`
                : `جميع المشرفين تابعوا طلابهم هذا الأسبوع — ${totalStudents} طالب`
            ) : (
              <>
                <span className="font-mono font-bold" style={{ color: hasCritical ? '#B94838' : '#8B5A1E' }}>
                  {totalPending}
                </span>
                {' '}من{' '}
                <span className="font-mono">{totalStudents}</span>
                {' '}طالب لم يُتابعوا هذا الأسبوع
                {!singleSupervisor && (
                  <>
                    {' — '}
                    <span className="font-mono font-bold">{withIssues.length}</span>
                    {' '}مشرف بحاجة إجراء
                  </>
                )}
              </>
            )}
          </p>
        </div>
      </div>

      {!allOk && (
        <div className="space-y-2.5">
          {statuses
            .filter(s => s.worstLevel !== 'ok')
            .sort((a, b) => b.pendingThisWeek - a.pendingThisWeek)
            .map(st => {
              const meta = LEVEL_META[st.worstLevel]
              return (
                <div
                  key={st.supervisorId}
                  className="rounded-xl p-3.5"
                  style={{ background: meta.bg, border: `1px solid ${meta.border}` }}
                >
                  <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <UserCheck className="w-4 h-4 flex-shrink-0" style={{ color: meta.color }} />
                      <span className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                        {singleSupervisor ? 'طلابك المتأخرون' : st.supervisorName}
                      </span>
                      {!singleSupervisor && (
                        <span
                          className="text-[10px] px-2 py-0.5 rounded-full font-bold flex-shrink-0"
                          style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}
                        >
                          {meta.label}
                        </span>
                      )}
                    </div>
                    <span className="text-xs flex items-center gap-1.5 font-medium" style={{ color: 'var(--text-secondary)' }}>
                      <Users className="w-3 h-3" />
                      <span className="font-mono">{st.followedThisWeek}/{st.totalStudents}</span>
                      <span style={{ color: 'var(--text-muted)' }}>مُتابَع</span>
                    </span>
                  </div>

                  {/* قائمة الطلاب المتأخرين — أعلى ٤ */}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {st.overdueStudents.slice(0, 6).map(s => {
                      const lm = LEVEL_META[s.level]
                      return (
                        <Link
                          key={s.studentId}
                          href={`/students/${s.studentId}`}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition hover:opacity-80"
                          style={{ background: lm.bg, color: lm.color, border: `1px solid ${lm.border}` }}
                        >
                          <span>{s.studentName}</span>
                          <span className="font-mono opacity-75">· {formatDaysSince(s.daysSince)}</span>
                        </Link>
                      )
                    })}
                    {st.overdueStudents.length > 6 && (
                      <span
                        className="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-mono"
                        style={{ color: 'var(--text-muted)', background: 'var(--bg-subtle)' }}
                      >
                        + {st.overdueStudents.length - 6}
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
