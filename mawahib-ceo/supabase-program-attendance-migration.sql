-- ══════════════════════════════════════════════════════════════
-- Program Attendance — تحضير الطلاب داخل البرامج التربوية
-- شغّل هذا في Supabase SQL Editor مرة واحدة
-- ══════════════════════════════════════════════════════════════

create table if not exists program_attendance (
  id         uuid primary key default gen_random_uuid(),
  program_id text not null,
  student_id text not null,
  status     text not null check (status in ('present','absent','excused')),
  created_at timestamptz not null default now(),
  unique (program_id, student_id)
);

create index if not exists program_attendance_program_idx on program_attendance (program_id);

alter table program_attendance enable row level security;

-- ceo: كامل
drop policy if exists "prog_att_ceo_all" on program_attendance;
create policy "prog_att_ceo_all" on program_attendance
  for all
  using (public.current_user_role() = 'ceo')
  with check (public.current_user_role() = 'ceo');

-- batch_manager / supervisor: قراءة/كتابة لطلاب دفعتهم فقط
drop policy if exists "prog_att_batch_rw" on program_attendance;
create policy "prog_att_batch_rw" on program_attendance
  for all
  using (
    public.current_user_role() in ('batch_manager','supervisor')
    and exists (
      select 1 from students s
      where s.id = program_attendance.student_id
        and s.batch_id = public.current_user_batch_id()
    )
  )
  with check (
    public.current_user_role() in ('batch_manager','supervisor')
    and exists (
      select 1 from students s
      where s.id = program_attendance.student_id
        and s.batch_id = public.current_user_batch_id()
    )
  );

-- teacher: قراءة فقط لطلاب دفعتهم
drop policy if exists "prog_att_teacher_read" on program_attendance;
create policy "prog_att_teacher_read" on program_attendance
  for select
  using (
    public.current_user_role() = 'teacher'
    and exists (
      select 1 from students s
      where s.id = program_attendance.student_id
        and s.batch_id = public.current_user_batch_id()
    )
  );
