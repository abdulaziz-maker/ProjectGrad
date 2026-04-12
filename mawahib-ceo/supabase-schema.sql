-- =========================================
-- مشروع المواهب الناشئة — قاعدة البيانات
-- شغّل هذا الملف مرة واحدة في Supabase SQL Editor
-- =========================================

-- ---- الدفعات ----
CREATE TABLE IF NOT EXISTS batches (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  grade_levels TEXT DEFAULT '',
  manager_name TEXT DEFAULT '',
  student_count INTEGER DEFAULT 0,
  completion_percentage NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---- المشرفون ----
CREATE TABLE IF NOT EXISTS supervisors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  age INTEGER DEFAULT 0,
  specialty TEXT DEFAULT '',
  experience_years INTEGER DEFAULT 0,
  strengths TEXT DEFAULT '',
  weaknesses TEXT DEFAULT '',
  rating NUMERIC DEFAULT 0,
  student_count INTEGER DEFAULT 0,
  last_report_date DATE,
  avg_student_progress NUMERIC DEFAULT 0,
  notes TEXT DEFAULT '',
  batch_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---- الطلاب ----
CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  batch_id INTEGER NOT NULL,
  supervisor_id TEXT,
  supervisor_name TEXT DEFAULT '',
  enrollment_date DATE,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT DEFAULT '',
  juz_completed INTEGER DEFAULT 0,
  completion_percentage NUMERIC DEFAULT 0,
  last_followup DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---- خريطة الحفظ ----
CREATE TABLE IF NOT EXISTS juz_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id TEXT NOT NULL,
  juz_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_started',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, juz_number)
);

-- ---- الاختبارات ----
CREATE TABLE IF NOT EXISTS exams (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  student_name TEXT NOT NULL,
  batch_id INTEGER NOT NULL,
  juz_number INTEGER NOT NULL,
  examiner TEXT NOT NULL,
  date DATE NOT NULL,
  time TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'scheduled',
  score NUMERIC,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---- الاجتماعات ----
CREATE TABLE IF NOT EXISTS meetings (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  date DATE NOT NULL,
  time TEXT DEFAULT '',
  attendees TEXT[] DEFAULT '{}',
  agenda TEXT DEFAULT '',
  decisions TEXT DEFAULT '',
  recommendations TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---- البرامج التربوية ----
CREATE TABLE IF NOT EXISTS programs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  type TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  location TEXT DEFAULT '',
  budget NUMERIC DEFAULT 0,
  objectives TEXT DEFAULT '',
  report TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'upcoming',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---- الحضور والغياب ----
CREATE TABLE IF NOT EXISTS attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  batch_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(date, batch_id, student_id)
);

-- ---- مهام المدير ----
CREATE TABLE IF NOT EXISTS ceo_tasks (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  recurrence TEXT NOT NULL,
  due_date DATE,
  completed_dates TEXT[] DEFAULT '{}',
  priority TEXT NOT NULL DEFAULT 'medium',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---- تصنيفات مخصصة ----
CREATE TABLE IF NOT EXISTS custom_categories (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  color TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---- متابعة المشرف للطلاب ----
CREATE TABLE IF NOT EXISTS followups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supervisor_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  week_of DATE NOT NULL,
  checked BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(supervisor_id, student_id, week_of)
);

-- =========================================
-- RLS — السماح الكامل مؤقتاً (سيُضبط في مرحلة المصادقة)
-- =========================================
ALTER TABLE batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE supervisors ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE juz_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE ceo_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE followups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all" ON batches FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON supervisors FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON students FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON juz_progress FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON exams FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON meetings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON programs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON attendance FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON ceo_tasks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON custom_categories FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON followups FOR ALL USING (true) WITH CHECK (true);
