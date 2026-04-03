import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'

const TODAY_ISO = format(new Date(), 'yyyy-MM-dd')
const OVERDUE_STATUSES = ['Pending', 'Contacted', 'Processing']
const PAGE_SIZE = 1000

function computeIsOverdue(session) {
  if (!session.next_call_date) return false
  if (!OVERDUE_STATUSES.includes(session.status)) return false
  return session.next_call_date <= TODAY_ISO
}

async function fetchAllRows(query, pageSize = PAGE_SIZE) {
  let allRows = []
  let from = 0
  while (true) {
    const to = from + pageSize - 1
    const { data, error, count } = await query.range(from, to)
    if (error) throw error
    if (!data || data.length === 0) break
    allRows.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return allRows
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
      // Fetch all sessions with pagination
      const sessRes = await fetchAllRows(
        supabase.from('voucher_sessions').select('voucher_number,case_specialist,status,next_call_date', { count: 'exact' }).order('next_call_date')
      )
      // Fetch all progress with pagination
      const progRes = await fetchAllRows(
        supabase.from('voucher_progress').select('voucher_number,completed,new_call_date,completed_at')
      )

      // Compute is_overdue dynamically based on current date and status
      const computed = sessRes.map(s => ({
        ...s,
        is_overdue: computeIsOverdue(s),
      }))
      setSessions(computed)
      const pm = {}; progRes.forEach(p => { pm[p.voucher_number] = p }); setProgress(pm)
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
