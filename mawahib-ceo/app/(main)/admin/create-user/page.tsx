'use client'
/**
 * /admin/create-user — إنشاء حساب جديد (super_admin فقط)
 *
 * - اسم + بريد + كلمة مرور
 * - دور (٥ خيارات)
 * - حلقة (tenant) + دفعة
 * - بعد النجاح: يعرض كلمة المرور لنسخها يدوياً
 *
 * ⚠️ ملف جديد — لا يُعدّل أي ملف موجود.
 */
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from 'sonner'
import {
  UserPlus, Loader2, Mail, Lock, User as UserIcon, ShieldCheck,
  Building2, GraduationCap, Copy, Check, KeyRound, RefreshCw,
} from 'lucide-react'

interface Tenant { id: number; name_ar: string | null; name: string | null; slug: string | null }
interface Batch  { id: number; name: string | null; tenant_id: number | null }
interface Options { tenants: Tenant[]; batches: Batch[]; roles: string[] }

const ROLE_LABELS: Record<string, string> = {
  ceo:             'مدير تنفيذي',
  batch_manager:   'مدير دفعة',
  supervisor:      'مشرف',
  teacher:         'معلم',
  records_officer: 'موظف سجلات / اختبارات',
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

export default function CreateUserPage() {
  const router = useRouter()
  const { profile, loading: authLoading } = useAuth()

  // حماية: super_admin فقط
  useEffect(() => {
    if (authLoading) return
    if (!profile) return
    if (!profile.is_super_admin) router.replace('/dashboard')
  }, [profile, authLoading, router])

  const [opts, setOpts]       = useState<Options | null>(null)
  const [loadingOpts, setLO]  = useState(true)
  const [optsError, setOE]    = useState<string | null>(null)

  // form state
  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPass]     = useState(() => genPassword())
  const [role, setRole]         = useState('supervisor')
  const [tenantId, setTenant]   = useState<number | ''>('')
  const [batchId, setBatch]     = useState<number | ''>('')
  const [submitting, setSub]    = useState(false)
  const [created, setCreated]   = useState<{ email: string; password: string; name: string } | null>(null)
  const [copied, setCopied]     = useState(false)

  // جلب الخيارات
  useEffect(() => {
    if (authLoading || !profile?.is_super_admin) return
    let cancelled = false
    setLO(true); setOE(null)
    fetch('/api/admin/create-user', { cache: 'no-store' })
      .then(async r => {
        if (!r.ok) {
          const b = await r.json().catch(() => ({}))
          throw new Error(b.error ?? `HTTP ${r.status}`)
        }
        return r.json() as Promise<Options>
      })
      .then(data => { if (!cancelled) setOpts(data) })
      .catch(err => { if (!cancelled) setOE(err instanceof Error ? err.message : 'تعذّر التحميل') })
      .finally(() => { if (!cancelled) setLO(false) })
    return () => { cancelled = true }
  }, [authLoading, profile?.is_super_admin])

  // الدفعات حسب الـtenant المختار
  const availableBatches = useMemo(() => {
    if (!opts || tenantId === '') return []
    return opts.batches.filter(b => b.tenant_id === Number(tenantId))
  }, [opts, tenantId])

  // عند تغيير tenant — مسح الدفعة لو لم تعد متاحة
  useEffect(() => {
    if (batchId !== '' && !availableBatches.some(b => b.id === Number(batchId))) {
      setBatch('')
    }
  }, [tenantId, availableBatches, batchId])

  const needsBatch = ROLES_NEED_BATCH.has(role)

  const canSubmit = (
    !submitting &&
    name.trim().length >= 2 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) &&
    password.length >= 8 &&
    !!role &&
    tenantId !== '' &&
    (!needsBatch || batchId !== '')
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setSub(true)
    try {
      const res = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          name: name.trim(),
          role,
          tenant_id: Number(tenantId),
          batch_id: needsBatch ? Number(batchId) : (batchId === '' ? null : Number(batchId)),
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(body.error ?? 'فشل الإنشاء')
        return
      }
      toast.success(`تم إنشاء حساب ${name.trim()}`)
      setCreated({ email: email.trim().toLowerCase(), password, name: name.trim() })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'خطأ غير معروف')
    } finally {
      setSub(false)
    }
  }

  const resetForm = () => {
    setName(''); setEmail(''); setPass(genPassword())
    setRole('supervisor'); setTenant(''); setBatch('')
    setCreated(null); setCopied(false)
  }

  const copyAll = () => {
    if (!created) return
    const text = `الاسم: ${created.name}\nالبريد: ${created.email}\nكلمة المرور: ${created.password}`
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true)
      toast.success('نُسخت بيانات الحساب')
      setTimeout(() => setCopied(false), 2500)
    }).catch(() => toast.error('تعذّر النسخ — انسخ يدوياً'))
  }

  // ─── الحالات ─────────────────────────────────────────
  if (authLoading) {
    return <div className="p-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
      <Loader2 className="w-5 h-5 animate-spin inline" /> جارٍ التحميل…
    </div>
  }
  if (!profile?.is_super_admin) return null

  // ─── بعد النجاح ──────────────────────────────────────
  if (created) {
    return (
      <div className="max-w-xl mx-auto space-y-4 animate-fade-in-up">
        <div className="rounded-2xl p-5 text-center" style={{ background: 'rgba(90,143,103,0.10)', border: '1px solid rgba(90,143,103,0.40)' }}>
          <div className="w-12 h-12 mx-auto rounded-full flex items-center justify-center mb-3" style={{ background: '#5A8F67' }}>
            <Check className="w-6 h-6 text-white" />
          </div>
          <h2 className="font-extrabold text-lg mb-1" style={{ color: 'var(--text-primary)' }}>
            تم إنشاء الحساب
          </h2>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            انسخ البيانات أدناه وأرسلها للمستخدم — لن نُظهر كلمة المرور مرة أخرى.
          </p>
        </div>

        <div className="card-static p-4 space-y-3">
          <Row label="الاسم" value={created.name} />
          <Row label="البريد" value={created.email} mono />
          <Row label="كلمة المرور" value={created.password} mono highlight />
        </div>

        <div className="flex gap-2">
          <button
            onClick={copyAll}
            className="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-white"
            style={{ background: copied ? '#5A8F67' : 'var(--accent-warm)' }}>
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'نُسخت' : 'انسخ الكل'}
          </button>
          <button
            onClick={resetForm}
            className="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-xl font-bold border"
            style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>
            <UserPlus className="w-4 h-4" />
            إنشاء حساب آخر
          </button>
        </div>
      </div>
    )
  }

  // ─── الفورم ──────────────────────────────────────────
  return (
    <div className="max-w-xl mx-auto space-y-5 animate-fade-in-up">
      {/* Header */}
      <header>
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-extrabold mb-2 tracking-wide"
          style={{ background: 'rgba(53,107,110,0.12)', color: '#1a4042' }}>
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>SUPER ADMIN</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold" style={{ color: 'var(--text-primary)' }}>
          إنشاء حساب جديد
        </h1>
        <p className="text-sm mt-1.5 font-medium" style={{ color: 'var(--text-secondary)' }}>
          أضف مستخدماً جديداً لأي حلقة بأي دور تشغيلي.
        </p>
      </header>

      {/* خطأ تحميل الخيارات */}
      {optsError && (
        <div className="rounded-xl p-3 text-sm" style={{ background: 'rgba(185,72,56,0.08)', color: '#8B2F23', border: '1px solid rgba(185,72,56,0.30)' }}>
          تعذّر تحميل الخيارات: {optsError}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="card-static p-5 space-y-4">

        <Field label="الاسم" Icon={UserIcon}>
          <input
            type="text" value={name} onChange={e => setName(e.target.value)}
            placeholder="مثال: عبدالله محمد"
            className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#C08A48]/30"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
          />
        </Field>

        <Field label="البريد الإلكتروني" Icon={Mail}>
          <input
            type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="user@example.com" dir="ltr"
            className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#C08A48]/30 text-left"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
          />
        </Field>

        <Field label="كلمة المرور (8 أحرف +)" Icon={Lock}>
          <div className="flex gap-2">
            <input
              type="text" value={password} onChange={e => setPass(e.target.value)} dir="ltr"
              className="flex-1 px-3.5 py-2.5 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#C08A48]/30 font-mono text-left"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
            />
            <button
              type="button" onClick={() => setPass(genPassword())}
              className="px-3 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5"
              style={{ background: 'rgba(192,138,72,0.12)', color: '#7A4E1E', border: '1px solid rgba(192,138,72,0.35)' }}
              title="توليد كلمة مرور جديدة">
              <RefreshCw className="w-3.5 h-3.5" />
              توليد
            </button>
          </div>
        </Field>

        <Field label="الدور" Icon={KeyRound}>
          <select
            value={role} onChange={e => setRole(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#C08A48]/30"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}>
            {Object.entries(ROLE_LABELS).map(([v, lbl]) => (
              <option key={v} value={v}>{lbl}</option>
            ))}
          </select>
        </Field>

        <Field label="الحلقة" Icon={Building2}>
          <select
            value={tenantId} onChange={e => setTenant(e.target.value === '' ? '' : Number(e.target.value))}
            disabled={loadingOpts || !opts}
            className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#C08A48]/30 disabled:opacity-50"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}>
            <option value="">— اختر الحلقة —</option>
            {opts?.tenants.map(t => (
              <option key={t.id} value={t.id}>{t.name_ar ?? t.name ?? t.slug ?? `tenant ${t.id}`}</option>
            ))}
          </select>
        </Field>

        <Field
          label={needsBatch ? 'الدفعة (مطلوبة)' : 'الدفعة (اختيارية)'}
          Icon={GraduationCap}
        >
          <select
            value={batchId} onChange={e => setBatch(e.target.value === '' ? '' : Number(e.target.value))}
            disabled={loadingOpts || tenantId === ''}
            className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#C08A48]/30 disabled:opacity-50"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}>
            <option value="">— {tenantId === '' ? 'اختر الحلقة أولاً' : 'بلا دفعة'} —</option>
            {availableBatches.map(b => (
              <option key={b.id} value={b.id}>{b.name ?? `دفعة ${b.id}`}</option>
            ))}
          </select>
        </Field>

        {/* Submit */}
        <div className="flex gap-2 pt-2">
          <button
            type="submit" disabled={!canSubmit}
            className="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: 'linear-gradient(135deg, #C08A48, #9A6A2E)', boxShadow: '0 4px 14px rgba(192,138,72,0.30)' }}>
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            {submitting ? 'يُنشأ…' : 'إنشاء الحساب'}
          </button>
        </div>
      </form>

      <p className="text-xs text-center font-medium" style={{ color: 'var(--text-secondary)' }}>
        لا يمكن إنشاء super_admin إضافي عبر هذه الصفحة — لأمان النظام.
      </p>
    </div>
  )
}

// ─── presentational helpers ─────────────────────────────
function Field({ label, Icon, children }: { label: string; Icon: typeof Mail; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="flex items-center gap-1.5 text-xs font-bold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
        <Icon className="w-3.5 h-3.5" />
        {label}
      </span>
      {children}
    </label>
  )
}

function Row({ label, value, mono = false, highlight = false }: { label: string; value: string; mono?: boolean; highlight?: boolean }) {
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
