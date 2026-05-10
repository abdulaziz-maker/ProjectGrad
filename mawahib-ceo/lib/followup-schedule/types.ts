// ═══════════════════════════════════════════════════════
// أنواع جدول المتابعات الأسبوعي للمشرف
// ═══════════════════════════════════════════════════════

export interface FollowupScheduleEntry {
  id?: number
  supervisor_id: string
  student_id: string
  /** 0=الأحد ... 4=الخميس ... 6=السبت */
  day_of_week: number
  /** true = يتكرر كل أسبوع (week_start = NULL) */
  is_repeating: boolean
  /** لو is_repeating=false، هذا الأسبوع المحدد (تاريخ السبت بدايته) */
  week_start?: string | null
  notes?: string | null
  created_at?: string
}

export const DAY_NAMES = [
  { num: 6, name: 'السبت',   short: 'سبت' },
  { num: 0, name: 'الأحد',   short: 'أحد' },
  { num: 1, name: 'الإثنين', short: 'اثنين' },
  { num: 2, name: 'الثلاثاء', short: 'ثلاثاء' },
  { num: 3, name: 'الأربعاء', short: 'أربعاء' },
  { num: 4, name: 'الخميس',  short: 'خميس' },
] as const

/** أيام أسبوع المتابعة المعتمدة (السبت→الخميس بالترتيب) */
export const FOLLOWUP_WEEK_DAYS = [6, 0, 1, 2, 3, 4] as const

export function dayName(dow: number): string {
  return DAY_NAMES.find(d => d.num === dow)?.name ?? ''
}
