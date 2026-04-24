# Timeline — Rollback Plan

مبدأ ذهبي: **"لو حذفنا الميزة، الموقع يعمل كأنها لم تكن."**

## Rollback SQL (Phase 1 فقط — قبل أي كتابة front-end)

```sql
-- ═══════════════════════════════════════════════════════════════════
-- Timeline Phase 1 — Down Migration
-- ينفَّذ فقط إذا قرر CEO التراجع قبل دخول Phase 2
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- 1) حذف الجداول (CASCADE يحذف المراجع الداخلية تلقائياً)
DROP TABLE IF EXISTS timeline_audit_log        CASCADE;
DROP TABLE IF EXISTS timeline_activity_costs   CASCADE;
DROP TABLE IF EXISTS timeline_activities       CASCADE;
DROP TABLE IF EXISTS timeline_plan_templates   CASCADE;
DROP TABLE IF EXISTS timeline_days             CASCADE;
DROP TABLE IF EXISTS timeline_calendars        CASCADE;
DROP TABLE IF EXISTS timeline_activity_types   CASCADE;

-- 2) حذف الـ trigger function
DROP FUNCTION IF EXISTS timeline_set_updated_at();

COMMIT;
```

**الأثر على الموقع:**
- `batches` لم يُعدَّل → لا خلل في الدفعات.
- `auth.users` و `user_profiles` لم يُمَسّا → لا خلل في تسجيل الدخول.
- لا RLS قديم تغيَّر → كل الصفحات تعمل.

## Rollback Code (عند تنفيذ Phase 2+)

1. احذف مجلد `app/(main)/timeline/` بالكامل.
2. احذف مجلد `components/timeline/`.
3. احذف مجلد `lib/timeline/`.
4. احذف `types/timeline.ts`.
5. احذف `hooks/timeline/` (لو أُنشئ).
6. أزل `NEXT_PUBLIC_TIMELINE_ENABLED` من Vercel envs.
7. أزل روابط Sidebar للميزة (إن وُجدت — سيُتَّفق عليها قبل إضافتها).

## Feature Flag (إضافة قبل Phase 2)

```ts
// lib/timeline/flag.ts
export const TIMELINE_ENABLED = process.env.NEXT_PUBLIC_TIMELINE_ENABLED === 'true'
```

كل route الميزة يتحقق:
```tsx
if (!TIMELINE_ENABLED) notFound()
```
