'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { getTenantBranding, updateTenantBranding, type TenantBranding } from '@/lib/db'
import { Loader2, Save, Palette, Building2 } from 'lucide-react'

const PRESET_COLORS = [
  { label: 'ذهبي المواهب',  value: '#C08A48' },
  { label: 'فيروزي نبوغ',   value: '#356B6E' },
  { label: 'أخضر حفظ',      value: '#4A8F5A' },
  { label: 'بنفسجي',        value: '#6B5B9E' },
  { label: 'أزرق',          value: '#2D6FA4' },
  { label: 'وردي',          value: '#A04060' },
]

export default function TenantBrandingPage() {
  const { id } = useParams<{ id: string }>()
  const router  = useRouter()
  const { profile } = useAuth()

  const [branding, setBranding]   = useState<TenantBranding | null>(null)
  const [nameAr, setNameAr]       = useState('')
  const [color, setColor]         = useState('#C08A48')
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [saved, setSaved]         = useState(false)
  const [error, setError]         = useState('')

  // حماية: super_admin فقط
  useEffect(() => {
    if (profile && profile.role !== 'super_admin') router.replace('/dashboard')
  }, [profile, router])

  useEffect(() => {
    const tenantId = parseInt(id)
    if (isNaN(tenantId)) return
    getTenantBranding(tenantId).then(b => {
      setBranding(b)
      setNameAr(b.nameAr)
      setColor(b.primaryColor)
      setLoading(false)
    })
  }, [id])

  const handleSave = async () => {
    if (!branding) return
    if (!nameAr.trim()) { setError('الاسم مطلوب'); return }
    setSaving(true); setError('')
    try {
      await updateTenantBranding({
        tenantId: branding.tenantId,
        nameAr: nameAr.trim(),
        primaryColor: color,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch {
      setError('فشل الحفظ، حاول مرة أخرى')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--accent-warm)' }} />
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto space-y-5 pb-10">
      <div className="flex items-center gap-3 pt-1">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: 'rgba(192,138,72,0.12)' }}>
          <Palette className="w-5 h-5" style={{ color: 'var(--accent-warm)' }} />
        </div>
        <div>
          <h1 className="text-lg font-black" style={{ color: 'var(--text-primary)' }}>
            هوية المؤسسة
          </h1>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            تخصيص الاسم واللون الأساسي
          </p>
        </div>
      </div>

      {/* معاينة فورية */}
      <div className="rounded-2xl p-5 flex items-center gap-4"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-soft)' }}>
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black text-lg"
          style={{ background: `linear-gradient(135deg, ${color}, ${color}aa)` }}>
          <Building2 className="w-6 h-6" />
        </div>
        <div>
          <p className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>
            {nameAr || 'اسم المؤسسة'}
          </p>
          <p className="text-xs mt-0.5" style={{ color }}>
            {color}
          </p>
        </div>
      </div>

      {/* اسم المؤسسة */}
      <div className="rounded-2xl p-4 space-y-3"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-soft)' }}>
        <label className="text-xs font-semibold block" style={{ color: 'var(--text-muted)' }}>
          اسم المؤسسة (عربي)
        </label>
        <input
          type="text"
          value={nameAr}
          onChange={e => setNameAr(e.target.value)}
          placeholder="مثال: المواهب الناشئة"
          className="w-full px-4 py-2.5 rounded-xl text-sm font-semibold outline-none"
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-primary)',
          }}
        />
      </div>

      {/* اللون الأساسي */}
      <div className="rounded-2xl p-4 space-y-3"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-soft)' }}>
        <label className="text-xs font-semibold block" style={{ color: 'var(--text-muted)' }}>
          اللون الأساسي
        </label>
        <div className="flex flex-wrap gap-2 mb-3">
          {PRESET_COLORS.map(p => (
            <button
              key={p.value}
              onClick={() => setColor(p.value)}
              title={p.label}
              className="w-9 h-9 rounded-xl transition-all active:scale-90"
              style={{
                background: p.value,
                outline: color === p.value ? `3px solid ${p.value}` : 'none',
                outlineOffset: 2,
              }}
            />
          ))}
        </div>
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={color}
            onChange={e => setColor(e.target.value)}
            className="w-10 h-10 rounded-xl cursor-pointer border-0 p-0.5"
            style={{ background: 'var(--bg-card)' }}
          />
          <input
            type="text"
            value={color}
            onChange={e => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) setColor(e.target.value) }}
            className="flex-1 px-3 py-2 rounded-xl text-sm font-mono outline-none"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
            }}
          />
        </div>
      </div>

      {error && (
        <p className="text-sm text-center" style={{ color: 'var(--semantic-danger)' }}>{error}</p>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-3 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50"
        style={{ background: color, color: '#fff', boxShadow: `0 6px 20px ${color}44` }}
      >
        {saving ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : saved ? (
          '✓ تم الحفظ'
        ) : (
          <><Save className="w-4 h-4" /> حفظ التغييرات</>
        )}
      </button>
    </div>
  )
}
