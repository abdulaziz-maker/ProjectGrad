/**
 * activity-rollup cron job
 * ─────────────────────────
 * يشتغل يومياً 02:00 صباحاً (UTC). يقوم بـ:
 *  1. بناء ملخصات يومية للأمس من `user_activity_log` → `user_activity_daily_summary`
 *  2. حذف من `user_activity_log` كل ما هو أقدم من 30 يوم
 *  3. حذف من `user_activity_daily_summary` كل ما هو أقدم من سنة
 *  4. تسجيل النتيجة في `automation_logs`
 *
 * Bearer auth بـ `CRON_SECRET` (عبر `isCronAuthorized`)
 *
 * ⚠️ ملف جديد — لا يُعدّل أي ملف موجود.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { isCronAuthorized } from '@/lib/api-auth'

// تاريخ بصيغة YYYY-MM-DD (UTC)
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function daysAgo(n: number): Date {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - n)
  return d
}

// ───────────────────────────────────────────────────────────
// 1) بناء ملخصات الأمس
// ───────────────────────────────────────────────────────────
async function buildYesterdayRollup(): Promise<number> {
  const yesterday = daysAgo(1)
  const yStart = new Date(yesterday)
  yStart.setUTCHours(0, 0, 0, 0)
  const yEnd = new Date(yesterday)
  yEnd.setUTCHours(23, 59, 59, 999)

  // جلب كل أنشطة الأمس
  const { data: logs, error } = await supabaseAdmin
    .from('user_activity_log')
    .select('user_id, tenant_id, page_path, activity_at')
    .gte('activity_at', yStart.toISOString())
    .lte('activity_at', yEnd.toISOString())

  if (error) throw new Error(`fetch logs failed: ${error.message}`)
  if (!logs || logs.length === 0) return 0

  // تجميع لكل (user_id)
  type Agg = {
    user_id: string
    tenant_id: number | null
    pages: Set<string>
    timestamps: number[]
  }
  const byUser = new Map<string, Agg>()

  for (const row of logs) {
    const ts = new Date(row.activity_at as string).getTime()
    const existing = byUser.get(row.user_id as string)
    if (existing) {
      existing.pages.add(row.page_path as string)
      existing.timestamps.push(ts)
    } else {
      byUser.set(row.user_id as string, {
        user_id: row.user_id as string,
        tenant_id: (row.tenant_id as number | null) ?? null,
        pages: new Set([row.page_path as string]),
        timestamps: [ts],
      })
    }
  }

  // حساب sessions_count: استراحة > 30 دقيقة = جلسة جديدة
  const SESSION_GAP_MS = 30 * 60 * 1000
  const activityDate = isoDate(yesterday)
  const upserts = Array.from(byUser.values()).map(agg => {
    const sorted = agg.timestamps.slice().sort((a, b) => a - b)
    let sessions = 1
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] - sorted[i - 1] > SESSION_GAP_MS) sessions++
    }
    return {
      user_id: agg.user_id,
      tenant_id: agg.tenant_id,
      activity_date: activityDate,
      sessions_count: sessions,
      pages_visited: agg.pages.size,
      first_activity: new Date(sorted[0]).toISOString(),
      last_activity: new Date(sorted[sorted.length - 1]).toISOString(),
    }
  })

  // upsert (لو شُغّل الـcron مرتين، يحدّث بدل ما يدبل)
  const { error: upErr } = await supabaseAdmin
    .from('user_activity_daily_summary')
    .upsert(upserts, { onConflict: 'user_id,activity_date' })

  if (upErr) throw new Error(`upsert summary failed: ${upErr.message}`)
  return upserts.length
}

// ───────────────────────────────────────────────────────────
// 2) حذف logs أقدم من 30 يوم
// ───────────────────────────────────────────────────────────
async function purgeOldLogs(): Promise<number> {
  const cutoff = daysAgo(30).toISOString()
  const { error, count } = await supabaseAdmin
    .from('user_activity_log')
    .delete({ count: 'exact' })
    .lt('activity_at', cutoff)
  if (error) throw new Error(`purge logs failed: ${error.message}`)
  return count ?? 0
}

// ───────────────────────────────────────────────────────────
// 3) حذف summaries أقدم من سنة
// ───────────────────────────────────────────────────────────
async function purgeOldSummaries(): Promise<number> {
  const cutoff = isoDate(daysAgo(365))
  const { error, count } = await supabaseAdmin
    .from('user_activity_daily_summary')
    .delete({ count: 'exact' })
    .lt('activity_date', cutoff)
  if (error) throw new Error(`purge summaries failed: ${error.message}`)
  return count ?? 0
}

// ───────────────────────────────────────────────────────────
// Entry point
// ───────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const started = Date.now()
  try {
    const [summarized, logsDeleted, summariesDeleted] = await Promise.all([
      buildYesterdayRollup(),
      purgeOldLogs(),
      purgeOldSummaries(),
    ])

    const result = {
      summarized,
      logsDeleted,
      summariesDeleted,
      duration_ms: Date.now() - started,
    }

    // تسجيل في automation_logs (لو الجدول موجود — silent fail)
    try {
      await supabaseAdmin.from('automation_logs').insert({
        job_name: 'activity-rollup',
        status: 'success',
        records_processed: summarized + logsDeleted + summariesDeleted,
        details: result,
        error_message: null,
      })
    } catch { /* ignore log failure */ }

    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    try {
      await supabaseAdmin.from('automation_logs').insert({
        job_name: 'activity-rollup',
        status: 'error',
        records_processed: 0,
        details: { duration_ms: Date.now() - started },
        error_message: msg,
      })
    } catch { /* ignore */ }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest) { return GET(req) }
