# تقرير تدقيق مشروع Mawahib CEO

> المدقق: Principal QA (Claude Agent)
> التاريخ: 2026-04-16
> الفرع: `audit-phase-abcd-2026-04-16`
> المسار: `/Users/aboez/.claude/worktrees/agent-a3b0f9d3/mawahib-ceo`

يبني هذا التقرير على ما تمّ في الجولات السابقة (إصلاحات Supabase pagination، الـ cache invalidation في `lib/db.ts`، فهارس قاعدة البيانات في `audit-migrations/`، وإصلاح Recharts `debounce` لـ React 19) ولا يُعيد تدقيقها.

## المرحلة الأمنية

### 1) مسارات الـ API (`app/api/**`)

| المسار | المصادقة | الدور | ملاحظات |
|---|---|---|---|
| `GET/PATCH /api/notifications` | ✅ `requireAuth` | يفلتر حسب `target_role` | يستخدم `supabaseAdmin` (Service Role) — ضروري التأكد أن RLS لا يُعتمد عليه هنا. |
| `DELETE /api/notifications` | ✅ `requireAuth(['ceo'])` | CEO فقط | جيد. |
| `POST /api/cron/weekly-report` | ✅ `isCronAuthorized` (سر + Vercel header) | — | جيد. |
| `POST /api/cron/weekly-content` | ✅ `isCronAuthorized` | — | جيد. |
| `POST /api/cron/escalation-check` | ✅ `isCronAuthorized` | — | جيد. |
| `GET /api/cron/followup-escalation` | ⚠️ → ✅ **تم الإصلاح** | — | كان فيه ثغرة: لو `CRON_SECRET` غير معرَّف، كان `Bearer undefined` يمر. أُصلح ليرفض بوضوح ويقبل `x-vercel-cron` أيضًا. |

### 2) ثغرة في `requireAuth` (تمّ إصلاحها)
في `lib/api-auth.ts` السطر الأصلي:
```ts
if (allowedRoles && role && !allowedRoles.includes(role)) { ... }
```
لو كان `role === null` فإن الشرط يتخطّى ويسمح للمستخدم بالدخول حتى لو كان المسار محميًّا بـ `allowedRoles`. تمّ التصحيح ليصبح:
```ts
if (allowedRoles && (!role || !allowedRoles.includes(role))) { ... }
```

### 3) أسرار مضمَّنة في الكود (Hardcoded)

| الملف | المشكلة | الحالة |
|---|---|---|
| `setup-auth.mjs` | URL Supabase حقيقي + ANON key + **كلمة مرور CEO** (`Mawahib@2026`) | ✅ تم نقلها إلى `process.env` |
| `app/(main)/admin/users/page.tsx:188` | كلمة مرور افتراضية `'Mawahib@2026'` عند الإعادة | ✅ أُزيلت والحقل أصبح إلزاميًا (≥8 أحرف) |

> **تحذير للمستخدم:** لأن هذه الأسرار كانت في الـ history، يُنصح بتغيير كلمة مرور حساب الـ CEO على Supabase وتدوير (rotate) الـ ANON key أيضًا — حذفها من الكود لا يمحوها من Git history.

### 4) `dangerouslySetInnerHTML`
موقع واحد فقط:
- `app/layout.tsx:35` — سكربت inline لقراءة `localStorage` وضبط `data-theme`. المحتوى ثابت وحرفي (لا يقبل مدخلات مستخدم). **آمن**.

### 5) RLS — ما لم أستطع التحقق منه
لا يمكن التحقق من سياسات RLS بدون وصول لـ Supabase. المسؤولية الأمنية الحقيقية تقع على RLS لأن:
- `lib/supabase.ts` يستخدم ANON key من المتصفح (مكشوف).
- الصفحات تعتمد `supabase.from('...').select()` مباشرة من المتصفح.
- UI-level gating (عبر `role` في `user_metadata`) قابل للتجاوز.

**الجداول الحرجة المطلوب التحقق من RLS لها (يدويًا عبر Supabase dashboard):**
- `students` — يجب أن يقرأ المشرف فقط طلابه، والمدير فقط دفعته.
- `juz_progress` — نفس القيد أعلاه.
- `exams` — CEO فقط للكتابة؛ قراءة حسب النطاق.
- `profiles` — CEO فقط للكتابة.
- `notifications` — قراءة حسب `target_role`.

