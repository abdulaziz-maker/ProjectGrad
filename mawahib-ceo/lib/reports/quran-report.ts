// ══════════════════════════════════════════════════════════════════════════
// محرّك تقرير القرآن — يحسب تقريراً شاملاً لدفعة في فترة محددة
// الأداء: 4 queries بالتوازي + lookup maps + zero N+1
// ══════════════════════════════════════════════════════════════════════════

import { supabase } from '@/lib/supabase'
import {
  getStudents, getDailyFollowups, getExams,
  type DBStudent, type DBExam,
} from '@/lib/db'
import type { DailyFollowup } from '@/lib/quran-followup'

// ─── الأنواع ─────────────────────────────────────────────────────────────
export type ReportPeriod = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom'

export interface PeriodRange {
  type:  ReportPeriod
  from:  string   // YYYY-MM-DD
  to:    string   // YYYY-MM-DD
  label: string
}

export interface StudentReportRow {
  studentId:        string
  name:             string
  expected:         number   // مجموع expected_position في الفترة
  actual:           number   // مجموع actual_position في الفترة
  gap:              number   // expected - actual
  records:          number   // عدد سجلات الفترة
  errorsCount:      number   // أيام delay_reasons غير فارغة
  alertsCount:      number   // أيام gap > 2
  hesitationsCount: number   // أيام near_review/far_review قصيرة
  examsTotal:       number
  examsPassed:      number
  examsFailed:      number
  attendancePct:    number   // 0-100
}

export interface BatchSummary {
  totalStudents:  number
  totalRecords:   number
  avgGap:         number
  avgCompletion:  number   // نسبة الإنجاز %
  avgAttendance:  number
  totalExams:     number
  examsPassed:    number
}

export interface QuranReport {
  batch:       { id: number; name: string }
  period:      PeriodRange
  students:    StudentReportRow[]
  summary:     BatchSummary
  generatedAt: string
}

// ─── حساب النطاقات الزمنية ──────────────────────────────────────────────
export function computePeriodRange(
  period: ReportPeriod,
  customFrom?: string,
  customTo?: string,
): PeriodRange {
  const today = new Date()
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  const todayIso = iso(today)

  const back = (days: number) => {
    const d = new Date(today)
    d.setDate(d.getDate() - days)
    return iso(d)
  }

  switch (period) {
    case 'daily':
      return { type: 'daily', from: todayIso, to: todayIso, label: 'اليوم' }
    case 'weekly':
      return { type: 'weekly', from: back(6), to: todayIso, label: 'آخر 7 أيام' }
    case 'monthly':
      return { type: 'monthly', from: back(29), to: todayIso, label: 'آخر 30 يوم' }
    case 'quarterly':
      return { type: 'quarterly', from: back(89), to: todayIso, label: 'آخر 3 أشهر' }
    case 'yearly': {
      const start = new Date(today.getFullYear(), 0, 1)
      return { type: 'yearly', from: iso(start), to: todayIso, label: 'السنة الحالية' }
    }
    case 'custom':
      return {
        type: 'custom',
        from: customFrom ?? back(7),
        to:   customTo   ?? todayIso,
        label: `${customFrom ?? back(7)} ← ${customTo ?? todayIso}`,
      }
  }
}

// ─── جلب الحضور للفترة (filtered server-side) ──────────────────────────
async function fetchAttendanceRange(batchId: number, from: string, to: string) {
  const { data, error } = await supabase
    .from('attendance')
    .select('student_id,date,status')
    .eq('batch_id', String(batchId))
    .gte('date', from)
    .lte('date', to)
  if (error) { console.error('fetchAttendanceRange:', error); return [] }
  return data ?? []
}

// ─── الدالة الرئيسية ─────────────────────────────────────────────────────
/**
 * يبني تقريراً شاملاً لدفعة في فترة محددة.
 * 4 queries بالتوازي. الحسابات في الذاكرة عبر Maps (O(1) lookup).
 */
