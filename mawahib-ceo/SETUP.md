# دليل التنصيب — SETUP

## المتطلبات

- Node.js 20+
- حساب Supabase (مجاني يكفي)
- حساب Vercel (للنشر)

---

## ١. إعداد Supabase

### أ. إنشاء الجداول الأساسية
1. ادخل [supabase.com](https://supabase.com) → مشروعك → **SQL Editor**
2. شغّل `supabase-schema.sql` (الجداول الأساسية)
3. شغّل `supabase-automation-migration.sql` (جداول الأتمتة)

### ب. نسخ مفاتيح الـ API
من **Settings → API**:
- `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
- `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `service_role` → `SUPABASE_SERVICE_ROLE_KEY` ⚠️ سري، لا تشاركه

### ج. إنشاء المستخدمين
من **Authentication → Users → Add User**:
- المدير التنفيذي: أضف بريد إلكتروني وكلمة سر
- المشرفون: أضف حساباً لكل مشرف

في جدول `profiles` أضف صف لكل مستخدم:
```sql
INSERT INTO profiles (id, role, name, batch_id) VALUES
  ('uuid-من-supabase-auth', 'ceo', 'عبدالعزيز', null),
  ('uuid-مشرف-1',           'supervisor', 'اسم المشرف', 48);
```

---

## ٢. إعداد المشروع محلياً

```bash
# نسخ المستودع
git clone <repo-url>
cd mawahib-ceo

# تثبيت المكتبات
npm install

# إعداد متغيرات البيئة
cp .env.production.example .env.local
```

عدّل `.env.local` بالقيم الحقيقية:
```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
CRON_SECRET=كلمة_سر_عشوائية
NEXT_PUBLIC_APP_PASSWORD=كلمة_سر_الدخول
```

```bash
# تشغيل في وضع التطوير
npm run dev
```

---

## ٣. النشر على Vercel

```bash
# تثبيت Vercel CLI (مرة واحدة)
npm i -g vercel

# ربط المشروع
vercel link

# إضافة متغيرات البيئة
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel env add CRON_SECRET production
# (كرر لكل متغير)

# نشر على الإنتاج
vercel --prod
```

أو من لوحة Vercel:
1. **Settings → Environment Variables** → أضف كل متغير
2. **Deployments → Redeploy**

---

## ٤. التحقق من الـ Cron Jobs

بعد النشر، تأكد من:
1. Vercel Dashboard → مشروعك → **Cron Jobs**
2. يجب أن تظهر ثلاثة crons:
   - `weekly-content` — السبت ١٢:٠١ص
   - `escalation-check` — الأحد ٦:٠٠ص
   - `weekly-report` — السبت ٦:٠٠ص

لاختبار يدوي:
```
https://your-domain.vercel.app/api/cron/weekly-content
```

---

## ٥. اختبار بياناتك

```
https://your-domain.vercel.app/admin/dashboard
```

تسجيل الدخول بحساب المدير التنفيذي وتحقق من:
- ظهور إحصائيات الطلاب
- عمل الخريطة الحرارية
- صفحة الإشعارات `/notifications`