### ملخص الإصلاحات الأمنية المطبَّقة
- commit: «أمن: إغلاق ثغرات في المصادقة وإزالة كلمات مرور مُضمَّنة»

---

## المرحلة الأدائية (صفحات)

### 1) N+1 في الحلقات
بحث عن أنماط `for (const x of ...) { await supabase... }` أو `.map(async ...)` داخل الصفحات:
- **لا توجد N+1 ظاهرة داخل الصفحات**. الـ loops الموجودة (مثل `app/(main)/students/page.tsx:47`) تعمل على بيانات مجلوبة مسبقًا في استعلام واحد (`juzRows`) ثم تبني خريطة في الذاكرة — الأسلوب الصحيح.
- في `app/api/cron/followup-escalation/route.ts` داخل حلقة `for (const plan of plans)` يوجد `await supabase.from('followup_escalations').update/insert`. هذا يتم بالتتابع وليس N+1 من قراءة الجداول — لكن يُمكن تحسينه عبر `.upsert()` بدفعة واحدة. **وثَّقْته للمرجع.**

### 2) `'use client'` غير الضروري
22 ملفًا تحت `app/` يحمل التوجيه. كل الصفحات تحت `app/(main)/*` تستعمل `useState`/`useEffect` + Supabase client SDK في المتصفح، فتوجيه `'use client'` مبرَّر بحكم الواقع (المشروع اختار استراتيجية client-side data fetching بالكامل).
- **توصية معمارية (لا إصلاح فوري):** نقل عرض القوائم الثقيلة (`students`, `attendance`, `exams`) إلى Server Components باستخدام service role مع التحقق من الدور، يقلّل bundle ويحمي البيانات أفضل من RLS فقط.

### 3) `<img>` الخام
- **صفر** (لا توجد `<img>` في ملفات `.tsx`/`.jsx`).

### 4) أحجام الحزم (First Load JS)
Next.js 16.2.2 مع Turbopack لا يطبع جدول الأحجام بنفس التنسيق القديم في output الـ build. الـ routes كلها نجحت في البناء كـ Static أو Dynamic. لم أرصد تحذيرًا من Next.js حول صفحات تتجاوز 300KB.
- **توصية:** تشغيل `@next/bundle-analyzer` يدويًا على CI للحصول على أحجام دقيقة لكل صفحة.

### ملاحظة جانبية
ملف `lib/quran-followup.ts` كان **مفقودًا** تمامًا من المستودع — كان المشروع يفشل في البناء. أضفته بمحتوى بسيط (`getEscalationLevel`) ليبني المشروع. **يجب مراجعة حدود التصعيد** لأني اخترتها محافظة (1 → supervisor، 2 → manager، 3 → director، 4+ → ceo).

---

## نتائج اختبار الحمل

> الخادم: `next start` (production build) محليًا على `localhost:3000`
> بدون قاعدة بيانات حقيقية (ENV dummy) — تقيس الـ overhead الصرف لـ Next.js + middleware.

| السيناريو | Connections | Duration | Avg Latency | p97.5 | p99 | Avg Req/s | مجموع الطلبات | 2xx |
|---|---|---|---|---|---|---|---|---|
| `/` | 100 | 15s | 20.7 ms | 31 ms | 41 ms | 4,711 | 71k | 0 (307 redirect) |
| `/login` | 100 | 15s | 24.65 ms | 34 ms | 45 ms | 3,972 | 60k | ✅ جميعها |
| `/dashboard` | 50 | 15s | 10.79 ms | 20 ms | 28 ms | 4,435 | 67k | 0 (307 redirect) |

**تفسير:**
- `/` و `/dashboard` يُعيدان `307` من الـ middleware (إعادة التوجيه لـ `/login` للمستخدمين غير المسجلين) — هذا السلوك الصحيح وبسرعة ممتازة.
- `/login` يرسل HTML كاملاً (~16KB) ويحقق ~4,000 RPS بـ p99 = 45ms محليًا. أداء ممتاز لطبقة Next.js.
- **القيد الحقيقي على الأداء في الإنتاج هو Supabase** (شبكة + استعلامات). الإصلاحات السابقة على `lib/db.ts` (pagination, caching, indexes) هي ما يحدد p99 تحت الحمل الحقيقي.

