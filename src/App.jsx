import React from 'react'
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom'
import TLConsolePage from './pages/TLConsolePage'

function Sidebar() {
  const loc = useLocation()

  return (
    <div style={{
      width: 200, minHeight: '100vh', background: 'var(--bg2)', borderRight: '1px solid var(--border)',
      padding: '20px 12px', display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0,
      position: 'sticky', top: 0, height: '100vh', overflowY: 'auto',
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)', padding: '4px 10px', marginBottom: 8, letterSpacing: '.5px', textTransform: 'uppercase' }}>
        Voucher Sessions
      </div>

      <NavLink to="/" active={loc.pathname === '/'} icon="🎛" label="Dashboard" />
    </div>
  )
}

function NavLink({ to, active, icon, label }) {
  return (
    <Link to={to} style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 'var(--r)',
      background: active ? 'var(--bg4)' : 'transparent', color: active ? 'var(--text)' : 'var(--text3)',
      fontSize: 12, fontWeight: active ? 600 : 400, transition: 'all .15s', textDecoration: 'none',
    }}
      onMouseEnter={e => !active && (e.currentTarget.style.background = 'var(--bg3)')}
      onMouseLeave={e => !active && (e.currentTarget.style.background = 'transparent')}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </Link>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        <Sidebar />
        <div style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
          <Routes>
            <Route path="/" element={<TLConsolePage />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  )
}
