/**
 * Academic Calendar Import — parser + validator.
 *
 * Supported formats:
 *  - CSV (.csv)
 *  - Excel (.xlsx, .xls) — using existing xlsx dep
 *
 * Expected columns (Arabic OR English, any order):
 *  التاريخ_الهجري | hijri_date   (required — 'YYYY-MM-DD' in Hijri)
 *  التاريخ_الميلادي | gregorian_date (required — 'YYYY-MM-DD' in Gregorian)
 *  النوع | day_type   (required — study|holiday|exam|weekend)
 *  ملاحظات | notes    (optional)
 *
 * Design decisions:
 *  - Parse is sync (CSV lib) and returns a Result-like shape.
 *  - Validation is stricter than ingestion — errors block save, warnings only alert.
 *  - Hijri is authoritative: if pair mismatches, we trust hijri and recompute Gregorian
 *    only if user opts in (default: surface as error).
 */
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import {
  parseHijriIso,
  parseGregorianIso,
  hijriIso,
  gregorianIso,
  validateHijriGregorianPair,
  hijriYearLength,
  isKSAWeekend,
  hijriWeekday,
  type HijriYMD,
  type GregorianYMD,
} from './hijri'
import type { TimelineDayType } from '@/types/timeline'

export interface ParsedRow {
  rowIndex: number        // 1-based index from the source file
  hijri: HijriYMD
  gregorian: GregorianYMD
  day_type: TimelineDayType
  notes: string
}

export interface ParseError {
  rowIndex: number
  message: string
}

export interface ParseWarning {
  rowIndex: number
  message: string
}

export interface ParseResult {
  rows: ParsedRow[]
  errors: ParseError[]
  warnings: ParseWarning[]
  detectedHijriYear: number | null
  expectedDayCount: number | null   // 354 or 355 for the detected year
}

// ─── Column aliasing ────────────────────────────────────────────────
const HIJRI_ALIASES    = ['التاريخ_الهجري', 'التاريخ الهجري', 'hijri_date', 'hijri']
const GREG_ALIASES     = ['التاريخ_الميلادي', 'التاريخ الميلادي', 'gregorian_date', 'gregorian', 'date']
const TYPE_ALIASES     = ['النوع', 'day_type', 'type', 'kind']
const NOTES_ALIASES    = ['ملاحظات', 'ملاحظة', 'notes', 'note', 'comment']

function pickCol(headers: string[], aliases: string[]): string | null {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '_')
  const map = new Map(headers.map((h) => [norm(h), h]))
  for (const a of aliases) {
    const hit = map.get(norm(a))
    if (hit) return hit
  }
  return null
}

const DAY_TYPE_MAP: Record<string, TimelineDayType> = {
  'study': 'study', 'دراسة': 'study', 'دراسي': 'study',
  'holiday': 'holiday', 'إجازة': 'holiday', 'اجازة': 'holiday', 'عطلة': 'holiday',
  'exam': 'exam', 'اختبار': 'exam', 'اختبارات': 'exam',
  'weekend': 'weekend', 'نهاية_الأسبوع': 'weekend', 'نهاية الأسبوع': 'weekend',
}

function normalizeDayType(raw: string): TimelineDayType | null {
  const key = raw.trim().toLowerCase().replace(/\s+/g, '_')
  return DAY_TYPE_MAP[key] ?? null
}

// ─── Raw row extraction ─────────────────────────────────────────────
type RawDict = Record<string, string | number | null | undefined>

function rawToString(v: unknown): string {
  if (v == null) return ''
  return String(v).trim()
}

function extractRow(
  row: RawDict,
  cols: { hijri: string; greg: string; type: string; notes: string | null },
  idx: number,
  errors: ParseError[],
): ParsedRow | null {
  const hijriStr = rawToString(row[cols.hijri])
  const gregStr  = rawToString(row[cols.greg])
  const typeStr  = rawToString(row[cols.type])
  const notesStr = cols.notes ? rawToString(row[cols.notes]) : ''

  if (!hijriStr && !gregStr && !typeStr) return null // empty row — skip silently

  const hijri = parseHijriIso(hijriStr)
  if (!hijri) {
    errors.push({ rowIndex: idx, message: `تاريخ هجري غير صالح: "${hijriStr}"` })
    return null
  }
  const greg = parseGregorianIso(gregStr)
  if (!greg) {
    errors.push({ rowIndex: idx, message: `تاريخ ميلادي غير صالح: "${gregStr}"` })
    return null
  }
  const day_type = normalizeDayType(typeStr)
  if (!day_type) {
    errors.push({
      rowIndex: idx,
      message: `نوع يوم غير معروف: "${typeStr}" (المسموح: study, holiday, exam, weekend)`,
    })
    return null
  }
  return { rowIndex: idx, hijri, gregorian: greg, day_type, notes: notesStr }
}

// ─── File → RawDict[] ────────────────────────────────────────────────
async function readAsText(file: File): Promise<string> {
  return await file.text()
}

async function readAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return await file.arrayBuffer()
}

/** Detect file format from extension + mime. */
function detectFormat(file: File): 'csv' | 'xlsx' | 'unknown' {
  const name = file.name.toLowerCase()
  if (name.endsWith('.csv') || file.type === 'text/csv') return 'csv'
  if (name.endsWith('.xlsx') || name.endsWith('.xls') ||
      file.type.includes('sheet') || file.type.includes('excel')) return 'xlsx'
  return 'unknown'
}

async function readCsv(file: File): Promise<RawDict[]> {
  const text = await readAsText(file)
  const out = Papa.parse<RawDict>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
  })
  if (out.errors.length > 0) {
    // Non-fatal CSV errors — we still return rows that parsed
    console.warn('CSV parse warnings:', out.errors)
  }
  return out.data
}

