'use client'
/**
 * /timeline/calendar/import — CSV/Excel drop zone + preview + save.
 *
 * Flow:
 *   1. User drops/picks a file
 *   2. parseCalendarFile() runs (client-side, no DB hit yet)
 *   3. Preview table shows rows + errors + warnings
 *   4. If zero errors → "حفظ" button calls createCalendar() + insertDays()
 *   5. Redirect to /timeline/calendar
 *
 * Permission: CEO + records_officer only. Others see a blocked state.
 */
import { useState, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  Upload,
  FileWarning,
  CheckCircle2,
  X,
  ChevronLeft,
  Loader2,
  Download,
  AlertTriangle,
  FileSpreadsheet,
  Trash2,
} from 'lucide-react'
import { TIMELINE_ENABLED } from '@/lib/timeline/flag'
import { useAuth } from '@/contexts/AuthContext'
import {
  parseCalendarFile,
  toTimelineDaysInsert,
  type ParseResult,
} from '@/lib/timeline/calendar-import'
import {
  createCalendar,
  replaceCalendarDays,
  setActiveCalendar,
} from '@/lib/timeline/db'
import {
  HIJRI_MONTHS_AR,
  hijriYearGregorianRange,
  hijriIso,
  gregorianIso,
  formatHijriAr,
  formatGregorianShort,
} from '@/lib/timeline/hijri'

const SAMPLE_CSV_URL = '/timeline-calendar-sample.csv'

const DAY_TYPE_LABELS: Record<string, string> = {
  study:   'دراسة',
  holiday: 'إجازة',
  exam:    'اختبار',
  weekend: 'نهاية أسبوع',
}

const DAY_TYPE_COLORS: Record<string, string> = {
  study:   '#356B6E',
  holiday: '#6FA392',
  exam:    '#B94838',
  weekend: '#5D4256',
}

