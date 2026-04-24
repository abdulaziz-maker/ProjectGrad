// Topographic contour background — Munasseq signature texture.
// Soft enough to read as "texture", not "pattern". Use inside hero surfaces.

type ContourFieldProps = {
  color?: string
  colorDim?: string
  className?: string
  style?: React.CSSProperties
  variant?: 'default' | 'compact' | 'rings-only'
}

export function ContourField({
  color = 'var(--contour-line)',
  colorDim = 'var(--contour-line-dim)',
  className,
  style,
  variant = 'default',
}: ContourFieldProps) {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 1600 900"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      className={className}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', ...style }}
    >
      {variant !== 'rings-only' && (
        <>
          {/* top flowing contours */}
          <g stroke={color} strokeWidth="1" fill="none">
            <path d="M-100 80 Q 200 120 400 60 T 900 140 Q 1200 180 1700 100" />
            <path d="M-100 140 Q 250 180 450 120 T 950 200 Q 1250 240 1700 160" />
            <path d="M-100 200 Q 300 240 500 180 T 1000 260 Q 1300 300 1700 220" />
            {variant === 'default' && (
              <path d="M-100 260 Q 350 300 550 240 T 1050 320 Q 1350 360 1700 280" />
            )}
          </g>
          {variant === 'default' && (
            <g stroke={colorDim} strokeWidth="1" fill="none">
              <path d="M-100 360 Q 200 400 500 340 T 1050 440 Q 1350 480 1700 400" />
              <path d="M-100 420 Q 250 460 550 400 T 1100 500 Q 1400 540 1700 460" />
            </g>
          )}
        </>
      )}

      {/* concentric rings — right side (brain hemisphere echo) */}
      <g stroke={color} strokeWidth="1" fill="none" opacity="0.7">
        <ellipse cx="1400" cy="700" rx="120" ry="80" />
        <ellipse cx="1400" cy="700" rx="200" ry="130" />
        <ellipse cx="1400" cy="700" rx="280" ry="180" />
        <ellipse cx="1400" cy="700" rx="360" ry="230" />
      </g>

      {variant === 'default' && (
        <>
          {/* bottom flowing */}
          <g stroke={colorDim} strokeWidth="1" fill="none">
            <path d="M-100 780 Q 200 740 500 800 T 1050 720 Q 1350 680 1700 760" />
            <path d="M-100 840 Q 250 800 550 860 T 1100 780 Q 1400 740 1700 820" />
          </g>
          {/* small concentric rings — left side */}
          <g stroke={color} strokeWidth="1" fill="none" opacity="0.6">
            <ellipse cx="120" cy="620" rx="60" ry="40" />
            <ellipse cx="120" cy="620" rx="110" ry="70" />
            <ellipse cx="120" cy="620" rx="170" ry="110" />
          </g>
        </>
      )}
    </svg>
  )
}

export default ContourField
