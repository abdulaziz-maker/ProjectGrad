'use client'
import { useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'

function lighten(hex: string, amount = 0.15): string {
  const n = parseInt(hex.replace('#', ''), 16)
  const r = Math.min(255, Math.round(((n >> 16) & 0xff) + 255 * amount))
  const g = Math.min(255, Math.round(((n >> 8)  & 0xff) + 255 * amount))
  const b = Math.min(255, Math.round(( n        & 0xff) + 255 * amount))
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`
}

function hexToRgb(hex: string): string {
  const n = parseInt(hex.replace('#', ''), 16)
  return `${(n >> 16) & 0xff}, ${(n >> 8) & 0xff}, ${n & 0xff}`
}

/**
 * يُطبّق متغيرات CSS المشتقة من لون الـtenant على :root.
 * لا يُصيّر شيئاً — component مساعد نضعه في layout.
 */
export default function BrandingApplier() {
  const { tenantBranding } = useAuth()

  useEffect(() => {
    const root = document.documentElement
    const { primaryColor } = tenantBranding

    root.style.setProperty('--accent-warm',   primaryColor)
    root.style.setProperty('--accent-gold',   lighten(primaryColor, 0.12))
    root.style.setProperty('--color-accent',  primaryColor)
    root.style.setProperty('--brand-from',    primaryColor)
    root.style.setProperty('--brand-to',      lighten(primaryColor, -0.2))
    root.style.setProperty('--accent-rgb',    hexToRgb(primaryColor))
  }, [tenantBranding.primaryColor])

  return null
}
