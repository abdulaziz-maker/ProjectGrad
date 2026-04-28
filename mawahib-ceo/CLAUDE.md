@AGENTS.md

# نظام المواهب الناشئة — القيادة التنفيذية

> **سياق سريع للمطور القادم**: هذا نظام إدارة برنامج تربوي لحفظ القرآن
> الكريم في السعودية. يخدم 4 أدوار (CEO، مدير دفعة، مشرف، معلم،
> موظف سجلات) عبر دفعتين نشطتين (46 و 48). الموقع يعمل بالعربية RTL
> ومنشور على Vercel. تاريخ آخر تحديث رئيسي: ربيع الآخر 1447هـ.

---

## 🚀 إقلاع سريع

```bash
# الـworktree الفعّال
cd "/Users/aboez/Downloads/المواهب الناشئة/نظام المدير التنفيذي/.claude/worktrees/happy-moore/mawahib-ceo"

npm install
npm run dev          # http://localhost:3000
npx tsc --noEmit     # فحص الأنواع (يجب EXIT=0 قبل push)
npm run build        # محلياً قبل الـdeploy
```

**Production**: <https://mawahib-ceo.vercel.app>
**Repo**: <https://github.com/abdulaziz-maker/ProjectGrad> (branch: `fix/team-feedback-batch5`)
**Supabase project**: `kfexsycnpnldbjrwaohw`

---

## 🛠️ التقنيات المستخدمة

| الطبقة | التقنية | السبب / ملاحظات |
|---|---|---|
| **Framework** | Next.js **16.2.2** + React **19.2** App Router (Turbopack) | ⚠️ كسر تغييرات عن Next 15 — اقرأ `AGENTS.md` |
| **اللغة** | TypeScript strict | `npx tsc --noEmit` لازم EXIT=0 |
| **Styling** | Tailwind v4 + CSS variables (CSS in `app/globals.css`) | لا shadcn — **design system مخصّص** |
| **DB** | Supabase Postgres + RLS بقوة | جميع الجداول role-isolated |
| **Auth** | Supabase Auth (`@supabase/ssr`) | جلسات في cookies |
| **State** | React useState + cache layer مخصّص (`lib/cache.ts`) | لا Redux/Zustand |
| **Forms** | react-hook-form + zod (في بعض الصفحات) | تدريجي |
| **UI** | Radix UI primitives + lucide-react icons + Recharts | تركيز على الـaccessibility |
| **Drag & Drop** | @dnd-kit (في خرائط الطلاب وأسبقية المتون) | |
| **Excel/PDF** | `xlsx` + `window.print()` + CSS print | تصدير التقارير |
| **Hijri** | `hijri-converter` + helpers في `lib/hijri.ts` | كل التواريخ في الـDB gregorian YYYY-MM-DD |
| **Hosting** | Vercel (Fluid Compute) | Production deploys على main automatic |

---

## 📂 بنية المشروع

