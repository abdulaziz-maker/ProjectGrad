/**
 * activity-logger
 * ────────────────
 * يسجّل نشاط المستخدم (مسار الصفحة المفتوحة) في `user_activity_log`.
 *
 * الخصائص:
 *  - Fire-and-forget: لا ينتظر استجابة DB قبل إكمال render
 *  - Throttle in-memory: لا يسجّل أكثر من مرة كل 60s لنفس (user, path)
 *  - Silent: أي خطأ يُكتم (try/catch + console.warn فقط)
 *  - Skip لو غير مسجّل دخول (auth.uid() غير موجود)
 *
 * ⚠️ هذا الملف مستقل تماماً — لا يُعدّل أي ملف موجود.
 */
import { supabase } from '@/lib/supabase'

// مفتاح throttle = `${userId}:${path}`، قيمة = آخر طابع زمني للتسجيل
const THROTTLE_MS = 60_000  // 60 ثانية
const throttleMap = new Map<string, number>()

// مسارات لا نسجّلها (login + 404 + assets + cron)
const SKIP_PATHS = new Set<string>([
  '/login',
  '/auth/callback',
  '/_not-found',
  '/404',
])
function isSkippablePath(path: string): boolean {
  if (SKIP_PATHS.has(path)) return true
  if (path.startsWith('/api/')) return true
  if (path.startsWith('/_next/')) return true
  return false
}

/**
 * يسجّل نشاطاً واحداً — fire-and-forget، آمن للاستدعاء بكل تنقّل.
 *
 * @param pagePath  المسار (`usePathname()`)
 * @param userId    معرّف المستخدم (من `useAuth().profile?.id`)
 * @param tenantId  معرّف الـtenant (من `useAuth().profile?.tenant_id` — قد يكون null)
 */
export function logActivity(
  pagePath: string,
  userId: string | null | undefined,
  tenantId: number | null | undefined,
): void {
  // الحراسات الأمنية أولاً
  if (!userId) return
  if (!pagePath) return
  if (isSkippablePath(pagePath)) return

  // throttle: تجاهل لو سُجّل خلال آخر 60s
  const key = `${userId}:${pagePath}`
  const now = Date.now()
  const last = throttleMap.get(key)
  if (last && (now - last) < THROTTLE_MS) return
  throttleMap.set(key, now)

  // تنظيف ذاكرة throttle لو كبر الـmap (>500 إدخال)
  if (throttleMap.size > 500) {
    const cutoff = now - THROTTLE_MS * 5
    for (const [k, ts] of throttleMap.entries()) {
      if (ts < cutoff) throttleMap.delete(k)
    }
  }

  // fire-and-forget — لا نُعيد promise للمتصل
  void (async () => {
    try {
      await supabase.from('user_activity_log').insert({
        user_id: userId,
        tenant_id: tenantId ?? null,
        page_path: pagePath,
      })
    } catch (err) {
      // كتم الخطأ — لا نريد كسر الصفحة بسبب فشل تسجيل
      if (typeof console !== 'undefined') {
        console.warn('[activity-logger] insert failed:', err)
      }
      // في حالة فشل التسجيل، نُعيد المحاولة في التنقّل التالي
      throttleMap.delete(key)
    }
  })()
}

/**
 * مسح ذاكرة الـthrottle (للاختبارات أو عند تسجيل الخروج).
 * لا يُستدعى تلقائياً.
 */
export function clearActivityThrottle(): void {
  throttleMap.clear()
}
