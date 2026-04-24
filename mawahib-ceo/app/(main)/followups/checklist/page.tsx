'use client'
import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import {
  getStudents, getSupervisors, getQuranPlans, getDailyFollowups, getBatches,
  type DBStudent, type DBBatch, type DBSupervisor,
} from '@/lib/db'
import {
  calculateExpectedPosition, getToday,
  type QuranPlan, type DailyFollowup,
} from '@/lib/quran-followup'
import { formatHijriWithDay } from '@/lib/hijri'
import HijriDatePicker from '@/components/ui/HijriDatePicker'
import {
  ClipboardList, CheckCircle2, Circle, AlertTriangle,
  Users, ChevronDown, ChevronUp, FileX,
} from 'lucide-react'
import Link from 'next/link'
import { toAr } from '@/lib/arabic-numbers'

type StudentCategory = 'followed' | 'not_followed' | 'no_plan'

interface StudentEntry {
  student: DBStudent
  category: StudentCategory
  expected: number | null
  batchName: string
}

const SECTION_CONFIG: Record<StudentCategory, { title: string; icon: React.ElementType; emptyText: string; color: string; bg: string }> = {
  not_followed: {
    title: 'لم تتم متابعته',
    icon: Circle,
    emptyText: 'جميع الطلاب تمت متابعتهم ✓',
    color: 'text-red-600',
    bg: 'bg-red-50',
  },
  no_plan: {
    title: 'لم يتم بناء خطته',
    icon: FileX,
    emptyText: 'جميع الطلاب لديهم خطط',
    color: 'text-amber-600',
    bg: 'bg-amber-50',
  },
  followed: {
    title: 'تمت متابعته',
    icon: CheckCircle2,
    emptyText: 'لا يوجد طلاب تمت متابعتهم بعد',
    color: 'text-green-600',
    bg: 'bg-green-50',
  },
}

