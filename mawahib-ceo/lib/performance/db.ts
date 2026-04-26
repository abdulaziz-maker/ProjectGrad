/**
 * طبقة الوصول لجداول تقارير الأداء.
 * كلها تستعمل Supabase RLS — ما يرجع للمستخدم إلا اللي يخوّله بـRLS.
 */
import { supabase } from '@/lib/supabase'
import type {
  ReportSubject, SubjectExclusion, PerformancePeriod, PerformanceEntry,
  EntryColumnKey, SubjectTrack, SubjectColumnsKind, PeriodType,
} from './types'

// ─── المساقات ──────────────────────────────────────────────────────────
export async function getSubjects(batchId?: number | null): Promise<ReportSubject[]> {
  let q = supabase.from('report_subjects')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
  if (batchId != null) {
    // للدفعة المحدّدة + المساقات العامة (batch_id IS NULL)
    q = q.or(`batch_id.is.null,batch_id.eq.${batchId}`)
  }
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as ReportSubject[]
}

export async function createSubject(input: {
  name: string
  track: SubjectTrack
  columns_kind: SubjectColumnsKind
  single_label?: string | null
  unit?: string | null
  batch_id?: number | null
  sort_order?: number
}): Promise<ReportSubject> {
  const { data, error } = await supabase.from('report_subjects')
    .insert({
      name: input.name,
      track: input.track,
      columns_kind: input.columns_kind,
      single_label: input.single_label ?? null,
      unit: input.unit ?? null,
      batch_id: input.batch_id ?? null,
      sort_order: input.sort_order ?? 999,
    })
    .select('*').single()
  if (error) throw error
  return data as ReportSubject
}

export async function updateSubject(id: string, patch: Partial<ReportSubject>): Promise<void> {
  const { error } = await supabase.from('report_subjects').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteSubject(id: string): Promise<void> {
  // soft delete
  const { error } = await supabase.from('report_subjects').update({ is_active: false }).eq('id', id)
  if (error) throw error
}

// ─── الاستثناءات ───────────────────────────────────────────────────────
export async function getExclusions(): Promise<SubjectExclusion[]> {
  const { data, error } = await supabase.from('report_subject_exclusions').select('*')
  if (error) throw error
  return (data ?? []) as SubjectExclusion[]
}

export async function setExclusion(subjectId: string, studentId: string, excluded: boolean, reason?: string): Promise<void> {
  if (excluded) {
    const { error } = await supabase.from('report_subject_exclusions')
      .upsert({ subject_id: subjectId, student_id: studentId, reason: reason ?? null },
              { onConflict: 'subject_id,student_id' })
    if (error) throw error
  } else {
    const { error } = await supabase.from('report_subject_exclusions')
      .delete()
      .eq('subject_id', subjectId)
      .eq('student_id', studentId)
    if (error) throw error
  }
}

// ─── الفترات ───────────────────────────────────────────────────────────
export async function getPeriods(batchId: number): Promise<PerformancePeriod[]> {
  const { data, error } = await supabase.from('performance_periods')
    .select('*')
    .eq('batch_id', batchId)
    .eq('is_active', true)
    .order('hijri_year', { ascending: false })
    .order('sort_order', { ascending: true })
  if (error) throw error
  return (data ?? []) as PerformancePeriod[]
}

export async function createPeriod(input: {
  batch_id: number
  period_type: PeriodType
  hijri_year: number
  term_no?: number | null
  hijri_month?: number | null
  label: string
  sort_order?: number
}): Promise<PerformancePeriod> {
  const { data, error } = await supabase.from('performance_periods')
    .insert({
      batch_id: input.batch_id,
      period_type: input.period_type,
      hijri_year: input.hijri_year,
      term_no: input.term_no ?? null,
      hijri_month: input.hijri_month ?? null,
      label: input.label,
      sort_order: input.sort_order ?? 0,
    })
    .select('*').single()
  if (error) throw error
  return data as PerformancePeriod
}

export async function deletePeriod(id: string): Promise<void> {
  // hard delete — يحذف كل entries مرتبطة عبر CASCADE
  const { error } = await supabase.from('performance_periods').delete().eq('id', id)
  if (error) throw error
}

// ─── البيانات (entries) ────────────────────────────────────────────────
export async function getEntriesForPeriod(periodId: string): Promise<PerformanceEntry[]> {
  const { data, error } = await supabase.from('performance_entries')
    .select('*').eq('period_id', periodId)
  if (error) throw error
  return (data ?? []) as PerformanceEntry[]
}

export async function upsertEntry(input: {
  period_id: string
  student_id: string
  subject_id: string
  column_key: EntryColumnKey
  expected?: number | null
  actual?: number | null
  notes?: string | null
}): Promise<PerformanceEntry> {
  const { data, error } = await supabase.from('performance_entries')
    .upsert({
      period_id: input.period_id,
      student_id: input.student_id,
      subject_id: input.subject_id,
      column_key: input.column_key,
      expected: input.expected ?? null,
      actual: input.actual ?? null,
      notes: input.notes ?? null,
    }, { onConflict: 'period_id,student_id,subject_id,column_key' })
    .select('*').single()
  if (error) throw error
  return data as PerformanceEntry
}

/**
 * نسخ قيم expected من فترة إلى فترة (مفيد لإنشاء شهر جديد بنفس
 * أرقام الشهر السابق المفترضة).
 */
export async function clonePeriodExpectations(fromPeriodId: string, toPeriodId: string): Promise<number> {
  const { data: src, error } = await supabase.from('performance_entries')
    .select('student_id,subject_id,column_key,expected')
    .eq('period_id', fromPeriodId)
  if (error) throw error
  type Src = { student_id: string; subject_id: string; column_key: string; expected: number | null }
  const rows = ((src ?? []) as Src[]).filter((r) => r.expected != null).map((r) => ({
    period_id: toPeriodId,
    student_id: r.student_id,
    subject_id: r.subject_id,
    column_key: r.column_key,
    expected: r.expected,
  }))
  if (rows.length === 0) return 0
  const { error: e2 } = await supabase.from('performance_entries')
    .upsert(rows, { onConflict: 'period_id,student_id,subject_id,column_key' })
  if (e2) throw e2
  return rows.length
}
