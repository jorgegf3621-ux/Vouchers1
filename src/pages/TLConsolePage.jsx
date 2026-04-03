import React, { useState, useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useTLData } from '../hooks/useData'
import { parseCSV, parseCSVDate, BACKLOG_THRESHOLD, TODAY_ISO, detectSnowball } from '../lib/sprint'
import { Card, Tabs, Alert, StatCard, Btn, StatusBadge } from '../components/ui'
import { VoucherLink } from '../components/SessionsTable'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

const TABS = [
  { key: 'import', icon: '📤', label: 'Import CSV' },
  { key: 'dashboard', icon: '📊', label: 'Dashboard' },
  { key: 'alerts', icon: '🚨', label: 'Alerts' },
  { key: 'backlog', icon: '📈', label: 'Backlog' },
  { key: 'sessions', icon: '📋', label: 'Sessions' },
]

export default function TLConsolePage() {
  const { sessions, progress, loading, error, connected, reload } = useTLData()
  const [tab, setTab] = useState('import')
  const [parsedFiles, setParsedFiles] = useState([])
  const [parsedRows, setParsedRows] = useState([])
  const [importing, setImporting] = useState(false)
  const [importLog, setImportLog] = useState([])
  const [importResult, setImportResult] = useState(null)
  const [backlogView, setBacklogView] = useState('week')
  const [searchSessions, setSearchSessions] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  // ── CSV HANDLING ──
  const handleFiles = async (files) => {
    const allRows = []
    const fileInfos = []
    for (const file of files) {
      const text = await file.text()
      const rows = parseCSV(text)
      fileInfos.push({ name: file.name, count: rows.length })
      allRows.push(...rows)
    }
    const seen = new Set()
    const deduped = allRows.filter(r => {
      const v = r['Voucher Number']
      if (!v || seen.has(v)) return false
      seen.add(v); return true
    })
    setParsedFiles(fileInfos)
    setParsedRows(deduped)
    setImportResult(null)
    setImportLog([])
  }

  const startImport = async () => {
    if (!parsedRows.length) return
    setImporting(true)
    const log = []
    const addLog = (msg, type = 'info') => { log.push({ msg, type, ts: new Date().toLocaleTimeString() }); setImportLog([...log]) }

    addLog(`Starting import of ${parsedRows.length} unique records...`)

    const records = parsedRows.map(r => {
      const nd = parseCSVDate(r['Next Call'])
      const status = r['Status'] || 'Contacted'
      const isOverdueStatus = ['Pending', 'Contacted', 'Filed'].includes(status)
      return {
        voucher_number: r['Voucher Number'],
        status,
        next_call_date: nd,
        is_overdue: isOverdueStatus && nd ? nd <= TODAY_ISO : false,
        updated_at: new Date().toISOString(),
      }
    })

    const CHUNK = 50
    let done = 0, errors = 0
    for (let i = 0; i < records.length; i += CHUNK) {
      const chunk = records.slice(i, i + CHUNK)
      const { error } = await supabase.from('voucher_sessions').upsert(chunk, { onConflict: 'voucher_number', ignoreDuplicates: false })
      if (error) { errors += chunk.length; addLog(`✗ Error ${i}-${i + CHUNK}: ${error.message}`, 'error') }
      else { done += chunk.length; addLog(`✓ Imported ${done}/${records.length}`, 'ok') }
    }

    setImportResult({ done, errors })
    addLog(errors === 0 ? `✓ Done! ${done} sessions imported.` : `⚠ Finished with ${errors} errors.`, errors === 0 ? 'ok' : 'warn')
    setImporting(false)
    await reload()
  }

  // ── DASHBOARD ──
  const totalSessions = sessions.length
  const overdueSessions = sessions.filter(s => s.is_overdue)
  const backlogSessions = sessions.filter(s => s.is_overdue && s.status !== 'Filed')
  const completedCount = Object.values(progress).filter(p => p.completed).length
  const backlogLeft = backlogSessions.filter(s => !progress[s.voucher_number]?.completed).length
  const backlogPct = backlogSessions.length ? Math.round(completedCount / backlogSessions.length * 100) : 100

  // ── ALERTS ──
  const tlAlerts = useMemo(() => {
    const as = []
    if (backlogLeft > BACKLOG_THRESHOLD) as.push({ v: 'red', i: '⛔', title: `Backlog above threshold (${backlogLeft})`, body: 'Sprint plan needed immediately.' })
    else if (backlogLeft > 15) as.push({ v: 'amber', i: '⚠', title: `Backlog warning (${backlogLeft})`, body: 'Approaching threshold.' })
    if (backlogLeft === 0 && overdueSessions.length > 0) as.unshift({ v: 'green', i: '✅', title: 'All backlogs cleared!', body: 'All sessions are on track.' })
    return as
  }, [backlogLeft, overdueSessions.length])

  // ── BACKLOG CHART ──
  const backlogData = useMemo(() => {
    const now = new Date()
    const days = []
    let from = new Date(now), to = new Date(now)
    if (backlogView === 'week') { from.setDate(now.getDate() - 3); to.setDate(now.getDate() + 10) }
    else if (backlogView === 'month') { from = new Date(now.getFullYear(), now.getMonth(), 1); to = new Date(now.getFullYear(), now.getMonth() + 1, 0) }
    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      const iso = format(d, 'yyyy-MM-dd')
      const due = sessions.filter(s => s.next_call_date === iso).length
      const done = sessions.filter(s => (progress[s.voucher_number]?.completed_at || '').startsWith(iso)).length
      days.push({ date: iso, due, done, label: format(new Date(iso + 'T12:00'), 'MMM d') })
    }
    return days
  }, [backlogView, sessions, progress])

  // ── SESSIONS TABLE ──
  const filteredSessions = useMemo(() => {
    return sessions.filter(s => {
      if (filterStatus && s.status !== filterStatus) return false
      if (searchSessions && !s.voucher_number.toLowerCase().includes(searchSessions.toLowerCase())) return false
      return true
    }).slice(0, 300)
  }, [sessions, filterStatus, searchSessions])

  const snowball = detectSnowball({})

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 16px' }}>

      {/* Header */}
      <div style={{ background: 'var(--bg2)', borderRadius: 'var(--rl)', border: '1px solid var(--border)', padding: '16px 22px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ width: 42, height: 42, borderRadius: 'var(--r)', background: 'var(--purple-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>🎛</div>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700 }}>TL Console — Voucher Sessions</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
            {loading ? 'Loading...' : error ? `Error: ${error}` : `${totalSessions} sessions`}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: connected ? 'var(--green)' : 'var(--red)' }} />
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>{connected ? 'Connected' : 'Disconnected'}</span>
          </div>
          <Btn variant="default" size="sm" onClick={reload}>↺ Refresh</Btn>
        </div>
      </div>

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {/* IMPORT */}
      {tab === 'import' && (
        <div>
          <Card style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>📤 Import Voucher Sessions</div>

            <div
              onClick={() => document.getElementById('csv-input').click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files) }}
              style={{ border: '2px dashed var(--border2)', borderRadius: 'var(--rl)', padding: 32, textAlign: 'center', cursor: 'pointer', background: 'var(--bg3)', transition: 'all .2s' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--blue)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border2)'}
            >
              <div style={{ fontSize: 32, marginBottom: 10 }}>📁</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Drop CSV files here or click to browse</div>
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>Expected columns: Voucher Number, Status, Next Call</div>
            </div>
            <input id="csv-input" type="file" accept=".csv" multiple onChange={e => handleFiles(e.target.files)} style={{ display: 'none' }} />

            {parsedFiles.length > 0 && (
              <div style={{ marginTop: 14 }}>
                {parsedFiles.map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 'var(--r)', background: 'var(--bg3)', border: '1px solid var(--border)', marginBottom: 6, fontSize: 12 }}>
                    <span>📄</span>
                    <span style={{ flex: 1, fontWeight: 500 }}>{f.name}</span>
                    <span style={{ color: 'var(--text3)' }}>{f.count} rows</span>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 3, background: 'var(--green-bg)', color: 'var(--green-t)' }}>Ready</span>
                  </div>
                ))}

                {parsedRows.length > 0 && (
                  <div style={{ padding: '10px 14px', borderRadius: 'var(--r)', background: 'var(--blue-bg)', border: '1px solid rgba(79,142,247,.2)', fontSize: 12, color: 'var(--blue-t)', marginBottom: 12 }}>
                    Ready to import <strong>{parsedRows.length}</strong> unique sessions
                  </div>
                )}

                <Btn variant="success" onClick={startImport} disabled={importing || !parsedRows.length}>
                  {importing ? '⏳ Importing...' : `⬆ Import ${parsedRows.length} sessions to Supabase`}
                </Btn>
              </div>
            )}

            {importResult && (
              <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 'var(--r)', background: importResult.errors === 0 ? 'var(--green-bg)' : 'var(--amber-bg)', border: `1px solid ${importResult.errors === 0 ? 'rgba(61,214,140,.2)' : 'rgba(245,166,35,.2)'}`, fontSize: 12, color: importResult.errors === 0 ? 'var(--green-t)' : 'var(--amber-t)' }}>
                {importResult.errors === 0 ? `✅ Imported ${importResult.done} sessions` : `⚠ Imported ${importResult.done}, ${importResult.errors} errors`}
              </div>
            )}

            {importLog.length > 0 && (
              <div style={{ marginTop: 10, maxHeight: 180, overflowY: 'auto', fontFamily: 'var(--font-mono)', fontSize: 11, background: 'var(--bg)', borderRadius: 'var(--r)', padding: 10 }}>
                {importLog.map((l, i) => (
                  <div key={i} style={{ color: l.type === 'ok' ? 'var(--green-t)' : l.type === 'error' ? 'var(--red-t)' : l.type === 'warn' ? 'var(--amber-t)' : 'var(--text3)', marginBottom: 2 }}>
                    <span style={{ opacity: 0.5 }}>{l.ts} </span>{l.msg}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* DASHBOARD */}
      {tab === 'dashboard' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10, marginBottom: 14 }}>
            <StatCard label="Total Sessions" value={totalSessions} variant="blue" icon="📋" />
            <StatCard label="Active Backlog" value={backlogLeft} variant="danger" icon="🔴" />
            <StatCard label="Overdue Total" value={overdueSessions.length} variant="warn" icon="⏰" />
            <StatCard label="Completed" value={completedCount} variant="good" icon="✅" />
          </div>

          <Card>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>📊 Backlog Progress</div>
            <div style={{ height: 8, background: 'var(--bg4)', borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
              <div style={{ height: '100%', width: `${backlogPct}%`, background: backlogPct >= 80 ? 'var(--green)' : backlogPct >= 50 ? 'var(--amber)' : 'var(--red)', borderRadius: 4, transition: 'width .5s' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text3)' }}>
              <span>{backlogPct}% cleared</span>
              <span>{backlogLeft} remaining</span>
            </div>
          </Card>
        </div>
      )}

      {/* ALERTS */}
      {tab === 'alerts' && (
        <Card>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>🚨 Active Alerts</div>
          {tlAlerts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text3)', fontSize: 13 }}>✅ No active alerts — all sessions on track</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {tlAlerts.map((a, i) => <Alert key={i} variant={a.v} icon={a.i} title={a.title}>{a.body}</Alert>)}
            </div>
          )}
        </Card>
      )}

      {/* BACKLOG CHART */}
      {tab === 'backlog' && (
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>📈 Call Load by Day</span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              {['week', 'month'].map(v => (
                <button key={v} onClick={() => setBacklogView(v)} style={{
                  padding: '5px 14px', borderRadius: 20, border: '1px solid var(--border2)', fontSize: 11, cursor: 'pointer',
                  background: backlogView === v ? 'var(--text)' : 'var(--bg3)', color: backlogView === v ? 'var(--bg)' : 'var(--text2)',
                }}>{v.charAt(0).toUpperCase() + v.slice(1)}</button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={backlogData} margin={{ top: 4, right: 4, bottom: 4, left: -20 }}>
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text3)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text3)' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="due" name="Due" radius={[3, 3, 0, 0]}>
                {backlogData.map((d) => (
                  <Cell key={d.date} fill={d.due >= 15 ? 'var(--red)' : d.due >= 10 ? 'var(--amber)' : 'var(--green)'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* ALL SESSIONS */}
      {tab === 'sessions' && (
        <Card>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
            <input value={searchSessions} onChange={e => setSearchSessions(e.target.value)} placeholder="Search voucher..."
              style={{ padding: '6px 10px', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 'var(--r)', color: 'var(--text)', fontSize: 12, outline: 'none', width: 200 }} />
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              style={{ padding: '6px 10px', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 'var(--r)', color: 'var(--text)', fontSize: 12, outline: 'none' }}>
              <option value="">All Status</option>
              <option>Contacted</option><option>Processing</option><option>Pending</option><option>Filed</option>
            </select>
            <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 'auto' }}>{filteredSessions.length} sessions</span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  {['Voucher', 'Status', 'Next Call', 'Overdue', 'Done', 'New Date'].map(h => (
                    <th key={h} style={thSt}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredSessions.map(s => {
                  const p = progress[s.voucher_number]
                  return (
                    <tr key={s.voucher_number}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <td style={tdSt}><VoucherLink voucher={s.voucher_number} /></td>
                      <td style={tdSt}><StatusBadge status={s.status} /></td>
                      <td style={{ ...tdSt, fontSize: 11, color: 'var(--text3)' }}>{s.next_call_date || '—'}</td>
                      <td style={tdSt}>{s.is_overdue ? <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 3, background: 'var(--red-bg)', color: 'var(--red-t)' }}>Overdue</span> : '—'}</td>
                      <td style={tdSt}>{p?.completed ? <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 3, background: 'var(--green-bg)', color: 'var(--green-t)' }}>✓ Done</span> : '—'}</td>
                      <td style={{ ...tdSt, fontSize: 11, color: 'var(--green-t)', fontFamily: 'var(--font-mono)' }}>{p?.new_call_date || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {filteredSessions.length === 300 && <div style={{ fontSize: 11, color: 'var(--text3)', padding: 8 }}>Showing first 300. Use filters to narrow down.</div>}
          </div>
        </Card>
      )}
    </div>
  )
}

const thSt = { textAlign: 'left', padding: '6px 10px', fontSize: 11, fontWeight: 500, color: 'var(--text3)', borderBottom: '1px solid var(--border)', background: 'var(--bg3)', whiteSpace: 'nowrap' }
const tdSt = { padding: '7px 10px', borderBottom: '1px solid var(--border)', verticalAlign: 'middle' }
