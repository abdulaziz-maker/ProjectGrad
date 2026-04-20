'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  DndContext, DragOverlay, closestCenter, pointerWithin,
  type DragStartEvent, type DragEndEvent, type DragOverEvent,
  useSensor, useSensors, PointerSensor, TouchSensor,
} from '@dnd-kit/core'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { useAuth } from '@/contexts/AuthContext'
import {
  getStudents, getSupervisors, assignStudentToSupervisor, unassignStudent, getAssignmentHistory,
  type DBStudent, type DBSupervisor, type DBAssignmentHistory,
} from '@/lib/db'
import { toast } from 'sonner'
import { Users, UserCheck, GripVertical, History, AlertCircle, CheckCircle2, ArrowLeftRight } from 'lucide-react'
import { useRouter } from 'next/navigation'

// ── Draggable Student Card ─────────────────────────────────────────
function DraggableStudent({ student, isOverlay }: { student: DBStudent; isOverlay?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `student-${student.id}`,
    data: { student },
  })

  if (isOverlay) {
    return (
      <div
        className="flex items-center gap-2 px-3 py-2.5 rounded-xl shadow-xl border"
        style={{
          background: 'var(--bg-card)',
          borderColor: '#C08A48',
          boxShadow: '0 8px 32px rgba(99,102,241,0.25)',
          width: 220,
        }}
      >
        <GripVertical size={14} style={{ color: '#C08A48' }} />
        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{student.name}</span>
      </div>
    )
  }

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-grab active:cursor-grabbing transition-shadow hover:shadow-md group"
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        opacity: isDragging ? 0.3 : 1,
        touchAction: 'none',
        background: 'var(--bg-elevated, rgba(255,255,255,0.03))',
        border: '1px solid var(--border-subtle, rgba(255,255,255,0.06))',
      }}
    >
      <GripVertical size={14} className="flex-shrink-0 opacity-40 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--text-muted)' }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{student.name}</p>
        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{student.completion_percentage}% حفظ</p>
      </div>
    </div>
  )
}

// ── Droppable Column ───────────────────────────────────────────────
function DroppableColumn({
  id, title, subtitle, students, color, icon: Icon, isOver,
}: {
  id: string; title: string; subtitle: string
  students: DBStudent[]; color: string
  icon: React.ElementType; isOver: boolean
}) {
  const { setNodeRef } = useDroppable({ id })

  return (
    <div
      ref={setNodeRef}
      className="card-static flex flex-col min-h-[300px] transition-all"
      style={{
        border: isOver ? `2px solid ${color}` : '1px solid var(--border-color)',
        background: isOver ? `${color}08` : 'var(--bg-card)',
        boxShadow: isOver ? `0 0 20px ${color}15` : undefined,
      }}
    >
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border-color)' }}>
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: `${color}15` }}
        >
          <Icon size={17} style={{ color }} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{title}</h3>
          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{subtitle}</p>
        </div>
        <span
          className="text-xs font-bold rounded-full px-2.5 py-1"
          style={{ background: `${color}15`, color }}
        >
          {students.length}
        </span>
      </div>

      {/* Students */}
      <div className="flex-1 p-3 space-y-2 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 340px)' }}>
        {students.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-10 h-10 rounded-full flex items-center justify-center mb-2" style={{ background: 'var(--bg-elevated)' }}>
              <Users size={16} style={{ color: 'var(--text-muted)' }} />
            </div>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>اسحب طالباً هنا</p>
          </div>
        )}
        {students.sort((a, b) => a.name.localeCompare(b.name, 'ar')).map(s => (
          <DraggableStudent key={s.id} student={s} />
        ))}
      </div>
    </div>
  )
}

