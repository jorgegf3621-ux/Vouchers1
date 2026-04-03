import { addDays, format, isWeekend, parseISO, isAfter, isBefore, isEqual } from 'date-fns'

export const CAP_SPRINT = 25
export const CAP_DAY = 15
export const BACKLOG_THRESHOLD = 25
export const TODAY = new Date()
export const TODAY_ISO = format(TODAY, 'yyyy-MM-dd')

export function getBusinessDays(startDate, count) {
  const days = []
  let d = new Date(startDate)
  while (days.length < count) {
    if (!isWeekend(d)) days.push(new Date(d))
    d = addDays(d, 1)
  }
  return days
}

export function buildSprintPlan(overdueSessions, futureSessions) {
  if (overdueSessions.length <= BACKLOG_THRESHOLD) return null

  const bizDays = getBusinessDays(TODAY, 60)

  // Assign call days (cap 25/day)
  const callDayLoad = {}
  const callAssignments = {}
  const overdueByDate = [...overdueSessions].sort((a, b) =>
    (a.next_call_date || '').localeCompare(b.next_call_date || '')
  )

  overdueByDate.forEach(session => {
    for (const d of bizDays) {
      const k = format(d, 'yyyy-MM-dd')
      if ((callDayLoad[k] || 0) < CAP_SPRINT) {
        callDayLoad[k] = (callDayLoad[k] || 0) + 1
        callAssignments[session.voucher_number] = k
        break
      }
    }
  })

  // Reschedule days after last call day
  const callDayKeys = Object.keys(callDayLoad).sort()
  const lastCallDay = callDayKeys[callDayKeys.length - 1]
  const reschDays = bizDays.filter(d => format(d, 'yyyy-MM-dd') > lastCallDay)

  // Existing future load
  const futureLoad = {}
  futureSessions.forEach(s => {
    if (s.next_call_date) futureLoad[s.next_call_date] = (futureLoad[s.next_call_date] || 0) + 1
  })

  const reschExtra = {}
  const suggestedDates = {}

  overdueByDate.forEach(session => {
    for (const d of reschDays) {
      const k = format(d, 'yyyy-MM-dd')
      const total = (futureLoad[k] || 0) + (reschExtra[k] || 0)
      if (total < CAP_DAY) {
        reschExtra[k] = (reschExtra[k] || 0) + 1
        suggestedDates[session.voucher_number] = k
        break
      }
    }
  })

  const usedReschDays = [...new Set(Object.values(suggestedDates))].sort()
  const goalDate = usedReschDays[usedReschDays.length - 1] || null

  return {
    callDays: callDayKeys.map(k => ({ date: k, count: callDayLoad[k] })),
    callAssignments,
    suggestedDates,
    goalDate,
    overdueCount: overdueSessions.length,
  }
}

export function getDayLoad(date, progressMap, afterCalBase) {
  const base = afterCalBase[date]?.count || 0
  let userAdded = 0
  Object.values(progressMap).forEach(p => {
    if (p.completed && p.new_call_date === date) userAdded++
  })
  return base + userAdded
}

export function detectSnowball(dynCal) {
  const hotDays = Object.entries(dynCal)
    .filter(([, e]) => (e.count || 0) >= 12 && e.type !== 'action')
    .map(([d]) => d)
    .sort()

  if (hotDays.length < 3) return null

  let consec = 1, max = 1, maxStart = 0, maxEnd = 0
  let curStart = 0
  for (let i = 1; i < hotDays.length; i++) {
    const diff = (new Date(hotDays[i] + 'T12:00') - new Date(hotDays[i - 1] + 'T12:00')) / 86400000
    if (diff <= 3) { consec++; if (consec > max) { max = consec; maxStart = curStart; maxEnd = i } }
    else { consec = 1; curStart = i }
  }
  return max >= 3 ? { count: max, days: hotDays.slice(maxStart, maxEnd + 1) } : null
}

export function parseCSVDate(raw) {
  if (!raw || raw === '12/31/1969') return null
  const parts = raw.split('/')
  if (parts.length !== 3) return null
  const m = parseInt(parts[0]), d = parseInt(parts[1]) + 1, y = parseInt(parts[2])
  if (!m || !d || !y) return null
  return format(new Date(y, m - 1, d), 'yyyy-MM-dd')
}

export function splitCSVLine(line) {
  const result = []
  let cur = '', inQ = false
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ }
    else if (ch === ',' && !inQ) { result.push(cur.trim()); cur = '' }
    else cur += ch
  }
  result.push(cur.trim())
  return result
}

export function parseCSV(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length < 2) return []
  const headers = splitCSVLine(lines[0])
  return lines.slice(1).map(line => {
    const vals = splitCSVLine(line)
    const obj = {}
    headers.forEach((h, i) => { obj[h] = (vals[i] || '').trim() })
    return obj
  }).filter(r => r['Voucher Number'])
}

export function priorityOrder(status) {
  return { Contacted: 0, Processing: 1, Pending: 2 }[status] ?? 3
}

export function fmtDate(iso) {
  if (!iso) return '—'
  try { return format(parseISO(iso), 'MMM d, yyyy') } catch { return iso }
}

// ── Auto-schedule: suggest next call date based on outcome ──
export function suggestNextDate(currentDate, outcome, dynCal = {}, hasNoAnswer = false) {
  // Rules:
  // 1. "No answer" (quick button or template) → 5 business days
  // 2. Contacted (no no-answer note) → 7 business days
  // 3. Filed + no no-answer note → 30-45 days
  // 4. Filed + no-answer note → 5 business days (handled by rule 1)
  
  let baseDays = 7 // default: contacted
  if (hasNoAnswer || outcome === 'no_answer' || outcome === 'left_vm') baseDays = 5
  else if (outcome === 'filed') baseDays = 30 + Math.floor(Math.random() * 16) // 30-45 days
  else if (outcome === 'pending_review') baseDays = 3

  let d = new Date(currentDate ? currentDate + 'T12:00' : TODAY)
  let added = 0
  while (added < baseDays) {
    d = addDays(d, 1)
    if (!isWeekend(d)) added++
  }

  // Check saturation: if ≥12 calls, push 1-2 more business days
  let attempts = 0
  while (attempts < 3) {
    const key = format(d, 'yyyy-MM-dd')
    const load = (dynCal[key]?.count || 0)
    if (load >= 12) {
      d = addDays(d, 1)
      if (isWeekend(d)) d = addDays(d, 1)
      attempts++
    } else break
  }

  return format(d, 'yyyy-MM-dd')
}

// ── Weekly Streak: consecutive days meeting daily quota ──
export function calcWeeklyStreak(progress, dailyQuota = 15) {
  const today = new Date()
  let streak = 0
  for (let i = 0; i < 30; i++) {
    const d = addDays(today, -i)
    const key = format(d, 'yyyy-MM-dd')
    if (isWeekend(d)) continue
    const completed = Object.values(progress).filter(p => p.completed_at && p.completed_at.startsWith(key)).length
    if (completed >= dailyQuota) streak++
    else break
  }
  return streak
}
