import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'

const TODAY_ISO = format(new Date(), 'yyyy-MM-dd')
const OVERDUE_STATUSES = ['Pending', 'Contacted', 'Processing']
const PAGE_SIZE = 1000

function computeIsOverdue(session) {
  if (!session.next_call_date) return false
  if (!OVERDUE_STATUSES.includes(session.status)) return false
  return session.next_call_date < TODAY_ISO
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

export function useSpecialistData(specialistName) {
  const [sessions, setSessions] = useState([])
  const [progress, setProgress] = useState({})
  const [notes, setNotes] = useState({})
  const [syncState, setSyncState] = useState({ state: 'load', message: 'Loading...' })

  const load = useCallback(async () => {
    setSyncState({ state: 'load', message: 'Loading from Supabase...' })
    try {
      const [sessRes, progRes, notesRes] = await Promise.all([
        supabase.from('voucher_sessions').select('voucher_number,case_specialist,status,next_call_date').eq('case_specialist', specialistName).order('next_call_date'),
        supabase.from('voucher_progress').select('*').eq('case_specialist', specialistName),
        supabase.from('voucher_notes').select('*').eq('case_specialist', specialistName),
      ])
      if (sessRes.error) throw sessRes.error
      // Compute is_overdue dynamically
      const computed = (sessRes.data || []).map(s => ({ ...s, is_overdue: computeIsOverdue(s) }))
      setSessions(computed)
      const progMap = {}
      ;(progRes.data || []).forEach(p => { progMap[p.voucher_number] = p })
      setProgress(progMap)
      const notesMap = {}
      ;(notesRes.data || []).forEach(n => { notesMap[n.voucher_number] = n })
      setNotes(notesMap)
      setSyncState({ state: 'ok', message: `${computed.length} sessions loaded` })
    } catch (e) {
      setSyncState({ state: 'error', message: e.message })
    }
  }, [specialistName])

  useEffect(() => { load() }, [load])

  const markComplete = useCallback(async (voucherNumber, newCallDate) => {
    setSyncState({ state: 'saving', message: 'Saving...' })
    try {
      const rec = {
        voucher_number: voucherNumber,
        case_specialist: specialistName,
        completed: true,
        completed_at: new Date().toISOString(),
        new_call_date: newCallDate,
        updated_at: new Date().toISOString(),
      }
      const { error } = await supabase.from('voucher_progress').upsert(rec, { onConflict: 'voucher_number' })
      if (error) throw error
      setProgress(prev => ({ ...prev, [voucherNumber]: rec }))
      setSyncState({ state: 'ok', message: 'Saved' })
    } catch (e) {
      setSyncState({ state: 'error', message: e.message })
    }
  }, [specialistName])

  const undoComplete = useCallback(async (voucherNumber) => {
    setSyncState({ state: 'saving', message: 'Undoing...' })
    try {
      const { error } = await supabase.from('voucher_progress')
        .update({ completed: false, completed_at: null, new_call_date: null, updated_at: new Date().toISOString() })
        .eq('voucher_number', voucherNumber)
      if (error) throw error
      setProgress(prev => ({ ...prev, [voucherNumber]: { ...prev[voucherNumber], completed: false, new_call_date: null } }))
      setSyncState({ state: 'ok', message: 'Undone' })
    } catch (e) {
      setSyncState({ state: 'error', message: e.message })
    }
  }, [])

  const updateStatus = useCallback(async (voucherNumber, newStatus) => {
    setSyncState({ state: 'saving', message: 'Saving status...' })
    try {
      const { error } = await supabase.from('voucher_sessions')
        .update({ status: newStatus }).eq('voucher_number', voucherNumber)
      if (error) throw error
      setSessions(prev => prev.map(s => s.voucher_number === voucherNumber ? { ...s, status: newStatus, is_overdue: computeIsOverdue({ ...s, status: newStatus }) } : s))
      setSyncState({ state: 'ok', message: 'Status updated' })
    } catch (e) {
      setSyncState({ state: 'error', message: e.message })
    }
  }, [])

  const saveNote = useCallback(async (voucherNumber, noteText) => {
    setSyncState({ state: 'saving', message: 'Saving note...' })
    try {
      const rec = { voucher_number: voucherNumber, case_specialist: specialistName, note: noteText, updated_at: new Date().toISOString() }
      const { error } = await supabase.from('voucher_notes').upsert(rec, { onConflict: 'voucher_number' })
      if (error) throw error
      setNotes(prev => ({ ...prev, [voucherNumber]: rec }))
      setSyncState({ state: 'ok', message: 'Note saved' })
    } catch (e) {
      setSyncState({ state: 'error', message: e.message })
    }
  }, [specialistName])

  const deleteNote = useCallback(async (voucherNumber) => {
    setSyncState({ state: 'saving', message: 'Deleting note...' })
    try {
      const { error } = await supabase.from('voucher_notes').delete().eq('voucher_number', voucherNumber)
      if (error) throw error
      setNotes(prev => { const n = { ...prev }; delete n[voucherNumber]; return n })
      setSyncState({ state: 'ok', message: 'Note deleted' })
    } catch (e) {
      setSyncState({ state: 'error', message: e.message })
    }
  }, [])

  return { sessions, progress, notes, syncState, markComplete, undoComplete, updateStatus, saveNote, deleteNote, reload: load }
}
