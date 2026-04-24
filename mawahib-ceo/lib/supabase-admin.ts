import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Service role key bypasses RLS — keep server-side only.
// SECURITY: never silently fall back to the anon key — masks broken deploys.
// Lazy singleton: we throw at *first use*, not at module load, so that Next.js
// build-time page data collection (which imports this file) doesn't fail when
// env vars are only injected at runtime.

let _client: SupabaseClient | null = null

function getClient(): SupabaseClient {
  if (_client) return _client
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error('supabase-admin: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  }
  _client = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return _client
}

// Proxy so `supabaseAdmin.from(...)` etc. trigger the lazy init on first property access.
export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const c = getClient()
    const value = (c as unknown as Record<string | symbol, unknown>)[prop as string]
    return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(c) : value
  },
})
