import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listOrders, ORDER_STATUSES } from '../../lib/db'
import StatusBadge from '../../components/StatusBadge'

export default function OrdersList() {
  const [orders, setOrders] = useState([])
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const rows = await listOrders({ status: status || undefined, search: search || undefined })
      setOrders(rows)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h1 className="text-lg font-semibold text-slate-900">Orders</h1>
        <Link
          to="/admin/new"
          className="px-3 py-1.5 rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium"
        >
          + New Order
        </Link>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load()}
          placeholder="Search customer or order no..."
          className="border border-slate-300 rounded-md px-3 py-1.5 text-sm w-64"
        />
        <button onClick={load} className="px-3 py-1.5 rounded-md border border-slate-300 text-sm">
          Search
        </button>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="border border-slate-300 rounded-md px-3 py-1.5 text-sm"
        >
          <option value="">All statuses</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
      {loading ? (
        <p className="text-sm text-slate-500">Loading...</p>
      ) : orders.length === 0 ? (
        <p className="text-sm text-slate-500">No orders found.</p>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2">Order No</th>
                <th className="text-left px-4 py-2">Customer</th>
                <th className="text-left px-4 py-2">Service</th>
                <th className="text-left px-4 py-2">Technician</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-left px-4 py-2">Created</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2 whitespace-nowrap">
                    <Link to={`/admin/orders/${o.id}`} className="text-brand-700 font-medium hover:underline">
                      {o.order_no}
                    </Link>
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">{o.customer_name}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{o.service_type}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{o.technicians?.name || <span className="text-slate-400">Unassigned</span>}</td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <StatusBadge status={o.status} />
                  </td>
                  <td className="px-4 py-2 text-slate-500 whitespace-nowrap">{new Date(o.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
