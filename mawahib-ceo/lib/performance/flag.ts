/**
 * Performance Reports Feature Flag.
 * Controlled by NEXT_PUBLIC_PERFORMANCE_REPORTS_ENABLED env var.
 * إذا غير مفعّل، الرابط لا يظهر في الـSidebar والـroute يعيد للـdashboard.
 */
export const PERFORMANCE_REPORTS_ENABLED =
  process.env.NEXT_PUBLIC_PERFORMANCE_REPORTS_ENABLED === 'true'
