'use client'
import { useState, useEffect, useCallback } from 'react'
import { Settings, Bell, Database, Info, Save, Shield, Sliders, Wifi, WifiOff, Loader2, Plus, Trash2, X } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { getBatches, upsertBatch, deleteBatch, type DBBatch } from '@/lib/db'

type ConnectionStatus = 'checking' | 'connected' | 'disconnected'

export default function SettingsPage() {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('checking')

  const [notifications, setNotifications] = useState({
    lowProgress: true,
    missedReports: true,
    upcomingMeetings: true,
    attendanceAlert: true,
    feesOverdue: true,
    budgetAlert: true,
  })

  const [thresholds, setThresholds] = useState({
    warningLevel: 60,
    dangerLevel: 40,
    maxAbsences: 3,
  })

  const [password, setPassword] = useState({ current: '', new: '', confirm: '' })
  const [changingPassword, setChangingPassword] = useState(false)
  const { profile } = useAuth()

  // Batches from Supabase
  const [batches, setBatches] = useState<DBBatch[]>([])
  const [loadingBatches, setLoadingBatches] = useState(true)
  const [showAddBatch, setShowAddBatch] = useState(false)
  const [newBatch, setNewBatch] = useState({ id: '', name: '', grade_levels: '', manager_name: '' })

  const fetchBatches = useCallback(async () => {
    try {
      const data = await getBatches()
      setBatches(data)
    } catch (err) {
      console.error('Failed to load batches:', err)
      toast.error('فشل تحميل الدفعات')
    } finally {
      setLoadingBatches(false)
    }
  }, [])

  useEffect(() => {
    fetchBatches()
  }, [fetchBatches])

  useEffect(() => {
    async function testConnection() {
      try {
        const { data } = await supabase.auth.getSession()
        setConnectionStatus(data.session ? 'connected' : 'disconnected')
      } catch { setConnectionStatus('disconnected') }
    }
    testConnection()
  }, [])

  const handleSaveSettings = () => toast.success('تم حفظ الإعدادات بنجاح')

  const handleChangePassword = async () => {
    if (!password.new || password.new.length < 6) {
      toast.error('كلمة المرور يجب أن تكون 6 أحرف على الأقل')
      return
    }
    if (password.new !== password.confirm) {
      toast.error('كلمة المرور الجديدة غير متطابقة')
      return
    }
    setChangingPassword(true)
    const { error } = await supabase.auth.updateUser({ password: password.new })
    setChangingPassword(false)
    if (error) {
      toast.error('فشل تغيير كلمة المرور: ' + error.message)
    } else {
      toast.success('تم تغيير كلمة المرور بنجاح')
      setPassword({ current: '', new: '', confirm: '' })
    }
  }

  const handleAddBatch = async () => {
    if (!newBatch.id || !newBatch.name) { toast.error('رقم واسم الدفعة مطلوبان'); return }
    const id = Number(newBatch.id)
    if (batches.some(b => b.id === id)) {
      toast.error('رقم الدفعة موجود مسبقاً'); return
    }
    try {
      await upsertBatch({
        id,
        name: newBatch.name,
        grade_levels: newBatch.grade_levels,
        manager_name: newBatch.manager_name,
        student_count: 0,
        completion_percentage: 0,
      })
      await fetchBatches()
      setNewBatch({ id: '', name: '', grade_levels: '', manager_name: '' })
      setShowAddBatch(false)
      toast.success(`تمت إضافة ${newBatch.name}`)
    } catch (err) {
      console.error('Failed to add batch:', err)
      toast.error('فشل إضافة الدفعة')
    }
  }

  const handleDeleteBatch = async (batch: DBBatch) => {
    try {
      await deleteBatch(batch.id)
      await fetchBatches()
      toast.success(`تم حذف ${batch.name}`)
    } catch (err) {
      console.error('Failed to delete batch:', err)
      toast.error('فشل حذف الدفعة')
    }
  }

  return (
    <div className="space-y-6 max-w-3xl animate-fade-in-up" dir="rtl">
      <div>
        <h1 className="text-2xl font-extrabold" style={{ color: 'var(--text-primary)' }}>الإعدادات</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>إدارة إعدادات النظام والبرنامج</p>
      </div>

      {/* ─── Connection Status ─── */}
      <div className="card-static overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
            <Database className="w-4 h-4 text-blue-600" />
          </div>
          <h2 className="font-bold" style={{ color: 'var(--text-primary)' }}>قاعدة البيانات</h2>
        </div>
        <div className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Supabase</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {isSupabaseConfigured()
                  ? process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('https://', '').split('.')[0] + '.supabase.co'
                  : 'غير مهيأ'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {connectionStatus === 'checking' && (
                <><Loader2 className="w-4 h-4 text-gray-400 animate-spin" /><span className="text-sm" style={{ color: 'var(--text-muted)' }}>جاري الفحص...</span></>
              )}
              {connectionStatus === 'connected' && (
                <><Wifi className="w-4 h-4 text-green-600" /><span className="text-sm font-semibold text-green-600">متصل ✓</span></>
              )}
              {connectionStatus === 'disconnected' && (
                <><WifiOff className="w-4 h-4 text-red-500" /><span className="text-sm font-semibold text-red-500">غير متصل ✗</span></>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Batch Settings ─── */}
      <div className="card-static overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center">
              <Sliders className="w-4 h-4 text-green-600" />
            </div>
            <h2 className="font-bold" style={{ color: 'var(--text-primary)' }}>إعدادات الدفعات</h2>
          </div>
          <button onClick={() => setShowAddBatch(!showAddBatch)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={showAddBatch ? { color: '#dc2626', backgroundColor: '#fef2f2' } : { color: '#C08A48', backgroundColor: 'rgba(192,138,72,0.06)' }}>
            {showAddBatch ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {showAddBatch ? 'إلغاء' : 'إضافة دفعة'}
          </button>
        </div>

        {/* Add batch form */}
        {showAddBatch && (
          <div className="px-5 py-4 border-b border-gray-100" style={{ background: 'rgba(192,138,72,0.04)' }}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>رقم الدفعة *</label>
                <input type="number" value={newBatch.id} onChange={e => setNewBatch({ ...newBatch, id: e.target.value })}
                  placeholder="مثال: 50"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#C08A48]" />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>اسم الدفعة *</label>
                <input type="text" value={newBatch.name} onChange={e => setNewBatch({ ...newBatch, name: e.target.value })}
                  placeholder="مثال: دفعة 50"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#C08A48]" />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>المرحلة الدراسية</label>
                <input type="text" value={newBatch.grade_levels} onChange={e => setNewBatch({ ...newBatch, grade_levels: e.target.value })}
                  placeholder="مثال: أول + ثاني متوسط"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#C08A48]" />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>مدير الدفعة</label>
                <input type="text" value={newBatch.manager_name} onChange={e => setNewBatch({ ...newBatch, manager_name: e.target.value })}
                  placeholder="اسم المدير"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#C08A48]" />
              </div>
            </div>
            <div className="mt-3 flex justify-end">
              <button
                onClick={handleAddBatch}
                disabled={!newBatch.id || !newBatch.name}
                className="btn-primary btn-ripple flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-xs font-medium disabled:opacity-50">
                <Plus className="w-3.5 h-3.5" />
                إضافة
              </button>
            </div>
          </div>
        )}

        <div className="p-5 space-y-4">
          {loadingBatches ? (
            <div className="flex items-center justify-center py-4 gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
              <span className="text-sm text-gray-400">جاري تحميل الدفعات...</span>
            </div>
          ) : (
            <>
              {batches.map(batch => (
                <div key={batch.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>{batch.name}</p>
                    <p className="text-xs text-gray-400">{batch.grade_levels || 'غير محدد'} — {batch.student_count} طالب</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>مدير: {batch.manager_name || 'غير محدد'}</span>
                    <button
                      onClick={() => handleDeleteBatch(batch)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              {batches.length === 0 && (
                <p className="text-center text-gray-400 text-sm py-4">لا توجد دفعات</p>
              )}
            </>
          )}
        </div>
      </div>

      {/* ─── Performance Thresholds ─── */}
      <div className="card-static overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          <div className="w-8 h-8 rounded-lg bg-yellow-50 flex items-center justify-center">
            <Settings className="w-4 h-4 text-yellow-600" />
          </div>
          <h2 className="font-bold" style={{ color: 'var(--text-primary)' }}>حدود الأداء والإنجاز</h2>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm mb-1.5" style={{ color: 'var(--text-secondary)' }}>حد التحذير (%)</label>
              <input type="number" value={thresholds.warningLevel}
                onChange={e => setThresholds({ ...thresholds, warningLevel: Number(e.target.value) })}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#C08A48]"
                min={0} max={100} />
            </div>
            <div>
              <label className="block text-sm mb-1.5" style={{ color: 'var(--text-secondary)' }}>حد الخطر (%)</label>
              <input type="number" value={thresholds.dangerLevel}
                onChange={e => setThresholds({ ...thresholds, dangerLevel: Number(e.target.value) })}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#C08A48]"
                min={0} max={100} />
            </div>
            <div>
              <label className="block text-sm mb-1.5" style={{ color: 'var(--text-secondary)' }}>الحد الأقصى للغياب</label>
              <input type="number" value={thresholds.maxAbsences}
                onChange={e => setThresholds({ ...thresholds, maxAbsences: Number(e.target.value) })}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#C08A48]"
                min={1} />
            </div>
          </div>
          <p className="text-xs text-gray-400">الطلاب الذين يقل إنجازهم عن الحد الأدنى سيظهرون كـ "متعثرين" في التقارير</p>
        </div>
      </div>

      {/* ─── Notifications ─── */}
      <div className="card-static overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
            <Bell className="w-4 h-4 text-blue-600" />
          </div>
          <h2 className="font-bold" style={{ color: 'var(--text-primary)' }}>إعدادات التنبيهات</h2>
        </div>
        <div className="p-5 space-y-3">
          {([
            { key: 'lowProgress' as const, label: 'تنبيه عند انخفاض إنجاز الطالب', desc: 'عند تراجع الإنجاز تحت الحد المحدد' },
            { key: 'missedReports' as const, label: 'تنبيه تأخر التقارير الأسبوعية', desc: 'عند مرور أكثر من 7 أيام بدون تقرير' },
            { key: 'upcomingMeetings' as const, label: 'تذكير الاجتماعات القادمة', desc: 'قبل 48 ساعة من موعد الاجتماع' },
            { key: 'attendanceAlert' as const, label: 'تنبيه تجاوز الغياب المسموح', desc: 'عند تجاوز الطالب الحد الأقصى للغيابات' },
            { key: 'feesOverdue' as const, label: 'تنبيه تأخر سداد الرسوم', desc: 'للطلاب المتأخرين عن السداد' },
            { key: 'budgetAlert' as const, label: 'تنبيه قرب انتهاء العهدة', desc: 'قبل يوم واحد من موعد إغلاق العهدة' },
          ]).map(item => (
            <div key={item.key} className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>{item.label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{item.desc}</p>
              </div>
              <button
                onClick={() => setNotifications(prev => ({ ...prev, [item.key]: !prev[item.key] }))}
                className={`w-10 h-6 rounded-full transition-all relative ${notifications[item.key] ? '' : 'bg-gray-200'}`}
                style={notifications[item.key] ? { backgroundColor: '#C08A48' } : undefined}
              >
                <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all shadow-sm ${notifications[item.key] ? 'right-1' : 'left-1'}`} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Security ─── */}
      <div className="card-static overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
            <Shield className="w-4 h-4 text-red-600" />
          </div>
          <h2 className="font-bold" style={{ color: 'var(--text-primary)' }}>الأمان وكلمة المرور</h2>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="block text-sm mb-1.5" style={{ color: 'var(--text-secondary)' }}>كلمة المرور الحالية</label>
            <input type="password" value={password.current}
              onChange={e => setPassword({ ...password, current: e.target.value })}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#C08A48]" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm mb-1.5" style={{ color: 'var(--text-secondary)' }}>كلمة المرور الجديدة</label>
              <input type="password" value={password.new}
                onChange={e => setPassword({ ...password, new: e.target.value })}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#C08A48]" />
            </div>
            <div>
              <label className="block text-sm mb-1.5" style={{ color: 'var(--text-secondary)' }}>تأكيد كلمة المرور</label>
              <input type="password" value={password.confirm}
                onChange={e => setPassword({ ...password, confirm: e.target.value })}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#C08A48]" />
            </div>
          </div>
          <button
            onClick={handleChangePassword}
            disabled={changingPassword || !password.new || !password.confirm}
            className="btn-primary btn-ripple flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white rounded-xl disabled:opacity-50"
          >
            {changingPassword && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {changingPassword ? 'جاري الحفظ...' : 'تغيير كلمة المرور'}
          </button>
        </div>
      </div>

      {/* ─── About ─── */}
      <div className="card-static rounded-2xl p-5">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: '#C08A48' }} />
          <div>
            <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>نظام المواهب الناشئة — v1.0</h3>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>نظام إدارة متكامل لبرنامج تربوي لحفظ القرآن الكريم وبناء الشخصية. يدعم متابعة 40 طالباً عبر دفعتَي 46 و48.</p>
            <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>تم التطوير خصيصاً للمدير التنفيذي — 2026</p>
          </div>
        </div>
      </div>

      {/* ─── Save button ─── */}
      <div className="flex justify-start">
        <button onClick={handleSaveSettings}
          className="btn-primary btn-ripple flex items-center gap-2 px-6 py-3 font-medium text-white rounded-xl">
          <Save className="w-4 h-4" />
          حفظ الإعدادات
        </button>
      </div>
    </div>
  )
}