export default function CalendarImportPage() {
  const router = useRouter()
  const { profile, loading: authLoading } = useAuth()
  const role = profile?.role ?? null
  const canImport = role === 'ceo' || role === 'records_officer'

  const [file, setFile] = useState<File | null>(null)
  const [parsing, setParsing] = useState(false)
  const [result, setResult] = useState<ParseResult | null>(null)
  const [saving, setSaving] = useState(false)
  const [calendarName, setCalendarName] = useState('')
  const [activateAfterSave, setActivateAfterSave] = useState(true)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Flag gate
  if (!TIMELINE_ENABLED) {
    if (typeof window !== 'undefined') router.replace('/dashboard')
    return null
  }

  const handleFile = useCallback(async (f: File) => {
    setFile(f)
    setResult(null)
    setParsing(true)
    try {
      const r = await parseCalendarFile(f)
      setResult(r)
      if (r.detectedHijriYear && !calendarName) {
        setCalendarName(`العام الدراسي ${r.detectedHijriYear}هـ`)
      }
      if (r.errors.length === 0) {
        toast.success(`تم تحليل ${r.rows.length} يوم`)
      } else {
        toast.error(`وُجد ${r.errors.length} خطأ في الملف — راجع الجدول`)
      }
    } catch (err) {
      console.error(err)
      toast.error('تعذّر تحليل الملف')
    } finally {
      setParsing(false)
    }
  }, [calendarName])

  const reset = () => {
    setFile(null)
    setResult(null)
    setCalendarName('')
    if (inputRef.current) inputRef.current.value = ''
  }

  const handleSave = async () => {
    if (!canImport || !result || result.errors.length > 0) return
    if (!result.detectedHijriYear) {
      toast.error('لم نستطع تحديد السنة الهجرية من الملف')
      return
    }
    if (!calendarName.trim()) {
      toast.error('اكتب اسماً للتقويم')
      return
    }

    setSaving(true)
    try {
      const range = hijriYearGregorianRange(result.detectedHijriYear)
      const cal = await createCalendar({
        hijri_year: result.detectedHijriYear,
        gregorian_year_start: range.start,
        gregorian_year_end: range.end,
        name: calendarName.trim(),
        imported_from_file: file?.name ?? null,
        created_by: profile?.id ?? null,
      })
      await replaceCalendarDays(cal.id, toTimelineDaysInsert(result.rows, cal.id))
      if (activateAfterSave) {
        await setActiveCalendar(cal.id)
      }
      toast.success(`تم حفظ التقويم: ${cal.name} (${result.rows.length} يوم)`)
      router.push('/timeline/calendar')
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : 'تعذّر حفظ التقويم')
    } finally {
      setSaving(false)
    }
  }

  // ── Summary chips ─────────────────────────────────────────────
  const typeCounts = useMemo(() => {
    if (!result) return null
    const out: Record<string, number> = {}
    for (const r of result.rows) out[r.day_type] = (out[r.day_type] ?? 0) + 1
    return out
  }, [result])

  // ── Render ────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#C08A48' }} />
      </div>
    )
  }

  if (!canImport) {
    return (
      <div className="space-y-4 animate-fade-in-up">
        <Link href="/timeline/calendar" className="text-xs font-semibold inline-flex items-center gap-1 hover:underline" style={{ color: '#C08A48' }}>
          <ChevronLeft className="w-3.5 h-3.5" /> رجوع
        </Link>
        <div className="rounded-2xl p-6 text-center" style={{ background: 'rgba(185,72,56,0.06)', border: '1px solid rgba(185,72,56,0.25)' }}>
          <AlertTriangle className="w-10 h-10 mx-auto mb-2" style={{ color: '#B94838' }} />
          <p className="font-bold" style={{ color: '#8B2F23' }}>
            ليس لديك صلاحية استيراد التقاويم
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            هذي الصلاحية للمدير التنفيذي وموظف السجلات فقط.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header */}
      <div>
        <Link href="/timeline/calendar" className="text-xs font-semibold inline-flex items-center gap-1 hover:underline" style={{ color: '#C08A48' }}>
          <ChevronLeft className="w-3.5 h-3.5" /> رجوع
        </Link>
        <h1 className="text-2xl font-bold mt-1 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <Upload className="w-6 h-6" style={{ color: '#C08A48' }} />
          استيراد تقويم أكاديمي
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
          ارفع ملف CSV أو Excel يحوي أيام السنة الهجرية مع تصنيفها.
        </p>
      </div>

      {/* Format help */}
      <div className="card-static p-4 space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-bold text-sm flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <FileSpreadsheet className="w-4 h-4" style={{ color: '#C08A48' }} />
            تنسيق الملف المتوقع
          </h3>
          <a
            href={SAMPLE_CSV_URL}
            download="timeline-calendar-sample.csv"
            className="inline-flex items-center gap-1 text-xs font-semibold hover:underline"
            style={{ color: '#C08A48' }}
          >
            <Download className="w-3.5 h-3.5" />
            تنزيل عيّنة CSV
          </a>
        </div>
        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
          أعمدة مطلوبة: <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>التاريخ_الهجري</span>{' '}
          • <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>التاريخ_الميلادي</span>{' '}
          • <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>النوع</span>{' '}
          (اختياري: <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>ملاحظات</span>).
          <br />
          القيم المسموحة للنوع:{' '}
          {Object.entries(DAY_TYPE_LABELS).map(([k, v], i) => (
            <span key={k}>
              {i > 0 && <span className="mx-1">•</span>}
              <span className="font-mono" style={{ color: DAY_TYPE_COLORS[k] }}>{k}</span> ({v})
            </span>
          ))}
        </div>
      </div>

      {/* Drop zone */}
      {!file && (
        <label
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            const f = e.dataTransfer.files?.[0]
            if (f) handleFile(f)
          }}
          className="block cursor-pointer rounded-2xl p-10 text-center transition"
          style={{
            background: dragOver ? 'rgba(192,138,72,0.10)' : 'rgba(192,138,72,0.04)',
            border: `2px dashed ${dragOver ? 'rgba(192,138,72,0.55)' : 'rgba(192,138,72,0.30)'}`,
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleFile(f)
            }}
          />
          <Upload className="w-10 h-10 mx-auto mb-3" style={{ color: '#C08A48' }} />
          <p className="font-bold text-sm" style={{ color: '#7A4E1E' }}>
            اسحب وأفلت الملف هنا أو اضغط للاختيار
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            صيغ مدعومة: CSV, XLSX, XLS
          </p>
        </label>
      )}

      {/* Parsing */}
      {parsing && (
        <div className="card-static p-6 flex items-center justify-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#C08A48' }} />
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>جاري تحليل الملف...</span>
        </div>
      )}

      {/* Results */}
      {file && !parsing && result && (
        <>
          {/* File summary */}
          <div className="card-static p-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="w-6 h-6" style={{ color: '#C08A48' }} />
              <div>
                <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{file.name}</p>
                <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  {(file.size / 1024).toFixed(1)} KB
                  {result.detectedHijriYear && (
                    <>
                      <span className="mx-1.5">•</span>
                      السنة المكتشفة: <span className="font-mono">{result.detectedHijriYear}هـ</span>
                    </>
                  )}
                  {result.expectedDayCount && (
                    <>
                      <span className="mx-1.5">•</span>
                      المتوقّع: <span className="font-mono">{result.expectedDayCount}</span> يوم
                    </>
                  )}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{ background: 'rgba(185,72,56,0.08)', color: '#8B2F23', border: '1px solid rgba(185,72,56,0.25)' }}
            >
              <Trash2 className="w-3.5 h-3.5" /> إلغاء واختيار ملف آخر
            </button>
          </div>

          {/* Errors */}
          {result.errors.length > 0 && (
            <div className="rounded-2xl p-4" style={{ background: 'rgba(185,72,56,0.06)', border: '1px solid rgba(185,72,56,0.30)' }}>
              <p className="font-bold text-sm flex items-center gap-2 mb-2" style={{ color: '#8B2F23' }}>
                <X className="w-4 h-4" />
                أخطاء يجب إصلاحها قبل الحفظ ({result.errors.length})
              </p>
              <ul className="space-y-1 text-xs" style={{ color: '#8B2F23' }}>
                {result.errors.slice(0, 15).map((e, i) => (
                  <li key={i}>
                    <span className="font-mono opacity-75">سطر {e.rowIndex}:</span> {e.message}
                  </li>
                ))}
                {result.errors.length > 15 && (
                  <li className="italic opacity-75">...و {result.errors.length - 15} خطأ آخر</li>
                )}
              </ul>
            </div>
          )}

          {/* Warnings */}
          {result.warnings.length > 0 && (
            <div className="rounded-2xl p-4" style={{ background: 'rgba(192,138,72,0.08)', border: '1px solid rgba(192,138,72,0.30)' }}>
              <p className="font-bold text-sm flex items-center gap-2 mb-2" style={{ color: '#7A4E1E' }}>
                <FileWarning className="w-4 h-4" />
                تنبيهات ({result.warnings.length})
              </p>
              <ul className="space-y-1 text-xs" style={{ color: '#7A4E1E' }}>
                {result.warnings.slice(0, 15).map((w, i) => (
                  <li key={i}>
                    {w.rowIndex > 0 && <span className="font-mono opacity-75">سطر {w.rowIndex}: </span>}
                    {w.message}
                  </li>
                ))}
                {result.warnings.length > 15 && (
                  <li className="italic opacity-75">...و {result.warnings.length - 15} تنبيه آخر</li>
                )}
              </ul>
            </div>
          )}

          {/* Summary chips */}
          {typeCounts && result.rows.length > 0 && (
            <div className="card-static p-4 space-y-2">
              <h3 className="font-bold text-sm flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--accent-mint)' }} />
                ملخّص الاستيراد ({result.rows.length} يوم)
              </h3>
              <div className="flex flex-wrap gap-2">
                {Object.entries(typeCounts).map(([k, v]) => (
                  <span
                    key={k}
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-semibold"
                    style={{
                      background: `${DAY_TYPE_COLORS[k]}18`,
                      border: `1px solid ${DAY_TYPE_COLORS[k]}55`,
                      color: DAY_TYPE_COLORS[k],
                    }}
                  >
                    <span className="w-2 h-2 rounded-full" style={{ background: DAY_TYPE_COLORS[k] }} />
                    {DAY_TYPE_LABELS[k]}
                    <span className="font-mono">{v}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Preview table — first 40 rows */}
          {result.rows.length > 0 && (
            <div className="card-static overflow-hidden">
              <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border-soft)' }}>
                <h3 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
                  معاينة ({Math.min(40, result.rows.length)} من {result.rows.length})
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: 'var(--bg-subtle)' }}>
                      <th className="text-right px-4 py-2 font-semibold text-xs" style={{ color: 'var(--text-secondary)' }}>التاريخ الهجري</th>
                      <th className="text-right px-4 py-2 font-semibold text-xs" style={{ color: 'var(--text-secondary)' }}>الشهر</th>
                      <th className="text-right px-4 py-2 font-semibold text-xs" style={{ color: 'var(--text-secondary)' }}>الميلادي</th>
                      <th className="text-right px-4 py-2 font-semibold text-xs" style={{ color: 'var(--text-secondary)' }}>النوع</th>
                      <th className="text-right px-4 py-2 font-semibold text-xs" style={{ color: 'var(--text-secondary)' }}>ملاحظات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.slice(0, 40).map((r) => (
                      <tr key={`${r.rowIndex}-${hijriIso(r.hijri)}`} className="border-t" style={{ borderColor: 'var(--border-soft)' }}>
                        <td className="px-4 py-1.5 font-mono text-xs" style={{ color: 'var(--text-primary)' }}>
                          {formatHijriAr(r.hijri)}
                        </td>
                        <td className="px-4 py-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                          {HIJRI_MONTHS_AR[r.hijri.hm - 1]}
                        </td>
                        <td className="px-4 py-1.5 font-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>
                          {formatGregorianShort(r.gregorian)}
                        </td>
                        <td className="px-4 py-1.5">
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold"
                            style={{
                              background: `${DAY_TYPE_COLORS[r.day_type]}18`,
                              border: `1px solid ${DAY_TYPE_COLORS[r.day_type]}55`,
                              color: DAY_TYPE_COLORS[r.day_type],
                            }}
                          >
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: DAY_TYPE_COLORS[r.day_type] }} />
                            {DAY_TYPE_LABELS[r.day_type]}
                          </span>
                        </td>
                        <td className="px-4 py-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                          {r.notes || <span style={{ color: 'var(--text-muted)' }}>—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Save form */}
          {result.errors.length === 0 && result.rows.length > 0 && (
            <div className="card-static p-5 space-y-3">
              <h3 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
                بيانات التقويم
              </h3>
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  اسم التقويم *
                </label>
                <input
                  value={calendarName}
                  onChange={(e) => setCalendarName(e.target.value)}
                  placeholder="مثال: العام الدراسي 1447هـ"
                  className="w-full px-3 py-2 text-sm rounded-xl outline-none"
                  style={{
                    background: 'var(--bg-subtle)',
                    border: '1px solid var(--border-soft)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>
              <label className="flex items-center gap-2 text-xs cursor-pointer select-none" style={{ color: 'var(--text-secondary)' }}>
                <input
                  type="checkbox"
                  checked={activateAfterSave}
                  onChange={(e) => setActivateAfterSave(e.target.checked)}
                  className="w-4 h-4"
                />
                اجعل هذا التقويم نشطاً للنظام بعد الحفظ
              </label>
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white rounded-xl transition active:scale-95 disabled:opacity-50"
                  style={{
                    background: 'linear-gradient(135deg, #356B6E, #244A4C)',
                    boxShadow: '0 2px 10px rgba(53,107,110,0.35)',
                  }}
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      جاري الحفظ...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      حفظ التقويم ({result.rows.length} يوم)
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={reset}
                  disabled={saving}
                  className="px-4 py-2.5 text-xs rounded-xl border"
                  style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}
                >
                  إلغاء
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
