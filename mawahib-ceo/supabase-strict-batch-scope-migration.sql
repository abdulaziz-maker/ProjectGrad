-- ══════════════════════════════════════════════════════════════
-- Strict Batch Scope — تشديد RLS على الطلاب والجداول المرتبطة
-- شغّل هذا في Supabase SQL Editor مرة واحدة
--
-- الهدف:
-- تأكيد إغلاق أي ثغرة قد تسمح لمدير الدفعة بقراءة طلاب دفعات أخرى.
-- يُلغي كل السياسات القديمة على `students` ثم يعيد إنشاءها من جديد بحيث
-- لا تسمح بأي قراءة خارج الدفعة المسجَّلة في ملف المستخدم.
--
-- متطلبات مسبقة: الدوال public.current_user_role() و public.current_user_batch_id()
-- معرَّفة في supabase-auth-perf-migration.sql.
-- ══════════════════════════════════════════════════════════════

-- ── 1) students — إعادة بناء السياسات من الصفر ────────────────
alter table students enable row level security;

-- إسقاط كل السياسات المحتملة القديمة والجديدة
drop policy if exists "students_ceo_all"          on students;
drop policy if exists "students_supervisor_read"  on students;
drop policy if exists "students_supervisor_write" on students;
drop policy if exists "students_manager_full"     on students;

-- ceo: وصول كامل لكل الدفعات
create policy "students_ceo_all" on students
  for all
  using (public.current_user_role() = 'ceo')
  with check (public.current_user_role() = 'ceo');

-- batch_manager: قراءة وكتابة لطلاب دفعته فقط، مع WITH CHECK يمنع تغيير batch_id
create policy "students_manager_full" on students
  for all
  using (
    public.current_user_role() = 'batch_manager'
    and public.current_user_batch_id() = students.batch_id
  )
  with check (
    public.current_user_role() = 'batch_manager'
    and public.current_user_batch_id() = students.batch_id
  );

-- supervisor: قراءة وكتابة لطلاب دفعته فقط
create policy "students_supervisor_write" on students
  for all
  using (
    public.current_user_role() = 'supervisor'
    and public.current_user_batch_id() = students.batch_id
  )
  with check (
    public.current_user_role() = 'supervisor'
    and public.current_user_batch_id() = students.batch_id
  );

-- teacher: قراءة فقط لطلاب دفعته
create policy "students_teacher_read" on students
  for select
  using (
    public.current_user_role() = 'teacher'
    and public.current_user_batch_id() = students.batch_id
  );

-- ── 2) juz_progress — تقييد مماثل ─────────────────────────────
alter table juz_progress enable row level security;

drop policy if exists "juz_ceo_all"               on juz_progress;
drop policy if exists "juz_supervisor_all"        on juz_progress;
drop policy if exists "juz_progress_manager_full" on juz_progress;

create policy "juz_ceo_all" on juz_progress
  for all using (public.current_user_role() = 'ceo')
  with check (public.current_user_role() = 'ceo');

create policy "juz_batch_scope" on juz_progress
  for all
  using (
    public.current_user_role() in ('batch_manager','supervisor','teacher')
    and exists (
      select 1 from students s
      where s.id = juz_progress.student_id
        and s.batch_id = public.current_user_batch_id()
    )
  )
  with check (
    public.current_user_role() in ('batch_manager','supervisor')
    and exists (
      select 1 from students s
      where s.id = juz_progress.student_id
        and s.batch_id = public.current_user_batch_id()
    )
  );

-- ── 3) matn_progress — تقييد مماثل ────────────────────────────
alter table matn_progress enable row level security;

drop policy if exists "matn_ceo_full"             on matn_progress;
drop policy if exists "matn_supervisor_own_batch" on matn_progress;

create policy "matn_ceo_full" on matn_progress
  for all using (public.current_user_role() = 'ceo')
  with check (public.current_user_role() = 'ceo');

create policy "matn_batch_scope" on matn_progress
  for all
  using (
    public.current_user_role() in ('batch_manager','supervisor','teacher')
    and exists (
      select 1 from students s
      where s.id = matn_progress.student_id
        and s.batch_id = public.current_user_batch_id()
    )
  )
  with check (
    public.current_user_role() in ('batch_manager','supervisor')
    and exists (
      select 1 from students s
      where s.id = matn_progress.student_id
        and s.batch_id = public.current_user_batch_id()
    )
  );

-- ══════════════════════════════════════════════════════════════
-- ملاحظة أمنية:
-- بعد تشغيل هذا الملف، يجب أن تفشل أي محاولة من batch_manager لقراءة
-- طلاب دفعة أخرى (ترجع قائمة فارغة أو خطأ RLS)، حتى لو تمّ تجاوز واجهة
-- المستخدم عبر إعدادات Postman أو أي عميل آخر.
-- ══════════════════════════════════════════════════════════════
