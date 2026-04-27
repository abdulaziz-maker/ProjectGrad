'use client'
/**
 * /manager/reports — Deprecated.
 * تمّ توحيد كل التقارير في /reports (باسم ديناميكي حسب الدور).
 * هذه الصفحة تُحوّل تلقائياً.
 */
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function DeprecatedManagerReportsPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/reports')
  }, [router])
  return null
}
