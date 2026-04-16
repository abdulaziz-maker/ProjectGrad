/**
 * EmptyState — Unified empty-state component
 *
 * Usage:
 *   <EmptyState
 *     icon={<Calendar size={28} />}
 *     title="لا توجد اجتماعات بعد"
 *     message="ابدأ بجدولة أول اجتماع لمتابعة سير العمل"
 *     cta={{ label: '+ إنشاء اجتماع', onClick: () => setShowForm(true) }}
 *   />
 *
 * Props:
 *   icon      — Lucide icon element (required)
 *   title     — heading (required)
 *   message   — sub-text (optional)
 *   cta       — primary button { label, onClick, href }
 *   ctaSecondary — secondary button { label, onClick, href }
 *   color     — icon circle color: 'indigo' | 'green' | 'yellow' | 'red' | 'cyan'
 *   compact   — smaller padding version for use inside panels/cards
 */

import Link from 'next/link'

type CtaConfig = {
  label:    string
  onClick?: () => void
  href?:    string
}

interface EmptyStateProps {
  icon:           React.ReactNode
  title:          string
  message?:       string
  cta?:           CtaConfig
  ctaSecondary?:  CtaConfig
  color?:         'indigo' | 'green' | 'yellow' | 'red' | 'cyan'
  compact?:       boolean
}

export default function EmptyState({
  icon,
  title,
  message,
  cta,
  ctaSecondary,
  color = 'indigo',
  compact = false,
}: EmptyStateProps) {
  const colorClass = color === 'indigo' ? '' : color

  return (
    <div className={`empty-state${compact ? ' empty-state-sm' : ''}`} dir="rtl">
      <div className={`empty-state-icon${colorClass ? ` ${colorClass}` : ''}`}>
        {icon}
      </div>

      <h3>{title}</h3>

      {message && <p>{message}</p>}

      {(cta || ctaSecondary) && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          {cta && (
            cta.href ? (
              <Link
                href={cta.href}
                className="btn-primary btn-ripple"
                style={{ padding: '9px 22px', borderRadius: 10, fontSize: 13, fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                {cta.label}
              </Link>
            ) : (
              <button
                onClick={cta.onClick}
                className="btn-primary btn-ripple"
                style={{ padding: '9px 22px', borderRadius: 10, fontSize: 13, fontWeight: 700 }}
              >
                {cta.label}
              </button>
            )
          )}

          {ctaSecondary && (
            ctaSecondary.href ? (
              <Link
                href={ctaSecondary.href}
                style={{ padding: '9px 22px', borderRadius: 10, fontSize: 13, fontWeight: 500, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', background: 'var(--bg-elevated)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
              >
                {ctaSecondary.label}
              </Link>
            ) : (
              <button
                onClick={ctaSecondary.onClick}
                style={{ padding: '9px 22px', borderRadius: 10, fontSize: 13, fontWeight: 500, background: 'var(--bg-elevated)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                {ctaSecondary.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  )
}
