import { useState } from 'react'
import { askOperationsAI, SUPPORTED_INTENTS } from '../../lib/ai'

export default function AIQuery() {
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)

  const ask = async (q) => {
    const text = (q ?? question).trim()
    if (!text) return
    setMessages((m) => [...m, { role: 'user', text }])
    setQuestion('')
    setLoading(true)
    try {
      const res = await askOperationsAI(text)
      setMessages((m) => [...m, { role: 'ai', text: res.answer, usedLLM: res.usedLLM, intent: res.intent }])
    } catch (e) {
      setMessages((m) => [...m, { role: 'ai', text: `Something went wrong: ${e.message}` }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-lg font-semibold text-slate-900 mb-1">Ask AI — Operations Query</h1>
      <p className="text-sm text-slate-500 mb-4">
        Answers are generated only from data retrieved through controlled queries — not raw database access.
      </p>

      <div className="flex flex-wrap gap-2 mb-4">
        {SUPPORTED_INTENTS.map((s) => (
          <button
            key={s.intent}
            onClick={() => ask(s.example)}
            className="text-xs px-2.5 py-1 rounded-full border border-slate-300 text-slate-600 hover:bg-slate-100"
          >
            {s.example}
          </button>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-4 h-96 overflow-y-auto flex flex-col gap-3 mb-3">
        {messages.length === 0 && (
          <p className="text-sm text-slate-400">Ask a question about jobs, technicians, or completion status.</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
            m.role === 'user' ? 'self-end bg-brand-600 text-white' : 'self-start bg-slate-100 text-slate-800'
          }`}>
            {m.text}
            {m.role === 'ai' && (
              <div className="mt-1 text-[10px] opacity-60">
                {m.usedLLM ? 'formatted by LLM' : 'template response'} · intent: {m.intent}
              </div>
            )}
          </div>
        ))}
        {loading && <div className="self-start text-xs text-slate-400">Thinking...</div>}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          ask()
        }}
        className="flex gap-2"
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. What jobs did technician Ali complete last week?"
          className="input"
        />
        <button className="px-4 py-1.5 rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium">
          Ask
        </button>
      </form>
    </div>
  )
}
