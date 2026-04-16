-- ================================================================
-- Performance indexes — 2026-04-16
-- Apply via Supabase SQL editor. Each CREATE INDEX uses IF NOT EXISTS
-- so it's safe to re-run. No data is modified.
-- ================================================================

-- Students are joined on batch_id and supervisor_id in nearly every page.
CREATE INDEX IF NOT EXISTS idx_students_batch_id ON students(batch_id);
CREATE INDEX IF NOT EXISTS idx_students_supervisor_id ON students(supervisor_id);
CREATE INDEX IF NOT EXISTS idx_students_status ON students(status);

-- Juz progress: almost every read filters by student_id
CREATE INDEX IF NOT EXISTS idx_juz_progress_student_id ON juz_progress(student_id);
-- Composite for the common (student, juz) lookup
CREATE INDEX IF NOT EXISTS idx_juz_progress_student_juz ON juz_progress(student_id, juz_number);

-- Attendance: queries filter by date + batch_id together
CREATE INDEX IF NOT EXISTS idx_attendance_date_batch ON attendance(date, batch_id);
CREATE INDEX IF NOT EXISTS idx_attendance_student_id ON attendance(student_id);

-- Exams
CREATE INDEX IF NOT EXISTS idx_exams_student_id ON exams(student_id);
CREATE INDEX IF NOT EXISTS idx_exams_batch_id ON exams(batch_id);
CREATE INDEX IF NOT EXISTS idx_exams_date ON exams(date DESC);

-- Supervisors
CREATE INDEX IF NOT EXISTS idx_supervisors_batch_id ON supervisors(batch_id);
CREATE INDEX IF NOT EXISTS idx_supervisors_user_id ON supervisors(user_id);

-- Daily followups: filtered heavily by student/supervisor/date range
CREATE INDEX IF NOT EXISTS idx_daily_followups_student_date ON daily_followups(student_id, followup_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_followups_supervisor_date ON daily_followups(supervisor_id, followup_date DESC);

-- Student text progress
CREATE INDEX IF NOT EXISTS idx_student_text_progress_student_id ON student_text_progress(student_id);
CREATE INDEX IF NOT EXISTS idx_student_text_progress_text_id ON student_text_progress(text_id);

-- Matn progress
CREATE INDEX IF NOT EXISTS idx_matn_progress_student_id ON matn_progress(student_id);

-- Notifications (sorted by created_at DESC, filtered by read / target_role)
CREATE INDEX IF NOT EXISTS idx_notifications_read_created ON notifications(read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_target_role ON notifications(target_role);

-- Followups (week_of is the filter used on read)
CREATE INDEX IF NOT EXISTS idx_followups_week_of ON followups(week_of);

-- Weekly plans
CREATE INDEX IF NOT EXISTS idx_weekly_plans_week_number ON weekly_plans(week_number);
CREATE INDEX IF NOT EXISTS idx_weekly_plans_student_week ON weekly_plans(student_id, week_number);

-- Assignment history (ordered by assigned_at DESC, filtered by batch)
CREATE INDEX IF NOT EXISTS idx_assignment_history_batch_assigned ON assignment_history(batch_id, assigned_at DESC);

-- Quran plans
CREATE INDEX IF NOT EXISTS idx_quran_plans_student_active ON quran_plans(student_id, is_active);

-- Followup escalations
CREATE INDEX IF NOT EXISTS idx_followup_escalations_batch_status ON followup_escalations(batch_id, status);

-- Recitations
CREATE INDEX IF NOT EXISTS idx_recitations_student_unit ON recitations(student_id, text_unit_id);

-- Batch schedule
CREATE INDEX IF NOT EXISTS idx_batch_schedule_batch_date ON batch_schedule(batch_id, date);
