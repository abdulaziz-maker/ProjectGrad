// ══════════════════════════════════════════════════════════════════════════
// متطلبات متابعة المشرفين الأسبوعية (Weekly Supervisor-Followup Tracking)
// ──────────────────────────────────────────────────────────────────────────
// لكل مشرف مجموعة من الطلاب (students.supervisor_id)، المطلوب أن يتابع كل
// طالب من طلابه **مرة واحدة على الأقل كل أسبوع**.
//
// إذا مرّ أسبوع كامل (7 أيام) بدون متابعة لأي طالب → يظهر تنبيه للمشرف
// ومدير الدفعة والمدير التنفيذي.
//
// المصدر الحقيقي: `students.last_followup` — يُحدَّث تلقائياً عند تسجيل أي
// متابعة يومية (انظر upsertDailyFollowup في lib/db.ts).
// ══════════════════════════════════════════════════════════════════════════

import type { DBStudent, DBSupervisor } from '@/lib/db'

export type OverdueLevel = 'ok' | 'due_soon' | 'overdue' | 'critical'

export interface SupervisorWeeklyStatus {
  supervisorId: string
  supervisorName: string
  batchId: number | null
  totalStudents: number
  followedThisWeek: number
  pendingThisWeek: number           // not followed up in last 7 days
  overdueStudents: OverdueStudent[]
  worstLevel: OverdueLevel          // highest severity across all students
  completionPct: number             // 0-100
}

export interface OverdueStudent {
  studentId: string
  studentName: string
  lastFollowup: string | null       // YYYY-MM-DD
  daysSince: number                 // integer days (Infinity if never)
  level: OverdueLevel
}

/** ‎أيام كاملة بين تاريخين (YYYY-MM-DD) */
function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(fromIso + 'T00:00:00')
  const b = new Date(toIso + 'T00:00:00')
  return Math.floor((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000))
}

export function getToday(): string {
  return new Date().toISOString().split('T')[0]
}

/** يحدد مستوى التأخر لطالب واحد بناءً على آخر تاريخ متابعة */
export function getOverdueLevel(lastFollowup: string | null, today = getToday()): { level: OverdueLevel; days: number } {
  if (!lastFollowup) {
    // لم يُتابَع مطلقاً → حرج
    return { level: 'critical', days: Infinity }
  }
  const d = daysBetween(lastFollowup, today)
  if (d < 0) return { level: 'ok', days: 0 }        // tarikh mostaqbali — treat as fresh
  if (d <= 5) return { level: 'ok', days: d }
  if (d === 6) return { level: 'due_soon', days: d } // يوم قبل انتهاء الأسبوع
  if (d <= 14) return { level: 'overdue', days: d }  // تجاوز الأسبوع
  return { level: 'critical', days: d }              // تجاوز أسبوعين
}

/** يحسب حالة المتابعة الأسبوعية لمشرف واحد */
export function computeSupervisorWeeklyStatus(
  supervisor: Pick<DBSupervisor, 'id' | 'name' | 'batch_id'>,
  students: DBStudent[],
  today = getToday(),
): SupervisorWeeklyStatus {
  const myStudents = students.filter(s => s.supervisor_id === supervisor.id && s.status === 'active')
  const overdue: OverdueStudent[] = []
  let followed = 0
  let worst: OverdueLevel = 'ok'

  const levelRank: Record<OverdueLevel, number> = { ok: 0, due_soon: 1, overdue: 2, critical: 3 }

  for (const s of myStudents) {
    const { level, days } = getOverdueLevel(s.last_followup, today)
    if (level === 'ok') {
      followed += 1
    } else {
      overdue.push({
        studentId: s.id,
        studentName: s.name,
        lastFollowup: s.last_followup,
        daysSince: days,
        level,
      })
      if (levelRank[level] > levelRank[worst]) worst = level
    }
  }

  const total = myStudents.length
  return {
    supervisorId: supervisor.id,
    supervisorName: supervisor.name,
    batchId: supervisor.batch_id,
    totalStudents: total,
    followedThisWeek: followed,
    pendingThisWeek: overdue.length,
    overdueStudents: overdue.sort((a, b) => b.daysSince - a.daysSince),
    worstLevel: worst,
    completionPct: total === 0 ? 100 : Math.round((followed / total) * 100),
  }
}

/** يحسب حالة كل المشرفين (للمدير التنفيذي أو لمدير الدفعة) */
export function computeAllSupervisorStatuses(
  supervisors: Pick<DBSupervisor, 'id' | 'name' | 'batch_id'>[],
  students: DBStudent[],
  today = getToday(),
): SupervisorWeeklyStatus[] {
  return supervisors
    .map(sup => computeSupervisorWeeklyStatus(sup, students, today))
    .filter(st => st.totalStudents > 0) // تجاهل المشرفين بدون طلاب
}

/** العنوان/النص المناسب لمستوى التأخر */
export const LEVEL_META: Record<OverdueLevel, { label: string; color: string; bg: string; border: string }> = {
  ok:        { label: 'مُتابَع',      color: '#5A8F67', bg: 'rgba(90,143,103,0.10)', border: 'rgba(90,143,103,0.30)' },
  due_soon:  { label: 'اقترب الموعد', color: '#8B5A1E', bg: 'rgba(192,138,72,0.12)', border: 'rgba(192,138,72,0.35)' },
  overdue:   { label: 'تأخّر',         color: '#B26A64', bg: 'rgba(178,106,100,0.12)', border: 'rgba(178,106,100,0.35)' },
  critical:  { label: 'حرج',           color: '#B94838', bg: 'rgba(185,72,56,0.12)',  border: 'rgba(185,72,56,0.40)' },
}

export function formatDaysSince(days: number): string {
  if (!Number.isFinite(days)) return 'لم يُتابَع بعد'
  if (days <= 0) return 'اليوم'
  if (days === 1) return 'أمس'
  if (days <= 6) return `${days} أيام`
  if (days <= 13) return 'أسبوع'
  if (days <= 20) return 'أسبوعان'
  return `${Math.floor(days / 7)} أسابيع`
}
