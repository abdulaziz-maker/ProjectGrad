'use client'
import { AlertTriangle, Bomb, Siren, ShieldAlert, ArrowUp } from 'lucide-react'
import type { StudentCase } from '@/lib/student-cases/types'

type Severity = 'first_delay' | 'plan_failed' | 'escalated_manager' | 'escalated_ceo'

interface Props {
  studentName: string
  gap: number          // negative number for delay
  severity: Severity
  activeCase: StudentCase | null
  onStartPlan?: () => void
  onEscalate?: () => void
  onViewCase?: () => void
  onDismiss?: () => void
}

const SEVERITY_CONFIG: Record<Severity, {
  icon: React.ElementType
  title: string
  subtitle: string
  cta: string
  bg: string
  ring: string
  iconColor: string
  pulse: boolean
}> = {
  first_delay: {
    icon: AlertTriangle,
    title: 'تنبيه: الطالب متأخّر',
    subtitle: 'يجب إنشاء خطة علاجية فورية لمعالجة التأخر قبل تفاقمه',
    cta: 'بدء خطة علاجية',
    bg: 'linear-gradient(135deg, #f59e0b 0%, #ea580c 50%, #dc2626 100%)',
    ring: 'ring-amber-500/40',
    iconColor: '#fbbf24',
    pulse: false,
  },
  plan_failed: {
    icon: Bomb,
    title: '🚨 تحذير نووي: لم يلتزم الطالب بالخطة العلاجية',
    subtitle: 'فشلت الخطة العلاجية في إعادة الطالب للمسار. يجب رفع تصعيد فوري لمدير الدفعة الآن',
    cta: 'ارفع تصعيد لمدير الدفعة',
    bg: 'linear-gradient(135deg, #b91c1c 0%, #991b1b 50%, #7f1d1d 100%)',
    ring: 'ring-red-600/60',
    iconColor: '#fca5a5',
    pulse: true,
  },
  escalated_manager: {
    icon: Siren,
    title: '⚡ تصعيد لدى مدير الدفعة',
    subtitle: 'الحالة قيد المعالجة من مدير الدفعة — تابع التطورات',
    cta: 'عرض تفاصيل الحالة',
    bg: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
    ring: 'ring-orange-500/50',
    iconColor: '#fdba74',
    pulse: false,
  },
  escalated_ceo: {
    icon: ShieldAlert,
    title: '🔴 تصعيد للمدير التنفيذي',
    subtitle: 'الحالة على أعلى مستوى — استدعاء ولي الأمر متوقّع قريباً',
    cta: 'عرض تفاصيل الحالة',
    bg: 'linear-gradient(135deg, #7f1d1d 0%, #450a0a 100%)',
    ring: 'ring-red-700/60',
    iconColor: '#fca5a5',
    pulse: true,
  },
}

export default function EscalationBanner({
  studentName, gap, severity, activeCase,
  onStartPlan, onEscalate, onViewCase, onDismiss,
}: Props) {
  const config = SEVERITY_CONFIG[severity]
  const Icon = config.icon
  const handleAction = () => {
    if (severity === 'first_delay') return onStartPlan?.()
    if (severity === 'plan_failed') return onEscalate?.()
    return onViewCase?.()
  }

  return (
    <div
      className={`relative overflow-hidden rounded-2xl shadow-2xl ring-4 ${config.ring} ${config.pulse ? 'animate-pulse-soft' : ''}`}
      style={{ background: config.bg }}
    >
      {/* خلفية متحركة (للتنبيه النووي) */}
      {config.pulse && (
        <>
          <div className="absolute inset-0 opacity-30 pointer-events-none"
            style={{
              background: 'radial-gradient(circle at 30% 20%, rgba(255,255,255,0.30), transparent 50%), radial-gradient(circle at 70% 80%, rgba(255,255,255,0.20), transparent 50%)',
              animation: 'book-float 4s ease-in-out infinite',
            }}
          />
          <div className="absolute -inset-1 opacity-50 pointer-events-none"
            style={{
              background: 'repeating-linear-gradient(45deg, transparent, transparent 12px, rgba(255,255,255,0.04) 12px, rgba(255,255,255,0.04) 24px)',
            }}
          />
        </>
      )}

      <div className="relative p-5 sm:p-6 text-white">
        {/* زر إغلاق */}
        {onDismiss && severity === 'first_delay' && (
          <button
            onClick={onDismiss}
            className="absolute top-3 left-3 text-white/70 hover:text-white text-xs font-semibold px-2 py-1 rounded transition-colors"
          >
            تجاهل ✕
          </button>
        )}

        <div className="flex items-start gap-4 mb-4">
          <div
            className="flex-shrink-0 w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center shadow-lg"
            style={{ background: 'rgba(0,0,0,0.20)', backdropFilter: 'blur(8px)' }}
          >
            <Icon
              className={`w-7 h-7 sm:w-9 sm:h-9 ${config.pulse ? 'animate-bounce' : ''}`}
              style={{ color: config.iconColor }}
              strokeWidth={2.5}
            />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-black text-lg sm:text-xl mb-1 leading-tight" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.30)' }}>
              {config.title}
            </h2>
            <p className="text-sm sm:text-base opacity-95 leading-relaxed">
              {config.subtitle}
            </p>
          </div>
        </div>

        {/* تفاصيل الطالب */}
        <div className="rounded-xl p-3 mb-4" style={{ background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(8px)' }}>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="text-xs opacity-80 mb-0.5">الطالب المتأثر</p>
              <p className="font-bold text-base">{studentName}</p>
            </div>
            <div className="text-left">
              <p className="text-xs opacity-80 mb-0.5">حجم التأخر</p>
              <p className="font-mono font-black text-2xl">{Math.abs(gap)} <span className="text-sm font-bold">وجه</span></p>
            </div>
            {activeCase && (
              <div className="text-left">
                <p className="text-xs opacity-80 mb-0.5">المرحلة الحالية</p>
                <p className="font-bold text-sm">
                  {activeCase.current_stage === 'stage_1_supervisor' && 'المرحلة ١ - المشرف'}
                  {activeCase.current_stage === 'stage_2_batch_manager' && 'المرحلة ٢ - مدير الدفعة'}
                  {activeCase.current_stage === 'stage_3_ceo' && 'المرحلة ٣ - المدير التنفيذي'}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* زر CTA كبير */}
        <button
          onClick={handleAction}
          className="w-full py-3 sm:py-4 rounded-xl font-black text-base sm:text-lg shadow-xl transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2"
          style={{
            background: severity === 'plan_failed' ? '#fef3c7' : '#ffffff',
            color: severity === 'plan_failed' ? '#7f1d1d' : '#991b1b',
          }}
        >
          <ArrowUp className="w-5 h-5" />
          {config.cta}
        </button>
      </div>
    </div>
  )
}
