# Timeline — Executive Schedule Feature

## الغرض

نظام تخطيط زمني تفاعلي يحلّ محلّ ملف Google Sheets للخطة التزمينية. يربط:
1. **القوالب** (قواعد ثابتة — "٣ دورات مكثفة/سنة") — لا تتغير.
2. **التقويم الأكاديمي** (هجري + ميلادي — إجازات/اختبارات/دراسة) — يتغير سنوياً.
3. **الأنشطة المُولَّدة** (ناتج تطبيق القالب على التقويم) — قابلة للتعديل.

## المبدأ المعماري الذهبي

**فصل القالب عن التقويم.**
مدير المرحلة يحصل على خطة مرسومة تلقائياً لما يتغيّر التقويم السنوي — ما يعيد الخطة من الصفر.

## الحالة الحالية

- ✅ **Phase 1 — Schema + Seed**: قاعدة البيانات جاهزة، 7 جداول بـ RLS محكم، 6 أنواع أنشطة افتراضية.
- ⏳ **Phase 2**: طبقة الوصول للبيانات (`lib/timeline/db.ts` + hooks) + هيكل صفحة `/timeline` مع feature flag.
- ⏳ **Phase 3**: استيراد التقويم الأكاديمي (CSV + hijri-converter).
- ⏳ **Phase 4**: شبكة Timeline الأساسية (شهر بشهر مع virtualization).
- ⏳ **Phase 5**: السحب والإفلات (dnd-kit) + اعتماد الأنشطة.
- ⏳ **Phase 6**: التكاليف + التقارير + قوالب الاستنساخ السنوي.

## المستودعات المنفصلة (Isolation)

```
app/(main)/timeline/         ← صفحات الميزة
components/timeline/         ← كومبوننتات معزولة
lib/timeline/                ← طبقة DB + helpers
hooks/timeline/              ← hooks مخصصة
types/timeline.ts            ← كل types الميزة
docs/timeline/               ← هذا المجلد
```

## لا تلمس هذي

- `components/layout/Sidebar.tsx` — الصلة بالميزة تكون عن طريق رابط واحد يُضاف في Phase 2.
- `components/layout/Header.tsx`
- `contexts/AuthContext.tsx`
- `lib/db.ts` (الحالي)
- أي ملف `app/(main)/{students,batches,exams,...}` قائم.
- `middleware.ts`
- أي جدول قائم في Supabase.

## التوثيق

- [DATABASE.md](./DATABASE.md) — الجداول + RLS + indexes.
- [ROLLBACK.md](./ROLLBACK.md) — إزالة الميزة بأمان.
- (قادم) `API.md` — طبقة الوصول.
- (قادم) `COMPONENTS.md` — مرجع المكوّنات.

## المكتبات الجديدة المتفق عليها

| المكتبة | الغرض | الحجم التقريبي |
|---------|--------|-----------------|
| `@dnd-kit/core` + `@dnd-kit/sortable` | السحب والإفلات | ~45 KB |
| `hijri-converter` | تحويل هجري ↔ ميلادي | ~15 KB |
| `papaparse` | استيراد CSV للتقويم | ~40 KB |
| `@tanstack/react-virtual` | virtualization للشبكة الطويلة | ~12 KB |

كلها في القائمة البيضاء للـ "قواعد الحماية الإجبارية".
