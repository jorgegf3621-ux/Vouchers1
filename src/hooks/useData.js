import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useSpecialistData(specialistName) {
  const [sessions, setSessions] = useState([])
  const [progress, setProgress] = useState({})
  const [notes, setNotes] = useState({})
  const [syncState, setSyncState] = useState({ state: 'load', message: 'Loading...' })

  const load = useCallback(async () => {
    setSyncState({ state: 'load', message: 'Loading from Supabase...' })
    try {
      const [sessRes, progRes, notesRes] = await Promise.all([
        supabase.from('voucher_sessions').select('*').eq('case_specialist', specialistName).order('next_call_date'),
        supabase.from('voucher_progress').select('*').eq('case_specialist', specialistName),
        supabase.from('voucher_notes').select('*').eq('case_specialist', specialistName),
      ])
      if (sessRes.error) throw sessRes.error
      setSessions(sessRes.data || [])
      const progMap = {}
      ;(progRes.data || []).forEach(p => { progMap[p.voucher_number] = p })
      setProgress(progMap)
      const notesMap = {}
      ;(notesRes.data || []).forEach(n => { notesMap[n.voucher_number] = n })
      setNotes(notesMap)
      setSyncState({ state: 'ok', message: `${sessRes.data?.length || 0} sessions loaded` })
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
      setSessions(prev => prev.map(s => s.voucher_number === voucherNumber ? { ...s, status: newStatus } : s))
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

export function useTLData() {
  const [sessions, setSessions] = useState([])
  const [progress, setProgress] = useState({})
  const [batches, setBatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [connected, setConnected] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [sessRes, progRes] = await Promise.all([
        supabase.from('voucher_sessions').select('voucher_number,case_specialist,status,next_call_date,is_overdue,applicant,call_day').order('next_call_date').limit(2000),
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

  const loadBatches = useCallback(async () => {
    const { data } = await supabase.from('voucher_import_batches').select('*').order('imported_at', { ascending: false }).limit(20)
    setBatches(data || [])
  }, [])

  useEffect(() => { load(); loadBatches() }, [load, loadBatches])

  return { sessions, progress, batches, loading, error, connected, reload: load, reloadBatches: loadBatches }
}
