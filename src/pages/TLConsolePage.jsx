import React, { useState, useMemo, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useTLData, useSpecialistData } from '../hooks/useData'
import { parseCSV, parseCSVDate, BACKLOG_THRESHOLD, TODAY_ISO, buildSprintPlan, detectSnowball, CAP_DAY, fmtDate, priorityOrder } from '../lib/sprint'
import { Card, Tabs, Alert, StatCard, Btn, StatusBadge, SyncStatus, ProgressBar } from '../components/ui'
import { VoucherLink, StatusSelect } from '../components/SessionsTable'
import { CompleteModal, NoteModal } from '../components/SessionModals'
import SprintPlan from '../components/SprintPlan'
import Calendar from '../components/Calendar'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

const SPECIALIST_MAP = {
  'alejandro-guerrero': 'Alejandro Guerrero',
  'fidel-sanchez': 'Fidel Sanchez',
  'jonathan-flores': 'Jonathan Flores',
  'jose-angel-aleman': 'Jose Angel Aleman',
  'juno-urdiales': 'Juno Urdiales',
  'luis-gallegos': 'Luis Gallegos',
}

const TABS_DASHBOARD = [
  { key: 'import', icon: '📤', label: 'Import CSV' },
  { key: 'dashboard', icon: '📊', label: 'Dashboard' },
  { key: 'alerts', icon: '🚨', label: 'Alerts' },
  { key: 'backlog', icon: '📈', label: 'Backlog' },
  { key: 'sessions', icon: '📋', label: 'Sessions' },
]

const TABS_SPECIALIST = [
  { key: 'queue', icon: '📞', label: "Today's Queue" },
  { key: 'list', icon: '📋', label: 'All Sessions' },
  { key: 'before', icon: '📅', label: 'Before' },
  { key: 'after', icon: '✓', label: 'After' },
]

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'future', label: 'Upcoming' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'processing', label: 'Processing' },
  { key: 'pending', label: 'Pending' },
  { key: 'filed', label: 'Filed' },
  { key: 'done', label: 'Done' },
]

const BEFORE_CAL_LEGEND = [
  { color: '#fce7f3', border: '1px solid #f472b6', label: 'Past due' },
  { color: 'var(--red-bg)', border: '1px solid var(--red-t)', label: '16+' },
  { color: 'var(--amber-bg)', border: '1px solid var(--amber-t)', label: '9–15' },
  { color: 'rgba(245,166,35,.08)', border: '1px solid var(--amber)', label: '4–8' },
  { color: 'var(--green-bg)', border: '1px solid var(--green-t)', label: '1–3' },
]
const AFTER_CAL_LEGEND = [
  { color: '#fef3c7', border: '1px solid #fbbf24', label: 'Sprint day' },
  { color: 'var(--green-bg)', border: '1px solid var(--green-t)', label: 'Balanced ≤15' },
  { color: 'var(--blue)', label: 'Goal ✓' },
  { color: 'var(--amber-bg)', border: '1px solid var(--amber-t)', label: 'Warning 12–14' },
  { color: 'rgba(155,89,247,.12)', border: '1px solid #a78bfa', label: 'Your scheduled' },
]

