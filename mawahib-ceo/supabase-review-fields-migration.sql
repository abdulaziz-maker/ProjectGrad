-- ══════════════════════════════════════════════════════════════
-- Review Fields — المراجعة القريبة والبعيدة
-- شغّل هذا في Supabase SQL Editor مرة واحدة
--
-- أضيف حقلَيْن على جدول students لحفظ ملخص المراجعة:
--   - near_review  : ما حُفظ في آخر ٣ أشهر (نص حر، أمثلة: "جزء ١-٥")
--   - far_review   : ما حُفظ قبل ٣ أشهر (نص حر)
-- هذه حقول نصية حرة ليُدخلها المشرف يدوياً. (يمكن لاحقاً حسابها تلقائياً
-- من juz_progress + تواريخ الإنجاز.)
-- ══════════════════════════════════════════════════════════════

alter table students
  add column if not exists near_review text default '',
  add column if not exists far_review  text default '';
