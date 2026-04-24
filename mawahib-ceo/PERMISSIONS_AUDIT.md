# تدقيق الصلاحيات — Permissions Audit

تاريخ التدقيق: ١٧ أبريل ٢٠٢٦ — فرع `fix/team-feedback-batch1`

## السياق

التطبيق يعتمد أساساً على **Supabase Row-Level Security (RLS)** كطبقة الحماية
الأساسية. العميل (browser) يتحدث مباشرة إلى Supabase عبر `@supabase/ssr` باستخدام
JWT المستخدم، فتُطبَّق سياسات RLS تلقائياً على كل استعلام. API Routes المعدودة
في التطبيق (`app/api/*`) تستخدم `supabaseAdmin` (service role key) الذي يتخطى RLS،
لكنها تتحقق يدوياً من الدور عبر `requireAuth()` قبل أي عملية.

## ملخص نقاط الصلاحيات

| المورد / Endpoint | نوع الحماية | القراءة | الكتابة |
|-------------------|-------------|---------|---------|
| `profiles` | RLS | صاحب الحساب + ceo | ceo فقط |
| `students` | RLS | ceo، batch_manager (دفعته)، supervisor/teacher (دفعته) | ceo، batch_manager/supervisor (دفعته فقط — مع WITH CHECK) |
| `supervisors` | RLS | ceo، batch_manager (دفعته)، supervisor/teacher | ceo، batch_manager (دفعته) |
| `batches` | RLS | كل مسجّل | ceo فقط |
| `exams` | RLS | كل مسجّل (read-only للدفعات الأخرى) ✅ | ceo، batch_manager/supervisor (دفعته فقط) |
| `meetings` | RLS | كل مسجّل | ceo |
| `programs` | RLS | ceo، batch_manager/supervisor/teacher (دفعته + 'all') | ceo، batch_manager/supervisor (دفعته فقط، لا يطال 'all') |
| `attendance` | RLS | ceo، batch_manager/supervisor (دفعته) | نفس الصلاحيات |
| `juz_progress` | RLS | ceo، batch_manager/supervisor (طلاب دفعته) | نفس |
| `matn_progress` | RLS | ceo، batch_manager/supervisor (طلاب دفعته) | نفس |
| `followups` | RLS | ceo، batch_manager، supervisor | نفس |
| `notifications` | RLS | ceo كل شيء، batch_manager/supervisor حسب `target_role/target_user_id` | نفس |
| `escalations` | RLS | ceo/batch_manager كامل، supervisor قراءة (طلاب دفعته) | ceo/batch_manager |
| `weekly_plans` | RLS | ceo/batch_manager كامل، supervisor قراءة (طلاب دفعته) | ceo/batch_manager |
| `automation_logs` | RLS | ceo/batch_manager | نفس |
| `ceo_tasks` | RLS | ceo فقط | ceo فقط |
| `/api/notifications` GET/PATCH | `requireAuth` (أي مسجّل) | يفلتر حسب `target_role` | — |
| `/api/notifications` DELETE | `requireAuth(['ceo'])` | — | ceo فقط |
| `/api/cron/*` | `isCronAuthorized` (secret + `x-vercel-cron`) | — | — |

## الخلل الذي وجدته قبل الإصلاح

### ١. `exams` كانت مفتوحة بالكامل ❌
السياسة القديمة:
```sql
create policy "exams_auth" on exams
  for all using (auth.uid() is not null);
```
**النتيجة:** أي مستخدم مسجَّل (بما فيه مدير الدفعة والمشرف) كان يستطيع إنشاء
وتعديل وحذف اختبارات أي دفعة. هذا ينتهك المتطلب:

> جدول الاختبارات — يعدل دفعته فقط، لكن يشوف اختبارات طلاب الدفعات الأخرى (read-only)

### ٢. `programs` بدون سياسة كتابة لمدير الدفعة ❌
كان `programs_ceo_all` وحدها تسمح بالكتابة. مدير الدفعة لم يكن يستطيع إنشاء
برامج دفعته أصلاً (لأن `programs_supervisor_read` للقراءة فقط).

### ٣. RLS تعاني من تكرار Recursive ⚠️
جميع السياسات كانت تفعل:
```sql
exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'ceo')
```
داخل RLS الخاصة بجدول `profiles` نفسه وبقية الجداول. هذا يجبر Postgres على
تقييم RLS داخل RLS — يبطئ كل استعلام بـ ٢٠-٥٠ ms على الأقل، وأحياناً يسبب
recursion detection errors حسب تكوين Supabase.

