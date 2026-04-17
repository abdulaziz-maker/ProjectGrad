'use client'
import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import {
  getStudents, getBatches, getTexts, getStudentTextProgress,
  upsertStudentTextProgress, markTextMemorized, setTextStatus,
  type DBStudent, type DBBatch, type DBText, type DBStudentTextProgress,
} from '@/lib/db'
import { useAuth } from '@/contexts/AuthContext'
import {
  BookOpen, ChevronDown, ChevronUp, Loader2, CheckCircle2,
  AlertTriangle, Clock, RefreshCw, Minus, Plus, Check,
} from 'lucide-react'

// ── Constants ───────────────────────────────────────────────────────────────────
const LEVEL_LABELS: Record<number, string> = {
  0: 'المستوى التمهيدي',
  1: 'المستوى الأول',
  2: 'المستوى الثاني',
  3: 'المستوى الثالث',
  4: 'المستوى الرابع',
  5: 'المستوى الخامس',
  6: 'المستوى السادس',
}

// الإجمالي صفر للمستوى التمهيدي — يحدَّد ديناميكياً من المتون المضافة.
const LEVEL_TOTALS: Record<number, number> = { 0: 0, 1: 515, 2: 589, 3: 1309, 4: 1365, 5: 1378, 6: 1505 }

const SUBJECT_COLORS: Record<string, string> = {
  'علوم القرآن':      '#6366f1',
  'الفقه':           '#06b6d4',
  'العقيدة':         '#8b5cf6',
  'اللغة':           '#22c55e',
  'التاريخ':         '#f59e0b',
  'الحديث':          '#ef4444',
  'التربية الإيمانية': '#ec4899',
  'مهارات':          '#64748b',
}

const CATEGORY_COLORS: Record<string, string> = {
  'علمي':   'rgba(99,102,241,0.12)',
  'تربوي':  'rgba(236,72,153,0.12)',
  'مهاري':  'rgba(100,116,139,0.12)',
}

const STATUS_CONFIG = {
  not_started:    { label: 'لم يبدأ',   color: '#64748b', icon: Clock },
  in_progress:    { label: 'جارٍ',       color: '#6366f1', icon: BookOpen },
  memorized:      { label: 'أتمّ',       color: '#22c55e', icon: CheckCircle2 },
  needs_revision: { label: 'يراجع',     color: '#f59e0b', icon: RefreshCw },
}

function scoreColor(pct: number) {
  return pct >= 100 ? '#22c55e' : pct >= 70 ? '#6366f1' : pct >= 40 ? '#f59e0b' : '#ef4444'
}

function unitCount(text: DBText): number {
  return Math.ceil(text.total_lines / text.weekly_rate)
}

// ── Debounce hook ───────────────────────────────────────────────────────────────
function useDebounce<T>(value: T, ms: number): T {
  const [d, setD] = useState(value)
  useEffect(() => { const t = setTimeout(() => setD(value), ms); return () => clearTimeout(t) }, [value, ms])
  return d
}

