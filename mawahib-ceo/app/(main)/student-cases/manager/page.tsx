'use client'
/**
 * /student-cases/manager — Batch manager dashboard (stage 2 focus).
 *
 * Shows all active cases in the batch, with escalated ones (stage_2) pinned up top.
 * The manager can:
 *   - Escalate to CEO (stage_3)
 *   - Demote back to supervisor (stage_1)
 *   - Close the case permanently
 *   - Add actions (parent meeting, plan adjustment, etc.)
 */
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { STUDENT_CASES_ENABLED } from '@/lib/student-cases/flag'
import ManagerBoard from '@/components/student-cases/ManagerBoard'

export default function ManagerCasesPage() {
  const router = useRouter()
  const { profile, loading } = useAuth()

  useEffect(() => {
    if (!STUDENT_CASES_ENABLED) router.replace('/dashboard')
  }, [router])

  useEffect(() => {
    if (loading || !profile) return
    // Gate: only batch_manager + ceo (CEO can drill into a specific batch view)
    if (profile.role !== 'batch_manager' && profile.role !== 'ceo') {
      router.replace('/student-cases')
    }
  }, [profile, loading, router])

  if (!STUDENT_CASES_ENABLED) return null
  if (loading) return <div className="p-6 text-center text-[var(--text-muted)]">جارٍ التحميل…</div>
  if (!profile) return null
  if (profile.role !== 'batch_manager' && profile.role !== 'ceo') return null

  // CEO viewing manager dashboard without a specific batch: show hint
  if (profile.role === 'ceo' && profile.batch_id == null) {
    return (
      <div className="card-static p-6 max-w-2xl mx-auto text-center">
        <h1 className="text-lg font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
          لوحة مدير الدفعة
        </h1>
        <p className="text-sm text-[var(--text-muted)]">
          كمسؤول تنفيذي استخدم{' '}
          <a href="/student-cases/ceo" className="text-[var(--accent-warm)] underline">
            لوحة المدير التنفيذي
          </a>{' '}
          لرؤية كل الدفعات.
        </p>
      </div>
    )
  }

  return <ManagerBoard profile={profile} />
}
