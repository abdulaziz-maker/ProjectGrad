-- ════════════════════════════════════════════════════════════════════
-- Student Cases System — 4-Stage Escalation + Weekly Reviews
-- ════════════════════════════════════════════════════════════════════
-- Scope: Per-batch isolated follow-up + escalation workflow
-- Privacy rule: No role sees data outside their batch scope (RLS enforced)
-- ════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────
-- 1. Weekly Reviews — المتابعة الأسبوعية لكل طالب
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS student_case_weekly_reviews (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- الربط
  week_start_date     DATE NOT NULL,                        -- أحد بداية الأسبوع
  hijri_week_label    TEXT NOT NULL,                        -- "الأسبوع 10 - 1447"
  student_id          TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  batch_id            INTEGER NOT NULL REFERENCES batches(id) ON DELETE RESTRICT,
  supervisor_id       TEXT REFERENCES supervisors(id),

  -- حالة المتابعة
  status              TEXT NOT NULL DEFAULT 'not_reviewed'
                      CHECK (status IN ('on_track', 'slight_delay', 'severe_delay', 'not_reviewed')),

  -- المحتوى
  notes               TEXT,
  action_taken        TEXT,
  parent_contacted    BOOLEAN DEFAULT false,

  -- الميتاداتا
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),
  completed_at        TIMESTAMPTZ,

  UNIQUE(week_start_date, student_id)
);

CREATE INDEX idx_scwr_batch_week   ON student_case_weekly_reviews(batch_id, week_start_date);
CREATE INDEX idx_scwr_student_week ON student_case_weekly_reviews(student_id, week_start_date DESC);
CREATE INDEX idx_scwr_supervisor   ON student_case_weekly_reviews(supervisor_id, week_start_date DESC);
CREATE INDEX idx_scwr_status       ON student_case_weekly_reviews(status) WHERE status != 'on_track';

-- ────────────────────────────────────────────────────────────────────
-- 2. Cases — حالات التصعيد النشطة
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS student_cases (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- الربط
  student_id              TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  batch_id                INTEGER NOT NULL REFERENCES batches(id) ON DELETE RESTRICT,

  -- المرحلة
  current_stage           TEXT NOT NULL DEFAULT 'stage_1_supervisor'
                          CHECK (current_stage IN (
                            'stage_1_supervisor',
                            'stage_2_batch_manager',
                            'stage_3_ceo',
                            'resolved',
                            'closed'
                          )),

  -- التواريخ
  started_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  stage_entered_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- المسؤول
  current_responsible_id  UUID REFERENCES profiles(id),

  -- السياق
  trigger_reason          TEXT NOT NULL,
  root_cause              TEXT,

  -- الحالة العامة
  status                  TEXT NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'improving', 'resolved', 'closed')),

  -- الإغلاق
  outcome                 TEXT,
  closed_at               TIMESTAMPTZ,
  closed_by               UUID REFERENCES profiles(id),

  created_at              TIMESTAMPTZ DEFAULT now(),
  updated_at              TIMESTAMPTZ DEFAULT now()
);

-- حالة نشطة واحدة فقط لكل طالب
CREATE UNIQUE INDEX uniq_active_case_per_student
  ON student_cases(student_id)
  WHERE status = 'active';

CREATE INDEX idx_sc_batch_stage    ON student_cases(batch_id, current_stage) WHERE status = 'active';
CREATE INDEX idx_sc_responsible    ON student_cases(current_responsible_id) WHERE status = 'active';
CREATE INDEX idx_sc_student_active ON student_cases(student_id) WHERE status = 'active';

-- ────────────────────────────────────────────────────────────────────
-- 3. Case Transitions — سجل تحركات المراحل
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS student_case_transitions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id           UUID NOT NULL REFERENCES student_cases(id) ON DELETE CASCADE,

  from_stage        TEXT,
  to_stage          TEXT NOT NULL,
  transition_type   TEXT NOT NULL
                    CHECK (transition_type IN ('auto', 'manual_escalate', 'manual_demote', 'close')),

  transitioned_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  transitioned_by   UUID REFERENCES profiles(id),
  reason            TEXT NOT NULL,
  notes             TEXT
);

CREATE INDEX idx_sct_case ON student_case_transitions(case_id, transitioned_at);

-- ────────────────────────────────────────────────────────────────────
-- 4. Case Actions — الإجراءات التفصيلية
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS student_case_actions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id       UUID NOT NULL REFERENCES student_cases(id) ON DELETE CASCADE,
  actor_id      UUID NOT NULL REFERENCES profiles(id),

  action_type   TEXT NOT NULL
                CHECK (action_type IN (
                  'supervisor_meeting',
                  'parent_call',
                  'parent_meeting',
                  'ceo_intervention',
                  'plan_adjustment',
                  'note'
                )),

  description   TEXT NOT NULL,
  outcome       TEXT,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_sca_case ON student_case_actions(case_id, occurred_at DESC);

-- ════════════════════════════════════════════════════════════════════
-- Row Level Security — أهم نقطة (العزل بين الدفعات)
-- ════════════════════════════════════════════════════════════════════
ALTER TABLE student_case_weekly_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_cases               ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_case_transitions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_case_actions        ENABLE ROW LEVEL SECURITY;

