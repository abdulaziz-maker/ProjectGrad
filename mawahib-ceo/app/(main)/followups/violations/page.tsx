'use client'
import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { getViolations, buildSupervisorSummary, resolveViolation } from '@/lib/violations/db'
import type { WeeklyViolation } from '@/lib/violations/types'
import { getStudents, getSupervisors, type DBStudent, type DBSupervisor } from '@/lib/db'
import { formatHijri, toHijriShort } from '@/lib/hijri'
import PageHeader from '@/components/ui/PageHeader'
import {
  ShieldAlert, TrendingDown, Users, AlertTriangle, CheckCircle2, X, Filter,
  ChevronDown, ChevronUp, BarChart3, FileText, Building2,
} from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'

export default function ViolationsPage() {
  const { profile } = useAuth()
  const isCeo = profile?.role === 'ceo'
  const isManager = profile?.role === 'batch_manager'
  const canView = isCeo || isManager

  const [violations, setViolations] = useState<WeeklyViolation[]>([])
  const [supervisors, setSupervisors] = useState<DBSupervisor[]>([])
  const [students, setStudents] = useState<DBStudent[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedBatch, setSelectedBatch] = useState<number | 'all'>('all')
  const [selectedSupervisor, setSelectedSupervisor] = useState<string | 'all'>('all')
  const [expandedSup, setExpandedSup] = useState<string | null>(null)
  const [resolveOpen, setResolveOpen] = useState<WeeklyViolation | null>(null)
  const [resolveNote, setResolveNote] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const [v, sups, st] = await Promise.all([getViolations(), getSupervisors(), getStudents()])
        setViolations(v)
        setSupervisors(sups)
        setStudents(st)
      } catch (err) {
        console.error(err)
        toast.error('خطأ في تحميل البيانات')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // فلترة حسب الدفعة (للـCEO فقط)
  const filtered = useMemo(() => {
    return violations.filter(v => {
      if (v.resolved_at) return false
      if (isManager && v.batch_id !== profile?.batch_id) return false
      if (isCeo && selectedBatch !== 'all' && v.batch_id !== selectedBatch) return false
      if (selectedSupervisor !== 'all' && v.supervisor_id !== selectedSupervisor) return false
      return true
    })
  }, [violations, selectedBatch, selectedSupervisor, isCeo, isManager, profile?.batch_id])

  const summary = useMemo(() => buildSupervisorSummary(filtered), [filtered])

  // إحصائيات عامة
  const stats = useMemo(() => {
    const totalViolations = filtered.length
    const supervisorsWithViolations = new Set(filtered.map(v => v.supervisor_id)).size
    const studentsAffected = new Set(filtered.map(v => v.student_id)).size
    const weeksCovered = new Set(filtered.map(v => v.week_start)).size
    const thisMonth = filtered.filter(v => {
      const w = new Date(v.week_start)
      const now = new Date()
      return w.getFullYear() === now.getFullYear() && w.getMonth() === now.getMonth()
    }).length
    return { totalViolations, supervisorsWithViolations, studentsAffected, weeksCovered, thisMonth }
  }, [filtered])

  // قائمة الدفعات الفريدة
  const availableBatches = useMemo(() => {
    return [...new Set(violations.map(v => v.batch_id).filter(b => b != null))].sort() as number[]
  }, [violations])

  const supervisorsList = useMemo(() => {
    if (isManager) return supervisors.filter(s => s.batch_id === profile?.batch_id)
    if (selectedBatch !== 'all') return supervisors.filter(s => s.batch_id === selectedBatch)
    return supervisors
  }, [supervisors, isManager, selectedBatch, profile?.batch_id])

  async function handleResolve() {
    if (!resolveOpen?.id) return
    try {
      await resolveViolation(resolveOpen.id, resolveNote.trim() || 'تم الحلّ بدون ملاحظة')
      setViolations(prev => prev.map(v => v.id === resolveOpen.id ? { ...v, resolved_at: new Date().toISOString(), resolution_note: resolveNote } : v))
      toast.success('تم تسجيل الحلّ')
      setResolveOpen(null)
      setResolveNote('')
    } catch (err) {
      console.error(err)
      toast.error('خطأ في الحفظ')
    }
  }

  if (!canView) {
    return (
      <div className="text-center py-20">
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>غير مصرح</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>جاري تحميل التقرير...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-fade-in-up">
      <PageHeader
        eyebrow="مساءلة المتابعات الأسبوعية"
        title="تقرير إخلالات المتابعة"
        subtitle="الطلاب الذين لم تتم متابعتهم خلال أسبوع كامل (السبت → الخميس) — تُسجَّل تلقائياً صباح الجمعة"
        actions={
          <Link
            href="/followups"
            className="px-3 py-2 text-sm font-semibold rounded-xl border transition-colors"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border-soft)', color: 'var(--text-secondary)' }}
          >
            ← المتابعات
          </Link>
        }
      />

      {/* ── فلاتر ── */}
      <div className="card-static p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4" style={{ color: 'var(--accent-teal)' }} />
          <h3 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>فلاتر التقرير</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {isCeo && (
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>الدفعة</label>
              <select
                value={selectedBatch === 'all' ? 'all' : String(selectedBatch)}
                onChange={e => setSelectedBatch(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                className="w-full px-3 py-2 text-sm rounded-lg border"
                style={{ background: 'var(--bg-body)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
              >
                <option value="all">كل الدفعات</option>
                {availableBatches.map(b => <option key={b} value={b}>دفعة {b}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>المشرف</label>
            <select
              value={selectedSupervisor}
              onChange={e => setSelectedSupervisor(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border"
              style={{ background: 'var(--bg-body)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
            >
              <option value="all">كل المشرفين</option>
              {supervisorsList.map(s => (
                <option key={s.id} value={s.id}>{s.name} {s.batch_id ? `— د${s.batch_id}` : ''}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── إحصائيات تنفيذية ── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard
          icon={<ShieldAlert className="w-5 h-5" />}
          color="#B94838"
          bg="rgba(185,72,56,0.10)"
          value={stats.totalViolations}
          label="إجمالي الإخلالات"
        />
        <StatCard
          icon={<BarChart3 className="w-5 h-5" />}
          color="#C9972C"
          bg="rgba(201,151,44,0.10)"
          value={stats.thisMonth}
          label="هذا الشهر"
        />
        <StatCard
          icon={<Users className="w-5 h-5" />}
          color="#356B6E"
          bg="rgba(53,107,110,0.10)"
          value={stats.supervisorsWithViolations}
          label="مشرفون مُخلّون"
        />
        <StatCard
          icon={<TrendingDown className="w-5 h-5" />}
          color="#8B5A1E"
          bg="rgba(192,138,72,0.10)"
          value={stats.studentsAffected}
          label="طلاب متأثرون"
        />
        <StatCard
          icon={<FileText className="w-5 h-5" />}
          color="#5D4256"
          bg="rgba(93,66,86,0.10)"
          value={stats.weeksCovered}
          label="أسابيع مُسجَّلة"
        />
      </div>

      {/* ── ملخص بكل مشرف ── */}
      <div className="card-static p-4">
        <h3 className="font-bold text-sm mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <Building2 className="w-4 h-4" style={{ color: 'var(--accent-warm)' }} />
          ترتيب المشرفين حسب عدد الإخلالات
        </h3>

        {summary.length === 0 ? (
          <div className="text-center py-10" style={{ color: 'var(--text-muted)' }}>
            <CheckCircle2 className="w-12 h-12 mx-auto mb-3" style={{ color: '#5A8F67' }} />
            <p className="font-semibold text-base">لا توجد إخلالات</p>
            <p className="text-sm mt-1">جميع المشرفين أتموا متابعة طلابهم</p>
          </div>
        ) : (
          <div className="space-y-2">
            {summary.map((s, idx) => {
              const isExpanded = expandedSup === s.supervisor_id
              const supViolations = filtered.filter(v => v.supervisor_id === s.supervisor_id)
              const severity =
                s.total_violations >= 10 ? 'critical' :
                s.total_violations >= 5 ? 'high' :
                s.total_violations >= 2 ? 'medium' : 'low'

              const sevColors: Record<typeof severity, { bg: string; border: string; color: string; label: string }> = {
                critical: { bg: 'rgba(185,72,56,0.12)', border: 'rgba(185,72,56,0.40)', color: '#B94838', label: 'حرج' },
                high:     { bg: 'rgba(201,151,44,0.12)', border: 'rgba(201,151,44,0.40)', color: '#8B5A1E', label: 'عالٍ' },
                medium:   { bg: 'rgba(53,107,110,0.10)', border: 'rgba(53,107,110,0.30)', color: 'var(--accent-teal)', label: 'متوسط' },
                low:      { bg: 'rgba(90,143,103,0.10)', border: 'rgba(90,143,103,0.30)', color: '#5A8F67', label: 'منخفض' },
              }
              const sev = sevColors[severity]

              return (
                <div key={s.supervisor_id} className="rounded-xl overflow-hidden border transition-all"
                  style={{ background: sev.bg, borderColor: sev.border }}>
                  <button
                    onClick={() => setExpandedSup(isExpanded ? null : s.supervisor_id)}
                    className="w-full flex items-center gap-3 p-3 text-right hover:bg-black/[0.02] transition-colors"
                  >
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg font-bold text-sm flex-shrink-0"
                      style={{ background: 'rgba(255,255,255,0.50)', color: sev.color }}>
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0 text-right">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-bold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{s.supervisor_name}</h4>
                        {s.batch_id != null && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
                            style={{ background: 'rgba(53,107,110,0.10)', color: 'var(--accent-teal)' }}>
                            دفعة {s.batch_id}
                          </span>
                        )}
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                          style={{ background: sev.color, color: '#fff' }}>
                          {sev.label}
                        </span>
                      </div>
                      <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                        {s.unique_students_missed} طالب — {s.weeks_with_violations} أسبوع
                        {s.last_violation_date && ` — آخر إخلال: ${toHijriShort(s.last_violation_date)}`}
                      </p>
                    </div>
                    <div className="text-center flex-shrink-0">
                      <p className="font-mono font-bold text-2xl" style={{ color: sev.color }}>{s.total_violations}</p>
                      <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>إخلال</p>
                    </div>
                    {isExpanded ? <ChevronUp className="w-4 h-4 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 flex-shrink-0" />}
                  </button>

                  {isExpanded && (
                    <div className="p-3 pt-0 space-y-1.5 bg-white/40">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 mt-2">
                        {supViolations.map(v => (
                          <div key={v.id} className="flex items-center gap-2 p-2 rounded-lg bg-white border"
                            style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
                            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: sev.color }} />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                                {v.student_name}
                              </p>
                              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                {toHijriShort(v.week_start)} → {toHijriShort(v.week_end)}
                              </p>
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); setResolveOpen(v); setResolveNote('') }}
                              className="text-[10px] px-2 py-1 rounded font-semibold whitespace-nowrap"
                              style={{ background: 'rgba(90,143,103,0.10)', color: '#3F6E4B' }}
                              title="تسجيل حلّ/تجاهل"
                            >
                              تسجيل حلّ
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* مودال تسجيل الحلّ */}
      {resolveOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in-up">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>
                تسجيل حلّ للإخلال
              </h3>
              <button onClick={() => setResolveOpen(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="text-xs space-y-1" style={{ color: 'var(--text-muted)' }}>
              <p><strong>المشرف:</strong> {resolveOpen.supervisor_name}</p>
              <p><strong>الطالب:</strong> {resolveOpen.student_name}</p>
              <p><strong>الأسبوع:</strong> {toHijriShort(resolveOpen.week_start)} → {toHijriShort(resolveOpen.week_end)}</p>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>
                ملاحظة (اختيارية)
              </label>
              <textarea
                value={resolveNote}
                onChange={e => setResolveNote(e.target.value)}
                rows={3}
                placeholder="مثال: المشرف كان في إجازة معتمدة، أو تم التواصل وتمت المتابعة لاحقاً"
                className="w-full px-3 py-2 text-sm rounded-lg border"
                style={{ background: 'var(--bg-body)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
              />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => setResolveOpen(null)}
                className="px-4 py-2 text-sm rounded-lg font-semibold"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
              >
                إلغاء
              </button>
              <button
                onClick={handleResolve}
                className="btn-primary btn-ripple px-4 py-2 rounded-lg text-sm font-semibold text-white"
              >
                تسجيل الحلّ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({
  icon, color, bg, value, label,
}: { icon: React.ReactNode; color: string; bg: string; value: number; label: string }) {
  return (
    <div className="card-static p-4 text-center">
      <div className="inline-flex items-center justify-center w-9 h-9 rounded-xl mb-2"
        style={{ background: bg, color }}>
        {icon}
      </div>
      <p className="font-mono font-bold text-2xl" style={{ color: 'var(--text-primary)' }}>{value}</p>
      <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{label}</p>
    </div>
  )
}
