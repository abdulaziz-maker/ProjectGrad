'use client'
import { useState, useEffect } from 'react'
import { BookHeart, Trash2, Copy, ChevronRight, Search } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { CATEGORY_ICONS, CATEGORY_LABELS, type Reminder, type ReminderCategory } from '@/data/reminders'

interface SavedReminder extends Reminder { savedAt?: number }

const FILTER_OPTIONS: { label: string; value: ReminderCategory | 'all' }[] = [
  { label: 'الكل', value: 'all' },
  { label: 'آيات', value: 'آية' },
  { label: 'أحاديث', value: 'حديث' },
  { label: 'آثار', value: 'أثر' },
  { label: 'دعوات', value: 'دعاء' },
  { label: 'تأملات', value: 'تأمل' },
]

export default function SavedRemindersPage() {
  const { profile } = useAuth()
  const [saved, setSaved] = useState<SavedReminder[]>([])
  const [filter, setFilter] = useState<ReminderCategory | 'all'>('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!profile?.id) return
    const raw = localStorage.getItem(`saved_rem_${profile.id}`)
    if (raw) {
      try {
        const list: SavedReminder[] = JSON.parse(raw)
        setSaved(list.sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0)))
      } catch { /* ignore */ }
    }
  }, [profile?.id])

  const remove = (id: number) => {
    if (!profile?.id) return
    const next = saved.filter(r => r.id !== id)
    setSaved(next)
    localStorage.setItem(`saved_rem_${profile.id}`, JSON.stringify(next))
    toast.success('تمت إزالة التذكيرة من المفضلة')
  }

  const copyText = (r: SavedReminder) => {
    const text = `${r.text}\n— ${r.source}`
    navigator.clipboard.writeText(text).then(() => toast.success('تم نسخ التذكيرة'))
  }

  const filtered = saved.filter(r => {
    if (filter !== 'all' && r.category !== filter) return false
    if (search && !r.text.includes(search) && !r.source.includes(search)) return false
    return true
  })

  return (
    <div className="space-y-6 max-w-3xl" dir="rtl">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Link href="/settings" className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
            الإعدادات
            <ChevronRight size={12} />
          </Link>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>التذكيرات المحفوظة</span>
        </div>
        <h1 className="text-2xl font-extrabold" style={{ color: 'var(--text-primary)' }}>التذكيرات المحفوظة</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
          {saved.length > 0 ? `${saved.length} تذكيرة محفوظة` : 'لا توجد تذكيرات محفوظة بعد'}
        </p>
      </div>

      {saved.length === 0 ? (
        <div className="card-static rounded-2xl py-16 flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: 'rgba(26,77,58,0.08)' }}>
            <BookHeart size={28} style={{ color: '#1a4d3a' }} />
          </div>
          <div className="text-center">
            <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>لا توجد تذكيرات محفوظة</p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>احفظ التذكيرات التي تعجبك بالضغط على زر "حفظ ♡" في البطاقة</p>
          </div>
        </div>
      ) : (<>
        {/* Search + Filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="ابحث في التذكيرات..."
              className="w-full pr-9 pl-3 py-2.5 text-sm rounded-xl border focus:outline-none"
              style={{ borderColor: 'var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
            />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {FILTER_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setFilter(opt.value)}
                className="px-3 py-2 rounded-xl text-xs font-medium transition-all border"
                style={filter === opt.value
                  ? { background: '#1a4d3a', color: '#faf9f6', borderColor: '#1a4d3a' }
                  : { background: 'var(--bg-card)', color: 'var(--text-secondary)', borderColor: 'var(--border-color)' }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Cards */}
        {filtered.length === 0 ? (
          <div className="card-static rounded-2xl py-12 text-center">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>لا توجد نتائج لهذا الفلتر</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(r => (
              <div
                key={r.id}
                className="card-static rounded-2xl p-5"
                style={{ borderRight: '3px solid #1a4d3a' }}
              >
                {/* Card header */}
                <div className="flex items-center gap-2 mb-3">
                  <span
                    className="w-7 h-7 rounded-full flex items-center justify-center text-sm flex-shrink-0"
                    style={{ background: '#1a4d3a', color: '#c9a961' }}
                  >
                    {CATEGORY_ICONS[r.category]}
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#7a6a3e' }}>
                    {r.type}
                  </span>
                  <span className="mr-auto text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(26,77,58,0.08)', color: '#1a4d3a' }}>
                    {CATEGORY_LABELS[r.category]}
                  </span>
                </div>

                {/* Text */}
                <p className="text-base font-medium leading-loose mb-2" style={{ color: 'var(--text-primary)' }}>
                  {r.text}
                </p>
                <p className="text-xs italic mb-4" style={{ color: '#7a6035' }}>{r.source}</p>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-3 border-t" style={{ borderColor: 'var(--border-soft)' }}>
                  <button
                    onClick={() => copyText(r)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    style={{ color: '#1a4d3a', background: 'rgba(26,77,58,0.06)' }}
                  >
                    <Copy size={11} />
                    نسخ
                  </button>
                  <button
                    onClick={() => remove(r.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors mr-auto"
                    style={{ color: '#dc2626', background: 'rgba(220,38,38,0.06)' }}
                  >
                    <Trash2 size={11} />
                    حذف
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </>)}
    </div>
  )
}