```
mawahib-ceo/
├── app/
│   ├── (main)/                  # كل الصفحات بعد تسجيل الدخول
│   │   ├── layout.tsx          # AuthProvider + Header + Sidebar
│   │   ├── dashboard/          # لوحة المشرف/المعلم
│   │   ├── admin/dashboard/    # لوحة المدير التنفيذي
│   │   ├── manager/dashboard/  # لوحة مدير الدفعة
│   │   └── ... (43 صفحة)
│   ├── api/cron/               # cron jobs (تنبيهات أسبوعية، تصعيد)
│   └── globals.css             # design tokens + animations
├── components/
│   ├── layout/                 # Sidebar, Header, WisdomTicker, BrandMark
│   ├── ui/                     # primitives مشتركة (HijriDatePicker، PageHeader...)
│   ├── student-cases/          # لوحات الحالات (Manager/Ceo/Supervisor Boards + StageStepper)
│   ├── performance/            # تقرير الإنجاز الديناميكي
│   ├── timeline/               # الخطة الزمنية السنوية
│   └── ...
├── lib/
│   ├── supabase.ts             # supabase client
│   ├── auth.ts                 # getProfile + signOut
│   ├── db.ts                   # 95% من DB calls — كل دالة cached + invalidates
│   ├── cache.ts                # cachedFetch + CACHE_KEYS + invalidateCache
│   ├── hijri.ts                # gregorianToHijri + helpers
│   ├── quran-followup.ts       # خوارزمية calculateExpectedPosition
│   ├── supervisor-tracking.ts  # حالة المتابعة الأسبوعية
│   ├── student-cases/          # نظام التصعيد (db, types, format, flag)
│   ├── performance/            # تقارير الأداء (db, types, format, export, flag)
│   └── timeline/               # الخطة الزمنية (db, types, flag)
├── contexts/
│   ├── AuthContext.tsx         # session + profile
│   └── ThemeContext.tsx        # dark/light
├── types/                      # types مشتركة
└── supabase-*.sql              # migrations يدوية (الجديدة عبر MCP)
```

---

## 📄 كل الصفحات المُنجَزة (43 صفحة)

### 🟦 المدير التنفيذي
| المسار | الوظيفة |
|---|---|
| `/admin/dashboard` | لوحة CEO الرئيسية — KPIs + رسوم + heatmap |
| `/admin/users` | إدارة الحسابات وأدوار المستخدمين |
| `/admin/bulk-plan` | إنشاء خطة قرآن جماعية لطلاب متعددين |
| `/budget` | الميزانية والعهد |
| `/settings` | إعدادات النظام |

### 🟪 مدير الدفعة
| المسار | الوظيفة |
|---|---|
| `/manager/dashboard` | لوحة الدفعة — مقاييس مختصرة |
| `/manager/supervisors` | تكليف + تحضير المشرفين (4 حالات: حاضر/متأخر/بعذر/غائب) |
| `/manager/assignments` | توزيع الطلاب على المشرفين |
| `/manager/reports` | **DEPRECATED** — يُعيد التوجيه لـ`/reports` |
| `/followups/manager` | إشراف على المتابعات + Compliance لكل مشرف |

### 🟩 المشرف / المعلم
| المسار | الوظيفة |
|---|---|
| `/dashboard` | لوحة المشرف |
| `/followups` | المتابعات اليومية + المنطق الأسبوعي الجديد |
| `/followups/checklist` | **مدمج في `/followups`** (مخفي من sidebar) |
| `/followups/plan/[studentId]` | خطة طالب فرد |

### ⬜ مشترك (تسميات ديناميكية حسب الدور)
| المسار | تسمية الـCEO | تسمية المدراء/المشرفين |
|---|---|---|
| `/reports` | تقارير الدفعات | تقارير دفعتي |
| `/reports/performance` | تقرير إنجاز الطلاب الديناميكي (مساقات قابلة للتعديل) | |
| `/students` + `/students/[id]` | طلاب الدفع | طلاب دفعتي |
| `/programs` | برامج الدفع | برامج دفعتي |
| `/batches` | **قاعدة البيانات** (خريطة حفظ كل الطلاب) | |
| `/exams` | جدول الاختبارات | |
| `/attendance` | الحضور والغياب (4 حالات) | |
| `/matn` + `/matn/manage` + `/matn/assess` | رصد المتون |
| `/meetings` | الاجتماعات الدورية |
| `/quran` | بيانات القرآن (سور وأجزاء) |
| `/supervisors` | المشرفون والمعلمون (CEO فقط) |
| `/notifications` | الإشعارات |
| `/reminders/saved` | التذكيرات المحفوظة |
| `/tasks` | **مهامي اليومية** — متاح لكل دور بـcategories مخصّصة |

