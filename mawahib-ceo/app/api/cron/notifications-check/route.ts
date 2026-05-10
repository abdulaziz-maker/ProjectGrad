import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { isCronAuthorized } from '@/lib/api-auth'
import {
  notifyStudentLag,
  notifyUpcomingExam,
  notifyMissingRecord,
  notifyAbsence,
} from '@/lib/notifications'

// ─── helpers ─────────────────────────────────────────────────────────────
function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function daysAgoIso(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

function daysAheadIso(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

// ─── فحص ١: تأخر الطلاب ─────────────────────────────────────────────────
// طلاب نشطون لم يُسجَّل لهم أي متابعة منذ 3 أيام أو أكثر
async function checkStudentLag(today: string): Promise<number> {
  const threshold = daysAgoIso(3)

  // آخر تاريخ متابعة لكل طالب
  const { data: recent } = await supabaseAdmin
    .from('daily_followups')
    .select('student_id, followup_date')
    .gte('followup_date', threshold)

  const recentSet = new Set((recent ?? []).map(r => r.student_id))

  // الطلاب النشطون الذين ليسوا في المجموعة
  const { data: students } = await supabaseAdmin
    .from('students')
    .select('id, name, batch_id')
    .eq('status', 'active')

  if (!students?.length) return 0

  // أقدم تاريخ متابعة لكل طالب متأخر
  const lagStudents = students.filter(s => !recentSet.has(s.id))
  if (!lagStudents.length) return 0

  const { data: lastDates } = await supabaseAdmin
    .from('daily_followups')
    .select('student_id, followup_date')
    .in('student_id', lagStudents.map(s => s.id))
    .order('followup_date', { ascending: false })

  const lastMap = new Map<string, string>()
  for (const row of lastDates ?? []) {
    if (!lastMap.has(row.student_id)) lastMap.set(row.student_id, row.followup_date)
  }

  let count = 0
  for (const s of lagStudents) {
    const last = lastMap.get(s.id) ?? daysAgoIso(30)
    const diffDays = Math.floor(
      (new Date(today).getTime() - new Date(last).getTime()) / 86400000
    )
    await notifyStudentLag({
      studentId: s.id, studentName: s.name,
      batchId: s.batch_id, lagDays: diffDays, today,
    })
    count++
  }
  return count
}

// ─── فحص ٢: اختبار قادم ─────────────────────────────────────────────────
// exam_candidates التي expected_date خلال يومين
async function checkUpcomingExams(today: string): Promise<number> {
  const soon = daysAheadIso(2)

  const { data: candidates } = await supabaseAdmin
    .from('exam_candidates')
    .select('student_id, student_name, batch_id, juz_number, expected_date')
    .gte('expected_date', today)
    .lte('expected_date', soon)

  if (!candidates?.length) return 0

  for (const c of candidates) {
    const examDate = c.expected_date ?? today
    const daysLeft = Math.round(
      (new Date(examDate).getTime() - new Date(today).getTime()) / 86400000
    )
    await notifyUpcomingExam({
      studentId: c.student_id, studentName: c.student_name,
      batchId: c.batch_id, examDate, juzNumber: c.juz_number,
      daysLeft: Math.max(0, daysLeft), today,
    })
  }
  return candidates.length
}

// ─── فحص ٣: معلم لم يسجّل ────────────────────────────────────────────────
// supervisors/teachers الذين لا يوجد لهم daily_followups لليوم
async function checkMissingRecords(today: string): Promise<number> {
  // مُشرفون/معلمون نشطون
  const { data: teachers } = await supabaseAdmin
    .from('profiles')
    .select('id, name, batch_id')
    .in('role', ['teacher', 'supervisor'])

  if (!teachers?.length) return 0

  // من سجّل اليوم
  const { data: todayRows } = await supabaseAdmin
    .from('daily_followups')
    .select('supervisor_id')
    .eq('followup_date', today)

  const recordedSet = new Set((todayRows ?? []).map(r => r.supervisor_id))

  // جلب أسماء الدفعات دفعة واحدة
  const { data: batches } = await supabaseAdmin
    .from('batches')
    .select('id, name')

  const batchMap = new Map((batches ?? []).map(b => [b.id, b.name]))

  let count = 0
  for (const t of teachers) {
    if (recordedSet.has(t.id)) continue
    if (!t.batch_id) continue
    await notifyMissingRecord({
      teacherId: t.id, teacherName: t.name,
      batchId: t.batch_id,
      batchName: batchMap.get(t.batch_id) ?? `دفعة ${t.batch_id}`,
      today,
    })
    count++
  }
  return count
}

// ─── فحص ٤: تكرار غياب ───────────────────────────────────────────────────
// طلاب غابوا 3+ مرات خلال آخر 7 أيام
async function checkRepeatedAbsence(today: string): Promise<number> {
  const windowStart = daysAgoIso(7)

  const { data: absences } = await supabaseAdmin
    .from('attendance')
    .select('student_id, batch_id')
    .eq('status', 'absent')
    .gte('date', windowStart)
    .lte('date', today)

  if (!absences?.length) return 0

  // تجميع الغيابات لكل طالب
  const countMap = new Map<string, { batch_id: string; count: number }>()
  for (const row of absences) {
    const existing = countMap.get(row.student_id)
    if (existing) {
      existing.count++
    } else {
      countMap.set(row.student_id, { batch_id: row.batch_id, count: 1 })
    }
  }

  // أسماء الطلاب الذين تجاوزوا 3 غيابات
  const flagged = [...countMap.entries()].filter(([, v]) => v.count >= 3)
  if (!flagged.length) return 0

  const { data: students } = await supabaseAdmin
    .from('students')
    .select('id, name, batch_id')
    .in('id', flagged.map(([id]) => id))

  const nameMap = new Map((students ?? []).map(s => [s.id, s.name]))

  let count = 0
  for (const [studentId, { batch_id, count: absenceCount }] of flagged) {
    const name = nameMap.get(studentId)
    if (!name) continue
    await notifyAbsence({
      studentId, studentName: name,
      batchId: parseInt(batch_id) || 0,
      absenceCount, windowDays: 7, today,
    })
    count++
  }
  return count
}

// ─── Route Handler ────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const today = todayIso()
  const started = Date.now()

  try {
    // تشغيل الفحوصات الأربعة بالتوازي
    const [lags, exams, missing, absences] = await Promise.all([
      checkStudentLag(today),
      checkUpcomingExams(today),
      checkMissingRecords(today),
      checkRepeatedAbsence(today),
    ])

    const summary = { lags, exams, missing, absences, total: lags + exams + missing + absences }

    await supabaseAdmin.from('automation_logs').insert({
      job_name: 'notifications-check',
      status: 'success',
      records_processed: summary.total,
      details: { today, ...summary, duration_ms: Date.now() - started },
      error_message: null,
    })

    return NextResponse.json({ ok: true, today, ...summary })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    try {
      await supabaseAdmin.from('automation_logs').insert({
        job_name: 'notifications-check',
        status: 'error',
        records_processed: 0,
        details: { today },
        error_message: msg,
      })
    } catch { /* ignore log failure */ }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest) { return GET(req) }
