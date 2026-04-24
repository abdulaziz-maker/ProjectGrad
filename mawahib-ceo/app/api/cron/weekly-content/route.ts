import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { isCronAuthorized } from '@/lib/api-auth'

const PROGRAM_START = new Date('2026-02-27')
const TOTAL_JUZ = 30

function currentProgramWeek(): number {
  return Math.max(1, Math.ceil((Date.now() - PROGRAM_START.getTime()) / (7 * 86400000)))
}

function weekStartDate(week: number): string {
  const d = new Date(PROGRAM_START.getTime() + (week - 1) * 7 * 86400000)
  return d.toISOString().split('T')[0]
}

function juzLabel(juz: number): string {
  return `الجزء ${juz}`
}

export async function POST(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const week = currentProgramWeek()
  const weekStart = weekStartDate(week)
  const targetJuz = Math.min(TOTAL_JUZ, Math.ceil(week * TOTAL_JUZ / 12))

  // ── Fetch all active students ─────────────────────────────────────────
  const { data: students, error: studentsErr } = await supabaseAdmin
    .from('students')
    .select('id, name, batch_id, supervisor_id, supervisor_name, juz_completed')
    .eq('status', 'active')

  if (studentsErr) {
    return NextResponse.json({ error: studentsErr.message }, { status: 500 })
  }

  if (!students?.length) {
    return NextResponse.json({ ok: true, message: 'لا طلاب نشطين', created: 0 })
  }

  // ── Build weekly plans ────────────────────────────────────────────────
  const plans = students.map(s => {
    const current = s.juz_completed ?? 0
    const nearFrom = Math.max(1, current - 2)
    const nearTo = Math.max(1, current)
    const farJuz = current > 5 ? Math.ceil(current / 2) : null

    return {
      student_id: s.id,
      batch_id: s.batch_id,
      week_number: week,
      week_start: weekStart,
      new_content: current < TOTAL_JUZ ? `${juzLabel(current + 1)} (جديد)` : 'مراجعة شاملة',
      near_review: nearFrom < current
        ? `${juzLabel(nearFrom)} إلى ${juzLabel(nearTo)} (مراجعة قريبة)`
        : null,
      far_review: farJuz ? `${juzLabel(farJuz)} وما قبله (مراجعة بعيدة)` : null,
      target_juz: targetJuz,
      status: 'pending',
    }
  })

  const { error: plansErr } = await supabaseAdmin
    .from('weekly_plans')
    .upsert(plans, { onConflict: 'student_id,week_number', ignoreDuplicates: true })

  if (plansErr) {
    await logJob('weekly-content', 'error', 0, {}, plansErr.message)
    return NextResponse.json({ error: plansErr.message }, { status: 500 })
  }

  // ── Notify each unique supervisor ─────────────────────────────────────
  const supervisors = [...new Map(
    students
      .filter(s => s.supervisor_id)
      .map(s => [s.supervisor_id, s.supervisor_name])
  ).entries()]

  const notifications = supervisors.map(([, name]) => ({
    type: 'report',
    title: `📋 مقرر الأسبوع ${week} جاهز`,
    body: `تم إعداد مقررات هذا الأسبوع. المستهدف: ${juzLabel(targetJuz)}.`,
    severity: 'info',
    target_role: 'supervisor',
    data: { week, week_start: weekStart, supervisor_name: name } as Record<string, unknown>,
  }))

  notifications.push({
    type: 'report',
    title: `📋 مقررات الأسبوع ${week} محدّثة`,
    body: `تم جدولة ${plans.length} مقرر أسبوعي لجميع الطلاب. الأسبوع يبدأ ${weekStart}.`,
    severity: 'info',
    target_role: 'ceo',
    data: { week, students_count: plans.length, target_juz: targetJuz } as Record<string, unknown>,
  })

  await supabaseAdmin.from('notifications').insert(notifications)
  await logJob('weekly-content', 'success', plans.length, { week, target_juz: targetJuz })

  return NextResponse.json({ ok: true, week, created: plans.length })
}

// ── GET: Manual trigger from browser ────────────────────────────────────
export async function GET(req: NextRequest) {
  return POST(req)
}

async function logJob(
  job: string, status: string, processed: number,
  details: Record<string, unknown>, errMsg?: string
) {
  await supabaseAdmin.from('automation_logs').insert({
    job_name: job, status, records_processed: processed,
    details, error_message: errMsg ?? null,
  })
}
