import React, { useState, useMemo, useEffect } from 'react'
import { Card, StatusBadge } from '../components/ui'
import { VoucherLink } from './SessionsTable'

const HALF_LABELS = Array.from({ length: 18 }, (_, i) => {
  const h = 9 + Math.floor(i / 2)
  const m = (i % 2) * 30
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
})

const TYPE_COLORS = {
  call: { bg: 'rgba(79,142,247,.15)', border: 'var(--blue-t)', text: 'var(--blue-t)', icon: '📞' },
  meeting: { bg: 'rgba(155,89,247,.15)', border: '#a78bfa', text: '#a78bfa', icon: '📌' },
  other: { bg: 'rgba(99,102,241,.15)', border: '#818cf8', text: '#818cf8', icon: '📋' },
  break: { bg: 'rgba(61,214,140,.12)', border: 'var(--green-t)', text: 'var(--green-t)', icon: '☕' },
  lunch: { bg: 'rgba(245,166,35,.12)', border: 'var(--amber-t)', text: 'var(--amber-t)', icon: '🍽️' },
}

// Pre-defined breaks and lunch
const DEFAULT_BREAKS = [
  { id: 'break1', type: 'break', label: 'Break 1', startTime: '11:00', duration: 30, note: '' },  // 11:00-11:15 (half hour slot)
  { id: 'break2', type: 'break', label: 'Break 2', startTime: '15:00', duration: 30, note: '' },  // 15:00-15:15
]
const DEFAULT_LUNCH = { id: 'lunch', type: 'lunch', label: 'Lunch', startTime: '13:00', duration: 60, note: '' }  // 13:00-14:00

