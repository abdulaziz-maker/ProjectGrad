-- ============================================================
-- Migration: إضافة دور مدير الدفعة (batch_manager)
-- التاريخ: ٢٠٢٦-٠٤-١٢
-- ============================================================

-- ١. تحديث constraint الأدوار في جدول profiles
ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('ceo', 'batch_manager', 'supervisor', 'teacher'));

-- ٢. إنشاء جدول matn_progress (كان مفقوداً من المايجريشن الأصلي)
CREATE TABLE IF NOT EXISTS matn_progress (
  student_id TEXT PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
  lines_memorized INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE matn_progress ENABLE ROW LEVEL SECURITY;

-- CEO + batch_manager: قراءة وكتابة الكل
CREATE POLICY "matn_ceo_full" ON matn_progress
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('ceo', 'batch_manager'))
  );

-- المشرف: قراءة وكتابة طلاب دفعته فقط
CREATE POLICY "matn_supervisor_own_batch" ON matn_progress
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN students s ON s.batch_id::text = p.batch_id::text
      WHERE p.id = auth.uid()
        AND p.role IN ('supervisor', 'teacher')
        AND s.id = matn_progress.student_id
    )
  );

-- ٣. تحديث RLS لجداول الأتمتة (إزالة allow_all المؤقتة)

-- === notifications ===
DROP POLICY IF EXISTS "allow_all_notifications" ON notifications;

-- CEO يرى كل الإشعارات
CREATE POLICY "notifications_ceo_full" ON notifications
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'ceo')
  );

-- مدير الدفعة يرى إشعارات دور batch_manager أو إشعاراته الشخصية
CREATE POLICY "notifications_manager" ON notifications
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'batch_manager')
    AND (target_role IN ('batch_manager', 'all') OR target_user_id = auth.uid()::text)
  );

-- المشرف يرى إشعاراته فقط
CREATE POLICY "notifications_supervisor" ON notifications
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('supervisor', 'teacher'))
    AND (target_role IN ('supervisor', 'all') OR target_user_id = auth.uid()::text)
  );

-- === escalations ===
DROP POLICY IF EXISTS "allow_all_escalations" ON escalations;

CREATE POLICY "escalations_ceo_full" ON escalations
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('ceo', 'batch_manager'))
  );

CREATE POLICY "escalations_supervisor_read" ON escalations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN students s ON s.batch_id::text = p.batch_id::text
      WHERE p.id = auth.uid()
        AND p.role IN ('supervisor', 'teacher')
        AND s.id = escalations.student_id
    )
  );

-- === weekly_plans ===
DROP POLICY IF EXISTS "allow_all_weekly_plans" ON weekly_plans;

CREATE POLICY "weekly_plans_ceo_full" ON weekly_plans
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('ceo', 'batch_manager'))
  );

CREATE POLICY "weekly_plans_supervisor" ON weekly_plans
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN students s ON s.batch_id::text = p.batch_id::text
      WHERE p.id = auth.uid()
        AND p.role IN ('supervisor', 'teacher')
        AND s.id = weekly_plans.student_id
    )
  );

-- === automation_logs ===
DROP POLICY IF EXISTS "allow_all_automation_logs" ON automation_logs;

CREATE POLICY "automation_logs_ceo_only" ON automation_logs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('ceo', 'batch_manager'))
  );

-- ٤. تحديث RLS للجداول الأساسية لتشمل batch_manager

-- batch_manager يرى كل الطلاب في دفعته (كالمشرف لكن بصلاحيات أوسع)
-- ملاحظة: إذا كانت السياسات الحالية تعطي supervisor وصولاً للدفعة،
-- فإن batch_manager يحصل على نفس الوصول + صلاحية الكتابة

-- السماح لمدير الدفعة بإدارة الطلاب في دفعته
CREATE POLICY "students_manager_full" ON students
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'batch_manager'
        AND profiles.batch_id::text = students.batch_id::text
    )
  );

-- السماح لمدير الدفعة بإدارة المشرفين في دفعته
CREATE POLICY "supervisors_manager_full" ON supervisors
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'batch_manager'
        AND profiles.batch_id::text = supervisors.batch_id::text
    )
  );

-- السماح لمدير الدفعة بإدارة الحضور في دفعته
CREATE POLICY "attendance_manager_full" ON attendance
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'batch_manager'
        AND profiles.batch_id::text = attendance.batch_id::text
    )
  );

-- السماح لمدير الدفعة بإدارة تقدم الحفظ في دفعته
CREATE POLICY "juz_progress_manager_full" ON juz_progress
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN students s ON s.id = juz_progress.student_id
      WHERE p.id = auth.uid()
        AND p.role = 'batch_manager'
        AND p.batch_id::text = s.batch_id::text
    )
  );

-- ============================================================
-- بعد تشغيل هذا الملف، أنشئ حسابات مدراء الدفعات:
--
-- INSERT INTO profiles (id, role, name, batch_id) VALUES
--   ('uuid-التويم',  'batch_manager', 'التويم', 48),
--   ('uuid-فيصل',   'batch_manager', 'فيصل',  46),
--   ('uuid-أسامة',  'batch_manager', 'أسامة', 44),
--   ('uuid-رياض',   'batch_manager', 'رياض',  42);
-- ============================================================
