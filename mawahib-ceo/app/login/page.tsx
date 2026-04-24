'use client'
import { useState } from 'react'
import { Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { BrandMark } from '@/components/ui/BrandMark'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // ملاحظة: لم نعد نفحص الجلسة هنا يدوياً — الـ middleware يعيد توجيه
  // المستخدم المسجَّل من /login إلى /dashboard قبل أن تصل الصفحة. إزالة هذا
  // الفحص يجنّبنا عرض Loader أولي إضافي يظهر ثم يختفي بسرعة.

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error: authErr } = await supabase.auth.signInWithPassword({ email, password })
    if (authErr) {
      setError('البريد الإلكتروني أو كلمة المرور غير صحيحة')
      setLoading(false)
      return
    }
    // بعد النجاح نستخدم تحميلاً كاملاً للصفحة حتى يقرأ الـ middleware
    // الكوكيز المحدّثة ويقرر التوجيه بلا دورة إضافية من الـ router.
    window.location.replace('/dashboard')
  }

  return (
    <div
      className="min-h-screen w-full flex items-stretch overflow-hidden"
      dir="rtl"
      style={{ backgroundColor: 'var(--bg-body)' }}
    >
      {/* ============ LEFT BRAND PANEL (visible on lg+) ============ */}
      <aside
        className="hidden lg:flex relative flex-col justify-between p-12 overflow-hidden"
        style={{
          flex: '0 0 44%',
          background: 'linear-gradient(160deg, var(--brand-from) 0%, var(--brand-to) 55%, var(--brand-deep) 100%)',
          color: 'var(--brand-on)',
        }}
      >
        {/* topographic lines backdrop */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox="0 0 800 1000"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden="true"
        >
          <g stroke="rgba(246,244,240,0.07)" strokeWidth="1" fill="none">
            <path d="M-50 180 Q 150 150 300 200 T 600 180 Q 750 160 900 210" />
            <path d="M-50 240 Q 180 210 330 260 T 630 240 Q 780 220 900 270" />
            <path d="M-50 300 Q 210 270 360 320 T 660 300 Q 810 280 900 330" />
            <path d="M-50 360 Q 240 330 390 380 T 690 360 Q 840 340 900 390" />
          </g>
          <g stroke="rgba(212,162,76,0.14)" strokeWidth="1" fill="none">
            <ellipse cx="640" cy="820" rx="120" ry="80" />
            <ellipse cx="640" cy="820" rx="190" ry="125" />
            <ellipse cx="640" cy="820" rx="260" ry="170" />
            <ellipse cx="640" cy="820" rx="330" ry="215" />
          </g>
          <g stroke="rgba(246,244,240,0.05)" strokeWidth="1" fill="none">
            <path d="M-50 700 Q 200 670 380 720 T 700 690 Q 850 670 900 720" />
            <path d="M-50 760 Q 220 730 400 780 T 720 750 Q 870 730 900 780" />
          </g>
        </svg>

        {/* top: logo */}
        <div className="relative z-10 flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{
              background: 'rgba(246,244,240,0.08)',
              border: '1px solid rgba(246,244,240,0.15)',
            }}
          >
            <BrandMark size={30} color="var(--brand-on)" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-bold" style={{ color: 'var(--brand-on)' }}>
              المواهب الناشئة
            </span>
            <span className="text-[11px]" style={{ color: 'rgba(246,244,240,0.65)' }}>
              نظام القيادة التنفيذية
            </span>
          </div>
        </div>

        {/* center: hero */}
        <div className="relative z-10 max-w-md">
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-bold mb-6"
            style={{
              background: 'rgba(212,162,76,0.15)',
              color: '#E5B35C',
              border: '1px solid rgba(212,162,76,0.32)',
              letterSpacing: '0.04em',
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: '#E5B35C', boxShadow: '0 0 8px #E5B35C' }}
            />
            الإصدار ٢٫٠ • النظام الداخلي
          </div>
          <h1
            className="text-4xl xl:text-5xl font-bold mb-5"
            style={{
              fontFamily: 'var(--font-noto-kufi, Noto Kufi Arabic)',
              letterSpacing: '-0.015em',
              lineHeight: 1.18,
              color: 'var(--brand-on)',
            }}
          >
            حيث يلتقي
            <br />
            <span style={{ color: '#E5B35C' }}>العلم</span> بالنمو والأثر
          </h1>
          <p
            className="text-base leading-relaxed"
            style={{ color: 'rgba(246,244,240,0.75)' }}
          >
            منصة موحّدة لإدارة الدفعات، متابعة الطلاب، تسميع المتون،
            والاختبارات — بتصميم يعكس هوية البرنامج.
          </p>
        </div>

        {/* bottom: brand mark watermark + footer */}
        <div className="relative z-10 flex items-end justify-between">
          <div className="flex items-center gap-2 text-[11px]" style={{ color: 'rgba(246,244,240,0.55)' }}>
            <ShieldCheck className="w-3.5 h-3.5" />
            اتصال مُشفَّر وآمن
          </div>
          <span className="text-[11px] font-mono" style={{ color: 'rgba(246,244,240,0.35)' }}>
            v2.0
          </span>
        </div>

        {/* huge faint BrandMark watermark */}
        <div className="absolute -bottom-20 -left-20 opacity-[0.06] pointer-events-none">
          <BrandMark size={360} color="var(--brand-on)" />
        </div>
      </aside>

      {/* ============ RIGHT FORM PANEL ============ */}
      <main className="flex-1 flex items-center justify-center p-6 sm:p-12 relative">
        {/* subtle contour backdrop for right side */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none opacity-60"
          viewBox="0 0 800 1000"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden="true"
        >
          <g stroke="var(--contour-line)" strokeWidth="1" fill="none">
            <ellipse cx="720" cy="120" rx="80" ry="52" />
            <ellipse cx="720" cy="120" rx="140" ry="88" />
            <ellipse cx="720" cy="120" rx="200" ry="124" />
          </g>
          <g stroke="var(--contour-line-dim)" strokeWidth="1" fill="none">
            <path d="M-50 880 Q 200 850 380 900 T 700 870 Q 850 850 900 900" />
            <path d="M-50 940 Q 220 910 400 960 T 720 930 Q 870 910 900 960" />
          </g>
        </svg>

        <div className="relative z-10 w-full max-w-[420px] animate-fade-in-up">
          {/* mobile logo (visible when left panel hidden) */}
          <div className="lg:hidden flex flex-col items-center mb-8">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-3"
              style={{
                background: 'linear-gradient(135deg, var(--brand-from) 0%, var(--brand-to) 100%)',
                boxShadow: '0 8px 24px rgba(26,27,32,0.20)',
              }}
            >
              <BrandMark size={38} color="var(--brand-on)" />
            </div>
            <h2
              className="text-xl font-bold"
              style={{
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-noto-kufi, Noto Kufi Arabic)',
              }}
            >
              المواهب الناشئة
            </h2>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              نظام القيادة التنفيذية
            </p>
          </div>

          {/* form header */}
          <div className="mb-8">
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-bold mb-4"
              style={{
                background: 'rgba(192,138,72,0.12)',
                color: '#8B5A1E',
                border: '1px solid rgba(192,138,72,0.30)',
                letterSpacing: '0.04em',
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: 'var(--accent-warm)' }}
              />
              تسجيل الدخول
            </div>
            <h3
              className="text-[28px] font-bold mb-2"
              style={{
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-noto-kufi, Noto Kufi Arabic)',
                letterSpacing: '-0.01em',
                lineHeight: 1.2,
              }}
            >
              أهلاً بك من جديد
            </h3>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              سجّل دخولك للوصول إلى لوحة القيادة
            </p>
          </div>

          {/* form card */}
          <form
            onSubmit={handleSubmit}
            className="space-y-5 p-7"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: 24,
              boxShadow: 'var(--shadow-card)',
            }}
          >
            <div>
              <label
                htmlFor="email"
                className="block text-[13px] font-semibold mb-2"
                style={{ color: 'var(--text-primary)' }}
              >
                البريد الإلكتروني
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                dir="ltr"
                placeholder="example@email.com"
                className="w-full px-4 py-3 text-sm"
                style={{ borderRadius: 12 }}
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-[13px] font-semibold mb-2"
                style={{ color: 'var(--text-primary)' }}
              >
                كلمة المرور
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  dir="ltr"
                  placeholder="••••••••"
                  className="w-full px-4 py-3 text-sm"
                  style={{ borderRadius: 12, paddingLeft: 44 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  aria-label={showPass ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  className="absolute left-3 top-1/2 -translate-y-1/2 p-1 rounded-md transition-colors"
                  style={{ color: 'var(--text-muted)' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div
                className="text-[13px] text-center py-2.5 px-4"
                style={{
                  backgroundColor: 'rgba(185,72,56,0.08)',
                  border: '1px solid rgba(185,72,56,0.25)',
                  borderRadius: 12,
                  color: 'var(--semantic-danger)',
                }}
                role="alert"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary btn-ripple w-full py-3.5 font-semibold disabled:opacity-60 flex items-center justify-center gap-2"
              style={{ fontSize: 15 }}
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'جاري الدخول...' : 'الدخول'}
            </button>
          </form>

          {/* footer note */}
          <p
            className="text-[12px] text-center mt-6"
            style={{ color: 'var(--text-muted)' }}
          >
            بدخولك تقرّ بالالتزام بسياسة الاستخدام والخصوصية
          </p>
        </div>
      </main>
    </div>
  )
}
