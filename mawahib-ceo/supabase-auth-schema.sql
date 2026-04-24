-- ══════════════════════════════════════════════════════════════
-- Auth Schema — نظام الصلاحيات
-- شغّل هذا في Supabase SQL Editor مرة واحدة
-- ══════════════════════════════════════════════════════════════

-- 1. جدول الملفات الشخصية
create table if not exists profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  role       text not null check (role in ('ceo', 'supervisor', 'teacher')),
  batch_id   integer references batches(id),
  name       text not null default '',
  created_at timestamptz default now()
);

-- 2. تفعيل RLS
alter table profiles enable row level security;

-- 3. سياسات جدول profiles
drop policy if exists "own_profile_read"    on profiles;
drop policy if exists "ceo_all_profiles"    on profiles;
drop policy if exists "ceo_insert_profiles" on profiles;
drop policy if exists "ceo_update_profiles" on profiles;
drop policy if exists "ceo_delete_profiles" on profiles;

create policy "own_profile_read" on profiles
  for select using (auth.uid() = id);

create policy "ceo_all_profiles" on profiles
  for all using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'ceo')
  );

-- 4. سياسات جدول students
alter table students enable row level security;

drop policy if exists "students_ceo_all"        on students;
drop policy if exists "students_supervisor_read" on students;
drop policy if exists "students_supervisor_write"on students;

create policy "students_ceo_all" on students
  for all using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'ceo')
  );

create policy "students_supervisor_read" on students
  for select using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and p.role in ('supervisor','teacher')
        and p.batch_id = students.batch_id
    )
  );

create policy "students_supervisor_write" on students
  for all using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and p.role = 'supervisor'
        and p.batch_id = students.batch_id
    )
  );

-- 5. سياسات جدول supervisors
alter table supervisors enable row level security;

drop policy if exists "supervisors_ceo_all"  on supervisors;
drop policy if exists "supervisors_self_read"on supervisors;

create policy "supervisors_ceo_all" on supervisors
  for all using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'ceo')
  );

create policy "supervisors_self_read" on supervisors
  for select using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('supervisor','teacher'))
  );

-- 6. سياسات جدول batches
alter table batches enable row level security;

drop policy if exists "batches_ceo_all"  on batches;
drop policy if exists "batches_read_all" on batches;

create policy "batches_ceo_all" on batches
  for all using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'ceo')
  );

create policy "batches_read_all" on batches
  for select using (auth.uid() is not null);

-- 7. سياسات جدول attendance
alter table attendance enable row level security;

drop policy if exists "attendance_ceo_all"        on attendance;
drop policy if exists "attendance_supervisor_all"  on attendance;

create policy "attendance_ceo_all" on attendance
  for all using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'ceo')
  );

create policy "attendance_supervisor_all" on attendance
  for all using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and p.role = 'supervisor'
        and p.batch_id::text = attendance.batch_id
    )
  );

-- 8. سياسات جدول juz_progress
alter table juz_progress enable row level security;

drop policy if exists "juz_ceo_all"        on juz_progress;
drop policy if exists "juz_supervisor_all" on juz_progress;

create policy "juz_ceo_all" on juz_progress
  for all using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'ceo')
  );

create policy "juz_supervisor_all" on juz_progress
  for all using (
    exists (
      select 1 from profiles p
      join students s on s.id = juz_progress.student_id
      where p.id = auth.uid()
        and p.role = 'supervisor'
        and p.batch_id = s.batch_id
    )
  );

-- 9. سياسات جدول meetings
alter table meetings enable row level security;

drop policy if exists "meetings_ceo_all"  on meetings;
drop policy if exists "meetings_auth_read"on meetings;

create policy "meetings_ceo_all" on meetings
  for all using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'ceo')
  );

create policy "meetings_auth_read" on meetings
  for select using (auth.uid() is not null);

-- 10. سياسات جدول programs
alter table programs enable row level security;

drop policy if exists "programs_ceo_all"        on programs;
drop policy if exists "programs_supervisor_read" on programs;

create policy "programs_ceo_all" on programs
  for all using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'ceo')
  );

create policy "programs_supervisor_read" on programs
  for select using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and p.role in ('supervisor','teacher')
        and (programs.batch_id = p.batch_id::text or programs.batch_id = 'all')
    )
  );

-- 11. سياسات جدول followups
alter table followups enable row level security;

drop policy if exists "followups_ceo_all"        on followups;
drop policy if exists "followups_supervisor_all" on followups;

create policy "followups_ceo_all" on followups
  for all using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'ceo')
  );

create policy "followups_supervisor_all" on followups
  for all using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and p.role = 'supervisor'
    )
  );

-- 12. سياسات جداول أخرى — مشاهدة للجميع المسجلين
alter table exams enable row level security;
drop policy if exists "exams_auth" on exams;
create policy "exams_auth" on exams for all using (auth.uid() is not null);

alter table ceo_tasks enable row level security;
drop policy if exists "tasks_ceo" on ceo_tasks;
create policy "tasks_ceo" on ceo_tasks
  for all using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'ceo')
  );
