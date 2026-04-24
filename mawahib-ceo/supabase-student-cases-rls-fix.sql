-- ════════════════════════════════════════════════════════════════════
-- Student Cases — RLS supplement
-- ════════════════════════════════════════════════════════════════════
-- Run this AFTER supabase-student-cases-migration.sql has been applied.
--
-- Two fixes:
--   1) Supervisor couldn't INSERT cases — no INSERT policy existed.
--   2) sc_supervisor_write_stage1 had USING but no WITH CHECK, so the
--      escalation UPDATE failed because the new row had
--      current_stage = 'stage_2_batch_manager'.
--
-- Idempotent: safe to re-run.
-- ════════════════════════════════════════════════════════════════════

-- (1) Supervisor INSERT: create a case for their own student at stage 1
DROP POLICY IF EXISTS sc_supervisor_insert ON student_cases;
CREATE POLICY sc_supervisor_insert ON student_cases
  FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM students s, profiles p
            WHERE s.id = student_cases.student_id
              AND p.id = auth.uid()
              AND p.role IN ('supervisor','teacher')
              AND s.supervisor_id = p.id::text)
    AND current_stage = 'stage_1_supervisor'
  );

-- (2) Supervisor UPDATE: allow escalation stage_1 → stage_2
--    (USING matches the OLD row, WITH CHECK matches the NEW row)
DROP POLICY IF EXISTS sc_supervisor_write_stage1 ON student_cases;
CREATE POLICY sc_supervisor_write_stage1 ON student_cases
  FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM students s, profiles p
            WHERE s.id = student_cases.student_id
              AND p.id = auth.uid()
              AND p.role IN ('supervisor','teacher')
              AND s.supervisor_id = p.id::text)
    AND current_stage = 'stage_1_supervisor'
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM students s, profiles p
            WHERE s.id = student_cases.student_id
              AND p.id = auth.uid()
              AND p.role IN ('supervisor','teacher')
              AND s.supervisor_id = p.id::text)
    AND current_stage IN ('stage_1_supervisor', 'stage_2_batch_manager')
  );

-- (3) Batch manager WITH CHECK: allow demote to stage_1 and escalation to stage_3
DROP POLICY IF EXISTS sc_manager_write_stage2 ON student_cases;
CREATE POLICY sc_manager_write_stage2 ON student_cases
  FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role = 'batch_manager'
              AND p.batch_id = student_cases.batch_id)
    AND current_stage IN ('stage_1_supervisor', 'stage_2_batch_manager')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role = 'batch_manager'
              AND p.batch_id = student_cases.batch_id)
    AND current_stage IN (
      'stage_1_supervisor',
      'stage_2_batch_manager',
      'stage_3_ceo',
      'resolved',
      'closed'
    )
  );
