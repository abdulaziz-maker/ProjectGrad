'use client'
import { useMemo } from 'react'
import { getFollowupWeekRange } from '@/lib/quran-followup'
import { gregorianToHijri } from '@/lib/hijri'
import type { DailyFollowup } from '@/lib/quran-followup'
import { CheckCircle2 } from 'lucide-react'
import { localDateIso } from '@/lib/date'

interface Props {
  selectedDate: string  // YYYY-MM-DD
  onSelect: (date: string) => void
  weekFollowups: DailyFollowup[]
}

const DAY_LABELS = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت']
const FOLLOWUP_DAYS = [6, 0, 1, 2, 3, 4] as const  // Sat→Thu

export default function WeekNavBar({ selectedDate, onSelect, weekFollowups }: Props) {
  const today = useMemo(() => localDateIso(new Date()), [])

  // أيام أسبوع المحاسبة الحالي (السبت→الخميس)
  const weekDays = useMemo(() => {
    const range = getFollowupWeekRange(new Date(selectedDate + 'T12:00:00'))
    const sat = new Date(range.start + 'T12:00:00')
    return FOLLOWUP_DAYS.map((dow, i) => {
      const d = new Date(sat)
      d.setDate(sat.getDate() + i)
      const date = localDateIso(d)
      return {
        dow,
        date,
        label: DAY_LABELS[dow],
        hijriDay: gregorianToHijri(date).day,
        isToday: date === today,
        isSelected: date === selectedDate,
        isPast: date < today,
        isFuture: date > today,
      }
    })
  }, [selectedDate, today])

  // عدد المتابعات لكل يوم
  const countByDay = useMemo(() => {
    const m = new Map<string, number>()
    for (const f of weekFollowups) {
      if (f.actual_position == null) continue
      m.set(f.followup_date, (m.get(f.followup_date) || 0) + 1)
    }
    return m
  }, [weekFollowups])

  // الجمعة بعد نهاية الأسبوع — اعرضها كـbadge منفصل
  const fridayDate = useMemo(() => {
    const sat = new Date(weekDays[0].date + 'T12:00:00')
    sat.setDate(sat.getDate() + 6)
    return localDateIso(sat)
  }, [weekDays])
  const isFridayShown = today === fridayDate

  const totalFollowups = weekDays.reduce((sum, d) => sum + (countByDay.get(d.date) || 0), 0)

  return (
    <div className="card-static p-3 sm:p-4">
      <div className="flex items-center justify-between mb-2.5">
        <div>
          <h3 className="font-bold text-sm flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
            أسبوع المحاسبة
            <span className="text-[10px] font-normal" style={{ color: 'var(--text-muted)' }}>(السبت → الخميس)</span>
          </h3>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full"
          style={{ background: 'rgba(90,143,103,0.10)', color: '#3F6E4B', border: '1px solid rgba(90,143,103,0.30)' }}>
          <CheckCircle2 className="w-3 h-3" />
          {totalFollowups} متابعة هذا الأسبوع
        </div>
      </div>

      <div className="grid grid-cols-6 gap-1.5 sm:gap-2">
        {weekDays.map(day => {
          const count = countByDay.get(day.date) || 0
          return (
            <button
              key={day.date}
              onClick={() => onSelect(day.date)}
              className="relative rounded-xl py-2.5 sm:py-3 px-1 transition-all flex flex-col items-center justify-center min-h-[68px] group"
              style={{
                background: day.isSelected
                  ? 'linear-gradient(180deg, rgba(53,107,110,0.18), rgba(53,107,110,0.08))'
                  : day.isToday
                    ? 'rgba(90,143,103,0.06)'
                    : day.isPast
                      ? 'rgba(0,0,0,0.02)'
                      : 'var(--bg-card)',
                border: day.isSelected
                  ? '2px solid var(--accent-teal)'
                  : day.isToday
                    ? '1px solid rgba(90,143,103,0.40)'
                    : '1px solid var(--border-soft)',
                boxShadow: day.isSelected ? '0 4px 12px -4px rgba(53,107,110,0.30)' : 'none',
              }}
            >
              {/* اسم اليوم */}
              <span className={`text-[10px] sm:text-xs font-semibold ${day.isSelected ? '' : 'opacity-70'}`}
                style={{ color: day.isSelected ? 'var(--accent-teal)' : 'var(--text-secondary)' }}>
                {day.label}
              </span>

              {/* رقم اليوم بالهجري */}
              <span className="font-mono font-bold text-base sm:text-lg mt-0.5"
                style={{ color: day.isSelected ? 'var(--accent-teal)' : 'var(--text-primary)' }}>
                {day.hijriDay}
              </span>

              {/* badge اليوم */}
              {day.isToday && !day.isSelected && (
                <span className="absolute top-1 left-1 text-[8px] font-bold px-1 py-0.5 rounded"
                  style={{ background: '#3F6E4B', color: '#fff' }}>
                  اليوم
                </span>
              )}

              {/* عدد المتابعات */}
              {count > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
                  style={{ background: '#5A8F67', color: '#fff', border: '2px solid var(--bg-card)' }}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* تنبيه يوم الجمعة (الأسبوع منتهي) */}
      {isFridayShown && (
        <div className="mt-3 px-3 py-2 rounded-lg text-[11px] font-semibold flex items-center gap-2"
          style={{ background: 'rgba(178,106,100,0.10)', color: '#8B2F23', border: '1px solid rgba(178,106,100,0.30)' }}>
          <span>🔒</span>
          <span>الأسبوع انتهى الخميس ٩م — إخلالات هذا الأسبوع ستُسجَّل صباح الجمعة عبر النظام التلقائي.</span>
        </div>
      )}
    </div>
  )
}
