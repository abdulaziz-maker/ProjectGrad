'use client'
/**
 * الجدول الرئيسي لتقارير الأداء — تصميم محسّن.
 *
 * الـheader = 4 صفوف منفصلة (مش nested grid):
 *   ١) المسارات (تربوي / علمي)
 *   ٢) المساقات (القرآن، السنة، ...)
 *   ٣) الأعمدة الفرعية (الحفظ / المراجعة / حضور / ...)
 *   ٤) أنواع القيم (المفترض / الفعلي / نسبة الإنجاز)
 *
 * البيانات: إدخال inline قابل للتعديل + ألوان حسب النسبة.
 */
import { useMemo } from 'react'
import { EyeOff, X } from 'lucide-react'
import type { DBStudent } from '@/lib/db'
import type {
  ReportSubject, SubjectExclusion, PerformanceEntry, EntryColumnKey,
} from '@/lib/performance/types'
import { cellKey } from '@/lib/performance/types'
import {
  TRACK_LABEL, columnsForKind, calcPercent, paletteForPercent, averagePercent,
} from '@/lib/performance/format'
import PerformanceCell from './PerformanceCell'

interface Props {
  students: DBStudent[]
  subjects: ReportSubject[]
  entries: PerformanceEntry[]
  exclusions: SubjectExclusion[]
  hiddenSubjectIds: Set<string>
  readOnly?: boolean
  canManageExclusions?: boolean
  onCellSave: (
    student_id: string,
    subject_id: string,
    column_key: EntryColumnKey,
    field: 'expected' | 'actual',
    value: number | null
  ) => Promise<void>
  onToggleHidden: (subjectId: string) => void
  onToggleExclusion: (subjectId: string, studentId: string, currentlyExcluded: boolean) => void
}

// تسمية العمود الفرعي (الحفظ/المراجعة/الحضور/...)
function subColumnLabel(s: ReportSubject, col: EntryColumnKey): string {
  if (col === 'memorization') return 'الحفظ'
  if (col === 'revision') return 'المراجعة'
  if (col === 'single') return s.single_label ?? s.name
  return s.single_label ?? 'الحضور'
}

