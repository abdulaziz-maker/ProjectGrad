// ══════════════════════════════════════════════════════════════════════════
// إحصائيات لوحة تحكم المعلم — خفيفة وسريعة (3 queries بالتوازي)
// ══════════════════════════════════════════════════════════════════════════

import {
  getStudents, getBatches, getQuranDailyRecords, getExamCandidates,
  type DBStudent, type DBBatch,
} from '@/lib/db'

export interface DashboardStats {
  totalStudents:    number
  recordedToday:    number
  notRecordedToday: number
  recordedPct:      number   // 0–100
  nearExamCount:    number
  notRecordedNames: string[] // أسماء من لم يُسجَّل (أول 10 فقط)
}

const EMPTY_STATS: DashboardStats = {
  totalStudents: 0, recordedToday: 0, notRecordedToday: 0,
  recordedPct: 0, nearExamCount: 0, notRecordedNames: [],
}

// ─── Cache يومي في sessionStorage ────────────────────────────────
function cacheKey(batchId: number, date: string) {
  return `ds:${batchId}:${date}`
}

function readCache(key: string): DashboardStats | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(key)
    return raw ? (JSON.parse(raw) as DashboardStats) : null
  } catch { return null }
}

function writeCache(key: string, data: DashboardStats) {
  if (typeof window === 'undefined') return
  try { sessionStorage.setItem(key, JSON.stringify(data)) } catch { /* quota */ }
}

// ─── الدالة الرئيسية ─────────────────────────────────────────────

/**
 * يجلب إحصائيات اللوحة لدفعة محددة.
 * يخزّن في sessionStorage بمفتاح يومي — إعادة الفتح في نفس اليوم فورية.
 *
 * @param batchId  رقم الدفعة
 * @param today    تاريخ اليوم YYYY-MM-DD
 * @param forceRefresh  تجاوز الكاش (زر تحديث)
 */
export async function getDashboardStats(
  batchId: number,
  today: string,
  forceRefresh = false,
): Promise<DashboardStats> {
  const key = cacheKey(batchId, today)
  if (!forceRefresh) {
    const cached = readCache(key)
    if (cached) return cached
  }

  try {
    const [students, todayRecords, candidates] = await Promise.all([
      getStudents(),
      getQuranDailyRecords(batchId, today),
      getExamCandidates(),
    ])

    // فلتر طلاب الدفعة النشطين
    const batchStudents = students.filter(
      s => s.batch_id === batchId && (s.status === 'active' || !s.status),
    )

    // من سجّل اليوم
    const recordedIds = new Set(todayRecords.map(r => r.student_id))
    const notRecorded = batchStudents.filter(s => !recordedIds.has(s.id))

    // قريبو الاختبار في هذه الدفعة
    const nearExam = candidates.filter(c => c.batch_id === batchId)

    const total = batchStudents.length
    const recorded = total - notRecorded.length

    const stats: DashboardStats = {
      totalStudents:    total,
      recordedToday:    recorded,
      notRecordedToday: notRecorded.length,
      recordedPct:      total > 0 ? Math.round((recorded / total) * 100) : 0,
      nearExamCount:    nearExam.length,
      notRecordedNames: notRecorded.slice(0, 10).map(s => s.name),
    }

    writeCache(key, stats)
    return stats
  } catch (err) {
    console.error('getDashboardStats:', err)
    return EMPTY_STATS
  }
}

// ─── دالة مساعدة لجلب الدفعات (للـCEO) ─────────────────────────
export async function getDashboardBatches(): Promise<DBBatch[]> {
  try { return await getBatches() }
  catch { return [] }
}
