'use client'
// ══════════════════════════════════════════════════════════════════════════
// تسجيل خروج تلقائي عند الخمول (Idle Auto-Logout)
// ──────────────────────────────────────────────────────────────────────────
// يراقب تفاعل المستخدم (ماوس / لمس / لوحة مفاتيح / تمرير) ويسجّل الخروج
// تلقائياً لو مرّت `timeoutMs` دون أي تفاعل. يستخدم refs لتتبع آخر نشاط
// بدون إعادة render، و throttle لتقليل الضغط على المتصفح (تحديث واحد
// كل 30 ثانية كحد أقصى).
// ══════════════════════════════════════════════════════════════════════════

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { signOut } from '@/lib/auth'

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'] as const
const THROTTLE_MS = 30_000 // لا نحدّث آخر نشاط أسرع من مرة كل ٣٠ ثانية
const CHECK_INTERVAL_MS = 60_000 // نتحقّق كل دقيقة

interface UseIdleLogoutOptions {
  /** المدّة بالميلّي ثانية قبل تسجيل الخروج */
  timeoutMs: number
  /** تفعيل الميزة (مثلاً: معطّلة لو لم يُسجَّل الدخول) */
  enabled: boolean
}

export function useIdleLogout({ timeoutMs, enabled }: UseIdleLogoutOptions) {
  const router = useRouter()
  const lastActivityRef = useRef<number>(Date.now())
  const lastUpdateRef = useRef<number>(Date.now())
  const firedRef = useRef<boolean>(false)

  useEffect(() => {
    if (!enabled) return
    if (typeof window === 'undefined') return

    // إعادة ضبط عند تفعيل/إعادة تحميل
    lastActivityRef.current = Date.now()
    lastUpdateRef.current = Date.now()
    firedRef.current = false

    const onActivity = () => {
      const now = Date.now()
      // throttle — لا تكتب أكثر من مرّة كل 30 ثانية لتخفيف التكاليف
      if (now - lastUpdateRef.current < THROTTLE_MS) return
      lastUpdateRef.current = now
      lastActivityRef.current = now
    }

    // Passive listeners → لا تعطّل التمرير/اللمس ولا تُحمِّل الـmain thread
    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, onActivity, { passive: true })
    }

    const timer = window.setInterval(async () => {
      if (firedRef.current) return
      const idleMs = Date.now() - lastActivityRef.current
      if (idleMs >= timeoutMs) {
        firedRef.current = true
        try {
          // ننتقل أولاً حتى لا تتعلّق الواجهة لو تأخّرت شبكة Supabase
          router.replace('/login?idle=1')
          await signOut()
        } catch {
          /* noop */
        }
      }
    }, CHECK_INTERVAL_MS)

    return () => {
      for (const ev of ACTIVITY_EVENTS) {
        window.removeEventListener(ev, onActivity)
      }
      window.clearInterval(timer)
    }
  }, [timeoutMs, enabled, router])
}
