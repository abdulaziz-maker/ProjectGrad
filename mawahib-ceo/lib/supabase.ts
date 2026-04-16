import { createBrowserClient } from '@supabase/ssr'

// SECURITY: no hardcoded fallbacks — fail loudly if env is missing.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are required')
}

/**
 * Browser-side Supabase client.
 *
 * IMPORTANT: we use `createBrowserClient` from `@supabase/ssr` (NOT the raw
 * `createClient` from `@supabase/supabase-js`). This writes the session to
 * cookies so the Next.js middleware (which reads cookies server-side) can
 * see the user is authenticated.
 *
 * Previously this file used `createClient` with `storageKey` pointing at
 * localStorage, which meant the middleware never saw the session — every
 * request to a protected route (e.g. /dashboard) was redirected back to
 * /login, creating an infinite "جاري الدخول..." loop after a successful
 * sign-in. Switching to the cookie-backed SSR client fixes that.
 */
export const supabase = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  cookieOptions: {
    // Cookies must be readable by middleware across the whole app
    path: '/',
    sameSite: 'lax',
    // `secure` is auto-enabled on https by the SSR helper
  },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // Serialize token refreshes to prevent race conditions when
    // autoRefreshToken fires multiple times across tabs.
    lock: async <T>(name: string, _acquireTimeout: number, fn: () => Promise<T>): Promise<T> => {
      if (typeof navigator !== 'undefined' && 'locks' in navigator) {
        return navigator.locks.request(name, fn as () => PromiseLike<T>) as Promise<T>
      }
      return fn()
    },
  },
  // ── Performance: keep TCP connections alive, reduce overhead ──
  global: {
    fetch: (url, options = {}) => {
      return fetch(url, {
        ...options,
        keepalive: true,
      })
    },
  },
  // We don't use realtime subscriptions — minimize overhead
  realtime: {
    params: { eventsPerSecond: 1 },
  },
})

export function isSupabaseConfigured(): boolean {
  return true
}
