import React from 'react'
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom'
import TLConsolePage from './pages/TLConsolePage'
import SpecialistPage from './pages/SpecialistPage'

const SPECIALISTS = [
  { key: 'alejandro-guerrero', name: 'Alejandro Guerrero', path: '/specialist/alejandro-guerrero' },
  { key: 'jonathan-flores', name: 'Jonathan Flores', path: '/specialist/jonathan-flores' },
  { key: 'jose-angel-aleman', name: 'Jose Angel Aleman', path: '/specialist/jose-angel-aleman' },
  { key: 'juno-urdiales', name: 'Juno Urdiales', path: '/specialist/juno-urdiales' },
  { key: 'luis-gallegos', name: 'Luis Gallegos', path: '/specialist/luis-gallegos' },
]

const SPECIALIST_NAME_MAP = {
  'alejandro-guerrero': 'Alejandro Guerrero',
  'jonathan-flores': 'Jonathan Flores',
  'jose-angel-aleman': 'Jose Angel Aleman',
  'juno-urdiales': 'Juno Urdiales',
  'luis-gallegos': 'Luis Gallegos',
}

function Sidebar() {
  const loc = useLocation()
  const isActive = (path) => loc.pathname === path || loc.pathname.startsWith(path + '/')

  return (
    <div style={{
      width: 220, minHeight: '100vh', background: 'var(--bg2)', borderRight: '1px solid var(--border)',
      padding: '20px 12px', display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0,
      position: 'sticky', top: 0, height: '100vh', overflowY: 'auto',
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)', padding: '4px 10px', marginBottom: 8, letterSpacing: '.5px', textTransform: 'uppercase' }}>
        Voucher Sessions
      </div>

      <NavLink to="/" active={loc.pathname === '/'} icon="🎛" label="TL Console" />

      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', padding: '12px 10px 4px', letterSpacing: '.5px', textTransform: 'uppercase' }}>
        Specialists
      </div>

      {SPECIALISTS.map(s => (
        <NavLink key={s.key} to={s.path} active={isActive(s.path)} icon="👤" label={s.name} />
      ))}
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

function SpecialistRoute({ params }) {
  const loc = useLocation()
  const key = loc.pathname.split('/').pop()
  const name = SPECIALIST_NAME_MAP[key]
  if (!name) return <div style={{ padding: 32, color: 'var(--text3)' }}>Specialist not found</div>
  return <SpecialistPage name={name} />
}

export default function App() {
  return (
    <BrowserRouter>
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        <Sidebar />
        <div style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
          <Routes>
            <Route path="/" element={<TLConsolePage />} />
            <Route path="/specialist/:key" element={<SpecialistRouteWrapper />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  )
}

function SpecialistRouteWrapper() {
  const loc = useLocation()
  const key = loc.pathname.split('/').pop()
  const name = SPECIALIST_NAME_MAP[key]
  if (!name) return <div style={{ padding: 32, color: 'var(--text3)' }}>Specialist not found</div>
  return <SpecialistPage name={name} />
}
