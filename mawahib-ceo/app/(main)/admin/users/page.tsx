'use client'
/**
 * /admin/users — إدارة الحسابات
 *
 * المحتوى:
 *  1) "حسابي" — تعديل الاسم/البريد/كلمة المرور للمستخدم الحالي
 *  2) "إنشاء حساب جديد" — super_admin فقط (يستعمل /api/admin/create-user)
 *  3) "الحسابات المسجلة" — قائمة + تعديل + حذف (CEO)
 */
import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Loader2, ShieldCheck, UserPlus, Pencil, Trash2, Save, X, User, Mail, Lock, Users,
  Building2, GraduationCap, KeyRound, RefreshCw, Copy, Check, ChevronDown, ChevronUp,
} from 'lucide-react'

// ─── types ──────────────────────────────────────────────────
interface UserAccount {
  id: string
  email: string
  role: string
  batch_id: number | null
  tenant_id: number | null
  name: string
}
interface Tenant { id: number; name_ar: string | null; name: string | null; slug: string | null }
interface Batch  { id: number; name: string | null; tenant_id: number | null }
interface Options { tenants: Tenant[]; batches: Batch[]; roles: string[] }

const ROLE_LABELS: Record<string, string> = {
  ceo: 'مدير تنفيذي',
  batch_manager: 'مدير دفعة',
  supervisor: 'مشرف',
  teacher: 'معلم',
  records_officer: 'موظف سجلات / اختبارات',
}
const ROLE_COLORS: Record<string, string> = {
  ceo:             'bg-amber-100 text-amber-800 border-amber-200',
  batch_manager:   'bg-rose-100 text-rose-800 border-rose-200',
  supervisor:      'bg-blue-100 text-blue-800 border-blue-200',
  teacher:         'bg-purple-100 text-purple-800 border-purple-200',
  records_officer: 'bg-emerald-100 text-emerald-800 border-emerald-200',
}
const ROLES_NEED_BATCH = new Set(['batch_manager', 'supervisor', 'teacher'])

function genPassword(len = 12): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%'
  let out = ''
  const arr = new Uint32Array(len)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(arr)
    for (let i = 0; i < len; i++) out += chars[arr[i] % chars.length]
  } else {
    for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)]
  }
  return out
}

