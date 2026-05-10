// ══════════════════════════════════════════════════════════════════════════
// دوال إنشاء التنبيهات — داخل الموقع فقط، multi-tenant
// ══════════════════════════════════════════════════════════════════════════

import { supabaseAdmin } from '@/lib/supabase-admin'

type Severity = 'info' | 'warning' | 'error' | 'success'

interface NotificationRow {
  type:           string
  title:          string
  body:           string
  severity:       Severity
  target_role:    string
  target_user_id: string | null
  data:           Record<string, unknown>
  read:           boolean
}

// ─── dedup: لا تُنشئ نفس النوع لنفس الكيان أكثر من مرة في اليوم ──────────
async function isDuplicate(type: string, entityId: string, todayIso: string): Promise<boolean> {
  const { count } = await supabaseAdmin
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('type', type)
    .contains('data', { entity_id: entityId })
    .gte('created_at', `${todayIso}T00:00:00.000Z`)
  return (count ?? 0) > 0
}

async function insertMany(rows: NotificationRow[]): Promise<void> {
  if (!rows.length) return
  const { error } = await supabaseAdmin.from('notifications').insert(rows)
  if (error) throw error
}

// ─── ١. تأخر طالب ────────────────────────────────────────────────────────
/**
 * يُنشئ تنبيه لكل طالب لم يُسجَّل له حفظ منذ `lagDays` أيام.
 * يُرسَل للمشرف + مدير الدفعة.
 */
export async function notifyStudentLag(params: {
  studentId:   string
  studentName: string
  batchId:     number
  lagDays:     number
  today:       string   // YYYY-MM-DD
}): Promise<void> {
  if (await isDuplicate('student_lag', params.studentId, params.today)) return

  const rows: NotificationRow[] = [
    {
      type: 'student_lag', severity: 'warning',
      title: `تأخر في التسجيل — ${params.studentName}`,
      body:  `الطالب ${params.studentName} لم يُسجَّل له حفظ منذ ${params.lagDays} أيام.`,
      target_role: 'supervisor', target_user_id: null,
      data: { entity_id: params.studentId, student_name: params.studentName, batch_id: params.batchId, lag_days: params.lagDays },
      read: false,
    },
    {
      type: 'student_lag', severity: 'warning',
      title: `تأخر في التسجيل — ${params.studentName}`,
      body:  `الطالب ${params.studentName} لم يُسجَّل له حفظ منذ ${params.lagDays} أيام.`,
      target_role: 'batch_manager', target_user_id: null,
      data: { entity_id: params.studentId, student_name: params.studentName, batch_id: params.batchId, lag_days: params.lagDays },
      read: false,
    },
  ]
  await insertMany(rows)
}

// ─── ٢. اختبار قادم ──────────────────────────────────────────────────────
/**
 * يُنشئ تنبيه عند اقتراب اختبار طالب (خلال `daysLeft` أيام).
 * يُرسَل للمعلم.
 */
export async function notifyUpcomingExam(params: {
  studentId:   string
  studentName: string
  batchId:     number
  examDate:    string   // YYYY-MM-DD
  juzNumber:   number
  daysLeft:    number
  today:       string
}): Promise<void> {
  if (await isDuplicate('upcoming_exam', params.studentId, params.today)) return

  const rows: NotificationRow[] = [
    {
      type: 'upcoming_exam', severity: 'info',
      title: `اختبار قادم — ${params.studentName}`,
      body:  `اختبار الجزء ${params.juzNumber} للطالب ${params.studentName} بعد ${params.daysLeft} ${params.daysLeft === 1 ? 'يوم' : 'أيام'} (${params.examDate}).`,
      target_role: 'teacher', target_user_id: null,
      data: { entity_id: params.studentId, student_name: params.studentName, batch_id: params.batchId, exam_date: params.examDate, juz_number: params.juzNumber, days_left: params.daysLeft },
      read: false,
    },
  ]
  await insertMany(rows)
}

// ─── ٣. معلم لم يسجّل ────────────────────────────────────────────────────
/**
 * يُنشئ تنبيه عند عدم تسجيل معلم لأي طالب في دفعته اليوم.
 * يُرسَل لمدير الدفعة + CEO.
 */
export async function notifyMissingRecord(params: {
  teacherId:   string
  teacherName: string
  batchId:     number
  batchName:   string
  today:       string
}): Promise<void> {
  if (await isDuplicate('missing_record', params.teacherId, params.today)) return

  const rows: NotificationRow[] = [
    {
      type: 'missing_record', severity: 'warning',
      title: `لم يسجّل — ${params.teacherName}`,
      body:  `المعلم ${params.teacherName} لم يُسجِّل أي طالب في دفعة "${params.batchName}" اليوم.`,
      target_role: 'batch_manager', target_user_id: null,
      data: { entity_id: params.teacherId, teacher_name: params.teacherName, batch_id: params.batchId, batch_name: params.batchName },
      read: false,
    },
    {
      type: 'missing_record', severity: 'warning',
      title: `لم يسجّل — ${params.teacherName}`,
      body:  `المعلم ${params.teacherName} لم يُسجِّل أي طالب في دفعة "${params.batchName}" اليوم.`,
      target_role: 'ceo', target_user_id: null,
      data: { entity_id: params.teacherId, teacher_name: params.teacherName, batch_id: params.batchId, batch_name: params.batchName },
      read: false,
    },
  ]
  await insertMany(rows)
}

// ─── ٤. تكرار غياب ───────────────────────────────────────────────────────
/**
 * يُنشئ تنبيه عند تكرار غياب طالب (`absenceCount` مرات خلال آخر `windowDays` أيام).
 * يُرسَل للمشرف.
 */
export async function notifyAbsence(params: {
  studentId:    string
  studentName:  string
  batchId:      number
  absenceCount: number
  windowDays:   number
  today:        string
}): Promise<void> {
  if (await isDuplicate('absence', params.studentId, params.today)) return

  const rows: NotificationRow[] = [
    {
      type: 'absence', severity: 'error',
      title: `تكرار غياب — ${params.studentName}`,
      body:  `الطالب ${params.studentName} غاب ${params.absenceCount} مرات خلال آخر ${params.windowDays} أيام.`,
      target_role: 'supervisor', target_user_id: null,
      data: { entity_id: params.studentId, student_name: params.studentName, batch_id: params.batchId, absence_count: params.absenceCount, window_days: params.windowDays },
      read: false,
    },
  ]
  await insertMany(rows)
}