export default function DailyScheduler({ sessions, progress }) {
  const [events, setEvents] = useState([])
  const [dragItem, setDragItem] = useState(null)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [editEvent, setEditEvent] = useState(null)
  const [form, setForm] = useState({ type: 'meeting', label: '', startTime: '09:00', endTime: '09:30', note: '' })

  useEffect(() => {
    // Initialize with default breaks and lunch
    setEvents(prev => {
      if (prev.length === 0) {
        return [
          ...DEFAULT_BREAKS.map(b => ({ ...b, endTime: '11:15' })),
          { ...DEFAULT_LUNCH, endTime: '14:00' },
        ]
      }
      return prev
    })
  }, [])

  const today = new Date().toISOString().split('T')[0]
  const todaySessions = useMemo(() => {
    return sessions.filter(s => s.next_call_date === today || (s.is_overdue && !progress[s.voucher_number]?.completed))
      .slice(0, 20)
  }, [sessions, progress, today])

  const scheduledVouchers = useMemo(() => new Set(events.filter(e => e.type === 'call').map(e => e.voucher)), [events])
  const unscheduled = useMemo(() => todaySessions.filter(s => !scheduledVouchers.has(s.voucher_number)), [todaySessions, scheduledVouchers])

  // Build time grid - each event occupies its duration
  const timeSlots = useMemo(() => {
    const grid = {}
    HALF_LABELS.forEach(slot => { grid[slot] = [] })
    
    events.forEach(ev => {
      const startIdx = HALF_LABELS.indexOf(ev.startTime)
      const endIdx = HALF_LABELS.findIndex(slot => slot >= ev.endTime) - 1
      for (let i = startIdx; i <= endIdx && i < HALF_LABELS.length; i++) {
        grid[HALF_LABELS[i]].push(ev)
      }
    })
    return grid
  }, [events])

  const addEvent = () => {
    if (!form.label.trim()) return
    setEvents(prev => [...prev, { id: Date.now(), type: form.type, label: form.label.trim(), startTime: form.startTime, endTime: form.endTime, note: form.note.trim() }])
    setEditEvent(null)
    setForm({ type: 'meeting', label: '', startTime: '09:00', endTime: '09:30', note: '' })
  }

  const removeEvent = (id) => setEvents(prev => prev.filter(e => e.id !== id))

  const resetSchedule = () => setEvents([...DEFAULT_BREAKS.map(b => ({ ...b, endTime: '11:15' })), { ...DEFAULT_LUNCH, endTime: '14:00' }])

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 16 }}>
      {/* Unscheduled Calls */}
      <Card>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>📞 Unscheduled</span>
          <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 3, background: 'var(--bg4)', color: 'var(--text3)' }}>{unscheduled.length}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 350, overflowY: 'auto' }}>
          {unscheduled.map(s => {
            const isDone = !!progress[s.voucher_number]?.completed
            return (
              <div key={s.voucher_number} draggable onDragStart={() => setDragItem({ type: 'call', voucher: s.voucher_number, label: s.voucher_number.replace('VOU', ''), duration: 30 })}
                style={{ padding: '5px 7px', borderRadius: 'var(--r)', background: isDone ? 'var(--bg3)' : 'var(--bg4)', border: `1px solid ${isDone ? 'var(--border2)' : 'var(--border)'}`, opacity: isDone ? 0.4 : 1, cursor: 'grab', fontSize: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
                <VoucherLink voucher={s.voucher_number} />
              </div>
            )
          })}
          {unscheduled.length === 0 && <div style={{ fontSize: 10, color: 'var(--text3)', textAlign: 'center', padding: 12 }}>All scheduled! 🎉</div>}
        </div>
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
          <button onClick={() => setEditEvent('add')} style={{ width: '100%', padding: '6px', fontSize: 11, borderRadius: 'var(--r)', border: '1px dashed var(--border2)', background: 'transparent', color: 'var(--text3)', cursor: 'pointer' }}>+ Add Event</button>
        </div>
      </Card>

      {/* Timeline */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>📅 Today's Schedule · 9am – 6pm</div>
          <button onClick={resetSchedule} style={{ padding: '3px 10px', fontSize: 10, borderRadius: 'var(--r)', border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--red-t)', cursor: 'pointer' }}>↺ Reset</button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 8, fontSize: 9, color: 'var(--text3)' }}>
          {Object.entries(TYPE_COLORS).map(([type, c]) => (
            <span key={type} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: c.bg, border: `1px solid ${c.border}` }} />
              {c.icon} {type}
            </span>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {HALF_LABELS.map((slot, i) => {
            const slotEvents = timeSlots[slot] || []
            const isFullHour = i % 2 === 0

            return (
              <div key={slot}
                onDragOver={e => e.preventDefault()}
                onDrop={() => {
                  if (dragItem && slotEvents.length === 0) {
                    const endMinutes = parseInt(slot.split(':')[1]) + dragItem.duration
                    const endHour = parseInt(slot.split(':')[0]) + Math.floor(endMinutes / 60)
                    const endMin = endMinutes % 60
                    const endTime = `${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`
                    setEvents(prev => [...prev, { id: Date.now(), ...dragItem, endTime, note: '' }])
                    setDragItem(null)
                  }
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: isFullHour ? '5px 8px' : '3px 8px', borderRadius: 4,
                  background: slotEvents.length > 0 ? 'var(--bg4)' : 'transparent',
                  minHeight: isFullHour ? 32 : 20, cursor: slotEvents.length === 0 ? 'pointer' : 'default',
                  borderLeft: isFullHour ? '2px solid var(--border)' : '2px solid transparent',
                }}>
                <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--text3)', minWidth: 36, fontFamily: 'var(--font-mono)', opacity: isFullHour ? 1 : 0.4 }}>{slot}</span>
                {slotEvents.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, flex: 1 }}>
                    {slotEvents.filter((ev, idx, arr) => arr.findIndex(e => e.id === ev.id) === idx).map(ev => {
                      const c = TYPE_COLORS[ev.type]
                      return (
                        <div key={ev.id} onClick={() => setSelectedEvent(ev)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 4, padding: '2px 6px', borderRadius: 3,
                            background: c.bg, border: `1px solid ${c.border}`, fontSize: 9, cursor: 'pointer',
                          }}>
                          <span>{c.icon}</span>
                          <span style={{ fontWeight: 600, color: c.text }}>{ev.label}</span>
                          <span style={{ fontSize: 8, opacity: 0.7 }}>{ev.startTime}-{ev.endTime}</span>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <span style={{ fontSize: 8, color: 'var(--text3)', opacity: 0.3, marginTop: isFullHour ? 0 : 2 }}>·</span>
                )}
              </div>
            )
          })}
        </div>

        {/* Event Detail Modal */}
        {selectedEvent && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setSelectedEvent(null)}>
            <Card style={{ width: 320 }} onClick={e => e.stopPropagation()}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>{TYPE_COLORS[selectedEvent.type]?.icon}</span>
                {selectedEvent.label}
                <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text3)' }}>{selectedEvent.startTime} – {selectedEvent.endTime}</span>
              </div>
              {selectedEvent.type === 'call' && <div style={{ marginBottom: 8, fontSize: 12 }}><VoucherLink voucher={selectedEvent.voucher} /></div>}
              {selectedEvent.note ? (
                <div style={{ padding: 10, background: 'var(--bg3)', borderRadius: 'var(--r)', fontSize: 12, color: 'var(--text2)', whiteSpace: 'pre-wrap' }}>{selectedEvent.note}</div>
              ) : (
                <div style={{ fontSize: 11, color: 'var(--text3)', fontStyle: 'italic' }}>No notes</div>
              )}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
                {selectedEvent.type !== 'break' && selectedEvent.type !== 'lunch' && (
                  <button onClick={() => { removeEvent(selectedEvent.id); setSelectedEvent(null) }} style={{ padding: '4px 12px', fontSize: 11, borderRadius: 'var(--r)', border: '1px solid var(--red)', background: 'var(--red-bg)', color: 'var(--red-t)', cursor: 'pointer' }}>Delete</button>
                )}
                <button onClick={() => setSelectedEvent(null)} style={{ padding: '4px 12px', fontSize: 11, borderRadius: 'var(--r)', border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text2)', cursor: 'pointer' }}>Close</button>
              </div>
            </Card>
          </div>
        )}

        {/* Add Event Modal */}
        {editEvent && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setEditEvent(null)}>
            <Card style={{ width: 340 }} onClick={e => e.stopPropagation()}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>➕ Add Event</div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                {['call', 'meeting', 'other'].map(type => {
                  const c = TYPE_COLORS[type]
                  return (
                    <button key={type} onClick={() => setForm(f => ({ ...f, type }))}
                      style={{ flex: 1, padding: '4px 6px', fontSize: 10, borderRadius: 'var(--r)', border: `1px solid ${form.type === type ? c.border : 'var(--border2)'}`, background: form.type === type ? c.bg : 'var(--bg3)', color: form.type === type ? c.text : 'var(--text2)', cursor: 'pointer', fontWeight: form.type === type ? 600 : 400 }}>
                      {c.icon} {type}
                    </button>
                  )
                })}
              </div>
              <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="Event name..."
                style={{ width: '100%', padding: '7px 10px', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 'var(--r)', color: 'var(--text)', fontSize: 12, outline: 'none', marginBottom: 10, boxSizing: 'border-box' }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                <div>
                  <label style={{ fontSize: 10, color: 'var(--text3)', display: 'block', marginBottom: 3 }}>From</label>
                  <select value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))}
                    style={{ width: '100%', padding: '6px', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 'var(--r)', color: 'var(--text)', fontSize: 11, outline: 'none' }}>
                    {HALF_LABELS.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 10, color: 'var(--text3)', display: 'block', marginBottom: 3 }}>To</label>
                  <select value={form.endTime} onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}
                    style={{ width: '100%', padding: '6px', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 'var(--r)', color: 'var(--text)', fontSize: 11, outline: 'none' }}>
                    {HALF_LABELS.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
              </div>
              <textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Notes (optional)..."
                style={{ width: '100%', padding: '7px 10px', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 'var(--r)', color: 'var(--text)', fontSize: 12, outline: 'none', resize: 'vertical', minHeight: 60, boxSizing: 'border-box', marginBottom: 14 }} />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setEditEvent(null)} style={{ padding: '4px 12px', fontSize: 11, borderRadius: 'var(--r)', border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text2)', cursor: 'pointer' }}>Cancel</button>
                <button onClick={addEvent} style={{ padding: '4px 12px', fontSize: 11, borderRadius: 'var(--r)', border: 'none', background: 'var(--blue)', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Add Event</button>
              </div>
            </Card>
          </div>
        )}
      </Card>
    </div>
  )
}