### 🟫 نظام التصعيد (Student Cases)
| المسار | الوظيفة |
|---|---|
| `/student-cases` | لوحة المشرف الأسبوعية + بدء التصعيد |
| `/student-cases/manager` | inbox مدير الدفعة |
| `/student-cases/ceo` | نظرة عامة المدير التنفيذي |
| `/student-cases/[caseId]` | تفاصيل حالة + Stepper + إجراءات |
| `/student-cases/timeline` | كل التصعيدات بـtimelines (Hungerstation-style) |

### 🟧 الخطة الزمنية (Timeline)
| المسار | الوظيفة |
|---|---|
| `/timeline` | اللوحة الرئيسية (متاح كزر داخل `/programs` لا كبند sidebar مستقل) |
| `/timeline/calendar` + `/calendar/import` | التقويم الأكاديمي + استيراد CSV |
| `/timeline/master` | عرض موحَّد |
| `/timeline/clone` | استنساخ سنوي |
| `/timeline/approvals` | اعتمادات |
| `/timeline/finance` | المالية |
| `/timeline/activity-types` | أنواع الأنشطة |

---

## 🗄️ قاعدة البيانات (Supabase)

### الجداول الأساسية
| الجدول | الوصف | RLS |
|---|---|---|
| `profiles` | ملف المستخدم (id من auth، role، batch_id، name) | لكل مستخدم سجله |
| `students` | الطلاب (40+ صف، supervisor_id كنص "sup_xxx") | role-scoped بالـbatch |
| `supervisors` | المشرفون (id كنص، user_id ربط بـauth) | |
| `batches` | الدفعات (46، 48، ...) | قراءة للجميع |
| `attendance` | الحضور اليومي (4 حالات) | role-scoped |
| `juz_progress` | تقدّم الأجزاء لكل طالب | |
| `matn_progress` + `student_text_progress` | المتون | |
| `daily_followups` | المتابعات اليومية (gap, reasons[], actions[]) | |
| `quran_plans` + `weekly_plans` | خطط الحفظ | |
| `exams` + `exam_candidates` | الاختبارات | |
| `programs` + `program_attendance` | البرامج التربوية | |
| `meetings` | الاجتماعات | |
| `ceo_tasks` | المهام (متعدد المستخدمين بـuser_id منذ 2026-04-27) | sees own |

### نظام التصعيد
| الجدول | الوصف |
|---|---|
| `student_cases` | الحالة الأم (5 مراحل: opened → s1→s2→s3 → resolved/closed) + `initial_remedial_plan` |
| `student_case_transitions` | كل انتقال مرحلة (auto-logged via trigger) |
| `student_case_actions` | الإجراءات (parent_call، meeting، note، إلخ) |
| `student_case_weekly_reviews` | المراجعات الأسبوعية (UNIQUE on week_start_date+student_id) |

### نظام تقارير الأداء
| الجدول | الوصف |
|---|---|
| `report_subjects` | المساقات الديناميكية (3 أنواع: dual/single/attendance) |
| `report_subject_exclusions` | استثناء طالب من مساق |
| `performance_periods` | الفترات (year/term/month) |
| `performance_entries` | القيم (مفترض + فعلي) لكل (طالب × مساق × عمود) |

### الخطة الزمنية
`timeline_calendars`، `timeline_days`، `timeline_activities`، `timeline_activity_types`، `timeline_activity_costs`، `timeline_plan_templates`

### نظام الإشعارات
`notifications` (in-app dropdown في الـHeader)

---

## 🔐 RLS (مهم جداً)

### القاعدة الذهبية
**كل الجداول الحرجة عندها RLS بـrole-based policies.** التعديل بدون RLS = تسريب بيانات.

### الـPolicies الحالية
- **CEO**: كل البيانات
- **batch_manager**: محدود بـ`current_user_batch_id() = batch_id`
- **supervisor / teacher**: محدود بدفعته (وأحياناً طلابه فقط)
- **records_officer**: قراءة كل البيانات + كتابة محدودة

