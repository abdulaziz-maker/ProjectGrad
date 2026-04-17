-- ══════════════════════════════════════════════════════════════
-- Matn — إضافة المستوى التمهيدي ودعم الأبواب
-- شغّل هذا في Supabase SQL Editor مرة واحدة
-- ══════════════════════════════════════════════════════════════

-- 1) السماح بالمستوى التمهيدي (level_id = 0)
alter table texts drop constraint if exists texts_level_id_check;
alter table texts add constraint texts_level_id_check
  check (level_id between 0 and 6);

-- 2) جدول الأبواب (text_chapters) — لتقسيم المتن الواحد إلى أبواب/فصول
--    مثال: "النظم الجلي" ≈ 500 سطر مقسّم على ٨ أبواب فقه.
create table if not exists text_chapters (
  id              uuid primary key default gen_random_uuid(),
  text_id         uuid not null references texts(id) on delete cascade,
  chapter_number  integer not null,  -- ترتيب الباب داخل المتن
  title           text not null,      -- اسم الباب (مثال: "باب الطهارة")
  start_line      integer not null,   -- السطر الأول من الباب
  end_line        integer not null,   -- آخر سطر في الباب
  created_at      timestamptz not null default now(),
  unique (text_id, chapter_number),
  check (end_line >= start_line)
);

create index if not exists text_chapters_text_id_idx on text_chapters (text_id);

-- ── RLS ──────────────────────────────────────────────────────
alter table text_chapters enable row level security;

drop policy if exists "text_chapters_read_all" on text_chapters;
create policy "text_chapters_read_all" on text_chapters
  for select using (auth.uid() is not null);

drop policy if exists "text_chapters_write_ceo" on text_chapters;
create policy "text_chapters_write_ceo" on text_chapters
  for all
  using (public.current_user_role() = 'ceo')
  with check (public.current_user_role() = 'ceo');

-- ملاحظة: دالة `public.current_user_role()` تُعرَّف في
-- `supabase-auth-perf-migration.sql`. تأكّد من تشغيل ذلك أولاً.
