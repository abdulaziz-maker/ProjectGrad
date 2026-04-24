-- ══════════════════════════════════════════════════════════════
-- Auth Performance Migration — تحسين أداء RLS على profiles
-- شغّل هذا في Supabase SQL Editor مرة واحدة
--
-- المشكلة:
-- سياسات `profiles` الحالية تستخدم `exists (select 1 from profiles p ...)`
-- داخل RLS الخاصة بجدول profiles نفسه — هذا يسبب تقييم RLS متكرراً
-- (Recursive RLS) ويبطئ كل `getProfile()` قد تصل لمئات الميلي ثانية.
--
-- الحل:
-- دالة SECURITY DEFINER تتخطى RLS لتجلب الدور مرة واحدة، ثم نستخدمها
-- بدلاً من الـ subquery في كل السياسات التي تحتاج فحص "هل أنا ceo".
-- ══════════════════════════════════════════════════════════════

-- 1) دالة مساعدة غير متكررة
create or replace function public.current_user_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() limit 1
$$;

grant execute on function public.current_user_role() to authenticated, anon;

create or replace function public.current_user_batch_id()
returns integer
language sql
security definer
stable
set search_path = public
as $$
  select batch_id from public.profiles where id = auth.uid() limit 1
$$;

grant execute on function public.current_user_batch_id() to authenticated, anon;

-- 2) استبدال سياسات profiles بغير المتكررة
drop policy if exists "own_profile_read" on profiles;
drop policy if exists "ceo_all_profiles" on profiles;

create policy "own_profile_read" on profiles
  for select using (auth.uid() = id);

create policy "ceo_all_profiles" on profiles
  for all using (public.current_user_role() = 'ceo');

-- 3) تحسين بقية السياسات (استبدال exists subquery بالدالة)
drop policy if exists "students_ceo_all"        on students;
drop policy if exists "students_supervisor_read" on students;
drop policy if exists "students_supervisor_write"on students;

create policy "students_ceo_all" on students
  for all using (public.current_user_role() = 'ceo');

create policy "students_supervisor_read" on students
  for select using (
    public.current_user_role() in ('supervisor','teacher','batch_manager')
    and public.current_user_batch_id() = students.batch_id
  );

create policy "students_supervisor_write" on students
  for all using (
    public.current_user_role() in ('supervisor','batch_manager')
    and public.current_user_batch_id() = students.batch_id
  );

drop policy if exists "supervisors_ceo_all"  on supervisors;
drop policy if exists "supervisors_self_read"on supervisors;

create policy "supervisors_ceo_all" on supervisors
  for all using (public.current_user_role() = 'ceo');

create policy "supervisors_self_read" on supervisors
  for select using (
    public.current_user_role() in ('supervisor','teacher','batch_manager')
  );

drop policy if exists "batches_ceo_all"  on batches;
drop policy if exists "batches_read_all" on batches;

create policy "batches_ceo_all" on batches
  for all using (public.current_user_role() = 'ceo');

create policy "batches_read_all" on batches
  for select using (auth.uid() is not null);

drop policy if exists "attendance_ceo_all"       on attendance;
drop policy if exists "attendance_supervisor_all" on attendance;

create policy "attendance_ceo_all" on attendance
  for all using (public.current_user_role() = 'ceo');

create policy "attendance_supervisor_all" on attendance
  for all using (
    public.current_user_role() in ('supervisor','batch_manager')
    and public.current_user_batch_id()::text = attendance.batch_id
  );

drop policy if exists "juz_ceo_all"        on juz_progress;
drop policy if exists "juz_supervisor_all" on juz_progress;

create policy "juz_ceo_all" on juz_progress
  for all using (public.current_user_role() = 'ceo');

create policy "juz_supervisor_all" on juz_progress
  for all using (
    public.current_user_role() in ('supervisor','batch_manager')
    and exists (
      select 1 from students s
      where s.id = juz_progress.student_id
        and s.batch_id = public.current_user_batch_id()
    )
  );

drop policy if exists "meetings_ceo_all"  on meetings;
drop policy if exists "meetings_auth_read"on meetings;

create policy "meetings_ceo_all" on meetings
  for all using (public.current_user_role() = 'ceo');

create policy "meetings_auth_read" on meetings
  for select using (auth.uid() is not null);

drop policy if exists "programs_ceo_all"        on programs;
drop policy if exists "programs_supervisor_read" on programs;

create policy "programs_ceo_all" on programs
  for all using (public.current_user_role() = 'ceo');

create policy "programs_supervisor_read" on programs
  for select using (
    public.current_user_role() in ('supervisor','teacher','batch_manager')
    and (programs.batch_id = public.current_user_batch_id()::text or programs.batch_id = 'all')
  );

drop policy if exists "followups_ceo_all"        on followups;
drop policy if exists "followups_supervisor_all" on followups;

create policy "followups_ceo_all" on followups
  for all using (public.current_user_role() = 'ceo');

create policy "followups_supervisor_all" on followups
  for all using (
    public.current_user_role() in ('supervisor','batch_manager')
  );

drop policy if exists "tasks_ceo" on ceo_tasks;

create policy "tasks_ceo" on ceo_tasks
  for all using (public.current_user_role() = 'ceo');

-- 4) فهرس سريع على profiles.id (PK أصلاً — لكن نضمن)
-- لا داعي: id PRIMARY KEY موجود.

-- 5) السماح بإضافة batch_manager كدور صالح
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('ceo', 'batch_manager', 'supervisor', 'teacher'));
