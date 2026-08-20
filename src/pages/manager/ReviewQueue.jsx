import { useEffect, useState } from 'react'
import { listOrders, getServiceCompletion, updateOrderStatus, listManagerNotifications, ORDER_STATUSES } from '../../lib/db'
import StatusBadge from '../../components/StatusBadge'
import { useAuth } from '../../context/AuthContext'

export default function ReviewQueue() {
  const { user } = useAuth()
  const [filter, setFilter] = useState('Job Done')
  const [orders, setOrders] = useState([])
  const [completions, setCompletions] = useState({})
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const [rows, notes] = await Promise.all([
      listOrders(filter ? { status: filter } : {}),
      listManagerNotifications(),
    ])
    setOrders(rows)
    setNotifications(notes)
    const entries = await Promise.all(
      rows.map(async (o) => [o.id, await getServiceCompletion(o.id)]),
    )
    setCompletions(Object.fromEntries(entries))
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter])

  const advance = async (order, note) => {
    const next = order.status === 'Job Done' ? 'Reviewed' : 'Closed'
    await updateOrderStatus(order.id, next, user.name, note)
    load()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold text-slate-900">Manager Review Queue</h1>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="input max-w-xs">
          <option value="">All statuses</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {notifications.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg p-4 mb-4">
          <h2 className="text-sm font-semibold text-slate-900 mb-2">Recent Notifications</h2>
          <ul className="text-xs text-slate-600 space-y-1.5">
            {notifications.map((n) => (
              <li key={n.id} className="flex justify-between gap-3">
                <span>
                  <span className="font-medium text-slate-800">{n.orders?.order_no}</span> — {n.message}
                </span>
                <span className="text-slate-400 shrink-0">{new Date(n.created_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Loading...</p>
      ) : orders.length === 0 ? (
        <p className="text-sm text-slate-500">Nothing to review here.</p>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => {
            const c = completions[o.id]
            const flags = []
            if (c && Number(c.final_amount) > Number(o.quoted_price) * 1.3) {
              flags.push('Final amount much higher than quoted price')
            }
            if (c && (!c.media_urls || c.media_urls.length === 0)) {
              flags.push('Job done but no photos uploaded')
            }
            return (
              <div key={o.id} className="bg-white border border-slate-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-slate-900">{o.order_no}</span>
                  <StatusBadge status={o.status} />
                </div>
                <p className="text-sm text-slate-700">{o.customer_name} — {o.service_type}</p>
                <p className="text-xs text-slate-500 mb-2">Technician: {o.technicians?.name || '—'}</p>

                {c ? (
                  <div className="text-xs text-slate-600 bg-slate-50 rounded-md p-2 mb-2 space-y-0.5">
                    <div>Work done: {c.work_done || '—'}</div>
                    <div>Quoted RM{Number(o.quoted_price).toFixed(2)} → Final RM{Number(c.final_amount).toFixed(2)}</div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 mb-2">No completion data yet.</p>
                )}

                {flags.length > 0 && (
                  <div className="mb-2 space-y-1">
                    {flags.map((f) => (
                      <div key={f} className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                        ⚠ {f}
                      </div>
                    ))}
                  </div>
                )}

                {o.status === 'Job Done' && (
                  <button onClick={() => advance(o, 'Reviewed by manager')} className="px-3 py-1.5 rounded-md bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium">
                    Mark Reviewed
                  </button>
                )}
                {o.status === 'Reviewed' && (
                  <button onClick={() => advance(o, 'Closed after accounts review')} className="px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium">
                    Close Order
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
