import React, { useState, useEffect } from 'react'
import { Modal, Input, Textarea, Btn, Alert } from './ui'
import { getDayLoad, CAP_DAY, fmtDate } from '../lib/sprint'

const STATUS_OPTIONS = ['Contacted', 'Processing', 'Filed', 'Completed', 'Cancelled']

// ── Complete Modal ──
export function CompleteModal({ open, voucher, currentDate, currentStatus, dynCal, onConfirm, onClose }) {
  const [date, setDate] = useState('')
  const [status, setStatus] = useState(currentStatus || 'Contacted')
  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    if (open) {
      setDate('')
      setStatus(currentStatus || 'Contacted')
    }
  }, [open, currentStatus])

  const load = date ? getDayLoad(date, {}, dynCal) : 0
  const isSaturated = load >= CAP_DAY
  const isWarning = load >= 12 && load < CAP_DAY
  const isCompleted = status === 'Completed'
  const isCancelled = status === 'Cancelled'

  return (
    <Modal open={open} onClose={onClose} title="✓ Update Voucher" subtitle={`Current: ${fmtDate(currentDate)} · Status: ${currentStatus}`}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, padding: '4px 0', marginBottom: 14, color: 'var(--blue-t)' }}>
        {voucher}
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

      {/* Date - only show if not Completed or Cancelled */}
      {!isCompleted && !isCancelled && (
        <Input
          label="Next Call Date"
          type="date"
          value={date}
          min={today}
          onChange={e => setDate(e.target.value)}
        />
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
        <Btn variant="success" onClick={() => onConfirm(date, status)} disabled={(!isCompleted && !isCancelled && !date)}>
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
    <Modal open={open} onClose={onClose} title="📝 Session Notes"
      subtitle={voucher}>
      <Textarea
        label="Notes"
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Add notes about this session..."
      />
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
        {existingNote && (
          <Btn variant="danger" onClick={() => { onDelete(); onClose() }}>Delete</Btn>
        )}
        <Btn variant="default" onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" onClick={() => { onSave(text); onClose() }}>Save</Btn>
      </div>
    </Modal>
  )
}
