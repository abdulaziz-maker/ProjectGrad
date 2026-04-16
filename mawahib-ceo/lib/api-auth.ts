import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from './supabase-admin'

export interface ApiUser {
  id: string
  email: string | undefined
  role: string | null
}

/**
 * استخرج وتحقق من JWT الخاص بالمستخدم من Authorization header.
 * يُستخدم داخل API routes لحماية الـ endpoints.
 *
 * الاستخدام:
 *   const { user, error } = await requireAuth(req)
 *   if (error) return error
 */
export async function requireAuth(
  req: NextRequest,
  allowedRoles?: string[]
): Promise<{ user: ApiUser; error: null } | { user: null; error: NextResponse }> {
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) {
    return {
      user: null,
      error: NextResponse.json({ error: 'غير مصرح — يجب تسجيل الدخول' }, { status: 401 }),
    }
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token)

  if (error || !data.user) {
    return {
      user: null,
      error: NextResponse.json({ error: 'جلسة منتهية أو غير صالحة' }, { status: 401 }),
    }
  }

  const role = (data.user.user_metadata?.role as string) ?? null

  // SECURITY: if allowedRoles is supplied, user must have a role AND it must match.
  // Previously, a user with null role bypassed the check (`role &&` short-circuited).
  if (allowedRoles && (!role || !allowedRoles.includes(role))) {
    return {
      user: null,
      error: NextResponse.json({ error: 'لا تملك صلاحية للوصول' }, { status: 403 }),
    }
  }

  return {
    user: { id: data.user.id, email: data.user.email, role },
    error: null,
  }
}

/** تحقق من Cron secret أو من أن المستخدم مدير تنفيذي */
export function isCronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') === `Bearer ${secret}`) return true
  // Vercel يضيف هذا الهيدر تلقائياً عند تشغيل الـ cron
  if (req.headers.get('x-vercel-cron') === '1') return true
  return false
}