### ٤. `profiles_role_check` لا يشمل `batch_manager` ❌
السكيما الأصلية:
```sql
check (role in ('ceo', 'supervisor', 'teacher'))
```
لكن `lib/auth.ts` يعرِّف `UserRole = 'ceo' | 'batch_manager' | 'supervisor' | 'teacher'`.
مهاجرة `supabase-batch-manager-migration.sql` أصلحت هذا، لكنّا نؤكده هنا.

### ٥. `students_manager_full` بدون `WITH CHECK` ⚠️
السياسة كانت تسمح بـ UPDATE يعدل `batch_id` إلى دفعة أخرى (هروب من النطاق).
أضفنا `WITH CHECK` تضمن أن الصف بعد التحديث لا يزال ضمن دفعة المستخدم.

## ما الذي أُصلح

### ملف جديد: `supabase-auth-perf-migration.sql`
- أنشأ `public.current_user_role()` و `public.current_user_batch_id()` كدوال
  `SECURITY DEFINER STABLE` — تكسر دورة RLS المتكررة.
- استبدل كل سياسات `profiles/students/supervisors/batches/attendance/juz/meetings/programs/followups/ceo_tasks`
  بصيغة تستخدم الدالة بدل subquery.
- ضمّن `batch_manager` في `profiles_role_check`.

### ملف جديد: `supabase-batch-scope-migration.sql`
- **exams**: استبدل `exams_auth` بثلاث سياسات: قراءة للجميع، كتابة `ceo`، كتابة
  `batch_manager/supervisor` لدفعتهم مع `WITH CHECK`.
- **programs**: أضاف `programs_manager_write` و `programs_supervisor_write`
  لدفعتهم فقط (لا يطالون `batch_id = 'all'`). `programs_supervisor_read` وسّعها
  لتشمل `batch_manager`.
- **students/supervisors/attendance/juz_progress/matn_progress**: أعاد تعريف
  سياسات `batch_manager` مع `WITH CHECK` صارم لمنع تغيير `batch_id` إلى دفعة أخرى.
- استخدم الدوال المساعدة الجديدة بدل subquery على profiles — أسرع وأقل عرضة للأخطاء.

## طبقات الحماية

```
┌─────────────────────────────────────────────────┐
│ 1. Middleware (middleware.ts)                   │
│    – يمنع الوصول لأي مسار غير /login و /api/cron │
│      بدون جلسة.                                  │
├─────────────────────────────────────────────────┤
│ 2. Sidebar filter (components/layout/Sidebar)   │
│    – يخفي الروابط التي لا يملكها الدور.            │
│      (UX فقط، ليس حماية.)                        │
├─────────────────────────────────────────────────┤
│ 3. API Routes (lib/api-auth.requireAuth)         │
│    – تحقق JWT + دور (عند الحاجة).                 │
├─────────────────────────────────────────────────┤
│ 4. Supabase RLS (الطبقة الأساسية)                │
│    – على كل جدول: قراءة/كتابة حسب                │
│      current_user_role() و                       │
│      current_user_batch_id().                   │
└─────────────────────────────────────────────────┘
```

## ماذا بقي لفعله

١. **تشغيل الهجرات على Supabase الإنتاجي:**
```
Supabase → SQL Editor → شغّل الملفين بالترتيب:
   1. supabase-auth-perf-migration.sql
   2. supabase-batch-scope-migration.sql
```

٢. **اختبار يدوي بحساب `batch_manager`:**
- جرّب إنشاء/تعديل اختبار لدفعة غير دفعتك → يجب أن يفشل بـ 403/42501.
- جرّب إنشاء برنامج بـ `batch_id = 'all'` → يجب أن يفشل.
- جرّب تغيير `batch_id` لطالب من دفعتك إلى دفعة أخرى → يجب أن يفشل.
- يجب أن ترى جدول الاختبارات (كل الدفعات) كقراءة فقط.

٣. **إضافة API خاصة لحذف طالب أو اختبار** إن رغبنا في تدقيق إضافي على
الخادم (حالياً RLS تكفي).

٤. **audit log**: كل كتابة من `batch_manager` على جداول الدفعة تُسجَّل (لم يُنفذ
في هذه الدفعة من الإصلاحات).
