'use client'

export interface LogoProps {
  variant?: 'full' | 'icon-only' | 'horizontal'
  size?: 'sm' | 'md' | 'lg' | 'xl'
  color?: 'white' | 'black' | 'auto'
  className?: string
}

const SIZES = { sm: 32, md: 48, lg: 80, xl: 160 } as const

/** Brain + plant SVG icon — matches المواهب الناشئة logo exactly */
function BrainPlantSVG({ px, col }: { px: number; col: string }) {
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 200 210"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      {/* ── HALF BRAIN (left hemisphere, outline) ── */}
      <path
        d="M100,22
           C94,14 80,8 62,10
           C42,13 22,30 12,56
           C4,80 4,112 12,140
           C20,168 40,186 64,188
           C82,190 98,182 100,176"
        stroke={col} strokeWidth="4" fill="none"
        strokeLinecap="round" strokeLinejoin="round"
      />

      {/* Gyrus 1 — upper fold */}
      <path
        d="M88,24 C78,32 68,48 66,64 C64,78 70,90 80,92
           C90,94 98,84 98,72 C98,60 92,44 88,24Z"
        stroke={col} strokeWidth="2.5" fill="none" strokeLinecap="round"
      />

      {/* Gyrus 2 — mid fold */}
      <path
        d="M30,62 C18,78 12,98 16,116 C20,134 34,146 48,144
           C62,142 72,130 72,116 C72,102 64,86 54,78"
        stroke={col} strokeWidth="2.5" fill="none" strokeLinecap="round"
      />

      {/* Gyrus 3 — lower temporal fold */}
      <path
        d="M16,148 C10,162 10,178 18,186 C26,194 44,194 58,190
           C72,186 80,174 78,162 C76,150 66,142 54,140"
        stroke={col} strokeWidth="2.5" fill="none" strokeLinecap="round"
      />

      {/* Extra wrinkle detail */}
      <path
        d="M46,46 C36,56 30,70 32,84"
        stroke={col} strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.7"
      />
      <path
        d="M64,112 C60,124 60,138 64,150"
        stroke={col} strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.7"
      />

      {/* ── CENTRAL STEM ── */}
      <line
        x1="100" y1="10" x2="100" y2="194"
        stroke={col} strokeWidth="3.5" strokeLinecap="round"
      />

      {/* ── BUD at top (teardrop) ── */}
      <path
        d="M100,10 C100,10 107,16 108,24 C109,32 104,38 100,38
           C96,38 91,32 92,24 C93,16 100,10 100,10Z"
        fill={col}
      />

      {/* ── LEAF 1 — top right (small, steep angle) ── */}
      <path
        d="M100,52
           C104,46 118,40 128,42
           C136,44 140,52 134,58
           C128,64 112,62 100,52Z"
        fill={col}
      />

      {/* ── LEAF 2 — upper-mid right ── */}
      <path
        d="M100,88
           C106,78 124,68 138,72
           C150,76 154,88 146,96
           C138,104 118,100 100,88Z"
        fill={col}
      />

      {/* ── LEAF 3 — lower-mid right (larger) ── */}
      <path
        d="M100,130
           C108,118 130,108 148,114
           C162,120 166,134 156,144
           C146,154 122,150 100,130Z"
        fill={col}
      />

      {/* ── LEAF 4 — bottom right (widest) ── */}
      <path
        d="M100,168
           C110,154 136,146 158,154
           C174,160 178,176 166,186
           C154,196 126,192 100,168Z"
        fill={col}
      />
    </svg>
  )
}

const FONT = "'IBM Plex Sans Arabic','Tajawal','Cairo',sans-serif"

export default function Logo({
  variant = 'full',
  size = 'md',
  color = 'auto',
  className = '',
}: LogoProps) {
  const px  = SIZES[size]
  const col = color === 'white' ? '#ffffff' : color === 'black' ? '#000000' : 'currentColor'

  if (variant === 'icon-only') {
    return (
      <span className={className} style={{ display: 'inline-flex', color: col }}>
        <BrainPlantSVG px={px} col={col} />
      </span>
    )
  }

  const arabicPx = Math.round(px * 0.33)
  const engPx    = Math.round(px * 0.19)

  if (variant === 'horizontal') {
    return (
      <div
        className={`flex items-center ${className}`}
        style={{ gap: Math.round(px * 0.22), color: col }}
      >
        <BrainPlantSVG px={px} col={col} />
        <div style={{ lineHeight: 1.25 }}>
          <p style={{ fontFamily: FONT, fontWeight: 700, fontSize: arabicPx, margin: 0 }}>
            المواهب الناشئة
          </p>
          <p style={{ fontFamily: FONT, fontWeight: 400, fontSize: engPx, margin: 0, opacity: 0.62 }}>
            Emerging Talent
          </p>
        </div>
      </div>
    )
  }

  /* ── full ── */
  return (
    <div
      className={`flex flex-col items-center ${className}`}
      style={{ gap: Math.round(px * 0.18), color: col }}
    >
      <BrainPlantSVG px={px} col={col} />
      <div style={{ textAlign: 'center', lineHeight: 1.3 }}>
        <p style={{ fontFamily: FONT, fontWeight: 700, fontSize: Math.round(px * 0.28), margin: 0 }}>
          المواهب الناشئة
        </p>
        <p style={{ fontFamily: FONT, fontWeight: 400, fontSize: Math.round(px * 0.16), margin: 0, opacity: 0.62 }}>
          Emerging Talent
        </p>
      </div>
    </div>
  )
}
