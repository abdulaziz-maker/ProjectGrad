-- ============================================================
-- Migration: نظام المتون الكامل
-- التاريخ: ٢٠٢٦-٠٤-١٢
-- المصدر: الخطة الأساسية المعتمدة ١٤٤٦هـ
-- ============================================================

-- ١. جدول المتون (texts)
CREATE TABLE IF NOT EXISTS texts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar         TEXT NOT NULL,
  category        TEXT NOT NULL CHECK (category IN ('علمي', 'تربوي', 'مهاري')),
  subject         TEXT NOT NULL,  -- علوم القرآن | الفقه | العقيدة | اللغة | التاريخ | الحديث | التربية الإيمانية | مهارات
  type            TEXT NOT NULL CHECK (type IN ('منظومة', 'منثور', 'سؤال_جواب', 'أحاديث', 'أسطر')),
  level_id        INTEGER NOT NULL CHECK (level_id BETWEEN 1 AND 6),
  total_lines     INTEGER NOT NULL DEFAULT 0,
  weekly_rate     INTEGER NOT NULL DEFAULT 16,  -- معدل الحفظ الأسبوعي للمستوى
  order_in_level  INTEGER NOT NULL DEFAULT 1,
  description     TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ٢. جدول المقررات (text_units)
CREATE TABLE IF NOT EXISTS text_units (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  text_id     UUID NOT NULL REFERENCES texts(id) ON DELETE CASCADE,
  unit_number INTEGER NOT NULL,
  start_line  INTEGER NOT NULL,
  end_line    INTEGER NOT NULL,
  UNIQUE (text_id, unit_number)
);

-- ٣. جدول تتبع تقدم الطلاب في كل متن
CREATE TABLE IF NOT EXISTS student_text_progress (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  text_id         UUID NOT NULL REFERENCES texts(id) ON DELETE CASCADE,
  lines_memorized INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'not_started'
                  CHECK (status IN ('not_started', 'in_progress', 'memorized', 'needs_revision')),
  notes           TEXT,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, text_id)
);

-- ── RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE texts ENABLE ROW LEVEL SECURITY;
ALTER TABLE text_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_text_progress ENABLE ROW LEVEL SECURITY;

-- texts: قراءة للجميع، كتابة للـ CEO فقط
CREATE POLICY "texts_read_all" ON texts FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "texts_write_ceo" ON texts FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'ceo')
);

-- text_units: قراءة للجميع
CREATE POLICY "text_units_read_all" ON text_units FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "text_units_write_ceo" ON text_units FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'ceo')
);

-- student_text_progress: CEO/batch_manager يرون الكل، supervisor دفعته فقط
CREATE POLICY "stp_ceo_full" ON student_text_progress FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('ceo', 'batch_manager'))
);

CREATE POLICY "stp_supervisor" ON student_text_progress FOR ALL USING (
  EXISTS (
    SELECT 1 FROM profiles p
    JOIN students s ON s.batch_id::text = p.batch_id::text
    WHERE p.id = auth.uid()
      AND p.role IN ('supervisor', 'teacher')
      AND s.id = student_text_progress.student_id
  )
);

-- ── Function: توليد المقررات تلقائياً ──────────────────────────────────
CREATE OR REPLACE FUNCTION generate_text_units(
  p_text_id UUID,
  p_total_lines INTEGER,
  p_weekly_rate INTEGER
) RETURNS void AS $$
DECLARE
  v_unit INTEGER := 1;
  v_start INTEGER := 1;
  v_end INTEGER;
BEGIN
  DELETE FROM text_units WHERE text_id = p_text_id;
  WHILE v_start <= p_total_lines LOOP
    v_end := LEAST(v_start + p_weekly_rate - 1, p_total_lines);
    INSERT INTO text_units (text_id, unit_number, start_line, end_line)
    VALUES (p_text_id, v_unit, v_start, v_end);
    v_unit := v_unit + 1;
    v_start := v_end + 1;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- SEEDER — جميع المتون من الخطة الأساسية المعتمدة
-- ============================================================

