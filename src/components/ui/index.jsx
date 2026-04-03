import React from 'react'

// ── Badge ──
export function Badge({ variant = 'default', children, style }) {
  const variants = {
    contacted: { background: 'var(--green-bg)', color: 'var(--green-t)', border: '1px solid rgba(61,214,140,0.2)' },
    processing: { background: 'var(--blue-bg)', color: 'var(--blue-t)', border: '1px solid rgba(79,142,247,0.2)' },
    pending: { background: 'var(--amber-bg)', color: 'var(--amber-t)', border: '1px solid rgba(245,166,35,0.2)' },
    overdue: { background: 'var(--red-bg)', color: 'var(--red-t)', border: '1px solid rgba(242,92,110,0.2)' },
    done: { background: 'var(--green-bg)', color: 'var(--green-t)', border: '1px solid rgba(61,214,140,0.2)' },
    default: { background: 'var(--bg4)', color: 'var(--text2)', border: '1px solid var(--border)' },
  }
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
      fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap',
      ...variants[variant], ...style
    }}>
      {children}
    </span>
  )
}

export function StatusBadge({ status }) {
  const v = status === 'Contacted' ? 'contacted' : status === 'Processing' ? 'processing' : 'pending'
  return <Badge variant={v}>{status}</Badge>
}

// ── Card ──
export function Card({ children, style, className }) {
  return (
    <div style={{
      background: 'var(--bg2)', borderRadius: 'var(--rl)',
      border: '1px solid var(--border)', padding: '16px 20px', ...style
    }} className={className}>
      {children}
    </div>
  )
}

// ── Stat Card ──
export function StatCard({ label, value, variant = 'default', icon }) {
  const colors = {
    danger: 'var(--red-t)', good: 'var(--green-t)',
    warn: 'var(--amber-t)', blue: 'var(--blue-t)', default: 'var(--text)'
  }
  return (
    <Card style={{ padding: '14px 16px' }}>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
        {icon && <span>{icon}</span>}{label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: colors[variant], fontFamily: 'var(--font-mono)' }}>
        {value}
      </div>
    </Card>
  )
}