// ── Student progress row ────────────────────────────────────────────────────────
function StudentProgressRow({
  student,
  text,
  progress,
  onSave,
}: {
  student: DBStudent
  text: DBText
  progress: DBStudentTextProgress | undefined
  onSave: (studentId: string, textId: string, lines: number) => void
}) {
  const lines = progress?.lines_memorized ?? 0
  const status = progress?.status ?? 'not_started'
  const [inputVal, setInputVal] = useState(String(lines))
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const debouncedVal = useDebounce(inputVal, 600)

  useEffect(() => { if (!editing) setInputVal(String(lines)) }, [lines, editing])

  useEffect(() => {
    if (!editing) return
    const num = parseInt(debouncedVal, 10)
    if (isNaN(num) || num < 0 || num > text.total_lines || num === lines) return
    setSaving(true)
    onSave(student.id, text.id, num)
    setTimeout(() => setSaving(false), 600)
  }, [debouncedVal]) // eslint-disable-line react-hooks/exhaustive-deps

  const pct = text.total_lines > 0 ? Math.round((lines / text.total_lines) * 100) : 0
  const color = scoreColor(pct)
  const cfg = STATUS_CONFIG[status]

  const adjust = (delta: number) => {
    const next = Math.max(0, Math.min(text.total_lines, lines + delta))
    setInputVal(String(next))
    setSaving(true)
    onSave(student.id, text.id, next)
    setTimeout(() => setSaving(false), 600)
  }

  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-lg"
      style={{ background: 'var(--bg-body)', borderBottom: '1px solid var(--border-color)' }}>

      {/* Avatar + name */}
      <div className="w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0"
        style={{ background: `${color}20`, color }}>
        {student.name.charAt(0)}
      </div>
      <span className="text-sm font-medium flex-1 truncate" style={{ color: 'var(--text-primary)' }}>
        {student.name}
      </span>

      {/* Status badge */}
      <span className="text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0"
        style={{ background: `${cfg.color}15`, color: cfg.color }}>
        {cfg.label}
      </span>

      {/* Controls */}
      <button onClick={() => adjust(-text.weekly_rate)}
        className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
        <Minus size={11} />
      </button>

      <div className="w-24 flex items-center rounded-md px-2 py-1 cursor-text flex-shrink-0"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-color)' }}
        onClick={() => { setEditing(true); setTimeout(() => inputRef.current?.select(), 50) }}>
        {editing ? (
          <input ref={inputRef} type="number" min={0} max={text.total_lines}
            value={inputVal} onChange={e => setInputVal(e.target.value)}
            onBlur={() => setEditing(false)}
            className="w-full bg-transparent text-center text-xs font-mono outline-none"
            style={{ color: 'var(--text-primary)' }} />
        ) : (
          <span className="w-full text-center text-xs font-mono" style={{ color }}>
            {lines}/{text.total_lines}
          </span>
        )}
      </div>

      <button onClick={() => adjust(text.weekly_rate)}
        className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
        style={{ background: `${color}18`, border: `1px solid ${color}30`, color }}>
        <Plus size={11} />
      </button>

      {/* Progress bar */}
      <div className="w-16 h-1.5 rounded-full flex-shrink-0" style={{ background: 'rgba(255,255,255,0.07)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>

      <span className="text-xs font-mono w-8 text-left flex-shrink-0" style={{ color }}>
        {pct}%
      </span>

      {saving && <Loader2 size={12} className="animate-spin flex-shrink-0" style={{ color: 'var(--text-muted)' }} />}
    </div>
  )
}

