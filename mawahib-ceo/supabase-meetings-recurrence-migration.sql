-- ══════════════════════════════════════════════════════════════
-- Meetings — إضافة دعم الاجتماعات الدورية
-- شغّل هذا في Supabase SQL Editor مرة واحدة
-- ══════════════════════════════════════════════════════════════

-- recurrence: none / weekly / monthly
-- series_id: نفس المعرِّف لكل اجتماعات السلسلة الواحدة (لتمييز الاجتماعات
--           المتولَّدة من نفس اجتماع دوري).
alter table meetings
  add column if not exists recurrence text not null default 'none'
    check (recurrence in ('none','weekly','monthly')),
  add column if not exists series_id text;

-- فهرس سريع لاستعلام اجتماعات سلسلة معيّنة
create index if not exists meetings_series_idx on meetings (series_id)
  where series_id is not null;
