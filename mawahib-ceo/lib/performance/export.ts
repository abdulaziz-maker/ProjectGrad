/**
 * تصدير تقرير الأداء إلى Excel.
 * (PDF يستخدم window.print() مع stylesheet مخصص — لا يحتاج JS)
 */
import * as XLSX from 'xlsx'
import type { DBStudent } from '@/lib/db'
import type { ReportSubject, PerformanceEntry, SubjectExclusion } from './types'
import { cellKey } from './types'
import { columnsForKind, calcPercent, averagePercent, COLUMN_LABEL, TRACK_LABEL } from './format'

interface ExportInput {
  reportTitle: string         // مثل "بيانات دفعة 46 — ربيع الأول 1447هـ"
  batchName: string
  periodLabel: string
  students: DBStudent[]
  subjects: ReportSubject[]   // مرتّبة وغير مخفية (المخفية لا تُصدّر)
  entries: PerformanceEntry[]
  exclusions: SubjectExclusion[]
}

export function exportToExcel(input: ExportInput): void {
  const { reportTitle, batchName, periodLabel, students, subjects, entries, exclusions } = input

  // فهرس البيانات
  const eMap = new Map<string, PerformanceEntry>()
  for (const e of entries) eMap.set(cellKey(e.student_id, e.subject_id, e.column_key), e)
  const exSet = new Set(exclusions.map(x => `${x.subject_id}:${x.student_id}`))

  // المسارات
  const eduSubs = subjects.filter(s => s.track === 'educational')
  const acaSubs = subjects.filter(s => s.track === 'academic')

  // ─── بناء الصفوف كـArray of Arrays ─────────────────────
  const rows: any[][] = []

  // العنوان (مدمج لاحقاً)
  rows.push([reportTitle])
  rows.push([`الدفعة: ${batchName}    |    الفترة: ${periodLabel}`])
  rows.push([])

  // رأس المسارات
  const headRow1: string[] = ['الطالب']
  for (const s of eduSubs) {
    const cols = columnsForKind(s.columns_kind)
    for (let i = 0; i < cols.length * 3; i++) headRow1.push(i === 0 ? TRACK_LABEL.educational : '')
  }
  if (eduSubs.length > 0) headRow1.push('نسبة المساق التربوي')
  for (const s of acaSubs) {
    const cols = columnsForKind(s.columns_kind)
    for (let i = 0; i < cols.length * 3; i++) headRow1.push(i === 0 ? TRACK_LABEL.academic : '')
  }
  if (acaSubs.length > 0) headRow1.push('نسبة المساق العلمي')
  headRow1.push('نسبة إنجاز الطالب')
  rows.push(headRow1)

  // رأس المساقات
  const headRow2: string[] = ['']
  for (const s of [...eduSubs, ...acaSubs]) {
    const cols = columnsForKind(s.columns_kind)
    for (let i = 0; i < cols.length * 3; i++) headRow2.push(i === 0 ? s.name + (s.unit ? ` (${s.unit})` : '') : '')
  }
  if (eduSubs.length > 0) headRow2.push('')
  if (acaSubs.length > 0) headRow2.push('')
  headRow2.push('')
  rows.push(headRow2)

  // رأس فرعي (مفترض/فعلي/نسبة)
  const headRow3: string[] = ['']
  for (const s of [...eduSubs, ...acaSubs]) {
    const cols = columnsForKind(s.columns_kind)
    for (const col of cols) {
      const colName = COLUMN_LABEL[col]
      headRow3.push(`${colName} - مفترض`, `${colName} - فعلي`, `${colName} - %`)
    }
  }
  if (eduSubs.length > 0) headRow3.push('%')
  if (acaSubs.length > 0) headRow3.push('%')
  headRow3.push('%')
  rows.push(headRow3)

  // بيانات الطلاب
  const allSubs = [...eduSubs, ...acaSubs]
  for (const st of students) {
    const row: any[] = [st.name]
    let eduPercents: (number | null)[] = []
    let acaPercents: (number | null)[] = []

    for (const s of allSubs) {
      const cols = columnsForKind(s.columns_kind)
      const excluded = exSet.has(`${s.id}:${st.id}`)
      const subjPcts: (number | null)[] = []
      for (const col of cols) {
        if (excluded) {
          row.push('—', '—', '—')
          continue
        }
        const e = eMap.get(cellKey(st.id, s.id, col))
        const exp = e?.expected ?? null
        const act = e?.actual ?? null
        const p = calcPercent(exp, act)
        row.push(exp ?? '', act ?? '', p != null ? `${p}%` : '')
        subjPcts.push(p)
      }
      const subjAvg = excluded ? null : averagePercent(subjPcts)
      if (s.track === 'educational') eduPercents.push(subjAvg)
      else acaPercents.push(subjAvg)
    }

    if (eduSubs.length > 0) {
      const p = averagePercent(eduPercents)
      row.push(p != null ? `${p}%` : '—')
    }
    if (acaSubs.length > 0) {
      const p = averagePercent(acaPercents)
      row.push(p != null ? `${p}%` : '—')
    }
    const total = averagePercent([averagePercent(eduPercents), averagePercent(acaPercents)])
    row.push(total != null ? `${total}%` : '—')

    rows.push(row)
  }

  // ─── بناء الـworksheet ─────────────────────
  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!dir'] = 'rtl'

  // عرض أعمدة معقول
  ws['!cols'] = rows[3].map((_, i) => ({ wch: i === 0 ? 22 : 9 }))

  // دمج عنوان وحقل الدفعة
  ws['!merges'] = ws['!merges'] || []
  const totalCols = rows[3].length
  ws['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } })
  ws['!merges'].push({ s: { r: 1, c: 0 }, e: { r: 1, c: totalCols - 1 } })

  // ─── workbook ─────────────────────
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, periodLabel.substring(0, 30))
  const filename = `${reportTitle.replace(/\s+/g, '_')}.xlsx`
  XLSX.writeFile(wb, filename)
}

export function exportToPdf(): void {
  // PDF عبر طباعة المتصفح — أبسط وأخف
  window.print()
}
