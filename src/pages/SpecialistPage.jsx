import React, { useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useSpecialistData } from '../hooks/useData'
import { buildSprintPlan, detectSnowball, CAP_DAY, TODAY_ISO, fmtDate, priorityOrder } from '../lib/sprint'
import { Card, Tabs, Alert, StatCard, SyncStatus, ProgressBar, StatusBadge } from '../components/ui'
import { VoucherLink, StatusSelect } from '../components/SessionsTable'
import { CompleteModal, NoteModal } from '../components/SessionModals'
import SprintPlan from '../components/SprintPlan'
import Calendar from '../components/Calendar'
import DailyScheduler from '../components/DailyScheduler'

const SPECIALIST_MAP = {
  'alejandro-guerrero': 'Alejandro Guerrero',
  'fidel-sanchez': 'Fidel Sanchez',
  'jonathan-flores': 'Jonathan Flores',
  'jose-angel-aleman': 'Jose Angel Aleman',
  'juno-urdiales': 'Juno Urdiales',
  'luis-gallegos': 'Luis Gallegos',
}

const TABS = [
  { key: 'queue', icon: '📞', label: "Today's Queue" },
  { key: 'schedule', icon: '📅', label: 'Schedule' },
  { key: 'escalated', icon: '⚡', label: 'Escalated' },
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

export default function SpecialistPage() {
  const { key } = useParams()
  const name = SPECIALIST_MAP[key]
  if (!name) return <div style={{ padding: 32, color: 'var(--text3)', textAlign: 'center' }}>Specialist not found</div>

  return <SpecialistView name={name} />
}

function SpecialistView({ name }) {
  const { sessions, progress, notes, syncState, markComplete, undoComplete, updateStatus, saveNote, deleteNote, reload } = useSpecialistData(name)
  const [tab, setTab] = useState('queue')
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [completeModal, setCompleteModal] = useState(null)
  const [noteModal, setNoteModal] = useState(null)
  const [snowballDays, setSnowballDays] = useState([]) // Highlighted days from snowball alert

  const overdue = useMemo(() => sessions.filter(s => s.is_overdue), [sessions])
  const future = useMemo(() => sessions.filter(s => !s.is_overdue), [sessions])
  const sprint = useMemo(() => buildSprintPlan(overdue, future), [overdue, future])

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

    // Daily progress alert
    const todayCompleted = sessions.filter(s => (progress[s.voucher_number]?.completed_at || '').startsWith(TODAY_ISO)).length
    const todayScheduled = sprintToday.length + schedToday.length
    if (todayScheduled > 0) {
      const pct = Math.round(todayCompleted / todayScheduled * 100)
      if (pct >= 80) as.push({ v: 'green', i: '🏃', title: `Today's pace — On track (${todayCompleted}/${todayScheduled})`, body: `${pct}% of today's calls completed. Keep it up!` })
      else if (pct >= 50) as.push({ v: 'amber', i: '⏳', title: `Today's pace — Behind (${todayCompleted}/${todayScheduled})`, body: `${pct}% completed. ${todayScheduled - todayCompleted} calls remaining.` })
      else if (todayCompleted === 0) as.push({ v: 'red', i: '⚠', title: `Today's pace — Not started (${todayScheduled} scheduled)`, body: 'No calls completed yet today. Get started!' })
      else as.push({ v: 'red', i: '🔴', title: `Today's pace — Falling behind (${todayCompleted}/${todayScheduled})`, body: `Only ${pct}% done. ${todayScheduled - todayCompleted} calls left.` })
    }
    const snowball = detectSnowball(dynCal)
    if (snowball) {
      const dateStr = snowball.days.map(d => fmtDate(d)).join(', ')
      as.push({ v: 'red', i: '📈', title: `Snowball — ${snowball.count} consecutive heavy days`, body: `${dateStr}. Redistribute sessions now.`, clickable: true })
    }
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
      {/* Header */}
      <div style={{ background: 'var(--bg2)', borderRadius: 'var(--rl)', border: '1px solid var(--border)', padding: '16px 20px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ width: 40, height: 40, borderRadius: 'var(--r)', background: 'var(--blue-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>👤</div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{name}</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Voucher Sessions · {dateLabel}</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <StatCard label="Backlog" value={overdueLeft} variant="danger" />
          <StatCard label="Due Today" value={Math.min(sprintToday.length + schedToday.length, CAP_DAY)} variant="warn" />
          <StatCard label="Done" value={totalDone} variant="good" />
          <StatCard label="Total" value={sessions.length} />
          <Link to="/" style={{ fontSize: 11, color: 'var(--text3)', textDecoration: 'none', padding: '4px 8px', borderRadius: 'var(--r)', background: 'var(--bg3)' }}>🏠 Dashboard</Link>
        </div>
      </div>

      <div style={{ marginBottom: 12 }}><SyncStatus {...syncState} /></div>

      {alerts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
          {alerts.map((a, i) => (
            <div key={i} onClick={() => { if (a.clickable) { setTab('before'); const sb = detectSnowball(dynCal); if (sb) setSnowballDays(sb.days) } }}
              style={a.clickable ? { cursor: 'pointer' } : {}}>
              <Alert variant={a.v} icon={a.i} title={a.title}>{a.body}{a.clickable && ' (click to view)'}</Alert>
            </div>
          ))}
        </div>
      )}

      {sprint && <SprintPlan sprint={sprint} />}

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

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

      {/* SCHEDULE */}
      {tab === 'schedule' && (
        <Card>
          <DailyScheduler sessions={sessions} progress={progress} onComplete={handleComplete} />
        </Card>
      )}

      {/* ESCALATED / RUSHED */}
      {tab === 'escalated' && (
        <Card>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16 }}>⚡</span>
            <span>Escalated & Rushed Cases</span>
            <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 3, background: 'var(--red-bg)', color: 'var(--red-t)' }}>Priority</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 12 }}>
            Cases flagged as escalated or rushed require immediate attention.
          </div>
          <EscalatedList sessions={sessions} progress={progress} onComplete={handleComplete} />
        </Card>
      )}
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
          <Calendar data={beforeCal} mode="before" legend={BEFORE_CAL_LEGEND} highlightDays={snowballDays} />
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
        onConfirm={(date, status, note) => {
          if (status !== completeModal.currentStatus) {
            updateStatus(completeModal.voucher, status)
          }
          if (date && status !== 'Completed' && status !== 'Cancelled') {
            markComplete(completeModal.voucher, date)
          } else if (status === 'Completed') {
            markComplete(completeModal.voucher, null)
          }
          if (note && note.trim()) {
            saveNote(completeModal.voucher, note.trim())
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

function EscalatedList({ sessions, progress, onComplete }) {
  const escalated = sessions.filter(s => (s.escalated || s.rushed) && !progress[s.voucher_number]?.completed)
    .sort((a, b) => {
      if (a.escalated && !b.escalated) return -1
      if (!a.escalated && b.escalated) return 1
      return (a.next_call_date || '').localeCompare(b.next_call_date || '')
    })

  if (escalated.length === 0) {
    return <div style={{ textAlign: 'center', padding: 32, color: 'var(--text3)', fontSize: 13 }}>✅ No escalated or rushed cases!</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {escalated.map((s, i) => {
        const isDone = !!progress[s.voucher_number]?.completed
        const vNum = s.voucher_number.replace('VOU', '')
        const tags = []
        if (s.escalated) tags.push({ label: 'ESCALATED', color: 'var(--red-t)', bg: 'var(--red-bg)' })
        if (s.rushed) tags.push({ label: 'RUSHED', color: 'var(--amber-t)', bg: 'var(--amber-bg)' })
        return (
          <div key={s.voucher_number} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 'var(--r)',
            border: '1px solid var(--border)', borderLeft: `3px solid ${s.escalated ? 'var(--red-t)' : 'var(--amber-t)'}`, background: 'var(--bg3)', opacity: isDone ? 0.38 : 1,
          }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: s.escalated ? 'var(--red-t)' : 'var(--amber-t)', minWidth: 20 }}>⚡{i + 1}</span>
            <a href={`https://geminiduplication.com/vouchers/session/${vNum}`} target="_blank" rel="noreferrer" style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--blue-t)' }}>{vNum}</a>
            <StatusBadge status={s.status} />
            {tags.map((t, j) => (
              <span key={j} style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 3, background: t.bg, color: t.color, letterSpacing: '.5px' }}>{t.label}</span>
            ))}
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>{fmtDate(s.next_call_date)}</span>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
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
