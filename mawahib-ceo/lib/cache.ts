/**
 * High-performance in-memory cache with stale-while-revalidate.
 *
 * Strategy:
 * - Returns cached data INSTANTLY if within TTL (60s default)
 * - Returns STALE data immediately while revalidating in background (SWR)
 * - Deduplicates concurrent in-flight requests to the same key
 * - Per-browser-tab, with explicit invalidation after mutations
 */

interface CacheEntry<T> {
  data: T
  timestamp: number
  promise?: Promise<T>
}

const cache = new Map<string, CacheEntry<unknown>>()

// TTL: 60 seconds — data is fresh
const DEFAULT_TTL = 60_000
// SWR window: serve stale data for up to 5 minutes while revalidating in background
const SWR_WINDOW = 5 * 60_000

/**
 * Fetch data with caching + stale-while-revalidate.
 *
 * Within TTL: returns cached data instantly (no network call)
 * Within SWR window: returns stale data instantly, revalidates in background
 * Beyond SWR: fetches fresh data (blocks until ready)
 * Concurrent calls: deduplicates into single network request
 */
export async function cachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl = DEFAULT_TTL
): Promise<T> {
  const now = Date.now()
  const entry = cache.get(key) as CacheEntry<T> | undefined

  // ── Fresh data: return instantly ──
  if (entry && !entry.promise && (now - entry.timestamp) < ttl) {
    return entry.data
  }

  // ── Stale but within SWR window: return stale, revalidate in background ──
  if (entry && entry.data != null && !entry.promise && (now - entry.timestamp) < SWR_WINDOW) {
    // Fire background revalidation (don't await)
    const bgPromise = fetcher().then(data => {
      cache.set(key, { data, timestamp: Date.now() })
      return data
    }).catch(() => {
      // On error, keep stale data — better than nothing
    })
    // Mark as revalidating so concurrent callers don't fire more
    cache.set(key, { ...entry, promise: bgPromise as Promise<T> })
    // Return stale data immediately — zero latency for the user
    return entry.data
  }

  // ── In-flight request exists: piggyback on it ──
  if (entry?.promise) {
    // If we have stale data, return it immediately (SWR)
    if (entry.data != null) return entry.data
    return entry.promise
  }

  // ── No cache or expired beyond SWR: must fetch ──
  const promise = fetcher().then(data => {
    cache.set(key, { data, timestamp: Date.now() })
    return data
  }).catch(err => {
    cache.delete(key)
    throw err
  })

  cache.set(key, { ...(entry || { data: null as T, timestamp: 0 }), promise })
  return promise
}

/** Invalidate a specific cache key (call after mutations) */
export function invalidateCache(key: string) {
  cache.delete(key)
}

/** Invalidate all keys matching a prefix */
export function invalidateCachePrefix(prefix: string) {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key)
  }
}

/** Clear the entire cache */
export function clearCache() {
  cache.clear()
}

// Cache keys constants
export const CACHE_KEYS = {
  STUDENTS: 'students',
  BATCHES: 'batches',
  SUPERVISORS: 'supervisors',
  ATTENDANCE_ALL: 'attendance_all',
  JUZ_PROGRESS: 'juz_progress',
  EXAMS: 'exams',
  MEETINGS: 'meetings',
  PROGRAMS: 'programs',
  TASKS: 'tasks',
  QURAN_PLANS: 'quran_plans',
  TEXTS: 'texts',
  TEXT_UNITS: 'text_units',
  ASSIGNMENT_HISTORY: 'assignment_history',
  MATN_PROGRESS: 'matn_progress',
  STUDENT_TEXT_PROGRESS: 'student_text_progress',
  DAILY_FOLLOWUPS: 'daily_followups',
  WEEKLY_PLANS: 'weekly_plans',
  FOLLOWUP_ESCALATIONS: 'followup_escalations',
  EXAM_CANDIDATES: 'exam_candidates',
} as const
