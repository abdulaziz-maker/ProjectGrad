'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, ShieldCheck, UserPlus, Pencil, Trash2, Save, X, User, Mail, Lock, Users } from 'lucide-react'

interface UserAccount {
  id: string
  email: string
  role: string
  batch_id: number | null
  name: string
}

const ROLE_LABELS: Record<string, string> = { ceo: 'مدير تنفيذي', supervisor: 'مشرف', teacher: 'معلم' }
const ROLE_COLORS: Record<string, string> = {
  ceo: 'bg-amber-100 text-amber-800 border-amber-200',
  supervisor: 'bg-blue-100 text-blue-800 border-blue-200',
  teacher: 'bg-purple-100 text-purple-800 border-purple-200',
}

export default function AdminUsersPage() {
  const { profile, session } = useAuth()
  const router = useRouter()
  const [users, setUsers] = useState<UserAccount[]>([])
  const [loading, setLoading] = useState(true)

  // My account edit
  const [myEmail, setMyEmail] = useState('')
  const [myName, setMyName] = useState('')
  const [myNewPassword, setMyNewPassword] = useState('')
  const [savingMy, setSavingMy] = useState(false)

  // Add new user
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ email: '', password: '', name: '', role: 'supervisor' as string, batch_id: 46 as number })
  const [adding, setAdding] = useState(false)

  // Edit user
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ name: '', role: '', batch_id: null as number | null, newEmail: '', newPassword: '' })
  const [savingEdit, setSavingEdit] = useState(false)

  // Only CEO
  useEffect(() => {
    if (profile && profile.role !== 'ceo') { router.replace('/dashboard'); return }
  }, [profile, router])

  // Load
  useEffect(() => {
    loadUsers()
  }, [])

  useEffect(() => {
    if (session?.user?.email) setMyEmail(session.user.email)
    if (profile?.name) setMyName(profile.name)
  }, [session, profile])

  async function loadUsers() {
    setLoading(true)
    const { data, error } = await supabase.from('profiles').select('id, role, batch_id, name')
    if (error) { toast.error('خطأ في تحميل الحسابات'); setLoading(false); return }

    // Get emails from auth - we'll match by id
    // Since we can't access auth.users from client, store email in profiles or use what we have
    const accounts: UserAccount[] = (data || []).map(p => ({
      id: p.id,
      email: '', // will be filled if possible
      role: p.role,
      batch_id: p.batch_id,
      name: p.name,
    }))
    setUsers(accounts)
    setLoading(false)
  }

  // ── My Account ──
  async function handleSaveMy() {
    setSavingMy(true)
    try {
      // Update name in profiles
      if (myName && myName !== profile?.name && profile) {
        const { error } = await supabase.from('profiles').update({ name: myName }).eq('id', profile.id)
        if (error) { toast.error('خطأ في تحديث الاسم: ' + error.message); setSavingMy(false); return }
      }

      // Update password (only if user typed something new)
      if (myNewPassword && myNewPassword.length > 0) {
        if (myNewPassword.length < 6) { toast.error('كلمة المرور يجب أن تكون 6 أحرف على الأقل'); setSavingMy(false); return }
        const { error } = await supabase.auth.updateUser({ password: myNewPassword })
        if (error) { toast.error('خطأ في تحديث كلمة المرور: ' + error.message); setSavingMy(false); return }
      }

      // Update email (only if actually changed)
      if (myEmail && myEmail !== session?.user?.email) {
        const { error } = await supabase.auth.updateUser({ email: myEmail })
        if (error) { toast.error('خطأ في تحديث الإيميل: ' + error.message); setSavingMy(false); return }
        toast.success('تم الحفظ. تحقق من بريدك الجديد لتأكيد التغيير')
      } else {
        toast.success('تم تحديث بياناتك بنجاح')
      }

      setMyNewPassword('')
      loadUsers()
    } catch (err: any) {
      toast.error('خطأ: ' + (err?.message || 'غير معروف'))
    } finally {
      setSavingMy(false)
    }
  }

  // ── Add User ──
  async function handleAddUser() {
    if (!addForm.email || !addForm.password || !addForm.name) { toast.error('املأ جميع الحقول'); return }
    if (addForm.password.length < 6) { toast.error('كلمة المرور يجب أن تكون 6 أحرف على الأقل'); return }
    setAdding(true)

    // Sign up new user
    // We need to sign out, sign up, then sign back in as CEO
    const ceoEmail = session?.user?.email
    const { data: ceoSession } = await supabase.auth.getSession()

    // Use a temporary client to sign up (so we don't lose CEO session)
    const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
      email: addForm.email,
      password: addForm.password,
      options: { data: { name: addForm.name, role: addForm.role } }
    })

    if (signUpErr) {
      toast.error('خطأ في إنشاء الحساب: ' + signUpErr.message)
      setAdding(false)
      return
    }

    // Restore CEO session
    if (ceoSession?.session) {
      await supabase.auth.setSession({
        access_token: ceoSession.session.access_token,
        refresh_token: ceoSession.session.refresh_token,
      })
    }

    // Insert profile
    if (signUpData.user?.id) {
      const { error: profErr } = await supabase.from('profiles').upsert({
        id: signUpData.user.id,
        role: addForm.role,
        batch_id: addForm.role === 'ceo' ? null : addForm.batch_id,
        name: addForm.name,
      }, { onConflict: 'id' })

      if (profErr) toast.error('خطأ في حفظ الملف الشخصي: ' + profErr.message)
      else toast.success(`تم إنشاء حساب ${addForm.name} بنجاح`)
    }

    setAdding(false)
    setShowAdd(false)
    setAddForm({ email: '', password: '', name: '', role: 'supervisor', batch_id: 46 })
    loadUsers()
  }

  // ── Edit User ──
  async function handleEditSave(userId: string) {
    setSavingEdit(true)
    try {
      // Update profile (name, role, batch)
      const { error } = await supabase.from('profiles').update({
        name: editForm.name,
        role: editForm.role,
        batch_id: editForm.role === 'ceo' ? null : editForm.batch_id,
      }).eq('id', userId)

      if (error) { toast.error('خطأ في التحديث: ' + error.message); setSavingEdit(false); return }

      // If new email or password provided, recreate the account
      if (editForm.newEmail || editForm.newPassword) {
        const oldProfile = users.find(u => u.id === userId)

        // Delete old profile
        await supabase.from('profiles').delete().eq('id', userId)

        // Create new account with new credentials
        const newEmail = editForm.newEmail || oldProfile?.email || ''
        // SECURITY: no hardcoded fallback password. Require admin to type it.
        const newPassword = editForm.newPassword

        if (!newEmail) { toast.error('الإيميل مطلوب'); setSavingEdit(false); return }
        if (!newPassword || newPassword.length < 8) {
          toast.error('كلمة المرور مطلوبة (8 أحرف على الأقل)')
          setSavingEdit(false); return
        }

        // Save CEO session
        const { data: ceoSession } = await supabase.auth.getSession()

        const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
          email: newEmail,
          password: newPassword,
        })

        // Restore CEO session
        if (ceoSession?.session) {
          await supabase.auth.setSession({
            access_token: ceoSession.session.access_token,
            refresh_token: ceoSession.session.refresh_token,
          })
        }

        if (signUpErr) {
          toast.error('خطأ في إنشاء الحساب الجديد: ' + signUpErr.message)
          // Re-insert old profile
          if (oldProfile) {
            await supabase.from('profiles').upsert({ id: userId, role: editForm.role, batch_id: editForm.batch_id, name: editForm.name }, { onConflict: 'id' })
          }
          setSavingEdit(false)
          return
        }

        // Insert new profile
        if (signUpData.user?.id) {
          await supabase.from('profiles').upsert({
            id: signUpData.user.id,
            role: editForm.role,
            batch_id: editForm.role === 'ceo' ? null : editForm.batch_id,
            name: editForm.name,
          }, { onConflict: 'id' })
        }

        toast.success(`تم تحديث الحساب. الإيميل: ${newEmail}`)
      } else {
        toast.success('تم التحديث')
      }

      setEditId(null)
      loadUsers()
    } catch (err: any) {
      toast.error('خطأ: ' + (err?.message || 'غير معروف'))
    } finally {
      setSavingEdit(false)
    }
  }

  // ── Delete User ──
  async function handleDelete(userId: string, userName: string) {
    if (userId === profile?.id) { toast.error('لا يمكنك حذف حسابك'); return }
    if (!confirm(`هل تريد حذف حساب "${userName}"؟`)) return

    const { error } = await supabase.from('profiles').delete().eq('id', userId)
    if (error) toast.error('خطأ في الحذف: ' + error.message)
    else {
      toast.success('تم حذف الحساب من الملفات الشخصية')
      loadUsers()
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#C08A48' }} />
      </div>
    )
  }

  return (
    <div dir="rtl" className="min-h-screen p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-6 animate-fade-in-up">
        <div>
          <h1 className="text-2xl font-extrabold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <ShieldCheck className="w-6 h-6" style={{ color: '#C08A48' }} />
            إدارة الحسابات
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>إدارة حسابات المستخدمين والصلاحيات</p>
        </div>

        {/* ── My Account ── */}
        <div className="card-static overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100" style={{ background: 'rgba(192,138,72,0.06)' }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#C08A48' }}>
              <User className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <h2 className="font-bold" style={{ color: 'var(--text-primary)' }}>حسابي</h2>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>تعديل بيانات الحساب الخاص بك</p>
            </div>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                  <User className="w-3.5 h-3.5 text-gray-400" /> الاسم
                </label>
                <input type="text" value={myName} onChange={e => setMyName(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#C08A48] transition-colors" />
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                  <Mail className="w-3.5 h-3.5 text-gray-400" /> البريد الإلكتروني
                </label>
                <input type="email" value={myEmail} onChange={e => setMyEmail(e.target.value)} dir="ltr"
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#C08A48] transition-colors" />
              </div>
              <div className="md:col-span-2">
                <label className="flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                  <Lock className="w-3.5 h-3.5 text-gray-400" /> كلمة مرور جديدة <span className="text-xs text-gray-400 font-normal">(اتركه فارغ إذا ما تبي تغيّر)</span>
                </label>
                <input type="password" value={myNewPassword} onChange={e => setMyNewPassword(e.target.value)} dir="ltr"
                  placeholder="••••••••"
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#C08A48] transition-colors" />
              </div>
            </div>
            <div className="flex justify-end">
              <button onClick={handleSaveMy} disabled={savingMy}
                className="btn-primary btn-ripple flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-medium disabled:opacity-50">
                {savingMy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {savingMy ? 'جاري الحفظ...' : 'حفظ التعديلات'}
              </button>
            </div>
          </div>
        </div>

        {/* ── Users List ── */}
        <div className="card-static overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
                <Users className="w-4.5 h-4.5 text-blue-600" />
              </div>
              <div>
                <h2 className="font-bold" style={{ color: 'var(--text-primary)' }}>الحسابات المسجلة</h2>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{users.length} حساب</p>
              </div>
            </div>
            <button onClick={() => setShowAdd(!showAdd)}
              className="btn-primary btn-ripple flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-medium">
              {showAdd ? <X className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
              {showAdd ? 'إلغاء' : 'إضافة حساب'}
            </button>
          </div>

          {/* Add User Form */}
          {showAdd && (
            <div className="px-5 py-4 border-b border-gray-100" style={{ background: 'rgba(192,138,72,0.04)' }}>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>حساب جديد</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>الاسم *</label>
                  <input type="text" value={addForm.name} onChange={e => setAddForm({ ...addForm, name: e.target.value })}
                    placeholder="اسم المستخدم"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#C08A48]" />
                </div>
                <div>
                  <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>البريد الإلكتروني *</label>
                  <input type="email" value={addForm.email} onChange={e => setAddForm({ ...addForm, email: e.target.value })}
                    placeholder="email@example.com" dir="ltr"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#C08A48]" />
                </div>
                <div>
                  <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>كلمة المرور *</label>
                  <input type="text" value={addForm.password} onChange={e => setAddForm({ ...addForm, password: e.target.value })}
                    placeholder="6 أحرف على الأقل" dir="ltr"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#C08A48]" />
                </div>
                <div>
                  <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>الدور</label>
                  <select value={addForm.role} onChange={e => setAddForm({ ...addForm, role: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#C08A48]">
                    <option value="supervisor">مشرف</option>
                    <option value="teacher">معلم</option>
                  </select>
                </div>
                {addForm.role !== 'ceo' && (
                  <div>
                    <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>الدفعة</label>
                    <select value={addForm.batch_id} onChange={e => setAddForm({ ...addForm, batch_id: Number(e.target.value) })}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#C08A48]">
                      <option value={46}>دفعة 46</option>
                      <option value={48}>دفعة 48</option>
                    </select>
                  </div>
                )}
              </div>
              <div className="mt-3 flex justify-end">
                <button onClick={handleAddUser} disabled={adding || !addForm.email || !addForm.password || !addForm.name}
                  className="btn-primary btn-ripple flex items-center gap-2 px-5 py-2 rounded-xl text-white text-sm font-medium disabled:opacity-50">
                  {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                  {adding ? 'جاري الإنشاء...' : 'إنشاء الحساب'}
                </button>
              </div>
            </div>
          )}

          {/* Users */}
          <div className="divide-y divide-gray-50">
            {users.length === 0 ? (
              <div className="p-10 text-center text-gray-400">لا توجد حسابات</div>
            ) : (
              users.map(user => {
                const isMe = user.id === profile?.id
                const isEditing = editId === user.id

                if (isEditing) {
                  return (
                    <div key={user.id} className="px-5 py-4 bg-blue-50/50">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>الاسم</label>
                          <input type="text" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#C08A48]" />
                        </div>
                        <div>
                          <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>الدور</label>
                          <select value={editForm.role} onChange={e => setEditForm({ ...editForm, role: e.target.value })}
                            disabled={isMe}
                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#C08A48] disabled:opacity-50">
                            <option value="ceo">مدير تنفيذي</option>
                            <option value="supervisor">مشرف</option>
                            <option value="teacher">معلم</option>
                          </select>
                        </div>
                        {editForm.role !== 'ceo' && (
                          <div>
                            <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>الدفعة</label>
                            <select value={editForm.batch_id ?? 46} onChange={e => setEditForm({ ...editForm, batch_id: Number(e.target.value) })}
                              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#C08A48]">
                              <option value={46}>دفعة 46</option>
                              <option value={48}>دفعة 48</option>
                            </select>
                          </div>
                        )}
                        {!isMe && (
                          <>
                            <div>
                              <label className="flex items-center gap-1 text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
                                <Mail className="w-3 h-3" /> إيميل جديد <span className="text-gray-400">(اختياري)</span>
                              </label>
                              <input type="email" value={editForm.newEmail} onChange={e => setEditForm({ ...editForm, newEmail: e.target.value })}
                                placeholder="اتركه فارغ إذا ما تبي تغيّر" dir="ltr"
                                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#C08A48]" />
                            </div>
                            <div>
                              <label className="flex items-center gap-1 text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
                                <Lock className="w-3 h-3" /> باسورد جديد <span className="text-gray-400">(اختياري)</span>
                              </label>
                              <input type="text" value={editForm.newPassword} onChange={e => setEditForm({ ...editForm, newPassword: e.target.value })}
                                placeholder="اتركه فارغ إذا ما تبي تغيّر" dir="ltr"
                                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#C08A48]" />
                            </div>
                          </>
                        )}
                      </div>
                      {editForm.newEmail || editForm.newPassword ? (
                        <p className="mt-2 text-xs text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg">
                          تغيير الإيميل أو الباسورد سينشئ حساب جديد بنفس الصلاحيات
                        </p>
                      ) : null}
                      <div className="mt-3 flex gap-2 justify-end">
                        <button onClick={() => setEditId(null)}
                          className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs hover:bg-gray-50" style={{ color: 'var(--text-secondary)' }}>إلغاء</button>
                        <button onClick={() => handleEditSave(user.id)} disabled={savingEdit}
                          className="btn-primary btn-ripple flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-white text-xs font-medium disabled:opacity-50">
                          {savingEdit && <Loader2 className="w-3 h-3 animate-spin" />}
                          حفظ
                        </button>
                      </div>
                    </div>
                  )
                }

                return (
                  <div key={user.id} className="px-5 py-4 flex items-center justify-between hover:bg-gray-50/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold"
                        style={{ backgroundColor: user.role === 'ceo' ? '#b45309' : '#C08A48' }}>
                        {user.name.charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{user.name}</p>
                          {isMe && <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">أنت</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${ROLE_COLORS[user.role] ?? 'bg-gray-100 text-gray-600'}`}>
                            {ROLE_LABELS[user.role] ?? user.role}
                          </span>
                          {user.batch_id && (
                            <span className="text-xs text-gray-400">دفعة {user.batch_id}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => { setEditId(user.id); setEditForm({ name: user.name, role: user.role, batch_id: user.batch_id, newEmail: '', newPassword: '' }) }}
                        className="p-2 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        title="تعديل">
                        <Pencil className="w-4 h-4" />
                      </button>
                      {!isMe && (
                        <button onClick={() => handleDelete(user.id, user.name)}
                          className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                          title="حذف">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
