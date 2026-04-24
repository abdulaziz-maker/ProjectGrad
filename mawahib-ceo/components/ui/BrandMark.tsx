// Signature logo — brain hemisphere + tree branch, extracted from Munasseq identity.
// Used in login hero, sidebar stamp, auth flows.

type BrandMarkProps = {
  size?: number
  color?: string
  className?: string
  style?: React.CSSProperties
}

export function BrandMark({ size = 64, color = 'currentColor', className, style }: BrandMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {/* brain hemisphere — right side */}
      <g stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M56 18 Q36 18 26 32 Q18 44 20 58 Q22 72 30 82 Q40 94 56 96 L56 18 Z" fill={color} fillOpacity="0.08" />
        <path d="M56 18 Q36 18 26 32 Q18 44 20 58 Q22 72 30 82 Q40 94 56 96" />
        <path d="M32 30 Q40 34 38 42 Q30 44 30 50 Q34 54 40 52" opacity="0.7" />
        <path d="M44 24 Q46 32 42 38 Q46 46 44 54" opacity="0.7" />
        <path d="M24 50 Q30 52 34 60 Q30 68 36 72" opacity="0.7" />
        <path d="M40 76 Q46 72 50 78 Q48 86 52 92" opacity="0.7" />
        <path d="M50 38 Q54 46 50 56 Q54 66 50 76" opacity="0.5" />
      </g>
      {/* central spine */}
      <line x1="60" y1="14" x2="60" y2="104" stroke={color} strokeWidth="2" strokeLinecap="round" />
      {/* tree — left side */}
      <g stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M60 22 Q66 20 70 24 Q70 28 66 30 Q62 28 60 24" />
        <path d="M60 36 Q72 34 80 38" />
        <path d="M76 32 Q82 32 84 36 Q82 40 78 40 Q74 38 74 34" fill={color} fillOpacity="0.1" />
        <path d="M82 42 Q88 42 90 46 Q88 50 84 50 Q80 48 80 44" fill={color} fillOpacity="0.1" />
        <path d="M60 54 Q74 52 84 58" />
        <path d="M80 52 Q86 52 88 56 Q86 60 82 60 Q78 58 78 54" fill={color} fillOpacity="0.1" />
        <path d="M86 62 Q92 62 94 66 Q92 70 88 70 Q84 68 84 64" fill={color} fillOpacity="0.1" />
        <path d="M60 72 Q72 70 78 74" />
        <path d="M74 68 Q80 68 82 72 Q80 76 76 76 Q72 74 72 70" fill={color} fillOpacity="0.1" />
        <path d="M60 88 Q68 86 74 90 Q72 94 68 94 Q62 92 60 90" fill={color} fillOpacity="0.1" />
      </g>
    </svg>
  )
}

export function BrandMarkMini({ size = 32, color = 'currentColor', className, style }: BrandMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path d="M15 5 Q9 5 6 9 Q3 13 4 17 Q5 22 10 25 Q13 27 15 27 L15 5 Z" fill={color} fillOpacity="0.18" />
      <path d="M15 5 Q9 5 6 9 Q3 13 4 17 Q5 22 10 25 Q13 27 15 27" stroke={color} strokeWidth="1.3" fill="none" />
      <line x1="16" y1="3" x2="16" y2="29" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
      <path d="M16 9 Q21 8 25 11" stroke={color} strokeWidth="1.3" fill="none" strokeLinecap="round" />
      <circle cx="25" cy="11" r="1.8" fill={color} fillOpacity="0.25" />
      <path d="M16 17 Q22 16 27 19" stroke={color} strokeWidth="1.3" fill="none" strokeLinecap="round" />
      <circle cx="27" cy="19" r="1.8" fill={color} fillOpacity="0.25" />
      <path d="M16 24 Q20 23 24 25" stroke={color} strokeWidth="1.3" fill="none" strokeLinecap="round" />
    </svg>
  )
}

export default BrandMark
