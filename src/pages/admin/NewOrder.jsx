import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createOrder, listTechnicians } from '../../lib/db'
import { buildWaLink, jobAssignedMessage } from '../../lib/whatsapp'
import { logNotification } from '../../lib/db'

const SERVICE_TYPES = ['Aircond Cleaning', 'Repair', 'Gas Refill', 'Installation', 'Inspection']

const EMPTY_FORM = {
  customerName: '',
  phone: '',
  address: '',
  problemDescription: '',
  serviceType: SERVICE_TYPES[0],
  quotedPrice: '',
  assignedTechnicianId: '',
  adminNotes: '',
}

export default function NewOrder() {
  const navigate = useNavigate()
  const [form, setForm] = useState(EMPTY_FORM)
  const [technicians, setTechnicians] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [created, setCreated] = useState(null)
  const [waLink, setWaLink] = useState(null)

  useEffect(() => {
    listTechnicians().then(setTechnicians).catch(() => setTechnicians([]))
  }, [])

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const order = await createOrder({
        ...form,
        quotedPrice: form.quotedPrice ? Number(form.quotedPrice) : 0,
        assignedTechnicianId: form.assignedTechnicianId || null,
      })
      setCreated(order)

      if (order.assigned_technician_id && order.technicians?.name) {
        const message = jobAssignedMessage({
          technicianName: order.technicians.name,
          orderNo: order.order_no,
          customerName: order.customer_name,
          address: order.address,
          serviceType: order.service_type,
        })
        const tech = technicians.find((t) => t.id === order.assigned_technician_id)
        const link = buildWaLink(tech?.phone, message)
        setWaLink(link)
        await logNotification({
          orderId: order.id,
          recipientType: 'technician',
          recipient: order.technicians.name,
          message,
          deepLink: link,
        })
      }

      setForm(EMPTY_FORM)
    } catch (e2) {
      setError(e2.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (created) {
    return (
      <div className="max-w-lg mx-auto bg-white border border-slate-200 rounded-lg p-6">
        <h1 className="text-lg font-semibold text-slate-900 mb-1">Order created</h1>
        <p className="text-sm text-slate-500 mb-4">Order summary</p>
        <dl className="text-sm space-y-1 mb-4">
          <div className="flex justify-between"><dt className="text-slate-500">Order No</dt><dd className="font-medium">{created.order_no}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Customer</dt><dd>{created.customer_name}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Service</dt><dd>{created.service_type}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Quoted Price</dt><dd>RM{Number(created.quoted_price).toFixed(2)}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Technician</dt><dd>{created.technicians?.name || 'Unassigned'}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Status</dt><dd>{created.status}</dd></div>
        </dl>

        {waLink && (
          <a
            href={waLink}
            target="_blank"
            rel="noreferrer"
            className="block text-center mb-3 px-3 py-2 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium"
          >
            Send WhatsApp notification to technician
          </a>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => setCreated(null)}
            className="flex-1 px-3 py-2 rounded-md border border-slate-300 text-sm"
          >
            Create another
          </button>
          <button
            onClick={() => navigate(`/admin/orders/${created.id}`)}
            className="flex-1 px-3 py-2 rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium"
          >
            View order
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-lg font-semibold text-slate-900 mb-4">New Order</h1>
      <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="grid grid-cols-2 gap-4">
          <Field label="Customer Name" required>
            <input required value={form.customerName} onChange={set('customerName')} className="input" />
          </Field>
          <Field label="Phone" required>
            <input required value={form.phone} onChange={set('phone')} className="input" placeholder="+60..." />
          </Field>
        </div>

        <Field label="Address" required>
          <textarea required value={form.address} onChange={set('address')} className="input" rows={2} />
        </Field>

        <Field label="Problem Description">
          <textarea value={form.problemDescription} onChange={set('problemDescription')} className="input" rows={2} />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Service Type" required>
            <select required value={form.serviceType} onChange={set('serviceType')} className="input">
              {SERVICE_TYPES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Quoted Price (RM)" required>
            <input required type="number" min="0" step="0.01" value={form.quotedPrice} onChange={set('quotedPrice')} className="input" />
          </Field>
        </div>

        <Field label="Assigned Technician">
          <select value={form.assignedTechnicianId} onChange={set('assignedTechnicianId')} className="input">
            <option value="">Unassigned (assign later)</option>
            {technicians.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Admin Notes">
          <textarea value={form.adminNotes} onChange={set('adminNotes')} className="input" rows={2} />
        </Field>

        <button
          disabled={submitting}
          className="w-full px-3 py-2 rounded-md bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium"
        >
          {submitting ? 'Creating...' : 'Create Order'}
        </button>
      </form>
    </div>
  )
}

function Field({ label, required, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-600 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      {children}
    </label>
  )
}
