'use client'

import { useState, useEffect } from 'react'
import { getMeetings, upsertMeeting, deleteMeeting, createMeetingSeries, DBMeeting } from '@/lib/db'
import { toHijriDisplay, toGregorianDisplay } from '@/lib/hijri'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

const MEETING_TYPES: Record<string, string> = {
  general_management: 'الإدارة العامة',
  executive: 'الإدارة التنفيذية',
  annual_planning: 'رسم الخطة السنوية',
  quarterly_teachers: 'الاجتماع الفصلي',
}

const TYPE_COLORS: Record<string, string> = {
  general_management: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  executive: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  annual_planning: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  quarterly_teachers: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
}

const emptyForm = {
  type: 'executive',
  date: '',
  time: '',
  attendees: '',
  agenda: '',
  decisions: '',
  recommendations: '',
  recurrence: 'none' as 'none' | 'weekly' | 'monthly',
  occurrences: 12,
}

const RECURRENCE_LABELS: Record<'none' | 'weekly' | 'monthly', string> = {
  none: 'غير متكرر',
  weekly: 'أسبوعي',
  monthly: 'شهري',
}

// Meeting types visible to supervisors (no executive meetings)
const SUPERVISOR_VISIBLE_TYPES = ['general_management', 'annual_planning', 'quarterly_teachers']

