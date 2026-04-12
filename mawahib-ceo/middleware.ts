import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseMiddlewareClient } from '@/lib/supabase-server'

// المسارات العامة — لا تحتاج تسجيل دخول
const PUBLIC_PATHS = ['/login', '/api/cron']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // تجاوز المسارات العامة والملفات الثابتة
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  const res = NextResponse.next()
  const supabase = createSupabaseMiddlewareClient(req, res)

  const { data: { session } } = await supabase.auth.getSession()

  // إذا لم يكن مسجلاً — وجّهه لصفحة الدخول
  if (!session) {
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // إذا مسجّل ويحاول الدخول لصفحة login — وجّهه للوحة التحكم
  if (pathname === '/login') {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  return res
}

export const config = {
  matcher: [
    // تطبيق على كل المسارات ما عدا الثابتة و API العامة
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)',
  ],
}
