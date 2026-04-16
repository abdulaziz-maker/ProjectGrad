/**
 * Seed script for test_* tables — scale testing only.
 * Usage: node audit-migrations/002_seed_test_data.mjs
 * Requires: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env.
 *
 * Seeds: 50 supervisors, 1000 students, 10 000 juz rows.
 * All rows go into test_* tables only. Production tables untouched.
 */
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const sb = createClient(url, key, { auth: { persistSession: false } })

async function main() {
  // 50 supervisors
  const supervisors = Array.from({ length: 50 }, (_, i) => ({
    name: `test_sup_${i}`,
    batch_id: (i % 5) + 40,
  }))
  const { data: sups, error: e1 } = await sb.from('test_supervisors').insert(supervisors).select()
  if (e1) throw e1
  console.log(`Seeded ${sups.length} supervisors`)

  // 1000 students
  const students = Array.from({ length: 1000 }, (_, i) => ({
    name: `test_student_${i}`,
    batch_id: (i % 5) + 40,
    supervisor_id: sups[i % sups.length].id,
    status: i % 20 === 0 ? 'inactive' : 'active',
    juz_completed: Math.floor(Math.random() * 30),
  }))
  const { data: studs, error: e2 } = await sb.from('test_students').insert(students).select('id')
  if (e2) throw e2
  console.log(`Seeded ${studs.length} students`)

  // 10 000 juz rows (10 per student)
  const juzRows = []
  for (const s of studs) {
    for (let j = 1; j <= 10; j++) {
      juzRows.push({
        student_id: s.id,
        juz_number: j,
        status: Math.random() > 0.5 ? 'memorized' : 'pending',
      })
    }
  }
  // Supabase insert limit ≈ 1000 rows per call — chunk
  for (let i = 0; i < juzRows.length; i += 1000) {
    const chunk = juzRows.slice(i, i + 1000)
    const { error } = await sb.from('test_juz_progress').insert(chunk)
    if (error) throw error
  }
  console.log(`Seeded ${juzRows.length} juz_progress rows`)
}

main().catch(err => { console.error(err); process.exit(1) })
