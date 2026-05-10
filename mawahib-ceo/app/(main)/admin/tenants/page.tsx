'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from 'sonner'
import {
  Building2, Plus, Users, GraduationCap, LayoutGrid,
  ToggleLeft, ToggleRight, Pencil, X, Save, Loader2, CheckCircle2, AlertCircle,
} from 'lucide-react'
import {
  getTenants, getTenantStats, upsertTenant, toggleTenantActive,
  type DBTenant, type DBTenantStats,
} from '@/lib/db'

// ─── helpers ───────────────────────────────────────────────────────────
const toAr = (n: number) => n.toLocaleString('ar-SA')

const EMPTY_FORM: Omit<DBTenant, 'created_at'> = {
  id: 0, slug: '', name: '', is_active: true,
  name_ar: '', primary_color: '#C08A48', logo_url: null,
  metadata: { plan: 'pro' },
}

// ─── component ─────────────────────────────────────────────────────────
export default function TenantsPage() {
  const { profile } = useAuth()
  const router      = useRouter()

  const [tenants, setTenants]   = useState<DBTenant[]>([])
  const [stats,   setStats]     = useState<DBTenantStats[]>([])
  const [loading, setLoading]   = useState(true)

  // form state
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState<Omit<DBTenant, 'created_at'>>(EMPTY_FORM)
  const [saving, setSaving]     = useState(false)
  const [toggling, setToggling] = useState<number | null>(null)

  // guard: super admin only — هذه إدارة بين الحلقات
  useEffect(() => {
    if (profile && !profile.is_super_admin) router.replace('/dashboard')
  }, [profile, router])

  // load
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [ts, st] = await Promise.all([getTenants(), getTenantStats()])
      setTenants(ts)
      setStats(st)
    } catch {
      toast.error('تعذّر تحميل بيانات المنظومات')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // stat lookup helper
  const statFor = (id: number): DBTenantStats =>
    stats.find(s => s.tenant_id === id) ?? { tenant_id: id, student_count: 0, batch_count: 0, user_count: 0 }

  // open add form
  function openAdd() {
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  // open edit form
  function openEdit(t: DBTenant) {
    setForm({ id: t.id, slug: t.slug, name: t.name, is_active: t.is_active, metadata: t.metadata })
    setShowForm(true)
  }

  // save
  async function handleSave() {
    if (!form.name.trim() || !form.slug.trim()) {
      toast.error('الاسم والمعرّف مطلوبان')
      return
    }
    if (!/^[a-z0-9-]+$/.test(form.slug)) {
      toast.error('المعرّف يجب أن يكون أحرفاً إنجليزية صغيرة وأرقاماً وشرطات فقط')
      return
    }
    setSaving(true)
    try {
      await upsertTenant(form)
      toast.success(form.id === 0 ? 'تمت إضافة المنظومة' : 'تم حفظ التعديلات')
      setShowForm(false)
      await load()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'خطأ غير معروف'
      toast.error(`فشل الحفظ: ${msg}`)
    } finally {
      setSaving(false)
    }
  }

  // toggle active
  async function handleToggle(t: DBTenant) {
    if (t.id === 1) { toast.error('لا يمكن تعطيل المنظومة الأساسية'); return }
    setToggling(t.id)
    try {
      await toggleTenantActive(t.id, !t.is_active)
      toast.success(t.is_active ? `تم تعطيل "${t.name}"` : `تم تفعيل "${t.name}"`)
      await load()
    } catch {
      toast.error('فشل تغيير حالة المنظومة')
    } finally {
      setToggling(null)
    }
  }

  // ─── render ────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6" dir="rtl">

      {/* header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(192,138,72,0.12)', border: '1px solid rgba(192,138,72,0.25)' }}
          >
            <Building2 className="w-5 h-5" style={{ color: 'var(--accent-warm)' }} />
          </div>
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
              إدارة المنظومات
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              التحكم في الحلقات المُضافة للمنصة
            </p>
          </div>
        </div>

        <button
          onClick={openAdd}
          className="btn-primary flex items-center gap-2 px-4 py-2 text-sm font-semibold"
          style={{ borderRadius: 12 }}
        >
          <Plus className="w-4 h-4" />
          إضافة منظومة
        </button>
      </div>

      {/* loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--accent-warm)' }} />
        </div>
      )}

      {/* tenants grid */}
      {!loading && (
        <div className="grid gap-4 sm:grid-cols-2">
          {tenants.map(t => {
            const s = statFor(t.id)
            return (
              <div
                key={t.id}
                className="rounded-2xl p-5 space-y-4"
                style={{
                  background: 'var(--bg-card)',
                  border: `1px solid ${t.is_active ? 'var(--border-color)' : 'rgba(185,72,56,0.25)'}`,
                  opacity: t.is_active ? 1 : 0.7,
                }}
              >
                {/* top row */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {/* avatar */}
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center text-lg font-bold"
                      style={{ background: 'rgba(192,138,72,0.12)', color: 'var(--accent-warm)' }}
                    >
                      {t.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-bold text-[15px]" style={{ color: 'var(--text-primary)' }}>
                        {t.name}
                      </p>
                      <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                        /{t.slug}
                      </p>
                    </div>
                  </div>

                  {/* status badge */}
                  <div
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold"
                    style={{
                      background: t.is_active ? 'rgba(74,222,128,0.1)' : 'rgba(185,72,56,0.1)',
                      color:      t.is_active ? '#15803d' : '#b94838',
                      border:     `1px solid ${t.is_active ? 'rgba(74,222,128,0.3)' : 'rgba(185,72,56,0.3)'}`,
                    }}
                  >
                    {t.is_active
                      ? <><CheckCircle2 className="w-3 h-3" /> نشطة</>
                      : <><AlertCircle  className="w-3 h-3" /> معطّلة</>}
                  </div>
                </div>

                {/* stats row */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { icon: GraduationCap, label: 'طالب', val: s.student_count },
                    { icon: LayoutGrid,    label: 'دفعة', val: s.batch_count   },
                    { icon: Users,         label: 'مستخدم', val: s.user_count  },
                  ].map(({ icon: Icon, label, val }) => (
                    <div
                      key={label}
                      className="rounded-xl p-3 text-center"
                      style={{ background: 'var(--bg-body)' }}
                    >
                      <Icon className="w-4 h-4 mx-auto mb-1" style={{ color: 'var(--text-muted)' }} />
                      <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                        {toAr(val)}
                      </p>
                      <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{label}</p>
                    </div>
                  ))}
                </div>

                {/* metadata pills */}
                {!!(t.metadata?.plan) && (
                  <div className="flex gap-2 flex-wrap">
                    <span
                      className="text-[11px] px-2.5 py-1 rounded-full font-medium"
                      style={{
                        background: 'rgba(192,138,72,0.1)',
                        color: 'var(--accent-warm)',
                        border: '1px solid rgba(192,138,72,0.2)',
                      }}
                    >
                      {String(t.metadata.plan).toUpperCase()} Plan
                    </span>
                    <span
                      className="text-[11px] px-2.5 py-1 rounded-full font-mono"
                      style={{ background: 'var(--bg-body)', color: 'var(--text-muted)' }}
                    >
                      ID: {t.id}
                    </span>
                  </div>
                )}

                {/* actions */}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => openEdit(t)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm rounded-xl transition-colors"
                    style={{
                      background: 'var(--bg-body)',
                      color: 'var(--text-secondary)',
                      border: '1px solid var(--border-color)',
                    }}
                  >
                    <Pencil className="w-3.5 h-3.5" /> تعديل
                  </button>

                  <button
                    onClick={() => handleToggle(t)}
                    disabled={toggling === t.id || t.id === 1}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm rounded-xl transition-colors disabled:opacity-50"
                    style={{
                      background: t.is_active ? 'rgba(185,72,56,0.08)' : 'rgba(74,222,128,0.08)',
                      color:      t.is_active ? '#b94838' : '#15803d',
                      border:     `1px solid ${t.is_active ? 'rgba(185,72,56,0.2)' : 'rgba(74,222,128,0.2)'}`,
                    }}
                  >
                    {toggling === t.id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : t.is_active
                        ? <><ToggleLeft  className="w-3.5 h-3.5" /> تعطيل</>
                        : <><ToggleRight className="w-3.5 h-3.5" /> تفعيل</>}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* empty state */}
      {!loading && tenants.length === 0 && (
        <div className="text-center py-20" style={{ color: 'var(--text-muted)' }}>
          <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>لا توجد منظومات مُسجَّلة</p>
        </div>
      )}

      {/* ── FORM MODAL ── */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowForm(false) }}
        >
          <div
            className="w-full max-w-md rounded-2xl p-6 space-y-5"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
          >
            {/* modal header */}
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                {form.id === 0 ? 'إضافة منظومة جديدة' : 'تعديل المنظومة'}
              </h2>
              <button
                onClick={() => setShowForm(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: 'var(--bg-body)', color: 'var(--text-muted)' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* name */}
            <div>
              <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>
                اسم المنظومة
              </label>
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="مواهب ناشئة"
                className="w-full px-4 py-2.5 text-sm"
                style={{ borderRadius: 12 }}
              />
            </div>

            {/* slug */}
            <div>
              <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>
                المعرّف (Slug)
              </label>
              <input
                value={form.slug}
                onChange={e => setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                placeholder="mawahib"
                dir="ltr"
                disabled={form.id !== 0}
                className="w-full px-4 py-2.5 text-sm font-mono disabled:opacity-50"
                style={{ borderRadius: 12 }}
              />
              <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                يُستخدم في URL: /mawahib/dashboard — لا يمكن تغييره بعد الإنشاء
              </p>
            </div>

            {/* plan */}
            <div>
              <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>
                الخطة
              </label>
              <select
                value={String(form.metadata?.plan ?? 'pro')}
                onChange={e => setForm(f => ({ ...f, metadata: { ...f.metadata, plan: e.target.value } }))}
                className="w-full px-4 py-2.5 text-sm"
                style={{ borderRadius: 12 }}
              >
                <option value="pro">Pro</option>
                <option value="basic">Basic</option>
                <option value="trial">Trial</option>
              </select>
            </div>

            {/* active toggle */}
            <label className="flex items-center gap-3 cursor-pointer">
              <div
                onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                className="w-10 h-6 rounded-full relative transition-colors"
                style={{
                  background: form.is_active ? 'var(--accent-warm)' : 'var(--border-color)',
                }}
              >
                <div
                  className="absolute top-1 w-4 h-4 rounded-full bg-white transition-all"
                  style={{ right: form.is_active ? 4 : 'auto', left: form.is_active ? 'auto' : 4 }}
                />
              </div>
              <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {form.is_active ? 'نشطة' : 'معطّلة'}
              </span>
            </label>

            {/* actions */}
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 py-2.5 text-sm rounded-xl"
                style={{
                  background: 'var(--bg-body)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-color)',
                }}
              >
                إلغاء
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 btn-primary flex items-center justify-center gap-2 py-2.5 text-sm rounded-xl disabled:opacity-60"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? 'جارٍ الحفظ…' : 'حفظ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