export default function FollowupChecklistPage() {
  const { profile } = useAuth()
  const isCeo = profile?.role === 'ceo'
  const isSupervisor = profile?.role === 'supervisor' || profile?.role === 'teacher'
  const myBatchId = profile?.batch_id ?? null

  const [students, setStudents] = useState<DBStudent[]>([])
  const [supervisorsList, setSupervisorsList] = useState<DBSupervisor[]>([])
  const [batches, setBatches] = useState<DBBatch[]>([])
  const [plans, setPlans] = useState<QuranPlan[]>([])
  const [followups, setFollowups] = useState<DailyFollowup[]>([])
  const [selectedDate, setSelectedDate] = useState(getToday())
  const [loading, setLoading] = useState(true)
  const [collapsedSections, setCollapsedSections] = useState<Set<StudentCategory>>(new Set<StudentCategory>())
  const [studentFilter, setStudentFilter] = useState<'mine' | 'all'>('mine')

  useEffect(() => {
    async function load() {
      try {
        const [s, b, p, sups] = await Promise.all([
          getStudents(),
          getBatches(),
          getQuranPlans(),
          getSupervisors(),
        ])
        setStudents(s)
        setSupervisorsList(sups)
        setBatches(b)
        setPlans(p)
        const f = await getDailyFollowups({ dateFrom: selectedDate, dateTo: selectedDate })
        setFollowups(f)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (loading) return
    getDailyFollowups({ dateFrom: selectedDate, dateTo: selectedDate })
      .then(setFollowups).catch(console.error)
  }, [selectedDate, loading])

  // Find current supervisor's table ID from auth user_id
  const mySupervisorTableId = useMemo(() => {
    if (!profile?.id || !isSupervisor) return null
    return supervisorsList.find(s => s.user_id === profile.id)?.id ?? null
  }, [profile, isSupervisor, supervisorsList])

  const myAssignedIds = useMemo(() => {
    if (!mySupervisorTableId) return new Set<string>()
    const batchStudents = myBatchId !== null ? students.filter(s => s.batch_id === myBatchId) : students
    return new Set(batchStudents.filter(s => s.supervisor_id === mySupervisorTableId).map(s => s.id))
  }, [students, mySupervisorTableId, myBatchId])

  const allBatchStudents = useMemo(() => {
    if (isCeo) return students
    if (myBatchId !== null) return students.filter(s => s.batch_id === myBatchId)
    return []
  }, [students, myBatchId, isCeo])

  const myStudents = useMemo(() => {
    if (!isSupervisor || studentFilter === 'all') return allBatchStudents
    return allBatchStudents.filter(s => myAssignedIds.has(s.id))
  }, [allBatchStudents, isSupervisor, studentFilter, myAssignedIds])

  const planMap = useMemo(() => {
    const m = new Map<string, QuranPlan>()
    plans.forEach(p => m.set(p.student_id, p))
    return m
  }, [plans])

  const followedSet = useMemo(() => {
    const s = new Set<string>()
    followups.forEach(f => {
      if (f.actual_position != null) s.add(f.student_id)
    })
    return s
  }, [followups])

  const batchNameMap = useMemo(() => {
    const m = new Map<number, string>()
    batches.forEach(b => m.set(b.id, b.name))
    return m
  }, [batches])

  // Categorize all students
  const categorized = useMemo(() => {
    const result: Record<StudentCategory, StudentEntry[]> = {
      followed: [],
      not_followed: [],
      no_plan: [],
    }

    for (const student of myStudents) {
      const plan = planMap.get(student.id)
      const batchName = batchNameMap.get(student.batch_id) || `دفعة ${student.batch_id}`

      if (!plan) {
        result.no_plan.push({ student, category: 'no_plan', expected: null, batchName })
        continue
      }

      const { position } = calculateExpectedPosition(
        plan.start_position, plan.start_date, selectedDate,
        plan.daily_rate, new Map(),
      )

      if (followedSet.has(student.id)) {
        result.followed.push({ student, category: 'followed', expected: position, batchName })
      } else {
        result.not_followed.push({ student, category: 'not_followed', expected: position, batchName })
      }
    }

    // Sort each: group by batch, then name
    for (const key of Object.keys(result) as StudentCategory[]) {
      result[key].sort((a, b) => {
        if (a.student.batch_id !== b.student.batch_id) return a.student.batch_id - b.student.batch_id
        return a.student.name.localeCompare(b.student.name, 'ar')
      })
    }

    return result
  }, [myStudents, planMap, followedSet, selectedDate, batchNameMap])

  const counts = {
    followed: categorized.followed.length,
    not_followed: categorized.not_followed.length,
    no_plan: categorized.no_plan.length,
    total: myStudents.length,
  }

  function toggleSection(key: StudentCategory) {
    setCollapsedSections(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="text-center space-y-3">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>جاري التحميل...</p>
      </div>
    </div>
  )

  const sections: StudentCategory[] = ['followed', 'not_followed', 'no_plan']

  return (
    <div className="space-y-5 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <ClipboardList className="w-5 h-5 text-emerald-500" />
            قائمة المتابعات
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {formatHijriWithDay(selectedDate)}
          </p>
        </div>
        <HijriDatePicker value={selectedDate} onChange={setSelectedDate} compact />
      </div>

      {/* Supervisor filter toggle */}
      {isSupervisor && myAssignedIds.size > 0 && (
        <div className="flex gap-2 p-1 rounded-xl w-fit" style={{ background: 'var(--bg-elevated, #f3f4f6)' }}>
          <button
            onClick={() => setStudentFilter('mine')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${studentFilter === 'mine' ? 'bg-white shadow-sm' : ''}`}
            style={studentFilter === 'mine' ? { color: '#C08A48' } : { color: 'var(--text-muted)' }}
          >
            ⭐ طلابي ({myAssignedIds.size})
          </button>
          <button
            onClick={() => setStudentFilter('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${studentFilter === 'all' ? 'bg-white shadow-sm' : ''}`}
            style={studentFilter === 'all' ? { color: '#C08A48' } : { color: 'var(--text-muted)' }}
          >
            جميع طلاب الدفعة ({allBatchStudents.length})
          </button>
        </div>
      )}

      {/* Counts strip */}
      <div className="flex items-center gap-3 flex-wrap text-sm">
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50">
          <Circle className="w-3.5 h-3.5 text-red-400" />
          <span className="text-red-600 font-bold font-mono">{toAr(counts.not_followed)}</span>
          <span className="text-red-500 text-xs">لم يُتابع</span>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
          <span className="text-amber-600 font-bold font-mono">{toAr(counts.no_plan)}</span>
          <span className="text-amber-500 text-xs">بدون خطة</span>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50">
          <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
          <span className="text-green-600 font-bold font-mono">{toAr(counts.followed)}</span>
          <span className="text-green-500 text-xs">تمت متابعته</span>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg" style={{ background: 'rgba(0,0,0,0.03)' }}>
          <Users className="w-3.5 h-3.5 text-gray-400" />
          <span className="font-bold font-mono" style={{ color: 'var(--text-primary)' }}>{toAr(counts.total)}</span>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>إجمالي</span>
        </div>
      </div>

      {/* Three sections */}
      {sections.map(sectionKey => {
        const config = SECTION_CONFIG[sectionKey]
        const entries = categorized[sectionKey]
        const isCollapsed = collapsedSections.has(sectionKey)
        const Icon = config.icon

        // Group entries by batch for display
        const byBatch = new Map<number, StudentEntry[]>()
        entries.forEach(e => {
          if (!byBatch.has(e.student.batch_id)) byBatch.set(e.student.batch_id, [])
          byBatch.get(e.student.batch_id)!.push(e)
        })

        return (
          <div key={sectionKey} className="card-static overflow-hidden">
            {/* Section header */}
            <button
              onClick={() => toggleSection(sectionKey)}
              className="w-full flex items-center gap-3 p-4 text-right"
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${config.bg}`}>
                <Icon className={`w-4 h-4 ${config.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                  {config.title}
                </span>
              </div>
              <span className={`text-sm font-bold font-mono px-2.5 py-0.5 rounded-full ${config.bg} ${config.color}`}>
                {toAr(entries.length)}
              </span>
              {isCollapsed ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronUp className="w-4 h-4 text-gray-400" />}
            </button>

            {/* Content */}
            {!isCollapsed && (
              <div className="border-t border-gray-100">
                {entries.length === 0 ? (
                  <p className="text-center text-xs py-6" style={{ color: 'var(--text-muted)' }}>
                    {config.emptyText}
                  </p>
                ) : (
                  [...byBatch.entries()].sort(([a], [b]) => a - b).map(([batchId, batchEntries]) => (
                    <div key={batchId}>
                      {/* Batch subheader (only if multiple batches) */}
                      {byBatch.size > 1 && (
                        <div className="px-4 py-1.5 text-[10px] font-bold" style={{
                          color: 'var(--text-muted)',
                          background: 'rgba(0,0,0,0.02)',
                          borderBottom: '1px solid rgba(0,0,0,0.04)',
                        }}>
                          {batchEntries[0].batchName}
                        </div>
                      )}
                      {batchEntries.map((entry, idx) => (
                        <Link
                          key={entry.student.id}
                          href={sectionKey === 'no_plan' ? '/followups' : '/followups'}
                          className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-gray-50/80"
                          style={{ borderBottom: '1px solid rgba(0,0,0,0.03)' }}
                        >
                          {/* Number */}
                          <span className="w-5 text-center text-[10px] font-mono text-gray-300 flex-shrink-0">
                            {toAr(idx + 1)}
                          </span>

                          {/* Status icon */}
                          {sectionKey === 'followed' && <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />}
                          {sectionKey === 'not_followed' && <Circle className="w-4 h-4 text-red-300 flex-shrink-0" />}
                          {sectionKey === 'no_plan' && <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />}

                          {/* Name */}
                          <span className={`flex-1 text-sm truncate ${
                            sectionKey === 'followed' ? 'text-gray-400 line-through' : 'font-medium'
                          }`} style={{ color: sectionKey !== 'followed' ? 'var(--text-primary)' : undefined }}>
                            {entry.student.name}
                          </span>

                          {/* Batch (if single batch view) */}
                          {byBatch.size <= 1 && (
                            <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                              {entry.batchName}
                            </span>
                          )}

                          {/* Expected position */}
                          {entry.expected !== null && (
                            <span className="text-[10px] font-mono flex-shrink-0 px-1.5 py-0.5 rounded bg-gray-50" style={{ color: 'var(--text-muted)' }}>
                              وجه {toAr(entry.expected!)}
                            </span>
                          )}

                          {/* Action hint */}
                          {sectionKey === 'not_followed' && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-50 text-red-500 font-medium flex-shrink-0">
                              متابعة ←
                            </span>
                          )}
                          {sectionKey === 'no_plan' && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-500 font-medium flex-shrink-0">
                              إنشاء خطة ←
                            </span>
                          )}
                        </Link>
                      ))}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
