# تدقيق الشريط الجانبي — Sidebar Audit

تاريخ التدقيق: ١٧ أبريل ٢٠٢٦ — فرع `fix/team-feedback-batch1`

## الهدف

حصر كل صفحات التطبيق (`app/**/page.tsx`) ومقارنتها بالروابط الموجودة في
`components/layout/Sidebar.tsx`، ثم إضافة ما نقص، وتوثيق ما بقي مقصوداً خارج القائمة.

## جدول الصفحات

| المسار | الصلاحيات | حالة الظهور | ملاحظة |
|--------|-----------|-------------|--------|
| `/admin/dashboard` | ceo | ظاهر (مسبقاً) | "لوحة التحكم" للمدير التنفيذي |
| `/admin/users` | ceo | ظاهر (مسبقاً) | "إدارة الحسابات" |
| `/admin/bulk-plan` | ceo | **أُضيف** ✅ | "إنشاء خطة جماعي" (كان مخفي) |
| `/tasks` | ceo | ظاهر (مسبقاً) | "مهامي اليومية" |
| `/budget` | ceo | ظاهر (مسبقاً) | "الميزانية والعهد" |
| `/settings` | ceo | ظاهر (مسبقاً) | "الإعدادات" |
| `/supervisors` | ceo | ظاهر (مسبقاً) | "المشرفون والمعلمون" |
| `/matn/manage` | ceo | **أُضيف** ✅ | "إدارة المتون" (كان Orphan route) |
| `/manager/dashboard` | batch_manager | ظاهر (مسبقاً) | "لوحة الدفعة" |
| `/manager/supervisors` | batch_manager | ظاهر (مسبقاً) | "مشرفو دفعتي" |
| `/manager/assignments` | batch_manager | **أُضيف** ✅ | "تكليف المشرفين" (كان مخفي) |
| `/manager/reports` | batch_manager | ظاهر (مسبقاً) | "تقارير الدفعة" |
| `/followups/manager` | batch_manager | **أُضيف** ✅ | "متابعات الدفعة" (كان مخفي) |
| `/dashboard` | supervisor, teacher | ظاهر (مسبقاً) | "لوحة التحكم" للمشرف |
| `/followups` | supervisor, teacher, ceo | **أُضيف** ✅ | "المتابعات" (كان مخفي) |
| `/followups/checklist` | supervisor, teacher | **أُضيف** ✅ | "قائمة اليوم" (كان مخفي) |
| `/batches` | مشترك | ظاهر (مسبقاً) | "خريطة الطلاب والحفظ" |
| `/matn` | مشترك | ظاهر (مسبقاً) | "رصد المتون" |
| `/exams` | مشترك | ظاهر (مسبقاً) | "جدول الاختبارات" |
| `/students` | مشترك | ظاهر (مسبقاً) | "الطلاب" |
| `/attendance` | مشترك | ظاهر (مسبقاً) | "الحضور والغياب" |
| `/programs` | مشترك | ظاهر (مسبقاً) | "البرامج التربوية" |
| `/meetings` | مشترك | ظاهر (مسبقاً) | "الاجتماعات" |
| `/reports` | مشترك | ظاهر (مسبقاً) | "التقارير" |
| `/notifications` | مشترك | ظاهر (مسبقاً) | "الإشعارات" |
| `/reminders/saved` | مشترك | **أُضيف** ✅ | "التذكيرات المحفوظة" (كان مخفي) |

## صفحات خارج الشريط الجانبي عن قصد

| المسار | السبب |
|--------|-------|
| `/` | صفحة جذر تعيد التوجيه حسب الجلسة |
| `/login` | صفحة عامة قبل المصادقة |
| `/quran` | تعيد التوجيه إلى `/batches` (redirect فقط) |
| `/matn/assess` | تُفتح بمعاملات استعلام `?studentId=...&unitId=...` من داخل `/matn` (ليست نقطة دخول مستقلة) |
| `/students/[id]` | صفحة تفصيل (dynamic) تُفتح من جدول الطلاب |
| `/followups/plan/[studentId]` | صفحة تفصيل خطة طالب تُفتح من جدول المتابعات |
| `/notifications` (api) | موجود في الشريط لكن النسخة API `app/api/notifications/route.ts` ليست صفحة |
| `/api/cron/*` | مهام مجدولة (crons) تُنفذ بواسطة Vercel، ليست صفحات |

## الإصلاحات المُنفَّذة في Sidebar

### ١. استيراد أيقونات جديدة
أُضيفت: `ClipboardList, Target, ArrowLeftRight, BookHeart` من `lucide-react`.

### ٢. بنود جديدة حسب الدور

```tsx
// batch_manager
{ href: '/manager/assignments',  icon: ArrowLeftRight,  label: 'تكليف المشرفين',  ... }
{ href: '/followups/manager',    icon: ClipboardList,   label: 'متابعات الدفعة',  ... }

// supervisor / teacher
{ href: '/followups',            icon: ClipboardList,   label: 'المتابعات',       ... }
{ href: '/followups/checklist',  icon: ListChecks,      label: 'قائمة اليوم',     ... }

// ceo
{ href: '/admin/bulk-plan',      icon: Target,          label: 'إنشاء خطة جماعي', ... }
{ href: '/matn/manage',          icon: BookOpen,        label: 'إدارة المتون',    ... }

// مشترك (كل الأدوار)
{ href: '/reminders/saved',      icon: BookHeart,       label: 'التذكيرات المحفوظة', ... }
```

### ٣. الفلترة حسب الدور

الكود القائم في `Sidebar.tsx` (لم يُغيَّر):

```ts
const visibleItems = navItems.filter(item => !item.roles || item.roles.includes(role))
```

هذه الآلية تضمن أن:
- **المدير التنفيذي (ceo):** يشوف كل البنود التي دوره ضمنها أو بدون قيود أدوار.
- **مدير الدفعة (batch_manager):** يشوف بنوده الخاصة + البنود المشتركة فقط.
- **المشرف/المعلم (supervisor/teacher):** يشوف بنوده + المشتركة فقط.

## ملخص

- **٧ بنود** أُضيفت إلى الشريط الجانبي كانت صفحاتها موجودة في المشروع لكن غير مربوطة.
- **٥ صفحات** تُركت خارج الشريط عن قصد (تفصيل، تحويلات، أو تُفتح من داخل صفحات أخرى).
- لا توجد حالياً أي صفحة `page.tsx` داخل `app/(main)/` غير مُغطّاة.
