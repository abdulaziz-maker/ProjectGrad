-- ══════════════════════════════════════════════════════════════
-- Students — البيانات الشخصية (الهوية، تاريخ الميلاد، جوال ولي الأمر)
-- شغّل هذا في Supabase SQL Editor مرة واحدة
-- ══════════════════════════════════════════════════════════════

alter table students
  add column if not exists national_id  text default '',
  add column if not exists birth_date   date,
  add column if not exists parent_phone text default '';

-- قيد خفيف: رقم الهوية إن وجد يجب أن يكون ١٠ أرقام (لا يُجبر التعبئة)
alter table students drop constraint if exists students_national_id_check;
alter table students add constraint students_national_id_check
  check (national_id is null or national_id = '' or national_id ~ '^[0-9]{10}$');

-- جوال ولي الأمر: ٩ أو ١٠ أرقام، يبدأ بـ 05 اختيارياً
alter table students drop constraint if exists students_parent_phone_check;
alter table students add constraint students_parent_phone_check
  check (parent_phone is null or parent_phone = '' or parent_phone ~ '^[0-9+]{9,15}$');
