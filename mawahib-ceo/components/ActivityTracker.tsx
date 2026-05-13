'use client'
/**
 * ActivityTracker
 * ───────────────
 * مكوّن غير مرئي يُسجّل نشاط المستخدم في كل تنقّل.
 *
 * • يُركَّب مرّة واحدة في `app/(main)/layout.tsx` داخل شجرة الصفحات المحمية
 * • يستمع لتغيّر `usePathname()` ويستدعي `logActivity()` (fire-and-forget)
 * • لا يُعيد أي JSX (returns null) — صفر تأثير بصري
 * • throttle + try/catch داخل `logActivity()` يضمنان عدم كسر الصفحة
 *
 * ⚠️ هذا الملف مستقل — لا يُعدّل أي ملف موجود.
 */
import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { logActivity } from '@/lib/activity-logger'

export default function ActivityTracker(): null {
  const pathname = usePathname()
  const { profile } = useAuth()

  useEffect(() => {
    // لا نسجّل إلا لو المستخدم مسجّل دخول (له profile)
    if (!profile?.id) return
    if (!pathname) return
    logActivity(pathname, profile.id, profile.tenant_id ?? null)
  }, [pathname, profile?.id, profile?.tenant_id])

  return null
}