async function readXlsx(file: File): Promise<RawDict[]> {
  const buf = await readAsArrayBuffer(file)
  const wb = XLSX.read(buf, { type: 'array' })
  const firstSheet = wb.SheetNames[0]
  if (!firstSheet) return []
  const ws = wb.Sheets[firstSheet]
  return XLSX.utils.sheet_to_json<RawDict>(ws, { defval: '', raw: false })
}

// ─── Public API ──────────────────────────────────────────────────────
export async function parseCalendarFile(file: File): Promise<ParseResult> {
  const errors: ParseError[] = []
  const warnings: ParseWarning[] = []

  const fmt = detectFormat(file)
  if (fmt === 'unknown') {
    errors.push({
      rowIndex: 0,
      message: `تنسيق الملف غير مدعوم: ${file.name}. استخدم CSV أو Excel.`,
    })
    return { rows: [], errors, warnings, detectedHijriYear: null, expectedDayCount: null }
  }

  let raw: RawDict[]
  try {
    raw = fmt === 'csv' ? await readCsv(file) : await readXlsx(file)
  } catch (err) {
    errors.push({ rowIndex: 0, message: `فشل قراءة الملف: ${err instanceof Error ? err.message : String(err)}` })
    return { rows: [], errors, warnings, detectedHijriYear: null, expectedDayCount: null }
  }

  if (raw.length === 0) {
    errors.push({ rowIndex: 0, message: 'الملف فارغ أو لا يحتوي على صفوف.' })
    return { rows: [], errors, warnings, detectedHijriYear: null, expectedDayCount: null }
  }

  const headers = Object.keys(raw[0] ?? {})
  const hijriCol = pickCol(headers, HIJRI_ALIASES)
  const gregCol  = pickCol(headers, GREG_ALIASES)
  const typeCol  = pickCol(headers, TYPE_ALIASES)
  const notesCol = pickCol(headers, NOTES_ALIASES)

  if (!hijriCol || !gregCol || !typeCol) {
    errors.push({
      rowIndex: 0,
      message: `رؤوس أعمدة ناقصة — مطلوب: التاريخ_الهجري، التاريخ_الميلادي، النوع. الموجود: ${headers.join(' | ')}`,
    })
    return { rows: [], errors, warnings, detectedHijriYear: null, expectedDayCount: null }
  }

  const cols = { hijri: hijriCol, greg: gregCol, type: typeCol, notes: notesCol }

  // Extract + primary validation
  const rows: ParsedRow[] = []
  raw.forEach((r, i) => {
    const parsed = extractRow(r, cols, i + 2, errors) // +2 = header row + 1-based
    if (parsed) rows.push(parsed)
  })

  // Check pair consistency
  for (const row of rows) {
    const pairErr = validateHijriGregorianPair(row.hijri, row.gregorian)
    if (pairErr) errors.push({ rowIndex: row.rowIndex, message: pairErr })
  }

  // Duplicate detection (by hijri ISO)
  const seen = new Map<string, number>()
  for (const row of rows) {
    const key = hijriIso(row.hijri)
    if (seen.has(key)) {
      errors.push({
        rowIndex: row.rowIndex,
        message: `تكرار: ${key} موجود سابقاً في السطر ${seen.get(key)}`,
      })
    } else {
      seen.set(key, row.rowIndex)
    }
  }

  // Detect Hijri year (most common)
  const yearCounts = new Map<number, number>()
  for (const row of rows) {
    yearCounts.set(row.hijri.hy, (yearCounts.get(row.hijri.hy) ?? 0) + 1)
  }
  let detectedHijriYear: number | null = null
  let maxCount = 0
  for (const [y, c] of yearCounts) {
    if (c > maxCount) { maxCount = c; detectedHijriYear = y }
  }

  if (yearCounts.size > 1) {
    warnings.push({
      rowIndex: 0,
      message: `الملف يحوي أكثر من سنة هجرية (${[...yearCounts.keys()].join(', ')}). يُنصح بتقويم واحد لكل سنة.`,
    })
  }

  let expectedDayCount: number | null = null
  if (detectedHijriYear !== null) {
    expectedDayCount = hijriYearLength(detectedHijriYear)
    const actualInYear = yearCounts.get(detectedHijriYear) ?? 0
    if (actualInYear < expectedDayCount) {
      warnings.push({
        rowIndex: 0,
        message: `ناقص ${expectedDayCount - actualInYear} يوم من سنة ${detectedHijriYear}هـ (المتوقع ${expectedDayCount}، الموجود ${actualInYear}).`,
      })
    }
  }

  // Gregorian weekend inconsistency — if day_type != 'weekend' but Gregorian falls Fri/Sat
  for (const row of rows) {
    const wd = hijriWeekday(row.hijri)
    if (isKSAWeekend(wd) && row.day_type !== 'weekend' && row.day_type !== 'holiday') {
      warnings.push({
        rowIndex: row.rowIndex,
        message: `${hijriIso(row.hijri)} يقع في نهاية الأسبوع (${wd === 5 ? 'جمعة' : 'سبت'}) لكن نوعه: ${row.day_type}.`,
      })
    }
  }

  // Sort ascending by hijri for nice preview
  rows.sort((a, b) => hijriIso(a.hijri).localeCompare(hijriIso(b.hijri)))

  return { rows, errors, warnings, detectedHijriYear, expectedDayCount }
}

/** Convert ParseResult rows into DB-ready shape. */
export function toTimelineDaysInsert(rows: ParsedRow[], calendarId: string) {
  return rows.map((r) => ({
    calendar_id: calendarId,
    hijri_date: hijriIso(r.hijri),
    gregorian_date: gregorianIso(r.gregorian),
    day_type: r.day_type,
    notes: r.notes || null,
  }))
}