// ── Confirm Dialog ─────────────────────────────────────────────────
function ConfirmDialog({
  open, studentName, fromName, toName, onConfirm, onCancel,
}: {
  open: boolean; studentName: string; fromName: string; toName: string
  onConfirm: () => void; onCancel: () => void
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
      <div className="card-static p-6 max-w-sm w-full mx-4 space-y-4" dir="rtl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(245,158,11,0.12)' }}>
            <ArrowLeftRight size={18} style={{ color: '#C9972C' }} />
          </div>
          <h3 className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>تأكيد النقل</h3>
        </div>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          هل تريد نقل <strong>{studentName}</strong> من <strong>{fromName}</strong> إلى <strong>{toName}</strong>؟
        </p>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} className="px-4 py-2 text-sm rounded-xl" style={{ color: 'var(--text-secondary)', background: 'var(--bg-elevated)' }}>
            إلغاء
          </button>
          <button onClick={onConfirm} className="btn-primary px-4 py-2 text-sm text-white rounded-xl font-medium">
            نعم، نقل
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────
export default function AssignmentsPage() {
  const { profile, loading: authLoading } = useAuth()
  const router = useRouter()

  const [students, setStudents] = useState<DBStudent[]>([])
  const [supervisors, setSupervisors] = useState<DBSupervisor[]>([])
  const [history, setHistory] = useState<DBAssignmentHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [activeDrag, setActiveDrag] = useState<DBStudent | null>(null)
  const [overTarget, setOverTarget] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [selectedBatch, setSelectedBatch] = useState<number | null>(null)

  // Confirm dialog state
  const [confirm, setConfirm] = useState<{
    student: DBStudent; fromName: string; toId: string; toName: string
  } | null>(null)

  const isCeo = profile?.role === 'ceo'
  const isBatchManager = profile?.role === 'batch_manager'

  // Auth guard
  useEffect(() => {
    if (!authLoading && !isCeo && !isBatchManager) {
      router.replace('/dashboard')
    }
  }, [authLoading, isCeo, isBatchManager, router])

  // Set default batch
  useEffect(() => {
    if (!authLoading && profile) {
      if (isBatchManager && profile.batch_id) {
        setSelectedBatch(profile.batch_id)
      } else if (isCeo) {
        setSelectedBatch(46) // Default for CEO
      }
    }
  }, [authLoading, profile, isCeo, isBatchManager])

  // Load data
  useEffect(() => {
    if (!selectedBatch) return
    setLoading(true)
    Promise.all([getStudents(), getSupervisors(), getAssignmentHistory(selectedBatch)])
      .then(([s, sup, h]) => {
        setStudents(s)
        setSupervisors(sup)
        setHistory(h)
      })
      .catch(() => toast.error('خطأ في تحميل البيانات'))
      .finally(() => setLoading(false))
  }, [selectedBatch])

  // Filter by batch
  const batchStudents = useMemo(
    () => students.filter(s => s.batch_id === selectedBatch).sort((a, b) => a.name.localeCompare(b.name, 'ar')),
    [students, selectedBatch]
  )
  const batchSupervisors = useMemo(
    () => supervisors.filter(s => s.batch_id === selectedBatch).sort((a, b) => a.name.localeCompare(b.name, 'ar')),
    [supervisors, selectedBatch]
  )

  // Group students by supervisor
  const unassignedStudents = useMemo(
    () => batchStudents.filter(s => !s.supervisor_id || s.supervisor_id === ''),
    [batchStudents]
  )
  const studentsBySupervisor = useMemo(() => {
    const map = new Map<string, DBStudent[]>()
    batchSupervisors.forEach(sup => map.set(sup.id, []))
    batchStudents.forEach(s => {
      if (s.supervisor_id && map.has(s.supervisor_id)) {
        map.get(s.supervisor_id)!.push(s)
      }
    })
    return map
  }, [batchStudents, batchSupervisors])

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  )

  // DnD handlers
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const student = event.active.data.current?.student as DBStudent | undefined
    if (student) setActiveDrag(student)
  }, [])

  const handleDragOver = useCallback((event: DragOverEvent) => {
    setOverTarget(event.over?.id?.toString() ?? null)
  }, [])

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    setActiveDrag(null)
    setOverTarget(null)

    const student = event.active.data.current?.student as DBStudent | undefined
    const targetId = event.over?.id?.toString()
    if (!student || !targetId || !profile) return

    // Determine target supervisor
    let toSupervisorId = ''
    let toSupervisorName = ''

    if (targetId === 'unassigned') {
      // Moving to unassigned
      if (!student.supervisor_id || student.supervisor_id === '') return // already unassigned
      toSupervisorId = ''
      toSupervisorName = ''
    } else if (targetId.startsWith('supervisor-')) {
      const supId = targetId.replace('supervisor-', '')
      if (supId === student.supervisor_id) return // same supervisor
      const sup = batchSupervisors.find(s => s.id === supId)
      if (!sup) return
      toSupervisorId = sup.id
      toSupervisorName = sup.name
    } else {
      return
    }

    // If student already has a supervisor (not unassigned), show confirm
    if (student.supervisor_id && student.supervisor_id !== '') {
      const fromName = student.supervisor_name || 'غير معروف'
      const toName = toSupervisorName || 'غير معيّن'
      setConfirm({ student, fromName, toId: toSupervisorId, toName })
      return
    }

    // Direct assignment (was unassigned)
    await executeAssignment(student, toSupervisorId, toSupervisorName)
  }, [profile, batchSupervisors])

  const executeAssignment = useCallback(async (
    student: DBStudent,
    toSupervisorId: string,
    toSupervisorName: string,
  ) => {
    if (!profile) return

    // Optimistic update
    setStudents(prev => prev.map(s =>
      s.id === student.id
        ? { ...s, supervisor_id: toSupervisorId, supervisor_name: toSupervisorName }
        : s
    ))

    try {
      if (toSupervisorId === '') {
        await unassignStudent(
          student.id, student.name,
          student.supervisor_id, student.supervisor_name,
          student.batch_id, profile.id,
        )
        toast.success(`تم إلغاء تعيين ${student.name}`)
      } else {
        await assignStudentToSupervisor(
          student.id, student.name,
          student.supervisor_id || null, student.supervisor_name || null,
          toSupervisorId, toSupervisorName,
          student.batch_id, profile.id,
        )
        toast.success(`تم تعيين ${student.name} للمشرف ${toSupervisorName}`)
      }

      // Refresh history
      if (selectedBatch) {
        getAssignmentHistory(selectedBatch).then(setHistory).catch(() => {})
      }
    } catch {
      // Revert optimistic update
      setStudents(prev => prev.map(s =>
        s.id === student.id
          ? { ...s, supervisor_id: student.supervisor_id, supervisor_name: student.supervisor_name }
          : s
      ))
      toast.error('خطأ في حفظ التغيير')
    }
  }, [profile, selectedBatch])

  const handleConfirm = useCallback(() => {
    if (!confirm) return
    executeAssignment(confirm.student, confirm.toId, confirm.toName)
    setConfirm(null)
  }, [confirm, executeAssignment])

  // Available batches
  const batches = [
    { id: 46, label: 'دفعة 46' },
    { id: 48, label: 'دفعة 48' },
  ]

  // Stats
  const totalStudents = batchStudents.length
  const assignedCount = totalStudents - unassignedStudents.length
  const totalSupervisors = batchSupervisors.length

  if (authLoading || (!isCeo && !isBatchManager)) return null

  // Supervisor colors
  const COLORS = ['#C08A48', '#5A8F67', '#C9972C', '#356B6E', '#ec4899', '#8b5cf6', '#B94838', '#14b8a6']

  return (
    <div className="space-y-5 animate-fade-in-up" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold" style={{ color: 'var(--text-primary)' }}>
            توزيع المشرفين
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            توزيع الطلاب على المشرفين — اسحب اسم الطالب من عمود لآخر لتعيينه
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Batch selector (CEO only) */}
          {isCeo && (
            <select
              value={selectedBatch ?? ''}
              onChange={e => setSelectedBatch(Number(e.target.value))}
              className="rounded-xl px-3 py-2 text-sm font-medium border"
              style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
            >
              {batches.map(b => (
                <option key={b.id} value={b.id}>{b.label}</option>
              ))}
            </select>
          )}
          <button
            onClick={() => setShowHistory(v => !v)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
            style={{
              background: showHistory ? 'rgba(99,102,241,0.1)' : 'var(--bg-elevated)',
              color: showHistory ? '#C08A48' : 'var(--text-secondary)',
              border: '1px solid var(--border-color)',
            }}
          >
            <History size={15} />
            سجل التغييرات
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card-static px-4 py-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(99,102,241,0.1)' }}>
            <Users size={17} style={{ color: '#C08A48' }} />
          </div>
          <div>
            <p className="text-lg font-bold font-mono" style={{ color: 'var(--text-primary)' }}>{totalStudents}</p>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>إجمالي الطلاب</p>
          </div>
        </div>
        <div className="card-static px-4 py-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: unassignedStudents.length > 0 ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)' }}>
            {unassignedStudents.length > 0
              ? <AlertCircle size={17} style={{ color: '#B94838' }} />
              : <CheckCircle2 size={17} style={{ color: '#5A8F67' }} />}
          </div>
          <div>
            <p className="text-lg font-bold font-mono" style={{ color: unassignedStudents.length > 0 ? '#B94838' : 'var(--text-primary)' }}>
              {unassignedStudents.length}
            </p>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>غير موزعين</p>
          </div>
        </div>
        <div className="card-static px-4 py-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(6,182,212,0.1)' }}>
            <UserCheck size={17} style={{ color: '#356B6E' }} />
          </div>
          <div>
            <p className="text-lg font-bold font-mono" style={{ color: 'var(--text-primary)' }}>{totalSupervisors}</p>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>مشرفين</p>
          </div>
        </div>
      </div>

      {/* Loading */}
      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="card-static p-4 space-y-3 min-h-[300px] animate-pulse">
                <div className="h-12 rounded-xl" style={{ background: 'var(--bg-elevated)' }} />
                <div className="h-10 rounded-xl" style={{ background: 'var(--bg-elevated)' }} />
                <div className="h-10 rounded-xl" style={{ background: 'var(--bg-elevated)' }} />
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* DnD Context */
        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {/* Unassigned pool */}
            <DroppableColumn
              id="unassigned"
              title="طلاب غير مُعيّنين"
              subtitle={`${unassignedStudents.length} طالب`}
              students={unassignedStudents}
              color="#B94838"
              icon={AlertCircle}
              isOver={overTarget === 'unassigned'}
            />

            {/* Supervisor columns */}
            {batchSupervisors.map((sup, i) => (
              <DroppableColumn
                key={sup.id}
                id={`supervisor-${sup.id}`}
                title={sup.name}
                subtitle={`${(studentsBySupervisor.get(sup.id) ?? []).length} طالب`}
                students={studentsBySupervisor.get(sup.id) ?? []}
                color={COLORS[i % COLORS.length]}
                icon={UserCheck}
                isOver={overTarget === `supervisor-${sup.id}`}
              />
            ))}
          </div>

          {/* Drag Overlay */}
          <DragOverlay>
            {activeDrag ? <DraggableStudent student={activeDrag} isOverlay /> : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={!!confirm}
        studentName={confirm?.student.name ?? ''}
        fromName={confirm?.fromName ?? ''}
        toName={confirm?.toName ?? ''}
        onConfirm={handleConfirm}
        onCancel={() => setConfirm(null)}
      />

      {/* History Panel */}
      {showHistory && (
        <div className="card-static overflow-hidden">
          <div className="px-5 py-4 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border-color)' }}>
            <History size={16} style={{ color: '#C08A48' }} />
            <h2 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>سجل التغييرات</h2>
            <span className="text-xs rounded-full px-2 py-0.5" style={{ background: 'rgba(99,102,241,0.1)', color: '#C08A48' }}>
              {history.length}
            </span>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
            {history.length === 0 && (
              <div className="py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>لا توجد تغييرات بعد</div>
            )}
            {history.slice(0, 20).map(h => (
              <div key={h.id} className="px-5 py-3 flex items-center gap-3">
                <ArrowLeftRight size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                    <strong>{h.student_name}</strong>
                    {h.from_supervisor_name && (
                      <span style={{ color: 'var(--text-muted)' }}> من {h.from_supervisor_name}</span>
                    )}
                    <span style={{ color: '#C08A48' }}> → {h.to_supervisor_name || 'غير معيّن'}</span>
                  </p>
                </div>
                <span className="text-[11px] flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                  {new Date(h.assigned_at).toLocaleDateString('ar-SA-u-nu-latn', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