export default function PerformanceTable({
  students, subjects, entries, exclusions,
  hiddenSubjectIds, readOnly, canManageExclusions,
  onCellSave, onToggleHidden, onToggleExclusion,
}: Props) {
  const entriesMap = useMemo(() => {
    const m = new Map<string, PerformanceEntry>()
    for (const e of entries) m.set(cellKey(e.student_id, e.subject_id, e.column_key), e)
    return m
  }, [entries])

  const exclusionSet = useMemo(() => {
    const s = new Set<string>()
    for (const x of exclusions) s.add(`${x.subject_id}:${x.student_id}`)
    return s
  }, [exclusions])

  const visibleSubjects = useMemo(
    () => subjects.filter(s => !hiddenSubjectIds.has(s.id)),
    [subjects, hiddenSubjectIds]
  )
  const academicSubs    = useMemo(() => visibleSubjects.filter(s => s.track === 'academic'),    [visibleSubjects])
  const educationalSubs = useMemo(() => visibleSubjects.filter(s => s.track === 'educational'), [visibleSubjects])

  // عدد الأعمدة الفرعية لكل مساق (حفظ ومراجعة = 2، single/attendance = 1)
  const subSubCount  = (s: ReportSubject) => columnsForKind(s.columns_kind).length
  const subjectCells = (s: ReportSubject) => subSubCount(s) * 3 // x3: مفترض/فعلي/نسبة

  const trackTotalCells = (subs: ReportSubject[]) =>
    subs.reduce((acc, s) => acc + subjectCells(s), 0) + (subs.length > 0 ? 1 : 0) // +1 لـنسبة المساق

  // ─── حسابات النسب ─────────────────────
  const studentSubjectPct = (studentId: string, subj: ReportSubject): number | null => {
    if (exclusionSet.has(`${subj.id}:${studentId}`)) return null
    const cols = columnsForKind(subj.columns_kind)
    const pcts = cols.map(c => {
      const e = entriesMap.get(cellKey(studentId, subj.id, c))
      return calcPercent(e?.expected, e?.actual)
    })
    return averagePercent(pcts)
  }
  const studentTrackPct = (studentId: string, subs: ReportSubject[]): number | null =>
    averagePercent(subs.map(s => studentSubjectPct(studentId, s)))
  const studentTotalPct = (studentId: string): number | null =>
    averagePercent([studentTrackPct(studentId, academicSubs), studentTrackPct(studentId, educationalSubs)])

  if (students.length === 0) {
    return <div className="card-static p-8 text-center text-[var(--text-muted)]">لا يوجد طلاب لعرضهم.</div>
  }
  if (visibleSubjects.length === 0) {
    return <div className="card-static p-8 text-center text-[var(--text-muted)]">لا توجد مساقات مفعّلة.</div>
  }

  // ── الترتيب: التربوي ثم العلمي (بنفس ترتيب الصورة الأصلية) ─
  const orderedSubs = [...educationalSubs, ...academicSubs]

  // ─── ألوان موحّدة ─────────────────────
  const headerBgTrack       = (t: 'academic' | 'educational') =>
    t === 'academic' ? '#356B6E' : '#5D4256'
  const headerBgSubject     = (t: 'academic' | 'educational') =>
    t === 'academic' ? 'rgba(53,107,110,0.10)' : 'rgba(93,66,86,0.10)'
  const headerBgSubColumn   = 'var(--bg-subtle)'
  const headerBgValueType   = 'var(--bg-elevated)'

  return (
    <div className="overflow-x-auto rounded-2xl border" style={{ borderColor: 'var(--border-color)' }}>
      <table className="border-collapse text-xs" style={{ width: '100%', direction: 'rtl', tableLayout: 'auto' }}>
        {/* ════════════ HEADER (4 صفوف) ════════════ */}
        <thead>
          {/* ── صف ١: المسارات ── */}
          <tr>
            <th
              rowSpan={4}
              className="sticky right-0 z-30 px-3 py-2 font-bold border"
              style={{
                background: 'var(--accent-warm)',
                color: '#fff',
                borderColor: 'var(--border-color)',
                minWidth: 180,
                boxShadow: '2px 0 4px rgba(0,0,0,0.06)',
              }}
            >
              الطالب
            </th>
            {educationalSubs.length > 0 && (
              <th
                colSpan={trackTotalCells(educationalSubs)}
                className="px-2 py-2 font-bold border text-center text-[13px]"
                style={{ background: headerBgTrack('educational'), color: '#fff', borderColor: 'var(--border-color)' }}
              >
                {TRACK_LABEL.educational}
              </th>
            )}
            {academicSubs.length > 0 && (
              <th
                colSpan={trackTotalCells(academicSubs)}
                className="px-2 py-2 font-bold border text-center text-[13px]"
                style={{ background: headerBgTrack('academic'), color: '#fff', borderColor: 'var(--border-color)' }}
              >
                {TRACK_LABEL.academic}
              </th>
            )}
            <th
              rowSpan={4}
              className="px-3 py-2 font-bold border text-center"
              style={{
                background: '#FFE7D6', color: '#8B2F23',
                borderColor: 'var(--border-color)', minWidth: 90,
              }}
            >
              نسبة إنجاز الطالب
            </th>
          </tr>

          {/* ── صف ٢: المساقات ── */}
          <tr>
            {orderedSubs.map(s => (
              <th
                key={s.id}
                colSpan={subjectCells(s)}
                className="px-2 py-1.5 border text-center font-bold relative group"
                style={{
                  background: headerBgSubject(s.track),
                  color: 'var(--text-primary)',
                  borderColor: 'var(--border-color)',
                }}
              >
                <span className="inline-flex items-center gap-1.5 justify-center">
                  <span>{s.name}</span>
                  {s.unit && (
                    <span className="text-[9px] font-normal opacity-60">({s.unit})</span>
                  )}
                  <button
                    type="button"
                    onClick={() => onToggleHidden(s.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-black/10"
                    title="إخفاء هذا المساق"
                  >
                    <EyeOff className="w-3 h-3" />
                  </button>
                </span>
              </th>
            ))}
            {/* عمود "نسبة المساق" — يتوسّط صفين ٢+٣ */}
            {educationalSubs.length > 0 && (
              <th rowSpan={2} className="border text-center font-bold text-[10px]"
                style={{ background: 'rgba(93,66,86,0.18)', color: '#4A2F44', borderColor: 'var(--border-color)', minWidth: 36, padding: '4px 2px' }}>
                <div style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', display: 'inline-block' }}>
                  نسبة المساق
                </div>
              </th>
            )}
            {academicSubs.length > 0 && (
              <th rowSpan={2} className="border text-center font-bold text-[10px]"
                style={{ background: 'rgba(53,107,110,0.18)', color: '#1F4F52', borderColor: 'var(--border-color)', minWidth: 36, padding: '4px 2px' }}>
                <div style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', display: 'inline-block' }}>
                  نسبة المساق
                </div>
              </th>
            )}
          </tr>

          {/* ── صف ٣: الأعمدة الفرعية (الحفظ/المراجعة/حضور/...) ── */}
          <tr>
            {orderedSubs.flatMap(s => {
              const cols = columnsForKind(s.columns_kind)
              return cols.map(col => (
                <th
                  key={`${s.id}-${col}`}
                  colSpan={3}
                  className="px-1 py-1 border text-center font-semibold text-[11px]"
                  style={{
                    background: headerBgSubColumn,
                    color: 'var(--text-secondary)',
                    borderColor: 'var(--border-color)',
                  }}
                >
                  {subColumnLabel(s, col)}
                </th>
              ))
            })}
          </tr>

          {/* ── صف ٤: المفترض/الفعلي/نسبة ── */}
          <tr>
            {orderedSubs.flatMap(s => {
              const cols = columnsForKind(s.columns_kind)
              return cols.flatMap(col => ([
                <th key={`${s.id}-${col}-mf`} className="px-1 py-1 border text-center text-[10px] font-semibold"
                  style={{ background: headerBgValueType, color: 'var(--text-muted)', borderColor: 'var(--border-color)', minWidth: 52 }}>
                  المفترض
                </th>,
                <th key={`${s.id}-${col}-fa`} className="px-1 py-1 border text-center text-[10px] font-semibold"
                  style={{ background: headerBgValueType, color: 'var(--text-muted)', borderColor: 'var(--border-color)', minWidth: 52 }}>
                  الفعلي
                </th>,
                <th key={`${s.id}-${col}-pc`} className="px-1 py-1 border text-center text-[10px] font-bold"
                  style={{ background: 'rgba(192,138,72,0.18)', color: '#8B5A1E', borderColor: 'var(--border-color)', minWidth: 44 }}>
                  ٪
                </th>,
              ]))
            })}
          </tr>
        </thead>

        {/* ════════════ BODY ════════════ */}
        <tbody>
          {students.map((st, rowIdx) => {
            const totalPct  = studentTotalPct(st.id)
            const totalPal  = paletteForPercent(totalPct)
            const eduPct    = studentTrackPct(st.id, educationalSubs)
            const acaPct    = studentTrackPct(st.id, academicSubs)
            const rowBg     = rowIdx % 2 === 0 ? 'var(--bg-card, #fff)' : 'var(--bg-subtle)'

            return (
              <tr key={st.id}>
                {/* اسم الطالب — sticky */}
                <td
                  className="sticky right-0 z-10 px-3 py-2 font-semibold border text-[13px]"
                  style={{
                    background: rowBg, borderColor: 'var(--border-color)',
                    color: 'var(--text-primary)',
                    boxShadow: '2px 0 4px rgba(0,0,0,0.06)',
                  }}
                >
                  {st.name}
                </td>

                {/* الأعمدة لكل مساق في المسار التربوي ثم العلمي */}
                {educationalSubs.map(s => (
                  <SubjectCells
                    key={s.id}
                    student={st}
                    subject={s}
                    rowBg={rowBg}
                    entriesMap={entriesMap}
                    excluded={exclusionSet.has(`${s.id}:${st.id}`)}
                    readOnly={readOnly}
                    canManageExclusions={canManageExclusions}
                    onSave={onCellSave}
                    onToggleExclusion={onToggleExclusion}
                  />
                ))}
                {educationalSubs.length > 0 && <PctTotalCell value={eduPct} />}

                {academicSubs.map(s => (
                  <SubjectCells
                    key={s.id}
                    student={st}
                    subject={s}
                    rowBg={rowBg}
                    entriesMap={entriesMap}
                    excluded={exclusionSet.has(`${s.id}:${st.id}`)}
                    readOnly={readOnly}
                    canManageExclusions={canManageExclusions}
                    onSave={onCellSave}
                    onToggleExclusion={onToggleExclusion}
                  />
                ))}
                {academicSubs.length > 0 && <PctTotalCell value={acaPct} />}

                {/* نسبة الطالب الكلية */}
                <td
                  className="px-3 py-1.5 border text-center font-bold text-[13px]"
                  style={{
                    background: totalPal?.bg ?? 'var(--bg-subtle)',
                    color: totalPal?.text ?? 'var(--text-muted)',
                    borderColor: 'var(--border-color)',
                  }}
                >
                  {totalPct != null ? `${totalPct}%` : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// خلايا مساق لطالب واحد (يتعامل مع dual/single/attendance + الاستثناء)
// ═══════════════════════════════════════════════════════════════════════
function SubjectCells({
  student, subject, rowBg, entriesMap, excluded, readOnly, canManageExclusions, onSave, onToggleExclusion,
}: {
  student: DBStudent
  subject: ReportSubject
  rowBg: string
  entriesMap: Map<string, PerformanceEntry>
  excluded: boolean
  readOnly?: boolean
  canManageExclusions?: boolean
  onSave: (s: string, sub: string, c: EntryColumnKey, field: 'expected' | 'actual', v: number | null) => Promise<void>
  onToggleExclusion: (subId: string, studentId: string, currentlyExcluded: boolean) => void
}) {
  const cols = columnsForKind(subject.columns_kind)

  if (excluded) {
    return (
      <td
        colSpan={cols.length * 3}
        className="border text-center text-[11px] font-medium relative group"
        style={{
          background: 'repeating-linear-gradient(45deg, var(--bg-subtle), var(--bg-subtle) 6px, rgba(0,0,0,0.03) 6px, rgba(0,0,0,0.03) 12px)',
          color: 'var(--text-muted)',
          borderColor: 'var(--border-color)',
        }}
      >
        <span className="opacity-70">— مستثنى —</span>
        {canManageExclusions && (
          <button
            type="button"
            onClick={() => onToggleExclusion(subject.id, student.id, true)}
            className="opacity-0 group-hover:opacity-100 mr-2 text-[10px] font-bold underline text-[var(--accent-warm)]"
          >
            إعادة إدراج
          </button>
        )}
      </td>
    )
  }

  return (
    <>
      {cols.map((col, idx) => {
        const e = entriesMap.get(cellKey(student.id, subject.id, col))
        const exp = e?.expected ?? null
        const act = e?.actual ?? null
        const pct = calcPercent(exp, act)
        const palette = paletteForPercent(pct)
        const isFirstCol = idx === 0
        return (
          <ColumnTrio
            key={col}
            studentId={student.id}
            subjectId={subject.id}
            col={col}
            expected={exp}
            actual={act}
            pct={pct}
            palette={palette}
            rowBg={rowBg}
            readOnly={readOnly}
            canManageExclusions={canManageExclusions && isFirstCol}
            onSave={onSave}
            onExclude={() => onToggleExclusion(subject.id, student.id, false)}
          />
        )
      })}
    </>
  )
}

function ColumnTrio({
  studentId, subjectId, col, expected, actual, pct, palette, rowBg,
  readOnly, canManageExclusions, onSave, onExclude,
}: {
  studentId: string; subjectId: string; col: EntryColumnKey
  expected: number | null; actual: number | null; pct: number | null
  palette: { bg: string; text: string } | null
  rowBg: string
  readOnly?: boolean; canManageExclusions?: boolean
  onSave: (s: string, sub: string, c: EntryColumnKey, field: 'expected' | 'actual', v: number | null) => Promise<void>
  onExclude: () => void
}) {
  const baseStyle: React.CSSProperties = { borderColor: 'var(--border-color)', background: rowBg }
  return (
    <>
      <td className="border p-0.5" style={baseStyle}>
        <PerformanceCell
          value={expected}
          readOnly={readOnly}
          variant="expected"
          onSave={(v) => onSave(studentId, subjectId, col, 'expected', v)}
        />
      </td>
      <td className="border p-0.5 relative group" style={baseStyle}>
        <PerformanceCell
          value={actual}
          readOnly={readOnly}
          variant="actual"
          onSave={(v) => onSave(studentId, subjectId, col, 'actual', v)}
        />
        {canManageExclusions && (
          <button
            type="button"
            onClick={onExclude}
            className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-rose-100"
            title="استثناء الطالب من هذا المساق"
          >
            <X className="w-2.5 h-2.5 text-rose-600" />
          </button>
        )}
      </td>
      <td
        className="border text-center text-[11px] font-bold p-1"
        style={{
          borderColor: 'var(--border-color)',
          background: palette?.bg ?? 'var(--bg-subtle)',
          color: palette?.text ?? 'var(--text-muted)',
          minWidth: 44,
        }}
      >
        {pct != null ? `${pct}%` : '—'}
      </td>
    </>
  )
}

function PctTotalCell({ value }: { value: number | null }) {
  const p = paletteForPercent(value)
  return (
    <td
      className="border text-center font-bold text-[12px] p-1"
      style={{
        borderColor: 'var(--border-color)',
        background: p?.bg ?? 'var(--bg-subtle)',
        color: p?.text ?? 'var(--text-muted)',
        minWidth: 50,
      }}
    >
      {value != null ? `${value}%` : '—'}
    </td>
  )
}
