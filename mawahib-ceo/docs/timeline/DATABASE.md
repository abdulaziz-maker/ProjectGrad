# Timeline — Database Schema (Phase 1)

كل الجداول بـ `timeline_` prefix. **لا تعديل على أي جدول قائم.**

## الجداول السبعة

| الجدول | الغرض | العلاقات |
|--------|--------|----------|
| `timeline_calendars` | السنة الأكاديمية (هجري + ميلادي) | — |
| `timeline_days` | أيام التقويم (دراسة/إجازة/اختبار/نهاية أسبوع) | FK → `timeline_calendars` |
| `timeline_activity_types` | أنواع الأنشطة (نظام مرن) | — |
| `timeline_activities` | الأنشطة المخططة | FK → **`batches(id)`** (موجود)، `timeline_calendars`, `timeline_activity_types` |
| `timeline_activity_costs` | تكاليف كل نشاط | FK → `timeline_activities` |
| `timeline_plan_templates` | قوالب الخطط للاستنساخ السنوي | FK → `batches(id)` (nullable) |
| `timeline_audit_log` | سجل التعديلات | FK → `timeline_activities` (nullable) |

## Seed data (6 أنواع نظام)

| `name` | `arabic_name` | `cost_model` |
|--------|---------------|--------------|
| `intensive_course` | دورة مكثفة | `lump_sum` (15,000) |
| `weekly_club` | نادي أسبوعي | `per_student` (50/طالب) |
| `overnight` | مبيت | `per_student` (150/طالب) |
| `field_trip` | سفرة | `detailed` |
| `energy_day` | يوم همة | `lump_sum` (3,000) |
| `memorization_show` | عرض محفوظ | `lump_sum` (2,000) |

كل الأنواع `is_system = true` — لا تُحذف ولكن تُعدَّل قيمها الافتراضية.

## RLS Summary

| الجدول | SELECT | INSERT/UPDATE/DELETE |
|--------|--------|---------------------|
| `timeline_calendars` | الجميع | CEO + records_officer |
| `timeline_days` | الجميع | CEO + records_officer |
| `timeline_activity_types` | الجميع | CEO + records_officer |
| `timeline_activities` | الجميع | CEO + records_officer (كل)، batch_manager/supervisor/teacher (دفعتهم فقط) |
| `timeline_activity_costs` | الجميع | يرث صلاحيات النشاط الأب (CEO كامل، الآخرون دفعتهم) |
| `timeline_plan_templates` | الجميع | CEO + records_officer |
| `timeline_audit_log` | CEO + records_officer | insert only — `performed_by` يجب أن يطابق `auth.uid()` |

## Indexes

- `timeline_calendars`: `(is_active) WHERE is_active = true`
- `timeline_days`: `(calendar_id, gregorian_date)`, `(calendar_id, day_type)`
- `timeline_activities`: `(batch_id, calendar_id)`, `(start_date, end_date)`, `(status)`
- `timeline_activity_costs`: `(activity_id)`
- `timeline_plan_templates`: `(batch_id)`
- `timeline_audit_log`: `(activity_id, performed_at DESC)`

## Triggers

- `trg_timeline_activities_updated`: يحدّث `updated_at` قبل كل UPDATE.
- `timeline_set_updated_at()`: `SECURITY INVOKER` + `SET search_path = ''` (آمن).

## Migration timestamps

| المايجريشن | الغرض |
|-------------|--------|
| `timeline_phase1_schema` | إنشاء الـ 7 جداول + indexes + RLS |
| `timeline_phase1_seed_activity_types` | إضافة الـ 6 أنواع الافتراضية |
| `timeline_phase1_security_hardening` | إصلاح `search_path` + تشديد audit insert |