export default function MeetingsPage() {
  const { profile } = useAuth()
  const isSupervisor = profile?.role === 'supervisor' || profile?.role === 'teacher'

  const [meetings, setMeetings] = useState<DBMeeting[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [editForm, setEditForm] = useState<typeof emptyForm & { id: string }>({ ...emptyForm, id: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getMeetings()
      .then(data => {
        const sorted = data.sort((a, b) => b.date > a.date ? 1 : -1)
        // Supervisors cannot see executive meetings
        const visible = isSupervisor
          ? sorted.filter(m => SUPERVISOR_VISIBLE_TYPES.includes(m.type))
          : sorted
        setMeetings(visible)
      })
      .catch(() => toast.error('خطأ في تحميل الاجتماعات'))
      .finally(() => setLoading(false))
  }, [isSupervisor])

  function attendeesFromString(str: string): string[] {
    return str.split('\n').map(a => a.trim()).filter(Boolean)
  }

  function attendeesToString(arr: string[]): string {
    return arr.join('\n')
  }

  async function handleAdd() {
    if (!form.date || !form.agenda) return
    setSaving(true)
    try {
      if (form.recurrence === 'none') {
        const newMeeting: DBMeeting = {
          id: `m_${Date.now()}`,
          type: form.type,
          date: form.date,
          time: form.time,
          attendees: attendeesFromString(form.attendees),
          agenda: form.agenda,
          decisions: form.decisions,
          recommendations: form.recommendations,
          recurrence: 'none',
          series_id: null,
        }
        await upsertMeeting(newMeeting)
        setMeetings(prev => [newMeeting, ...prev].sort((a, b) => b.date > a.date ? 1 : -1))
        toast.success('تم حفظ الاجتماع بنجاح')
      } else {
        // اجتماع دوري — توليد السلسلة تلقائياً
        const occurrences = Math.max(1, Math.min(52, Number(form.occurrences) || 12))
        await createMeetingSeries({
          type: form.type,
          date: form.date,
          time: form.time,
          attendees: attendeesFromString(form.attendees),
          agenda: form.agenda,
          decisions: form.decisions,
          recommendations: form.recommendations,
          recurrence: form.recurrence,
        }, occurrences)
        // إعادة تحميل كاملة بعد التوليد لتظهر السلسلة
        const all = await getMeetings()
        const sorted = all.sort((a, b) => b.date > a.date ? 1 : -1)
        const visible = isSupervisor
          ? sorted.filter(m => SUPERVISOR_VISIBLE_TYPES.includes(m.type))
          : sorted
        setMeetings(visible)
        toast.success(`تم توليد ${occurrences} اجتماع ${RECURRENCE_LABELS[form.recurrence]}`)
      }
      setForm(emptyForm)
      setShowAddForm(false)
    } catch {
      toast.error('خطأ في الحفظ')
    } finally {
      setSaving(false)
    }
  }

  function startEdit(meeting: DBMeeting) {
    setEditingId(meeting.id)
    setEditForm({
      id: meeting.id,
      recurrence: meeting.recurrence ?? 'none',
      occurrences: 12,
      type: meeting.type,
      date: meeting.date,
      time: meeting.time ?? '',
      attendees: attendeesToString(meeting.attendees),
      agenda: meeting.agenda,
      decisions: meeting.decisions ?? '',
      recommendations: meeting.recommendations ?? '',
    })
  }

  async function handleSaveEdit() {
    setSaving(true)
    try {
      const updated: DBMeeting = {
        id: editForm.id,
        type: editForm.type,
        date: editForm.date,
        time: editForm.time,
        attendees: attendeesFromString(editForm.attendees),
        agenda: editForm.agenda,
        decisions: editForm.decisions,
        recommendations: editForm.recommendations,
      }
      await upsertMeeting(updated)
      setMeetings(prev => prev.map(m => m.id === editForm.id ? updated : m).sort((a, b) => b.date > a.date ? 1 : -1))
      setEditingId(null)
      toast.success('تم تحديث الاجتماع')
    } catch {
      toast.error('خطأ في الحفظ')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteMeeting(id)
      setMeetings(prev => prev.filter(m => m.id !== id))
      if (expandedId === id) setExpandedId(null)
      toast.success('تم حذف الاجتماع')
    } catch {
      toast.error('خطأ في الحذف')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]" dir="rtl">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-[#C08A48] mx-auto" />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>جاري تحميل الاجتماعات...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen animate-fade-in-up" dir="rtl">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>الاجتماعات</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>{meetings.length} اجتماع</p>
          </div>
          <button
            onClick={() => { setShowAddForm(!showAddForm); setExpandedId(null); setEditingId(null) }}
            className="btn-primary btn-ripple flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-medium transition-all"
          >
            <span className="text-lg leading-none">+</span>
            اجتماع جديد
          </button>
        </div>

        {/* Add Form */}
        {showAddForm && (
          <div className="card-static p-6 mb-6">
            <h2 className="text-lg font-bold mb-5" style={{ color: 'var(--text-primary)' }}>إضافة اجتماع جديد</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>نوع الاجتماع</label>
                <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/30">
                  {Object.entries(MEETING_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>التاريخ</label>
                <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>الوقت</label>
                <input type="time" value={form.time} onChange={e => setForm({ ...form, time: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>الحضور (سطر لكل شخص)</label>
                <textarea value={form.attendees} onChange={e => setForm({ ...form, attendees: e.target.value })} rows={3}
                  placeholder={'المدير التنفيذي\nعبدالله التويم'}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 resize-none" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>جدول الأعمال</label>
                <textarea value={form.agenda} onChange={e => setForm({ ...form, agenda: e.target.value })} rows={3}
                  placeholder="موضوعات الاجتماع..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 resize-none" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>القرارات</label>
                <textarea value={form.decisions} onChange={e => setForm({ ...form, decisions: e.target.value })} rows={3}
                  placeholder="القرارات المتخذة..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 resize-none" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>التوصيات</label>
                <textarea value={form.recommendations} onChange={e => setForm({ ...form, recommendations: e.target.value })} rows={3}
                  placeholder="التوصيات والملاحظات..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 resize-none" />
              </div>

              {/* التكرار */}
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  نوع التكرار
                </label>
                <select
                  value={form.recurrence}
                  onChange={e => setForm({ ...form, recurrence: e.target.value as 'none' | 'weekly' | 'monthly' })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                >
                  <option value="none">غير متكرر (اجتماع مرة واحدة)</option>
                  <option value="weekly">أسبوعي (كل ٧ أيام)</option>
                  <option value="monthly">شهري (كل شهر ميلادي)</option>
                </select>
              </div>

              {form.recurrence !== 'none' && (
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                    عدد مرات التوليد
                    <span className="text-[10px] mr-1" style={{ color: 'var(--text-muted)' }}>(١-٥٢)</span>
                  </label>
                  <input
                    type="number"
                    min={1} max={52}
                    value={form.occurrences}
                    onChange={e => setForm({ ...form, occurrences: Number(e.target.value) })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                  />
                  <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                    سيُولَّد {form.occurrences} اجتماعاً {form.recurrence === 'weekly' ? 'أسبوعياً' : 'شهرياً'} ابتداءً من التاريخ أعلاه.
                  </p>
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={handleAdd} disabled={!form.date || !form.agenda || saving}
                className="btn-primary btn-ripple flex items-center gap-2 px-6 py-2.5 rounded-xl text-white text-sm font-medium disabled:opacity-40">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                حفظ الاجتماع
              </button>
              <button onClick={() => { setShowAddForm(false); setForm(emptyForm) }}
                className="px-6 py-2.5 rounded-xl text-sm font-medium bg-white/5 hover:bg-white/10" style={{ color: 'var(--text-secondary)' }}>
                إلغاء
              </button>
            </div>
          </div>
        )}

        {/* Meetings List */}
        <div className="space-y-4 stagger-children">
          {meetings.length === 0 && (
            <div className="card-static p-12 text-center">
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>لا توجد اجتماعات مسجلة</p>
            </div>
          )}
          {meetings.map(meeting => {
            const isExpanded = expandedId === meeting.id
            const isEditing = editingId === meeting.id
            const typeLabel = MEETING_TYPES[meeting.type] ?? meeting.type
            const typeColor = TYPE_COLORS[meeting.type] ?? 'bg-gray-500/10 text-gray-400 border-gray-500/20'

            return (
              <div key={meeting.id} className="card overflow-hidden">
                <button
                  onClick={() => { if (!isEditing) setExpandedId(isExpanded ? null : meeting.id) }}
                  className="w-full text-right px-6 py-4 flex items-center justify-between hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-medium px-3 py-1 rounded-full border ${typeColor}`}>{typeLabel}</span>
                    {meeting.decisions && (
                      <span className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">موثق</span>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-left">
                      <p className="text-sm font-medium font-mono" style={{ color: 'var(--text-primary)' }}>{toHijriDisplay(meeting.date)}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {toGregorianDisplay(meeting.date)}{meeting.time ? ` — ${meeting.time}` : ''}
                      </p>
                    </div>
                    <svg className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} style={{ color: 'var(--text-muted)' }}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {isExpanded && !isEditing && (
                  <div className="px-6 pb-6 border-t border-white/5">
                    <div className="pt-5 space-y-5">
                      {meeting.attendees.length > 0 && (
                        <div>
                          <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>الحضور</h3>
                          <div className="flex flex-wrap gap-2">
                            {meeting.attendees.map((a, i) => (
                              <span key={i} className="text-sm bg-white/5 px-3 py-1 rounded-full" style={{ color: 'var(--text-secondary)' }}>{a}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      <div>
                        <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>جدول الأعمال</h3>
                        <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: 'var(--text-secondary)' }}>{meeting.agenda}</p>
                      </div>
                      {meeting.decisions && (
                        <div>
                          <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>القرارات</h3>
                          <p className="text-sm leading-relaxed whitespace-pre-line bg-emerald-500/10 rounded-xl p-4 border border-emerald-500/20" style={{ color: 'var(--text-secondary)' }}>{meeting.decisions}</p>
                        </div>
                      )}
                      {meeting.recommendations && (
                        <div>
                          <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>التوصيات</h3>
                          <p className="text-sm leading-relaxed whitespace-pre-line bg-amber-500/10 rounded-xl p-4 border border-amber-500/20" style={{ color: 'var(--text-secondary)' }}>{meeting.recommendations}</p>
                        </div>
                      )}
                      <div className="flex gap-3 pt-2">
                        <button onClick={() => startEdit(meeting)}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border border-white/10 hover:bg-white/5" style={{ color: 'var(--text-secondary)' }}>
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          تعديل
                        </button>
                        <button onClick={() => handleDelete(meeting.id)}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border border-red-500/20 text-red-400 hover:bg-red-500/10">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          حذف
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {isEditing && (
                  <div className="px-6 pb-6 border-t border-white/5">
                    <div className="pt-5 space-y-4">
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>نوع الاجتماع</label>
                          <select value={editForm.type} onChange={e => setEditForm({ ...editForm, type: e.target.value })}
                            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/30">
                            {Object.entries(MEETING_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>التاريخ</label>
                          <input type="date" value={editForm.date} onChange={e => setEditForm({ ...editForm, date: e.target.value })}
                            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>الوقت</label>
                          <input type="time" value={editForm.time} onChange={e => setEditForm({ ...editForm, time: e.target.value })}
                            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>الحضور</label>
                          <textarea value={editForm.attendees} onChange={e => setEditForm({ ...editForm, attendees: e.target.value })} rows={3}
                            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 resize-none" />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>جدول الأعمال</label>
                          <textarea value={editForm.agenda} onChange={e => setEditForm({ ...editForm, agenda: e.target.value })} rows={3}
                            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 resize-none" />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>القرارات</label>
                          <textarea value={editForm.decisions} onChange={e => setEditForm({ ...editForm, decisions: e.target.value })} rows={3}
                            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 resize-none" />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>التوصيات</label>
                          <textarea value={editForm.recommendations} onChange={e => setEditForm({ ...editForm, recommendations: e.target.value })} rows={3}
                            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 resize-none" />
                        </div>
                      </div>
                      <div className="flex gap-3 pt-1">
                        <button onClick={handleSaveEdit} disabled={saving}
                          className="btn-primary btn-ripple flex items-center gap-2 px-6 py-2.5 rounded-xl text-white text-sm font-medium disabled:opacity-50">
                          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                          حفظ التعديلات
                        </button>
                        <button onClick={() => setEditingId(null)}
                          className="px-6 py-2.5 rounded-xl text-sm font-medium bg-white/5 hover:bg-white/10" style={{ color: 'var(--text-secondary)' }}>
                          إلغاء
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
