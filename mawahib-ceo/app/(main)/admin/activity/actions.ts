'use server'
/**
 * Server Actions لصفحة /admin/activity
 * يُعيد تحقّق super_admin قبل تنفيذ أي action.
 *
 * ⚠️ ملف جديد — لا يُعدّل أي ملف موجود.
 */
import { revalidatePath } from 'next/cache'
import { getActivityAuth } from '@/lib/activity/server-auth'

/** يُلغي cache الصفحة فيُعاد تشغيل الاستعلامات. */
export async function refreshActivity(): Promise<void> {
  const auth = await getActivityAuth()
  if (!auth?.isSuperAdmin) return  // silent fail — لا نفصح عن البنية
  revalidatePath('/admin/activity')
}
