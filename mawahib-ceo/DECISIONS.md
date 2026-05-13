# DECISIONS.md

سجل القرارات الهندسية المهمّة في النظام. كل قرار يحتوي: التاريخ، السبب، الحدود، التراجع.

---

## 2026-05-13 — إضافة صفحة "آخر نشاط" (`/admin/activity`)

### القرار
إضافة ميزة تتبّع نشاط المستخدمين مرئية لـ`super_admin` فقط (`abdulaziz1ayman@gmail.com`).

### الغرض
رؤية مَن يستخدم النظام، متى، وكم عدد المتصلين المتزامنين — لاتخاذ قرارات حول التوسع والتدريب والصيانة.

### البنية
- **جدول `user_activity_log`** — تفاصيل كاملة لكل تنقّل (page_path + timestamp).
- **جدول `user_activity_daily_summary`** — ملخّصات يومية (sessions_count, pages_visited, first/last_activity).
- **RLS:** SELECT للـsuper_admin فقط، INSERT للـauthenticated فقط (مع شرط `user_id = auth.uid()` على log).

### الاحتفاظ بالبيانات (طبقات)
| الطبقة | المدة | الحجم النموذجي |
|---|---|---|
| تفاصيل كاملة | 30 يوم | ~140 MB كحد أقصى (٢٠ مستخدم نشط × ٢٤س × ٣٠ يوم) |
| ملخّصات يومية | سنة | ~5 MB |
| أقدم من سنة | يُحذف عبر cron يومي | 0 |

### آلية التسجيل
- **`ActivityTracker`** (client component) في `app/(main)/layout.tsx` — يسمع `usePathname()`.
- **`lib/activity-logger.ts`** — throttle 60s in-memory + fire-and-forget + skip للمسارات العامة.
- **`/api/cron/activity-rollup`** — يومياً 02:00 UTC: rollup + purge.

### الأداء (تحليل استدلالي — 2026-05-13)
| المعيار | التأثير |
|---|---|
| TTFB / SSR | صفر — `useEffect` بعد mount |
| TTI | < 1ms زيادة |
| DB queries إضافية | 1 INSERT/صفحة جديدة (throttled 60s) — lateral |
| Bundle JS | +0.6 KB gzipped |
| تأثير على 3 صفحات حرجة | غير محسوس (< 10%) |

### الحدود الأمنية
- `super_admin` يُحدَّد عبر `profiles.is_super_admin` (boolean) — ليس عبر دور.
- التحقق server-side في `lib/activity/server-auth.ts` قبل أي استعلام.
- helper `is_current_user_super_admin()` بـ`SECURITY DEFINER` لتجنّب recursive RLS.

### قواعد ذهبية مُحترمة
- ✅ لم يُعدَّل أي جدول/policy/helper موجود.
- ✅ لم تُعدَّل أي صفحة من النظام (باستثناء `layout.tsx` بسطرَيْن، `Sidebar.tsx` ببَنْد، `vercel.json` بـcron entry — كلها إضافات).
- ✅ كل الـmigrations جديدة، لم يُعدَّل migration سابق.
- ✅ كل الـcomponents جديدة، لم يُعدَّل component موجود.

### التراجع (Rollback)
1. حذف رابط Sidebar (سطر واحد)
2. حذف الـcron entry من `vercel.json` (٤ أسطر)
3. حذف السطرَيْن من `layout.tsx`
4. حذف المجلدات: `app/(main)/admin/activity/`, `lib/activity/`
5. حذف الملفات: `lib/activity-logger.ts`, `components/ActivityTracker.tsx`, `app/api/cron/activity-rollup/`
6. تنفيذ SQL rollback (انظر migration `add_user_activity_tracking`)

### الملفات المُنشأة (٨ ملفات جديدة)
```
lib/activity-logger.ts
lib/activity/server-auth.ts
lib/activity/queries.ts
components/ActivityTracker.tsx
app/(main)/admin/activity/page.tsx
app/(main)/admin/activity/Interactive.tsx
app/(main)/admin/activity/actions.ts
app/api/cron/activity-rollup/route.ts
```

### الملفات المُعدَّلة (٣ ملفات — إضافات سطور فقط)
```
app/(main)/layout.tsx      (+2 سطر)
components/layout/Sidebar.tsx  (+3 أسطر)
vercel.json                (+4 أسطر)
```
