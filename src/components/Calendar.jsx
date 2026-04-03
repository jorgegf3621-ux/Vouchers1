import React, { useState, useMemo } from 'react'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, parseISO } from 'date-fns'

const TODAY_ISO = format(new Date(), 'yyyy-MM-dd')

function getBadgeBefore(cnt, key) {
  if (key < TODAY_ISO) return { bg: '#fce7f3', color: '#c42b6e' }
  if (cnt >= 16) return { bg: 'var(--red-bg)', color: 'var(--red-t)' }
  if (cnt >= 9)  return { bg: 'var(--amber-bg)', color: 'var(--amber-t)' }
  if (cnt >= 4)  return { bg: 'rgba(245,166,35,0.08)', color: 'var(--amber-t)' }
  return { bg: 'var(--green-bg)', color: 'var(--green-t)' }
}

function getBadgeAfter(entry) {
  const type = entry.type, cnt = entry.count || 0
  if (type === 'action') return { bg: '#fef3c7', color: '#92400e', border: '1px solid #fbbf24' }
  if (type === 'meta')   return { bg: 'var(--blue)', color: '#fff' }
  if (cnt >= 15) return { bg: 'var(--red-bg)', color: 'var(--red-t)', border: '1px solid rgba(242,92,110,.3)' }
  if (cnt >= 12) return { bg: 'var(--amber-bg)', color: 'var(--amber-t)', border: '1px solid rgba(245,166,35,.3)' }
  if (type === 'user') return { bg: 'rgba(155,89,247,.12)', color: '#c084fc' }
  return { bg: 'var(--green-bg)', color: 'var(--green-t)' }
}

function getCellBgAfter(entry) {
  if (!entry) return {}
  const cnt = entry.count || 0, type = entry.type
  if (type === 'action') return { background: 'rgba(251,191,36,.06)' }
  if (cnt >= 15) return { background: 'var(--red-bg)', border: '1px solid rgba(242,92,110,.25)' }
  if (cnt >= 12) return { background: 'var(--amber-bg)', border: '1px solid rgba(245,166,35,.2)' }
  if (cnt > 0) return { background: 'var(--bg3)' }
  return {}
}

export default function Calendar({ data, mode, title, legend, highlightDays = [] }) {
  // Find all months with data
  const allMonths = useMemo(() => {
    const keys = Object.keys(data)
    if (!keys.length) return [format(new Date(), 'yyyy-MM')]
    const months = new Set(keys.map(k => k.slice(0, 7)))
    months.add(format(new Date(), 'yyyy-MM'))
    return [...months].sort()
  }, [data])

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const cur = format(new Date(), 'yyyy-MM')
    return allMonths.includes(cur) ? cur : allMonths[0]
  })

  const monthIdx = allMonths.indexOf(selectedMonth)
  const [y, m] = selectedMonth.split('-').map(Number)
  const monthStart = startOfMonth(new Date(y, m - 1))
  const monthEnd = endOfMonth(monthStart)
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd })
  const startDow = getDay(monthStart)

  const monthLabel = format(monthStart, 'MMMM yyyy')

  const DN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  return (
    <div>
      {/* Nav */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <button onClick={() => monthIdx > 0 && setSelectedMonth(allMonths[monthIdx - 1])}
          disabled={monthIdx === 0}
          style={{ padding: '5px 12px', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 'var(--r)', color: 'var(--text2)', fontSize: 12, cursor: monthIdx > 0 ? 'pointer' : 'not-allowed', opacity: monthIdx === 0 ? 0.4 : 1 }}>
          ← Prev
        </button>

        <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
          style={{ flex: 1, padding: '6px 12px', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 'var(--r)', color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer', outline: 'none' }}>
          {allMonths.map(mo => {
            const [my, mm] = mo.split('-').map(Number)
            return <option key={mo} value={mo}>{format(new Date(my, mm - 1), 'MMMM yyyy')}</option>
          })}
        </select>

        <button onClick={() => monthIdx < allMonths.length - 1 && setSelectedMonth(allMonths[monthIdx + 1])}
          disabled={monthIdx === allMonths.length - 1}
          style={{ padding: '5px 12px', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 'var(--r)', color: 'var(--text2)', fontSize: 12, cursor: monthIdx < allMonths.length - 1 ? 'pointer' : 'not-allowed', opacity: monthIdx === allMonths.length - 1 ? 0.4 : 1 }}>
          Next →
        </button>
      </div>

      {/* Legend */}
      {legend && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12, fontSize: 11, color: 'var(--text3)' }}>
          {legend.map((item, i) => (
            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: item.color, border: item.border || 'none', flexShrink: 0 }} />
              {item.label}
            </span>
          ))}
        </div>
      )}

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3 }}>
        {DN.map(n => (
          <div key={n} style={{ fontSize: 10, color: 'var(--text3)', textAlign: 'center', padding: '3px 0', fontWeight: 600 }}>{n}</div>
        ))}
        {Array(startDow).fill(null).map((_, i) => <div key={`e${i}`} />)}
        {days.map(day => {
          const key = format(day, 'yyyy-MM-dd')
          const isToday = key === TODAY_ISO
          const entry = data[key]
          const cnt = mode === 'before' ? (entry || 0) : (entry?.count || 0)

          const isHighlighted = highlightDays.includes(key)
          const cellStyle = {
            minHeight: 58, borderRadius: 7,
            border: isToday ? '2px solid var(--blue)' : isHighlighted ? '2px solid var(--red-t)' : '1px solid var(--border)',
            padding: 5, display: 'flex', flexDirection: 'column', gap: 2,
            background: isHighlighted ? 'rgba(242,92,110,.08)' : 'var(--bg2)',
            ...(mode === 'after' ? getCellBgAfter(entry) : cnt > 0 && !isHighlighted ? { background: 'var(--bg3)' } : {}),
          }

          const badge = mode === 'before'
            ? (cnt > 0 ? getBadgeBefore(cnt, key) : null)
            : (entry ? getBadgeAfter(entry) : null)

          return (
            <div key={key} style={cellStyle}>
              <div style={{ fontSize: 11, fontWeight: 600, color: isToday ? 'var(--blue)' : 'var(--text2)' }}>
                {day.getDate()}
              </div>
              {badge && cnt > 0 && (
                <div style={{
                  fontSize: 10, fontWeight: 600, textAlign: 'center', padding: '2px 3px', borderRadius: 3,
                  background: badge.bg, color: badge.color, border: badge.border || 'none',
                }}>
                  {mode === 'before' ? `${cnt} call${cnt !== 1 ? 's' : ''}` : entry.label}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
