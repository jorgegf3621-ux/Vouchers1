import React, { useState, useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useTLData } from '../hooks/useData'
import { parseCSV, parseCSVDate, BACKLOG_THRESHOLD, TODAY_ISO, detectSnowball } from '../lib/sprint'
import { Card, Tabs, Alert, StatCard, Btn } from '../components/ui'
import { VoucherLink, StatusBadge } from '../components/SessionsTable'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

const TABS = [
  { key: 'import', icon: '📤', label: 'Import CSV' },
  { key: 'dashboard', icon: '📊', label: 'Dashboard' },
  { key: 'alerts', icon: '🚨', label: 'Alerts' },
  { key: 'backlog', icon: '📈', label: 'Backlog' },
  { key: 'sessions', icon: '📋', label: 'Sessions' },
]

export default function TLConsolePage() {
  const { sessions, progress, batches, loading, error, connected, reload, reloadBatches } = useTLData()
  const [tab, setTab] = useState('import')
  const [parsedFiles, setParsedFiles] = useState([])
  const [parsedRows, setParsedRows] = useState([])
  const [importing, setImporting] = useState(false)
  const [importLog, setImportLog] = useState([])
  const [importResult, setImportResult] = useState(null)
  const [backlogView, setBacklogView] = useState('week')
  const [searchSessions, setSearchSessions] = useState('')
  const [filterSpec, setFilterSpec] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  // ── CSV HANDLING ──
  const handleFiles = async (files) => {
    const allRows = []
    const fileInfos = []
    for (const file of files) {
      const text = await file.text()
      const rows = parseCSV(text)
      const specs = [...new Set(rows.map(r => r['Case Specialist']).filter(Boolean))]
      fileInfos.push({ name: file.name, count: rows.length, specs })
      allRows.push(...rows.map(r => ({ ...r, _file: file.name })))
    }
    // Deduplicate
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

    const batchId = 'batch_' + Date.now()
    addLog(`Starting import of ${parsedRows.length} unique records...`)

    const records = parsedRows.map(r => {
      const nd = parseCSVDate(r['Next Call'])
      return {
        voucher_number: r['Voucher Number'],
        case_number: r['Case Number'] || null,
        applicant: r['Applicant'] || null,
        case_specialist: r['Case Specialist'] || 'Unknown',
        billing_entity: r['Billing Entity'] || null,
        account: r['Account'] || null,
        status: r['Status'] || 'Contacted',
        next_call_date: nd,
        is_overdue: nd ? nd <= TODAY_ISO : false,
        source_file: r['_file'],
        import_batch: batchId,
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

    const specs = [...new Set(records.map(r => r.case_specialist))]
    await supabase.from('voucher_import_batches').upsert({
      batch_id: batchId, file_names: parsedFiles.map(f => f.name),
      total_records: done, specialists: specs
    }, { onConflict: 'batch_id' })

    setImportResult({ done, errors, specs })
    addLog(errors === 0 ? `✓ Done! ${done} sessions imported.` : `⚠ Finished with ${errors} errors.`, errors === 0 ? 'ok' : 'warn')
    setImporting(false)
    await reload()
    await reloadBatches()
  }

  // ── DASHBOARD ──
  const specialists = useMemo(() => [...new Set(sessions.map(s => s.case_specialist))].sort(), [sessions])
  const specStats = useMemo(() => specialists.map(spec => {
    const mine = sessions.filter(s => s.case_specialist === spec)
    const ov = mine.filter(s => s.is_overdue)
    const done = ov.filter(s => progress[s.voucher_number]?.completed).length
    const left = ov.length - done
    const pct = ov.length ? Math.round(done / ov.length * 100) : 100
    const todayQ = Math.min(mine.filter(s => !progress[s.voucher_number]?.completed && (s.next_call_date === TODAY_ISO || s.is_overdue)).length, 15)
    return { spec, total: mine.length, ovTotal: ov.length, done, left, pct, todayQ }
  }), [specialists, sessions, progress])

  // ── ALERTS ──
  const tlAlerts = useMemo(() => {
    const as = []
    specStats.forEach(({ spec, left }) => {
      if (left > BACKLOG_THRESHOLD) as.push({ v: 'red', i: '⛔', title: `${spec} — Backlog above threshold (${left})`, body: 'Sprint plan needed immediately.' })
      else if (left > 15) as.push({ v: 'amber', i: '⚠', title: `${spec} — Backlog warning (${left})`, body: 'Approaching threshold.' })
    })
    const totalLeft = specStats.reduce((s, { left }) => s + left, 0)
    if (totalLeft === 0 && sessions.some(s => s.is_overdue)) as.unshift({ v: 'green', i: '✅', title: 'All backlogs cleared!', body: 'All specialists are on track.' })
    return as
  }, [specStats, sessions])

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
      if (filterSpec && s.case_specialist !== filterSpec) return false
      if (filterStatus && s.status !== filterStatus) return false
      if (searchSessions && !s.voucher_number.toLowerCase().includes(searchSessions.toLowerCase()) && !(s.applicant || '').toLowerCase().includes(searchSessions.toLowerCase())) return false
      return true
    }).slice(0, 300)
  }, [sessions, filterSpec, filterStatus, searchSessions])

  const totalLeft = specStats.reduce((s, { left }) => s + left, 0)
  const totalDone = Object.values(progress).filter(p => p.completed).length

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 16px' }}>

      {/* Header */}
      <div style={{ background: 'var(--bg2)', borderRadius: 'var(--rl)', border: '1px solid var(--border)', padding: '16px 22px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ width: 42, height: 42, borderRadius: 'var(--r)', background: 'var(--purple-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>🎛</div>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700 }}>TL Console — Voucher Sessions</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
            {loading ? 'Loading...' : error ? `Error: ${error}` : `${sessions.length} sessions · ${specialists.length} specialists`}
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
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>Multiple files · Auto-detects Case Specialist · Duplicates skipped</div>
            </div>
            <input id="csv-input" type="file" accept=".csv" multiple onChange={e => handleFiles(e.target.files)} style={{ display: 'none' }} />

            {parsedFiles.length > 0 && (
              <div style={{ marginTop: 14 }}>
                {parsedFiles.map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 'var(--r)', background: 'var(--bg3)', border: '1px solid var(--border)', marginBottom: 6, fontSize: 12 }}>
                    <span>📄</span>
                    <span style={{ flex: 1, fontWeight: 500 }}>{f.name}</span>
                    <span style={{ color: 'var(--text3)' }}>{f.count} rows</span>
                    <span style={{ color: 'var(--text3)', fontSize: 11 }}>{f.specs.join(', ')}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 3, background: 'var(--green-bg)', color: 'var(--green-t)' }}>Ready</span>
                  </div>
                ))}

                {parsedRows.length > 0 && (
                  <div style={{ padding: '10px 14px', borderRadius: 'var(--r)', background: 'var(--blue-bg)', border: '1px solid rgba(79,142,247,.2)', fontSize: 12, color: 'var(--blue-t)', marginBottom: 12 }}>
                    Ready to import <strong>{parsedRows.length}</strong> unique sessions · {[...new Set(parsedRows.map(r => r['Case Specialist']))].join(', ')}
                  </div>
                )}

                <Btn variant="success" onClick={startImport} disabled={importing || !parsedRows.length}>
                  {importing ? '⏳ Importing...' : `⬆ Import ${parsedRows.length} sessions to Supabase`}
                </Btn>
              </div>
            )}

            {importResult && (
              <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 'var(--r)', background: importResult.errors === 0 ? 'var(--green-bg)' : 'var(--amber-bg)', border: `1px solid ${importResult.errors === 0 ? 'rgba(61,214,140,.2)' : 'rgba(245,166,35,.2)'}`, fontSize: 12, color: importResult.errors === 0 ? 'var(--green-t)' : 'var(--amber-t)' }}>
                {importResult.errors === 0 ? `✅ Imported ${importResult.done} sessions for: ${importResult.specs.join(', ')}` : `⚠ Imported ${importResult.done}, ${importResult.errors} errors`}
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

          <Card>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              📦 Import History
              <Btn variant="default" size="sm" style={{ marginLeft: 'auto' }} onClick={reloadBatches}>↺</Btn>
            </div>
            {batches.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 24, color: 'var(--text3)', fontSize: 13 }}>No imports yet</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      {['Date', 'Files', 'Records', 'Specialists'].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '6px 10px', fontSize: 11, color: 'var(--text3)', borderBottom: '1px solid var(--border)', background: 'var(--bg3)', fontWeight: 500 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {batches.map((b, i) => (
                      <tr key={i}>
                        <td style={{ padding: '7px 10px', fontSize: 11, borderBottom: '1px solid var(--border)' }}>{new Date(b.imported_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                        <td style={{ padding: '7px 10px', fontSize: 11, borderBottom: '1px solid var(--border)', color: 'var(--text2)' }}>{(b.file_names || []).join(', ')}</td>
                        <td style={{ padding: '7px 10px', fontWeight: 600, borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-mono)' }}>{b.total_records}</td>
                        <td style={{ padding: '7px 10px', fontSize: 11, borderBottom: '1px solid var(--border)', color: 'var(--text2)' }}>{(b.specialists || []).join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* DASHBOARD */}
      {tab === 'dashboard' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10, marginBottom: 14 }}>
            <StatCard label="Total Sessions" value={sessions.length} variant="blue" icon="📋" />
            <StatCard label="Active Backlog" value={totalLeft} variant="danger" icon="🔴" />
            <StatCard label="Overdue Total" value={sessions.filter(s => s.is_overdue).length} variant="warn" icon="⏰" />
            <StatCard label="Completed" value={totalDone} variant="good" icon="✅" />
            <StatCard label="Specialists" value={specialists.length} icon="👥" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 10 }}>
            {specStats.map(({ spec, total, ovTotal, done, left, pct, todayQ }) => {
              const color = pct >= 80 ? 'var(--green)' : pct >= 50 ? 'var(--amber)' : 'var(--red)'
              const alertCls = left > 25 ? { bg: 'var(--red-bg)', color: 'var(--red-t)', label: '⛔ Above threshold' } : left > 10 ? { bg: 'var(--amber-bg)', color: 'var(--amber-t)', label: '⚠ Monitor' } : { bg: 'var(--green-bg)', color: 'var(--green-t)', label: '✓ On track' }
              return (
                <Card key={spec}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>👤 {spec}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 3, background: alertCls.bg, color: alertCls.color }}>{alertCls.label}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, marginBottom: 10 }}>
                    {[['Backlog', left, 'var(--red-t)'], ['Done', done, 'var(--green-t)'], ['Total', total, 'var(--text)'], ['Today', todayQ, 'var(--amber-t)']].map(([lbl, val, clr]) => (
                      <div key={lbl} style={{ textAlign: 'center', background: 'var(--bg3)', borderRadius: 'var(--r)', padding: '6px 4px' }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: clr, fontFamily: 'var(--font-mono)' }}>{val}</div>
                        <div style={{ fontSize: 10, color: 'var(--text3)' }}>{lbl}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ height: 5, background: 'var(--bg4)', borderRadius: 3, overflow: 'hidden', marginBottom: 6 }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width .5s' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text3)' }}>
                    <span>{pct}% cleared</span>
                    <span style={{ color: left > 25 ? 'var(--red-t)' : 'var(--text3)' }}>{left} remaining</span>
                  </div>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {/* ALERTS */}
      {tab === 'alerts' && (
        <Card>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>🚨 Active Alerts</div>
          {tlAlerts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text3)', fontSize: 13 }}>✅ No active alerts — all specialists on track</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {tlAlerts.map((a, i) => <Alert key={i} variant={a.v} icon={a.i} title={a.title}>{a.body}</Alert>)}
            </div>
          )}
        </Card>
      )}

      {/* BACKLOG CHART */}
      {tab === 'backlog' && (
        <div>
          <Card style={{ marginBottom: 12 }}>
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

          <Card>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>✅ Daily Completions by Specialist</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ ...thSt }}>Date</th>
                    {specialists.map(s => <th key={s} style={{ ...thSt, fontSize: 10 }}>{s.split(' ')[0]}</th>)}
                    <th style={thSt}>Due</th>
                    <th style={thSt}>Done</th>
                  </tr>
                </thead>
                <tbody>
                  {backlogData.filter(d => d.due > 0 || d.done > 0).map(d => (
                    <tr key={d.date} style={{ background: d.date === TODAY_ISO ? 'var(--blue-bg)' : 'transparent' }}>
                      <td style={{ ...tdSt, fontWeight: d.date === TODAY_ISO ? 700 : 400, color: d.date === TODAY_ISO ? 'var(--blue-t)' : 'var(--text2)' }}>{d.label}</td>
                      {specialists.map(spec => {
                        const due = sessions.filter(s => s.case_specialist === spec && s.next_call_date === d.date).length
                        const done = sessions.filter(s => s.case_specialist === spec && (progress[s.voucher_number]?.completed_at || '').startsWith(d.date)).length
                        return (
                          <td key={spec} style={{ ...tdSt, color: due >= 15 ? 'var(--red-t)' : due >= 10 ? 'var(--amber-t)' : 'var(--text2)' }}>
                            {due > 0 && due} {done > 0 && <span style={{ color: 'var(--green-t)' }}>({done}✓)</span>}
                            {!due && !done && '—'}
                          </td>
                        )
                      })}
                      <td style={{ ...tdSt, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{d.due}</td>
                      <td style={{ ...tdSt, fontWeight: 600, color: 'var(--green-t)', fontFamily: 'var(--font-mono)' }}>{d.done}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ALL SESSIONS */}
      {tab === 'sessions' && (
        <Card>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
            <input value={searchSessions} onChange={e => setSearchSessions(e.target.value)} placeholder="Search voucher or name..."
              style={{ padding: '6px 10px', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 'var(--r)', color: 'var(--text)', fontSize: 12, outline: 'none', width: 220 }} />
            <select value={filterSpec} onChange={e => setFilterSpec(e.target.value)}
              style={{ padding: '6px 10px', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 'var(--r)', color: 'var(--text)', fontSize: 12, outline: 'none' }}>
              <option value="">All Specialists</option>
              {specialists.map(s => <option key={s}>{s}</option>)}
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              style={{ padding: '6px 10px', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 'var(--r)', color: 'var(--text)', fontSize: 12, outline: 'none' }}>
              <option value="">All Status</option>
              <option>Contacted</option><option>Processing</option><option>Pending</option>
            </select>
            <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 'auto' }}>{filteredSessions.length} sessions</span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  {['Voucher', 'Applicant', 'Specialist', 'Status', 'Next Call', 'Overdue', 'Done', 'New Date'].map(h => (
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
                      <td style={{ ...tdSt, fontSize: 11, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text2)' }}>{s.applicant || '—'}</td>
                      <td style={{ ...tdSt, fontSize: 11, color: 'var(--text2)' }}>{s.case_specialist}</td>
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
