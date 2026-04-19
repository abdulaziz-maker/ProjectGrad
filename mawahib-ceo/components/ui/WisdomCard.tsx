// WisdomCard — بطاقة تذكيرية مشرقة بأدعية وحكم ومواعظ
// تدور محتواها تلقائياً حسب اليوم، مع زر تحديث يدوي.
// تصميم فحمي مذهّب ومعالم زخرفية — متسق مع هوية المواهب الناشئة.
'use client'
import { useState, useEffect, useMemo } from 'react'
import { Sparkles, RefreshCw, Quote } from 'lucide-react'

type Wisdom = {
  kind: 'ayah' | 'hadith' | 'dua' | 'hikma'
  text: string
  source: string
}

const BANK: Wisdom[] = [
  // آيات
  { kind: 'ayah',   text: 'وَقُل رَّبِّ زِدْنِي عِلْمًا', source: 'طه ١١٤' },
  { kind: 'ayah',   text: 'إِنَّ مَعَ الْعُسْرِ يُسْرًا', source: 'الشرح ٦' },
  { kind: 'ayah',   text: 'وَمَن يَتَّقِ اللَّهَ يَجْعَل لَّهُ مَخْرَجًا', source: 'الطلاق ٢' },
  { kind: 'ayah',   text: 'وَمَا تَوْفِيقِي إِلَّا بِاللَّهِ ۚ عَلَيْهِ تَوَكَّلْتُ وَإِلَيْهِ أُنِيبُ', source: 'هود ٨٨' },
  { kind: 'ayah',   text: 'وَبَشِّرِ الصَّابِرِينَ', source: 'البقرة ١٥٥' },
  { kind: 'ayah',   text: 'إِنَّا نَحْنُ نَزَّلْنَا الذِّكْرَ وَإِنَّا لَهُ لَحَافِظُونَ', source: 'الحجر ٩' },
  { kind: 'ayah',   text: 'يَرْفَعِ اللَّهُ الَّذِينَ آمَنُوا مِنكُمْ وَالَّذِينَ أُوتُوا الْعِلْمَ دَرَجَاتٍ', source: 'المجادلة ١١' },
  // أحاديث — عامة
  { kind: 'hadith', text: 'خيركم من تعلّم القرآن وعلّمه', source: 'رواه البخاري' },
  { kind: 'hadith', text: 'الدّالّ على الخير كفاعله', source: 'رواه الترمذي' },
  { kind: 'hadith', text: 'إنّما الأعمال بالنيّات وإنّما لكلّ امرئٍ ما نوى', source: 'متفق عليه' },
  { kind: 'hadith', text: 'من لا يرحم الناس لا يرحمه الله', source: 'متفق عليه' },
  { kind: 'hadith', text: 'اتّق الله حيثما كنت وأتبع السيّئة الحسنة تمحُها وخالق النّاس بخُلقٍ حسن', source: 'رواه الترمذي' },
  // أحاديث — دور المشرف والمعلّم والراعي
  { kind: 'hadith', text: 'إنّ الله وملائكتَه وأهلَ السّماوات والأرضِ حتى النّملةَ في جُحرِها ليُصلّون على مُعلِّم الناسِ الخيرَ', source: 'رواه الترمذي' },
  { kind: 'hadith', text: 'كلُّكم راعٍ وكلُّكم مسؤولٌ عن رعيّتِه', source: 'متفق عليه' },
  { kind: 'hadith', text: 'مَن سلكَ طريقًا يلتمسُ فيه علمًا سهَّلَ اللهُ له به طريقًا إلى الجنّة', source: 'رواه مسلم' },
  { kind: 'hadith', text: 'من نفَّس عن مؤمنٍ كربةً من كُرَبِ الدنيا نفَّسَ الله عنه كربةً من كُرَبِ يوم القيامة', source: 'رواه مسلم' },
  { kind: 'hadith', text: 'فضلُ العالِم على العابِد كفضلِ القمر ليلةَ البدر على سائر الكواكب', source: 'رواه أبو داود والترمذي' },
  // أدعية
  { kind: 'dua',    text: 'اللّهمَّ بارك في طلّابنا ومشرفينا، وانفعنا وإيّاهم بما علّمتنا', source: 'دعاء' },
  { kind: 'dua',    text: 'اللّهمَّ اجعل القرآن العظيم ربيع قلوبنا ونور صدورنا وجَلاء أحزاننا', source: 'من دعاء النبي ﷺ' },
  { kind: 'dua',    text: 'اللّهمَّ اجعل هذا المجلس مجلسًا مرحومًا وتفرّقنا من بعده تفرّقًا معصومًا', source: 'دعاء مأثور' },
  { kind: 'dua',    text: 'اللّهمَّ اجعلنا هُداةً مهتدين، غيرَ ضالّين ولا مُضِلّين', source: 'دعاء مأثور' },
  // حكم — السلف والخلف
  { kind: 'hikma',  text: 'قيمةُ كلِّ امرئٍ ما يُحسِنه.', source: 'علي بن أبي طالب ﵁' },
  { kind: 'hikma',  text: 'من صبرَ ظفر.', source: 'حكمة' },
  { kind: 'hikma',  text: 'العلم يأتيك بكلّ خير، والجهل يأتي بكلّ شرّ.', source: 'ابن القيّم' },
  { kind: 'hikma',  text: 'إنّما يُدرك المرءُ بصبرِه، ويبقى أثرُه بإخلاصِه.', source: 'حكمة' },
  { kind: 'hikma',  text: 'تعلَّموا العلمَ؛ فإنّ تعلُّمَه لله خشيةٌ، وطلبَه عبادةٌ، ومذاكرتَه تسبيحٌ.', source: 'معاذ بن جبل ﵁' },
  { kind: 'hikma',  text: 'إنّ هذا العلمَ دينٌ فانظروا عمَّن تأخذون دينكم.', source: 'مالك بن أنس' },
  { kind: 'hikma',  text: 'مَن أحبَّ أن يُحِبَّه الله فليُلزِم الصِّدقَ، وليكن بالناس رحيمًا.', source: 'الحسن البصري' },
  { kind: 'hikma',  text: 'المُربّي الصادق مَن يزرعُ في تلاميذِه حُبَّ الخير حتى يُثمِرَ بعدَ رحيلِه.', source: 'حكمة' },
  { kind: 'hikma',  text: 'الصبرُ في التعليم جهادٌ، والحِلمُ على المتعلِّم عبادةٌ.', source: 'أثر عن الشافعي' },
]

