/**
 * activity/queries
 * ────────────────
 * استعلامات صفحة /admin/activity. كلها server-only.
 * تستعمل `supabaseAdmin` (تجاوز RLS) لأن super_admin تم التحقق منه قبل النداء.
 *
 * ⚠️ ملف جديد — لا يُعدّل أي ملف موجود.
 */
import { supabaseAdmin } from '@/lib/supabase-admin'

// ───────────────────────────────────────────────────────────
// أنواع البيانات
// ───────────────────────────────────────────────────────────
export interface OnlineUser {
  user_id: string
  name: string
  role: string | null
  batch_id: number | null
  tenant_id: number | null
  last_activity: string  // ISO
  page_path: string
}

export interface TodayStats {
  unique_users_today: number
  total_sessions_today: number
  unique_users_yesterday: number
  total_sessions_yesterday: number
  delta_users_pct: number | null   // null لو الأمس = 0
  delta_sessions_pct: number | null
}

export interface ConcurrentStats {
  max_today: number
  max_30d: number
}

export interface ActivitySnapshot {
  online: OnlineUser[]
  today: TodayStats
  concurrent: ConcurrentStats
  generated_at: string
}

// ───────────────────────────────────────────────────────────
// helpers
// ───────────────────────────────────────────────────────────
function hoursAgo(h: number): Date {
  return new Date(Date.now() - h * 3600_000)
}
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}
function startOfDayUtc(d: Date): Date {
  const x = new Date(d)
  x.setUTCHours(0, 0, 0, 0)
  return x
}
function endOfDayUtc(d: Date): Date {
  const x = new Date(d)
  x.setUTCHours(23, 59, 59, 999)
  return x
}
// عدد جلسات: استراحة > 30 دقيقة = جلسة جديدة
function countSessions(timestamps: number[]): number {
  if (timestamps.length === 0) return 0
  const sorted = timestamps.slice().sort((a, b) => a - b)
  let sessions = 1
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - sorted[i - 1] > 30 * 60_000) sessions++
  }
  return sessions
}
// أعلى عدد مستخدمين متزامنين في أي نافذة `windowSeconds`
function maxConcurrent(
  logs: { user_id: string; activity_at: string }[],
  windowSeconds = 300,
): number {
  if (logs.length === 0) return 0
  const buckets = new Map<number, Set<string>>()
  for (const row of logs) {
    const bucket = Math.floor(new Date(row.activity_at).getTime() / 1000 / windowSeconds)
    const set = buckets.get(bucket) ?? new Set<string>()
    set.add(row.user_id)
    buckets.set(bucket, set)
  }
  let max = 0
  for (const s of buckets.values()) if (s.size > max) max = s.size
  return max
}

// ───────────────────────────────────────────────────────────
// 1) آخر المتصلين (last 24h)
// ───────────────────────────────────────────────────────────
async function fetchOnlineUsers(limit = 50): Promise<OnlineUser[]> {
  const since = hoursAgo(24).toISOString()

  // جلب آخر نشاط لكل (user_id) في آخر 24س
  // استعلام واحد، نُعالج التميّز في JS لتجنّب RPC إضافي
  const { data: logs, error } = await supabaseAdmin
    .from('user_activity_log')
    .select('user_id, page_path, activity_at, tenant_id')
    .gte('activity_at', since)
    .order('activity_at', { ascending: false })
    .limit(2000)  // كافٍ لاستخراج 50 user_id فريد

  if (error) throw new Error(`online: ${error.message}`)
  if (!logs || logs.length === 0) return []

  // dedupe: أول مرّة نرى user_id = أحدث نشاط له (بفضل ترتيب DESC)
  const seen = new Map<string, { page_path: string; activity_at: string; tenant_id: number | null }>()
  for (const row of logs) {
    const uid = row.user_id as string
    if (seen.has(uid)) continue
    seen.set(uid, {
      page_path: row.page_path as string,
      activity_at: row.activity_at as string,
      tenant_id: (row.tenant_id as number | null) ?? null,
    })
    if (seen.size >= limit) break
  }

  if (seen.size === 0) return []

  // جلب أسماء المستخدمين دفعة واحدة
  const userIds = Array.from(seen.keys())
  const { data: profiles, error: pErr } = await supabaseAdmin
    .from('profiles')
    .select('id, name, role, batch_id')
    .in('id', userIds)

  if (pErr) throw new Error(`profiles: ${pErr.message}`)
  const profilesMap = new Map(
    (profiles ?? []).map(p => [p.id as string, p as { id: string; name: string; role: string | null; batch_id: number | null }])
  )

  // بناء النتيجة بنفس ترتيب أحدثية النشاط
  const result: OnlineUser[] = []
  for (const [uid, info] of seen.entries()) {
    const p = profilesMap.get(uid)
    result.push({
      user_id: uid,
      name: p?.name ?? 'مستخدم محذوف',
      role: p?.role ?? null,
      batch_id: p?.batch_id ?? null,
      tenant_id: info.tenant_id,
      last_activity: info.activity_at,
      page_path: info.page_path,
    })
  }
  return result
}

