import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireAuth } from '@/lib/api-auth'

// GET /api/notifications?limit=50&unread_only=true
export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth(req)
  if (error) return error

  const sp = req.nextUrl.searchParams
  const limit     = Math.min(100, Number(sp.get('limit') ?? 50))
  const unreadOnly = sp.get('unread_only') === 'true'
  const role = user.role ?? undefined

  let q = supabaseAdmin
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (role) q = q.or(`target_role.is.null,target_role.eq.${role}`)
  if (unreadOnly) q = q.eq('read', false)

  const { data, error: dbErr } = await q
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })

  return NextResponse.json({ notifications: data, total: data?.length ?? 0 })
}

// PATCH /api/notifications — body: { id } | { mark_all: true }
export async function PATCH(req: NextRequest) {
  const { user, error } = await requireAuth(req)
  if (error) return error

  const body = await req.json().catch(() => ({}))
  const role = user.role ?? undefined

  if (body.mark_all) {
    let q = supabaseAdmin.from('notifications').update({ read: true }).eq('read', false)
    if (role) q = q.or(`target_role.is.null,target_role.eq.${role}`)
    const { error: dbErr } = await q
    if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (body.id && typeof body.id === 'string') {
    const { error: dbErr } = await supabaseAdmin
      .from('notifications').update({ read: true }).eq('id', body.id)
    if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'يجب تمرير id أو mark_all' }, { status: 400 })
}

// DELETE /api/notifications?id=xxx | ?clear_read=true
export async function DELETE(req: NextRequest) {
  const { user, error } = await requireAuth(req, ['ceo'])
  if (error) return error

  const sp = req.nextUrl.searchParams
  const id        = sp.get('id')
  const clearRead = sp.get('clear_read') === 'true'

  if (id && typeof id === 'string') {
    const { error: dbErr } = await supabaseAdmin.from('notifications').delete().eq('id', id)
    if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (clearRead) {
    const { error: dbErr } = await supabaseAdmin.from('notifications').delete().eq('read', true)
    if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'يجب تمرير id أو clear_read' }, { status: 400 })
}