---

## المشاكل الصغيرة (Nitpicks)

### 1) `<img>` الخام
- **لا توجد** (✓).

### 2) `dir="ltr"` في سياق RTL
- 8 مواضع؛ كلها **صحيحة** (حقول بريد إلكتروني/كلمة مرور في `login/page.tsx` و `admin/users/page.tsx`). لا حاجة لتغيير.

### 3) أرقام عربية/لاتينية
- `toLocaleString('ar...')` يُستخدم في ملفين فقط: `programs/page.tsx`, `matn/page.tsx`.
- باقي الصفحات تعرض الأرقام كـ ASCII مباشرةً. **عدم تناسق** — إما توحيد كل العرض على اللاتيني (الأسهل للأرقام في الواجهات الإدارية) أو إضافة helper موحَّد `formatNumber(n)` لكل الواجهة.
- **توصية (لم أطبّقها لأنها تغيير عرضي واسع):** إنشاء `lib/i18n-numbers.ts` وتوحيد الاستخدام.

### 4) النماذج بدون Validation
- نموذج واحد فقط (`app/login/page.tsx`) يستعمل `onSubmit`. يعتمد على `<input type="email" required>` من HTML — مقبول لنموذج تسجيل دخول. لا trim() للـ email لكن Supabase يتعامل معه. **خفيف.**

### 5) Tap targets < 44px
- 21 موضعًا يستخدم `h-6`, `w-6`, `h-7`, `w-7` على tsx. أغلبها أيقونات داخل أزرار أكبر (آمنة).
- مواضع تستحق المراجعة اليدوية: `batches/page.tsx` (8)، `matn/page.tsx` (4)، `admin/dashboard/page.tsx` (3).
- **توصية:** جعل أي زر فعلي في الشاشات الإدارية `min-h-11 min-w-11` (Tailwind ≥ 44px).

### 6) Empty states
لم أنفذ فحصًا منهجيًا لكل صفحة (يتطلب تشغيل مستخدم). **مشاهدات عينة:**
- `students/page.tsx` يتحقق من طول المصفوفة قبل العرض (✓).
- `notifications/page.tsx` — يلزم التأكد من رسالة «لا توجد إشعارات» عند الفراغ.
- **توصية:** إنشاء مكوّن موحَّد `<EmptyState title="..." icon={...} />` واستخدامه في كل جدول/قائمة.

### 7) تحذير معماري
Next.js 16 يحذر: `middleware` file convention deprecated → استخدم `proxy`. ملف `middleware.ts` موجود بالاسم القديم. **توصية مستقبلية** (لم أغيّره لتجنّب كسر التوجيهات بدون اختبار شامل).

---

## خلاصة تنفيذية

أعلى 5 نتائج عبر المراحل الأربع:

1. **ثغرة تجاوز المصادقة في `requireAuth`** — null role كان يتخطى فحص `allowedRoles`. (أُصلحت)
2. **كلمة مرور CEO مضمَّنة في الكود** في `setup-auth.mjs` وكـ fallback في `admin/users`. (أُزيلت — لكن يلزم دوران الكلمة عند المستخدم لأنها في Git history)
3. **`followup-escalation` cron** كان يقبل `Bearer undefined` لو لم يُضبط `CRON_SECRET`. (أُصلحت)
4. **`lib/quran-followup.ts` مفقود من المستودع** — البناء كان معطلاً. (أُعيد بمحتوى محافظ؛ يحتاج مراجعة)
5. **الاعتماد الكامل على client-side Supabase مع ANON key** — الأمن يقوم كليًا على RLS في Supabase. لم أتمكن من التحقق منه؛ **يجب مراجعة سياسات RLS يدويًا** للجداول: `students`, `juz_progress`, `exams`, `profiles`, `notifications`.

الأداء المحلي (Next.js layer) ممتاز: p99 ≤ 45ms على `/login` تحت 100 اتصال متزامن. عنق الزجاجة في الإنتاج يبقى Supabase، وقد عالجته الجولات السابقة.
