'use client'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'

const CARD_SEL = '.card, .card-static, .card-interactive'
function lerp(a: number, b: number, t: number) { return a + (b - a) * t }

function initScrollReveal(observer: IntersectionObserver) {
  document.querySelectorAll<HTMLElement>(CARD_SEL).forEach(el => {
    if (!el.classList.contains('sr-in')) {
      el.classList.add('sr-pending')
      observer.observe(el)
    }
  })
}

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen]       = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('sidebar-collapsed') === 'true'
    }
    return false
  })
  const { session, loading } = useAuth()
  const router   = useRouter()
  const pathname = usePathname()

  const observerRef  = useRef<IntersectionObserver | null>(null)
  const glowPosRef   = useRef({ x: 0, y: 0 })
  const glowTargRef  = useRef({ x: 0, y: 0 })
  const glowRafRef   = useRef<number>(0)

  /* ── Sidebar collapse persistence ── */
  const toggleCollapsed = useCallback(() => {
    setSidebarCollapsed(prev => {
      const next = !prev
      localStorage.setItem('sidebar-collapsed', String(next))
      return next
    })
  }, [])

  /* ── Scroll-reveal observer (mount once) ── */
  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          const el = entry.target as HTMLElement
          if (entry.isIntersecting) {
            // pop in with spring
            el.style.transform = 'translateY(0)'
            el.classList.remove('sr-pending')
            el.classList.add('sr-in')
            observerRef.current?.unobserve(el)
          }
        })
      },
      { threshold: 0.07, rootMargin: '0px 0px -24px 0px' }
    )
    return () => observerRef.current?.disconnect()
  }, [])

  /* ── Re-observe on every navigation ── */
  useEffect(() => {
    const timer = setTimeout(() => {
      if (observerRef.current) initScrollReveal(observerRef.current)
    }, 80)
    return () => clearTimeout(timer)
  }, [pathname])

  /* ── Spotlight + 3D tilt: update --mouse-x/y and --tilt-x/y on each card ── */
  const handleMouseMove = useCallback((e: MouseEvent) => {
    glowTargRef.current = { x: e.clientX, y: e.clientY }
    document.querySelectorAll<HTMLElement>(CARD_SEL).forEach(el => {
      const rect = el.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      el.style.setProperty('--mouse-x', `${x}px`)
      el.style.setProperty('--mouse-y', `${y}px`)
      // 3D tilt — compute only when pointer is over the card (small margin)
      if (
        x >= -24 && y >= -24 &&
        x <= rect.width + 24 && y <= rect.height + 24 &&
        rect.width > 0 && rect.height > 0
      ) {
        // Normalize (−0.5 .. +0.5) then scale — max ~4.5deg
        const nx = (x / rect.width) - 0.5
        const ny = (y / rect.height) - 0.5
        el.style.setProperty('--tilt-x', `${(-ny * 5).toFixed(2)}deg`)
        el.style.setProperty('--tilt-y', `${(nx * 5).toFixed(2)}deg`)
      } else {
        el.style.setProperty('--tilt-x', '0deg')
        el.style.setProperty('--tilt-y', '0deg')
      }
    })
  }, [])

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove, { passive: true })
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [handleMouseMove])

  /* ── Cursor ambient glow — lerp lag for smooth drag feel ── */
  useEffect(() => {
    const glow = document.createElement('div')
    glow.id = 'cursor-glow'
    document.body.appendChild(glow)

    const animate = () => {
      const pos = glowPosRef.current
      const tgt = glowTargRef.current
      pos.x = lerp(pos.x, tgt.x, 0.07)
      pos.y = lerp(pos.y, tgt.y, 0.07)
      glow.style.left = `${pos.x}px`
      glow.style.top  = `${pos.y}px`
      glowRafRef.current = requestAnimationFrame(animate)
    }
    glowRafRef.current = requestAnimationFrame(animate)

    return () => {
      cancelAnimationFrame(glowRafRef.current)
      glow.remove()
    }
  }, [])

  /* ── Auth guard ── */
  useEffect(() => {
    if (!loading && !session) router.replace('/login')
  }, [loading, session, router])

  /* ── Loading screen ── */
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-body)' }}>
        <div className="flex flex-col items-center gap-7">
          <div className="book-loader-wrap">
            <svg width="88" height="72" viewBox="0 0 88 72" fill="none" xmlns="http://www.w3.org/2000/svg">
              <ellipse cx="44" cy="40" rx="32" ry="18" fill="rgba(99,102,241,0.12)" className="book-open-glow" />
              <g className="book-cover-left">
                <rect x="4" y="10" width="36" height="52" rx="3" fill="#1e2440" stroke="#C08A48" strokeWidth="1.5" />
                <line x1="10" y1="20" x2="36" y2="20" stroke="#C08A48" strokeOpacity="0.25" strokeWidth="1" />
                <line x1="10" y1="26" x2="36" y2="26" stroke="#C08A48" strokeOpacity="0.20" strokeWidth="1" />
                <line x1="10" y1="32" x2="36" y2="32" stroke="#C08A48" strokeOpacity="0.15" strokeWidth="1" />
                <line x1="10" y1="38" x2="30" y2="38" stroke="#C08A48" strokeOpacity="0.10" strokeWidth="1" />
                <rect x="10" y="14" width="6" height="4" rx="1" fill="#C08A48" fillOpacity="0.3" />
              </g>
              <g className="book-pages">
                <line x1="8"  y1="24" x2="40" y2="24" stroke="#818cf8" strokeOpacity="0.5" strokeWidth="0.8" />
                <line x1="8"  y1="30" x2="40" y2="30" stroke="#818cf8" strokeOpacity="0.4" strokeWidth="0.8" />
                <line x1="8"  y1="36" x2="40" y2="36" stroke="#818cf8" strokeOpacity="0.4" strokeWidth="0.8" />
                <line x1="8"  y1="42" x2="36" y2="42" stroke="#818cf8" strokeOpacity="0.3" strokeWidth="0.8" />
                <line x1="48" y1="24" x2="80" y2="24" stroke="#818cf8" strokeOpacity="0.5" strokeWidth="0.8" />
                <line x1="48" y1="30" x2="80" y2="30" stroke="#818cf8" strokeOpacity="0.4" strokeWidth="0.8" />
                <line x1="48" y1="36" x2="80" y2="36" stroke="#818cf8" strokeOpacity="0.4" strokeWidth="0.8" />
                <line x1="48" y1="42" x2="72" y2="42" stroke="#818cf8" strokeOpacity="0.3" strokeWidth="0.8" />
              </g>
              <rect x="40" y="8" width="8" height="56" rx="2" fill="#C08A48" />
              <line x1="44" y1="8" x2="44" y2="64" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
              <g className="book-cover-right">
                <rect x="48" y="10" width="36" height="52" rx="3" fill="#1e2440" stroke="#C08A48" strokeWidth="1.5" />
                <line x1="52" y1="20" x2="78" y2="20" stroke="#C08A48" strokeOpacity="0.25" strokeWidth="1" />
                <line x1="52" y1="26" x2="78" y2="26" stroke="#C08A48" strokeOpacity="0.20" strokeWidth="1" />
                <line x1="52" y1="32" x2="78" y2="32" stroke="#C08A48" strokeOpacity="0.15" strokeWidth="1" />
                <line x1="52" y1="38" x2="74" y2="38" stroke="#C08A48" strokeOpacity="0.10" strokeWidth="1" />
                <rect x="72" y="14" width="6" height="4" rx="1" fill="#C08A48" fillOpacity="0.3" />
              </g>
              <ellipse cx="44" cy="68" rx="24" ry="3" fill="rgba(99,102,241,0.15)" />
            </svg>
          </div>
          <p className="loader-text text-sm font-semibold tracking-wide">المواهب الناشئة</p>
        </div>
      </div>
    )
  }

  if (!session) return null

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: 'var(--bg-body)' }}>
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleCollapsed}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <Header onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
        <main className="flex-1 p-4 sm:p-6 overflow-auto">
          <div className="animate-fade-in-up">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
