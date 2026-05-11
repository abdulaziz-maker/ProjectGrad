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
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import ManagerBoard from '@/components/student-cases/ManagerBoard'
import NewCaseModal from '@/components/student-cases/NewCaseModal'
import { Plus } from 'lucide-react'

export default function ManagerCasesPage() {
  const router = useRouter()
  const { profile, loading } = useAuth()
  const [showNew, setShowNew] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (loading || !profile) return
    if (profile.role !== 'batch_manager' && profile.role !== 'ceo') {
      router.replace('/student-cases')
    }
  }, [profile, loading, router])

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

  return (
    <>
      {/* زر عائم لرفع تصعيد جديد */}
      <button
        onClick={() => setShowNew(true)}
        className="fixed bottom-6 left-6 z-40 flex items-center gap-2 px-4 py-3 rounded-2xl text-white font-bold shadow-lg active:scale-95 transition-all"
        style={{ background: 'var(--accent-warm)', boxShadow: '0 8px 24px rgba(192,138,72,0.35)' }}
        aria-label="رفع تصعيد جديد">
        <Plus className="w-5 h-5" />
        <span className="text-sm">تصعيد جديد</span>
      </button>

      <ManagerBoard key={refreshKey} profile={profile} />

      <NewCaseModal
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreated={() => setRefreshKey(k => k + 1)}
      />
    </>
  )
}
