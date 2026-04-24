'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { toAr } from '@/lib/arabic-numbers'

const TODAY = '2026-04-14'
const END_DATE = '2026-05-21'
const TARGET_POSITION = 561
const DAILY_RATE = 1
const BATCH_ID = 48

export default function BulkPlanPage() {
  const { profile } = useAuth()
  const [status, setStatus] = useState<string[]>([])
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)

  async function runBulkUpdate() {
    setRunning(true)
    setStatus([])
    const log = (msg: string) => setStatus(prev => [...prev, msg])

    try {
      // 1. Get all batch 48 students
      const { data: students, error: sErr } = await supabase
        .from('students')
        .select('id, name, batch_id')
        .eq('batch_id', BATCH_ID)

      if (sErr) throw new Error('خطأ في جلب الطلاب: ' + sErr.message)
      log(`تم العثور على ${students.length} طالب في دفعة ${BATCH_ID}`)

      const studentIds = students.map(s => s.id)

      // 2. Deactivate old plans
      const { error: deactErr } = await supabase
        .from('quran_plans')
        .update({ is_active: false })
        .in('student_id', studentIds)
        .eq('is_active', true)

      if (deactErr) log('تحذير: ' + deactErr.message)
      else log('تم تعطيل الخطط القديمة')

      // 3. Create new plans
      const plans = students.map(s => ({
        student_id: s.id,
        start_date: TODAY,
        end_date: END_DATE,
        start_position: TARGET_POSITION,
        daily_rate: DAILY_RATE,
        is_active: true,
      }))

      const { error: planErr } = await supabase
        .from('quran_plans')
        .insert(plans)

      if (planErr) throw new Error('خطأ في إنشاء الخطط: ' + planErr.message)
      log(`تم إنشاء ${plans.length} خطة جديدة (المفترض اليوم = ${TARGET_POSITION})`)

      // 4. Clear today's followups
      const { error: delErr } = await supabase
        .from('daily_followups')
        .delete()
        .in('student_id', studentIds)
        .eq('followup_date', TODAY)

      if (delErr) log('تحذير في مسح المتابعات: ' + delErr.message)
      else log('تم مسح متابعات اليوم (الفعلي فارغ)')

      // Log each student
      log('---')
      students.forEach((s, i) => {
        log(`${i + 1}. ${s.name} — المفترض: وجه ${TARGET_POSITION} | الفعلي: فارغ`)
      })

      log('---')
      log('تمت العملية بنجاح!')
      setDone(true)
    } catch (err: unknown) {
      log('خطأ: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setRunning(false)
    }
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>يجب تسجيل الدخول أولاً</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
          تحديث خطط دفعة {toAr(BATCH_ID)} دفعة واحدة
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          سيتم تعيين المفترض اليوم = وجه {toAr(TARGET_POSITION)} لجميع طلاب الدفعة، مع ترك الفعلي فارغ
        </p>
      </div>

      <div className="card-static p-5 space-y-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="p-3 rounded-lg" style={{ background: 'rgba(192,138,72,0.08)' }}>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>الدفعة</p>
            <p className="font-bold font-mono" style={{ color: '#C08A48' }}>{toAr(BATCH_ID)}</p>
          </div>
          <div className="p-3 rounded-lg" style={{ background: 'rgba(111,163,146,0.08)' }}>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>المفترض اليوم</p>
            <p className="font-bold font-mono" style={{ color: '#5A8F67' }}>وجه {toAr(TARGET_POSITION)}</p>
          </div>
          <div className="p-3 rounded-lg" style={{ background: 'rgba(192,138,72,0.08)' }}>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>المعدل اليومي</p>
            <p className="font-bold font-mono" style={{ color: '#C9972C' }}>{toAr(DAILY_RATE)} وجه/يوم</p>
          </div>
          <div className="p-3 rounded-lg" style={{ background: 'rgba(185,72,56,0.08)' }}>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>الفعلي</p>
            <p className="font-bold" style={{ color: '#B94838' }}>فارغ (بدون رصد)</p>
          </div>
        </div>

        {!done && (
          <button
            onClick={runBulkUpdate}
            disabled={running}
            className="btn-primary w-full py-3 text-white font-semibold rounded-xl disabled:opacity-50"
          >
            {running ? 'جاري التنفيذ...' : 'تنفيذ التحديث'}
          </button>
        )}
      </div>

      {status.length > 0 && (
        <div className="card-static p-4 space-y-1.5 font-mono text-xs" style={{ direction: 'rtl' }}>
          {status.map((line, i) => (
            <p key={i} style={{
              color: line.startsWith('خطأ') ? '#B94838'
                : line.startsWith('تمت') || line.includes('بنجاح') ? '#5A8F67'
                : line === '---' ? 'transparent'
                : 'var(--text-secondary)',
              borderTop: line === '---' ? '1px solid var(--border-color)' : undefined,
              paddingTop: line === '---' ? '8px' : undefined,
            }}>
              {line !== '---' ? line : ''}
            </p>
          ))}
        </div>
      )}

      {done && (
        <a href="/followups" className="btn-primary block text-center py-3 text-white font-semibold rounded-xl">
          الذهاب لصفحة المتابعات ←
        </a>
      )}
    </div>
  )
}
