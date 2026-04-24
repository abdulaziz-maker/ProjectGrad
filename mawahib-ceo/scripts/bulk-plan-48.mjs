/**
 * Bulk update: Set QuranPlan for all batch 48 students
 * Expected position today = 561, actual = empty
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://kfexsycnpnldbjrwaohw.supabase.co',
  'sb_publishable_YH4CTdhzByRdRL65Q62Z0Q_OxuAKYwp'
)

const TODAY = '2026-04-14'
const END_DATE = '2026-05-21'
const TARGET_POSITION = 561
const DAILY_RATE = 1

async function main() {
  // 0. Authenticate as CEO
  const { error: authErr } = await supabase.auth.signInWithPassword({
    email: 'abdulaziz1ayman@gmail.com',
    password: 'Mawahib@2026',
  })
  if (authErr) { console.error('Auth failed:', authErr.message); process.exit(1) }
  console.log('Authenticated as CEO')

  // 1. Get all batch 48 students
  const { data: students, error: sErr } = await supabase
    .from('students')
    .select('id, name, batch_id')
    .eq('batch_id', 48)

  if (sErr) { console.error('Error fetching students:', sErr); process.exit(1) }
  console.log(`\nFound ${students.length} students in batch 48:`)
  students.forEach(s => console.log(`  - ${s.name} (${s.id})`))

  // 2. Deactivate any existing active plans for these students
  const studentIds = students.map(s => s.id)
  const { error: deactErr } = await supabase
    .from('quran_plans')
    .update({ is_active: false })
    .in('student_id', studentIds)
    .eq('is_active', true)

  if (deactErr) console.warn('Warning deactivating old plans:', deactErr.message)
  else console.log('\nDeactivated old plans.')

  // 3. Create new plans: start_position = 561, start_date = today
  //    => expected on today = 561 (0 working days elapsed)
  const plans = students.map(s => ({
    student_id: s.id,
    start_date: TODAY,
    end_date: END_DATE,
    start_position: TARGET_POSITION,
    daily_rate: DAILY_RATE,
    is_active: true,
  }))

  const { error: planErr } = await supabase
    .from('quran_plans')
    .insert(plans)

  if (planErr) { console.error('Error creating plans:', planErr); process.exit(1) }
  console.log(`\nCreated ${plans.length} new plans (expected today = ${TARGET_POSITION}).`)

  // 4. Delete any existing followup records for today so actual shows empty
  const { error: delErr } = await supabase
    .from('daily_followups')
    .delete()
    .in('student_id', studentIds)
    .eq('followup_date', TODAY)

  if (delErr) console.warn('Warning clearing today followups:', delErr.message)
  else console.log('Cleared any existing followup records for today.')

  console.log('\nDone! All batch 48 students: expected = 561, actual = empty.')
}

main().catch(console.error)
