/**
 * GET /api/admin/activity/snapshot
 * ─────────────────────────────────
 * يُعيد snapshot كامل لصفحة /admin/activity.
 * يفحص super_admin من الـsession قبل أي استعلام.
 *
 * ⚠️ ملف جديد — لا يُعدّل أي ملف موجود.
 */
import { NextResponse } from 'next/server'
import { fetchActivitySnapshot } from '@/lib/activity/queries'
import { getActivityAuth } from '@/lib/activity/server-auth'

export async function GET() {
  const auth = await getActivityAuth()
  if (!auth) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  if (!auth.isSuperAdmin) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  try {
    const snap = await fetchActivitySnapshot()
    return NextResponse.json(snap, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
