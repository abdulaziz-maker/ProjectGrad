-- ══════════════════════════════════════════════════════════════
-- Matn — السماح لمدير الدفعة بإدارة المتون والمقررات
-- شغّل هذا في Supabase SQL Editor مرة واحدة
--
-- الهدف:
-- توسيع صلاحية الكتابة على جداول texts و text_units و text_chapters لتشمل
-- مدير الدفعة، بحيث يستطيع من صفحة /matn إضافة/تعديل/حذف متون ومقررات.
--
-- ملاحظة: المتون مشتركة بين كل الدفعات (ليست محدودة بدفعة). هذا التعديل
-- يعطي مدير الدفعة صلاحية إدارة مشابهة للمدير التنفيذي على هذه الجداول فقط.
-- ══════════════════════════════════════════════════════════════

-- texts
drop policy if exists "texts_write_ceo" on texts;
drop policy if exists "texts_write_admin" on texts;

create policy "texts_write_admin" on texts
  for all
  using (public.current_user_role() in ('ceo','batch_manager'))
  with check (public.current_user_role() in ('ceo','batch_manager'));

-- text_units
drop policy if exists "text_units_write_ceo"   on text_units;
drop policy if exists "text_units_write_admin" on text_units;

create policy "text_units_write_admin" on text_units
  for all
  using (public.current_user_role() in ('ceo','batch_manager'))
  with check (public.current_user_role() in ('ceo','batch_manager'));

-- text_chapters (أُنشئ في دفعة سابقة)
drop policy if exists "text_chapters_write_ceo"   on text_chapters;
drop policy if exists "text_chapters_write_admin" on text_chapters;

create policy "text_chapters_write_admin" on text_chapters
  for all
  using (public.current_user_role() in ('ceo','batch_manager'))
  with check (public.current_user_role() in ('ceo','batch_manager'));
