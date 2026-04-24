import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getEscalationLevel } from '@/lib/quran-followup'

/**
 * Weekly escalation cron — runs every Sunday at 5:00 AM (KSA)
 * Checks all students with active plans for consecutive weekly delays.
 * Creates/updates escalation records based on severity.
 */
export async function GET(request: Request) {
  // Auth check for cron — requires CRON_SECRET or Vercel cron header.
  // NEVER match when CRON_SECRET is unset (prevents "Bearer undefined" bypass).
  const secret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  const isVercelCron = request.headers.get('x-vercel-cron') === '1'
  const isAuthorized =
    (!!secret && authHeader === `Bearer ${secret}`) || isVercelCron
  if (!isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  // SECURITY: require the real service-role key; never silently fall back to anon.
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Server misconfigured: missing Supabase service key' }, { status: 500 })
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  const today = new Date().toISOString().split('T')[0]

  try {
    // 1. Get all active plans
    const { data: plans } = await supabase
      .from('quran_plans')
      .select('*')
      .eq('is_active', true)

    if (!plans || plans.length === 0) {
      return NextResponse.json({ message: 'No active plans', processed: 0 })
    }

    // 2. Get students info
    const studentIds = plans.map(p => p.student_id)
    const { data: students } = await supabase
      .from('students')
      .select('id, name, batch_id, supervisor_id')
      .in('id', studentIds)

    const studentMap = new Map(students?.map(s => [s.id, s]) || [])

    // 3. Get batch schedules for all relevant batches
    const batchIds = [...new Set(students?.map(s => s.batch_id) || [])]
    const { data: scheduleData } = await supabase
      .from('batch_schedule')
      .select('*')
      .in('batch_id', batchIds)

    // Build schedule maps per batch
    const batchScheduleMaps = new Map<number, Map<string, string>>()
    for (const entry of scheduleData || []) {
      if (!batchScheduleMaps.has(entry.batch_id)) {
        batchScheduleMaps.set(entry.batch_id, new Map())
      }
      batchScheduleMaps.get(entry.batch_id)!.set(entry.date, entry.day_type)
    }

    // 4. Get latest followups for each student
    const { data: latestFollowups } = await supabase
      .from('daily_followups')
      .select('*')
      .in('student_id', studentIds)
      .not('actual_position', 'is', null)
      .order('followup_date', { ascending: false })

    // Map: student_id → latest followup
    const latestFollowupMap = new Map<string, { actual_position: number; followup_date: string }>()
    for (const f of latestFollowups || []) {
      if (!latestFollowupMap.has(f.student_id)) {
        latestFollowupMap.set(f.student_id, f)
      }
    }

    // 5. Get existing active escalations
    const { data: existingEscalations } = await supabase
      .from('followup_escalations')
      .select('*')
      .in('student_id', studentIds)
      .in('status', ['pending', 'in_progress'])

    const escalationMap = new Map(existingEscalations?.map(e => [e.student_id, e]) || [])

    // 6. Calculate expected positions and check delays
    let created = 0
    let updated = 0
    let resolved = 0

    for (const plan of plans) {
      const student = studentMap.get(plan.student_id)
      if (!student) continue

      const schedMap = batchScheduleMaps.get(student.batch_id) || new Map()

      // Calculate expected position using a simplified version of the algorithm
      let position = plan.start_position
      const startDate = new Date(plan.start_date + 'T12:00:00')
      const targetDate = new Date(today + 'T12:00:00')
      const current = new Date(startDate)
      let needExam = false

      while (current <= targetDate) {
        const dow = current.getDay()
        const dateStr = current.toISOString().split('T')[0]

        if (dow === 5 || dow === 6) { current.setDate(current.getDate() + 1); continue }

        const schedType = schedMap.get(dateStr)
        if (schedType === 'holiday' || schedType === 'trip' || schedType === 'educational_day') {
          current.setDate(current.getDate() + 1); continue
        }

        if (needExam) { needExam = false; current.setDate(current.getDate() + 1); continue }

        const rate = schedType === 'intensive' ? plan.daily_rate * 2 : plan.daily_rate
        position += rate

        if ((position - plan.start_position) > 0 && (position - plan.start_position) % 20 === 0) {
          needExam = true
        }

        current.setDate(current.getDate() + 1)
      }

      const expected = position
      const latestFollowup = latestFollowupMap.get(plan.student_id)
      const actual = latestFollowup?.actual_position ?? null
      const gap = actual !== null ? actual - expected : null

      const existingEsc = escalationMap.get(plan.student_id)

      if (gap !== null && gap <= -5) {
        // Student is delayed
        const weeks = existingEsc ? existingEsc.weeks_delayed + 1 : 1
        const level = getEscalationLevel(weeks)

        if (existingEsc) {
          // Update existing escalation
          await supabase.from('followup_escalations').update({
            weeks_delayed: weeks,
            level,
            triggered_at: new Date().toISOString(),
          }).eq('id', existingEsc.id)
          updated++
        } else {
          // Create new escalation
          await supabase.from('followup_escalations').insert({
            student_id: plan.student_id,
            student_name: student.name,
            supervisor_id: student.supervisor_id,
            batch_id: student.batch_id,
            weeks_delayed: 1,
            level: 'supervisor',
            status: 'pending',
          })
          created++
        }
      } else if (existingEsc && gap !== null && gap > -5) {
        // Student recovered — resolve escalation
        await supabase.from('followup_escalations').update({
          status: 'resolved',
          resolved_at: new Date().toISOString(),
          action_taken: 'تحسن تلقائي',
        }).eq('id', existingEsc.id)
        resolved++
      }
    }

    // 7. Log the automation run
    try {
      await supabase.from('automation_logs').insert({
        id: crypto.randomUUID(),
        job_type: 'followup-escalation',
        status: 'success',
        details: JSON.stringify({ created, updated, resolved, total: plans.length }),
        ran_at: new Date().toISOString(),
      })
    } catch { /* automation_logs may not exist */ }

    return NextResponse.json({
      message: 'Escalation check complete',
      processed: plans.length,
      created,
      updated,
      resolved,
    })
  } catch (error) {
    console.error('Followup escalation error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