const KIND_META: Record<Wisdom['kind'], { label: string; accent: string }> = {
  ayah:   { label: 'آية كريمة',  accent: '#C08A48' }, // gold
  hadith: { label: 'حديث شريف', accent: '#5A8F67' }, // sage
  dua:    { label: 'دعاء',       accent: '#356B6E' }, // teal
  hikma:  { label: 'حكمة',        accent: '#8B5A1E' }, // dark gold
}

// يختار رقم اليوم من بداية العام — ثابت على مدار اليوم لنفس المشاهد.
function dayIndex(): number {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 0)
  const diff = (now.getTime() - start.getTime()) + ((start.getTimezoneOffset() - now.getTimezoneOffset()) * 60 * 1000)
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

export default function WisdomCard() {
  const [offset, setOffset] = useState(0)
  const [mounted, setMounted] = useState(false)
  const [animKey, setAnimKey] = useState(0)

  // بدء الفهرس بيوم السنة لكن نؤجّل لما بعد hydration لتفادي SSR mismatch
  useEffect(() => {
    setOffset(dayIndex())
    setMounted(true)
  }, [])

  const current = useMemo<Wisdom>(() => {
    const idx = ((offset % BANK.length) + BANK.length) % BANK.length
    return BANK[idx]
  }, [offset])

  const meta = KIND_META[current.kind]

  return (
    <section
      className="wisdom-card card p-5 sm:p-6 relative"
      aria-live="polite"
      style={{
        background: 'linear-gradient(135deg, #2A2D34 0%, #1A1B20 60%, #0E0F12 100%)',
        border: '1px solid rgba(192, 138, 72, 0.35)',
        color: '#F3EADB',
        overflow: 'hidden',
      }}
    >
      {/* Decorative gold contour arcs */}
      <svg
        aria-hidden="true"
        viewBox="0 0 800 300"
        preserveAspectRatio="xMidYMid slice"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          opacity: 0.55,
        }}
      >
        <g stroke="rgba(192,138,72,0.22)" strokeWidth="1" fill="none">
          <ellipse cx="760" cy="280" rx="140" ry="90" />
          <ellipse cx="760" cy="280" rx="220" ry="140" />
          <ellipse cx="760" cy="280" rx="300" ry="190" />
          <ellipse cx="760" cy="280" rx="380" ry="240" />
        </g>
        <g stroke="rgba(192,138,72,0.10)" strokeWidth="1" fill="none">
          <path d="M0 60 Q 200 20 400 80 T 900 60" />
          <path d="M0 120 Q 200 80 400 140 T 900 120" />
        </g>
      </svg>

      {/* Soft gold glow top-left */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: -60,
          right: -40,
          width: 260,
          height: 260,
          background: 'radial-gradient(circle, rgba(192,138,72,0.22) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      <div className="relative z-10 flex items-start gap-4">
        {/* Ornamental side badge */}
        <div
          className="shrink-0 rounded-2xl flex items-center justify-center"
          style={{
            width: 48,
            height: 48,
            background: 'linear-gradient(145deg, rgba(192,138,72,0.28), rgba(192,138,72,0.08))',
            border: '1px solid rgba(192,138,72,0.45)',
            boxShadow: '0 6px 18px rgba(192,138,72,0.18), inset 0 0 0 1px rgba(255,255,255,0.04)',
          }}
        >
          <Sparkles size={20} style={{ color: '#E8C48A' }} className="wisdom-sparkle" />
        </div>

        <div className="flex-1 min-w-0">
          {/* Eyebrow row — kind label + action */}
          <div className="flex items-center justify-between gap-3 mb-2.5">
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold"
              style={{
                background: 'rgba(192,138,72,0.14)',
                color: '#E8C48A',
                border: '1px solid rgba(192,138,72,0.35)',
                letterSpacing: '0.04em',
              }}
            >
              <span
                style={{
                  width: 6, height: 6, borderRadius: 999,
                  background: meta.accent,
                  display: 'inline-block',
                  boxShadow: `0 0 8px ${meta.accent}`,
                }}
              />
              {meta.label}
            </span>
            <button
              type="button"
              onClick={() => { setOffset(o => o + 1); setAnimKey(k => k + 1) }}
              aria-label="تحديث الحكمة"
              className="shrink-0 rounded-lg p-1.5 transition-all"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(192,138,72,0.25)',
                color: '#E8C48A',
              }}
            >
              <RefreshCw size={13} className="wisdom-refresh-icon" />
            </button>
          </div>

          {/* The wisdom text */}
          <div
            key={animKey}
            className="wisdom-text-wrap"
            style={{ position: 'relative' }}
          >
            {/* Large gold quote mark */}
            <Quote
              size={22}
              aria-hidden="true"
              style={{
                position: 'absolute',
                top: -4,
                right: -2,
                color: 'rgba(232,196,138,0.35)',
                transform: 'scaleX(-1)',
              }}
            />
            <p
              className="wisdom-text text-[17px] sm:text-[19px] leading-[1.85] font-bold pr-7"
              style={{
                fontFamily: "var(--font-noto-kufi, 'Noto Kufi Arabic'), var(--font-ibm-plex, 'IBM Plex Sans Arabic'), serif",
                color: '#FAF3E4',
                letterSpacing: '0.005em',
              }}
            >
              {mounted ? current.text : BANK[0].text}
            </p>
            <p
              className="mt-2 text-xs font-semibold"
              style={{ color: 'rgba(232,196,138,0.75)', letterSpacing: '0.02em' }}
            >
              — {mounted ? current.source : BANK[0].source}
            </p>
          </div>
        </div>
      </div>

      <style jsx>{`
        .wisdom-card {
          transition: transform 350ms cubic-bezier(0.22, 1, 0.36, 1),
                      box-shadow 350ms ease,
                      border-color 250ms ease;
          box-shadow:
            0 20px 44px rgba(26, 27, 32, 0.22),
            0 2px 8px rgba(26, 27, 32, 0.12),
            inset 0 1px 0 rgba(255, 255, 255, 0.04);
        }
        .wisdom-card:hover {
          border-color: rgba(232, 196, 138, 0.55) !important;
          box-shadow:
            0 28px 60px rgba(26, 27, 32, 0.32),
            0 0 0 1px rgba(232, 196, 138, 0.12),
            0 0 40px rgba(192, 138, 72, 0.14);
        }
        .wisdom-sparkle {
          animation: wisdom-sparkle-float 3.4s ease-in-out infinite;
        }
        @keyframes wisdom-sparkle-float {
          0%, 100% { transform: translateY(0) rotate(0); opacity: 0.9; }
          50% { transform: translateY(-3px) rotate(14deg); opacity: 1; }
        }
        .wisdom-text-wrap {
          animation: wisdom-fade-in 520ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        @keyframes wisdom-fade-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .wisdom-refresh-icon {
          transition: transform 500ms cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        button:hover .wisdom-refresh-icon {
          transform: rotate(180deg);
        }
        button:active .wisdom-refresh-icon {
          transform: rotate(360deg);
          transition-duration: 650ms;
        }
        @media (prefers-reduced-motion: reduce) {
          .wisdom-sparkle, .wisdom-text-wrap, .wisdom-refresh-icon {
            animation: none !important;
            transition: none !important;
          }
        }
      `}</style>
    </section>
  )
}
