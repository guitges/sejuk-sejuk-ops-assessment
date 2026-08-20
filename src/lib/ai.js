// AI Module — Operations Query Window.
//
// Flow (per the assessment brief):
//   user question -> system interprets question -> controlled DB query
//   -> AI formats the response
//
// The "AI" never receives raw database access. It only ever sees the
// small, structured JSON result of a *controlled* query function from
// src/lib/db.js (already scoped to specific columns/filters). This file
// has two swappable layers:
//   1. interpretQuestion() — turns free text into a known intent + params.
//      Implemented with lightweight keyword/regex matching so behaviour
//      is predictable and demo-safe without an API key.
//   2. formatAnswer() — turns structured data into a natural-language
//      reply. If VITE_AI_API_KEY is set, this calls a real LLM with
//      ONLY the already-retrieved structured data (never a raw DB
//      connection). Otherwise it falls back to a deterministic template
//      that matches the PDF's example output.
//
// Swapping in a real LLM for step 1 (NLU) is a one-line change: replace
// interpretQuestion's body with an LLM call constrained to return one of
// the SUPPORTED_INTENTS as JSON (see comment below).

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

function daysAgoIso(days) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function resolvePeriod(text) {
  const t = text.toLowerCase()
  if (t.includes('today')) return { sinceIso: daysAgoIso(0), label: 'today' }
  if (t.includes('yesterday')) return { sinceIso: daysAgoIso(1), label: 'yesterday' }
  if (t.includes('last week')) return { sinceIso: daysAgoIso(14), label: 'last week', untilDaysAgo: 7 }
  // default: this week / no period mentioned
  return { sinceIso: daysAgoIso(7), label: 'this week' }
}

function findTechnicianInText(text) {
  const t = text.toLowerCase()
  return KNOWN_TECHNICIANS.find((name) => t.includes(name.toLowerCase())) || null
}

/** Step 1: interpret the free-text question into a known intent + params. */
export function interpretQuestion(question) {
  const q = question.trim()
  const lower = q.toLowerCase()
  const period = resolvePeriod(lower)
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

  if (technician && (lower.includes('job') || lower.includes('complet') || lower.includes('did'))) {
    return { intent: 'technician_jobs', params: { period, technician } }
  }

  if (technician) {
    return { intent: 'technician_jobs', params: { period, technician } }
  }

  return { intent: 'unsupported', params: { period, rawQuestion: q } }
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

/** Step 3: format the structured result into a natural-language answer. */
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

/**
 * Optional real-LLM formatting step. Only ever receives the small,
 * already-retrieved structured `data` object — never database
 * credentials or raw table access. Swap the endpoint/model as needed.
 */
async function formatWithLLM(intent, params, data) {
  const apiKey = import.meta.env.VITE_AI_API_KEY
  if (!apiKey) return null

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You are an operations assistant for an aircond service company. You will be given a JSON object of already-retrieved data (from a controlled database query) and must answer the manager\'s question ONLY using that data, in 2-4 concise sentences or a short list. Never invent data not present in the JSON.',
          },
          {
            role: 'user',
            content: `Question: ${params.rawQuestion || ''}\nIntent: ${intent}\nData: ${JSON.stringify(data)}`,
          },
        ],
        temperature: 0.2,
      }),
    })
    if (!res.ok) return null
    const json = await res.json()
    return json.choices?.[0]?.message?.content?.trim() || null
  } catch {
    return null
  }
}

/** Main entry point used by the UI. */
export async function askOperationsAI(question) {
  const { intent, params } = interpretQuestion(question)
  params.rawQuestion = question

  const data = await runControlledQuery(intent, params)

  const llmAnswer = await formatWithLLM(intent, params, data)
  const answer = llmAnswer || formatTemplate(intent, params, data)

  return {
    intent,
    params,
    data,
    answer,
    usedLLM: Boolean(llmAnswer),
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
