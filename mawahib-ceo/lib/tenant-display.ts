/**
 * أسماء العرض للحلقات (Tenant Display Names).
 *
 * مرتبطة بـ`tenants.id` في DB:
 *   1 → المواهب الناشئة
 *   2 → نبوغ
 *
 * الاستخدام: في أي مكوّن UI، اقرأ `profile.tenant_id` من `useAuth()`
 * ومرّره هنا للحصول على الاسم العربي المعروض.
 */
const TENANT_DISPLAY_NAMES: Record<number, string> = {
  1: 'المواهب الناشئة',
  2: 'نبوغ',
}

/** الاسم الافتراضي لو لم يُحدَّد tenant بعد (قبل تحميل الجلسة) */
const DEFAULT_TENANT_NAME = 'المواهب الناشئة'

/**
 * يُرجع اسم الحلقة المعروض حسب `tenant_id`.
 * يقبل `null`/`undefined` ويرجع الاسم الافتراضي.
 */
export function getTenantDisplayName(tenantId: number | null | undefined): string {
  if (tenantId == null) return DEFAULT_TENANT_NAME
  return TENANT_DISPLAY_NAMES[tenantId] ?? DEFAULT_TENANT_NAME
}
