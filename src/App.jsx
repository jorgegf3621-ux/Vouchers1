import React from 'react'
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom'
import TLConsolePage from './pages/TLConsolePage'

const SPECIALISTS = [
  { key: 'alejandro-guerrero', name: 'Alejandro Guerrero' },
  { key: 'fidel-sanchez', name: 'Fidel Sanchez' },
  { key: 'jonathan-flores', name: 'Jonathan Flores' },
  { key: 'jose-angel-aleman', name: 'Jose Angel Aleman' },
  { key: 'juno-urdiales', name: 'Juno Urdiales' },
  { key: 'luis-gallegos', name: 'Luis Gallegos' },
]

const BASE_URL = window.location.origin

function Sidebar() {
  const loc = useLocation()
  const isActive = (path) => loc.pathname === path

  return (
    <div style={{
      width: 220, minHeight: '100vh', background: 'var(--bg2)', borderRight: '1px solid var(--border)',
      padding: '20px 12px', display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0,
      position: 'sticky', top: 0, height: '100vh', overflowY: 'auto',
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)', padding: '4px 10px', marginBottom: 8, letterSpacing: '.5px', textTransform: 'uppercase' }}>
        Voucher Sessions
      </div>

      <NavLink to="/" active={isActive('/')} icon="🎛" label="Dashboard" />

      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', padding: '12px 10px 4px', letterSpacing: '.5px', textTransform: 'uppercase' }}>
        Specialists
      </div>

      {SPECIALISTS.map(s => (
        <NavLink key={s.key} to={`/s/${s.key}`} active={isActive(`/s/${s.key}`)} icon="👤" label={s.name} />
      ))}

      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', padding: '12px 10px 4px', letterSpacing: '.5px', textTransform: 'uppercase' }}>
        Direct Links
      </div>
      <div style={{ padding: '4px 10px' }}>
        {SPECIALISTS.map(s => (
          <div key={s.key} style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4, fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
            <a href={`${BASE_URL}/s/${s.key}`} target="_blank" rel="noreferrer"
              style={{ color: 'var(--blue-t)', textDecoration: 'none' }}>
              /s/{s.key}
            </a>
          </div>
        ))}
      </div>
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
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
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
            <Route path="/s/:key" element={<TLConsolePage />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  )
}
