'use client'
/**
 * WisdomTicker — شريط تذكير إيماني للـHeader.
 * يدور بين عيّنة من الحكم/الأحاديث/الأدعية كل ٢٠ ثانية.
 * يُخفى تلقائياً على الجوال (md و أقل) لتجنّب الازدحام.
 */
import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'

const REMINDERS: { kind: 'hadith' | 'hikma' | 'dua'; text: string }[] = [
  { kind: 'hadith', text: 'إنّما الأعمالُ بالنيّات' },
  { kind: 'hadith', text: 'الدّالُّ على الخير كفاعله' },
  { kind: 'hadith', text: 'مَن سلكَ طريقًا يلتمسُ فيه علمًا سهَّلَ اللهُ له طريقًا إلى الجنّة' },
  { kind: 'hikma',  text: 'قيمةُ كلِّ امرئٍ ما يُحسِنُه' },
  { kind: 'hikma',  text: 'من صبرَ ظفر' },
  { kind: 'hikma',  text: 'تعلَّموا العلمَ؛ فإنّ تعلُّمَه لله خشية' },
  { kind: 'dua',    text: 'اللّهمَّ بارك في طلّابنا ومشرفينا' },
  { kind: 'dua',    text: 'اللّهمَّ اجعل القرآن ربيع قلوبنا ونور صدورنا' },
  { kind: 'hikma',  text: 'الصبرُ في التعليم جهاد' },
]

export default function WisdomTicker() {
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    const t = setInterval(() => {
      setIdx(i => (i + 1) % REMINDERS.length)
    }, 20_000)
    return () => clearInterval(t)
  }, [])

  const r = REMINDERS[idx]

  return (
    // يُخفى على md و أقل (الجوال + التابلت الصغير) — يظهر فقط lg+
    <div
      className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-full max-w-md min-w-0 transition-opacity"
      style={{
        background: 'linear-gradient(90deg, rgba(192,138,72,0.10), rgba(53,107,110,0.06))',
        border: '1px solid rgba(192,138,72,0.20)',
      }}
      aria-live="polite"
    >
      <Sparkles className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--accent-warm)' }} />
      <span
        key={idx}
        className="text-[12.5px] truncate animate-fade-in-up"
        style={{
          color: 'var(--text-secondary)',
          fontFamily: 'var(--font-noto-kufi), serif',
          fontWeight: 500,
        }}
        title={r.text}
      >
        {r.text}
      </span>
    </div>
  )
}
