/**
 * /api/admin/create-user
 * ──────────────────────
 * GET   → خيارات الـform (tenants + batches) — super_admin فقط
 * POST  → إنشاء حساب جديد (auth + profile) — super_admin فقط
 *
 * ⚠️ ملف جديد — لا يُعدّل أي ملف موجود.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireSuperAdmin } from '@/lib/admin/server-auth'

// الأدوار المسموح إنشاؤها — لا يمكن إنشاء super_admin إضافي عبر هذا المسار
const ALLOWED_ROLES = ['ceo', 'batch_manager', 'supervisor', 'teacher', 'records_officer'] as const
type AllowedRole = typeof ALLOWED_ROLES[number]
function isAllowedRole(v: unknown): v is AllowedRole {
  return typeof v === 'string' && (ALLOWED_ROLES as readonly string[]).includes(v)
}

// ───────────────────────────────────────────────────────────
// GET — خيارات الـform
// ───────────────────────────────────────────────────────────
export async function GET() {
  const auth = await requireSuperAdmin()
  if (!auth) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const [tenantsRes, batchesRes] = await Promise.all([
    supabaseAdmin
      .from('tenants')
      .select('id, name_ar, name, slug, is_active')
      .eq('is_active', true)
      .order('id'),
    supabaseAdmin
      .from('batches')
      .select('id, name, tenant_id')
      .order('tenant_id')
      .order('id'),
  ])

  if (tenantsRes.error) return NextResponse.json({ error: tenantsRes.error.message }, { status: 500 })
  if (batchesRes.error) return NextResponse.json({ error: batchesRes.error.message }, { status: 500 })

  return NextResponse.json({
    tenants: tenantsRes.data ?? [],
    batches: batchesRes.data ?? [],
    roles: ALLOWED_ROLES,
  }, { headers: { 'Cache-Control': 'no-store' } })
}

// ───────────────────────────────────────────────────────────
// POST — إنشاء حساب
// ───────────────────────────────────────────────────────────
interface CreateUserBody {
  email: string
  password: string
  name: string
  role: string
  tenant_id: number
  batch_id?: number | null
}

export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin()
  if (!auth) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  let body: CreateUserBody
  try {
    body = await req.json() as CreateUserBody
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  // ── validation ─────────────────────────────────────────
  const email = (body.email ?? '').trim().toLowerCase()
  const password = body.password ?? ''
  const name = (body.name ?? '').trim()
  const role = body.role
  const tenantId = Number(body.tenant_id)
  const batchId = body.batch_id == null ? null : Number(body.batch_id)

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return NextResponse.json({ error: 'البريد الإلكتروني غير صالح' }, { status: 400 })
  if (password.length < 8)
    return NextResponse.json({ error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' }, { status: 400 })
  if (!name || name.length < 2)
    return NextResponse.json({ error: 'الاسم مطلوب' }, { status: 400 })
  if (!isAllowedRole(role))
    return NextResponse.json({ error: 'الدور غير مسموح' }, { status: 400 })
  if (!Number.isFinite(tenantId) || tenantId <= 0)
    return NextResponse.json({ error: 'الحلقة (tenant) مطلوبة' }, { status: 400 })

  // batch_id منطقياً مطلوب للأدوار التشغيلية، اختياري للـceo/records_officer
  const rolesNeedingBatch: AllowedRole[] = ['batch_manager', 'supervisor', 'teacher']
  if (rolesNeedingBatch.includes(role) && !batchId)
    return NextResponse.json({ error: 'الدفعة مطلوبة لهذا الدور' }, { status: 400 })

  // التحقق من tenant_id
  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('id')
    .eq('id', tenantId)
    .maybeSingle()
  if (!tenant) return NextResponse.json({ error: 'الحلقة غير موجودة' }, { status: 400 })

  // التحقق من batch_id ينتمي للـtenant الصحيح
  if (batchId != null) {
    const { data: batch } = await supabaseAdmin
      .from('batches')
      .select('id, tenant_id')
      .eq('id', batchId)
      .maybeSingle()
    if (!batch) return NextResponse.json({ error: 'الدفعة غير موجودة' }, { status: 400 })
    if (batch.tenant_id !== tenantId)
      return NextResponse.json({ error: 'الدفعة لا تنتمي للحلقة المختارة' }, { status: 400 })
  }

  // ── إنشاء auth user ────────────────────────────────────
  const { data: created, error: authErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,   // لا نحتاج تأكيد بريد — super_admin اعتمد الحساب
    user_metadata: { name, role },
  })

  if (authErr || !created?.user) {
    const msg = authErr?.message ?? 'فشل إنشاء حساب المصادقة'
    if (msg.toLowerCase().includes('already') || msg.includes('exists'))
      return NextResponse.json({ error: 'هذا البريد مسجّل بالفعل' }, { status: 409 })
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  // ── إنشاء profile ──────────────────────────────────────
  const newUserId = created.user.id
  const { error: profErr } = await supabaseAdmin
    .from('profiles')
    .insert({
      id: newUserId,
      role,
      batch_id: batchId,
      name,
      tenant_id: tenantId,
      is_super_admin: false,   // لا يمكن إنشاء super_admin عبر هذا المسار
    })

  if (profErr) {
    // rollback: نحذف auth user لمنع حسابات يتيمة
    await supabaseAdmin.auth.admin.deleteUser(newUserId).catch(() => {})
    return NextResponse.json({ error: `فشل إنشاء الملف الشخصي: ${profErr.message}` }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    user: {
      id: newUserId,
      email,
      name,
      role,
      tenant_id: tenantId,
      batch_id: batchId,
    },
  }, { status: 201 })
}
