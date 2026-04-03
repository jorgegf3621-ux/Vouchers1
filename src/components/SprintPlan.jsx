import React from 'react'
import { format, parseISO } from 'date-fns'

const DAY_COLORS = [
  { bg: '#fef2f2', border: '#fca5a5', text: '#991b1b' },
  { bg: '#fff7ed', border: '#fdba74', text: '#c2410c' },
  { bg: '#fffbeb', border: '#fcd34d', text: '#854d0e' },
  { bg: '#f0fdf4', border: '#86efac', text: '#166534' },
]

export default function SprintPlan({ sprint }) {
  if (!sprint) return null

  const goalFmt = sprint.goalDate
    ? format(parseISO(sprint.goalDate), 'MMM d, yyyy')
    : null

  return (
    <div style={{
      background: 'var(--bg2)', borderRadius: 'var(--rl)',
      border: '1px solid var(--border)', padding: '14px 18px', marginBottom: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>🚀 Sprint Recovery Plan</span>
        <span style={{ fontSize: 11, color: 'var(--text3)' }}>
          {sprint.overdueCount} overdue sessions — backlog above threshold
        </span>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        {sprint.callDays.map((cd, i) => {
          const c = DAY_COLORS[Math.min(i, DAY_COLORS.length - 1)]
          const label = format(parseISO(cd.date), 'EEE, MMM d')
          return (
            <div key={cd.date} style={{
              padding: '8px 14px', borderRadius: 'var(--r)', textAlign: 'center',
              background: c.bg, border: `1px solid ${c.border}`, minWidth: 110,
            }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: c.text }}>{label}</div>
              <div style={{ fontSize: 11, color: c.text, opacity: 0.7, marginTop: 2 }}>{cd.count} calls</div>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, color: 'var(--text3)' }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--blue)', flexShrink: 0 }} />
        {goalFmt
          ? <>Goal: backlog cleared by <strong style={{ color: 'var(--text2)' }}>{goalFmt}</strong> · Max 15 calls/day after sprint</>
          : 'Sprint plan active'}
      </div>
    </div>
  )
}