// ───────────────────────────────────────────────────────────
// 2) نشاط اليوم + الأمس + الفروق
// ───────────────────────────────────────────────────────────
async function fetchTodayStats(): Promise<TodayStats> {
  const now = new Date()
  const todayStart = startOfDayUtc(now)
  const yesterdayStart = startOfDayUtc(new Date(now.getTime() - 24 * 3600_000))
  const yesterdayEnd = endOfDayUtc(new Date(now.getTime() - 24 * 3600_000))

  // اليوم + الأمس في استعلام واحد (range يبدأ من بداية الأمس)
  const { data, error } = await supabaseAdmin
    .from('user_activity_log')
    .select('user_id, activity_at')
    .gte('activity_at', yesterdayStart.toISOString())
    .lte('activity_at', endOfDayUtc(now).toISOString())

  if (error) throw new Error(`today: ${error.message}`)
  const rows = data ?? []

  // فصل اليوم/الأمس
  const todayMs = todayStart.getTime()
  const yesterdayEndMs = yesterdayEnd.getTime()

  const todayByUser = new Map<string, number[]>()
  const yestByUser  = new Map<string, number[]>()

  for (const row of rows) {
    const ts = new Date(row.activity_at as string).getTime()
    const uid = row.user_id as string
    const target = ts >= todayMs ? todayByUser : (ts <= yesterdayEndMs ? yestByUser : null)
    if (!target) continue
    const arr = target.get(uid) ?? []
    arr.push(ts)
    target.set(uid, arr)
  }

  const todaySessions  = Array.from(todayByUser.values()).reduce((sum, ts) => sum + countSessions(ts), 0)
  const yestSessions   = Array.from(yestByUser.values()).reduce((sum, ts) => sum + countSessions(ts), 0)

  const pct = (curr: number, prev: number) => {
    if (prev === 0) return curr === 0 ? 0 : null  // null = ∞ نَعرضه كـ"جديد"
    return ((curr - prev) / prev) * 100
  }

  return {
    unique_users_today: todayByUser.size,
    total_sessions_today: todaySessions,
    unique_users_yesterday: yestByUser.size,
    total_sessions_yesterday: yestSessions,
    delta_users_pct: pct(todayByUser.size, yestByUser.size),
    delta_sessions_pct: pct(todaySessions, yestSessions),
  }
}

// ───────────────────────────────────────────────────────────
// 3) أعلى متزامنين (اليوم + آخر 30 يوم)
// ───────────────────────────────────────────────────────────
async function fetchConcurrentStats(): Promise<ConcurrentStats> {
  const now = new Date()
  const todayStart = startOfDayUtc(now)
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 3600_000)

  // استعلام واحد لآخر 30 يوم (يشمل اليوم)
  // page_path غير مطلوب هنا — نقلّل الـpayload
  const { data, error } = await supabaseAdmin
    .from('user_activity_log')
    .select('user_id, activity_at')
    .gte('activity_at', thirtyDaysAgo.toISOString())

  if (error) throw new Error(`concurrent: ${error.message}`)
  const rows = data ?? []

  const todayRows = rows.filter(r => new Date(r.activity_at as string).getTime() >= todayStart.getTime())

  return {
    max_today: maxConcurrent(todayRows as { user_id: string; activity_at: string }[], 300),
    max_30d:   maxConcurrent(rows     as { user_id: string; activity_at: string }[], 300),
  }
}

// ───────────────────────────────────────────────────────────
// Public API — استعلام واحد متوازٍ (Promise.all)
// ───────────────────────────────────────────────────────────
export async function fetchActivitySnapshot(): Promise<ActivitySnapshot> {
  const [online, today, concurrent] = await Promise.all([
    fetchOnlineUsers(50),
    fetchTodayStats(),
    fetchConcurrentStats(),
  ])

  return {
    online,
    today,
    concurrent,
    generated_at: new Date().toISOString(),
  }
}
