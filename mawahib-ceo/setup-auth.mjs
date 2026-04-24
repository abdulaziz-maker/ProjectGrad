/**
 * Auth Setup Script — runs once
 * 1. Creates profiles table in Supabase
 * 2. Creates CEO user via Supabase Auth
 * 3. Inserts CEO profile
 */
import { createClient } from '@supabase/supabase-js'

// SECURITY: never hardcode URLs, keys, or passwords. Read from env.
//   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
//   CEO_EMAIL, CEO_PASSWORD, CEO_NAME
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!SUPABASE_URL || !ANON_KEY) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL و NEXT_PUBLIC_SUPABASE_ANON_KEY مطلوبان')
  process.exit(1)
}
const sb = createClient(SUPABASE_URL, ANON_KEY)

const CEO_EMAIL    = process.env.CEO_EMAIL
const CEO_PASSWORD = process.env.CEO_PASSWORD
const CEO_NAME     = process.env.CEO_NAME ?? 'المدير التنفيذي'
if (!CEO_EMAIL || !CEO_PASSWORD) {
  console.error('❌ CEO_EMAIL و CEO_PASSWORD مطلوبان في env قبل التشغيل')
  process.exit(1)
}

async function run() {
  console.log('\n🔐 إعداد نظام المصادقة...\n')

  // ── 1. Create profiles table via SQL ─────────────────────────
  const sql = `
    -- Profiles table
    create table if not exists profiles (
      id uuid primary key references auth.users(id) on delete cascade,
      role text not null check (role in ('ceo','supervisor','teacher')),
      batch_id integer references batches(id),
      name text not null default '',
      created_at timestamptz default now()
    );

    -- Allow users to read their own profile
    alter table profiles enable row level security;

    drop policy if exists "Users read own profile" on profiles;
    create policy "Users read own profile" on profiles
      for select using (auth.uid() = id);

    drop policy if exists "CEO reads all profiles" on profiles;
    create policy "CEO reads all profiles" on profiles
      for select using (
        exists (select 1 from profiles where id = auth.uid() and role = 'ceo')
      );

    drop policy if exists "CEO manages profiles" on profiles;
    create policy "CEO manages profiles" on profiles
      for all using (
        exists (select 1 from profiles where id = auth.uid() and role = 'ceo')
      );
  `

  let sqlErr = null
  try {
    const result = await sb.rpc('exec_sql', { query: sql })
    sqlErr = result.error
  } catch (_) { /* exec_sql may not exist — that's fine */ }
  // exec_sql may not exist — that's fine, we'll handle table creation differently

  // ── 2. Try to create CEO account ─────────────────────────────
  console.log('🔑 إنشاء حساب المدير التنفيذي...')

  // First try sign-in to check if account exists
  const { data: signInData, error: signInErr } = await sb.auth.signInWithPassword({
    email: CEO_EMAIL,
    password: CEO_PASSWORD,
  })

  let userId = signInData?.user?.id

  if (signInErr) {
    // Account doesn't exist — create it
    const { data: signUpData, error: signUpErr } = await sb.auth.signUp({
      email: CEO_EMAIL,
      password: CEO_PASSWORD,
      options: {
        data: { name: CEO_NAME, role: 'ceo' }
      }
    })

    if (signUpErr) {
      console.error('❌ خطأ في إنشاء الحساب:', signUpErr.message)
      console.log('\n📋 قم بهذه الخطوة يدوياً في Supabase:')
      console.log('   Dashboard → Authentication → Users → Add User')
      console.log(`   Email: ${CEO_EMAIL}`)
      console.log(`   Password: ${CEO_PASSWORD}`)
    } else {
      userId = signUpData.user?.id
      console.log('  ✓ تم إنشاء الحساب')
      if (!signUpData.session) {
        console.log('  ⚠️  يحتاج تأكيد البريد الإلكتروني أو تعطيل Email Confirmation في Supabase')
      }
    }
  } else {
    console.log('  ✓ الحساب موجود مسبقاً')
  }

  if (userId) {
    // ── 3. Insert/update profile ─────────────────────────────
    const { error: profileErr } = await sb
      .from('profiles')
      .upsert({ id: userId, role: 'ceo', batch_id: null, name: CEO_NAME }, { onConflict: 'id' })

    if (profileErr) {
      console.log('\n⚠️  جدول profiles غير موجود — يجب إنشاؤه أولاً في Supabase SQL Editor')
      console.log('   شاهد الملف: supabase-auth-schema.sql')
    } else {
      console.log('  ✓ تم إدراج بيانات المدير')
    }
  }

  console.log('\n═══════════════════════════════════════')
  console.log('  المعلومات الهامة:')
  console.log(`  الإيميل:     ${CEO_EMAIL}`)
  console.log(`  كلمة المرور: ${CEO_PASSWORD}`)
  console.log('═══════════════════════════════════════\n')
}

run().catch(err => {
  console.error('❌ خطأ:', err.message)
  process.exit(1)
})
