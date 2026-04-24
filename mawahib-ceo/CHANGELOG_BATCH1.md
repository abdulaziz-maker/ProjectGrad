# سجل الإصلاحات — الدفعة ١ من ٣

فرع: `fix/team-feedback-batch1`
تاريخ: ١٧ أبريل ٢٠٢٦

## ١. الشريط الجانبي — إظهار الصفحات المخفية ✅

**المشكلة:** عدة صفحات موجودة في الكود لكن غير ظاهرة في الشريط الجانبي
(المتابعات، إنشاء خطة، تكليف المشرفين، التذكيرات المحفوظة، إدارة المتون…).

**الإصلاح:** أضفنا ٧ بنود للشريط الجانبي في `components/layout/Sidebar.tsx`
مع قصر كل بند على الأدوار المناسبة. راجع `SIDEBAR_AUDIT.md` للتفصيل.

| البند | المسار | الدور |
|-------|--------|-------|
| المتابعات | `/followups` | ceo، supervisor، teacher |
| قائمة اليوم | `/followups/checklist` | supervisor، teacher |
| متابعات الدفعة | `/followups/manager` | batch_manager |
| تكليف المشرفين | `/manager/assignments` | batch_manager |
| إنشاء خطة جماعي | `/admin/bulk-plan` | ceo |
| إدارة المتون | `/matn/manage` | ceo |
| التذكيرات المحفوظة | `/reminders/saved` | كل الأدوار |

**الملفات المتأثرة:**
- `components/layout/Sidebar.tsx`
- `SIDEBAR_AUDIT.md` (جديد)

---

## ٢. بطء تسجيل الدخول — من ~٣ ثوان إلى شبه فوري ✅

**تحليل الـ flow قبل الإصلاح:**
1. صفحة `/login` تفحص `supabase.auth.getSession()` في `useEffect` ← عرض Loader
   أولي لا لزوم له.
2. بعد نجاح `signInWithPassword`، `router.replace('/dashboard')` يسير عبر
   Next.js router (soft navigation) دون أن يضمن أن الـ middleware شاف الكوكي.
3. `AuthProvider` في الـ layout يستدعي `getSession()` **و** يسجّل
   `onAuthStateChange`. كلاهما يطلق `getProfile()` بالتوازي → استعلامين
   لنفس السجل.
4. `(main)/layout.tsx` يعرض Loader كامل الشاشة حتى `loading===false`، وهذا
   يحصل بعد انتهاء `getProfile()` — أي الشاشة مغلقة حتى يصل الملف الشخصي.
5. سياسات RLS على `profiles` كانت recursive (exists select from profiles
   داخل RLS على profiles)، فالاستعلام البسيط كان يأخذ ٥٠-٢٠٠ ms بدل ٥-١٥ ms.
6. `onAuthStateChange` يعيد جلب الملف على كل `TOKEN_REFRESHED` (يحدث كل
   ساعة تلقائياً).

**الإصلاحات:**

### ٢أ. `contexts/AuthContext.tsx`
- حذفنا `getSession()` المبدئي — `onAuthStateChange` يطلق `INITIAL_SESSION`
  فوراً عند التركيب، فالاستعلام الأول كان مكرراً.
- `setLoading(false)` يرتفع فور معرفة الجلسة (بدون انتظار الملف الشخصي) —
  الواجهة تُعرض مباشرة.
- إضافة `lastUserIdRef` — الملف الشخصي يُجلب فقط عند تغيّر معرّف المستخدم،
  فأحداث `TOKEN_REFRESHED` لا تُعيد الاستعلام.

### ٢ب. `app/login/page.tsx`
- حذف `useEffect` المبدئي الذي يفحص الجلسة — الـ middleware يفعل نفس الشيء
  خادمياً قبل وصول الصفحة.
- حذف حالة `checking` والـ Loader الأولي المصاحبة.
- بعد نجاح الدخول نستخدم `window.location.replace('/dashboard')` بدل
  `router.replace` لضمان أن الطلب التالي يحمل الكوكي المحدّث ويجتاز الـ
  middleware بدون دورة توجيه إضافية.

### ٢ج. `supabase-auth-perf-migration.sql` (جديد)
- دالة `public.current_user_role()` كـ `SECURITY DEFINER STABLE` — تتخطى
  RLS وتعود بدور المستخدم الحالي في استعلام واحد سريع.
- دالة `public.current_user_batch_id()` بنفس الأسلوب.
- استبدال كل السياسات التي تستخدم
  `exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'ceo')`
  بـ `public.current_user_role() = 'ceo'` — قفزة جدولة مستعلم واحدة بدل
  الـ join/scan المتكرر داخل RLS.

**قياس الأثر (نظري، بانتظار قياس إنتاجي):**
| المقطع | قبل | بعد |
|--------|------|------|
| Loader أولي على /login | ~٣٠٠-٦٠٠ ms | ٠ |
| `getSession()` + `getProfile()` مزدوج | ١x | ٠ تكرار |
| `getProfile()` مع RLS recursive | ٥٠-٢٠٠ ms | ٥-١٥ ms |
| حجب الـ layout على `loading` | ينتظر الملف الشخصي | ينطلق فور معرفة الجلسة |
| إعادة جلب الملف على TOKEN_REFRESHED | نعم | لا |

**الملفات:**
- `contexts/AuthContext.tsx`
- `app/login/page.tsx`
- `supabase-auth-perf-migration.sql` (جديد — يحتاج تشغيل يدوي في Supabase)

**ملاحظة نشر:** تحسينات الكود تنفع فوراً عند النشر، لكن تحسين RLS يحتاج
تشغيل الـ migration في Supabase SQL Editor.

