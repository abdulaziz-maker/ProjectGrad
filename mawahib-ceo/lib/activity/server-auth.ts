/**
 * server-auth (activity feature)
 * ──────────────────────────────
 * فحص server-side أن المستخدم super_admin قبل تحميل أي بيانات نشاط.
 * يقرأ session من cookies (Next.js 16: `cookies()` هي async).
 *
 * ⚠️ ملف جديد — لا يُعدّل أي ملف موجود.
 */
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { supabaseAdmin } from '@/lib/supabase-admin'

export interface ActivityAuthResult {
  userId: string
  isSuperAdmin: boolean
}

/**
 * يُرجع `{ userId, isSuperAdmin }` أو `null` لو لم يكن هناك session.
 * يُستخدم في server components لحماية صفحة /admin/activity.
 */
export async function getActivityAuth(): Promise<ActivityAuthResult | null> {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        // setAll لا يُستعمل في server component (read-only) لكنه مطلوب للنوع
        setAll() { /* noop in RSC */ },
      },
    },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // قراءة is_super_admin عبر service_role لتجنّب RLS recursion
  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('is_super_admin')
    .eq('id', user.id)
    .maybeSingle()

  if (error || !profile) return { userId: user.id, isSuperAdmin: false }
  return { userId: user.id, isSuperAdmin: !!profile.is_super_admin }
}
