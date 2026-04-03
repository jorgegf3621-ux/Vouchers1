import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'

const TODAY_ISO = format(new Date(), 'yyyy-MM-dd')
const OVERDUE_STATUSES = ['Pending', 'Contacted', 'Processing']

function computeIsOverdue(session) {
  if (!session.next_call_date) return false
  if (!OVERDUE_STATUSES.includes(session.status)) return false
  return session.next_call_date <= TODAY_ISO
}

export function useTLData() {
  const [sessions, setSessions] = useState([])
  const [progress, setProgress] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [connected, setConnected] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [sessRes, progRes] = await Promise.all([
        supabase.from('voucher_sessions').select('voucher_number,case_specialist,status,next_call_date').order('next_call_date'),
        supabase.from('voucher_progress').select('voucher_number,completed,new_call_date,completed_at'),
      ])
      if (sessRes.error) throw sessRes.error
      // Compute is_overdue dynamically based on current date and status
      const computed = (sessRes.data || []).map(s => ({
        ...s,
        is_overdue: computeIsOverdue(s),
      }))
      setSessions(computed)
      const pm = {}; (progRes.data || []).forEach(p => { pm[p.voucher_number] = p }); setProgress(pm)
      setConnected(true)
      setError(null)
    } catch (e) {
      setError(e.message)
      setConnected(false)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return { sessions, progress, loading, error, connected, reload: load }
}
