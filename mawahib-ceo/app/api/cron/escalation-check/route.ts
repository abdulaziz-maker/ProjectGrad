import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { isCronAuthorized } from '@/lib/api-auth'

const PROGRAM_START = new Date('2026-02-27')

function currentProgramWeek(): number {
  return Math.max(1, Math.ceil((Date.now() - PROGRAM_START.getTime()) / (7 * 86400000)))
}

// نسبة الحفظ المتوقعة بناء على أسبوع البرنامج (30 جزء في 12 أسبوع)
function expectedJuz(week: number): number {
  return Math.max(1, Math.ceil(week * 30 / 12))
}

function buildWhatsAppMessage(studentName: string, supervisorName: string): string {
  return (
    `السلام عليكم ورحمة الله وبركاته،\n` +
    `نود إعلامكم بأن نجلكم *${studentName}* يمر بصعوبات في التحصيل خلال الأسابيع الأخيرة.\n` +
    `يرجى التواصل مع المشرف ${supervisorName} لمناقشة خطة المتابعة.\n` +
    `نسأل الله له التوفيق والسداد.`
  )
}

export async function POST(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const week = currentProgramWeek()
  const minExpected = Math.max(1, expectedJuz(week) - 3) // هامش ٣ أجزاء

  // ── جلب الطلاب النشطين ──────────────────────────────────────────────
  const { data: students, error: sErr } = await supabaseAdmin
    .from('students')
    .select('id, name, batch_id, supervisor_id, supervisor_name, juz_completed, enrollment_date')
    .eq('status', 'active')

  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 })
  if (!students?.length) return NextResponse.json({ ok: true, processed: 0 })

  // ── جلب التصعيدات الحالية ────────────────────────────────────────────
  const { data: existing } = await supabaseAdmin
    .from('escalations')
    .select('student_id, level, consecutive_weeks')
    .eq('resolved', false)

  const escalationMap = new Map(
    (existing ?? []).map(e => [e.student_id, e])
  )

  const notifications: Record<string, unknown>[] = []
  const upserts: Record<string, unknown>[] = []
  const toResolve: string[] = []
  let processed = 0

  for (const s of students) {
    const juz = s.juz_completed ?? 0
    const enrolledWeeks = Math.ceil(
      (Date.now() - new Date(s.enrollment_date).getTime()) / (7 * 86400000)
    )

    // طالب مسجل أقل من أسبوعين — تجاهل
    if (enrolledWeeks < 2) continue

    const isStruggling = juz < minExpected
    const existing = escalationMap.get(s.id)

    // ── حُلّت المشكلة — أنهِ التصعيد ───────────────────────────────
    if (!isStruggling && existing) {
      toResolve.push(s.id)
      notifications.push({
        type: 'alert',
        title: `✅ تحسّن ${s.name}`,
        body: `الطالب ${s.name} تجاوز مرحلة التعثر (أكمل ${juz} جزء).`,
        severity: 'success',
        target_role: 'ceo',
        data: { student_id: s.id, student_name: s.name, juz_completed: juz },
      })
      processed++
      continue
    }

    if (!isStruggling) continue

    // ── تصعيد جديد أو ترقية ─────────────────────────────────────────
    const prevLevel = existing?.level ?? 0
    const prevWeeks = existing?.consecutive_weeks ?? 0
    const newWeeks = prevWeeks + 1
    const newLevel = Math.min(4, prevLevel + 1)

    let actionRequired = ''
    let whatsappMsg: string | null = null

    switch (newLevel) {
      case 1:
        actionRequired = `حفّز الطالب ${s.name} وتابع معه يومياً`
        notifications.push({
          type: 'escalation', title: `⚠️ تعثر — ${s.name}`,
          body: `الطالب ${s.name} متعثر للأسبوع الأول (${juz}/${minExpected} جزء). يُنصح بتشجيعه.`,
          severity: 'warning', target_role: 'supervisor',
          data: { student_id: s.id, student_name: s.name, level: 1, weeks: newWeeks },
        })
        break
      case 2:
        actionRequired = `اجتماع عاجل مع مشرف ${s.supervisor_name ?? ''} بشأن ${s.name}`
        notifications.push({
          type: 'escalation', title: `🔴 تعثر متكرر — ${s.name}`,
          body: `الطالب ${s.name} متعثر للأسبوع الثاني على التوالي. يُرفع للمشرف وإدارة الدفعة.`,
          severity: 'error', target_role: 'batch_manager',
          data: { student_id: s.id, student_name: s.name, level: 2, weeks: newWeeks },
        })
        break
      case 3:
        whatsappMsg = buildWhatsAppMessage(s.name, s.supervisor_name ?? 'المشرف')
        actionRequired = `إرسال رسالة واتساب لولي أمر ${s.name}`
        notifications.push({
          type: 'escalation', title: `📱 تواصل مع ولي أمر ${s.name}`,
          body: `الطالب ${s.name} متعثر للأسبوع الثالث. تم توليد رسالة واتساب لولي الأمر.`,
          severity: 'error', target_role: 'ceo',
          data: { student_id: s.id, student_name: s.name, level: 3, weeks: newWeeks, whatsapp: whatsappMsg },
        })
        break
      case 4:
        actionRequired = `استدعاء ولي أمر ${s.name} — دراسة استبعاد`
        notifications.push({
          type: 'escalation', title: `🚨 تنبيه عاجل — ${s.name}`,
          body: `الطالب ${s.name} متعثر لأربعة أسابيع متتالية. يستلزم قراراً إدارياً.`,
          severity: 'error', target_role: 'ceo',
          data: { student_id: s.id, student_name: s.name, level: 4, weeks: newWeeks },
        })
        break
    }

    upserts.push({
      student_id: s.id,
      student_name: s.name,
      supervisor_id: s.supervisor_id ?? null,
      supervisor_name: s.supervisor_name ?? null,
      batch_id: s.batch_id ?? null,
      consecutive_weeks: newWeeks,
      level: newLevel,
      action_required: actionRequired,
      whatsapp_message: whatsappMsg,
      resolved: false,
      updated_at: new Date().toISOString(),
    })
    processed++
  }

  // ── حفظ التصعيدات ───────────────────────────────────────────────────
  if (upserts.length) {
    const { error } = await supabaseAdmin
      .from('escalations')
      .upsert(upserts, { onConflict: 'student_id' })
    if (error) {
      await logJob('escalation-check', 'error', 0, {}, error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  // ── حل التصعيدات المنتهية ────────────────────────────────────────────
  if (toResolve.length) {
    await supabaseAdmin
      .from('escalations')
      .update({ resolved: true, resolved_at: new Date().toISOString() })
      .in('student_id', toResolve)
  }

  // ── إرسال الإشعارات ──────────────────────────────────────────────────
  if (notifications.length) {
    await supabaseAdmin.from('notifications').insert(notifications)
  }

  await logJob('escalation-check', 'success', processed, {
    week, new_escalations: upserts.length, resolved: toResolve.length,
  })

  return NextResponse.json({
    ok: true, week, processed,
    escalated: upserts.length, resolved: toResolve.length,
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
