import React, { useState, useEffect } from 'react'
import { Modal, Input, Textarea, Btn, Alert } from './ui'
import { getDayLoad, CAP_DAY, fmtDate, suggestNextDate } from '../lib/sprint'

const STATUS_OPTIONS = ['Contacted', 'Processing', 'Filed', 'Completed', 'Cancelled']

const QUICK_ACTIONS = [
  { key: 'no_answer', label: '📵 No Answer', note: 'No answer - will retry', outcome: 'no_answer' },
  { key: 'left_vm', label: '📞 Left VM', note: 'Left voicemail - will retry', outcome: 'left_vm' },
  { key: 'pending_review', label: '📋 Pending Review', note: 'Pending to review', outcome: 'pending_review' },
  { key: 'pending_call', label: '⏳ Pending to Call Today', note: 'Pending to call today', outcome: 'no_answer' },
  { key: 'contacted', label: '✅ Contacted', note: 'Successfully contacted', outcome: 'contacted' },
]

// ── Complete Modal ──
export function CompleteModal({ open, voucher, currentDate, currentStatus, dynCal, onConfirm, onClose }) {
  const [date, setDate] = useState('')
  const [status, setStatus] = useState(currentStatus || 'Contacted')
  const [note, setNote] = useState('')
  const [selectedAction, setSelectedAction] = useState(null)
  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    if (open) {
      setDate('')
      setStatus(currentStatus || 'Contacted')
      setNote('')
      setSelectedAction(null)
    }
  }, [open, currentStatus])

  const load = date ? getDayLoad(date, {}, dynCal) : 0
  const isSaturated = load >= CAP_DAY
  const isWarning = load >= 12 && load < CAP_DAY
  const isCompleted = status === 'Completed'
  const isCancelled = status === 'Cancelled'

  const applyQuickAction = (action) => {
    setSelectedAction(action)
    setNote(action.note)
    const suggested = suggestNextDate(currentDate, action.outcome, dynCal)
    setDate(suggested)
  }

  return (
    <Modal open={open} onClose={onClose} title="✓ Update Voucher" subtitle={`Current: ${fmtDate(currentDate)} · Status: ${currentStatus}`}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, padding: '4px 0', marginBottom: 14, color: 'var(--blue-t)' }}>
        {voucher}
      </div>

      {/* Quick Actions */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>⚡ Quick Actions</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {QUICK_ACTIONS.map(a => (
            <button key={a.key} onClick={() => applyQuickAction(a)}
              style={{
                padding: '4px 8px', fontSize: 10, borderRadius: 'var(--r)', border: '1px solid',
                borderColor: selectedAction?.key === a.key ? 'var(--blue)' : 'var(--border2)',
                background: selectedAction?.key === a.key ? 'var(--blue-bg)' : 'var(--bg3)',
                color: selectedAction?.key === a.key ? 'var(--blue-t)' : 'var(--text2)',
                cursor: 'pointer', fontWeight: selectedAction?.key === a.key ? 600 : 400,
              }}>
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* Status Selector */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 5 }}>Status</label>
        <select value={status} onChange={e => setStatus(e.target.value)}
          style={{
            width: '100%', padding: '8px 10px', background: 'var(--bg3)',
            border: '1px solid var(--border2)', borderRadius: 'var(--r)',
            color: 'var(--text)', fontSize: 13, outline: 'none', cursor: 'pointer',
          }}>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Auto-suggested date */}
      {!isCompleted && !isCancelled && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)' }}>Next Call Date</label>
            {selectedAction && <span style={{ fontSize: 9, color: 'var(--blue-t)', fontStyle: 'italic' }}>Auto-suggested: {fmtDate(date)}</span>}
          </div>
          <Input
            type="date"
            value={date}
            min={today}
            onChange={e => setDate(e.target.value)}
          />
        </div>
      )}

      {isCompleted && (
        <Alert variant="green" icon="✅" title="Marked as Completed">
          No next call date needed. The voucher is complete.
        </Alert>
      )}

      {isCancelled && (
        <Alert variant="red" icon="⛔" title="Marked as Cancelled">
          No next call date needed. The voucher is cancelled.
        </Alert>
      )}

      {/* Notes */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 5 }}>📝 Notes</label>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Add notes about this session..."
          style={{
            width: '100%', padding: '8px 10px', background: 'var(--bg3)',
            border: '1px solid var(--border2)', borderRadius: 'var(--r)',
            color: 'var(--text)', fontSize: 12, outline: 'none', resize: 'vertical', minHeight: 60,
            fontFamily: 'var(--font-sans)',
          }}
        />
      </div>

      {date && !isCompleted && !isCancelled && (
        <>
          {isSaturated && (
            <Alert variant="red" icon="⛔" title={`Day has ${load}/15 calls — at cap`}>
              Choose a different day to avoid overloading this date.
            </Alert>
          )}
          {isWarning && !isSaturated && (
            <Alert variant="amber" icon="⚠" title={`Day has ${load}/15 calls — approaching cap`}>
              Consider a lighter day if possible.
            </Alert>
          )}
        </>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
        <Btn variant="default" onClick={onClose}>Cancel</Btn>
        <Btn variant="success" onClick={() => onConfirm(date, status, note)} disabled={(!isCompleted && !isCancelled && !date)}>
          Confirm
        </Btn>
      </div>
    </Modal>
  )
}

// ── Note Modal ──
export function NoteModal({ open, voucher, existingNote, onSave, onDelete, onClose }) {
  const [text, setText] = useState('')

  useEffect(() => { if (open) setText(existingNote || '') }, [open, existingNote])

  return (
    <Modal open={open} onClose={onClose} title="📝 Session Notes" subtitle={voucher}>
      {/* Quick note templates */}
      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Quick templates:</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {['No answer - will retry', 'Left voicemail', 'Pending to review', 'Pending to call today', 'Customer requested callback'].map(t => (
            <button key={t} onClick={() => setText(prev => prev ? prev + '\n' + t : t)}
              style={{ padding: '3px 8px', fontSize: 9, borderRadius: 'var(--r)', border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text3)', cursor: 'pointer' }}>
              {t}
            </button>
          ))}
        </div>
      </div>
      <Textarea label="Notes" value={text} onChange={e => setText(e.target.value)} placeholder="Add notes about this session..." />
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
        {existingNote && <Btn variant="danger" onClick={() => { onDelete(); onClose() }}>Delete</Btn>}
        <Btn variant="default" onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" onClick={() => { onSave(text); onClose() }}>Save</Btn>
      </div>
    </Modal>
  )
}
