-- ══════════════════════════════════════════════════════════════
-- Batch-Scope Migration — قصر صلاحيات مدير الدفعة على دفعته
-- شغّل هذا في Supabase SQL Editor مرة واحدة
--
-- المشكلة:
-- مدير الدفعة يستطيع تعديل طلاب/اختبارات/برامج دفعات غيره، لأن بعض
-- السياسات كانت مفتوحة (`auth.uid() is not null` على exams مثلاً) ولا
-- توجد سياسة كتابة على برامج أو اختبارات محدودة بالدفعة.
--
-- المتطلبات:
-- * الطلاب (CRUD): مدير الدفعة يرى ويعدل دفعته فقط. [موجود مسبقاً ✓]
-- * الاختبارات: يعدل دفعته فقط، لكن يرى اختبارات الدفعات الأخرى للقراءة.
-- * البرامج التربوية: كل دفعة مستقلة — يعدل دفعته فقط.
--
-- متطلبات مسبقة:
-- * supabase-auth-perf-migration.sql (للحصول على دالة current_user_role
--   وcurrent_user_batch_id).
-- ══════════════════════════════════════════════════════════════

-- ── 1) EXAMS ──────────────────────────────────────────────────
alter table exams enable row level security;

-- إزالة السياسة المفتوحة القديمة
drop policy if exists "exams_auth"              on exams;
drop policy if exists "exams_read_all"          on exams;
drop policy if exists "exams_ceo_write"         on exams;
drop policy if exists "exams_manager_write"     on exams;
drop policy if exists "exams_supervisor_write"  on exams;

-- قراءة: كل مستخدم مسجّل يرى كل الاختبارات
create policy "exams_read_all" on exams
  for select using (auth.uid() is not null);

-- كتابة (insert/update/delete): ceo كامل
create policy "exams_ceo_write" on exams
  for all
  using (public.current_user_role() = 'ceo')
  with check (public.current_user_role() = 'ceo');

-- كتابة: مدير الدفعة — دفعته فقط
create policy "exams_manager_write" on exams
  for all
  using (
    public.current_user_role() = 'batch_manager'
    and public.current_user_batch_id() = exams.batch_id
  )
  with check (
    public.current_user_role() = 'batch_manager'
    and public.current_user_batch_id() = exams.batch_id
  );

-- كتابة: المشرف — دفعته فقط
create policy "exams_supervisor_write" on exams
  for all
  using (
    public.current_user_role() = 'supervisor'
    and public.current_user_batch_id() = exams.batch_id
  )
  with check (
    public.current_user_role() = 'supervisor'
    and public.current_user_batch_id() = exams.batch_id
  );

-- ── 2) PROGRAMS ───────────────────────────────────────────────
alter table programs enable row level security;

drop policy if exists "programs_ceo_all"         on programs;
drop policy if exists "programs_supervisor_read" on programs;
drop policy if exists "programs_manager_write"   on programs;
drop policy if exists "programs_supervisor_write"on programs;

-- ceo: كامل على الكل
create policy "programs_ceo_all" on programs
  for all using (public.current_user_role() = 'ceo')
  with check (public.current_user_role() = 'ceo');

-- قراءة: المشرف/المعلم/مدير الدفعة يرون برامج دفعتهم فقط + البرامج العامة
create policy "programs_supervisor_read" on programs
  for select using (
    public.current_user_role() in ('supervisor','teacher','batch_manager')
    and (
      programs.batch_id = public.current_user_batch_id()::text
      or programs.batch_id = 'all'
    )
  );

-- كتابة: مدير الدفعة — دفعته فقط (لا يستطيع تعديل برامج 'all' ولا دفعات أخرى)
create policy "programs_manager_write" on programs
  for all
  using (
    public.current_user_role() = 'batch_manager'
    and programs.batch_id = public.current_user_batch_id()::text
  )
  with check (
    public.current_user_role() = 'batch_manager'
    and programs.batch_id = public.current_user_batch_id()::text
  );

-- كتابة: المشرف — دفعته فقط
create policy "programs_supervisor_write" on programs
  for all
  using (
    public.current_user_role() = 'supervisor'
    and programs.batch_id = public.current_user_batch_id()::text
  )
  with check (
    public.current_user_role() = 'supervisor'
    and programs.batch_id = public.current_user_batch_id()::text
  );

-- ── 3) STUDENTS — تأكيد قصر batch_manager ─────────────────────
-- (`students_manager_full` موجود مسبقاً من `supabase-batch-manager-migration.sql`
--  لكن نضيف WITH CHECK للـ insert/update حتى لا يُغيَّر batch_id لاحقاً)
drop policy if exists "students_manager_full" on students;

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

-- ── 4) SUPERVISORS (جدول المشرفين كمعطيات) ─────────────────────
drop policy if exists "supervisors_manager_full" on supervisors;

create policy "supervisors_manager_full" on supervisors
  for all
  using (
    public.current_user_role() = 'batch_manager'
    and public.current_user_batch_id() = supervisors.batch_id
  )
  with check (
    public.current_user_role() = 'batch_manager'
    and public.current_user_batch_id() = supervisors.batch_id
  );

-- ── 5) ATTENDANCE ─────────────────────────────────────────────
drop policy if exists "attendance_manager_full" on attendance;

create policy "attendance_manager_full" on attendance
  for all
  using (
    public.current_user_role() = 'batch_manager'
    and public.current_user_batch_id()::text = attendance.batch_id
  )
  with check (
    public.current_user_role() = 'batch_manager'
    and public.current_user_batch_id()::text = attendance.batch_id
  );

-- ── 6) JUZ_PROGRESS ───────────────────────────────────────────
drop policy if exists "juz_progress_manager_full" on juz_progress;

create policy "juz_progress_manager_full" on juz_progress
  for all
  using (
    public.current_user_role() = 'batch_manager'
    and exists (
      select 1 from students s
      where s.id = juz_progress.student_id
        and s.batch_id = public.current_user_batch_id()
    )
  )
  with check (
    public.current_user_role() = 'batch_manager'
    and exists (
      select 1 from students s
      where s.id = juz_progress.student_id
        and s.batch_id = public.current_user_batch_id()
    )
  );

-- ── 7) MATN_PROGRESS ──────────────────────────────────────────
-- (يُمكن لمدير الدفعة تعديل متون طلاب دفعته — لكن نستبدل السياسة
--  الموجودة التي كانت تعتمد exists-recursive بسياسة أسرع)
drop policy if exists "matn_ceo_full"             on matn_progress;
drop policy if exists "matn_supervisor_own_batch" on matn_progress;

create policy "matn_ceo_full" on matn_progress
  for all
  using (public.current_user_role() in ('ceo','batch_manager'))
  with check (
    public.current_user_role() = 'ceo'
    or (
      public.current_user_role() = 'batch_manager'
      and exists (
        select 1 from students s
        where s.id = matn_progress.student_id
          and s.batch_id = public.current_user_batch_id()
      )
    )
  );

create policy "matn_supervisor_own_batch" on matn_progress
  for all
  using (
    public.current_user_role() in ('supervisor','teacher')
    and exists (
      select 1 from students s
      where s.id = matn_progress.student_id
        and s.batch_id = public.current_user_batch_id()
    )
  );

-- ══════════════════════════════════════════════════════════════
-- ملاحظة: الـ SECURITY DEFINER على current_user_role يتجاوز RLS،
-- لذا لا يوجد خطر recursion. PostgreSQL يخزنها stable فتُستدعى
-- مرة واحدة داخل خطة الاستعلام.
-- ══════════════════════════════════════════════════════════════