export async function buildQuranReport(params: {
  batchId:    number
  batchName:  string
  period:     ReportPeriod
  customFrom?: string
  customTo?:   string
}): Promise<QuranReport> {
  const range = computePeriodRange(params.period, params.customFrom, params.customTo)

  // 4 queries بالتوازي
  const [students, followups, exams, attendance] = await Promise.all([
    getStudents(),
    getDailyFollowups({ dateFrom: range.from, dateTo: range.to }),
    getExams(),
    fetchAttendanceRange(params.batchId, range.from, range.to),
  ])

  // ── فلتر طلاب الدفعة النشطين ────────────────────────────────────────
  const batchStudents: DBStudent[] = students.filter(
    s => s.batch_id === params.batchId && (s.status === 'active' || !s.status),
  )
  const batchStudentIds = new Set(batchStudents.map(s => s.id))

  // ── Lookup maps O(1) ────────────────────────────────────────────────
  const followupsByStudent = new Map<string, DailyFollowup[]>()
  for (const f of followups) {
    if (!batchStudentIds.has(f.student_id)) continue
    const list = followupsByStudent.get(f.student_id) ?? []
    list.push(f)
    followupsByStudent.set(f.student_id, list)
  }

  const examsByStudent = new Map<string, DBExam[]>()
  for (const e of exams) {
    if (!batchStudentIds.has(e.student_id)) continue
    if (e.date < range.from || e.date > range.to) continue
    const list = examsByStudent.get(e.student_id) ?? []
    list.push(e)
    examsByStudent.set(e.student_id, list)
  }

  const attendanceByStudent = new Map<string, { present: number; total: number }>()
  for (const a of attendance) {
    if (!batchStudentIds.has(a.student_id)) continue
    const acc = attendanceByStudent.get(a.student_id) ?? { present: 0, total: 0 }
    acc.total++
    if (a.status === 'present') acc.present++
    attendanceByStudent.set(a.student_id, acc)
  }

  // ── حساب كل طالب ───────────────────────────────────────────────────
  const rows: StudentReportRow[] = batchStudents.map(s => {
    const fs = followupsByStudent.get(s.id) ?? []
    const exs = examsByStudent.get(s.id) ?? []
    const att = attendanceByStudent.get(s.id)

    let expected = 0, actual = 0
    let errorsCount = 0, alertsCount = 0, hesitationsCount = 0

    for (const f of fs) {
      expected += f.expected_position ?? 0
      actual   += f.actual_position ?? 0

      if (f.delay_reasons && f.delay_reasons.length > 0) errorsCount++
      if ((f.gap ?? 0) > 2) alertsCount++
      const nearLen = (f.near_review ?? '').trim().length
      const farLen  = (f.far_review ?? '').trim().length
      if (nearLen < 5 && farLen < 5 && fs.length > 0) hesitationsCount++
    }

    const examsPassed = exs.filter(e => (e.score ?? 0) >= 80 || e.status === 'passed').length
    const examsFailed = exs.filter(e => (e.score ?? 0) < 80 && e.status === 'failed').length

    return {
      studentId:       s.id,
      name:            s.name,
      expected,
      actual,
      gap:             expected - actual,
      records:         fs.length,
      errorsCount,
      alertsCount,
      hesitationsCount,
      examsTotal:      exs.length,
      examsPassed,
      examsFailed,
      attendancePct:   att && att.total > 0 ? Math.round((att.present / att.total) * 100) : 0,
    }
  })

  // ── ملخص الدفعة ────────────────────────────────────────────────────
  const totalRecords = rows.reduce((s, r) => s + r.records, 0)
  const sumExpected  = rows.reduce((s, r) => s + r.expected, 0)
  const sumActual    = rows.reduce((s, r) => s + r.actual, 0)
  const studentsWithRecords = rows.filter(r => r.records > 0)
  const avgGap = studentsWithRecords.length > 0
    ? Math.round((sumExpected - sumActual) / studentsWithRecords.length * 10) / 10
    : 0
  const avgCompletion = sumExpected > 0 ? Math.round((sumActual / sumExpected) * 100) : 0
  const studentsWithAttendance = rows.filter(r => r.attendancePct > 0 || (attendanceByStudent.get(r.studentId)?.total ?? 0) > 0)
  const avgAttendance = studentsWithAttendance.length > 0
    ? Math.round(studentsWithAttendance.reduce((s, r) => s + r.attendancePct, 0) / studentsWithAttendance.length)
    : 0

  const summary: BatchSummary = {
    totalStudents: rows.length,
    totalRecords,
    avgGap,
    avgCompletion,
    avgAttendance,
    totalExams:    rows.reduce((s, r) => s + r.examsTotal, 0),
    examsPassed:   rows.reduce((s, r) => s + r.examsPassed, 0),
  }

  return {
    batch:       { id: params.batchId, name: params.batchName },
    period:      range,
    students:    rows.sort((a, b) => b.gap - a.gap),   // الفجوة الأكبر أولاً
    summary,
    generatedAt: new Date().toISOString(),
  }
}

// ─── تقرير طالب واحد (timeline + جدول) ──────────────────────────────────
export interface StudentTimelinePoint {
  date:     string
  expected: number
  actual:   number
  gap:      number
}

export interface StudentReportDetail {
  studentId:  string
  studentName:string
  range:      PeriodRange
  timeline:   StudentTimelinePoint[]
  followups:  DailyFollowup[]
  weeklyStats: { week: string; errors: number; alerts: number; hesitations: number }[]
}

/**
 * تفاصيل طالب واحد للـcharts والجدول.
 */
export async function buildStudentReport(params: {
  studentId:  string
  studentName:string
  period:     ReportPeriod
  customFrom?:string
  customTo?:  string
}): Promise<StudentReportDetail> {
  const range = computePeriodRange(params.period, params.customFrom, params.customTo)

  const followups = await getDailyFollowups({
    studentId: params.studentId,
    dateFrom:  range.from,
    dateTo:    range.to,
  })

  const sorted = [...followups].sort((a, b) => a.followup_date.localeCompare(b.followup_date))

  const timeline: StudentTimelinePoint[] = sorted.map(f => ({
    date:     f.followup_date,
    expected: f.expected_position ?? 0,
    actual:   f.actual_position ?? 0,
    gap:      f.gap ?? 0,
  }))

  // تجميع أسبوعي
  const weekMap = new Map<string, { errors: number; alerts: number; hesitations: number }>()
  for (const f of sorted) {
    const week = weekStart(f.followup_date)
    const acc = weekMap.get(week) ?? { errors: 0, alerts: 0, hesitations: 0 }
    if (f.delay_reasons?.length) acc.errors++
    if ((f.gap ?? 0) > 2) acc.alerts++
    if ((f.near_review ?? '').trim().length < 5 && (f.far_review ?? '').trim().length < 5) acc.hesitations++
    weekMap.set(week, acc)
  }

  return {
    studentId:  params.studentId,
    studentName:params.studentName,
    range,
    timeline,
    followups:  sorted,
    weeklyStats:[...weekMap.entries()].map(([week, v]) => ({ week, ...v })),
  }
}

function weekStart(iso: string): string {
  const d = new Date(iso)
  const day = d.getDay()  // 0=Sun
  d.setDate(d.getDate() - day)
  return d.toISOString().slice(0, 10)
}
