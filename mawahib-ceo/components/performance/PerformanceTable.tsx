'use client'
/**
 * الجدول الرئيسي — مبني على CSS Grid (لا يستخدم <table>) لأداء الـsticky.
 *
 * الترتيب من اليمين لليسار:
 *   ┌──────────┬──────────────────────────────┬──────────┐
 *   │ الطالب   │ مساق ١ │ مساق ٢ │ ... │ Σ مسار │ نسبة     │
 *   │ (sticky) │                              │ الإنجاز  │
 *   └──────────┴──────────────────────────────┴──────────┘
 *
 * كل "مساق" في الـgrid يساوي عمود واحد. المساقات الـdual تنقسم
 * إلى عمودين منفصلين (حفظ + مراجعة) — أبسط بصرياً من نesting.
 *
 * Track aggregate column في نهاية كل مسار يعرض نسبة المسار.
 * Overall column في النهاية (sticky) يعرض ProgressRing.
 */
import { useMemo } from 'react'
import type { DBStudent } from '@/lib/db'
import type {
  ReportSubject, SubjectExclusion, PerformanceEntry, EntryColumnKey,
} from '@/lib/performance/types'
import { cellKey } from '@/lib/performance/types'
import { columnsForKind, calcPercent, averagePercent } from '@/lib/performance/format'
import PerfCell from './PerformanceCell'
import PctBadge, { type Thresholds } from './PctBadge'
import ProgressRing from './ProgressRing'

interface FlatColumn {
  /** key مركب: subjectId:columnKey — للـcrud */
  id: string
  subject: ReportSubject
  columnKey: EntryColumnKey
  /** التسمية: "حفظ" / "مراجعة" / single_label / "الحضور" */
  label: string
}

interface Props {
  students: DBStudent[]
  subjects: ReportSubject[]   // مرتّبة (تربوي → علمي)
  entries: PerformanceEntry[]
  exclusions: SubjectExclusion[]
  hiddenSubjectIds: Set<string>
  thresholds: Thresholds
  density: 'compact' | 'medium' | 'cozy'
  readOnly?: boolean
  editPlannedMode?: boolean
  onCellSave: (
    student_id: string, subject_id: string, column_key: EntryColumnKey,
    field: 'expected' | 'actual', value: number | null
  ) => Promise<void>
  onOpenStudent?: (studentId: string) => void
}

const TRACK_COLOR = {
  educational: '#5D4256',  // plum
  academic:    '#356B6E',  // teal
} as const

const TRACK_LABEL = {
  educational: 'المسار التربوي',
  academic:    'المسار العلمي',
} as const

function flattenColumns(subjects: ReportSubject[], hidden: Set<string>): FlatColumn[] {
  const out: FlatColumn[] = []
  for (const s of subjects) {
    if (hidden.has(s.id)) continue
    const cols = columnsForKind(s.columns_kind)
    for (const col of cols) {
      let label = ''
      if (col === 'memorization') label = `${s.name} · حفظ`
      else if (col === 'revision') label = `${s.name} · مراجعة`
      else if (col === 'single')   label = s.single_label || s.name
      else                         label = s.name
      out.push({
        id: `${s.id}:${col}`,
        subject: s,
        columnKey: col,
        label,
      })
    }
  }
  return out
}

