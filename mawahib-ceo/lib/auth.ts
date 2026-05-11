import { supabase } from './supabase'

export type UserRole = 'ceo' | 'batch_manager' | 'supervisor' | 'teacher' | 'records_officer'

export interface UserProfile {
  id: string
  role: UserRole
  batch_id: number | null
  name: string
  tenant_id: number | null
  is_super_admin: boolean
}

export async function getProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, batch_id, name, tenant_id, is_super_admin')
    .eq('id', userId)
    .single()
  if (error || !data) return null
  return data as UserProfile
}

export async function signOut() {
  await supabase.auth.signOut()
}
