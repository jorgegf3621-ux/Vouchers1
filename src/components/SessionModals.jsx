import React, { useState, useEffect } from 'react'
import { Modal, Input, Textarea, Btn, Alert } from './ui'
import { getDayLoad, CAP_DAY, fmtDate } from '../lib/sprint'

// ── Complete Modal ──
export function CompleteModal({ open, voucher, currentDate, dynCal, onConfirm, onUndo, onClose }) {
  const [date, setDate] = useState('')
  const today = new Date().toISOString().split('T')[0]

  useEffect(() => { if (open) setDate('') }, [open])

  const load = date ? getDayLoad(date, {}, dynCal) : 0
  const isSaturated = load >= CAP_DAY
  const isWarning = load >= 12 && load < CAP_DAY

  return (
    <Modal open={open} onClose={onClose} title="✓ Mark as Completed" subtitle={`Set the next follow-up date · Current: ${fmtDate(currentDate)}`}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, padding: '4px 0', marginBottom: 14, color: 'var(--blue-t)' }}>
        {voucher}
      </div>

      <Input
        label="Next Call Date"
        type="date"
        value={date}
        min={today}
        onChange={e => setDate(e.target.value)}
      />

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

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
        <Btn variant="default" onClick={onClose}>Cancel</Btn>
        <Btn variant="success" onClick={() => date && onConfirm(date)} disabled={!date}>
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
