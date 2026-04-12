interface LogoIconProps {
  size?: number
  color?: string
  className?: string
}

/** SVG icon matching the المواهب الناشئة logo — bowl with leaves */
export default function LogoIcon({ size = 40, color = 'currentColor', className }: LogoIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* ── LEAVES ── */}
      {/* Far-left leaf */}
      <path
        d="M38 44 C28 38 18 26 24 12 C26 8 30 7 33 9 C42 16 44 32 38 44Z"
        fill={color}
      />
      {/* Left-center leaf */}
      <path
        d="M42 44 C38 36 36 22 42 11 C44 7 48 6 50 9 C54 18 50 34 42 44Z"
        fill={color}
      />
      {/* Center-right leaf */}
      <path
        d="M52 44 C56 34 62 20 70 14 C73 12 76 13 77 17 C79 24 70 36 52 44Z"
        fill={color}
      />
      {/* Far-right leaf (small, outer) */}
      <path
        d="M55 44 C66 40 78 32 80 20 C81 16 79 13 76 13 C70 13 60 26 55 44Z"
        fill={color}
        opacity="0.6"
      />
      {/* Far-left leaf (small, outer) */}
      <path
        d="M35 44 C24 40 12 32 10 20 C9 16 11 13 14 13 C20 13 32 28 35 44Z"
        fill={color}
        opacity="0.6"
      />

      {/* ── RIM (flat top of bowl) ── */}
      <rect x="8" y="44" width="84" height="6" rx="3" fill={color} />

      {/* ── BOWL (brain/nest texture) ── */}
      {/* Outer bowl shape */}
      <path
        d="M8 50 Q8 82 50 84 Q92 82 92 50 Z"
        fill={color}
      />
      {/* Internal texture lines — wavy cracks like a brain/nest */}
      <path d="M20 58 Q28 53 36 58 Q44 63 52 58 Q60 53 68 58 Q76 63 82 58" stroke="white" strokeWidth="1.8" strokeLinecap="round" fill="none" opacity="0.35"/>
      <path d="M16 65 Q25 60 34 65 Q43 70 52 65 Q61 60 70 65 Q77 70 84 66" stroke="white" strokeWidth="1.8" strokeLinecap="round" fill="none" opacity="0.35"/>
      <path d="M22 73 Q32 68 42 73 Q52 78 62 73 Q72 68 80 73" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.3"/>
      <path d="M30 60 Q30 72 32 78" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.25"/>
      <path d="M50 57 Q49 69 50 80" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.25"/>
      <path d="M68 60 Q69 72 68 78" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.25"/>
    </svg>
  )
}
