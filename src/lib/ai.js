// AI Module — Operations Query Window.
//
// Flow (per the assessment brief):
//   user question -> system interprets question -> controlled DB query
//   -> AI formats the response
//
// Both the "interpret" and "format" steps call a real Claude model, via the
// serverless function at /api/ai (src/../api/ai.js). That function holds
// the Anthropic API key server-side — it is never sent to, or bundled into,
// the browser. Claude itself never gets database access: "interpret" only
// ever sees the question text plus a fixed list of valid intents/technician
// names, and "format" only ever sees the small JSON result of a controlled
// query function from src/lib/db.js (never a table name, never SQL).
//
// If the API call fails for any reason (offline, running `npm run dev`
// without Vercel's serverless runtime, ANTHROPIC_API_KEY not configured on
// the deployment), both steps fall back to a deterministic local engine —
// keyword matching for interpretation, a template for formatting — so the
// module still works, just without real model reasoning.

import {
  jobsCompletedToday,
  listCompletedJobs,
  weeklyLeaderboard,
  weeklyPostponeCount,
  listTechnicians,
} from './db'

export const SUPPORTED_INTENTS = [
  {
    intent: 'technician_jobs',
    example: 'What jobs did technician Ali complete last week?',
  },
  {
    intent: 'top_technician',
    example: 'Which technician completed the most jobs this week?',
  },
  {
    intent: 'jobs_completed_count',
    example: 'How many jobs were completed today?',
  },
  {
    intent: 'overloaded_technician',
    example: 'Which technician might be overloaded this week?',
  },
]

const KNOWN_TECHNICIANS = ['Ali', 'John', 'Bala', 'Yusoff']
const KNOWN_INTENTS = new Set(['technician_jobs', 'top_technician', 'jobs_completed_count', 'overloaded_technician', 'unsupported'])

function daysAgoIso(days) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

/** Turns a period label ("today" / "yesterday" / "this week" / "last week") into a query range. */
function periodFromLabel(label) {
  if (label === 'today') return { sinceIso: daysAgoIso(0), label: 'today' }
  if (label === 'yesterday') return { sinceIso: daysAgoIso(1), label: 'yesterday' }
  if (label === 'last week') return { sinceIso: daysAgoIso(14), label: 'last week' }
  return { sinceIso: daysAgoIso(7), label: 'this week' }
}

function resolvePeriodFromText(text) {
  const t = text.toLowerCase()
  if (t.includes('today')) return periodFromLabel('today')
  if (t.includes('yesterday')) return periodFromLabel('yesterday')
  if (t.includes('last week')) return periodFromLabel('last week')
  return periodFromLabel('this week')
}

function findTechnicianInText(text) {
  const t = text.toLowerCase()
  return KNOWN_TECHNICIANS.find((name) => t.includes(name.toLowerCase())) || null
}

/** Local fallback interpreter — deterministic keyword matching, used only if the AI endpoint is unavailable. */
function interpretQuestionLocally(question) {
  const lower = question.toLowerCase()
  const period = resolvePeriodFromText(lower)
  const technician = findTechnicianInText(lower)

  if (lower.includes('overload') || (lower.includes('most jobs') && lower.includes('busy'))) {
    return { intent: 'overloaded_technician', params: { period } }
  }
  if (lower.includes('most jobs') || (lower.includes('which technician') && lower.includes('complet'))) {
    return { intent: 'top_technician', params: { period } }
  }
  if (lower.includes('how many') && lower.includes('job')) {
    return { intent: 'jobs_completed_count', params: { period } }
  }
  if (technician) {
    return { intent: 'technician_jobs', params: { period, technician } }
  }
  return { intent: 'unsupported', params: { period } }
}

/** Real step 1: ask Claude (via the serverless function) to classify the question. */
async function interpretQuestionRemote(question) {
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'interpret', question }),
  })
  if (!res.ok) throw new Error(`interpret failed: ${res.status}`)
  const json = await res.json()
  if (!KNOWN_INTENTS.has(json.intent)) throw new Error('interpret returned unknown intent')

  const period = periodFromLabel(json.params?.period)
  const technician = KNOWN_TECHNICIANS.includes(json.params?.technician) ? json.params.technician : undefined
  return { intent: json.intent, params: { period, technician } }
}