// ── Specialist View ──
function SpecialistView({ name }) {
  const { sessions, progress, notes, syncState, markComplete, undoComplete, updateStatus, saveNote, deleteNote, reload } = useSpecialistData(name)
  const [tab, setTab] = useState('queue')
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [completeModal, setCompleteModal] = useState(null)
  const [noteModal, setNoteModal] = useState(null)

  const overdue = useMemo(() => sessions.filter(s => s.is_overdue), [sessions])
  const future = useMemo(() => sessions.filter(s => !s.is_overdue), [sessions])
  const sprint = useMemo(() => buildSprintPlan(overdue, future), [overdue, future])

  // Add call_day from sprint plan to sessions
  const sessionsWithCallDay = useMemo(() => {
    if (!sprint) return sessions
    return sessions.map(s => ({ ...s, call_day: sprint.callAssignments[s.voucher_number] || null }))
  }, [sessions, sprint])

  const beforeCal = useMemo(() => {
    const cal = {}
    sessions.forEach(s => { if (s.next_call_date) cal[s.next_call_date] = (cal[s.next_call_date] || 0) + 1 })
    return cal
  }, [sessions])

  const afterCalBase = useMemo(() => {
    if (!sprint) {
      const cal = {}
      future.forEach(s => {
        if (s.next_call_date) {
          cal[s.next_call_date] = cal[s.next_call_date] || { count: 0, type: 'future', label: '' }
          cal[s.next_call_date].count++
          cal[s.next_call_date].label = `${cal[s.next_call_date].count} call${cal[s.next_call_date].count > 1 ? 's' : ''}`
        }
      })
      return cal
    }
    const cal = {}
    sprint.callDays.forEach(cd => { cal[cd.date] = { count: cd.count, type: 'action', label: `${cd.count} calls` } })
    const futLoad = {}
    future.forEach(s => { if (s.next_call_date) futLoad[s.next_call_date] = (futLoad[s.next_call_date] || 0) + 1 })
    const reschCounts = {}
    Object.values(sprint.suggestedDates || {}).forEach(d => { reschCounts[d] = (reschCounts[d] || 0) + 1 })
    const usedDays = [...new Set(Object.values(sprint.suggestedDates || {}))].sort()
    usedDays.forEach((d, i) => {
      const total = (futLoad[d] || 0) + (reschCounts[d] || 0)
      const isLast = i === usedDays.length - 1
      cal[d] = { count: total, type: isLast ? 'meta' : 'balanced', label: `${total} calls` }
    })
    Object.entries(futLoad).forEach(([d, cnt]) => { if (!cal[d]) cal[d] = { count: cnt, type: 'future', label: `${cnt} call${cnt > 1 ? 's' : ''}` } })
    return cal
  }, [sprint, future])

  const dynCal = useMemo(() => {
    const cal = JSON.parse(JSON.stringify(afterCalBase))
    Object.values(progress).forEach(p => {
      if (!p.completed || !p.new_call_date) return
      const d = p.new_call_date
      if (!cal[d]) cal[d] = { count: 0, type: 'user', label: '0 calls' }
      cal[d].count++
      const cnt = cal[d].count
      if (cal[d].type !== 'action' && cal[d].type !== 'meta') cal[d].type = cnt >= 15 ? 'critical' : cnt >= 12 ? 'warn' : 'user'
      cal[d].label = `${cnt} call${cnt > 1 ? 's' : ''}`
    })
    return cal
  }, [afterCalBase, progress])

  const overdueLeft = overdue.filter(s => !progress[s.voucher_number]?.completed).length
  const totalDone = Object.values(progress).filter(p => p.completed).length
  const sprintToday = sessionsWithCallDay.filter(s => s.call_day === TODAY_ISO && !progress[s.voucher_number]?.completed)
  const schedToday = sessionsWithCallDay.filter(s => !s.is_overdue && s.next_call_date === TODAY_ISO && !progress[s.voucher_number]?.completed)

  const alerts = useMemo(() => {
    const as = []
    if (overdueLeft > 25) as.push({ v: 'red', i: '⛔', title: `Backlog above threshold — ${overdueLeft} overdue`, body: "Follow the sprint plan. Complete today's queue." })
    else if (overdueLeft > 0) as.push({ v: 'amber', i: '⚠', title: `${overdueLeft} overdue sessions remaining`, body: 'Keep working through the daily queue.' })
    else if (overdue.length > 0) as.push({ v: 'green', i: '✅', title: 'Backlog cleared!', body: 'All overdue sessions completed.' })
    const snowball = detectSnowball(dynCal)
    if (snowball) as.push({ v: 'red', i: '📈', title: `Snowball detected — ${snowball} consecutive heavy days`, body: 'Redistribute sessions now before it compounds.' })
    const sat = Object.entries(dynCal).filter(([, e]) => (e.count || 0) >= 15 && e.type !== 'action')
    if (sat.length) as.push({ v: 'red', i: '⛔', title: `${sat.length} saturated day${sat.length > 1 ? 's' : ''} — 15+ calls`, body: sat.slice(0, 3).map(([d, e]) => `${d} (${e.count})`).join(', ') })
    return as
  }, [overdueLeft, overdue.length, dynCal])

  const filteredSessions = useMemo(() => {
    let rows = sessionsWithCallDay
    if (filter === 'overdue') rows = sessionsWithCallDay.filter(s => s.is_overdue && !progress[s.voucher_number]?.completed)
    else if (filter === 'future') rows = sessionsWithCallDay.filter(s => !s.is_overdue)
    else if (filter === 'contacted') rows = sessionsWithCallDay.filter(s => s.status === 'Contacted')
    else if (filter === 'processing') rows = sessionsWithCallDay.filter(s => s.status === 'Processing')
    else if (filter === 'pending') rows = sessionsWithCallDay.filter(s => s.status === 'Pending')
    else if (filter === 'filed') rows = sessionsWithCallDay.filter(s => s.status === 'Filed')
    else if (filter === 'done') rows = sessionsWithCallDay.filter(s => !!progress[s.voucher_number]?.completed)
    if (search) rows = rows.filter(s => s.voucher_number.toLowerCase().includes(search.toLowerCase()))
    return rows
  }, [sessionsWithCallDay, filter, search, progress])

  const handleComplete = (voucher, currentDate) => {
    if (progress[voucher]?.completed) { undoComplete(voucher) }
    else {
      const session = sessions.find(s => s.voucher_number === voucher)
      setCompleteModal({ voucher, currentDate, currentStatus: session?.status || 'Contacted' })
    }
  }

  const dateLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '20px 16px' }}>
      <div style={{ background: 'var(--bg2)', borderRadius: 'var(--rl)', border: '1px solid var(--border)', padding: '16px 20px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ width: 40, height: 40, borderRadius: 'var(--r)', background: 'var(--blue-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>📋</div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{name}</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Voucher Sessions · {dateLabel}</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <StatCard label="Backlog" value={overdueLeft} variant="danger" />
          <StatCard label="Due Today" value={Math.min(sprintToday.length + schedToday.length, CAP_DAY)} variant="warn" />
          <StatCard label="Done" value={totalDone} variant="good" />
          <StatCard label="Total" value={sessions.length} />
        </div>
      </div>

      <div style={{ marginBottom: 12 }}><SyncStatus {...syncState} /></div>

      {alerts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
          {alerts.map((a, i) => <Alert key={i} variant={a.v} icon={a.i} title={a.title}>{a.body}</Alert>)}
        </div>
      )}

      {sprint && <SprintPlan sprint={sprint} />}

      <Tabs tabs={TABS_SPECIALIST} active={tab} onChange={setTab} />

      {/* TODAY QUEUE */}
      {tab === 'queue' && (
        <Card>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{dateLabel}</div>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                {sprintToday.length + schedToday.length} call{(sprintToday.length + schedToday.length) !== 1 ? 's' : ''} assigned · cap {CAP_DAY}/day
              </div>
            </div>
            <div style={{
              marginLeft: 'auto', padding: '6px 16px', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700,
              background: sprintToday.length + schedToday.length > CAP_DAY ? 'var(--red-bg)' : sprintToday.length + schedToday.length === 0 ? 'var(--green-bg)' : 'var(--amber-bg)',
              color: sprintToday.length + schedToday.length > CAP_DAY ? 'var(--red-t)' : sprintToday.length + schedToday.length === 0 ? 'var(--green-t)' : 'var(--amber-t)',
            }}>
              {sprintToday.length + schedToday.length} assigned today
            </div>
          </div>

          {sprintToday.length === 0 && schedToday.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text3)', fontSize: 13 }}>🎉 No calls assigned for today! Check back tomorrow.</div>
          ) : (
            <>
              {sprintToday.length > 0 && <QueueSection label={`Sprint Calls — ${sprintToday.length} assigned for today`} items={sprintToday} progress={progress} borderColor="var(--amber)" onComplete={handleComplete} />}
              {schedToday.length > 0 && <QueueSection label={`Scheduled Today — ${schedToday.length}`} items={schedToday} progress={progress} borderColor="var(--blue)" onComplete={handleComplete} />}
            </>
          )}

          <ProgressBar value={overdue.filter(s => progress[s.voucher_number]?.completed).length} total={overdue.length} label={`${overdue.filter(s => progress[s.voucher_number]?.completed).length} of ${overdue.length} overdue completed`} style={{ marginTop: 16 }} />
        </Card>
      )}

      {/* ALL SESSIONS */}
      {tab === 'list' && (
        <Card>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
            {FILTERS.map(f => (
              <button key={f.key} onClick={() => setFilter(f.key)} style={{
                padding: '4px 12px', fontSize: 11, borderRadius: 20, border: '1px solid var(--border2)',
                background: filter === f.key ? 'var(--text)' : 'var(--bg3)', color: filter === f.key ? 'var(--bg)' : 'var(--text2)',
                cursor: 'pointer', fontWeight: filter === f.key ? 600 : 400,
              }}>{f.label}</button>
            ))}
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search voucher..."
              style={{ padding: '5px 10px', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 'var(--r)', color: 'var(--text)', fontSize: 12, outline: 'none', width: 180 }} />
            <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 'auto' }}>{filteredSessions.length} sessions</span>
          </div>
          <SessionsTable sessions={filteredSessions} progress={progress} notes={notes} dynCal={dynCal} onComplete={handleComplete} onNote={v => setNoteModal({ voucher: v })} onStatusChange={updateStatus} />
        </Card>
      )}

      {/* BEFORE CALENDAR */}
      {tab === 'before' && (
        <Card>
          <div style={{ fontSize: 13, fontWeight: 700, padding: '8px 14px', borderRadius: 'var(--r)', marginBottom: 14, background: 'var(--red-bg)', color: 'var(--red-t)', border: '1px solid rgba(242,92,110,.25)' }}>⚠ Current State — Before Plan</div>
          <Calendar data={beforeCal} mode="before" legend={BEFORE_CAL_LEGEND} />
        </Card>
      )}

      {/* AFTER CALENDAR */}
      {tab === 'after' && (
        <Card>
          <div style={{ fontSize: 13, fontWeight: 700, padding: '8px 14px', borderRadius: 'var(--r)', marginBottom: 14, background: 'var(--green-bg)', color: 'var(--green-t)', border: '1px solid rgba(61,214,140,.25)' }}>✓ After Plan — Live</div>
          <Calendar data={dynCal} mode="after" legend={AFTER_CAL_LEGEND} />
        </Card>
      )}

      <CompleteModal
        open={!!completeModal}
        voucher={completeModal?.voucher}
        currentDate={completeModal?.currentDate}
        currentStatus={completeModal?.currentStatus}
        dynCal={dynCal}
        onConfirm={(date, status) => {
          if (status !== completeModal.currentStatus) {
            updateStatus(completeModal.voucher, status)
          }
          if (date && status !== 'Completed' && status !== 'Cancelled') {
            markComplete(completeModal.voucher, date)
          } else if (status === 'Completed') {
            markComplete(completeModal.voucher, null)
          }
          setCompleteModal(null)
        }}
        onClose={() => setCompleteModal(null)}
      />
      <NoteModal open={!!noteModal} voucher={noteModal?.voucher} existingNote={notes[noteModal?.voucher]?.note} onSave={text => saveNote(noteModal.voucher, text)} onDelete={() => deleteNote(noteModal.voucher)} onClose={() => setNoteModal(null)} />
    </div>
  )
}

