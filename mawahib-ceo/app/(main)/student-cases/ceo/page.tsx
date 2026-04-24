'use client'
/**
 * /student-cases/ceo — Executive overview of ALL cases across all batches.
 *
 * Gate: only ceo + records_officer. Records officer gets read-only view.
 */
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { STUDENT_CASES_ENABLED } from '@/lib/student-cases/flag'
import CeoBoard from '@/components/student-cases/CeoBoard'

export default function CeoCasesPage() {
  const router = useRouter()
  const { profile, loading } = useAuth()

  useEffect(() => {
    if (!STUDENT_CASES_ENABLED) router.replace('/dashboard')
  }, [router])

  useEffect(() => {
    if (loading || !profile) return
    if (profile.role !== 'ceo' && profile.role !== 'records_officer') {
      router.replace('/student-cases')
    }
  }, [profile, loading, router])

  if (!STUDENT_CASES_ENABLED) return null
  if (loading) return <div className="p-6 text-center text-[var(--text-muted)]">جارٍ التحميل…</div>
  if (!profile) return null
  if (profile.role !== 'ceo' && profile.role !== 'records_officer') return null

  return <CeoBoard profile={profile} readOnly={profile.role === 'records_officer'} />
}
