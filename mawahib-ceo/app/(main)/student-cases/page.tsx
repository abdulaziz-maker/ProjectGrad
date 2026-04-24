'use client'
/**
 * /student-cases — Weekly review board + case workflow entry point.
 *
 * Role-branched:
 *   - supervisor / teacher: weekly review board for their own students
 *   - batch_manager:        redirect to /student-cases/manager
 *   - ceo / records_officer: redirect to /student-cases/ceo
 *
 * Gated behind NEXT_PUBLIC_STUDENT_CASES_ENABLED.
 */
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { STUDENT_CASES_ENABLED } from '@/lib/student-cases/flag'
import SupervisorBoard from '@/components/student-cases/SupervisorBoard'

export default function StudentCasesPage() {
  const router = useRouter()
  const { profile, loading } = useAuth()

  // Feature flag
  useEffect(() => {
    if (!STUDENT_CASES_ENABLED) router.replace('/dashboard')
  }, [router])

  // Role-based redirect
  useEffect(() => {
    if (loading || !profile) return
    if (profile.role === 'batch_manager') {
      router.replace('/student-cases/manager')
    } else if (profile.role === 'ceo' || profile.role === 'records_officer') {
      router.replace('/student-cases/ceo')
    }
  }, [profile, loading, router])

  if (!STUDENT_CASES_ENABLED) return null
  if (loading) return <div className="p-6 text-center text-[var(--text-muted)]">جارٍ التحميل…</div>
  if (!profile) return null

  // Supervisor / teacher view
  if (profile.role === 'supervisor' || profile.role === 'teacher') {
    return <SupervisorBoard profile={profile} />
  }

  // Role-mismatched: will redirect — show a brief placeholder
  return <div className="p-6 text-center text-[var(--text-muted)]">جارٍ إعادة التوجيه…</div>
}