function QueueSection({ label, items, progress, borderColor, onComplete }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>{label}</span>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </div>
      {items.map((s, i) => {
        const isDone = !!progress[s.voucher_number]?.completed
        const vNum = s.voucher_number.replace('VOU', '')
        const stColors = { Contacted: 'var(--green-t)', Processing: 'var(--blue-t)', Pending: 'var(--amber-t)', Filed: 'var(--red-t)' }
        return (
          <div key={s.voucher_number} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 'var(--r)',
            border: `1px solid var(--border)`, borderLeft: `3px solid ${borderColor}`, marginBottom: 5, background: 'var(--bg3)', opacity: isDone ? 0.38 : 1,
          }}>
            <span style={{ fontSize: 11, color: 'var(--text3)', minWidth: 20 }}>{i + 1}</span>
            <a href={`https://geminiduplication.com/vouchers/session/${vNum}`} target="_blank" rel="noreferrer" style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--blue-t)' }}>{vNum}</a>
            <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 3, background: 'var(--bg4)', color: stColors[s.status] || 'var(--text2)' }}>{s.status}</span>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>{fmtDate(s.next_call_date)}</span>
              <button onClick={() => onComplete(s.voucher_number, s.next_call_date)} style={{
                width: 24, height: 24, borderRadius: 5, border: isDone ? 'none' : '1.5px solid var(--border2)',
                background: isDone ? 'var(--green)' : 'var(--bg4)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {isDone && <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><polyline points="2,6 5,9 10,3" stroke="#0f1117" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── SessionsTable Component (inline for specialist view) ──
function SessionsTable({ sessions, progress, notes, dynCal, onComplete, onNote, onStatusChange }) {
  const sorted = [...sessions].sort((a, b) => { const pa = priorityOrder(a.status), pb = priorityOrder(b.status); if (pa !== pb) return pa - pb; return (a.next_call_date || '').localeCompare(b.next_call_date || '') })
  const overdue = sorted.filter(s => s.is_overdue)
  const future = sorted.filter(s => !s.is_overdue)

  const GroupTable = ({ title, badgeColor, sessions }) => {
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
                <th style={thS}>#</th><th style={thS}>Voucher</th><th style={thS}>Status</th><th style={thS}>Next Call</th><th style={thS}>New Date</th><th style={thS}>Notes</th><th style={{ ...thS, width: 44, textAlign: 'center' }}>✓</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s, i) => {
                const p = progress[s.voucher_number]; const isDone = !!p?.completed; const nd = p?.new_call_date || ''; const ndLoad = nd && dynCal ? (dynCal[nd]?.count || 0) : 0; const ndColor = ndLoad >= 15 ? 'var(--red-t)' : ndLoad >= 12 ? 'var(--amber-t)' : 'var(--green-t)'; const ndBg = ndLoad >= 15 ? 'var(--red-bg)' : ndLoad >= 12 ? 'var(--amber-bg)' : 'var(--green-bg)'; const hasNote = !!notes?.[s.voucher_number]
                return (
                  <tr key={s.voucher_number} style={{ opacity: isDone ? 0.38 : 1 }} onMouseEnter={e => !isDone && (e.currentTarget.style.background = 'var(--bg3)')} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={tdS('var(--text3)', 11)}>{i + 1}</td>
                    <td style={tdS()}><VoucherLink voucher={s.voucher_number} /></td>
                    <td style={tdS()}>{onStatusChange ? <StatusSelect value={s.status} onChange={v => onStatusChange(s.voucher_number, v)} /> : <StatusBadge status={s.status} />}</td>
                    <td style={tdS('var(--text3)', 11)}>{fmtDate(s.next_call_date)}</td>
                    <td style={tdS()}>{nd ? <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: ndBg, color: ndColor }}>{fmtDate(nd)}</span> : <span style={{ color: 'var(--text3)' }}>—</span>}</td>
                    <td style={tdS()}><button onClick={() => onNote?.(s.voucher_number)} style={{ background: hasNote ? 'var(--amber-bg)' : 'var(--bg4)', border: `1px solid ${hasNote ? 'rgba(245,166,35,.3)' : 'var(--border2)'}`, borderRadius: 4, padding: '2px 8px', fontSize: 11, cursor: 'pointer', color: hasNote ? 'var(--amber-t)' : 'var(--text3)' }}>{hasNote ? '📝 View' : '+ Note'}</button></td>
                    <td style={{ ...tdS(), textAlign: 'center' }}><button onClick={() => onComplete?.(s.voucher_number, s.next_call_date)} style={{ width: 22, height: 22, borderRadius: 5, border: isDone ? 'none' : '1.5px solid var(--border2)', background: isDone ? 'var(--green)' : 'var(--bg3)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>{isDone && <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><polyline points="2,6 5,9 10,3" stroke="#0f1117" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (<div>{overdue.length > 0 && <GroupTable title="Overdue / Sprint List" badgeColor="var(--red-t)" sessions={overdue} />}{future.length > 0 && <GroupTable title="Upcoming" badgeColor="var(--green-t)" sessions={future} />}</div>)
}

const thS = { textAlign: 'left', padding: '6px 10px', fontSize: 11, fontWeight: 500, color: 'var(--text3)', borderBottom: '1px solid var(--border)', background: 'var(--bg3)', whiteSpace: 'nowrap' }
const tdS = (color, size) => ({ padding: '6px 10px', borderBottom: '1px solid var(--border)', verticalAlign: 'middle', ...(color ? { color } : {}), ...(size ? { fontSize: size } : {}) })

// ── TL Console (Dashboard) ──
export default function TLConsolePage() {
  const { key } = useParams()
  const specialistName = key && SPECIALIST_MAP[key] ? SPECIALIST_MAP[key] : null

  if (specialistName) return <SpecialistView name={specialistName} />

  // ── Dashboard View ──
  const { sessions, progress, loading, error, connected, reload } = useTLData()
  const [tab, setTab] = useState('dashboard')
  const [parsedFiles, setParsedFiles] = useState([])
  const [parsedRows, setParsedRows] = useState([])
  const [importing, setImporting] = useState(false)
  const [importLog, setImportLog] = useState([])
  const [importResult, setImportResult] = useState(null)
  const [backlogView, setBacklogView] = useState('week')
  const [searchSessions, setSearchSessions] = useState('')
  const [filterSpec, setFilterSpec] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [viewVouchers, setViewVouchers] = useState(null)
  const [voucherFilter, setVoucherFilter] = useState('All')

  const handleFiles = async (files) => {
    const allRows = []; const fileInfos = []
    for (const file of files) { const text = await file.text(); const rows = parseCSV(text); fileInfos.push({ name: file.name, count: rows.length }); allRows.push(...rows) }
    const seen = new Set(); const deduped = allRows.filter(r => { const v = r['Voucher Number']; if (!v || seen.has(v)) return false; seen.add(v); return true })
    setParsedFiles(fileInfos); setParsedRows(deduped); setImportResult(null); setImportLog([])
  }

  const startImport = async () => {
    if (!parsedRows.length) return; setImporting(true); const log = []; const addLog = (msg, type = 'info') => { log.push({ msg, type, ts: new Date().toLocaleTimeString() }); setImportLog([...log]) }; addLog(`Starting import of ${parsedRows.length} unique records...`)
    const records = parsedRows.map(r => { const nd = parseCSVDate(r['Next Call']); const status = r['Status'] || 'Contacted'; return { voucher_number: r['Voucher Number'], case_specialist: r['Case Specialist'] || 'Unknown', status, next_call_date: nd, updated_at: new Date().toISOString() } })
    const CHUNK = 50; let done = 0, errors = 0
    for (let i = 0; i < records.length; i += CHUNK) { const chunk = records.slice(i, i + CHUNK); const { error } = await supabase.from('voucher_sessions').upsert(chunk, { onConflict: 'voucher_number', ignoreDuplicates: false }); if (error) { errors += chunk.length; addLog(`✗ Error ${i}-${i + CHUNK}: ${error.message}`, 'error') } else { done += chunk.length; addLog(`✓ Imported ${done}/${records.length}`, 'ok') } }
    setImportResult({ done, errors }); addLog(errors === 0 ? `✓ Done! ${done} sessions imported.` : `⚠ Finished with ${errors} errors.`, errors === 0 ? 'ok' : 'warn'); setImporting(false); await reload()
  }

  const specialists = useMemo(() => [...new Set(sessions.map(s => s.case_specialist).filter(Boolean))].sort(), [sessions])
  const specSessions = useMemo(() => { if (!filterSpec) return sessions; return sessions.filter(s => s.case_specialist === filterSpec) }, [sessions, filterSpec])
  const totalSessions = specSessions.length
  const overdueSessions = specSessions.filter(s => s.is_overdue)
  const backlogLeft = overdueSessions.filter(s => !progress[s.voucher_number]?.completed).length
  const completedCount = Object.values(progress).filter(p => p.completed && specSessions.some(s => s.voucher_number === p.voucher_number)).length
  const backlogPct = overdueSessions.length ? Math.round((overdueSessions.length - backlogLeft) / overdueSessions.length * 100) : 100

  const statusBreakdown = useMemo(() => { const counts = { Contacted: 0, Processing: 0, Pending: 0, Filed: 0, Other: 0 }; specSessions.forEach(s => { if (counts[s.status] !== undefined) counts[s.status]++; else counts.Other++ }); return counts }, [specSessions])

  const specStats = useMemo(() => {
    if (!filterSpec) return specialists.map(spec => { const mine = sessions.filter(s => s.case_specialist === spec); const ov = mine.filter(s => s.is_overdue); const done = ov.filter(s => progress[s.voucher_number]?.completed).length; const left = ov.length - done; const byStatus = { Contacted: 0, Processing: 0, Pending: 0, Filed: 0 }; mine.forEach(s => { if (byStatus[s.status] !== undefined) byStatus[s.status]++ }); return { spec, total: mine.length, overdue: ov.length, done, left, byStatus } })
    return []
  }, [filterSpec, specialists, sessions, progress])

  const tlAlerts = useMemo(() => {
    const as = []; if (filterSpec) { if (backlogLeft > BACKLOG_THRESHOLD) as.push({ v: 'red', i: '⛔', title: `${filterSpec} — Backlog above threshold (${backlogLeft})`, body: 'Sprint plan needed immediately.' }); else if (backlogLeft > 15) as.push({ v: 'amber', i: '⚠', title: `${filterSpec} — Backlog warning (${backlogLeft})`, body: 'Approaching threshold.' }); if (backlogLeft === 0 && overdueSessions.length > 0) as.unshift({ v: 'green', i: '✅', title: `${filterSpec} — All backlogs cleared!`, body: 'All sessions are on track.' }) } else { specStats.forEach(({ spec, left }) => { if (left > BACKLOG_THRESHOLD) as.push({ v: 'red', i: '⛔', title: `${spec} — Backlog above threshold (${left})`, body: 'Sprint plan needed immediately.' }); else if (left > 15) as.push({ v: 'amber', i: '⚠', title: `${spec} — Backlog warning (${left})`, body: 'Approaching threshold.' }) }); const totalLeft = specStats.reduce((s, { left }) => s + left, 0); if (totalLeft === 0 && sessions.some(s => s.is_overdue)) as.unshift({ v: 'green', i: '✅', title: 'All backlogs cleared!', body: 'All specialists are on track.' }) } return as
  }, [filterSpec, backlogLeft, overdueSessions.length, specStats, sessions])

  const backlogData = useMemo(() => { const now = new Date(); const days = []; let from = new Date(now), to = new Date(now); if (backlogView === 'week') { from.setDate(now.getDate() - 3); to.setDate(now.getDate() + 10) } else if (backlogView === 'month') { from = new Date(now.getFullYear(), now.getMonth(), 1); to = new Date(now.getFullYear(), now.getMonth() + 1, 0) } for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) { const iso = format(d, 'yyyy-MM-dd'); const due = specSessions.filter(s => s.next_call_date === iso).length; const done = specSessions.filter(s => (progress[s.voucher_number]?.completed_at || '').startsWith(iso)).length; days.push({ date: iso, due, done, label: format(new Date(iso + 'T12:00'), 'MMM d') }) } return days }, [backlogView, specSessions, progress])

  const filteredSessions = useMemo(() => specSessions.filter(s => { if (filterStatus && s.status !== filterStatus) return false; if (searchSessions && !s.voucher_number.toLowerCase().includes(searchSessions.toLowerCase())) return false; return true }).slice(0, 300), [specSessions, filterStatus, searchSessions])

  const viewVouchersSessions = useMemo(() => { if (!viewVouchers) return []; return sessions.filter(s => s.case_specialist === viewVouchers) }, [viewVouchers, sessions])
  const filteredViewVouchers = useMemo(() => {
    if (voucherFilter === 'All') return viewVouchersSessions
    if (voucherFilter === 'Backlog') return viewVouchersSessions.filter(s => s.is_overdue && !progress[s.voucher_number]?.completed)
    if (voucherFilter === 'Done') return viewVouchersSessions.filter(s => progress[s.voucher_number]?.completed)
    return viewVouchersSessions.filter(s => s.status === voucherFilter)
  }, [viewVouchersSessions, voucherFilter, progress])

  const thSt = { textAlign: 'left', padding: '6px 10px', fontSize: 11, fontWeight: 500, color: 'var(--text3)', borderBottom: '1px solid var(--border)', background: 'var(--bg3)', whiteSpace: 'nowrap' }
  const tdSt = { padding: '7px 10px', borderBottom: '1px solid var(--border)', verticalAlign: 'middle' }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 16px' }}>
      <div style={{ background: 'var(--bg2)', borderRadius: 'var(--rl)', border: '1px solid var(--border)', padding: '16px 22px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ width: 42, height: 42, borderRadius: 'var(--r)', background: 'var(--purple-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>🎛</div>
        <div><div style={{ fontSize: 17, fontWeight: 700 }}>TL Console — Voucher Sessions</div><div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{loading ? 'Loading...' : error ? `Error: ${error}` : `${sessions.length} sessions · ${specialists.length} specialists`}</div></div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: connected ? 'var(--green)' : 'var(--red)' }} /><span style={{ fontSize: 11, color: 'var(--text3)' }}>{connected ? 'Connected' : 'Disconnected'}</span></div>
          <Btn variant="default" size="sm" onClick={reload}>↺ Refresh</Btn>
        </div>
      </div>

      {!filterSpec && <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)' }}>👤 Specialist:</span><select value={filterSpec} onChange={e => setFilterSpec(e.target.value)} style={{ padding: '6px 12px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', color: 'var(--text)', fontSize: 12, outline: 'none', cursor: 'pointer', fontWeight: filterSpec ? 600 : 400 }}><option value="">All Specialists ({specialists.length})</option>{specialists.map(s => <option key={s}>{s}</option>)}</select>{filterSpec && <Btn variant="default" size="sm" onClick={() => setFilterSpec('')}>✕ Clear</Btn>}</div>}

      <Tabs tabs={TABS_DASHBOARD} active={tab} onChange={setTab} />

      {tab === 'import' && (
        <div><Card style={{ marginBottom: 12 }}><div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>📤 Import Voucher Sessions</div>
          <div onClick={() => document.getElementById('csv-input').click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files) }} style={{ border: '2px dashed var(--border2)', borderRadius: 'var(--rl)', padding: 32, textAlign: 'center', cursor: 'pointer', background: 'var(--bg3)', transition: 'all .2s' }} onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--blue)'} onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border2)'}><div style={{ fontSize: 32, marginBottom: 10 }}>📁</div><div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Drop CSV files here or click to browse</div><div style={{ fontSize: 12, color: 'var(--text3)' }}>Expected columns: Voucher Number, Case Specialist, Status, Next Call</div></div>
          <input id="csv-input" type="file" accept=".csv" multiple onChange={e => handleFiles(e.target.files)} style={{ display: 'none' }} />
          {parsedFiles.length > 0 && <div style={{ marginTop: 14 }}>{parsedFiles.map((f, i) => <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 'var(--r)', background: 'var(--bg3)', border: '1px solid var(--border)', marginBottom: 6, fontSize: 12 }}><span>📄</span><span style={{ flex: 1, fontWeight: 500 }}>{f.name}</span><span style={{ color: 'var(--text3)' }}>{f.count} rows</span><span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 3, background: 'var(--green-bg)', color: 'var(--green-t)' }}>Ready</span></div>)}
            {parsedRows.length > 0 && <div style={{ padding: '10px 14px', borderRadius: 'var(--r)', background: 'var(--blue-bg)', border: '1px solid rgba(79,142,247,.2)', fontSize: 12, color: 'var(--blue-t)', marginBottom: 12 }}>Ready to import <strong>{parsedRows.length}</strong> unique sessions</div>}
            <Btn variant="success" onClick={startImport} disabled={importing || !parsedRows.length}>{importing ? '⏳ Importing...' : `⬆ Import ${parsedRows.length} sessions to Supabase`}</Btn></div>}
          {importResult && <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 'var(--r)', background: importResult.errors === 0 ? 'var(--green-bg)' : 'var(--amber-bg)', border: `1px solid ${importResult.errors === 0 ? 'rgba(61,214,140,.2)' : 'rgba(245,166,35,.2)'}`, fontSize: 12, color: importResult.errors === 0 ? 'var(--green-t)' : 'var(--amber-t)' }}>{importResult.errors === 0 ? `✅ Imported ${importResult.done} sessions` : `⚠ Imported ${importResult.done}, ${importResult.errors} errors`}</div>}
          {importLog.length > 0 && <div style={{ marginTop: 10, maxHeight: 180, overflowY: 'auto', fontFamily: 'var(--font-mono)', fontSize: 11, background: 'var(--bg)', borderRadius: 'var(--r)', padding: 10 }}>{importLog.map((l, i) => <div key={i} style={{ color: l.type === 'ok' ? 'var(--green-t)' : l.type === 'error' ? 'var(--red-t)' : l.type === 'warn' ? 'var(--amber-t)' : 'var(--text3)', marginBottom: 2 }}><span style={{ opacity: 0.5 }}>{l.ts} </span>{l.msg}</div>)}</div>}
        </Card></div>
      )}

      {tab === 'dashboard' && (
        <div>
          {filterSpec ? (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10, marginBottom: 14 }}>
                <StatCard label="Total Sessions" value={totalSessions} variant="blue" icon="📋" />
                <StatCard label="Active Backlog" value={backlogLeft} variant="danger" icon="🔴" />
                <StatCard label="Overdue" value={overdueSessions.length} variant="warn" icon="⏰" />
                <StatCard label="Completed" value={completedCount} variant="good" icon="✅" />
              </div>
              <Card style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>📊 Status Breakdown — {filterSpec}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(100px,1fr))', gap: 8 }}>
                  {Object.entries(statusBreakdown).map(([status, count]) => { const colors = { Contacted: 'var(--green-t)', Processing: 'var(--blue-t)', Pending: 'var(--amber-t)', Filed: 'var(--red-t)', Other: 'var(--text3)' }; return <div key={status} style={{ textAlign: 'center', background: 'var(--bg3)', borderRadius: 'var(--r)', padding: '10px 8px' }}><div style={{ fontSize: 20, fontWeight: 700, color: colors[status], fontFamily: 'var(--font-mono)' }}>{count}</div><div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{status}</div></div> })}
                </div>
              </Card>
              <Card><div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>📊 Backlog Progress</div><div style={{ height: 8, background: 'var(--bg4)', borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}><div style={{ height: '100%', width: `${backlogPct}%`, background: backlogPct >= 80 ? 'var(--green)' : backlogPct >= 50 ? 'var(--amber)' : 'var(--red)', borderRadius: 4, transition: 'width .5s' }} /></div><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text3)' }}><span>{backlogPct}% cleared</span><span>{backlogLeft} remaining</span></div></Card>
            </div>
          ) : (
            <div>
              <Card style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>📊 Total Summary — All Specialists</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(100px,1fr))', gap: 8, marginBottom: 12 }}>
                  {[['Total', sessions.length, 'var(--text)'], ['Contacted', sessions.filter(s => s.status === 'Contacted').length, 'var(--green-t)'], ['Processing', sessions.filter(s => s.status === 'Processing').length, 'var(--blue-t)'], ['Pending', sessions.filter(s => s.status === 'Pending').length, 'var(--amber-t)'], ['Filed', sessions.filter(s => s.status === 'Filed').length, 'var(--red-t)'], ['Backlog', specStats.reduce((s, { left }) => s + left, 0), 'var(--red-t)']].map(([lbl, val, clr]) => <div key={lbl} style={{ textAlign: 'center', background: 'var(--bg3)', borderRadius: 'var(--r)', padding: '10px 8px' }}><div style={{ fontSize: 20, fontWeight: 700, color: clr, fontFamily: 'var(--font-mono)' }}>{val}</div><div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{lbl}</div></div>)}
                </div>
              </Card>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 10 }}>
                {specStats.map(({ spec, total, overdue, done, left, byStatus }) => {
                  const pct = overdue ? Math.round(done / overdue * 100) : 100
                  const color = pct >= 80 ? 'var(--green)' : pct >= 50 ? 'var(--amber)' : 'var(--red)'
                  const isViewing = viewVouchers === spec
                  const openVouchers = (status) => { setViewVouchers(spec); setVoucherFilter(status) }
                  const statusMap = { 'Backlog': 'Backlog', 'Done': 'Done', 'Total': 'All' }
                  return (
                  <Card key={spec} style={{ cursor: 'pointer', border: isViewing ? '2px solid var(--blue)' : '1px solid var(--border)' }} onClick={() => openVouchers('All')}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}><span style={{ fontSize: 13, fontWeight: 700 }}>👤 {spec}</span><span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 3, background: left > 25 ? 'var(--red-bg)' : left > 10 ? 'var(--amber-bg)' : 'var(--green-bg)', color: left > 25 ? 'var(--red-t)' : left > 10 ? 'var(--amber-t)' : 'var(--green-t)' }}>{left > 25 ? '⛔' : left > 10 ? '⚠' : '✓'} {left} left</span></div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 4, marginBottom: 10 }}>{Object.entries(byStatus).map(([st, cnt]) => { const stColors = { Contacted: 'var(--green-t)', Processing: 'var(--blue-t)', Pending: 'var(--amber-t)', Filed: 'var(--red-t)' }; return <div key={st} style={{ textAlign: 'center', background: 'var(--bg4)', borderRadius: 4, padding: '4px 2px', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); openVouchers(st) }} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'} onMouseLeave={e => e.currentTarget.style.background = 'var(--bg4)'}><div style={{ fontSize: 12, fontWeight: 700, color: stColors[st], fontFamily: 'var(--font-mono)' }}>{cnt}</div><div style={{ fontSize: 8, color: 'var(--text3)', textTransform: 'uppercase' }}>{st.slice(0, 3)}</div></div> })}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, marginBottom: 10 }}>{[['Backlog', left, 'var(--red-t)'], ['Done', done, 'var(--green-t)'], ['Total', total, 'var(--text)']].map(([lbl, val, clr]) => <div key={lbl} style={{ textAlign: 'center', background: 'var(--bg3)', borderRadius: 'var(--r)', padding: '6px 4px', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); openVouchers(statusMap[lbl]) }} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg4)'} onMouseLeave={e => e.currentTarget.style.background = 'var(--bg3)'}><div style={{ fontSize: 16, fontWeight: 700, color: clr, fontFamily: 'var(--font-mono)' }}>{val}</div><div style={{ fontSize: 10, color: 'var(--text3)' }}>{lbl}</div></div>)}</div>
                    <div style={{ height: 5, background: 'var(--bg4)', borderRadius: 3, overflow: 'hidden' }}><div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width .5s' }} /></div>
                  </Card>)})}
              </div>
              {viewVouchers && (
                <Card style={{ marginTop: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}><div><div style={{ fontSize: 13, fontWeight: 700 }}>📋 {viewVouchers} — Voucher Breakdown{voucherFilter !== 'All' ? ` (${voucherFilter})` : ''}</div><div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Click a voucher number to open it · Click any stat box above to filter</div></div><Btn variant="default" size="sm" onClick={e => { e.stopPropagation(); setViewVouchers(null) }}>✕ Close</Btn></div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12 }}>{['All', 'Backlog', 'Done', 'Contacted', 'Processing', 'Pending', 'Filed'].map(st => { const isActive = voucherFilter === st; const count = st === 'All' ? viewVouchersSessions.length : st === 'Backlog' ? viewVouchersSessions.filter(s => s.is_overdue && !progress[s.voucher_number]?.completed).length : st === 'Done' ? viewVouchersSessions.filter(s => progress[s.voucher_number]?.completed).length : viewVouchersSessions.filter(s => s.status === st).length; return <button key={st} onClick={() => setVoucherFilter(st)} style={{ padding: '4px 12px', fontSize: 11, borderRadius: 20, border: '1px solid var(--border2)', background: isActive ? 'var(--text)' : 'var(--bg3)', color: isActive ? 'var(--bg)' : 'var(--text2)', cursor: 'pointer', fontWeight: isActive ? 600 : 400 }}>{st} ({count})</button> })}</div>
                  <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}><thead><tr><th style={thSt}>#</th><th style={thSt}>Voucher</th><th style={thSt}>Status</th><th style={thSt}>Next Call</th><th style={thSt}>Overdue</th></tr></thead><tbody>{filteredViewVouchers.map((s, i) => <tr key={s.voucher_number} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}><td style={tdSt}>{i + 1}</td><td style={tdSt}><VoucherLink voucher={s.voucher_number} /></td><td style={tdSt}><StatusBadge status={s.status} /></td><td style={{ ...tdSt, fontSize: 11, color: 'var(--text3)' }}>{s.next_call_date || '—'}</td><td style={tdSt}>{s.is_overdue ? <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 3, background: 'var(--red-bg)', color: 'var(--red-t)' }}>Yes</span> : <span style={{ color: 'var(--text3)' }}>—</span>}</td></tr>)}</tbody></table>
                  </div>
                </Card>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'alerts' && <Card><div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>🚨 Active Alerts</div>{tlAlerts.length === 0 ? <div style={{ textAlign: 'center', padding: 32, color: 'var(--text3)', fontSize: 13 }}>✅ No active alerts — all sessions on track</div> : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{tlAlerts.map((a, i) => <Alert key={i} variant={a.v} icon={a.i} title={a.title}>{a.body}</Alert>)}</div>}</Card>}

      {tab === 'backlog' && <Card><div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}><span style={{ fontSize: 13, fontWeight: 700 }}>📈 Call Load by Day</span><div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>{['week', 'month'].map(v => <button key={v} onClick={() => setBacklogView(v)} style={{ padding: '5px 14px', borderRadius: 20, border: '1px solid var(--border2)', fontSize: 11, cursor: 'pointer', background: backlogView === v ? 'var(--text)' : 'var(--bg3)', color: backlogView === v ? 'var(--bg)' : 'var(--text2)' }}>{v.charAt(0).toUpperCase() + v.slice(1)}</button>)}</div></div><ResponsiveContainer width="100%" height={180}><BarChart data={backlogData} margin={{ top: 4, right: 4, bottom: 4, left: -20 }}><XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text3)' }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 10, fill: 'var(--text3)' }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 8, fontSize: 12 }} /><Bar dataKey="due" name="Due" radius={[3, 3, 0, 0]}>{backlogData.map((d) => <Cell key={d.date} fill={d.due >= 15 ? 'var(--red)' : d.due >= 10 ? 'var(--amber)' : 'var(--green)'} />)}</Bar></BarChart></ResponsiveContainer></Card>}

      {tab === 'sessions' && <Card><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}><input value={searchSessions} onChange={e => setSearchSessions(e.target.value)} placeholder="Search voucher..." style={{ padding: '6px 10px', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 'var(--r)', color: 'var(--text)', fontSize: 12, outline: 'none', width: 200 }} /><select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ padding: '6px 10px', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 'var(--r)', color: 'var(--text)', fontSize: 12, outline: 'none' }}><option value="">All Status</option><option>Contacted</option><option>Processing</option><option>Pending</option><option>Filed</option></select><span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 'auto' }}>{filteredSessions.length} sessions</span></div><div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}><thead><tr>{['Voucher', 'Specialist', 'Status', 'Next Call', 'Overdue', 'Done', 'New Date'].map(h => <th key={h} style={thSt}>{h}</th>)}</tr></thead><tbody>{filteredSessions.map(s => { const p = progress[s.voucher_number]; return <tr key={s.voucher_number} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}><td style={tdSt}><VoucherLink voucher={s.voucher_number} /></td><td style={{ ...tdSt, fontSize: 11, color: 'var(--text2)' }}>{s.case_specialist}</td><td style={tdSt}><StatusBadge status={s.status} /></td><td style={{ ...tdSt, fontSize: 11, color: 'var(--text3)' }}>{s.next_call_date || '—'}</td><td style={tdSt}>{s.is_overdue ? <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 3, background: 'var(--red-bg)', color: 'var(--red-t)' }}>Overdue</span> : '—'}</td><td style={tdSt}>{p?.completed ? <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 3, background: 'var(--green-bg)', color: 'var(--green-t)' }}>✓ Done</span> : '—'}</td><td style={{ ...tdSt, fontSize: 11, color: 'var(--green-t)', fontFamily: 'var(--font-mono)' }}>{p?.new_call_date || '—'}</td></tr> })}</tbody></table>{filteredSessions.length === 300 && <div style={{ fontSize: 11, color: 'var(--text3)', padding: 8 }}>Showing first 300. Use filters to narrow down.</div>}</div></Card>}
    </div>
  )
}