### تنبيه تاريخي
سياسة **`allow_all` بـqual=true** كانت موجودة على 18 جدول وتتجاوز كل الـrole policies (PostgreSQL RLS منطقها OR). أُسقطت في migration `drop_allow_all_rls_critical_isolation_fix` (2026-04-27). **لا تُعِد إنشاءها أبداً**.

### كيف تضيف policy جديد
```sql
DROP POLICY IF EXISTS my_policy ON my_table;
CREATE POLICY my_policy ON my_table
  FOR ALL
  USING (current_user_role() = 'ceo' OR ...)
  WITH CHECK (...);
```
استخدم helpers: `current_user_role()`، `current_user_batch_id()`، `is_records_officer()`، `auth.uid()`.

---

## 🎨 Design System

### الألوان (Munasseq palette)
- **Brand**: `#3A3D44 → #1A1B20` (charcoal gradient)
- **Accent warm**: `#C08A48` (gold)
- **Accent gold**: `#D4A24C`
- **Accent teal**: `#356B6E` (petrol)
- **Accent mint**: `#6FA392` (sage)
- **Accent rose**: `#B26A64`
- **Accent plum**: `#5D4256`
- **Body bg**: `#F6F4F0` (warm beige)
- **Card**: `#FFFFFF`
- **Danger**: `#B94838`
- **Success**: `#5A8F67`
- **Warning**: `#C9972C`

### الخطوط
- **Display (عناوين)**: Noto Kufi Arabic (`var(--font-noto-kufi)`)
- **Body**: IBM Plex Sans Arabic (`var(--font-ibm-plex)`)
- **Mono**: IBM Plex Mono (للأرقام)

### العناصر المتكررة
- **Cards**: `.card`، `.card-static`، `.card-interactive`، `.card-glass`
- **Buttons**: `.btn-primary` (gold gradient + ripple)
- **Badges**: `.badge-gold/teal/mint/rose/plum`
- **Eyebrow pills**: `.eyebrow-pill` + `.eyebrow-dot`
- **Display headings**: `.display-h1`، `.display-h2`
- **Hero surface**: `.hero-surface`
- **Animations**: `@keyframes pulse-soft`، `book-float`، `fade-in-up`

### قواعد UX مهمة
1. **RTL أولاً** — كل الـcomponents تستخدم `dir="rtl"` ضمناً
2. **التواريخ هجرية** في الـUI، **gregorian** في الـDB
3. **الـHijriDatePicker** مكوّن مخصّص يُحوّل تلقائياً
4. **حذف Hard delete** ممنوع بدون modal تأكيد بكتابة الاسم (مثل /students)
5. **Print stylesheets** مدمجة لـ`/reports/performance` و`/student-cases/[id]`
6. **Mobile responsive** للصفحات الأساسية فقط (CEO views غير مُحسَّنة للجوال)

---

## ⚙️ القرارات الهندسية المهمة

### 1. **Worktrees بدل branches**
الـrepo يستخدم git worktrees (`/Users/aboez/.git/worktrees/happy-moore`). كل branch له مجلد منفصل. `main` على worktree آخر مُمنوع تعديله من هنا.

### 2. **Cache layer مخصّص**
`lib/cache.ts` يقدّم `cachedFetch(key, fetcher)` و `invalidateCache(key)`. كل دالة في `lib/db.ts` تستخدم cache. **إذا عدّلت بيانات، invalidateCache(KEY)**.

### 3. **Feature flags**
ثلاثة نُظم خلف feature flags:
- `NEXT_PUBLIC_TIMELINE_ENABLED=true`
- `NEXT_PUBLIC_STUDENT_CASES_ENABLED=true`
- `NEXT_PUBLIC_PERFORMANCE_REPORTS_ENABLED=true`

كلها مُفعَّلة على Vercel Production. ملف الـflag في `lib/<feature>/flag.ts`.

