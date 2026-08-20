import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  getOrder,
  getOrderHistory,
  getServiceCompletion,
  listTechnicians,
  assignTechnician,
} from '../../lib/db'
import { buildWaLink, jobAssignedMessage } from '../../lib/whatsapp'
import { logNotification } from '../../lib/db'
import StatusBadge from '../../components/StatusBadge'
import { useAuth } from '../../context/AuthContext'

export default function OrderDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const [order, setOrder] = useState(null)
  const [history, setHistory] = useState([])
  const [completion, setCompletion] = useState(null)
  const [technicians, setTechnicians] = useState([])
  const [assigning, setAssigning] = useState('')
  const [waLink, setWaLink] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const [o, h, c, techs] = await Promise.all([
      getOrder(id),
      getOrderHistory(id),
      getServiceCompletion(id),
      listTechnicians(),
    ])
    setOrder(o)
    setHistory(h)
    setCompletion(c)
    setTechnicians(techs)
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const handleAssign = async () => {
    if (!assigning) return
    await assignTechnician(id, assigning, user.name)
    const tech = technicians.find((t) => t.id === assigning)
    const message = jobAssignedMessage({
      technicianName: tech.name,
      orderNo: order.order_no,
      customerName: order.customer_name,
      address: order.address,
      serviceType: order.service_type,
    })
    const link = buildWaLink(tech.phone, message)
    setWaLink(link)
    await logNotification({ orderId: id, recipientType: 'technician', recipient: tech.name, message, deepLink: link })
    await load()
  }

  if (loading || !order) return <p className="text-sm text-slate-500">Loading...</p>

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">{order.order_no}</h1>
        <StatusBadge status={order.status} />
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-5 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
        <Info label="Customer" value={order.customer_name} />
        <Info label="Phone" value={order.phone} />
        <Info label="Address" value={order.address} full />
        <Info label="Problem" value={order.problem_description || '—'} full />
        <Info label="Service Type" value={order.service_type} />
        <Info label="Quoted Price" value={`RM${Number(order.quoted_price).toFixed(2)}`} />
        <Info label="Admin Notes" value={order.admin_notes || '—'} full />
        <Info label="Created" value={new Date(order.created_at).toLocaleString()} />
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-5">
        <h2 className="text-sm font-semibold text-slate-900 mb-3">Technician</h2>
        {order.technicians?.name ? (
          <p className="text-sm">{order.technicians.name}</p>
        ) : (
          <div className="flex gap-2">
            <select value={assigning} onChange={(e) => setAssigning(e.target.value)} className="input max-w-xs">
              <option value="">Select technician...</option>
              {technicians.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <button onClick={handleAssign} className="px-3 py-1.5 rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium">
              Assign
            </button>
          </div>
        )}
        {waLink && (
          <a href={waLink} target="_blank" rel="noreferrer" className="inline-block mt-3 text-sm text-emerald-700 hover:underline">
            Send WhatsApp notification to technician →
          </a>
        )}
      </div>

      {completion && (
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">Service Completion</h2>
          <dl className="text-sm space-y-1">
            <Row label="Technician" value={completion.technician_name} />
            <Row label="Work Done" value={completion.work_done} />
            <Row label="Extra Charges" value={`RM${Number(completion.extra_charges).toFixed(2)}`} />
            <Row label="Final Amount" value={`RM${Number(completion.final_amount).toFixed(2)}`} />
            <Row label="Remarks" value={completion.remarks || '—'} />
          </dl>
          {completion.media_urls?.length > 0 && (
            <div className="flex gap-2 mt-3 flex-wrap">
              {completion.media_urls.map((u) => (
                <a key={u} href={u} target="_blank" rel="noreferrer" className="block w-16 h-16 rounded border border-slate-200 overflow-hidden">
                  <img src={u} alt="attachment" className="w-full h-full object-cover" />
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg p-5">
        <h2 className="text-sm font-semibold text-slate-900 mb-3">History (traceability)</h2>
        <ul className="text-sm space-y-1">
          {history.map((h) => (
            <li key={h.id} className="flex justify-between text-slate-600">
              <span>
                {h.from_status ? `${h.from_status} → ` : ''}
                <span className="font-medium text-slate-900">{h.to_status}</span> by {h.changed_by}
                {h.note ? ` — ${h.note}` : ''}
              </span>
              <span className="text-slate-400">{new Date(h.changed_at).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function Info({ label, value, full }) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-slate-900">{value}</div>
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-slate-900 text-right">{value}</dd>
    </div>
  )
}
