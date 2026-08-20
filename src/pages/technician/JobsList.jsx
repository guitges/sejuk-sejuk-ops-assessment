import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { listOrders, listTechnicians, updateOrderStatus } from '../../lib/db'
import StatusBadge from '../../components/StatusBadge'

export default function JobsList() {
  const { user } = useAuth()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const techs = await listTechnicians()
    const me = techs.find((t) => t.name === user.name)
    if (!me) {
      setOrders([])
      setLoading(false)
      return
    }
    const rows = await listOrders({ technicianId: me.id })
    setOrders(rows.filter((o) => ['Assigned', 'In Progress', 'Job Done'].includes(o.status)))
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.name])

  const startJob = async (orderId) => {
    await updateOrderStatus(orderId, 'In Progress', user.name, 'Technician started the job')
    load()
  }

  if (loading) return <p className="text-sm text-slate-500">Loading...</p>

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-lg font-semibold text-slate-900 mb-1">My Jobs</h1>
      <p className="text-sm text-slate-500 mb-4">Logged in as {user.name}</p>

      {orders.length === 0 ? (
        <p className="text-sm text-slate-500">No jobs assigned right now.</p>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => (
            <div key={o.id} className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-slate-900">{o.order_no}</span>
                <StatusBadge status={o.status} />
              </div>
              <p className="text-sm text-slate-700">{o.customer_name}</p>
              <p className="text-xs text-slate-500 mb-3">{o.address}</p>
              <p className="text-xs text-slate-500 mb-3">{o.service_type} — {o.problem_description}</p>

              {o.status === 'Assigned' && (
                <button
                  onClick={() => startJob(o.id)}
                  className="w-full px-3 py-2 rounded-md bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium"
                >
                  Start Job
                </button>
              )}
              {o.status === 'In Progress' && (
                <Link
                  to={`/technician/jobs/${o.id}`}
                  className="block text-center w-full px-3 py-2 rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium"
                >
                  Complete Job
                </Link>
              )}
              {o.status === 'Job Done' && (
                <p className="text-xs text-emerald-700 font-medium">Completed — waiting on manager review</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
