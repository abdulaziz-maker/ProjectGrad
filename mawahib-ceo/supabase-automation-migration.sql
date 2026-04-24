-- ═══════════════════════════════════════════════════════════════════════
-- نظام الأتمتة الكامل — Migration
-- ═══════════════════════════════════════════════════════════════════════

-- 1. NOTIFICATIONS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  type         text NOT NULL,                       -- 'escalation' | 'report' | 'alert' | 'achievement' | 'level_transition'
  title        text NOT NULL,
  body         text NOT NULL,
  data         jsonb DEFAULT '{}',
  severity     text DEFAULT 'info',                 -- 'info' | 'warning' | 'error' | 'success'
  target_role  text,                                -- 'ceo' | 'supervisor' | 'batch_manager' | null = all
  target_user_id uuid,
  read         boolean DEFAULT false,
  created_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_read       ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_role       ON notifications(target_role);

-- 2. ESCALATIONS ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS escalations (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id          uuid REFERENCES students(id) ON DELETE CASCADE,
  student_name        text NOT NULL,
  supervisor_id       uuid,
  supervisor_name     text,
  batch_id            integer,
  consecutive_weeks   integer NOT NULL DEFAULT 1,
  level               integer NOT NULL DEFAULT 1,   -- 1=مشرف, 2=مدير دفعة, 3=واتساب, 4=عاجل
  action_required     text NOT NULL,
  whatsapp_message    text,                         -- مولّد تلقائياً عند level=3
  resolved            boolean DEFAULT false,
  resolved_at         timestamptz,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  UNIQUE(student_id)                                -- تصعيد واحد نشط لكل طالب
);

CREATE INDEX IF NOT EXISTS idx_escalations_resolved ON escalations(resolved);
CREATE INDEX IF NOT EXISTS idx_escalations_level    ON escalations(level);
CREATE INDEX IF NOT EXISTS idx_escalations_batch    ON escalations(batch_id);

-- 3. WEEKLY PLANS ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS weekly_plans (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id    uuid REFERENCES students(id) ON DELETE CASCADE,
  batch_id      integer,
  week_number   integer NOT NULL,
  week_start    date NOT NULL,
  new_content   text,                               -- المقرر الجديد (جزء أو سطر)
  near_review   text,                               -- مراجعة قريبة
  far_review    text,                               -- مراجعة بعيدة
  target_juz    integer,                            -- الجزء المستهدف هذا الأسبوع
  status        text DEFAULT 'pending',             -- 'pending' | 'completed' | 'partial'
  created_at    timestamptz DEFAULT now(),
  UNIQUE(student_id, week_number)
);

-- 4. AUTOMATION LOGS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS automation_logs (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  job_name            text NOT NULL,                -- 'weekly-content' | 'escalation-check' | 'weekly-report'
  status              text NOT NULL,                -- 'success' | 'error' | 'partial'
  records_processed   integer DEFAULT 0,
  details             jsonb DEFAULT '{}',
  error_message       text,
  run_at              timestamptz DEFAULT now()
);

-- Enable RLS (تعطيل لحين إعداد سياسات الأدوار)
ALTER TABLE notifications   ENABLE ROW LEVEL SECURITY;
ALTER TABLE escalations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_plans    ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_logs ENABLE ROW LEVEL SECURITY;

-- سياسة مؤقتة: اسمح بكل شيء (تُحدَّث لاحقاً بسياسات الأدوار)
CREATE POLICY "allow_all_notifications"   ON notifications   FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_escalations"     ON escalations     FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_weekly_plans"    ON weekly_plans    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_automation_logs" ON automation_logs FOR ALL USING (true) WITH CHECK (true);
