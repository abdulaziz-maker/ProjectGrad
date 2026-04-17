-- ══════════════════════════════════════════════════════════════
-- Supervisor Attendance — جدول حضور المشرفين
-- شغّل هذا في Supabase SQL Editor مرة واحدة
-- ══════════════════════════════════════════════════════════════

create table if not exists supervisor_attendance (
  id            uuid primary key default gen_random_uuid(),
  supervisor_id text not null,
  batch_id      integer not null,
  date          date not null,
  status        text not null check (status in ('present','absent','excused')),
  created_at    timestamptz not null default now(),
  unique (supervisor_id, date)
);

create index if not exists supervisor_attendance_batch_date_idx
  on supervisor_attendance (batch_id, date);

alter table supervisor_attendance enable row level security;

-- ceo: كامل
drop policy if exists "sup_att_ceo_all" on supervisor_attendance;
create policy "sup_att_ceo_all" on supervisor_attendance
  for all
  using (public.current_user_role() = 'ceo')
  with check (public.current_user_role() = 'ceo');

-- مدير الدفعة: كامل لمشرفي دفعته
drop policy if exists "sup_att_manager_all" on supervisor_attendance;
create policy "sup_att_manager_all" on supervisor_attendance
  for all
  using (
    public.current_user_role() = 'batch_manager'
    and supervisor_attendance.batch_id = public.current_user_batch_id()
  )
  with check (
    public.current_user_role() = 'batch_manager'
    and supervisor_attendance.batch_id = public.current_user_batch_id()
  );

-- المشرف: قراءة سجلّ نفسه
drop policy if exists "sup_att_self_read" on supervisor_attendance;
create policy "sup_att_self_read" on supervisor_attendance
  for select
  using (
    public.current_user_role() in ('supervisor','teacher')
    and exists (
      select 1 from supervisors s
      where s.id = supervisor_attendance.supervisor_id
        and s.user_id = auth.uid()::text
    )
  );