-- ── المستوى الأول — ٥١٥ سطر — ١٦ سطر/أسبوع ─────────────────────────
INSERT INTO texts (name_ar, category, subject, type, level_id, total_lines, weekly_rate, order_in_level) VALUES
  ('تحفة الأطفال',                      'علمي',   'علوم القرآن',       'منظومة',    1, 61,  16, 1),
  ('النظم المبين في الفقه المتعيَّن',    'علمي',   'الفقه',            'منظومة',    1, 51,  16, 2),
  ('متن الأدب ١',                       'علمي',   'اللغة',             'منظومة',    1, 130, 16, 3),
  ('متن التاريخ والسير - المستوى ١',    'علمي',   'التاريخ',          'سؤال_جواب', 1, 130, 16, 4),
  ('منظومة التوحيد والإيمان',           'تربوي',  'التربية الإيمانية', 'منظومة',    1, 34,  16, 5),
  ('المتن التمهيدي للقاسم',             'تربوي',  'التربية الإيمانية', 'منثور',     1, 109, 16, 6);
-- المجموع: 61+51+130+130+34+109 = 515 ✅

-- ── المستوى الثاني — ٥٨٩ سطر — ١٨ سطر/أسبوع ────────────────────────
INSERT INTO texts (name_ar, category, subject, type, level_id, total_lines, weekly_rate, order_in_level) VALUES
  ('الجزرية',                           'علمي',   'علوم القرآن',       'منظومة',    2, 109, 18, 1),
  ('لامية شيخ الإسلام',                 'علمي',   'العقيدة',           'منظومة',    2, 16,  18, 2),
  ('القواعد الأربع',                    'علمي',   'العقيدة',           'منثور',     2, 31,  18, 3),
  ('الأصول الثلاثة',                    'علمي',   'العقيدة',           'منثور',     2, 123, 18, 4),
  ('متن الأدب ٢',                       'علمي',   'اللغة',             'منظومة',    2, 130, 18, 5),
  ('متن التاريخ والسير - المستوى ٢',    'علمي',   'التاريخ',          'سؤال_جواب', 2, 130, 18, 6),
  ('منظومة الأسماء الحسنى',             'تربوي',  'التربية الإيمانية', 'منظومة',    2, 20,  18, 7),
  ('قواعد خط النسخ',                    'مهاري',  'مهارات',            'أسطر',      2, 30,  18, 8);
-- المجموع: 109+16+31+123+130+130+20+30 = 589 ✅

-- ── المستوى الثالث — ١٣٠٩ سطر — ٤١ سطر/أسبوع ───────────────────────
-- ⚠️ تنبيه: المتون المعروفة ٢٩٠ فقط. المتبقي (١٠١٩) يُضاف لاحقاً.
INSERT INTO texts (name_ar, category, subject, type, level_id, total_lines, weekly_rate, order_in_level, description) VALUES
  ('متن الأدب ٣',                       'علمي',   'اللغة',    'منظومة',    3, 130, 41, 1, NULL),
  ('متن التاريخ والسير - المستوى ٣',    'علمي',   'التاريخ',  'سؤال_جواب', 3, 130, 41, 2, NULL),
  ('قواعد خط الرقعة',                   'مهاري',  'مهارات',   'أسطر',      3, 30,  41, 3, NULL);
-- المعروف: 290. الناقص: 1019 سطر — بانتظار إضافة المتون الناقصة

-- ── المستوى الرابع — ١٣٦٥ سطر — ٤٣ سطر/أسبوع ───────────────────────
INSERT INTO texts (name_ar, category, subject, type, level_id, total_lines, weekly_rate, order_in_level) VALUES
  ('المتفق عليه (المجلد الأول)',        'علمي',   'الحديث',   'أحاديث',    4, 500, 43, 1),
  ('النظم الجلي (الربع الثاني)',        'علمي',   'الفقه',    'منظومة',    4, 196, 43, 2),
  ('مختصر المدخل إلى علم الفقه',       'علمي',   'الفقه',    'سؤال_جواب', 4, 25,  43, 3),
  ('سلم الوصول (النصف الثاني)',         'علمي',   'العقيدة',  'منظومة',    4, 127, 43, 4),
  ('مثلث قطرب',                         'علمي',   'اللغة',    'منظومة',    4, 88,  43, 5),
  ('متن الأدب ٤',                       'علمي',   'اللغة',    'منظومة',    4, 200, 43, 6),
  ('متن التاريخ والسير - المستوى ٤',    'علمي',   'التاريخ',  'سؤال_جواب', 4, 199, 43, 7),
  ('قواعد الرسم العثماني',              'مهاري',  'مهارات',   'أسطر',      4, 30,  43, 8);
