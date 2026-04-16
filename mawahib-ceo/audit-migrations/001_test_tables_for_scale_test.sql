-- ============================================================
-- Audit migration — test_* tables for scale / load testing
-- Created by: deep-audit-2026-04-16
-- DO NOT APPLY TO PRODUCTION. Run manually against a scratch
-- Supabase project or schema. Drop these tables when done.
-- ============================================================

CREATE TABLE IF NOT EXISTS test_students (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  batch_id      int NOT NULL,
  supervisor_id uuid,
  status        text DEFAULT 'active',
  juz_completed int DEFAULT 0,
  created_at    timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS test_supervisors (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name     text NOT NULL,
  batch_id int
);

CREATE TABLE IF NOT EXISTS test_juz_progress (
  id          bigserial PRIMARY KEY,
  student_id  uuid NOT NULL,
  juz_number  int NOT NULL,
  status      text DEFAULT 'pending',
  updated_at  timestamptz DEFAULT now()
);

-- Indexes mirroring production layout (so scale-test reflects reality)
CREATE INDEX IF NOT EXISTS idx_test_students_batch      ON test_students(batch_id);
CREATE INDEX IF NOT EXISTS idx_test_students_supervisor ON test_students(supervisor_id);
CREATE INDEX IF NOT EXISTS idx_test_juz_student         ON test_juz_progress(student_id);
CREATE INDEX IF NOT EXISTS idx_test_juz_status          ON test_juz_progress(status);
