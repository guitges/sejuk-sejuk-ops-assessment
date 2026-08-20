// Vercel serverless function. Holds the Gemini API key server-side only
// (process.env.GEMINI_API_KEY — NOT a VITE_ variable, so it never reaches
// the browser bundle). The browser calls this endpoint over POST; it never
// sees the key. Uses the Gemini REST API directly (no SDK dependency).
//
// Two actions, matching the AI Operations Query Window flow in the
// assessment brief (question -> interpret -> [controlled DB query happens
// client-side in src/lib/db.js, not here] -> format):
//   - "interpret": classifies a free-text question into one of a fixed set
//     of intents + parameters. Gemini never sees the database — only the
//     question text and the list of valid intents/technicians.
//   - "format": turns an already-retrieved, already-scoped JSON result (from
//     a controlled db.js query) into a natural-language answer. Gemini only
//     ever sees that small JSON object, never a database connection.

// gemini-3.5-flash-lite: no mandatory "thinking" token overhead (unlike the
// gemini-3.x-flash tier, where thinking tokens silently eat into the same
// maxOutputTokens budget as the visible answer) and a far more generous free
// -tier daily request quota — gemini-3.6-flash's free tier caps at only 20
// requests/day, which this app's 2-calls-per-question flow burns through
// almost immediately.
const GEMINI_MODEL = 'gemini-3.5-flash-lite'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

const KNOWN_TECHNICIANS = ['Ali', 'John', 'Bala', 'Yusoff']
const KNOWN_INTENTS = ['technician_jobs', 'top_technician', 'jobs_completed_count', 'overloaded_technician', 'unsupported']
const KNOWN_PERIODS = ['today', 'yesterday', 'this week', 'last week']

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  if (!process.env.GEMINI_API_KEY) {
    res.status(503).json({ error: 'AI not configured' })
    return
  }

  const { action, question, intent, data } = req.body || {}

  try {
    if (action === 'interpret') {
      if (typeof question !== 'string' || !question.trim() || question.length > 500) {
        res.status(400).json({ error: 'Invalid question' })
        return
      }
      const result = await interpret(question)
      res.status(200).json(result)
      return
    }

    if (action === 'format') {
      if (typeof question !== 'string' || !KNOWN_INTENTS.includes(intent)) {
        res.status(400).json({ error: 'Invalid format request' })
        return
      }
      const answer = await format(question, intent, data)
      res.status(200).json({ answer })
      return
    }

    res.status(400).json({ error: 'Unknown action' })
  } catch (err) {
    console.error('AI handler error:', err)
    res.status(502).json({ error: 'AI request failed' })
  }
}

async function callGemini({ systemInstruction, userText, jsonOutput, maxOutputTokens }) {
  const body = {
    system_instruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: 'user', parts: [{ text: userText }] }],
    generationConfig: {
      maxOutputTokens,
      ...(jsonOutput ? { responseMimeType: 'application/json' } : {}),
    },
  }

  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': process.env.GEMINI_API_KEY,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`Gemini request failed: ${res.status} ${errText}`)
  }

  const json = await res.json()
  const candidate = json.candidates?.[0]
  const text = candidate?.content?.parts?.map((p) => p.text || '').join('') || ''
  if (candidate?.finishReason === 'MAX_TOKENS' && !text.trim()) {
    // Thinking alone consumed the whole budget — surface this distinctly so
    // callers can fall back instead of parsing/returning an empty string.
    throw new Error('Gemini response truncated before any output (finishReason: MAX_TOKENS)')
  }
  return text
}

async function interpret(question) {
  const systemInstruction = `You are an intent classifier for an aircond service company's internal operations system. Classify the manager's question into exactly one supported intent and extract parameters. Respond with ONLY a raw JSON object — no markdown, no explanation.

Supported intents:
- "technician_jobs": asking what jobs a specific technician completed. params: { "technician": <one of ${JSON.stringify(KNOWN_TECHNICIANS)}>, "period": <one of ${JSON.stringify(KNOWN_PERIODS)}> }
- "top_technician": asking which technician completed the most jobs. params: { "period": ... }
- "jobs_completed_count": asking how many jobs were completed in a period. params: { "period": ... }
- "overloaded_technician": asking which technician might be overloaded / busiest / needs redistribution. params: { "period": ... }
- "unsupported": anything else, including a technician name NOT in the known list, or a question outside these four shapes. params: {}

Rules:
- "period" defaults to "this week" if not mentioned.
- A named technician must exactly match one of ${JSON.stringify(KNOWN_TECHNICIANS)} (case-insensitive match, but output using the exact listed casing). If a different name is given, use "unsupported".
- Output strict JSON only: {"intent": "...", "params": {...}}`

  const text = await callGemini({ systemInstruction, userText: question, jsonOutput: true, maxOutputTokens: 800 })

  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    return { intent: 'unsupported', params: {} }
  }

  if (!KNOWN_INTENTS.includes(parsed.intent)) {
    return { intent: 'unsupported', params: {} }
  }
  return { intent: parsed.intent, params: parsed.params || {} }
}

async function format(question, intent, data) {
  const systemInstruction = `You are an operations assistant for Sejuk Sejuk Service, an aircond installation/servicing company. You will be given a JSON object of data already retrieved from a controlled, scoped database query — this is the ONLY data you may reference. Write a concise natural-language answer (1-4 sentences, or a short list for job listings) to the manager's question using ONLY this data. Never invent technicians, order numbers, or figures not present in the JSON. If the data is empty, say so plainly rather than guessing.`

  const userText = `Question: ${question}\nIntent: ${intent}\nRetrieved data (JSON): ${JSON.stringify(data ?? {})}`

  const text = await callGemini({ systemInstruction, userText, jsonOutput: false, maxOutputTokens: 1200 })
  return text.trim()
}
