'use client'
import { useState, useEffect } from 'react'
import { getStudents, getJuzProgress, DBStudent, DBJuzProgress } from '@/lib/db'
import { getStatusColor, getStatusLabel, getBatchName, formatDate } from '@/lib/utils'
import { ArrowRight, Edit, User, BookOpen, Calendar, FileText } from 'lucide-react'
import Link from 'next/link'

const JUZ_STATUS_COLORS: Record<string, string> = {
  memorized: 'bg-green-500 text-white',
  in_progress: 'bg-yellow-400 text-white',
  failed: 'bg-red-500 text-white',
  not_started: 'bg-gray-100 text-gray-400',
}

const JUZ_STATUS_LABELS: Record<string, string> = {
  memorized: 'محفوظ',
  in_progress: 'قيد الحفظ',
  failed: 'متعثر',
  not_started: 'لم يبدأ',
}

export default function StudentDetailClient({ id }: { id: string }) {
  const [activeTab, setActiveTab] = useState('details')
  const [student, setStudent] = useState<DBStudent | null>(null)
  const [progress, setProgress] = useState<DBJuzProgress[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([getStudents(), getJuzProgress()]).then(([students, allProgress]) => {
      const found = students.find(s => s.id === id)
      if (found) {
        setStudent(found)
        setProgress(allProgress.filter(p => p.student_id === id))
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [id])

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>
  if (!student) return <div className="p-8 text-center text-gray-500">الطالب غير موجود</div>

  const tabs = [
    { id: 'details', label: 'التفاصيل', icon: User },
    { id: 'quran', label: 'التقدم القرآني', icon: BookOpen },
    { id: 'attendance', label: 'سجل الحضور', icon: Calendar },
    { id: 'notes', label: 'الملاحظات', icon: FileText },
  ]

  return (
    <div className="space-y-6 max-w-4xl animate-fade-in-up">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/students" className="hover:opacity-80" style={{ color: 'var(--text-muted)' }}>
            <ArrowRight className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-extrabold" style={{ color: 'var(--text-primary)' }}>{student.name}</h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{getBatchName(student.batch_id)} — {student.supervisor_name}</p>
          </div>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-xl btn-primary btn-ripple">
          <Edit className="w-4 h-4" />
          تعديل البيانات
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="card p-4">
          <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>الدفعة</p>
          <p className="font-semibold font-mono" style={{ color: 'var(--text-primary)' }}>{getBatchName(student.batch_id)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>المشرف</p>
          <p className="font-semibold font-mono" style={{ color: 'var(--text-primary)' }}>{student.supervisor_name}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>الأجزاء المحفوظة</p>
          <p className="font-semibold font-mono" style={{ color: 'var(--text-primary)' }}>{student.juz_completed} / 30</p>
        </div>
        <div className="card p-4">
          <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>الحالة</p>
          <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(student.status)}`}>
            {getStatusLabel(student.status)}
          </span>
        </div>
      </div>

      <div className="card-static overflow-hidden">
        <div className="flex border-b border-gray-100 overflow-x-auto">
          {tabs.map(tab => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 ${
                  activeTab === tab.id
                    ? 'border-[#6366f1]'
                    : 'border-transparent'
                }`}
                style={activeTab === tab.id ? { color: '#6366f1' } : { color: 'var(--text-muted)' }}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            )
          })}
        </div>

        <div className="p-6">
          {activeTab === 'details' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="mb-1" style={{ color: 'var(--text-muted)' }}>تاريخ الالتحاق</p>
                  <p className="font-medium">{formatDate(student.enrollment_date)}</p>
                </div>
                <div>
                  <p className="mb-1" style={{ color: 'var(--text-muted)' }}>آخر متابعة</p>
                  <p className="font-medium">{formatDate(student.last_followup)}</p>
                </div>
                <div>
                  <p className="mb-1" style={{ color: 'var(--text-muted)' }}>نسبة الإنجاز</p>
                  <div className="flex items-center gap-2">
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div className="h-2 rounded-full bg-green-500" style={{ width: `${student.completion_percentage}%` }} />
                    </div>
                    <span className="font-medium">{student.completion_percentage}%</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'quran' && (
            <div>
              <div className="flex gap-4 flex-wrap mb-4 text-xs">
                {Object.entries(JUZ_STATUS_LABELS).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-1.5">
                    <div className={`w-3 h-3 rounded ${JUZ_STATUS_COLORS[k].split(' ')[0]}`} />
                    <span style={{ color: 'var(--text-secondary)' }}>{v}</span>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-5 sm:grid-cols-6 gap-2">
                {Array.from({ length: 30 }, (_, i) => {
                  const juzProgress = progress.find(p => p.juz_number === i + 1)
                  const status = juzProgress?.status || 'not_started'
                  return (
                    <div
                      key={i}
                      className={`aspect-square rounded-xl flex flex-col items-center justify-center text-xs font-bold cursor-default ${JUZ_STATUS_COLORS[status]}`}
                      title={`الجزء ${i + 1}: ${JUZ_STATUS_LABELS[status]}`}
                    >
                      <span>{i + 1}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {activeTab === 'attendance' && (
            <div>
              <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>سجل الحضور لشهر مارس 2026</p>
              <div className="grid grid-cols-7 gap-2">
                {['أح', 'إث', 'ثل', 'أر', 'خم', 'جم', 'سب'].map(d => (
                  <div key={d} className="text-center text-xs text-gray-400 font-medium py-1">{d}</div>
                ))}
                {Array.from({ length: 31 }, (_, i) => {
                  const day = i + 1
                  const status = day % 7 === 0 ? 'absent' : day % 11 === 0 ? 'late' : 'present'
                  return (
                    <div
                      key={day}
                      className={`aspect-square rounded-lg flex items-center justify-center text-xs font-medium ${
                        status === 'present' ? 'bg-green-100 text-green-700' :
                        status === 'absent' ? 'bg-red-100 text-red-700' :
                        'bg-yellow-100 text-yellow-700'
                      }`}
                    >
                      {day}
                    </div>
                  )
                })}
              </div>
              <div className="mt-4 flex gap-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-100 inline-block" /> حاضر</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-100 inline-block" /> غائب</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-100 inline-block" /> متأخر</span>
              </div>
            </div>
          )}

          {activeTab === 'notes' && (
            <div className="space-y-4">
              <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.02)' }}>
                <p className="text-sm mb-2 font-bold" style={{ color: 'var(--text-muted)' }}>ملاحظات المشرف</p>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{student.notes || 'لا توجد ملاحظات مسجلة حتى الآن.'}</p>
              </div>
              <div>
                <p className="text-sm mb-2" style={{ color: 'var(--text-muted)' }}>آخر متابعة: {formatDate(student.last_followup)}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