### 4. **توقيت التواريخ**
`new Date().toISOString().split('T')[0]` يُرجع UTC وقد يعطي **يوم أمس** في السعودية (UTC+3). دائماً استخدم `localDateIso(d)` المُعرَّف في `lib/quran-followup.ts`.

### 5. **منطق المتابعة الأسبوعية (الجديد)**
- متابعة المشرف للطالب = تسجيل `actual_position` مرة في الأسبوع
- المتعثّرون (gap ≤ -10 أوجه) يبقون مطلوبين دائماً
- في step 2 (التأخر): ≥1 سبب و ≥1 إجراء **إلزاميان** قبل الحفظ
- بعد الحفظ، إذا متعثّر شديد → toast.warning بالتصعيد لمدير الدفعة

### 6. **نظام التصعيد (Hungerstation-style stepper)**
5 مراحل: Opened → Stage 1 (المشرف) → Stage 2 (المدير) → Stage 3 (التنفيذي) → Parent Summons. الـStepper مدمج في كل بطاقة في `Manager/Ceo Boards`.

### 7. **حذف الطالب — cascade شامل**
9 جداول مع FK CASCADE تلقائي + 7 جداول قديمة بدون FK تحتاج cleanup يدوي في `deleteStudent()`. مع modal تأكيد بكتابة اسم الطالب.

### 8. **WisdomTicker في الـHeader**
شريط تذكيرات إيمانية يدور كل 20s. **مخفي على الجوال (lg+ فقط)** لتجنّب الازدحام.

### 9. **التسميات الديناميكية في الـSidebar**
بنود `/reports`، `/students`، `/programs`، `/student-cases` لها تسميات تتغيّر حسب الدور (CEO يرى "تقارير الدفعات"، مدير الدفعة يرى "تقارير دفعتي"...).

### 10. **مهام لكل دور**
`ceo_tasks` صار متعدد المستخدمين بـ`user_id`. كل دور له categories مختلفة:
- CEO: مدراء/مشرفين/عهد/رسوم
- Manager: مشرفين/طلاب/تقارير/تخطيط
- Supervisor: متابعة/حضور/تقرير/أولياء أمور

---

## 🔧 المهام التي لم تكتمل / Open issues

### لم تُنفَّذ بعد (مهمة)
1. **SLA timing alerts** للتصعيدات (3 أيام / 48س / 72س):
   - يحتاج cron jobs منفصلة
   - تنبيهات بصرية في الـUI
   - مذكور في خطة batch5 لكن مؤجَّل

2. **WebSocket / Realtime updates** للـbadge counts:
   - حالياً يجلب مرة عند mount فقط
   - الـUser قد لا يرى الإشعارات الجديدة بدون refresh

3. **Mobile optimization** لصفحات CEO (admin/dashboard، إلخ):
   - يعمل على الجوال لكن غير مصمَّم له
   - الـHero KPIs بحاجة layout مختلف

4. **حذف الطالب من ملف الطالب نفسه** (`/students/[id]`):
   - الزر موجود فقط في `/students` (الجدول الرئيسي)

5. **سجل التعديلات (audit log)**:
   - مذكور كاقتراح لـperformance_entries
   - من غيّر، متى، الرقم القديم vs الجديد

6. **Supabase Auth: Email verification**:
   - حالياً الـCEO ينشئ الحسابات يدوياً
   - لا "اشتركي بنفسك"

### Tech debt / Known issues
- **`/followups/checklist`** فعلياً موجود لكن مخفي من sidebar — قد يُحذف نهائياً لاحقاً
- **`/manager/reports`** صفحة redirect-only — يمكن حذف الـroute كاملاً لو تأكدنا أن لا bookmark خارجي
- **`/followups/page.tsx`** كبيرة (1100+ سطر) — تستحق تقسيم لـcomponents
- **lib/db.ts** كبيرة (700+ سطر) — يمكن تقسيم حسب الـdomain
- **بعض الصفحات تستخدم `localDateIso` بـmanually duplicated logic** — يفضّل export في `lib/dates.ts` مشترك