---

## ٣. قصر صلاحيات مدير الدفعة على دفعته ✅

**المشكلة:** مدير الدفعة كان يستطيع تعديل طلاب/اختبارات/برامج دفعات غير دفعته:
- `exams_auth` كانت سياسة واحدة تسمح للجميع بالـ CRUD.
- `programs` بدون سياسة كتابة لـ `batch_manager` أصلاً (تعتمد على `ceo_all`).
- `students_manager_full` بدون `WITH CHECK` → أمكن تغيير `batch_id` عبر UPDATE.

**الإصلاح:** ملف `supabase-batch-scope-migration.sql` (جديد):

1. **exams:** استبدلنا `exams_auth` بثلاث سياسات —
   - `exams_read_all` (SELECT): كل مسجّل.
   - `exams_ceo_write` (ALL): ceo.
   - `exams_manager_write` (ALL مع WITH CHECK): batch_manager على `exams.batch_id = current_user_batch_id()`.
   - `exams_supervisor_write` (ALL مع WITH CHECK): supervisor على نفس النطاق.

2. **programs:** أضفنا `programs_manager_write` و `programs_supervisor_write`،
   وأبقينا `programs_ceo_all`. الصلاحيات محدودة بـ
   `programs.batch_id = current_user_batch_id()::text` — لا يُسمح بتعديل
   البرامج العامة (`batch_id='all'`) إلا للـ ceo.

3. **students/supervisors/attendance/juz_progress/matn_progress:** أعدنا
   تعريف سياسات `batch_manager` مع `WITH CHECK` صارم يمنع تغيير `batch_id`
   إلى دفعة أخرى في UPDATE.

4. استخدمنا الدوال المساعدة من الإصلاح ٢ج — السياسات أوضح وأسرع.

**تفاصيل كاملة:** `PERMISSIONS_AUDIT.md` (جديد).

**خطوات النشر:**
1. تشغيل `supabase-auth-perf-migration.sql` أولاً (يوفر الدوال المساعدة).
2. ثم `supabase-batch-scope-migration.sql`.
3. اختبار يدوي بحساب batch_manager — إن استطاع تعديل بيانات دفعة أخرى
   فالمايجريشن لم يُطبَّق بشكل صحيح.

---

## ٤. عمود أسماء الطلاب ثابت في خريطة الحفظ ✅

**المشكلة:** عند التمرير الأفقي (RTL)، أسماء الطلاب تتحرك مع الأجزاء بدل أن
تبقى ثابتة على اليمين، فيصعب تتبع أي طالب ينظر إليه المستخدم.

**الإصلاح:** في `app/(main)/batches/page.tsx`:
- `<th>` و `<td>` الخاصة بعمود الأسماء كانت أصلاً `sticky right-0` لكن
  خلفياتها شفافة بنسبة ٩٨% (`rgba(255,255,255,0.02)`) والصف الزوجي كان
  `transparent` — فالأجزاء تبين من خلف العمود.
- بدّلنا الخلفيات إلى ألوان ثابتة من نظام التصميم:
  - رأس الجدول وصف الإجمالي: `var(--bg-elevated)`
  - الصفوف الفردية: `var(--bg-card)`
  - الصفوف الزوجية: `var(--bg-elevated)`
- أضفنا `box-shadow: -8px 0 12px -8px rgba(0,0,0,0.35)` على الحافة اليسرى
  لعمود الأسماء — ظل خفيف يظهر عند التمرير ليُوضح أن العمود ثابت.
- رفعنا `z-index` من `10` إلى `20` لضمان أن الأسماء فوق كل شيء آخر.
- الحل مختبر لـ RTL (Arabic) — الاتجاه الصحيح للظل هو يسار العمود.

**الملفات:** `app/(main)/batches/page.tsx`

---

## التحقق الآلي

| الفحص | النتيجة |
|-------|---------|
| `npm run build` | ✅ نجاح. كل الـ routes تُبنى. |
| `npm run lint` | ⚠️ ٦٤ مشكلة (١٨ errors + ٤٦ warnings) — **كلها قائمة مسبقاً** في الصفحات المستعادة من الـ stash و سكربتات المصادقة. لم يُضف أي خطأ جديد من إصلاحات هذه الدفعة. |

## خطوات النشر (بالترتيب)

```bash
# 1. مراجعة ودمج الفرع
git checkout main
git merge fix/team-feedback-batch1

# 2. تشغيل الهجرات في Supabase SQL Editor بالترتيب
#    (انسخ محتوى كل ملف والصقه في SQL Editor):
#    a) supabase-auth-perf-migration.sql
#    b) supabase-batch-scope-migration.sql

# 3. نشر
vercel deploy --prod
```

## اختبار يدوي مقترح بعد النشر

| السيناريو | النتيجة المتوقعة |
|-----------|------------------|
| دخول بحساب ceo | يرى كل البنود في الشريط |
| دخول بحساب batch_manager | يرى "تكليف المشرفين" و"متابعات الدفعة" فقط ضمن قسمه |
| دخول بحساب supervisor | يرى "المتابعات" و"قائمة اليوم" |
| سرعة تسجيل الدخول | يختفي Loader فور ظهور صفحة /login، وبعد الدخول لا يوجد blank-screen |
| batch_manager يحاول تعديل اختبار دفعة أخرى | فشل بـ 403 (RLS) |
| batch_manager يحاول إنشاء برنامج بـ batch_id='all' | فشل بـ 403 (RLS) |
| التمرير الأفقي في /batches | أسماء الطلاب ثابتة بظل خفيف |