-- المجموع: 500+196+25+127+88+200+199+30 = 1365 ✅

-- ── المستوى الخامس — ١٣٧٨ سطر — ٤٣ سطر/أسبوع ───────────────────────
INSERT INTO texts (name_ar, category, subject, type, level_id, total_lines, weekly_rate, order_in_level) VALUES
  ('المتفق عليه (المجلد الثاني)',       'علمي',   'الحديث',           'أحاديث',    5, 500, 43, 1),
  ('النظم الجلي (الربع الثالث)',        'علمي',   'الفقه',            'منظومة',    5, 190, 43, 2),
  ('نظم الآجرومية ١',                   'علمي',   'اللغة',            'منظومة',    5, 100, 43, 3),
  ('متن الأدب ٥',                       'علمي',   'اللغة',            'منظومة',    5, 254, 43, 4),
  ('متن التاريخ والسير - المستوى ٥',    'علمي',   'التاريخ',          'سؤال_جواب', 5, 254, 43, 5),
  ('مختارات من ابن الوردي',             'تربوي',  'التربية الإيمانية', 'منظومة',    5, 80,  43, 6);
-- المجموع: 500+190+100+254+254+80 = 1378 ✅

-- ── المستوى السادس — ١٥٠٥ سطر — ٤٧ سطر/أسبوع ───────────────────────
INSERT INTO texts (name_ar, category, subject, type, level_id, total_lines, weekly_rate, order_in_level) VALUES
  ('المتفق عليه (المجلد الثالث)',               'علمي',   'الحديث',           'أحاديث',    6, 500, 47, 1),
  ('الرتبة في نظم النخبة ٢',                    'علمي',   'الحديث',           'منظومة',    6, 105, 47, 2),
  ('النظم الجلي (الربع الرابع)',                'علمي',   'الفقه',            'منظومة',    6, 185, 47, 3),
  ('منظومة الرحبية',                            'علمي',   'الفقه',            'منظومة',    6, 176, 47, 4),
  ('منظومة القواعد الفقهية',                    'علمي',   'الفقه',            'منظومة',    6, 49,  47, 5),
  ('مسائل من العقيدة والتوحيد',                 'علمي',   'العقيدة',          'سؤال_جواب', 6, 50,  47, 6),
  ('نظم الآجرومية ٢',                           'علمي',   'اللغة',            'منظومة',    6, 100, 47, 7),
  ('متن الأدب ٦',                               'علمي',   'اللغة',            'منظومة',    6, 130, 47, 8),
  ('متن التاريخ والسير - المستوى ٦',            'علمي',   'التاريخ',          'سؤال_جواب', 6, 130, 47, 9),
  ('مختارات من متن مطهرة القلوب',               'تربوي',  'التربية الإيمانية', 'منظومة',    6, 80,  47, 10);
-- المجموع: 500+105+185+176+49+50+100+130+130+80 = 1505 ✅

-- ── توليد المقررات لجميع المتون ──────────────────────────────────────
SELECT generate_text_units(id, total_lines, weekly_rate) FROM texts WHERE is_active = true;

-- ============================================================
-- ملخص الإحصائيات (للتحقق):
-- المستوى ١: ٦ متون = ٥١٥ سطر
-- المستوى ٢: ٨ متون = ٥٨٩ سطر
-- المستوى ٣: ٣ متون معروفة = ٢٩٠ سطر (يتبقى ١٠١٩)
-- المستوى ٤: ٨ متون = ١٣٦٥ سطر
-- المستوى ٥: ٦ متون = ١٣٧٨ سطر
-- المستوى ٦: ١٠ متون = ١٥٠٥ سطر
-- الإجمالي: ٤١ متن مُدخل (+ المتون الناقصة من المستوى ٣)
-- ============================================================
