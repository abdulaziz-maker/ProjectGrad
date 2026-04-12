import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { isCronAuthorized } from '@/lib/api-auth'

const PROGRAM_START = new Date('2026-02-27')

function currentProgramWeek(): number {
  return Math.max(1, Math.ceil((Date.now() - PROGRAM_START.getTime()) / (7 * 86400000)))
}

export async function POST(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const week = currentProgramWeek()
  const oneWeekAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const todayISO = new Date().toISOString().split('T')[0]

  // ── جلب البيانات بالتوازي ────────────────────────────────────────────
  const [studentsRes, juzRes, attendanceRes, escalationsRes] = await Promise.all([
    supabaseAdmin.from('students').select('id, name, batch_id, supervisor_id, juz_completed, status').eq('status', 'active'),
    supabaseAdmin.from('juz_progress').select('student_id, juz_number, status, updated_at').eq('status', 'memorized').gte('updated_at', oneWeekAgo),
    supabaseAdmin.from('attendance').select('date, batch_id, status').gte('date', new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]).lte('date', todayISO),
    supabaseAdmin.from('escalations').select('id, level').eq('resolved', false),
  ])

  const students = studentsRes.data ?? []
  const newJuz = juzRes.data ?? []
  const attendance = attendanceRes.data ?? []
  const activeEscalations = escalationsRes.data ?? []

  // ── حساب المؤشرات ────────────────────────────────────────────────────
  const totalActive = students.length
  const totalJuzMemorized = students.reduce((s, st) => s + (st.juz_completed ?? 0), 0)
  const overallPct = totalActive > 0 ? Math.round((totalJuzMemorized / (totalActive * 30)) * 100) : 0
  const newJuzThisWeek = newJuz.length
  const attendancePct = attendance.length > 0
    ? Math.round(attendance.filter(a => a.status === 'present').length / attendance.length * 100)
    : 0
  const criticalEscalations = activeEscalations.filter(e => e.level >= 3).length

  // ── أفضل وأضعف دفعة ─────────────────────────────────────────────────
  const batchStats: Record<number, { total: number; juz: number }> = {}
  for (const s of students) {
    const b = s.batch_id
    if (!batchStats[b]) batchStats[b] = { total: 0, juz: 0 }
    batchStats[b].total++
    batchStats[b].juz += s.juz_completed ?? 0
  }
  const batchPcts = Object.entries(batchStats).map(([id, v]) => ({
    id: Number(id),
    pct: v.total > 0 ? Math.round((v.juz / (v.total * 30)) * 100) : 0,
  }))
  const bestBatch = batchPcts.sort((a, b) => b.pct - a.pct)[0]
  const worstBatch = batchPcts[batchPcts.length - 1]

  // ── إنشاء التقرير كإشعار ─────────────────────────────────────────────
  const summary = [
    `📊 تقرير الأسبوع ${week}`,
    `• الطلاب النشطون: ${totalActive}`,
    `• نسبة الحفظ الكلية: ${overallPct}%`,
    `• أجزاء محفوظة هذا الأسبوع: ${newJuzThisWeek}`,
    `• نسبة الحضور: ${attendancePct}%`,
    `• تصعيدات عاجلة: ${criticalEscalations}`,
    bestBatch ? `• أفضل دفعة: دفعة ${bestBatch.id} (${bestBatch.pct}%)` : '',
  ].filter(Boolean).join('\n')

  // إشعار للمدير التنفيذي
  await supabaseAdmin.from('notifications').insert([
    {
      type: 'report',
      title: `📊 التقرير الأسبوعي — الأسبوع ${week}`,
      body: summary,
      severity: criticalEscalations > 0 ? 'warning' : 'success',
      target_role: 'ceo',
      data: {
        week,
        total_active: totalActive,
        overall_pct: overallPct,
        new_juz_this_week: newJuzThisWeek,
        attendance_pct: attendancePct,
        critical_escalations: criticalEscalations,
        best_batch: bestBatch ?? null,
        worst_batch: worstBatch ?? null,
      },
    },
  ])

  // إشعار لكل مشرف بملخص طلابه
  const { data: supervisors } = await supabaseAdmin
    .from('supervisors')
    .select('id, name')

  if (supervisors?.length) {
    const supervisorNotifications = supervisors.map(sv => {
      const myStudents = students.filter(s => s.supervisor_id === sv.id)
      const myJuz = myStudents.reduce((s, st) => s + (st.juz_completed ?? 0), 0)
      const myPct = myStudents.length > 0
        ? Math.round((myJuz / (myStudents.length * 30)) * 100) : 0
      return {
        type: 'report',
        title: `📋 تقرير طلابك — الأسبوع ${week}`,
        body: `عدد طلابك: ${myStudents.length} | نسبة الإنجاز: ${myPct}% | أجزاء هذا الأسبوع: ${newJuz.filter(j => myStudents.some(s => s.id === j.student_id)).length}`,
        severity: 'info',
        target_role: 'supervisor',
        data: { week, supervisor_id: sv.id, students_count: myStudents.length, pct: myPct },
      }
    })
    await supabaseAdmin.from('notifications').insert(supervisorNotifications)
  }

  await logJob('weekly-report', 'success', totalActive, {
    week, overall_pct: overallPct, new_juz: newJuzThisWeek,
  })

  return NextResponse.json({
    ok: true, week,
    overall_pct: overallPct,
    new_juz_this_week: newJuzThisWeek,
    attendance_pct: attendancePct,
    critical_escalations: criticalEscalations,
  })
}

export async function GET(req: NextRequest) { return POST(req) }

async function logJob(
  job: string, status: string, processed: number,
  details: Record<string, unknown>, errMsg?: string
) {
  await supabaseAdmin.from('automation_logs').insert({
    job_name: job, status, records_processed: processed,
    details, error_message: errMsg ?? null,
  })
}
