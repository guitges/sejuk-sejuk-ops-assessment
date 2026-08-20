import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { getOrder, addServiceCompletion, addPayment, uploadAttachment, logNotification } from '../../lib/db'
import { buildWaLink, jobDoneCustomerMessage, jobDoneManagerMessage } from '../../lib/whatsapp'

const MAX_FILES = 6
const PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'Card', 'E-Wallet']

export default function JobComplete() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notAllowed, setNotAllowed] = useState(false)

  const [workDone, setWorkDone] = useState('')
  const [extraCharges, setExtraCharges] = useState('0')
  const [remarks, setRemarks] = useState('')
  const [files, setFiles] = useState([])
  const [recordPayment, setRecordPayment] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS[0])
  const [receiptFile, setReceiptFile] = useState(null)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  useEffect(() => {
    getOrder(id).then((o) => {
      setOrder(o)
      if (o.technicians?.name !== user.name) setNotAllowed(true)
      setLoading(false)
    })
  }, [id, user.name])

  const finalAmount = useMemo(() => {
    const quoted = Number(order?.quoted_price || 0)
    const extra = Number(extraCharges || 0)
    return quoted + extra
  }, [order, extraCharges])

  const handleFiles = (e) => {
    const selected = Array.from(e.target.files || [])
    setFiles(selected.slice(0, MAX_FILES))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const mediaUrls = []
      for (const f of files) {
        const url = await uploadAttachment(f, id)
        mediaUrls.push(url)
      }

      await addServiceCompletion(
        id,
        { workDone, extraCharges: Number(extraCharges || 0), finalAmount, remarks, mediaUrls },
        user.name,
      )

      if (recordPayment && paymentAmount) {
        let receiptUrl = null
        if (receiptFile) receiptUrl = await uploadAttachment(receiptFile, id)
        await addPayment(id, { amount: Number(paymentAmount), method: paymentMethod, receiptPhotoUrl: receiptUrl })
      }

      const time = new Date().toLocaleString()
      const customerMsg = jobDoneCustomerMessage({
        customerName: order.customer_name,
        orderNo: order.order_no,
        technicianName: user.name,
        time,
      })
      const customerLink = buildWaLink(order.phone, customerMsg)
      await logNotification({
        orderId: id,
        recipientType: 'customer',
        recipient: order.customer_name,
        message: customerMsg,
        deepLink: customerLink,
      })

      const managerMsg = jobDoneManagerMessage({ orderNo: order.order_no, technicianName: user.name, finalAmount })
      await logNotification({
        orderId: id,
        recipientType: 'manager',
        recipient: 'Manager',
        message: managerMsg,
        deepLink: null,
      })

      setResult({ customerLink, time })
    } catch (e2) {
      setError(e2.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Loading...</p>
  if (notAllowed) {
    return (
      <div className="max-w-md mx-auto bg-white border border-slate-200 rounded-lg p-6 text-sm">
        <p className="text-red-600 font-medium mb-1">This job is not assigned to you.</p>
        <p className="text-slate-500">Only the assigned technician ({order.technicians?.name || 'unassigned'}) can complete this job.</p>
      </div>
    )
  }

  if (result) {
    return (
      <div className="max-w-md mx-auto bg-white border border-slate-200 rounded-lg p-6 text-sm space-y-3">
        <p className="text-emerald-700 font-medium">Job marked as Job Done ✓</p>
        <p className="text-slate-500">Completed at {result.time}. Manager has been notified.</p>
        <a
          href={result.customerLink}
          target="_blank"
          rel="noreferrer"
          className="block text-center px-3 py-2 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
        >
          Send WhatsApp feedback request to customer
        </a>
        <button
          onClick={() => navigate('/technician')}
          className="w-full px-3 py-2 rounded-md border border-slate-300 font-medium"
        >
          Back to My Jobs
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-lg font-semibold text-slate-900 mb-4">Complete Job</h1>
      <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        {error && <p className="text-sm text-red-600">{error}</p>}

        <Field label="Order ID">
          <input disabled value={order.order_no} className="input bg-slate-50 text-slate-500" />
        </Field>

        <Field label="Work Done" required>
          <textarea required value={workDone} onChange={(e) => setWorkDone(e.target.value)} className="input" rows={3} />
        </Field>

        <Field label="Extra Charges (RM)">
          <input type="number" min="0" step="0.01" value={extraCharges} onChange={(e) => setExtraCharges(e.target.value)} className="input" />
        </Field>

        <Field label={`Photos / Video / PDF (max ${MAX_FILES})`}>
          <input type="file" multiple accept="image/*,video/*,application/pdf" onChange={handleFiles} className="text-sm" />
          <p className="text-xs text-slate-400 mt-1">{files.length} file(s) selected</p>
        </Field>

        <Field label="Final Amount (auto-calculated)">
          <input disabled value={`RM${finalAmount.toFixed(2)}`} className="input bg-slate-50 text-slate-700 font-medium" />
        </Field>

        <Field label="Remarks">
          <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} className="input" rows={2} />
        </Field>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-xs text-slate-500">Technician</div>
            <div className="font-medium">{user.name}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Timestamp</div>
            <div className="font-medium">{new Date().toLocaleString()}</div>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-4">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2">
            <input type="checkbox" checked={recordPayment} onChange={(e) => setRecordPayment(e.target.checked)} />
            Record payment received from customer
          </label>
          {recordPayment && (
            <div className="space-y-3">
              <Field label="Payment Amount (RM)">
                <input type="number" min="0" step="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} className="input" />
              </Field>
              <Field label="Payment Method">
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="input">
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Receipt Photo">
                <input type="file" accept="image/*" onChange={(e) => setReceiptFile(e.target.files?.[0] || null)} className="text-sm" />
              </Field>
            </div>
          )}
        </div>

        <button
          disabled={submitting}
          className="w-full px-3 py-2.5 rounded-md bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium"
        >
          {submitting ? 'Submitting...' : 'Mark Job Done'}
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
