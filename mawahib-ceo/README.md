# المواهب الناشئة — نظام المدير التنفيذي

نظام إدارة متكامل لمتابعة حفظ القرآن الكريم والمتون العلمية، يشمل لوحات تحكم للمدير التنفيذي والمشرفين، مع أتمتة كاملة للتقارير والتصعيد.

## التقنيات

| الطبقة | التقنية |
|--------|---------|
| Frontend | Next.js 16 (App Router) |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| Hosting | Vercel |

## الشاشات

| المسار | الوصف | الصلاحية |
|--------|-------|----------|
| `/admin/dashboard` | لوحة المدير التنفيذي | ceo |
| `/dashboard` | لوحة المشرف | جميع |
| `/students` | إدارة الطلاب | جميع |
| `/supervisors` | إدارة المشرفين | ceo |
| `/batches` | خريطة الدفعات والحفظ | جميع |
| `/matn` | رصد المتون | جميع |
| `/exams` | جدول الاختبارات | جميع |
| `/attendance` | الحضور والغياب | جميع |
| `/notifications` | مركز الإشعارات | جميع |
| `/reports` | التقارير | جميع |
| `/tasks` | مهام المدير اليومية | ceo |

## Cron Jobs التلقائية

| الجدول | المهمة | المسار |
|--------|--------|--------|
| السبت ١٢:٠١ص | جدولة المقررات الأسبوعية | `/api/cron/weekly-content` |
| الأحد ٦:٠٠ص | فحص التصعيدات | `/api/cron/escalation-check` |
| السبت ٦:٠٠ص | التقرير الأسبوعي | `/api/cron/weekly-report` |

## التشغيل المحلي

```bash
npm install
cp .env.production.example .env.local
# أضف قيم Supabase الحقيقية في .env.local
npm run dev
# http://localhost:3000
```

## النشر على Vercel

```bash
vercel link    # ربط المشروع لأول مرة
vercel --prod  # نشر على الإنتاج
```

تأكد من إضافة هذه المتغيرات في Vercel → Settings → Environment Variables:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`

## هيكل الصلاحيات

| الدور | الوصف |
|-------|-------|
| `ceo` | وصول كامل |
| `supervisor` | طلابه فقط، بدون لوحة المدير |
| `teacher` | عرض فقط |

## قاعدة البيانات — Migration

لتشغيل نظام الأتمتة، نفّذ `supabase-automation-migration.sql` في Supabase SQL Editor.
