'use client'
import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react'
import { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { UserProfile, getProfile } from '@/lib/auth'
import { clearCache } from '@/lib/cache'

interface AuthContextValue {
  session: Session | null
  profile: UserProfile | null
  loading: boolean
}

const AuthContext = createContext<AuthContextValue>({ session: null, profile: null, loading: true })

/**
 * مزوّد المصادقة — مُحسَّن لتسريع تسجيل الدخول.
 *
 * قبل: كان يستدعي `getSession()` ثم `onAuthStateChange` يطلق معاً، ويجلب
 * الملف الشخصي مرتين في التحميل الأول، ويعيد جلبه في كل `TOKEN_REFRESHED`،
 * ولا يُرفع `loading=false` حتى ينتهي جلب الملف. الشاشة كانت تقفل حتى
 * ينتهي كل ذلك.
 *
 * بعد: نعتمد على `onAuthStateChange` وحده — يطلق `INITIAL_SESSION` فوراً
 * عند التركيب، فلا حاجة لـ `getSession()` منفصل. نرفع `loading=false` بمجرد
 * معرفة الجلسة، ونجلب الملف الشخصي في الخلفية دون حجب الواجهة. ونتجاهل
 * أحداث `TOKEN_REFRESHED` لأن هوية المستخدم لم تتغير.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const lastUserIdRef = useRef<string | null>(null)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      // نعرف الآن هل المستخدم مسجّل أو لا — يمكن رفع قفل الواجهة.
      setLoading(false)

      const userId = s?.user?.id ?? null
      if (!userId) {
        setProfile(null)
        // ⚠️ CRITICAL: امسح الكاش عند تسجيل الخروج لمنع تسرّب بيانات
        // المستخدم السابق (مثلاً: CEO يرى كل الدفعات) إلى المستخدم التالي
        // (مدير دفعة) في نفس التاب.
        clearCache()
        lastUserIdRef.current = null
        return
      }

      // لا تجلب الملف الشخصي إلا إذا تغيّر المستخدم فعلاً.
      // TOKEN_REFRESHED يطلق كثيراً ولا يحتاج جلبا جديدا.
      if (userId === lastUserIdRef.current) return

      // ⚠️ CRITICAL: إذا تغيّر المستخدم (login مختلف في نفس التاب) امسح
      // الكاش السابق — بياناته كانت مخزّنة بصلاحيات المستخدم الأول.
      if (lastUserIdRef.current !== null && lastUserIdRef.current !== userId) {
        clearCache()
      }
      lastUserIdRef.current = userId

      // جلب في الخلفية — لا يحجب عرض الصفحة.
      getProfile(userId).then(p => setProfile(p)).catch(() => setProfile(null))
    })

    return () => subscription.unsubscribe()
  }, [])

  return (
    <AuthContext.Provider value={{ session, profile, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
