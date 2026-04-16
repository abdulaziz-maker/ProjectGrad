-- ============================================================
-- Recommended additional indexes surfaced by the audit
-- These are NOT yet applied to production. Review, then run
-- in Supabase SQL editor. Safe (IF NOT EXISTS + no data loss).
-- ============================================================

-- notifications — composite for role + read filter + sort
-- Covers the hot query in /api/notifications (target_role + read + created_at)
CREATE INDEX IF NOT EXISTS idx_notifications_role_read_created
  ON notifications (target_role, read, created_at DESC);

-- supervisors.user_id — used for supervisor → own-students lookups
CREATE INDEX IF NOT EXISTS idx_supervisors_user_id
  ON supervisors (user_id);

-- followups composite — supervisor + week_of is hot in checklist page
CREATE INDEX IF NOT EXISTS idx_followups_supervisor_week
  ON followups (supervisor_id, week_of);

-- automation_logs — chronological scan
CREATE INDEX IF NOT EXISTS idx_automation_logs_job_created
  ON automation_logs (job_name, created_at DESC);

-- profiles — role lookups for server-side role enforcement (recommended)
CREATE INDEX IF NOT EXISTS idx_profiles_role
  ON profiles (role);
