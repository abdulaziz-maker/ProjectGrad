-- ═══════════════════════════════════════════════
-- Quran Followup System — Migration
-- Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════

-- 1. Quran Plans (per-student memorization plan)
CREATE TABLE IF NOT EXISTS quran_plans (
  id          SERIAL PRIMARY KEY,
  student_id  TEXT NOT NULL,
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  start_position INT NOT NULL DEFAULT 1,
  daily_rate  INT NOT NULL DEFAULT 1,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
-- Only one active plan per student
CREATE UNIQUE INDEX IF NOT EXISTS idx_quran_plans_active
  ON quran_plans (student_id) WHERE is_active = true;

-- 2. Daily Followups (supervisor records actual position daily)
CREATE TABLE IF NOT EXISTS daily_followups (
  id                SERIAL PRIMARY KEY,
  student_id        TEXT NOT NULL,
  supervisor_id     TEXT,
  followup_date     DATE NOT NULL,
  expected_position INT NOT NULL,
  actual_position   INT,
  gap               INT,
  is_exam_day       BOOLEAN DEFAULT false,
  near_review       TEXT DEFAULT '',
  far_review        TEXT DEFAULT '',
  delay_reasons     JSONB DEFAULT '[]'::jsonb,
  treatment_actions JSONB DEFAULT '[]'::jsonb,
  notes             TEXT DEFAULT '',
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, followup_date)
);

-- 3. Followup Escalations (weekly auto-check)
CREATE TABLE IF NOT EXISTS followup_escalations (
  id            SERIAL PRIMARY KEY,
  student_id    TEXT NOT NULL,
  student_name  TEXT NOT NULL,
  supervisor_id TEXT,
  batch_id      INT,
  weeks_delayed INT NOT NULL DEFAULT 1,
  level         TEXT NOT NULL DEFAULT 'supervisor',
  triggered_at  TIMESTAMPTZ DEFAULT NOW(),
  resolved_at   TIMESTAMPTZ,
  action_taken  TEXT,
  status        TEXT NOT NULL DEFAULT 'pending',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Batch Schedule (per-batch calendar overrides)
CREATE TABLE IF NOT EXISTS batch_schedule (
  id        SERIAL PRIMARY KEY,
  batch_id  INT NOT NULL,
  date      DATE NOT NULL,
  day_type  TEXT NOT NULL DEFAULT 'normal'
              CHECK (day_type IN ('normal','holiday','intensive','exam','educational_day','trip')),
  notes     TEXT DEFAULT '',
  UNIQUE(batch_id, date)
);

-- ─── RLS ───
ALTER TABLE quran_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE followup_escalations ENABLE ROW LEVEL SECURITY;
ALTER TABLE batch_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all" ON quran_plans           FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON daily_followups       FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON followup_escalations  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON batch_schedule        FOR ALL TO authenticated USING (true) WITH CHECK (true);
