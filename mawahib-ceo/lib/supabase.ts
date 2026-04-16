import { createClient } from '@supabase/supabase-js'

// SECURITY: no hardcoded fallbacks — fail loudly if env is missing.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are required')
}

/**
 * Returns a storage key that is unique per browser tab.
 *
 * Why: localStorage is shared across ALL tabs in the same origin.
 * If Tab A is logged in as User 1 and Tab B logs in as User 2,
 * Supabase overwrites the shared localStorage key — logging out Tab A.
 *
 * Fix: use sessionStorage to assign each tab a unique ID, then use that
 * ID as the Supabase storageKey. sessionStorage is isolated per tab
 * (not shared), so each tab holds its own independent session.
 */
function getTabStorageKey(): string {
  if (typeof window === 'undefined') {
    // Server-side rendering — key doesn't matter here
    return 'mawahib_session'
  }
  const TAB_ID_KEY = 'mawahib_tab_id'
  let tabId = sessionStorage.getItem(TAB_ID_KEY)
  if (!tabId) {
    tabId = (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2))
    sessionStorage.setItem(TAB_ID_KEY, tabId)
  }
  return `mawahib_session_${tabId}`
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // Each tab gets its own isolated session key — prevents cross-tab logout
    storageKey: getTabStorageKey(),
    // Serialize token refreshes within the same tab using the Web Locks API.
    // Prevents race conditions when autoRefreshToken fires multiple times.
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
