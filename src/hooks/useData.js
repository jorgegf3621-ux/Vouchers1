import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

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
        supabase.from('voucher_sessions').select('voucher_number,status,next_call_date,is_overdue').order('next_call_date').limit(2000),
        supabase.from('voucher_progress').select('voucher_number,completed,new_call_date,completed_at').limit(2000),
      ])
      if (sessRes.error) throw sessRes.error
      setSessions(sessRes.data || [])
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