export default function PerformanceTable({
  students, subjects, entries, exclusions,
  hiddenSubjectIds, thresholds, density,
  readOnly, editPlannedMode,
  onCellSave, onOpenStudent,
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

  // المسارات بترتيب: تربوي أولاً ثم علمي (حسب التصميم)
  const eduSubs = useMemo(() => subjects.filter(s => s.track === 'educational'), [subjects])
  const acaSubs = useMemo(() => subjects.filter(s => s.track === 'academic'),    [subjects])

  const eduCols = useMemo(() => flattenColumns(eduSubs, hiddenSubjectIds), [eduSubs, hiddenSubjectIds])
  const acaCols = useMemo(() => flattenColumns(acaSubs, hiddenSubjectIds), [acaSubs, hiddenSubjectIds])

  // ─── حسابات النسب ─────────────────────
  const colPct = (studentId: string, c: FlatColumn): number | null => {
    if (exclusionSet.has(`${c.subject.id}:${studentId}`)) return null
    const e = entriesMap.get(cellKey(studentId, c.subject.id, c.columnKey))
    return calcPercent(e?.expected, e?.actual)
  }
  const trackPct = (studentId: string, cols: FlatColumn[]): number | null =>
    averagePercent(cols.map(c => colPct(studentId, c)))
  const overallPct = (studentId: string): number | null =>
    averagePercent([trackPct(studentId, eduCols), trackPct(studentId, acaCols)])

  // ─── أبعاد ─────────────────────
  const rowH = density === 'compact' ? 56 : density === 'medium' ? 72 : 90
  const cellW = density === 'compact' ? 86 : density === 'medium' ? 100 : 116
  const aggregateW = 80
  const studentColW = 220
  const overallColW = 110

  if (students.length === 0) {
    return <div className="card-static p-8 text-center text-[var(--text-muted)]">لا يوجد طلاب لعرضهم.</div>
  }
  if (eduCols.length === 0 && acaCols.length === 0) {
    return <div className="card-static p-8 text-center text-[var(--text-muted)]">لا توجد مساقات مفعّلة. اضغط "إدارة المساقات".</div>
  }

  // إنشاء grid-template-columns:
  // [الطالب] [أعمدة التربوي] [Σ تربوي] [أعمدة العلمي] [Σ علمي] [نسبة الإنجاز]
  const gridTemplate = [
    `${studentColW}px`,
    ...eduCols.map(() => `${cellW}px`),
    eduCols.length > 0 ? `${aggregateW}px` : '',
    ...acaCols.map(() => `${cellW}px`),
    acaCols.length > 0 ? `${aggregateW}px` : '',
    `${overallColW}px`,
  ].filter(Boolean).join(' ')

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: 'var(--bg-card, #fff)',
        border: '1px solid var(--border-color)',
        boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
      }}
    >
      <div style={{ position: 'relative', overflowX: 'auto', direction: 'rtl' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: gridTemplate,
            minWidth: studentColW + overallColW + (eduCols.length + acaCols.length) * cellW + (eduCols.length > 0 ? aggregateW : 0) + (acaCols.length > 0 ? aggregateW : 0),
          }}
        >
          {/* ══════════ HEADER ROW 1 — track groups ══════════ */}
          {/* الطالب — span across rows 1+2 */}
          <div
            style={{
              position: 'sticky', right: 0, zIndex: 20,
              background: 'var(--bg-subtle)',
              borderBottom: '1px solid var(--border-color)',
              borderLeft: '1px solid var(--border-color)',
              padding: '14px 16px',
              display: 'flex', alignItems: 'center',
              gridRow: 'span 2',
              fontFamily: 'var(--font-noto-kufi), sans-serif',
              fontSize: 12, fontWeight: 700,
              color: 'var(--text-muted)', letterSpacing: '0.06em',
            }}
          >
            الطالب
          </div>

          {/* المسار التربوي header */}
          {eduCols.length > 0 && (
            <div
              style={{
                gridColumn: `span ${eduCols.length + 1}`,
                background: `linear-gradient(180deg, ${TRACK_COLOR.educational}18, ${TRACK_COLOR.educational}05)`,
                borderBottom: '1px solid var(--border-color)',
                borderLeft: '1px solid var(--border-color)',
                padding: '14px 12px 8px',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: 4,
              }}
            >
              <div style={{
                fontFamily: 'var(--font-noto-kufi), sans-serif',
                fontSize: 14, fontWeight: 700,
                color: TRACK_COLOR.educational, letterSpacing: '-0.01em',
              }}>
                {TRACK_LABEL.educational}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>
                {eduCols.length} مساق
              </div>
            </div>
          )}

          {/* المسار العلمي header */}
          {acaCols.length > 0 && (
            <div
              style={{
                gridColumn: `span ${acaCols.length + 1}`,
                background: `linear-gradient(180deg, ${TRACK_COLOR.academic}18, ${TRACK_COLOR.academic}05)`,
                borderBottom: '1px solid var(--border-color)',
                borderLeft: '1px solid var(--border-color)',
                padding: '14px 12px 8px',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: 4,
              }}
            >
              <div style={{
                fontFamily: 'var(--font-noto-kufi), sans-serif',
                fontSize: 14, fontWeight: 700,
                color: TRACK_COLOR.academic, letterSpacing: '-0.01em',
              }}>
                {TRACK_LABEL.academic}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>
                {acaCols.length} مساق
              </div>
            </div>
          )}

          {/* نسبة الإنجاز — span across rows 1+2 (sticky left) */}
          <div
            style={{
              position: 'sticky', left: 0, zIndex: 20,
              background: 'linear-gradient(180deg, rgba(192,138,72,0.18), rgba(192,138,72,0.05))',
              borderBottom: '1px solid var(--border-color)',
              borderRight: '1px solid var(--border-color)',
              padding: '14px 12px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gridRow: 'span 2',
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <div style={{
                fontFamily: 'var(--font-noto-kufi), sans-serif',
                fontSize: 12, fontWeight: 700,
                color: 'var(--accent-warm)', letterSpacing: '-0.01em',
              }}>
                نسبة الإنجاز
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, marginTop: 3 }}>
                مرجّح
              </div>
            </div>
          </div>

          {/* ══════════ HEADER ROW 2 — sub-headers per column + aggregate ══════════ */}
          {eduCols.map((c, ci) => (
            <ColumnHeader key={c.id} c={c} trackColor={TRACK_COLOR.educational} isLast={ci === eduCols.length - 1} />
          ))}
          {eduCols.length > 0 && (
            <AggregateHeader trackColor={TRACK_COLOR.educational} />
          )}

          {acaCols.map((c, ci) => (
            <ColumnHeader key={c.id} c={c} trackColor={TRACK_COLOR.academic} isLast={ci === acaCols.length - 1} />
          ))}
          {acaCols.length > 0 && (
            <AggregateHeader trackColor={TRACK_COLOR.academic} />
          )}

          {/* ══════════ DATA ROWS ══════════ */}
          {students.map((s, si) => {
            const lastRow = si === students.length - 1
            const overall = overallPct(s.id)
            const eduPct = trackPct(s.id, eduCols)
            const acaPct = trackPct(s.id, acaCols)
            const rowBg = si % 2 === 0 ? 'var(--bg-card, #fff)' : 'var(--bg-subtle)'

            return (
              <RowFragment
                key={s.id}
                student={s}
                rowBg={rowBg}
                lastRow={lastRow}
                eduCols={eduCols}
                acaCols={acaCols}
                eduPct={eduPct}
                acaPct={acaPct}
                overall={overall}
                rowH={rowH}
                density={density}
                thresholds={thresholds}
                entriesMap={entriesMap}
                exclusionSet={exclusionSet}
                readOnly={readOnly}
                editPlannedMode={editPlannedMode}
                onCellSave={onCellSave}
                onOpenStudent={onOpenStudent}
              />
            )
          })}
        </div>
      </div>

      {/* ── footer summary ── */}
      <div
        style={{
          padding: '12px 22px',
          borderTop: '1px solid var(--border-color)',
          background: 'var(--bg-subtle)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap', fontSize: 12 }}>
          <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>
            <strong style={{ color: 'var(--text-primary)' }}>{students.length}</strong> طالب
          </span>
          <span style={{ width: 1, height: 14, background: 'var(--border-color)' }} />
          <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>
            متوسط الأداء:{' '}
            <strong style={{ color: 'var(--accent-warm)' }}>
              {(() => {
                const all = students.map(st => overallPct(st.id)).filter((p): p is number => p != null)
                if (all.length === 0) return '—'
                return Math.round(all.reduce((a, b) => a + b, 0) / all.length) + '٪'
              })()}
            </strong>
          </span>
          <span style={{ width: 1, height: 14, background: 'var(--border-color)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: 'var(--text-muted)' }}>
            <LegendDot color="#5A8F67" label={`ممتاز ≥${thresholds.green}٪`} />
            <LegendDot color="#C08A48" label={`مقبول >${thresholds.red}٪`} />
            <LegendDot color="#B94838" label="يحتاج متابعة" />
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          💡 انقر على الفعلي لتعديله · فعّل "تعديل الأهداف" لتعديل المفترض
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════════════

function ColumnHeader({ c, trackColor }: { c: FlatColumn; trackColor: string; isLast: boolean }) {
  return (
    <div
      style={{
        background: 'var(--bg-subtle)',
        borderBottom: '1.5px solid var(--border-color)',
        borderLeft: '1px solid var(--border-color)',
        padding: '8px 6px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
        textAlign: 'center',
        transition: 'background 0.15s',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-noto-kufi), sans-serif',
          fontSize: 11.5, fontWeight: 700,
          color: 'var(--text-primary)',
          lineHeight: 1.25,
          maxWidth: '100%',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
        title={c.label}
      >
        {c.label}
      </div>
      <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600 }}>
        {c.subject.unit ? `(${c.subject.unit})` : 'فعلي/مفترض'}
      </div>
      <span style={{
        width: 16, height: 2, borderRadius: 2, background: trackColor, opacity: 0.6, marginTop: 2,
      }} />
    </div>
  )
}

function AggregateHeader({ trackColor }: { trackColor: string }) {
  return (
    <div
      style={{
        background: `${trackColor}22`,
        borderBottom: '1.5px solid var(--border-color)',
        borderLeft: '1px solid var(--border-color)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 2,
      }}
    >
      <div style={{
        fontSize: 10, fontWeight: 800, color: trackColor,
        fontFamily: 'var(--font-noto-kufi), sans-serif',
      }}>
        Σ إجمالي
      </div>
    </div>
  )
}

function RowFragment({
  student, rowBg, lastRow, eduCols, acaCols, eduPct, acaPct, overall,
  rowH, density, thresholds, entriesMap, exclusionSet,
  readOnly, editPlannedMode, onCellSave, onOpenStudent,
}: {
  student: DBStudent; rowBg: string; lastRow: boolean
  eduCols: FlatColumn[]; acaCols: FlatColumn[]
  eduPct: number | null; acaPct: number | null; overall: number | null
  rowH: number; density: 'compact' | 'medium' | 'cozy'
  thresholds: Thresholds
  entriesMap: Map<string, PerformanceEntry>
  exclusionSet: Set<string>
  readOnly?: boolean; editPlannedMode?: boolean
  onCellSave: (s: string, sub: string, c: EntryColumnKey, field: 'expected' | 'actual', v: number | null) => Promise<void>
  onOpenStudent?: (studentId: string) => void
}) {
  const baseBorder = lastRow ? 'none' : '1px solid var(--border-color)'

  return (
    <>
      {/* اسم الطالب — sticky right */}
      <div
        style={{
          position: 'sticky', right: 0, zIndex: 5,
          background: rowBg,
          borderBottom: baseBorder,
          borderLeft: '1px solid var(--border-color)',
          padding: '10px 16px',
          display: 'flex', alignItems: 'center', gap: 10,
          minHeight: rowH,
        }}
      >
        <div
          style={{
            width: density === 'compact' ? 32 : 38, height: density === 'compact' ? 32 : 38,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--accent-warm), var(--accent-gold))',
            color: '#fff',
            fontSize: density === 'compact' ? 12 : 14,
            fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
            fontFamily: 'var(--font-noto-kufi), sans-serif',
          }}
        >
          {(student.name || '؟').charAt(0)}
        </div>
        <div
          style={{ flex: 1, minWidth: 0, cursor: onOpenStudent ? 'pointer' : 'default' }}
          onClick={() => onOpenStudent?.(student.id)}
        >
          <div
            style={{
              fontWeight: 700, fontSize: 13, color: 'var(--text-primary)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}
            title={student.name}
          >
            {student.name}
          </div>
          {density !== 'compact' && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              دفعة {student.batch_id}
            </div>
          )}
        </div>
      </div>

      {/* خلايا تربوي */}
      {eduCols.map(c => (
        <CellWrap
          key={c.id} student={student} c={c} rowBg={rowBg} lastRow={lastRow}
          density={density} thresholds={thresholds}
          entriesMap={entriesMap} exclusionSet={exclusionSet}
          readOnly={readOnly} editPlannedMode={editPlannedMode}
          onCellSave={onCellSave}
        />
      ))}
      {eduCols.length > 0 && (
        <AggregateCell value={eduPct} thresholds={thresholds} trackColor={TRACK_COLOR.educational} lastRow={lastRow} rowBg={rowBg} />
      )}

      {/* خلايا علمي */}
      {acaCols.map(c => (
        <CellWrap
          key={c.id} student={student} c={c} rowBg={rowBg} lastRow={lastRow}
          density={density} thresholds={thresholds}
          entriesMap={entriesMap} exclusionSet={exclusionSet}
          readOnly={readOnly} editPlannedMode={editPlannedMode}
          onCellSave={onCellSave}
        />
      ))}
      {acaCols.length > 0 && (
        <AggregateCell value={acaPct} thresholds={thresholds} trackColor={TRACK_COLOR.academic} lastRow={lastRow} rowBg={rowBg} />
      )}

      {/* نسبة الإنجاز — sticky left */}
      <div
        style={{
          position: 'sticky', left: 0, zIndex: 5,
          background: `linear-gradient(90deg, rgba(192,138,72,0.06), rgba(192,138,72,0.14))`,
          borderBottom: baseBorder,
          borderRight: '1px solid var(--border-color)',
          padding: '8px 12px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <ProgressRing
          pct={overall}
          thresholds={thresholds}
          size={density === 'compact' ? 38 : density === 'medium' ? 46 : 54}
          stroke={4}
        />
      </div>
    </>
  )
}

function CellWrap({
  student, c, rowBg, lastRow, density, thresholds,
  entriesMap, exclusionSet, readOnly, editPlannedMode, onCellSave,
}: {
  student: DBStudent; c: FlatColumn; rowBg: string; lastRow: boolean
  density: 'compact' | 'medium' | 'cozy'; thresholds: Thresholds
  entriesMap: Map<string, PerformanceEntry>
  exclusionSet: Set<string>
  readOnly?: boolean; editPlannedMode?: boolean
  onCellSave: (s: string, sub: string, c: EntryColumnKey, field: 'expected' | 'actual', v: number | null) => Promise<void>
}) {
  const excluded = exclusionSet.has(`${c.subject.id}:${student.id}`)
  const e = entriesMap.get(cellKey(student.id, c.subject.id, c.columnKey))

  return (
    <div
      style={{
        background: rowBg,
        borderBottom: lastRow ? 'none' : '1px solid var(--border-color)',
        borderLeft: '1px solid var(--border-color)',
        padding: 4,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {excluded ? (
        <div style={{
          width: '100%', textAlign: 'center', fontSize: 10,
          color: 'var(--text-muted)', fontWeight: 600,
          padding: 8,
          background: 'repeating-linear-gradient(45deg, var(--bg-subtle), var(--bg-subtle) 4px, rgba(0,0,0,0.03) 4px, rgba(0,0,0,0.03) 8px)',
          borderRadius: 6,
        }}>
          مستثنى
        </div>
      ) : (
        <PerfCell
          expected={e?.expected ?? null}
          actual={e?.actual ?? null}
          thresholds={thresholds}
          density={density}
          readOnly={readOnly}
          editPlannedMode={editPlannedMode}
          onSaveActual={(v) => onCellSave(student.id, c.subject.id, c.columnKey, 'actual', v)}
          onSaveExpected={(v) => onCellSave(student.id, c.subject.id, c.columnKey, 'expected', v)}
        />
      )}
    </div>
  )
}

function AggregateCell({
  value, thresholds, trackColor, lastRow, rowBg,
}: {
  value: number | null; thresholds: Thresholds
  trackColor: string; lastRow: boolean; rowBg: string
}) {
  return (
    <div
      style={{
        background: rowBg.includes('subtle') ? `${trackColor}10` : `${trackColor}06`,
        borderBottom: lastRow ? 'none' : '1px solid var(--border-color)',
        borderLeft: `1px solid ${trackColor}33`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <PctBadge pct={value} thresholds={thresholds} size="sm" />
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
      {label}
    </span>
  )
}
