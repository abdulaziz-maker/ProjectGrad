/**
 * server-auth (admin)
 * ─────────────────────
 * فحص server-side أن المستخدم super_admin قبل أي action إداري.
 *
 * ⚠️ ملف جديد — لا يُعدّل أي ملف موجود.
 */
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { supabaseAdmin } from '@/lib/supabase-admin'

export interface AdminAuth {
  userId: string
  email: string | undefined
}

/**
 * يُرجع { userId, email } لو المستخدم super_admin
 * يُرجع null لو غير مسجّل دخول أو غير super_admin.
 */
export async function requireSuperAdmin(): Promise<AdminAuth | null> {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() { /* noop in RSC */ },
      },
    },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('is_super_admin')
    .eq('id', user.id)
    .maybeSingle()

  if (error || !profile?.is_super_admin) return null
  return { userId: user.id, email: user.email }
}
