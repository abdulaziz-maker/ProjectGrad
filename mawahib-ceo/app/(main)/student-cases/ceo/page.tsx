'use client'
/**
 * /student-cases/ceo — Executive overview of ALL cases across all batches.
 *
 * Gate: only ceo + records_officer. Records officer gets read-only view.
 */
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import CeoBoard from '@/components/student-cases/CeoBoard'
import NewCaseModal from '@/components/student-cases/NewCaseModal'
import { Plus } from 'lucide-react'

export default function CeoCasesPage() {
  const router = useRouter()
  const { profile, loading } = useAuth()
  const [showNew, setShowNew]       = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (loading || !profile) return
    if (profile.role !== 'ceo' && profile.role !== 'records_officer') {
      router.replace('/student-cases')
    }
  }, [profile, loading, router])

  if (loading) return <div className="p-6 text-center text-[var(--text-muted)]">جارٍ التحميل…</div>
  if (!profile) return null
  if (profile.role !== 'ceo' && profile.role !== 'records_officer') return null

  // records_officer = قراءة فقط — لا زر تصعيد له
  const canCreate = profile.role === 'ceo'

  return (
    <>
      {canCreate && (
        <button
          onClick={() => setShowNew(true)}
          className="fixed bottom-6 left-6 z-40 flex items-center gap-2 px-4 py-3 rounded-2xl text-white font-bold shadow-lg active:scale-95 transition-all"
          style={{ background: 'var(--accent-warm)', boxShadow: '0 8px 24px rgba(192,138,72,0.35)' }}
          aria-label="رفع تصعيد جديد">
          <Plus className="w-5 h-5" />
          <span className="text-sm">تصعيد جديد</span>
        </button>
      )}

      <CeoBoard key={refreshKey} profile={profile} readOnly={profile.role === 'records_officer'} />

      {canCreate && (
        <NewCaseModal
          open={showNew}
          onClose={() => setShowNew(false)}
          onCreated={() => setRefreshKey(k => k + 1)}
        />
      )}
    </>
  )
}