// ── Matn card ────────────────────────────────────────────────────────────────────
function MatnCard({
  text,
  students,
  progressMap,
  onSave,
}: {
  text: DBText
  students: DBStudent[]
  progressMap: Map<string, DBStudentTextProgress>
  onSave: (studentId: string, textId: string, lines: number) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const subjectColor = SUBJECT_COLORS[text.subject] ?? '#6366f1'
  const units = unitCount(text)

  // Stats
  const stats = useMemo(() => {
    let memorized = 0, inProgress = 0, notStarted = 0, totalLines = 0
    for (const st of students) {
      const p = progressMap.get(`${st.id}::${text.id}`)
      const lines = p?.lines_memorized ?? 0
      totalLines += lines
      if (!p || p.status === 'not_started' || lines === 0) notStarted++
      else if (p.status === 'memorized' || lines >= text.total_lines) memorized++
      else inProgress++
    }
    const avgPct = students.length > 0 && text.total_lines > 0
      ? Math.round((totalLines / (students.length * text.total_lines)) * 100)
      : 0
    return { memorized, inProgress, notStarted, avgPct }
  }, [students, progressMap, text])

  const barColor = scoreColor(stats.avgPct)

  return (
    <div className="rounded-xl overflow-hidden"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>

      {/* Card header */}
      <button className="w-full text-right p-4" onClick={() => setExpanded(e => !e)}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              {/* Category dot */}
              <span className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: subjectColor }} />
              <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                {text.name_ar}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                style={{ background: `${subjectColor}18`, color: subjectColor }}>
                {text.subject}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded"
                style={{ background: CATEGORY_COLORS[text.category], color: 'var(--text-muted)' }}>
                {text.category}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded"
                style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' }}>
                {text.type}
              </span>
              <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                {text.total_lines} سطر · {units} مقرر
              </span>
            </div>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="flex gap-2 text-xs">
              {stats.memorized > 0 && (
                <span className="flex items-center gap-1" style={{ color: '#22c55e' }}>
                  <Check size={11} /> {stats.memorized}
                </span>
              )}
              {stats.inProgress > 0 && (
                <span className="flex items-center gap-1" style={{ color: '#6366f1' }}>
                  <BookOpen size={11} /> {stats.inProgress}
                </span>
              )}
              {stats.notStarted > 0 && (
                <span className="flex items-center gap-1" style={{ color: '#64748b' }}>
                  <Clock size={11} /> {stats.notStarted}
                </span>
              )}
            </div>
            <div className="text-right">
              <span className="text-sm font-bold" style={{ color: barColor }}>{stats.avgPct}%</span>
            </div>
            {expanded ? <ChevronUp size={14} style={{ color: 'var(--text-muted)' }} />
                      : <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />}
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <div className="h-full rounded-full transition-all duration-500"
            style={{ width: `${stats.avgPct}%`, background: barColor }} />
        </div>
      </button>

      {/* Student list */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--border-color)' }}>
          {students.length === 0 ? (
            <p className="text-sm text-center py-4" style={{ color: 'var(--text-muted)' }}>لا يوجد طلاب</p>
          ) : (
            <div>
              {students
                .sort((a, b) => {
                  const pa = progressMap.get(`${a.id}::${text.id}`)?.lines_memorized ?? 0
                  const pb = progressMap.get(`${b.id}::${text.id}`)?.lines_memorized ?? 0
                  return pa - pb
                })
                .map(st => (
                  <StudentProgressRow
                    key={st.id}
                    student={st}
                    text={text}
                    progress={progressMap.get(`${st.id}::${text.id}`)}
                    onSave={onSave}
                  />
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────────
export default function MatnPage() {
  const { profile } = useAuth()
  const isCeo = profile?.role === 'ceo' || profile?.role === 'batch_manager'
  const myBatchId = profile?.batch_id ?? null

  const [loading, setLoading] = useState(true)
  const [students, setStudents] = useState<DBStudent[]>([])
  const [batches, setBatches] = useState<DBBatch[]>([])
  const [texts, setTexts] = useState<DBText[]>([])
  const [rawProgress, setRawProgress] = useState<DBStudentTextProgress[]>([])
  const [selectedBatch, setSelectedBatch] = useState<number | 'all'>('all')
  const [selectedLevel, setSelectedLevel] = useState<number>(1)

  useEffect(() => {
    const init = async () => {
      const [s, b, t] = await Promise.all([getStudents(), getBatches(), getTexts()])
      const activeStudents = s.filter(st => st.status === 'active' || !st.status)
      setStudents(activeStudents)
      setBatches(b)
      setTexts(t)
      const ids = activeStudents.map(st => st.id)
      if (ids.length > 0) {
        const p = await getStudentTextProgress(ids).catch(() => [] as DBStudentTextProgress[])
        setRawProgress(p)
      }
      if (myBatchId) setSelectedBatch(myBatchId)
    }
    init().catch(console.error).finally(() => setLoading(false))
  }, [myBatchId])

  // Build progress lookup: "studentId::textId" → progress
  const progressMap = useMemo(() => {
    const map = new Map<string, DBStudentTextProgress>()
    for (const p of rawProgress) map.set(`${p.student_id}::${p.text_id}`, p)
    return map
  }, [rawProgress])

  const handleSave = useCallback(async (studentId: string, textId: string, lines: number) => {
    try {
      await upsertStudentTextProgress(studentId, textId, lines)
      setRawProgress(prev => {
        const key = `${studentId}::${textId}`
        const filtered = prev.filter(p => !(p.student_id === studentId && p.text_id === textId))
        const status: DBStudentTextProgress['status'] = lines === 0 ? 'not_started' : 'in_progress'
        return [...filtered, { id: key, student_id: studentId, text_id: textId,
          lines_memorized: lines, status, notes: null,
          started_at: lines > 0 ? new Date().toISOString() : null,
          completed_at: null, updated_at: new Date().toISOString() }]
      })
    } catch (err) { console.error(err) }
  }, [])

  // Visible students
  const visibleStudents = useMemo(() => {
    if (profile?.role === 'supervisor' || profile?.role === 'teacher') {
      return myBatchId ? students.filter(s => s.batch_id === myBatchId) : []
    }
    return selectedBatch === 'all' ? students : students.filter(s => s.batch_id === selectedBatch)
  }, [students, selectedBatch, profile, myBatchId])

  // Texts for selected level
  const levelTexts = useMemo(() => texts.filter(t => t.level_id === selectedLevel), [texts, selectedLevel])

  // Level summary stats (يشمل المستوى التمهيدي 0)
  const levelStats = useMemo(() => {
    return [0, 1, 2, 3, 4, 5, 6].map(lvl => {
      const lvlTexts = texts.filter(t => t.level_id === lvl)
      let totalPossible = 0, totalActual = 0
      for (const t of lvlTexts) {
        for (const st of visibleStudents) {
          totalPossible += t.total_lines
          totalActual += progressMap.get(`${st.id}::${t.id}`)?.lines_memorized ?? 0
        }
      }
      const pct = totalPossible > 0 ? Math.round((totalActual / totalPossible) * 100) : 0
      return { lvl, pct, textCount: lvlTexts.length }
    })
  }, [texts, visibleStudents, progressMap])

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh] gap-3">
      <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#6366f1' }} />
      <span className="text-sm" style={{ color: 'var(--text-muted)' }}>جاري تحميل المتون...</span>
    </div>
  )

  return (
    <div className="space-y-5 max-w-3xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <BookOpen size={20} style={{ color: '#6366f1' }} />
            رصد المتون
          </h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {visibleStudents.length} طالب · {texts.length} متن عبر ٦ مستويات
          </p>
        </div>
        {isCeo && (
          <div className="relative">
            <select value={selectedBatch === 'all' ? 'all' : String(selectedBatch)}
              onChange={e => setSelectedBatch(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="text-sm pl-7 pr-3 py-1.5 rounded-lg appearance-none outline-none"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}>
              <option value="all">كل الدفعات</option>
              {batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <ChevronDown size={12} className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: 'var(--text-muted)' }} />
          </div>
        )}
      </div>

      {/* ── Level tabs ── */}
      <div className="grid grid-cols-7 gap-1.5">
        {levelStats.map(({ lvl, pct, textCount }) => {
          const isActive = selectedLevel === lvl
          const color = scoreColor(pct)
          return (
            <button key={lvl} onClick={() => setSelectedLevel(lvl)}
              className="rounded-xl p-2.5 text-center transition-all"
              style={{
                background: isActive ? `${color}15` : 'var(--bg-card)',
                border: `1px solid ${isActive ? color + '50' : 'var(--border-color)'}`,
              }}>
              <p className="text-xs font-bold" style={{ color: isActive ? color : 'var(--text-muted)' }}>م{lvl}</p>
              <p className="text-sm font-bold mt-0.5" style={{ color: isActive ? color : 'var(--text-primary)' }}>{pct}%</p>
              <div className="mt-1 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
              </div>
              <p className="text-[9px] mt-1" style={{ color: 'var(--text-muted)' }}>{textCount} متن</p>
            </button>
          )
        })}
      </div>

      {/* ── Level title ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold" style={{ color: 'var(--text-primary)' }}>
            {LEVEL_LABELS[selectedLevel]}
          </h2>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {LEVEL_TOTALS[selectedLevel]?.toLocaleString('ar-SA')} سطر إجمالي ·{' '}
            {levelTexts.length} متن
            {selectedLevel === 3 && (
              <span className="mr-2 text-[10px] px-1.5 py-0.5 rounded"
                style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>
                ⚠️ متون ناقصة — بانتظار الإضافة
              </span>
            )}
          </p>
        </div>
        {/* Legend */}
        <div className="flex items-center gap-3 flex-wrap text-[10px]" style={{ color: 'var(--text-muted)' }}>
          {[
            { icon: Check, color: '#22c55e', label: 'أتمّ' },
            { icon: BookOpen, color: '#6366f1', label: 'جارٍ' },
            { icon: Clock, color: '#64748b', label: 'لم يبدأ' },
          ].map(({ icon: Icon, color, label }) => (
            <span key={label} className="flex items-center gap-1">
              <Icon size={10} style={{ color }} /> {label}
            </span>
          ))}
        </div>
      </div>

      {/* ── Matn cards ── */}
      {levelTexts.length === 0 ? (
        <div className="text-center py-12 rounded-xl"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <BookOpen size={32} className="mx-auto mb-2 opacity-30" style={{ color: 'var(--text-muted)' }} />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>لا توجد متون مُدخلة بعد لهذا المستوى</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>شغّل supabase-texts-migration.sql أولاً</p>
        </div>
      ) : (
        <div className="space-y-3">
          {levelTexts.map(text => (
            <MatnCard
              key={text.id}
              text={text}
              students={visibleStudents}
              progressMap={progressMap}
              onSave={handleSave}
            />
          ))}
        </div>
      )}
    </div>
  )
}