/** Step 2: run the matched intent through controlled db.js query functions only. */
async function runControlledQuery(intent, params) {
  switch (intent) {
    case 'technician_jobs': {
      if (!params.technician) return { error: 'no_technician_named' }
      const jobs = await listCompletedJobs({ sinceIso: params.period.sinceIso, technicianName: params.technician })
      return { jobs }
    }
    case 'top_technician': {
      const leaderboard = await weeklyLeaderboard()
      return { leaderboard }
    }
    case 'jobs_completed_count': {
      const jobs = params.period.label === 'today' ? await jobsCompletedToday() : await listCompletedJobs({ sinceIso: params.period.sinceIso })
      return { jobs, period: params.period.label }
    }
    case 'overloaded_technician': {
      const leaderboard = await weeklyLeaderboard()
      const postpones = await weeklyPostponeCount()
      return { leaderboard, postpones }
    }
    default:
      return {}
  }
}

/** Local fallback formatter — deterministic template, used only if the AI endpoint is unavailable. */
function formatTemplate(intent, params, data) {
  switch (intent) {
    case 'technician_jobs': {
      if (data.error === 'no_technician_named') {
        return `I couldn't find a technician by that name. Known technicians are: ${KNOWN_TECHNICIANS.join(', ')}.`
      }
      const { jobs } = data
      if (jobs.length === 0) {
        return `Technician ${params.technician} completed 0 jobs ${params.period.label}.`
      }
      const lines = jobs.map((j) => `${j.orders?.order_no ?? j.order_id} – ${j.orders?.service_type ?? 'Service'}`)
      return `Technician ${params.technician} completed ${jobs.length} job${jobs.length === 1 ? '' : 's'} ${params.period.label}:\n\n${lines.join('\n')}`
    }
    case 'top_technician': {
      const { leaderboard } = data
      if (leaderboard.length === 0) return `No completed jobs found ${params.period.label}.`
      const top = leaderboard[0]
      return `${top.technician} completed the most jobs ${params.period.label}, with ${top.jobsCompleted} job${top.jobsCompleted === 1 ? '' : 's'} (RM${top.totalAmount.toFixed(2)} total).`
    }
    case 'jobs_completed_count': {
      const { jobs, period } = data
      return `${jobs.length} job${jobs.length === 1 ? '' : 's'} were completed ${period}.`
    }
    case 'overloaded_technician': {
      const { leaderboard } = data
      if (leaderboard.length === 0) return `No completed jobs found this week, so no workload signal to report.`
      const avg = leaderboard.reduce((s, e) => s + e.jobsCompleted, 0) / leaderboard.length
      const top = leaderboard[0]
      if (top.jobsCompleted > avg * 1.5) {
        return `Technician ${top.technician} completed ${top.jobsCompleted} jobs this week, which is significantly higher than the team average (${avg.toFixed(1)}). Consider redistributing upcoming jobs.`
      }
      return `Workload looks balanced this week — top technician (${top.technician}) completed ${top.jobsCompleted} jobs against a team average of ${avg.toFixed(1)}.`
    }
    case 'unsupported':
    default:
      return `I can currently answer questions about: technician job history, top performer, jobs completed in a period, and technician workload. Try something like "${SUPPORTED_INTENTS[0].example}"`
  }
}

/** Real step 3: ask Claude (via the serverless function) to phrase the answer from the retrieved data. */
async function formatAnswerRemote(question, intent, data) {
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'format', question, intent, data }),
  })
  if (!res.ok) throw new Error(`format failed: ${res.status}`)
  const json = await res.json()
  if (!json.answer) throw new Error('format returned empty answer')
  return json.answer
}

/** Main entry point used by the UI. */
export async function askOperationsAI(question) {
  let intent
  let params
  let usedRemoteInterpret = true
  try {
    ;({ intent, params } = await interpretQuestionRemote(question))
  } catch {
    usedRemoteInterpret = false
    ;({ intent, params } = interpretQuestionLocally(question))
  }

  const data = await runControlledQuery(intent, params)

  let answer
  let usedRemoteFormat = true
  try {
    answer = await formatAnswerRemote(question, intent, data)
  } catch {
    usedRemoteFormat = false
    answer = formatTemplate(intent, params, data)
  }

  return {
    intent,
    params,
    data,
    answer,
    usedLLM: usedRemoteInterpret || usedRemoteFormat,
    usedRemoteInterpret,
    usedRemoteFormat,
  }
}

export async function listKnownTechnicianNames() {
  try {
    const techs = await listTechnicians()
    return techs.map((t) => t.name)
  } catch {
    return KNOWN_TECHNICIANS
  }
}
