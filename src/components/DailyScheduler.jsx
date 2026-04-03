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
  break: { bg: 'rgba(61,214,140,.15)', border: 'var(--green-t)', text: 'var(--green-t)', icon: '☕' },
  lunch: { bg: 'rgba(245,166,35,.15)', border: 'var(--amber-t)', text: 'var(--amber-t)', icon: '🍽️' },
}

// Fixed items: 2 Breaks (15 min each), 1 Lunch (1 hour)
const FIXED_ITEMS = [
  { id: 'break1', type: 'break', label: 'Break 1', duration: 15, defaultStart: '11:00' },
  { id: 'break2', type: 'break', label: 'Break 2', duration: 15, defaultStart: '16:00' },
  { id: 'lunch', type: 'lunch', label: 'Lunch', duration: 60, defaultStart: '13:00' },
]

export default function DailyScheduler({ sessions, progress }) {
  const [events, setEvents] = useState([])
  const [dragItem, setDragItem] = useState(null)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [editEvent, setEditEvent] = useState(null)
  const [form, setForm] = useState({ type: 'meeting', label: '', startTime: '09:00', endTime: '09:30', note: '' })

  // Initialize events
  useEffect(() => {
    const saved = localStorage.getItem('daily_schedule')
    let initialEvents = []
    
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        // Ensure fixed items are present and correct
        FIXED_ITEMS.forEach(f => {
          const existing = parsed.find(e => e.id === f.id)
          if (existing) {
            initialEvents.push({ ...existing, type: f.type, label: f.label, duration: f.duration })
          } else {
            initialEvents.push({ ...f, startTime: f.defaultStart, endTime: computeEndTime(f.defaultStart, f.duration), note: '' })
          }
        })
        // Add custom events
        const custom = parsed.filter(e => !FIXED_ITEMS.some(f => f.id === e.id))
        initialEvents = [...initialEvents, ...custom]
      } catch {
        initialEvents = getDefaultEvents()
      }
    } else {
      initialEvents = getDefaultEvents()
    }
    setEvents(initialEvents)
  }, [])

  // Save events
  useEffect(() => {
    if (events.length > 0) {
      localStorage.setItem('daily_schedule', JSON.stringify(events))
    }
  }, [events])

  const getDefaultEvents = () => {
    return FIXED_ITEMS.map(f => ({
      ...f,
      startTime: f.defaultStart,
      endTime: computeEndTime(f.defaultStart, f.duration),
      note: ''
    }))
  }

  function computeEndTime(start, durationMin) {
    const [h, m] = start.split(':').map(Number)
    const totalMin = h * 60 + m + durationMin
    const endH = Math.floor(totalMin / 60)
    const endM = totalMin % 60
    return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`
  }

  const today = new Date().toISOString().split('T')[0]
  const todaySessions = useMemo(() => {
    return sessions.filter(s => s.next_call_date === today || (s.is_overdue && !progress[s.voucher_number]?.completed))
      .slice(0, 20)
  }, [sessions, progress, today])

  const scheduledVouchers = useMemo(() => new Set(events.filter(e => e.type === 'call').map(e => e.voucher)), [events])
  const unscheduled = useMemo(() => todaySessions.filter(s => !scheduledVouchers.has(s.voucher_number)), [todaySessions, scheduledVouchers])

  // Build time grid
  const timeSlots = useMemo(() => {
    const grid = {}
    HALF_LABELS.forEach(slot => { grid[slot] = [] })
    
    events.forEach(ev => {
      const startIdx = HALF_LABELS.indexOf(ev.startTime)
      if (startIdx === -1) return
      
      // Calculate how many slots this event occupies
      // Break (15m) -> 1 slot, Lunch (60m) -> 2 slots
      const durationSlots = Math.ceil(ev.duration / 30)
      for (let i = 0; i < durationSlots; i++) {
        const idx = startIdx + i
        if (idx < HALF_LABELS.length) {
          grid[HALF_LABELS[idx]].push(ev)
        }
      }
    })
    return grid
  }, [events])

  const addEvent = () => {
    if (!form.label.trim()) return
    setEvents(prev => [...prev, { id: Date.now(), type: form.type, label: form.label.trim(), startTime: form.startTime, endTime: form.endTime, duration: 30, note: form.note.trim() }])
    setEditEvent(null)
    setForm({ type: 'meeting', label: '', startTime: '09:00', endTime: '09:30', note: '' })
  }

  const removeEvent = (id) => {
    // Don't allow removing fixed items
    if (FIXED_ITEMS.some(f => f.id === id)) return
    setEvents(prev => prev.filter(e => e.id !== id))
  }

  const resetSchedule = () => {
    setEvents(getDefaultEvents())
  }

  const handleDrop = (slot) => {
    if (!dragItem) return
    
    setEvents(prev => {
      if (dragItem.isFixed) {
        // Moving a fixed item (break/lunch)
        return prev.map(ev => {
          if (ev.id === dragItem.id) {
            return { ...ev, startTime: slot, endTime: computeEndTime(slot, ev.duration) }
          }
          return ev
        })
      } else {
        // Placing a voucher
        // Check if slot is occupied by another voucher (ignore breaks/lunch for voucher placement? No, usually breaks block slots)
        const slotOccupied = timeSlots[slot].some(e => e.type === 'call')
        if (!slotOccupied) {
           const endMinutes = parseInt(slot.split(':')[1]) + dragItem.duration
           const endHour = parseInt(slot.split(':')[0]) + Math.floor(endMinutes / 60)
           const endMin = endMinutes % 60
           const endTime = `${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`
           return [...prev, { id: Date.now(), ...dragItem, endTime, note: '' }]
        }
        return prev
      }
    })
    setDragItem(null)
  }

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
              <div key={s.voucher_number} draggable onDragStart={() => setDragItem({ type: 'call', voucher: s.voucher_number, label: s.voucher_number.replace('VOU', ''), duration: 30, isFixed: false })}
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
            // Filter out duplicates for rendering, keeping the first occurrence
            const uniqueEvents = slotEvents.filter((ev, idx, arr) => arr.findIndex(e => e.id === ev.id) === idx)

            return (
              <div key={slot}
                onDragOver={e => e.preventDefault()}
                onDrop={() => handleDrop(slot)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: isFullHour ? '5px 8px' : '3px 8px', borderRadius: 4,
                  background: slotEvents.length > 0 ? 'var(--bg4)' : 'transparent',
                  minHeight: isFullHour ? 32 : 20, cursor: slotEvents.length === 0 ? 'pointer' : 'default',
                  borderLeft: isFullHour ? '2px solid var(--border)' : '2px solid transparent',
                }}>
                <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--text3)', minWidth: 36, fontFamily: 'var(--font-mono)', opacity: isFullHour ? 1 : 0.4 }}>{slot}</span>
                {uniqueEvents.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, flex: 1 }}>
                    {uniqueEvents.map(ev => {
                      const c = TYPE_COLORS[ev.type]
                      return (
                        <div key={ev.id} 
                          draggable 
                          onDragStart={() => setDragItem({ id: ev.id, type: ev.type, label: ev.label, duration: ev.duration, isFixed: FIXED_ITEMS.some(f => f.id === ev.id) })}
                          onClick={() => setSelectedEvent(ev)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 4, padding: '2px 6px', borderRadius: 3,
                            background: c.bg, border: `1px solid ${c.border}`, fontSize: 9, cursor: 'grab',
                          }}>
                          <span>{c.icon}</span>
                          <span style={{ fontWeight: 600, color: c.text }}>{ev.label}</span>
                          <span style={{ fontSize: 8, opacity: 0.7 }}>{ev.startTime}-{computeEndTime(ev.startTime, ev.duration)}</span>
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
                <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text3)' }}>{selectedEvent.startTime} – {computeEndTime(selectedEvent.startTime, selectedEvent.duration)}</span>
              </div>
              {selectedEvent.type === 'call' && <div style={{ marginBottom: 8, fontSize: 12 }}><VoucherLink voucher={selectedEvent.voucher} /></div>}
              {selectedEvent.note ? (
                <div style={{ padding: 10, background: 'var(--bg3)', borderRadius: 'var(--r)', fontSize: 12, color: 'var(--text2)', whiteSpace: 'pre-wrap' }}>{selectedEvent.note}</div>
              ) : (
                <div style={{ fontSize: 11, color: 'var(--text3)', fontStyle: 'italic' }}>No notes</div>
              )}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
                {!FIXED_ITEMS.some(f => f.id === selectedEvent.id) && (
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
