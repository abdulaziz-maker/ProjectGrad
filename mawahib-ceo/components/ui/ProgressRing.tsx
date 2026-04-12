'use client'
import { useEffect, useRef, useState } from 'react'

interface ProgressRingProps {
  value: number
  size?: number
  strokeWidth?: number
  color?: string
  glowColor?: string
  label?: string
  className?: string
}

export default function ProgressRing({
  value,
  size = 80,
  strokeWidth = 5,
  color = '#6366f1',
  glowColor = 'rgba(99,102,241,0.4)',
  label,
  className = '',
}: ProgressRingProps) {
  const [animatedValue, setAnimatedValue] = useState(0)
  const ref = useRef<SVGSVGElement>(null)
  const hasAnimated = useRef(false)

  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (animatedValue / 100) * circumference

  useEffect(() => {
    if (hasAnimated.current) return
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true
          const start = performance.now()
          const duration = 800
          const animate = (time: number) => {
            const elapsed = time - start
            const progress = Math.min(elapsed / duration, 1)
            const eased = 1 - Math.pow(1 - progress, 3)
            setAnimatedValue(Math.round(value * eased))
            if (progress < 1) requestAnimationFrame(animate)
          }
          requestAnimationFrame(animate)
        }
      },
      { threshold: 0.3 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [value])

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      <svg ref={ref} width={size} height={size} className="-rotate-90">
        <circle
          className="progress-ring-track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
        />
        <circle
          className="progress-ring-fill"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          stroke={color}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ '--ring-glow': glowColor } as React.CSSProperties}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono font-semibold text-sm" style={{ color }}>{animatedValue}%</span>
        {label && <span className="text-[9px] mt-0.5" style={{ color: '#555b75' }}>{label}</span>}
      </div>
    </div>
  )
}