// ── Alert ──
export function Alert({ variant = 'red', icon, title, children }) {
  const styles = {
    red: { background: 'var(--red-bg)', color: 'var(--red-t)', border: '1px solid rgba(242,92,110,0.25)' },
    amber: { background: 'var(--amber-bg)', color: 'var(--amber-t)', border: '1px solid rgba(245,166,35,0.25)' },
    green: { background: 'var(--green-bg)', color: 'var(--green-t)', border: '1px solid rgba(61,214,140,0.25)' },
    blue: { background: 'var(--blue-bg)', color: 'var(--blue-t)', border: '1px solid rgba(79,142,247,0.25)' },
  }
  return (
    <div style={{ ...styles[variant], borderRadius: 'var(--r)', padding: '10px 14px', fontSize: 12, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      {icon && <span style={{ fontSize: 14, flexShrink: 0 }}>{icon}</span>}
      <div>
        {title && <div style={{ fontWeight: 600, marginBottom: 2 }}>{title}</div>}
        <div style={{ opacity: 0.85 }}>{children}</div>
      </div>
    </div>
  )
}

// ── Button ──
export function Btn({ children, variant = 'default', onClick, disabled, style, size = 'md' }) {
  const base = {
    border: 'none', borderRadius: 'var(--r)', fontWeight: 500,
    transition: 'opacity .15s, transform .1s', cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1, display: 'inline-flex', alignItems: 'center', gap: 6,
    fontSize: size === 'sm' ? 11 : 12, padding: size === 'sm' ? '4px 12px' : '8px 16px',
  }
  const variants = {
    primary: { background: 'var(--blue)', color: '#fff' },
    success: { background: 'var(--green)', color: '#0f1117' },
    danger: { background: 'var(--red-bg)', color: 'var(--red-t)', border: '1px solid rgba(242,92,110,0.3)' },
    default: { background: 'var(--bg3)', color: 'var(--text2)', border: '1px solid var(--border2)' },
  }
  return (
    <button style={{ ...base, ...variants[variant], ...style }} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}

// ── Checkmark ──
export function Checkmark({ checked, onClick }) {
  return (
    <button onClick={onClick} style={{
      width: 22, height: 22, borderRadius: 5, border: checked ? 'none' : '1.5px solid var(--border2)',
      background: checked ? 'var(--green)' : 'var(--bg3)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', cursor: 'pointer', transition: 'all .15s', flexShrink: 0,
    }}>
      {checked && (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <polyline points="2,6 5,9 10,3" stroke="#0f1117" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  )
}

// ── Sync Status ──
export function SyncStatus({ state, message }) {
  const colors = { ok: 'var(--green)', saving: 'var(--amber)', error: 'var(--red)', load: 'var(--blue)' }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, color: 'var(--text3)' }}>
      <div style={{
        width: 7, height: 7, borderRadius: '50%', background: colors[state] || 'var(--text3)',
        animation: (state === 'saving' || state === 'load') ? 'pulse .7s infinite' : 'none',
        flexShrink: 0,
      }} />
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}`}</style>
      <span>{message}</span>
    </div>
  )
}

// ── Progress Bar ──
export function ProgressBar({ value, total, label }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {label && <span style={{ fontSize: 12, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{label}</span>}
      <div style={{ flex: 1, height: 5, background: 'var(--bg4)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: 'var(--green)', borderRadius: 3, transition: 'width .4s' }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)', minWidth: 36, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
        {pct}%
      </span>
    </div>
  )
}

// ── Modal ──
export function Modal({ open, onClose, title, subtitle, children }) {
  if (!open) return null
  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{ background: 'var(--bg2)', borderRadius: 'var(--rxl)', border: '1px solid var(--border2)', padding: '24px', width: 400, maxWidth: '95vw' }}>
        {title && <div style={{ fontSize: 15, fontWeight: 700, marginBottom: subtitle ? 4 : 16 }}>{title}</div>}
        {subtitle && <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16 }}>{subtitle}</div>}
        {children}
      </div>
    </div>
  )
}

// ── Input ──
export function Input({ label, ...props }) {
  return (
    <div style={{ marginBottom: 14 }}>
      {label && <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 5 }}>{label}</label>}
      <input {...props} style={{
        width: '100%', padding: '8px 10px', background: 'var(--bg3)',
        border: '1px solid var(--border2)', borderRadius: 'var(--r)',
        color: 'var(--text)', fontSize: 13, outline: 'none',
        ...props.style
      }} />
    </div>
  )
}

// ── Textarea ──
export function Textarea({ label, ...props }) {
  return (
    <div style={{ marginBottom: 14 }}>
      {label && <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 5 }}>{label}</label>}
      <textarea {...props} style={{
        width: '100%', padding: '8px 10px', background: 'var(--bg3)',
        border: '1px solid var(--border2)', borderRadius: 'var(--r)',
        color: 'var(--text)', fontSize: 12, outline: 'none', resize: 'vertical', minHeight: 90,
        ...props.style
      }} />
    </div>
  )
}

// ── Tabs ──
export function Tabs({ tabs, active, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 3, background: 'var(--bg2)', borderRadius: 'var(--rl)', border: '1px solid var(--border)', padding: 5, marginBottom: 16 }}>
      {tabs.map(tab => (
        <button key={tab.key} onClick={() => onChange(tab.key)} style={{
          flex: 1, padding: '8px 8px', fontSize: 11, fontWeight: 500, borderRadius: 'var(--r)',
          border: 'none', background: active === tab.key ? 'var(--bg4)' : 'transparent',
          color: active === tab.key ? 'var(--text)' : 'var(--text3)',
          transition: 'all .15s', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
        }}>
          {tab.icon && <span>{tab.icon}</span>}{tab.label}
        </button>
      ))}
    </div>
  )
}

// ── Table ──
export function Table({ headers, rows, emptyMessage = 'No data' }) {
  if (!rows.length) return <div style={{ textAlign: 'center', padding: 32, color: 'var(--text3)', fontSize: 13 }}>{emptyMessage}</div>
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} style={{ textAlign: 'left', padding: '6px 10px', fontSize: 11, fontWeight: 500, color: 'var(--text3)', borderBottom: '1px solid var(--border)', background: 'var(--bg3)', whiteSpace: 'nowrap' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              {row.map((cell, j) => (
                <td key={j} style={{ padding: '7px 10px', verticalAlign: 'middle' }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