---

## 🚧 Workflow / Conventions

### Git
- branch: `fix/team-feedback-batch5` (الحالي)
- main: `main` (production-tracked)
- commits بالعربي + co-authored بـClaude
- **لا push --force على main** أبداً
- **لا commit على main** مباشرة — PR أولاً

### Migrations
- جديدة عبر MCP (`supabase__apply_migration`)
- أسماء snake_case واضحة (مثل `add_user_id_to_ceo_tasks`)
- لا تدمج migration واحد لتعديلين منفصلين

### Deploy
```bash
vercel deploy --prod  # من mawahib-ceo dir
```
الـpush للـbranch لا يُطلق deploy تلقائياً (preview فقط) — لا بد من `vercel deploy --prod` يدوياً أو merge to main.

### Testing
- **لا framework اختبارات** حالياً — شغّل `npx tsc --noEmit` + `npm run build` قبل push
- اختبار يدوي بالأدوار الأربعة (CEO + manager + supervisor + records) قبل أي تعديل في RLS

### Code style
- TypeScript strict
- لا `any` بدون تعليق `// eslint-disable-next-line`
- أسماء components PascalCase، helpers camelCase
- التعليقات بالعربي للسياق + الإنجليزي للتقني
- **No unicode bullets** in components (استخدم list-disc من tailwind أو إيموجي إن لزم)

---

## 📊 سجل التطور (آخر 30 يوم)

| التاريخ | الإنجاز |
|---|---|
| 1447-10-29 | إعادة تصميم Munasseq palette (Phase 5) |
| 1447-10-30 | نظام Student Cases الكامل + 5 phases للـTimeline |
| 1447-11-01 | تقارير الأداء الديناميكية (مساقات قابلة للتعديل) |
| 1447-11-05 | إصلاح RLS allow_all (سبب 7 أخطاء حرجة) |
| 1447-11-07 | حذف طالب آمن + HijriDatePicker شامل |
| 1447-11-10 | مهام لكل دور + متأخر للحضور + توحيد المتابعات |

تفاصيل في git log + commit messages.

---

## 🆘 Troubleshooting

### "البيانات لا تظهر"
1. تحقق من RLS policies على الجدول
2. تحقق من `auth.uid()` في session
3. شغّل query من Supabase dashboard لتأكيد الـpermissions

### "TypeScript error بعد pull"
```bash
rm -rf .next node_modules
npm install
npx tsc --noEmit
```

### "Deploy فشل"
1. شغّل `npm run build` محلياً
2. تحقق من env vars على Vercel
3. اقرأ build logs في Vercel dashboard

### "متعثّر في فهم صفحة"
- اقرأ commit history للملف: `git log --oneline -- path/to/file`
- التعليقات في أعلى الملف عادة توضح الغرض

---

## 👥 جهات الاتصال (للسياق فقط)

- **المدير التنفيذي**: عبدالعزيز السحيباني
- **مدراء الدفع الحاليين**: عبدالله التويم (48)، فيصل الحربي (46)
- **المطوّر السابق على هذا المشروع**: Claude (Sonnet/Opus عبر Claude Code)

---

## 📝 ملاحظات نهائية للمطوّر القادم

1. **اقرأ `AGENTS.md` أولاً** — Next.js 16 له تغييرات كاسرة عن 15
2. **لا تثق بـtoISOString** — استخدم `localDateIso` (السعودية UTC+3 = bug فعلي)
3. **RLS هو الخط الدفاعي الأول** — لا تعتمد على فلترة JS
4. **اختبر بكل الأدوار** قبل أي تعديل على permissions
5. **لو قابلت بيانات غريبة** — ابحث عن `// TODO` في الكود أو ssh إلى supabase وافحص مباشرة
6. **شغّل tsc + build قبل كل commit** — pre-commit hooks مش مفعّلة

التوفيق! 🌱
