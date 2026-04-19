// Unified page-header shell — eyebrow pill + display h1 + subtitle + actions slot.
// Drop-in at the top of each route, optionally wrapped in a hero surface.

import { ContourField } from './ContourField'

type PageHeaderProps = {
  /** Gold eyebrow text above the title (e.g. "• لوحة التحكم • الأسبوع ١٠") */
  eyebrow?: string
  /** Main h1 heading */
  title: string
  /** Short line below the title */
  subtitle?: string
  /** Right-side action slot (buttons, filters) */
  actions?: React.ReactNode
  /** If true, wrap in a hero surface with warm beige bg + contour lines */
  hero?: boolean
  className?: string
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  hero = false,
  className = '',
}: PageHeaderProps) {
  const inner = (
    <div className="relative z-10 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && (
          <div
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-bold mb-3"
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
            {eyebrow}
          </div>
        )}
        <h1
          className="display-h1 m-0"
          style={{ color: 'var(--text-primary)' }}
        >
          {title}
        </h1>
        {subtitle && (
          <p
            className="mt-2 text-sm sm:text-[15px]"
            style={{ color: 'var(--text-secondary)', maxWidth: 640 }}
          >
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">
          {actions}
        </div>
      )}
    </div>
  )

  if (hero) {
    return (
      <section
        className={`hero-surface mb-6 px-6 sm:px-8 py-8 sm:py-10 ${className}`}
      >
        <ContourField variant="compact" />
        {inner}
      </section>
    )
  }

  return <header className={`mb-6 ${className}`}>{inner}</header>
}

export default PageHeader
