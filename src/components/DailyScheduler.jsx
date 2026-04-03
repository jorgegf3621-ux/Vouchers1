import React, { useState, useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { Card, StatusBadge } from './ui'
import { VoucherLink } from './SessionsTable'
import { fmtDate } from '../lib/sprint'

const HOURS = Array.from({ length: 10 }, (_, i) => i + 9) // 9am to 6pm
const HALF_HOUR_COLORS = {
  call: { bg: 'rgba(79,142,247,.15)', border: 'var(--blue-t)', text: 'var(--blue-t)' },
  break: { bg: 'rgba(61,214,140,.15)', border: 'var(--green-t)', text: 'var(--green-t)' },
  lunch: { bg: 'rgba(245,166,35,.15)', border: 'var(--amber-t)', text: 'var(--amber-t)' },
  meeting: { bg: 'rgba(155,89,247,.15)', border: '#a78bfa', text: '#a78bfa' },
}

export default function DailyScheduler({ sessions, progress, onComplete }) {
  const [schedule, setSchedule] = useState({}) // { '09:00': { type, label, voucher? } }
  const [dragItem, setDragItem] = useState(null)
  const [editingMeeting, setEditingMeeting] = useState(null)
  const [meetingInput, setMeetingInput] = useState('')

  const today = new Date().toISOString().split('T')[0]
  const todaySessions = useMemo(() => {
    return sessions.filter(s => {
      const nd = s.next_call_date
      return nd === today || (s.is_overdue && !progress[s.voucher_number]?.completed)
    }).slice(0, 12)
  }, [sessions, progress, today])

  const unscheduled = useMemo(() => {
    const scheduledVouchers = Object.values(schedule).filter(s => s.type === 'call').map(s => s.voucher)
    return todaySessions.filter(s => !scheduledVouchers.includes(s.voucher_number))
  }, [todaySessions, schedule])

  const toggleSlot = (hour, half) => {
    const key = `${String(hour).padStart(2, '0')}:${half ? '30' : '00'}`
    setSchedule(prev => {
      const next = { ...prev }
      if (next[key]) delete next[key]
      return next
    })
  }

  const placeCall = (slot, voucher) => {
    setSchedule(prev => ({ ...prev, [slot]: { type: 'call', label: voucher.replace('VOU', ''), voucher } }))
  }

  const placeBreak = (slot) => {
    setSchedule(prev => ({ ...prev, [slot]: { type: 'break', label: 'Break' } }))
  }

  const placeLunch = (slot) => {
    setSchedule(prev => ({ ...prev, [slot]: { type: 'lunch', label: 'Lunch' } }))
  }

  const placeMeeting = (slot, label) => {
    setSchedule(prev => ({ ...prev, [slot]: { type: 'meeting', label } }))
    setEditingMeeting(null)
    setMeetingInput('')
  }

  const clearSlot = (slot) => {
    setSchedule(prev => { const n = { ...prev }; delete n[slot]; return n })
  }

  const resetSchedule = () => setSchedule({})

  const breakCount = Object.values(schedule).filter(s => s.type === 'break').length
  const lunchCount = Object.values(schedule).filter(s => s.type === 'lunch').length

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 16 }}>
      {/* Unscheduled Calls */}
      <Card>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>📞 Unscheduled</span>
          <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 3, background: 'var(--bg4)', color: 'var(--text3)' }}>{unscheduled.length}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 500, overflowY: 'auto' }}>
          {unscheduled.map(s => {
            const isDone = !!progress[s.voucher_number]?.completed
            return (
              <div key={s.voucher_number}
                draggable
                onDragStart={() => setDragItem(s.voucher_number)}
                style={{
                  padding: '6px 8px', borderRadius: 'var(--r)', background: isDone ? 'var(--bg3)' : 'var(--bg4)',
                  border: `1px solid ${isDone ? 'var(--border2)' : 'var(--border)'}`, opacity: isDone ? 0.4 : 1,
                  cursor: 'grab', fontSize: 11, display: 'flex', alignItems: 'center', gap: 6,
                }}>
                <VoucherLink voucher={s.voucher_number} />
                <StatusBadge status={s.status} />
              </div>
            )
          })}
          {unscheduled.length === 0 && <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', padding: 12 }}>All scheduled! 🎉</div>}
        </div>
      </Card>

      {/* Timeline */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>📅 Today's Schedule · 9am – 6pm</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {breakCount < 2 && <BtnSm onClick={() => { const slot = findFreeSlot(schedule); if (slot) placeBreak(slot) }} label={`+ Break (${breakCount}/2)`} disabled={breakCount >= 2} />}
            {lunchCount === 0 && <BtnSm onClick={() => { const slot = findFreeSlot(schedule, 12); if (slot) placeLunch(slot) }} label="+ Lunch" disabled={false} />}
            <BtnSm onClick={() => setEditingMeeting('first')} label="+ Meeting" />
            <BtnSm onClick={resetSchedule} label="↺ Reset" style={{ color: 'var(--red-t)' }} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 8, fontSize: 10, color: 'var(--text3)' }}>
          {Object.entries(HALF_HOUR_COLORS).map(([type, c]) => (
            <span key={type} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: c.bg, border: `1px solid ${c.border}` }} />
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </span>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {HOURS.flatMap(hour => [false, true].map(half => {
            const slot = `${String(hour).padStart(2, '0')}:${half ? '30' : '00'}`
            const item = schedule[slot]
            const isLunchHour = hour === 12
            const colors = item ? HALF_HOUR_COLORS[item.type] : null
            const label = item?.label || ''

            return (
              <div key={slot}
                onDragOver={e => e.preventDefault()}
                onDrop={() => {
                  if (dragItem && !item) { placeCall(slot, dragItem); setDragItem(null) }
                }}
                onClick={() => {
                  if (!item) {
                    if (editingMeeting === 'first') setEditingMeeting(slot)
                    else toggleSlot(slot)
                  }
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', borderRadius: 4,
                  background: colors ? colors.bg : 'var(--bg3)',
                  border: `1px solid ${colors ? colors.border : 'transparent'}`,
                  minHeight: 28, cursor: item ? 'default' : 'pointer',
                  opacity: item ? 1 : 0.7,
                }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text3)', minWidth: 42, fontFamily: 'var(--font-mono)' }}>{slot}</span>
                {item ? (
                  <>
                    <span style={{ fontSize: 11, fontWeight: 600, color: colors.text }}>{label}</span>
                    {item.type === 'call' && <span style={{ marginLeft: 'auto', fontSize: 10 }}><VoucherLink voucher={item.voucher} /></span>}
                    <button onClick={e => { e.stopPropagation(); clearSlot(slot) }} style={{ marginLeft: 4, background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 10, padding: '0 4px' }}>✕</button>
                  </>
                ) : (
                  <span style={{ fontSize: 10, color: 'var(--text3)', opacity: 0.4 }}>Click to schedule</span>
                )}
              </div>
            )
          }))}
        </div>

        {/* Meeting input */}
        {editingMeeting && editingMeeting !== 'first' && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
            onClick={() => setEditingMeeting(null)}>
            <Card style={{ width: 300 }} onClick={e => e.stopPropagation()}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>📌 Add Meeting</div>
              <input autoFocus value={meetingInput} onChange={e => setMeetingInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && meetingInput.trim()) placeMeeting(editingMeeting, meetingInput.trim()) }}
                placeholder="Meeting name..." style={{ width: '100%', padding: '8px 10px', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 'var(--r)', color: 'var(--text)', fontSize: 12, outline: 'none', marginBottom: 10 }} />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setEditingMeeting(null)} style={{ padding: '4px 12px', fontSize: 11, borderRadius: 'var(--r)', border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text2)', cursor: 'pointer' }}>Cancel</button>
                <button onClick={() => meetingInput.trim() && placeMeeting(editingMeeting, meetingInput.trim())} style={{ padding: '4px 12px', fontSize: 11, borderRadius: 'var(--r)', border: 'none', background: 'var(--blue)', color: '#fff', cursor: 'pointer' }}>Add</button>
              </div>
            </Card>
          </div>
        )}
      </Card>
    </div>
  )
}

function BtnSm({ onClick, label, disabled, style }) {
  return <button onClick={onClick} disabled={disabled} style={{
    padding: '3px 10px', fontSize: 10, borderRadius: 'var(--r)', border: '1px solid var(--border2)',
    background: disabled ? 'var(--bg4)' : 'var(--bg3)', color: style?.color || 'var(--text2)',
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
  }}>{label}</button>
}

function findFreeSlot(schedule, preferredHour) {
  const hours = preferredHour ? [preferredHour] : HOURS
  for (const hour of hours) {
    for (const half of [false, true]) {
      const slot = `${String(hour).padStart(2, '0')}:${half ? '30' : '00'}`
      if (!schedule[slot]) return slot
    }
  }
  return null
}
