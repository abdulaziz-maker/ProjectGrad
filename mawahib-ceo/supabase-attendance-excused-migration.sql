-- ══════════════════════════════════════════════════════════════
-- Attendance — إضافة حالة "غائب بعذر" (excused)
-- شغّل هذا في Supabase SQL Editor مرة واحدة
--
-- المطلوب: ثلاث حالات فقط: present / absent / excused.
-- البيانات القديمة المحفوظة بقيمة 'late' تُحوَّل إلى 'excused'.
-- ══════════════════════════════════════════════════════════════

-- 1) ترحيل البيانات القديمة
update attendance set status = 'excused' where status = 'late';

-- 2) (اختياري) تثبيت القيم المسموح بها على عمود الحالة
--    (نتجنّب enum صارم حفاظاً على توافق التطبيق العميل مؤقتاً؛
--     CHECK constraint خفيف وكافٍ.)
alter table attendance drop constraint if exists attendance_status_check;
alter table attendance add constraint attendance_status_check
  check (status in ('present','absent','excused'));
