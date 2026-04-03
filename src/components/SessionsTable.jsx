import React from 'react'
import { Badge, StatusBadge, Checkmark } from './ui'
import { fmtDate, priorityOrder } from '../lib/sprint'

export function VoucherLink({ voucher }) {
  const num = voucher.replace('VOU', '')
  return (
    <a href={`https://geminiduplication.com/vouchers/session/${num}`} target="_blank" rel="noreferrer"
      style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--blue-t)' }}>
      {num}
    </a>
  )
}

export function StatusSelect({ value, onChange }) {
  const styles = {
    Contacted: { background: 'var(--green-bg)', color: 'var(--green-t)', border: '1px solid rgba(61,214,140,.2)' },
    Processing: { background: 'var(--blue-bg)', color: 'var(--blue-t)', border: '1px solid rgba(79,142,247,.2)' },
    Pending: { background: 'var(--amber-bg)', color: 'var(--amber-t)', border: '1px solid rgba(245,166,35,.2)' },
    Filed: { background: 'var(--red-bg)', color: 'var(--red-t)', border: '1px solid rgba(242,92,110,.2)' },
  }
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      style={{
        padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer',
        outline: 'none', ...(styles[value] || {}),
      }}>
      <option>Contacted</option>
      <option>Processing</option>
      <option>Pending</option>
      <option>Filed</option>
    </select>
  )
}

export default function SessionsTable({
  sessions,
  progress,
  notes,
  dynCal,
  onComplete,
  onNote,
  onStatusChange,
  showCallDay = true,
  showSpecialist = false,
}) {
  // Sort by priority: Contacted > Processing > Pending, then by date
  const sorted = [...sessions].sort((a, b) => {
    const pa = priorityOrder(a.status), pb = priorityOrder(b.status)
    if (pa !== pb) return pa - pb
    return (a.next_call_date || '').localeCompare(b.next_call_date || '')
  })

  const overdue = sorted.filter(s => s.is_overdue)
  const future = sorted.filter(s => !s.is_overdue)

  return (
    <div>
      {overdue.length > 0 && (
        <GroupTable
          title="Overdue / Sprint List"
          badgeColor="var(--red-t)"
          sessions={overdue}
          progress={progress}
          notes={notes}
          dynCal={dynCal}
          onComplete={onComplete}
          onNote={onNote}
          onStatusChange={onStatusChange}
          showCallDay={showCallDay}
          showSpecialist={showSpecialist}
        />
      )}
      {future.length > 0 && (
        <GroupTable
          title="Upcoming"
          badgeColor="var(--green-t)"
          sessions={future}
          progress={progress}
          notes={notes}
          dynCal={dynCal}
          onComplete={onComplete}
          onNote={onNote}
          onStatusChange={onStatusChange}
          showCallDay={showCallDay}
          showSpecialist={showSpecialist}
        />
      )}
    </div>
  )
}

function GroupTable({ title, badgeColor, sessions, progress, notes, dynCal, onComplete, onNote, onStatusChange, showCallDay, showSpecialist }) {
  const done = sessions.filter(s => progress[s.voucher_number]?.completed).length

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{title}</span>
        <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: 'var(--bg4)', color: badgeColor }}>{sessions.length}</span>
        <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 'auto' }}>{done}/{sessions.length} done</span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              <th style={thStyle}>#</th>
              <th style={thStyle}>Voucher</th>
              {showSpecialist && <th style={thStyle}>Specialist</th>}
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Current Date</th>
              {showCallDay && <th style={thStyle}>Call Day</th>}
              <th style={thStyle}>New Date</th>
              <th style={thStyle}>Notes</th>
              <th style={{ ...thStyle, width: 44, textAlign: 'center' }}>✓</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s, i) => {
              const p = progress[s.voucher_number]
              const isDone = !!p?.completed
              const nd = p?.new_call_date || s.suggested_date || ''
              const ndLoad = nd && dynCal ? (dynCal[nd]?.count || 0) : 0
              const ndColor = ndLoad >= 15 ? 'var(--red-t)' : ndLoad >= 12 ? 'var(--amber-t)' : 'var(--green-t)'
              const ndBg = ndLoad >= 15 ? 'var(--red-bg)' : ndLoad >= 12 ? 'var(--amber-bg)' : 'var(--green-bg)'
              const hasNote = !!notes?.[s.voucher_number]

              return (
                <tr key={s.voucher_number} style={{ opacity: isDone ? 0.38 : 1, transition: 'opacity .15s' }}
                  onMouseEnter={e => !isDone && (e.currentTarget.style.background = 'var(--bg3)')}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <td style={tdStyle('var(--text3)', 11)}>{i + 1}</td>
                  <td style={tdStyle()}><VoucherLink voucher={s.voucher_number} /></td>
                  {showSpecialist && <td style={tdStyle('var(--text2)', 11)}>{s.case_specialist}</td>}
                  <td style={tdStyle()}>
                    {onStatusChange
                      ? <StatusSelect value={s.status} onChange={v => onStatusChange(s.voucher_number, v)} />
                      : <StatusBadge status={s.status} />
                    }
                  </td>
                  <td style={tdStyle('var(--text3)', 11)}>{fmtDate(s.next_call_date)}</td>
                  {showCallDay && (
                    <td style={tdStyle()}>
                      {s.call_day
                        ? <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 3, fontWeight: 500, background: 'var(--amber-bg)', color: 'var(--amber-t)' }}>{fmtDate(s.call_day)}</span>
                        : <span style={{ color: 'var(--text3)' }}>—</span>
                      }
                    </td>
                  )}
                  <td style={tdStyle()}>
                    {nd
                      ? <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: ndBg, color: ndColor }}>{fmtDate(nd)}</span>
                      : <span style={{ color: 'var(--text3)' }}>—</span>
                    }
                  </td>
                  <td style={tdStyle()}>
                    <button onClick={() => onNote?.(s.voucher_number)} style={{
                      background: hasNote ? 'var(--amber-bg)' : 'var(--bg4)',
                      border: `1px solid ${hasNote ? 'rgba(245,166,35,.3)' : 'var(--border2)'}`,
                      borderRadius: 4, padding: '2px 8px', fontSize: 11, cursor: 'pointer',
                      color: hasNote ? 'var(--amber-t)' : 'var(--text3)',
                    }}>
                      {hasNote ? '📝 View' : '+ Note'}
                    </button>
                  </td>
                  <td style={{ ...tdStyle(), textAlign: 'center' }}>
                    <Checkmark checked={isDone} onClick={() => onComplete?.(s.voucher_number, s.next_call_date)} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const thStyle = {
  textAlign: 'left', padding: '6px 10px', fontSize: 11, fontWeight: 500,
  color: 'var(--text3)', borderBottom: '1px solid var(--border)',
  background: 'var(--bg3)', whiteSpace: 'nowrap',
}
const tdStyle = (color, size) => ({
  padding: '6px 10px', borderBottom: '1px solid var(--border)', verticalAlign: 'middle',
  ...(color ? { color } : {}), ...(size ? { fontSize: size } : {}),
})
