/**
 * Student Cases — Display helpers.
 *
 * Pure functions: labels, colors, icons, week math.
 * No I/O, no side effects — safe to call from Client or Server components.
 */
import type {
  CaseStage,
  CaseStatus,
  CaseTransitionType,
  CaseActionType,
  WeeklyReviewStatus,
} from './types'

// ─── Weekly review status ───────────────────────────────────────────
export const WEEKLY_STATUS_LABEL: Record<WeeklyReviewStatus, string> = {
  on_track:     'سير طبيعي',
  slight_delay: 'تأخر بسيط',
  severe_delay: 'تأخر كبير',
  not_reviewed: 'لم يُراجَع',
}

export const WEEKLY_STATUS_COLOR: Record<WeeklyReviewStatus, string> = {
  on_track:     'bg-emerald-50 text-emerald-700 border-emerald-200',
  slight_delay: 'bg-amber-50 text-amber-700 border-amber-200',
  severe_delay: 'bg-rose-50 text-rose-700 border-rose-200',
  not_reviewed: 'bg-slate-50 text-slate-600 border-slate-200',
}

export const WEEKLY_STATUS_DOT: Record<WeeklyReviewStatus, string> = {
  on_track:     'bg-emerald-500',
  slight_delay: 'bg-amber-500',
  severe_delay: 'bg-rose-500',
  not_reviewed: 'bg-slate-400',
}

// ─── Case stages ────────────────────────────────────────────────────
export const STAGE_LABEL: Record<CaseStage, string> = {
  stage_1_supervisor:    'المرحلة ١ — المشرف',
  stage_2_batch_manager: 'المرحلة ٢ — مدير الدفعة',
  stage_3_ceo:           'المرحلة ٣ — المدير التنفيذي',
  resolved:              'تم الحل',
  closed:                'مغلقة',
}

export const STAGE_SHORT_LABEL: Record<CaseStage, string> = {
  stage_1_supervisor:    'المشرف',
  stage_2_batch_manager: 'مدير الدفعة',
  stage_3_ceo:           'المدير التنفيذي',
  resolved:              'تم الحل',
  closed:                'مغلقة',
}

export const STAGE_COLOR: Record<CaseStage, string> = {
  stage_1_supervisor:    'bg-sky-50 text-sky-700 border-sky-200',
  stage_2_batch_manager: 'bg-amber-50 text-amber-800 border-amber-200',
  stage_3_ceo:           'bg-rose-50 text-rose-700 border-rose-200',
  resolved:              'bg-emerald-50 text-emerald-700 border-emerald-200',
  closed:                'bg-slate-100 text-slate-600 border-slate-300',
}

export const STAGE_ICON: Record<CaseStage, string> = {
  stage_1_supervisor:    'UserCheck',
  stage_2_batch_manager: 'Users',
  stage_3_ceo:           'ShieldAlert',
  resolved:              'CheckCircle2',
  closed:                'Lock',
}

// Numeric order for comparisons (resolved/closed = terminal)
export const STAGE_ORDER: Record<CaseStage, number> = {
  stage_1_supervisor:    1,
  stage_2_batch_manager: 2,
  stage_3_ceo:           3,
  resolved:              10,
  closed:                11,
}

// ─── Status ─────────────────────────────────────────────────────────
export const CASE_STATUS_LABEL: Record<CaseStatus, string> = {
  active:    'نشطة',
  improving: 'في تحسّن',
  resolved:  'تم الحل',
  closed:    'مغلقة',
}

export const CASE_STATUS_COLOR: Record<CaseStatus, string> = {
  active:    'bg-rose-50 text-rose-700 border-rose-200',
  improving: 'bg-amber-50 text-amber-700 border-amber-200',
  resolved:  'bg-emerald-50 text-emerald-700 border-emerald-200',
  closed:    'bg-slate-100 text-slate-600 border-slate-300',
}

// ─── Transitions ────────────────────────────────────────────────────
export const TRANSITION_LABEL: Record<CaseTransitionType, string> = {
  auto:            'تحرك تلقائي',
  manual_escalate: 'تصعيد يدوي',
  manual_demote:   'إعادة لمستوى أدنى',
  close:           'إغلاق',
}

// ─── Actions ────────────────────────────────────────────────────────
export const ACTION_LABEL: Record<CaseActionType, string> = {
  supervisor_meeting: 'اجتماع مع المشرف',
  parent_call:        'اتصال بولي الأمر',
  parent_meeting:     'لقاء مع ولي الأمر',
  ceo_intervention:   'تدخل المدير التنفيذي',
  plan_adjustment:    'تعديل خطة المتابعة',
  note:               'ملاحظة',
}

export const ACTION_ICON: Record<CaseActionType, string> = {
  supervisor_meeting: 'Users',
  parent_call:        'Phone',
  parent_meeting:     'Handshake',
  ceo_intervention:   'ShieldAlert',
  plan_adjustment:    'ClipboardEdit',
  note:               'StickyNote',
}

// ─── Week math ──────────────────────────────────────────────────────
/**
 * Return the Sunday (start of KSA academic week) for any given date.
 * Returns 'YYYY-MM-DD' in the LOCAL timezone.
 */
export function weekStartSunday(d: Date = new Date()): string {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  const day = x.getDay() // Sunday = 0
  x.setDate(x.getDate() - day)
  const yyyy = x.getFullYear()
  const mm = String(x.getMonth() + 1).padStart(2, '0')
  const dd = String(x.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/**
 * Best-effort Hijri week label using Intl Umm al-Qura.
 * Falls back to Gregorian start date if Intl support is missing.
 */
export function hijriWeekLabel(weekStart: string): string {
  try {
    const d = new Date(`${weekStart}T12:00:00`)
    const fmt = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
    const parts = fmt.formatToParts(d)
    const year = parts.find((p) => p.type === 'year')?.value ?? ''
    const month = parts.find((p) => p.type === 'month')?.value ?? ''
    const day = parts.find((p) => p.type === 'day')?.value ?? ''
    return `أسبوع ${day} ${month} ${year}`
  } catch {
    return `أسبوع يبدأ ${weekStart}`
  }
}

/**
 * Humanize elapsed duration into Arabic short form.
 * "منذ يومين" / "منذ 3 أسابيع" / "منذ شهر"
 */
export function timeAgoArabic(isoDate: string): string {
  const then = new Date(isoDate).getTime()
  if (Number.isNaN(then)) return ''
  const diffMs = Date.now() - then
  const sec = Math.max(0, Math.floor(diffMs / 1000))
  const min = Math.floor(sec / 60)
  const hr  = Math.floor(min / 60)
  const day = Math.floor(hr / 24)
  const week = Math.floor(day / 7)
  const month = Math.floor(day / 30)

  if (sec < 60) return 'قبل لحظات'
  if (min < 60) return `قبل ${min} دقيقة`
  if (hr < 24)  return `قبل ${hr} ساعة`
  if (day === 1) return 'أمس'
  if (day < 7)  return `قبل ${day} أيام`
  if (week < 5) return `قبل ${week} ${week === 1 ? 'أسبوع' : 'أسابيع'}`
  return `قبل ${month} ${month === 1 ? 'شهر' : 'أشهر'}`
}