export default function AdminUsersPage() {
  const { profile, session } = useAuth()
  const router = useRouter()
  const isSuperAdmin = !!profile?.is_super_admin

  const [users, setUsers]     = useState<UserAccount[]>([])
  const [loading, setLoading] = useState(true)

  // My account edit
  const [myEmail, setMyEmail]               = useState('')
  const [myName, setMyName]                 = useState('')
  const [myNewPassword, setMyNewPassword]   = useState('')
  const [savingMy, setSavingMy]             = useState(false)

  // ─── Add new user (super_admin only) ───────────────────
  const [showAdd, setShowAdd]   = useState(false)
  const [opts, setOpts]         = useState<Options | null>(null)
  const [loadingOpts, setLO]    = useState(false)
  const [addName, setAddName]   = useState('')
  const [addEmail, setAddEmail] = useState('')
  const [addPass, setAddPass]   = useState(() => genPassword())
  const [addRole, setAddRole]   = useState('supervisor')
  const [addTenant, setAddTenant] = useState<number | ''>('')
  const [addBatch, setAddBatch] = useState<number | ''>('')
  const [adding, setAdding]     = useState(false)
  const [created, setCreated]   = useState<{ name: string; email: string; password: string } | null>(null)
  const [copied, setCopied]     = useState(false)

  // Edit user
  const [editId, setEditId]         = useState<string | null>(null)
  const [editForm, setEditForm]     = useState({ name: '', role: '', batch_id: null as number | null })
  const [savingEdit, setSavingEdit] = useState(false)

  // Only CEO can access this page (super_admin يدخل لأنه عادةً ceo)
  useEffect(() => {
    if (profile && profile.role !== 'ceo') { router.replace('/dashboard') }
  }, [profile, router])

  // Load users
  const loadUsers = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('id, role, batch_id, name, tenant_id')
    if (error) { toast.error('خطأ في تحميل الحسابات'); setLoading(false); return }
    const accounts: UserAccount[] = (data || []).map(p => ({
      id: p.id as string,
      email: '',
      role: p.role as string,
      batch_id: p.batch_id as number | null,
      tenant_id: (p.tenant_id ?? null) as number | null,
      name: p.name as string,
    }))
    setUsers(accounts)
    setLoading(false)
  }, [])

  useEffect(() => { loadUsers() }, [loadUsers])

  useEffect(() => {
    if (session?.user?.email) setMyEmail(session.user.email)
    if (profile?.name) setMyName(profile.name)
  }, [session, profile])

  // جلب tenants + batches عند فتح الـform (super_admin فقط)
  useEffect(() => {
    if (!showAdd || !isSuperAdmin || opts) return
    setLO(true)
    fetch('/api/admin/create-user', { cache: 'no-store' })
      .then(async r => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`)
        return r.json() as Promise<Options>
      })
      .then(setOpts)
      .catch(err => toast.error(err instanceof Error ? err.message : 'فشل تحميل الخيارات'))
      .finally(() => setLO(false))
  }, [showAdd, isSuperAdmin, opts])

  // الدفعات المتاحة حسب الـtenant
  const availableBatches = useMemo(() => {
    if (!opts || addTenant === '') return []
    return opts.batches.filter(b => b.tenant_id === Number(addTenant))
  }, [opts, addTenant])

  // مسح الدفعة لو لم تعد متاحة
  useEffect(() => {
    if (addBatch !== '' && !availableBatches.some(b => b.id === Number(addBatch))) setAddBatch('')
  }, [addTenant, availableBatches, addBatch])

  const needsBatch = ROLES_NEED_BATCH.has(addRole)
  const canCreate = (
    !adding &&
    addName.trim().length >= 2 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addEmail.trim()) &&
    addPass.length >= 8 &&
    !!addRole &&
    addTenant !== '' &&
    (!needsBatch || addBatch !== '')
  )

  // ── My Account ──
  async function handleSaveMy() {
    setSavingMy(true)
    try {
      if (myName && myName !== profile?.name && profile) {
        const { error } = await supabase.from('profiles').update({ name: myName }).eq('id', profile.id)
        if (error) { toast.error('خطأ في تحديث الاسم: ' + error.message); setSavingMy(false); return }
      }
      if (myNewPassword && myNewPassword.length > 0) {
        if (myNewPassword.length < 6) { toast.error('كلمة المرور 6 أحرف على الأقل'); setSavingMy(false); return }
        const { error } = await supabase.auth.updateUser({ password: myNewPassword })
        if (error) { toast.error('خطأ في تحديث كلمة المرور: ' + error.message); setSavingMy(false); return }
      }
      if (myEmail && myEmail !== session?.user?.email) {
        const { error } = await supabase.auth.updateUser({ email: myEmail })
        if (error) { toast.error('خطأ في تحديث الإيميل: ' + error.message); setSavingMy(false); return }
        toast.success('تم الحفظ. تحقق من بريدك الجديد لتأكيد التغيير')
      } else {
        toast.success('تم تحديث بياناتك بنجاح')
      }
      setMyNewPassword('')
      loadUsers()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'غير معروف'
      toast.error('خطأ: ' + msg)
    } finally {
      setSavingMy(false)
    }
  }

  // ── Add User (via secure API) ──
  async function handleAddUser() {
    if (!canCreate) return
    setAdding(true)
    try {
      const res = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: addEmail.trim().toLowerCase(),
          password: addPass,
          name: addName.trim(),
          role: addRole,
          tenant_id: Number(addTenant),
          batch_id: needsBatch ? Number(addBatch) : (addBatch === '' ? null : Number(addBatch)),
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(body.error ?? 'فشل الإنشاء'); return }
      toast.success(`تم إنشاء حساب ${addName.trim()}`)
      setCreated({ name: addName.trim(), email: addEmail.trim().toLowerCase(), password: addPass })
      loadUsers()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'خطأ غير معروف')
    } finally {
      setAdding(false)
    }
  }

  function resetAddForm() {
    setAddName(''); setAddEmail(''); setAddPass(genPassword())
    setAddRole('supervisor'); setAddTenant(''); setAddBatch('')
    setCreated(null); setCopied(false)
  }

  function copyCreated() {
    if (!created) return
    const text = `الاسم: ${created.name}\nالبريد: ${created.email}\nكلمة المرور: ${created.password}`
    navigator.clipboard?.writeText(text)
      .then(() => { setCopied(true); toast.success('نُسخت بيانات الحساب'); setTimeout(() => setCopied(false), 2500) })
      .catch(() => toast.error('تعذّر النسخ — انسخ يدوياً'))
  }

  // ── Edit User ──
  async function handleEditSave(userId: string) {
    setSavingEdit(true)
    try {
      const { error } = await supabase.from('profiles').update({
        name: editForm.name,
        role: editForm.role,
        batch_id: ROLES_NEED_BATCH.has(editForm.role) ? editForm.batch_id : null,
      }).eq('id', userId)
      if (error) { toast.error('خطأ في التحديث: ' + error.message); return }
      toast.success('تم التحديث')
      setEditId(null)
      loadUsers()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'غير معروف'
      toast.error('خطأ: ' + msg)
    } finally {
      setSavingEdit(false)
    }
  }

  async function handleDelete(userId: string, userName: string) {
    if (userId === profile?.id) { toast.error('لا يمكنك حذف حسابك'); return }
    if (!confirm(`هل تريد حذف حساب "${userName}"؟`)) return
    const { error } = await supabase.from('profiles').delete().eq('id', userId)
    if (error) toast.error('خطأ في الحذف: ' + error.message)
    else { toast.success('تم حذف الحساب من الملفات الشخصية'); loadUsers() }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#C08A48' }} />
      </div>
    )
  }

  return (
    <div dir="rtl" className="min-h-screen p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-6 animate-fade-in-up">

        {/* Title */}
        <div>
          <h1 className="text-2xl font-extrabold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <ShieldCheck className="w-6 h-6" style={{ color: '#C08A48' }} />
            إدارة الحسابات
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>إدارة حسابات المستخدمين والصلاحيات</p>
        </div>

        {/* ── My Account ── */}
        <div className="card-static overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100" style={{ background: 'rgba(192,138,72,0.06)' }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#C08A48' }}>
              <User className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="font-bold" style={{ color: 'var(--text-primary)' }}>حسابي</h2>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>تعديل بيانات الحساب الخاص بك</p>
            </div>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                  <User className="w-3.5 h-3.5 text-gray-400" /> الاسم
                </label>
                <input type="text" value={myName} onChange={e => setMyName(e.target.value)}
                  className="w-full mt-1 px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#C08A48] transition-colors" />
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                  <Mail className="w-3.5 h-3.5 text-gray-400" /> البريد الإلكتروني
                </label>
                <input type="email" value={myEmail} onChange={e => setMyEmail(e.target.value)} dir="ltr"
                  className="w-full mt-1 px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#C08A48] transition-colors" />
              </div>
              <div className="md:col-span-2">
                <label className="flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                  <Lock className="w-3.5 h-3.5 text-gray-400" /> كلمة مرور جديدة <span className="text-xs text-gray-400 font-normal">(اتركه فارغ إذا ما تبي تغيّر)</span>
                </label>
                <input type="password" value={myNewPassword} onChange={e => setMyNewPassword(e.target.value)} dir="ltr"
                  placeholder="••••••••"
                  className="w-full mt-1 px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#C08A48] transition-colors" />
              </div>
            </div>
            <div className="flex justify-end">
              <button onClick={handleSaveMy} disabled={savingMy}
                className="btn-primary btn-ripple flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-medium disabled:opacity-50">
                {savingMy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {savingMy ? 'جاري الحفظ...' : 'حفظ التعديلات'}
              </button>
            </div>
          </div>
        </div>

        {/* ── إنشاء حساب جديد (super_admin) ── */}
        {isSuperAdmin && (
          <div className="card-static overflow-hidden">
            <button
              onClick={() => { if (created) resetAddForm(); setShowAdd(v => !v) }}
              className="w-full flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-100"
              style={{ background: 'rgba(53,107,110,0.06)' }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: '#1a4042' }}>
                  <UserPlus className="w-4 h-4 text-white" />
                </div>
                <div className="text-right">
                  <h2 className="font-bold" style={{ color: 'var(--text-primary)' }}>إنشاء حساب جديد</h2>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>أضف مستخدماً لأي حلقة بأي دور — super_admin فقط</p>
                </div>
              </div>
              {showAdd ? <ChevronUp className="w-5 h-5" style={{ color: 'var(--text-muted)' }} />
                       : <ChevronDown className="w-5 h-5" style={{ color: 'var(--text-muted)' }} />}
            </button>

            {showAdd && (
              <div className="p-5">
                {created ? (
                  <SuccessCard created={created} copied={copied} onCopy={copyCreated} onAnother={resetAddForm} />
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FieldText label="الاسم *" Icon={User} value={addName} onChange={setAddName} placeholder="مثال: عبدالله محمد" />
                      <FieldText label="البريد الإلكتروني *" Icon={Mail} value={addEmail} onChange={setAddEmail} placeholder="user@example.com" ltr />

                      {/* password with regenerate */}
                      <div className="md:col-span-2">
                        <label className="flex items-center gap-1.5 text-xs font-bold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                          <Lock className="w-3.5 h-3.5" /> كلمة المرور * <span className="font-normal opacity-70">(8 أحرف على الأقل)</span>
                        </label>
                        <div className="flex gap-2">
                          <input type="text" value={addPass} onChange={e => setAddPass(e.target.value)} dir="ltr"
                            className="flex-1 px-3.5 py-2.5 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#C08A48]/30 font-mono text-left"
                            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }} />
                          <button type="button" onClick={() => setAddPass(genPassword())}
                            className="px-3 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5"
                            style={{ background: 'rgba(192,138,72,0.12)', color: '#7A4E1E', border: '1px solid rgba(192,138,72,0.35)' }}>
                            <RefreshCw className="w-3.5 h-3.5" /> توليد
                          </button>
                        </div>
                      </div>

                      {/* role */}
                      <div>
                        <label className="flex items-center gap-1.5 text-xs font-bold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                          <KeyRound className="w-3.5 h-3.5" /> الدور *
                        </label>
                        <select value={addRole} onChange={e => setAddRole(e.target.value)}
                          className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#C08A48]/30"
                          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}>
                          {Object.entries(ROLE_LABELS).map(([v, lbl]) => (
                            <option key={v} value={v}>{lbl}</option>
                          ))}
                        </select>
                      </div>

                      {/* tenant */}
                      <div>
                        <label className="flex items-center gap-1.5 text-xs font-bold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                          <Building2 className="w-3.5 h-3.5" /> الحلقة *
                        </label>
                        <select value={addTenant} onChange={e => setAddTenant(e.target.value === '' ? '' : Number(e.target.value))}
                          disabled={loadingOpts || !opts}
                          className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#C08A48]/30 disabled:opacity-50"
                          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}>
                          <option value="">— اختر الحلقة —</option>
                          {opts?.tenants.map(t => (
                            <option key={t.id} value={t.id}>{t.name_ar ?? t.name ?? t.slug ?? `tenant ${t.id}`}</option>
                          ))}
                        </select>
                      </div>

                      {/* batch */}
                      <div>
                        <label className="flex items-center gap-1.5 text-xs font-bold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                          <GraduationCap className="w-3.5 h-3.5" />
                          {needsBatch ? 'الدفعة *' : 'الدفعة (اختيارية)'}
                        </label>
                        <select value={addBatch} onChange={e => setAddBatch(e.target.value === '' ? '' : Number(e.target.value))}
                          disabled={loadingOpts || addTenant === ''}
                          className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#C08A48]/30 disabled:opacity-50"
                          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}>
                          <option value="">— {addTenant === '' ? 'اختر الحلقة أولاً' : 'بلا دفعة'} —</option>
                          {availableBatches.map(b => (
                            <option key={b.id} value={b.id}>{b.name ?? `دفعة ${b.id}`}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <p className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
                      ⚠️ لا يمكن إنشاء super_admin إضافي عبر هذا المسار لأمان النظام.
                    </p>

                    <div className="flex justify-end gap-2">
                      <button onClick={() => { setShowAdd(false); resetAddForm() }}
                        className="px-4 py-2.5 rounded-xl border text-sm" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>
                        إلغاء
                      </button>
                      <button onClick={handleAddUser} disabled={!canCreate}
                        className="btn-primary btn-ripple flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-50">
                        {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                        {adding ? 'يُنشأ…' : 'إنشاء الحساب'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Users List ── */}
        <div className="card-static overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
                <Users className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <h2 className="font-bold" style={{ color: 'var(--text-primary)' }}>الحسابات المسجلة</h2>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{users.length} حساب</p>
              </div>
            </div>
          </div>

          <div className="divide-y divide-gray-50">
            {users.length === 0 ? (
              <div className="p-10 text-center text-gray-400">لا توجد حسابات</div>
            ) : (
              users.map(user => {
                const isMe = user.id === profile?.id
                const isEditing = editId === user.id

                if (isEditing) {
                  return (
                    <div key={user.id} className="px-5 py-4 bg-blue-50/50">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>الاسم</label>
                          <input type="text" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#C08A48]" />
                        </div>
                        <div>
                          <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>الدور</label>
                          <select value={editForm.role} onChange={e => setEditForm({ ...editForm, role: e.target.value })}
                            disabled={isMe}
                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#C08A48] disabled:opacity-50">
                            {Object.entries(ROLE_LABELS).map(([v, lbl]) => <option key={v} value={v}>{lbl}</option>)}
                          </select>
                        </div>
                        {ROLES_NEED_BATCH.has(editForm.role) && (
                          <div>
                            <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>الدفعة</label>
                            <select value={editForm.batch_id ?? ''} onChange={e => setEditForm({ ...editForm, batch_id: e.target.value === '' ? null : Number(e.target.value) })}
                              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#C08A48]">
                              <option value="">— اختر —</option>
                              {(opts?.batches ?? []).map(b => (
                                <option key={b.id} value={b.id}>{b.name ?? `دفعة ${b.id}`}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                      <div className="mt-3 flex gap-2 justify-end">
                        <button onClick={() => setEditId(null)}
                          className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs hover:bg-gray-50" style={{ color: 'var(--text-secondary)' }}>إلغاء</button>
                        <button onClick={() => handleEditSave(user.id)} disabled={savingEdit}
                          className="btn-primary btn-ripple flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-white text-xs font-medium disabled:opacity-50">
                          {savingEdit && <Loader2 className="w-3 h-3 animate-spin" />}
                          حفظ
                        </button>
                      </div>
                    </div>
                  )
                }

                return (
                  <div key={user.id} className="px-5 py-4 flex items-center justify-between hover:bg-gray-50/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold"
                        style={{ backgroundColor: user.role === 'ceo' ? '#b45309' : '#C08A48' }}>
                        {user.name.charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{user.name}</p>
                          {isMe && <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">أنت</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${ROLE_COLORS[user.role] ?? 'bg-gray-100 text-gray-600'}`}>
                            {ROLE_LABELS[user.role] ?? user.role}
                          </span>
                          {user.batch_id && (
                            <span className="text-xs text-gray-400">دفعة {user.batch_id}</span>
                          )}
                          {user.tenant_id != null && (
                            <span className="text-xs text-gray-400">· tenant {user.tenant_id}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => { setEditId(user.id); setEditForm({ name: user.name, role: user.role, batch_id: user.batch_id }) }}
                        className="p-2 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        title="تعديل">
                        <Pencil className="w-4 h-4" />
                      </button>
                      {!isMe && (
                        <button onClick={() => handleDelete(user.id, user.name)}
                          className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                          title="حذف">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── helpers ────────────────────────────────────────────────
function FieldText({ label, Icon, value, onChange, placeholder, ltr = false }: {
  label: string
  Icon: typeof Mail
  value: string
  onChange: (v: string) => void
  placeholder?: string
  ltr?: boolean
}) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-xs font-bold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
        <Icon className="w-3.5 h-3.5" /> {label}
      </label>
      <input
        type="text" value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} dir={ltr ? 'ltr' : 'rtl'}
        className={`w-full px-3.5 py-2.5 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#C08A48]/30 ${ltr ? 'text-left' : ''}`}
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
      />
    </div>
  )
}

function SuccessCard({ created, copied, onCopy, onAnother }: {
  created: { name: string; email: string; password: string }
  copied: boolean
  onCopy: () => void
  onAnother: () => void
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl p-4 flex items-start gap-3" style={{ background: 'rgba(90,143,103,0.10)', border: '1px solid rgba(90,143,103,0.40)' }}>
        <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: '#5A8F67' }}>
          <Check className="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 className="font-extrabold text-sm" style={{ color: 'var(--text-primary)' }}>تم إنشاء الحساب</h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            انسخ البيانات وأرسلها للمستخدم — لن نُظهر كلمة المرور مرة أخرى.
          </p>
        </div>
      </div>

      <div className="card-static p-4 space-y-3">
        <SuccessRow label="الاسم" value={created.name} />
        <SuccessRow label="البريد" value={created.email} mono />
        <SuccessRow label="كلمة المرور" value={created.password} mono highlight />
      </div>

      <div className="flex gap-2">
        <button onClick={onCopy}
          className="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-white"
          style={{ background: copied ? '#5A8F67' : 'var(--accent-warm)' }}>
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          {copied ? 'نُسخت' : 'انسخ الكل'}
        </button>
        <button onClick={onAnother}
          className="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-xl font-bold border"
          style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>
          <UserPlus className="w-4 h-4" />
          إنشاء حساب آخر
        </button>
      </div>
    </div>
  )
}

function SuccessRow({ label, value, mono = false, highlight = false }: { label: string; value: string; mono?: boolean; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-xs font-bold shrink-0" style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span
        className={`text-sm select-all ${mono ? 'font-mono' : 'font-bold'} ${highlight ? 'px-2 py-1 rounded' : ''}`}
        style={{
          color: highlight ? '#7A4E1E' : 'var(--text-primary)',
          background: highlight ? 'rgba(192,138,72,0.12)' : 'transparent',
          direction: mono ? 'ltr' : 'rtl',
        }}>
        {value}
      </span>
    </div>
  )
}
