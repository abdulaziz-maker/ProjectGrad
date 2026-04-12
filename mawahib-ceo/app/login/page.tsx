'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Loader2, BookOpen } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        router.replace('/dashboard')
      } else {
        setChecking(false)
      }
    })
  }, [router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error: authErr } = await supabase.auth.signInWithPassword({ email, password })
    if (authErr) {
      setError('البريد الإلكتروني أو كلمة المرور غير صحيحة')
      setLoading(false)
    } else {
      router.replace('/dashboard')
    }
  }

  if (checking) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: 'var(--bg-body)' }}
      >
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#6366f1' }} />
      </div>
    )
  }

  return (
    <>
      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fadeIn 0.6s ease-in-out both;
        }
        .animate-fade-in-up {
          animation: fadeInUp 0.6s ease-in-out both;
          animation-delay: 0.15s;
        }
        .grid-pattern {
          background-image:
            linear-gradient(rgba(99,102,241,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(99,102,241,0.03) 1px, transparent 1px);
          background-size: 48px 48px;
        }
        .input-field {
          background-color: var(--bg-subtle);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 6px;
          color: var(--text-primary);
          transition: all 200ms ease-in-out;
        }
        .input-field::placeholder {
          color: var(--text-muted);
        }
        .input-field:focus {
          outline: none;
          border-color: rgba(99,102,241,0.5);
          box-shadow: 0 0 0 3px rgba(99,102,241,0.12);
        }
      `}</style>

      <div
        className="min-h-screen flex items-center justify-center relative overflow-hidden"
        dir="rtl"
        style={{ backgroundColor: 'var(--bg-body)' }}
      >
        {/* Geometric grid pattern overlay */}
        <div className="grid-pattern absolute inset-0 z-0" />

        {/* Main content */}
        <div className="relative z-10 w-full flex flex-col items-center px-4">

          {/* Logo section */}
          <div className="animate-fade-in text-center mb-8">
            <div
              className="inline-flex w-20 h-20 rounded-2xl items-center justify-center mb-5"
              style={{
                border: '1px solid rgba(99,102,241,0.3)',
                boxShadow: '0 0 28px rgba(99,102,241,0.12)',
                backgroundColor: 'rgba(17,21,39,0.7)',
              }}
            >
              <BookOpen className="w-8 h-8 text-white" />
            </div>
            <h1
              className="text-2xl font-bold mb-1"
              style={{ color: '#ffffff' }}
            >
              المواهب الناشئة
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              نظام القيادة التنفيذية
            </p>
          </div>

          {/* Gradient divider */}
          <div
            className="mb-8 w-full max-w-[400px]"
            style={{
              height: 1,
              background: 'linear-gradient(90deg, transparent, rgba(99,102,241,0.3), transparent)',
            }}
          />

          {/* Form card */}
          <div
            className="card-glass animate-fade-in-up p-8 w-full max-w-[400px]"
            style={{
              backgroundColor: 'rgba(17,21,39,0.75)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 12,
              backdropFilter: 'blur(16px)',
            }}
          >
            {/* Form heading */}
            <div className="flex items-center gap-2 mb-6">
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  backgroundColor: '#6366f1',
                }}
              />
              <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                تسجيل الدخول
              </h3>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label
                  className="block text-sm font-medium mb-2"
                  style={{ color: 'var(--text-primary)' }}
                >
                  البريد الإلكتروني
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  dir="ltr"
                  className="input-field w-full px-4 py-3 text-sm"
                  placeholder="example@email.com"
                />
              </div>

              <div>
                <label
                  className="block text-sm font-medium mb-2"
                  style={{ color: 'var(--text-primary)' }}
                >
                  كلمة المرور
                </label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    dir="ltr"
                    className="input-field w-full px-4 py-3 text-sm"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute left-3 top-1/2 -translate-y-1/2"
                    style={{
                      color: 'var(--text-muted)',
                      transition: 'color 200ms ease-in-out',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div
                  className="text-sm text-center py-2.5 px-4"
                  style={{
                    backgroundColor: 'rgba(220,38,38,0.08)',
                    border: '1px solid rgba(220,38,38,0.25)',
                    borderRadius: 6,
                    color: '#f87171',
                  }}
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="btn-primary btn-ripple w-full py-3.5 text-white font-semibold disabled:opacity-60 flex items-center justify-center gap-2"
                style={{ transition: 'all 200ms ease-in-out' }}
              >
                {loading && (
                  <Loader2
                    className="w-4 h-4 animate-spin"
                    style={{ color: '#c7d2fe' }}
                  />
                )}
                {loading ? 'جاري الدخول...' : 'الدخول'}
              </button>
            </form>
          </div>

          {/* Version text */}
          <p className="text-xs mt-6" style={{ color: 'var(--text-muted)' }}>
            v2.0
          </p>
        </div>
      </div>
    </>
  )
}