-- ─── Weekly Reviews ──────────────────────────────────────────────────
-- CEO + records_officer: كل شي
CREATE POLICY scwr_ceo_full ON student_case_weekly_reviews
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('ceo','records_officer'))
  );

-- Batch manager: دفعته فقط
CREATE POLICY scwr_manager_batch ON student_case_weekly_reviews
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role = 'batch_manager'
              AND p.batch_id = student_case_weekly_reviews.batch_id)
  );

-- Supervisor/teacher: طلابه فقط (ربط عبر students.supervisor_id)
CREATE POLICY scwr_supervisor_own ON student_case_weekly_reviews
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM students s, profiles p
            WHERE s.id = student_case_weekly_reviews.student_id
              AND p.id = auth.uid()
              AND p.role IN ('supervisor','teacher')
              AND s.supervisor_id = p.id::text)
  );

CREATE POLICY scwr_supervisor_write ON student_case_weekly_reviews
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM students s, profiles p
            WHERE s.id = student_case_weekly_reviews.student_id
              AND p.id = auth.uid()
              AND p.role IN ('supervisor','teacher')
              AND s.supervisor_id = p.id::text)
  );

CREATE POLICY scwr_supervisor_update ON student_case_weekly_reviews
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM students s, profiles p
            WHERE s.id = student_case_weekly_reviews.student_id
              AND p.id = auth.uid()
              AND p.role IN ('supervisor','teacher')
              AND s.supervisor_id = p.id::text)
  );

-- ─── Cases ───────────────────────────────────────────────────────────
CREATE POLICY sc_ceo_full ON student_cases
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'ceo')
  );

-- records_officer: قراءة فقط
CREATE POLICY sc_records_read ON student_cases
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'records_officer')
  );

CREATE POLICY sc_manager_read ON student_cases
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role = 'batch_manager'
              AND p.batch_id = student_cases.batch_id)
  );

-- Manager يكتب فقط في المرحلة 2 أو عند الإغلاق/demote
CREATE POLICY sc_manager_write_stage2 ON student_cases
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role = 'batch_manager'
              AND p.batch_id = student_cases.batch_id)
    AND current_stage IN ('stage_2_batch_manager', 'stage_1_supervisor')
  );

-- Supervisor: قراءة طلابه، وكتابة فقط في المرحلة 1
CREATE POLICY sc_supervisor_read ON student_cases
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM students s, profiles p
            WHERE s.id = student_cases.student_id
              AND p.id = auth.uid()
              AND p.role IN ('supervisor','teacher')
              AND s.supervisor_id = p.id::text)
  );

CREATE POLICY sc_supervisor_write_stage1 ON student_cases
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM students s, profiles p
            WHERE s.id = student_cases.student_id
              AND p.id = auth.uid()
              AND p.role IN ('supervisor','teacher')
              AND s.supervisor_id = p.id::text)
    AND current_stage = 'stage_1_supervisor'
  );

-- ─── Transitions (قراءة عبر صلاحيات الحالة) ────────────────────────
CREATE POLICY sct_read ON student_case_transitions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM student_cases c WHERE c.id = case_id)
  );

CREATE POLICY sct_insert_authorized ON student_case_transitions
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
            AND p.role IN ('ceo', 'batch_manager', 'supervisor', 'teacher'))
  );

-- ─── Actions ─────────────────────────────────────────────────────────
CREATE POLICY sca_read ON student_case_actions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM student_cases c WHERE c.id = case_id)
  );

CREATE POLICY sca_insert_own ON student_case_actions
  FOR INSERT WITH CHECK (actor_id = auth.uid());

-- ════════════════════════════════════════════════════════════════════
-- Triggers — updated_at + automatic history on stage change
-- ════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER scwr_touch BEFORE UPDATE ON student_case_weekly_reviews
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER sc_touch BEFORE UPDATE ON student_cases
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Auto-log transitions when current_stage changes
CREATE OR REPLACE FUNCTION log_case_stage_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.current_stage IS DISTINCT FROM OLD.current_stage THEN
    INSERT INTO student_case_transitions(case_id, from_stage, to_stage, transition_type, transitioned_by, reason)
    VALUES (
      NEW.id,
      OLD.current_stage,
      NEW.current_stage,
      CASE
        WHEN NEW.current_stage IN ('resolved', 'closed') THEN 'close'
        WHEN NEW.current_stage > OLD.current_stage THEN 'manual_escalate'
        ELSE 'manual_demote'
      END,
      auth.uid(),
      COALESCE(NEW.trigger_reason, 'تغيير يدوي للمرحلة')
    );
    NEW.stage_entered_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sc_log_stage_change BEFORE UPDATE ON student_cases
  FOR EACH ROW EXECUTE FUNCTION log_case_stage_change();

-- ════════════════════════════════════════════════════════════════════
-- Done. Next step: apply via supabase CLI or dashboard SQL editor.
-- ════════════════════════════════════════════════════════════════════
