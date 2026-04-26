'use client'
/**
 * الجدول الرئيسي لتقارير الأداء — يحاكي تصميم Google Sheets الأصلي.
 *
 * التركيب:
 *   - رأس مكوّن من 3 صفوف: المسار → المساق → (المفترض/الفعلي/نسبة الإنجاز)
 *   - صف لكل طالب
 *   - خلايا قابلة للتعديل inline تحفظ تلقائياً
 *   - ألوان تلقائية حسب نسبة الإنجاز
 *   - استثناء طالب من مساق → خلية رمادية + رمز "—"
 *   - أعمدة مخفية (بـtoggle) → لا تُعرض إطلاقاً
 *   - عمود "نسبة إنجاز الطالب" في النهاية = متوسط جميع المسارات
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
  hiddenSubjectIds: Set<string>            // مخفية أثناء التصفح (localStorage)
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

export default function PerformanceTable({
  students, subjects, entries, exclusions,
  hiddenSubjectIds, readOnly, canManageExclusions,
  onCellSave, onToggleHidden, onToggleExclusion,
}: Props) {
  // فهرس سريع للقيم
  const entriesMap = useMemo(() => {
    const m = new Map<string, PerformanceEntry>()
    for (const e of entries) m.set(cellKey(e.student_id, e.subject_id, e.column_key), e)
    return m
  }, [entries])

  // فهرس الاستثناءات
  const exclusionSet = useMemo(() => {
    const s = new Set<string>()
    for (const x of exclusions) s.add(`${x.subject_id}:${x.student_id}`)
    return s
  }, [exclusions])

  // المساقات الظاهرة فقط (مفلترة وفق hidden)
  const visibleSubjects = useMemo(
    () => subjects.filter(s => !hiddenSubjectIds.has(s.id)),
    [subjects, hiddenSubjectIds]
  )

  // تجميع المساقات حسب المسار
  const academicSubs = useMemo(
    () => visibleSubjects.filter(s => s.track === 'academic'),
    [visibleSubjects]
  )
  const educationalSubs = useMemo(
    () => visibleSubjects.filter(s => s.track === 'educational'),
    [visibleSubjects]
  )

  // عدد أعمدة كل مساق (3 لـdual×3=9 لاحقاً سنحسبها من جانب آخر)
  // كل مساق له: عدد أعمدة الكميّة (1 أو 2) × 3 (مفترض/فعلي/نسبة) + بعض المساقات لها عمود إضافي "نسبة إنجاز المساق"
  const subjectColCount = (s: ReportSubject) => columnsForKind(s.columns_kind).length * 3
  const trackColCount = (subs: ReportSubject[]) =>
    subs.reduce((acc, s) => acc + subjectColCount(s), 0) + (subs.length > 0 ? 1 : 0) // +1 لـ"نسبة المساق"

  // حسابات النسب
  const studentSubjectPct = (studentId: string, subj: ReportSubject): number | null => {
    if (exclusionSet.has(`${subj.id}:${studentId}`)) return null
    const cols = columnsForKind(subj.columns_kind)
    const pcts = cols.map(c => {
      const e = entriesMap.get(cellKey(studentId, subj.id, c))
      return calcPercent(e?.expected, e?.actual)
    })
    return averagePercent(pcts)
  }

  const studentTrackPct = (studentId: string, subs: ReportSubject[]): number | null => {
    return averagePercent(subs.map(s => studentSubjectPct(studentId, s)))
  }

  const studentTotalPct = (studentId: string): number | null => {
    return averagePercent([
      studentTrackPct(studentId, academicSubs),
      studentTrackPct(studentId, educationalSubs),
    ])
  }

  if (students.length === 0) {
    return (
      <div className="card-static p-8 text-center text-[var(--text-muted)]">
        لا يوجد طلاب لعرضهم.
      </div>
    )
  }

  if (visibleSubjects.length === 0) {
    return (
      <div className="card-static p-8 text-center text-[var(--text-muted)]">
        لا توجد مساقات مفعّلة. أضف مساقات أو أظهر المخفية.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-2xl border" style={{ borderColor: 'var(--border-soft)' }}>
      <table className="border-collapse text-xs" style={{ width: '100%', direction: 'rtl' }}>
        {/* ── رأس الجدول: 3 صفوف ── */}
        <thead>
          {/* الصف ١: المسارات */}
          <tr>
            <th
              rowSpan={3}
              className="sticky right-0 z-20 px-3 py-2 font-bold border"
              style={{ background: 'var(--accent-warm)', color: '#fff', borderColor: 'var(--border-color)', minWidth: 180 }}
            >
              الطالب
            </th>
            {educationalSubs.length > 0 && (
              <th
                colSpan={trackColCount(educationalSubs)}
                className="px-2 py-1.5 font-bold border text-center"
                style={{ background: '#5D4256', color: '#fff', borderColor: 'var(--border-color)' }}
              >
                {TRACK_LABEL.educational}
              </th>
            )}
            {academicSubs.length > 0 && (
              <th
                colSpan={trackColCount(academicSubs)}
                className="px-2 py-1.5 font-bold border text-center"
                style={{ background: '#356B6E', color: '#fff', borderColor: 'var(--border-color)' }}
              >
                {TRACK_LABEL.academic}
              </th>
            )}
            <th
              rowSpan={3}
              className="px-3 py-2 font-bold border text-center"
              style={{ background: '#FFE7D6', color: '#8B2F23', borderColor: 'var(--border-color)', minWidth: 90 }}
            >
              نسبة إنجاز الطالب
            </th>
          </tr>

          {/* الصف ٢: المساقات */}
          <tr>
            {[...educationalSubs, ...academicSubs].map(s => (
              <SubjectHeader
                key={s.id}
                subject={s}
                onHide={() => onToggleHidden(s.id)}
                colSpan={subjectColCount(s)}
              />
            ))}
            {/* عمود "نسبة المساق" لكل مسار — placeholder header */}
            {educationalSubs.length > 0 && (
              <th rowSpan={2} className="px-2 py-1 border text-center font-bold" style={trackPctHeaderStyle('educational')}>
                نسبة المساق
              </th>
            )}
            {academicSubs.length > 0 && (
              <th rowSpan={2} className="px-2 py-1 border text-center font-bold" style={trackPctHeaderStyle('academic')}>
                نسبة المساق
              </th>
            )}
          </tr>

          {/* الصف ٣: المفترض / الفعلي / نسبة الإنجاز */}
          <tr>
            {[...educationalSubs, ...academicSubs].flatMap(s => {
              const cols = columnsForKind(s.columns_kind)
              return cols.flatMap(col => ([
                <th key={`${s.id}-${col}-mf`} className="px-1 py-1 border text-center text-[10px]" style={subHeaderStyle()}>المفترض</th>,
                <th key={`${s.id}-${col}-fa`} className="px-1 py-1 border text-center text-[10px]" style={subHeaderStyle()}>الفعلي</th>,
                <th key={`${s.id}-${col}-pc`} className="px-1 py-1 border text-center text-[10px]" style={pctHeaderStyle()}>نسبة الإنجاز</th>,
              ]))
            })}
          </tr>
        </thead>

        {/* ── جسم الجدول ── */}
        <tbody>
          {students.map((st, rowIdx) => {
            const totalPct = studentTotalPct(st.id)
            const totalPalette = paletteForPercent(totalPct)
            const eduTrackPct = studentTrackPct(st.id, educationalSubs)
            const acaTrackPct = studentTrackPct(st.id, academicSubs)

            return (
              <tr key={st.id} style={{ background: rowIdx % 2 === 0 ? 'var(--bg-card, #fff)' : 'var(--bg-subtle)' }}>
                {/* اسم الطالب — مثبّت على اليمين */}
                <td
                  className="sticky right-0 px-3 py-1.5 font-semibold border"
                  style={{
                    background: rowIdx % 2 === 0 ? 'var(--bg-card, #fff)' : 'var(--bg-subtle)',
                    borderColor: 'var(--border-color)',
                    color: 'var(--text-primary)',
                  }}
                >
                  {st.name}
                </td>

                {/* خلايا المسار التربوي */}
                {educationalSubs.map(s => (
                  <SubjectCells
                    key={s.id}
                    student={st}
                    subject={s}
                    entriesMap={entriesMap}
                    excluded={exclusionSet.has(`${s.id}:${st.id}`)}
                    readOnly={readOnly}
                    canManageExclusions={canManageExclusions}
                    onSave={onCellSave}
                    onToggleExclusion={onToggleExclusion}
                  />
                ))}
                {educationalSubs.length > 0 && (
                  <PctTotalCell value={eduTrackPct} />
                )}

                {/* خلايا المسار العلمي */}
                {academicSubs.map(s => (
                  <SubjectCells
                    key={s.id}
                    student={st}
                    subject={s}
                    entriesMap={entriesMap}
                    excluded={exclusionSet.has(`${s.id}:${st.id}`)}
                    readOnly={readOnly}
                    canManageExclusions={canManageExclusions}
                    onSave={onCellSave}
                    onToggleExclusion={onToggleExclusion}
                  />
                ))}
                {academicSubs.length > 0 && (
                  <PctTotalCell value={acaTrackPct} />
                )}

                {/* نسبة إنجاز الطالب الكلية */}
                <td
                  className="px-3 py-1.5 border text-center font-bold"
                  style={{
                    background: totalPalette?.bg ?? 'var(--bg-subtle)',
                    color: totalPalette?.text ?? 'var(--text-muted)',
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
// رأس مساق مع زر إخفاء
// ═══════════════════════════════════════════════════════════════════════
function SubjectHeader({ subject, onHide, colSpan }: {
  subject: ReportSubject; onHide: () => void; colSpan: number
}) {
  const isAttendance = subject.columns_kind === 'attendance'
  const isSingle = subject.columns_kind === 'single'
  return (
    <th
      colSpan={colSpan}
      className="px-2 py-1.5 border text-center font-bold relative group"
      style={{
        background: subject.track === 'academic' ? 'rgba(53,107,110,0.08)' : 'rgba(93,66,86,0.08)',
        color: 'var(--text-primary)',
        borderColor: 'var(--border-color)',
      }}
    >
      <div className="inline-flex items-center gap-1.5 justify-center">
        <span>{subject.name}</span>
        {(isAttendance || isSingle) && subject.unit && (
          <span className="text-[9px] opacity-60">({subject.unit})</span>
        )}
        <button
          type="button"
          onClick={onHide}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-black/10"
          title="إخفاء هذا المساق"
        >
          <EyeOff className="w-3 h-3" />
        </button>
      </div>
      {/* صف فرعي للأعمدة (الحفظ/المراجعة) في dual */}
      {subject.columns_kind === 'dual' && (
        <div className="grid grid-cols-2 gap-0 mt-1 -mx-2 -mb-1.5 border-t" style={{ borderColor: 'var(--border-soft)' }}>
          <div className="py-1 text-[10px] font-semibold border-l" style={{ borderColor: 'var(--border-soft)' }}>المراجعة</div>
          <div className="py-1 text-[10px] font-semibold">الحفظ</div>
        </div>
      )}
    </th>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// خلايا مساق لطالب — تتوسّع حسب dual/single/attendance
// ═══════════════════════════════════════════════════════════════════════
function SubjectCells({
  student, subject, entriesMap, excluded, readOnly, canManageExclusions, onSave, onToggleExclusion,
}: {
  student: DBStudent
  subject: ReportSubject
  entriesMap: Map<string, PerformanceEntry>
  excluded: boolean
  readOnly?: boolean
  canManageExclusions?: boolean
  onSave: (s: string, sub: string, col: EntryColumnKey, field: 'expected' | 'actual', v: number | null) => Promise<void>
  onToggleExclusion: (subId: string, studentId: string, currentlyExcluded: boolean) => void
}) {
  const cols = columnsForKind(subject.columns_kind)

  if (excluded) {
    // خلية رمادية واحدة بدل كل أعمدة المساق
    return (
      <td
        colSpan={cols.length * 3}
        className="border text-center text-[10px] font-medium relative group"
        style={{ background: 'var(--bg-subtle)', color: 'var(--text-muted)', borderColor: 'var(--border-color)' }}
      >
        <span>— مستثنى —</span>
        {canManageExclusions && (
          <button
            type="button"
            onClick={() => onToggleExclusion(subject.id, student.id, true)}
            className="opacity-0 group-hover:opacity-100 ml-1 text-[9px] underline"
          >
            إعادة
          </button>
        )}
      </td>
    )
  }

  return (
    <>
      {cols.map(col => {
        const e = entriesMap.get(cellKey(student.id, subject.id, col))
        const exp = e?.expected ?? null
        const act = e?.actual ?? null
        const pct = calcPercent(exp, act)
        const palette = paletteForPercent(pct)
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
            readOnly={readOnly}
            canManageExclusions={canManageExclusions}
            onSave={onSave}
            onExclude={() => onToggleExclusion(subject.id, student.id, false)}
          />
        )
      })}
    </>
  )
}

function ColumnTrio({
  studentId, subjectId, col, expected, actual, pct, palette, readOnly, canManageExclusions, onSave, onExclude,
}: {
  studentId: string; subjectId: string; col: EntryColumnKey
  expected: number | null; actual: number | null; pct: number | null
  palette: { bg: string; text: string } | null
  readOnly?: boolean; canManageExclusions?: boolean
  onSave: (s: string, sub: string, c: EntryColumnKey, field: 'expected' | 'actual', v: number | null) => Promise<void>
  onExclude: () => void
}) {
  return (
    <>
      <td className="border p-0.5" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-card, #fff)' }}>
        <PerformanceCell value={expected} readOnly={readOnly}
          onSave={(v) => onSave(studentId, subjectId, col, 'expected', v)} />
      </td>
      <td className="border p-0.5 relative group" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-card, #fff)' }}>
        <PerformanceCell value={actual} readOnly={readOnly}
          onSave={(v) => onSave(studentId, subjectId, col, 'actual', v)} />
        {canManageExclusions && col === 'memorization' && (
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
        className="border text-center text-[11px] font-bold p-0.5"
        style={{
          borderColor: 'var(--border-color)',
          background: palette?.bg ?? 'var(--bg-subtle)',
          color: palette?.text ?? 'var(--text-muted)',
          minWidth: 42,
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
      className="border text-center font-bold text-[11px] p-1"
      style={{
        borderColor: 'var(--border-color)',
        background: p?.bg ?? 'var(--bg-subtle)',
        color: p?.text ?? 'var(--text-muted)',
        minWidth: 60,
      }}
    >
      {value != null ? `${value}%` : '—'}
    </td>
  )
}

function trackPctHeaderStyle(track: 'academic' | 'educational'): React.CSSProperties {
  return {
    background: track === 'academic' ? 'rgba(53,107,110,0.18)' : 'rgba(93,66,86,0.18)',
    color: track === 'academic' ? '#1F4F52' : '#4A2F44',
    borderColor: 'var(--border-color)',
    writingMode: 'vertical-rl',
    minWidth: 28,
    fontSize: 10,
  }
}

function subHeaderStyle(): React.CSSProperties {
  return {
    background: 'var(--bg-subtle)',
    color: 'var(--text-muted)',
    borderColor: 'var(--border-color)',
  }
}

function pctHeaderStyle(): React.CSSProperties {
  return {
    background: 'rgba(192,138,72,0.10)',
    color: '#8B5A1E',
    borderColor: 'var(--border-color)',
    fontWeight: 700,
  }
}
