'use client'
import { useState, useEffect } from 'react'
import { type DBTask, getTasks, saveTasks as dbSaveTasks, upsertTask, deleteTask as dbDeleteTask, getCustomCategories, saveCustomCategories as dbSaveCustomCategories, deleteCustomCategory } from '@/lib/db'
import { CheckSquare, Square, Plus, RefreshCw, Calendar, Trash2, Users, Wallet, CreditCard, UserCheck, FolderPlus, X, Pencil, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

const today = new Date().toISOString().split('T')[0]

// الأقسام الثابتة
const FIXED_CATEGORIES = [
  { id: 'batch_managers', label: 'متابعة مدراء المراحل', icon: Users, color: 'text-blue-600 bg-blue-50' },
  { id: 'supervisors', label: 'متابعة المشرفين', icon: UserCheck, color: 'text-purple-600 bg-purple-50' },
  { id: 'budget', label: 'متابعة العهد', icon: Wallet, color: 'text-orange-600 bg-orange-50' },
  { id: 'fees', label: 'متابعة الرسوم', icon: CreditCard, color: 'text-green-600 bg-green-50' },
]

// ألوان يختار منها المستخدم للأقسام الجديدة
const COLOR_OPTIONS = [
  { label: 'أزرق', value: 'text-blue-600 bg-blue-50' },
  { label: 'أخضر', value: 'text-green-600 bg-green-50' },
  { label: 'أحمر', value: 'text-red-600 bg-red-50' },
  { label: 'بنفسجي', value: 'text-purple-600 bg-purple-50' },
  { label: 'برتقالي', value: 'text-orange-600 bg-orange-50' },
  { label: 'وردي', value: 'text-pink-600 bg-pink-50' },
  { label: 'سماوي', value: 'text-cyan-600 bg-cyan-50' },
  { label: 'رمادي', value: 'text-gray-600 bg-gray-100' },
]

const PRIORITY_CONFIG = {
  high: { label: 'عاجل', color: 'bg-red-100 text-red-700' },
  medium: { label: 'متوسط', color: 'bg-yellow-100 text-yellow-700' },
  low: { label: 'عادي', color: 'bg-gray-100 text-gray-600' },
}

const RECURRENCE_LABELS = {
  daily: 'يومية',
  weekly: 'أسبوعية',
  monthly: 'شهرية',
  once: 'مرة واحدة',
}

// Helper: convert DBTask (snake_case) to local camelCase shape
interface LocalTask {
  id: string; category: string; title: string; description?: string
  recurrence: 'daily' | 'weekly' | 'monthly' | 'once'
  dueDate?: string; completedDates: string[]; priority: 'high' | 'medium' | 'low'
}

function dbToLocal(t: DBTask): LocalTask {
  return {
    id: t.id, category: t.category, title: t.title,
    description: t.description || undefined,
    recurrence: t.recurrence as LocalTask['recurrence'],
    dueDate: t.due_date || undefined,
    completedDates: t.completed_dates ?? [],
    priority: t.priority as LocalTask['priority'],
  }
}

function localToDb(t: LocalTask): DBTask {
  return {
    id: t.id, category: t.category, title: t.title,
    description: t.description ?? '',
    recurrence: t.recurrence,
    due_date: t.dueDate ?? null,
    completed_dates: t.completedDates,
    priority: t.priority,
  }
}

function defaultTasks(): LocalTask[] {
  return [
    { id: 't1', category: 'batch_managers', title: 'متابعة عبدالله التويم — دفعة 48', description: 'مراجعة أداء الدفعة وأي تحديات', recurrence: 'weekly', completedDates: [], priority: 'high' },
    { id: 't2', category: 'batch_managers', title: 'متابعة فيصل الحربي — دفعة 46', description: 'مراجعة أداء الدفعة والإنجاز القرآني', recurrence: 'weekly', completedDates: [], priority: 'high' },
    { id: 't3', category: 'batch_managers', title: 'متابعة أسامة السحيباني — دفعة 44', recurrence: 'weekly', completedDates: [], priority: 'medium' },
    { id: 't4', category: 'batch_managers', title: 'متابعة رياض — دفعة 42', description: 'دفعة التخرج — متابعة دقيقة', recurrence: 'weekly', completedDates: [], priority: 'high' },
    { id: 't5', category: 'supervisors', title: 'مراجعة تقارير المشرفين الأسبوعية', description: 'التحقق أن جميع المشرفين رفعوا تقاريرهم', recurrence: 'weekly', completedDates: [], priority: 'high' },
    { id: 't6', category: 'supervisors', title: 'متابعة خالد السالم — لم يرفع تقريره', description: 'مرّ 12 يوم بدون تقرير', recurrence: 'once', dueDate: today, completedDates: [], priority: 'high' },
    { id: 't7', category: 'supervisors', title: 'تقييم أداء المشرفين الشهري', recurrence: 'monthly', completedDates: [], priority: 'medium' },
    { id: 't8', category: 'budget', title: 'مراجعة عهدة دفعة 46 — أبريل', description: 'التحقق من المصروفات والفواتير', recurrence: 'monthly', completedDates: [], priority: 'high' },
    { id: 't9', category: 'budget', title: 'مراجعة عهدة دفعة 48 — أبريل', recurrence: 'monthly', completedDates: [], priority: 'high' },
    { id: 't10', category: 'budget', title: 'إغلاق العهدة الشهرية', description: 'اليوم الأول من كل شهر', recurrence: 'monthly', dueDate: '2026-05-01', completedDates: [], priority: 'high' },
    { id: 't11', category: 'fees', title: 'متابعة 5 طلاب لم يسددوا الرسوم', description: 'التواصل مع أولياء الأمور', recurrence: 'weekly', completedDates: [], priority: 'high' },
    { id: 't12', category: 'fees', title: 'مراجعة تقرير الرسوم الشهري', recurrence: 'monthly', completedDates: [], priority: 'medium' },
  ]
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<LocalTask[]>([])
  const [customCats, setCustomCats] = useState<{ id: string; label: string; color: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [showAddSection, setShowAddSection] = useState(false)
  const [newTask, setNewTask] = useState({
    title: '', description: '', category: 'batch_managers',
    recurrence: 'weekly' as LocalTask['recurrence'],
    priority: 'medium' as LocalTask['priority'], dueDate: '',
  })
  const [newSection, setNewSection] = useState({ label: '', color: COLOR_OPTIONS[0].value })
  const [deletingCat, setDeletingCat] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const [dbTasks, dbCats] = await Promise.all([getTasks(), getCustomCategories()])
        if (dbTasks.length === 0) {
          // Seed default tasks
          const defaults = defaultTasks()
          const dbDefaults = defaults.map(localToDb)
          await dbSaveTasks(dbDefaults)
          setTasks(defaults)
        } else {
          setTasks(dbTasks.map(dbToLocal))
        }
        setCustomCats(dbCats)
      } catch (err) {
        console.error('Failed to load tasks:', err)
        toast.error('حدث خطأ في تحميل المهام')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // جميع الأقسام = الثابتة + المخصصة
  const allCategories = [
    ...FIXED_CATEGORIES.map(c => ({ ...c, isCustom: false })),
    ...customCats.map(c => ({ id: c.id, label: c.label, icon: CheckSquare, color: c.color, isCustom: true })),
  ]

  const isDoneToday = (task: LocalTask) => task.completedDates.includes(today)

  const toggleDone = async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId)
    if (!task) return
    const done = isDoneToday(task)
    const updatedTask: LocalTask = {
      ...task,
      completedDates: done
        ? task.completedDates.filter(d => d !== today)
        : [...task.completedDates, today]
    }
    const updated = tasks.map(t => t.id !== taskId ? t : updatedTask)
    setTasks(updated)
    try {
      await upsertTask(localToDb(updatedTask))
      if (!done) toast.success(`✅ ${task.title}`)
    } catch (err) {
      console.error('Failed to toggle task:', err)
      toast.error('حدث خطأ في تحديث المهمة')
      setTasks(tasks) // revert
    }
  }

  const handleDeleteTask = async (taskId: string) => {
    const prev = tasks
    const updated = tasks.filter(t => t.id !== taskId)
    setTasks(updated)
    try {
      await dbDeleteTask(taskId)
      toast.success('تم حذف المهمة')
    } catch (err) {
      console.error('Failed to delete task:', err)
      toast.error('حدث خطأ في حذف المهمة')
      setTasks(prev) // revert
    }
  }

  const addTask = async () => {
    if (!newTask.title.trim()) { toast.error('أدخل عنوان المهمة'); return }
    const t: LocalTask = {
      id: `task_${Date.now()}`,
      category: newTask.category,
      title: newTask.title,
      description: newTask.description || undefined,
      recurrence: newTask.recurrence,
      dueDate: newTask.dueDate || undefined,
      completedDates: [],
      priority: newTask.priority,
    }
    const updated = [...tasks, t]
    setTasks(updated)
    setNewTask({ title: '', description: '', category: newTask.category, recurrence: 'weekly', priority: 'medium', dueDate: '' })
    setShowAdd(false)
    try {
      await upsertTask(localToDb(t))
      toast.success('تمت إضافة المهمة')
    } catch (err) {
      console.error('Failed to add task:', err)
      toast.error('حدث خطأ في إضافة المهمة')
      setTasks(tasks) // revert
    }
  }

  const addSection = async () => {
    if (!newSection.label.trim()) { toast.error('أدخل اسم القسم'); return }
    const cat = {
      id: `cat_${Date.now()}`,
      label: newSection.label.trim(),
      color: newSection.color,
    }
    const updated = [...customCats, cat]
    setCustomCats(updated)
    setNewSection({ label: '', color: COLOR_OPTIONS[0].value })
    setShowAddSection(false)
    try {
      await dbSaveCustomCategories([cat])
      toast.success(`تم إنشاء قسم "${cat.label}"`)
    } catch (err) {
      console.error('Failed to add section:', err)
      toast.error('حدث خطأ في إنشاء القسم')
      setCustomCats(customCats) // revert
    }
  }

  const deleteSection = async (catId: string) => {
    const prevCats = customCats
    const prevTasks = tasks
    // احذف القسم وكل مهامه
    const updatedCats = customCats.filter(c => c.id !== catId)
    const tasksToDelete = tasks.filter(t => t.category === catId)
    const updatedTasks = tasks.filter(t => t.category !== catId)
    setCustomCats(updatedCats)
    setTasks(updatedTasks)
    setDeletingCat(null)
    try {
      await Promise.all([
        deleteCustomCategory(catId),
        ...tasksToDelete.map(t => dbDeleteTask(t.id)),
      ])
      toast.success('تم حذف القسم')
    } catch (err) {
      console.error('Failed to delete section:', err)
      toast.error('حدث خطأ في حذف القسم')
      setCustomCats(prevCats)
      setTasks(prevTasks)
    }
  }

  const totalTasks = tasks.length
  const doneTasks = tasks.filter(isDoneToday).length
  const completionPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-3xl animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold" style={{ color: 'var(--text-primary)' }}>مهامي اليومية</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>متابعة مهام المدير التنفيذي</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowAddSection(!showAddSection); setShowAdd(false) }}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-xl hover:bg-gray-50" style={{ color: 'var(--text-secondary)' }}
          >
            <FolderPlus className="w-4 h-4" />
            قسم جديد
          </button>
          <button
            onClick={() => { setShowAdd(!showAdd); setShowAddSection(false) }}
            className="btn-primary btn-ripple flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white rounded-xl"
          >
            <Plus className="w-4 h-4" />
            إضافة مهمة
          </button>
        </div>
      </div>

      {/* Overall progress */}
      <div className="card-static p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-bold" style={{ color: 'var(--text-primary)' }}>إنجاز اليوم</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{doneTasks} من {totalTasks} مهمة منجزة</p>
          </div>
          <span className={`text-2xl font-bold ${completionPct >= 80 ? 'text-green-600' : completionPct >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
            {completionPct}%
          </span>
        </div>
        <div className="progress-bar">
          <div
            className={`progress-bar-fill ${completionPct >= 80 ? 'green' : completionPct >= 50 ? 'yellow' : 'red'}`}
            style={{ width: `${completionPct}%` }}
          />
        </div>
        {completionPct === 100 && totalTasks > 0 && (
          <p className="text-green-600 text-sm font-medium mt-2 text-center">🎉 أنجزت كل مهامك اليوم!</p>
        )}
      </div>

      {/* Add section form */}
      {showAddSection && (
        <div className="card-static p-5 border-2 border-dashed border-gray-200 space-y-4">
          <h2 className="font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <FolderPlus className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
            إضافة قسم جديد
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>اسم القسم *</label>
              <input
                value={newSection.label}
                onChange={e => setNewSection({ ...newSection, label: e.target.value })}
                onKeyDown={e => e.key === 'Enter' && addSection()}
                placeholder="مثال: متابعة البرامج التربوية"
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#6366f1]"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>لون القسم</label>
              <div className="flex flex-wrap gap-2">
                {COLOR_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setNewSection({ ...newSection, color: opt.value })}
                    className={`w-7 h-7 rounded-lg border-2 transition-all ${newSection.color === opt.value ? 'border-gray-800 scale-110' : 'border-transparent'}`}
                  >
                    <span className={`flex items-center justify-center w-full h-full rounded-md text-xs font-bold ${opt.value}`}>أ</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={addSection} className="btn-primary btn-ripple px-5 py-2.5 text-sm font-medium text-white rounded-xl">
              إنشاء القسم
            </button>
            <button onClick={() => setShowAddSection(false)} className="px-5 py-2.5 text-sm border border-gray-200 rounded-xl hover:bg-gray-50" style={{ color: 'var(--text-muted)' }}>
              إلغاء
            </button>
          </div>
        </div>
      )}

      {/* Add task form */}
      {showAdd && (
        <div className="card-static p-5 space-y-4">
          <h2 className="font-bold" style={{ color: 'var(--text-primary)' }}>إضافة مهمة جديدة</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>عنوان المهمة *</label>
              <input
                value={newTask.title}
                onChange={e => setNewTask({ ...newTask, title: e.target.value })}
                onKeyDown={e => e.key === 'Enter' && addTask()}
                placeholder="ما هي المهمة؟"
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#6366f1]"
                autoFocus
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>التفاصيل</label>
              <input
                value={newTask.description}
                onChange={e => setNewTask({ ...newTask, description: e.target.value })}
                placeholder="تفاصيل إضافية (اختياري)"
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#6366f1]"
              />
            </div>
            <div>
              <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>القسم</label>
              <select
                value={newTask.category}
                onChange={e => setNewTask({ ...newTask, category: e.target.value })}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#6366f1]"
              >
                {allCategories.map(c => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>التكرار</label>
              <select value={newTask.recurrence} onChange={e => setNewTask({ ...newTask, recurrence: e.target.value as LocalTask['recurrence'] })} className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#6366f1]">
                <option value="daily">يومية</option>
                <option value="weekly">أسبوعية</option>
                <option value="monthly">شهرية</option>
                <option value="once">مرة واحدة</option>
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>الأولوية</label>
              <select value={newTask.priority} onChange={e => setNewTask({ ...newTask, priority: e.target.value as LocalTask['priority'] })} className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#6366f1]">
                <option value="high">عاجل</option>
                <option value="medium">متوسط</option>
                <option value="low">عادي</option>
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>تاريخ الاستحقاق</label>
              <input type="date" value={newTask.dueDate} onChange={e => setNewTask({ ...newTask, dueDate: e.target.value })} className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#6366f1]" />
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={addTask} className="btn-primary btn-ripple px-5 py-2.5 text-sm font-medium text-white rounded-xl">إضافة</button>
            <button onClick={() => setShowAdd(false)} className="px-5 py-2.5 text-sm border border-gray-200 rounded-xl hover:bg-gray-50" style={{ color: 'var(--text-muted)' }}>إلغاء</button>
          </div>
        </div>
      )}

      {/* Tasks by category */}
      {allCategories.map(cat => {
        const catTasks = tasks.filter(t => t.category === cat.id)
        // للأقسام الثابتة: اعرضها دائماً إذا فيها مهام
        // للأقسام المخصصة: اعرضها دائماً (حتى لو فارغة) + زر إضافة مهمة سريع
        if (!cat.isCustom && catTasks.length === 0) return null
        const catDone = catTasks.filter(isDoneToday).length
        const Icon = cat.icon

        return (
          <div key={cat.id} className="card-static overflow-hidden">
            {/* Category header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${cat.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{cat.label}</h2>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{catDone}/{catTasks.length} منجزة</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* Mini progress */}
                {catTasks.length > 0 && (
                  <div className="flex items-center gap-2">
                    <div className="w-16 bg-gray-100 rounded-full h-1.5">
                      <div
                        className="h-1.5 rounded-full bg-green-500"
                        style={{ width: `${(catDone / catTasks.length) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{Math.round((catDone / catTasks.length) * 100)}%</span>
                  </div>
                )}
                {/* Quick add task to this category */}
                <button
                  onClick={() => { setNewTask(n => ({ ...n, category: cat.id })); setShowAdd(true); setShowAddSection(false) }}
                  className="text-gray-300 p-1 transition-colors" style={{ ['--hover-color' as string]: '#6366f1' }}
                  title="إضافة مهمة لهذا القسم"
                >
                  <Plus className="w-4 h-4" />
                </button>
                {/* Delete custom category */}
                {cat.isCustom && (
                  deletingCat === cat.id ? (
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="text-red-600">حذف القسم؟</span>
                      <button onClick={() => deleteSection(cat.id)} className="text-red-600 font-medium hover:text-red-700">نعم</button>
                      <button onClick={() => setDeletingCat(null)} className="text-gray-400 hover:text-gray-600">لا</button>
                    </div>
                  ) : (
                    <button onClick={() => setDeletingCat(cat.id)} className="text-gray-200 hover:text-red-400 p-1 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Tasks */}
            {catTasks.length === 0 ? (
              <div className="px-5 py-4 text-center">
                <p className="text-sm text-gray-400">لا توجد مهام بعد</p>
                <button
                  onClick={() => { setNewTask(n => ({ ...n, category: cat.id })); setShowAdd(true); setShowAddSection(false) }}
                  className="mt-1.5 text-xs hover:underline" style={{ color: '#6366f1' }}
                >
                  + إضافة أول مهمة
                </button>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {catTasks.map(task => {
                  const done = isDoneToday(task)
                  const isOverdue = task.dueDate && task.dueDate < today && !done
                  return (
                    <div
                      key={task.id}
                      className={`flex items-start gap-3 px-5 py-4 transition-colors ${done ? 'bg-gray-50/50' : isOverdue ? 'bg-red-50/30' : ''}`}
                    >
                      <button onClick={() => toggleDone(task.id)} className="mt-0.5 flex-shrink-0">
                        {done
                          ? <CheckSquare className="w-5 h-5 text-green-500" />
                          : <Square className="w-5 h-5 text-gray-300 hover:text-gray-400" />
                        }
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${done ? 'line-through text-gray-400' : isOverdue ? 'text-red-700' : ''}`}
                          style={!done && !isOverdue ? { color: 'var(--text-primary)' } : undefined}>
                          {task.title}
                          {isOverdue && <span className="mr-2 text-xs text-red-500 font-normal">⚠ متأخرة</span>}
                        </p>
                        {task.description && (
                          <p className={`text-xs mt-0.5 ${done ? 'text-gray-300' : ''}`} style={!done ? { color: 'var(--text-muted)' } : undefined}>{task.description}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${PRIORITY_CONFIG[task.priority].color}`}>
                            {PRIORITY_CONFIG[task.priority].label}
                          </span>
                          <span className="text-[10px] text-gray-400 flex items-center gap-1">
                            <RefreshCw className="w-2.5 h-2.5" />
                            {RECURRENCE_LABELS[task.recurrence]}
                          </span>
                          {task.dueDate && (
                            <span className={`text-[10px] flex items-center gap-1 ${isOverdue ? 'text-red-500' : 'text-gray-400'}`}>
                              <Calendar className="w-2.5 h-2.5" />
                              {task.dueDate}
                            </span>
                          )}
                        </div>
                      </div>
                      <button onClick={() => handleDeleteTask(task.id)} className="text-gray-200 hover:text-red-400 flex-shrink-0 p-1">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      {/* Empty state */}
      {tasks.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <CheckSquare className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="text-sm">لا توجد مهام بعد — أضف مهمة أو قسم جديد</p>
        </div>
      )}
    </div>
  )
}
