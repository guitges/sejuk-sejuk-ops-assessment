import { supabase } from './supabaseClient'

// ─────────────────────────────────────────────────────────────
// This module is the ONLY place that talks to Supabase tables.
// Every query here is narrow and purpose-built (specific columns,
// specific filters) rather than "select * from everything" — this
// is also the layer the AI query module (src/lib/ai.js) is
// restricted to, so the AI never gets raw database access.
// ─────────────────────────────────────────────────────────────

const ORDER_STATUSES = ['New', 'Assigned', 'In Progress', 'Job Done', 'Reviewed', 'Closed']

function unwrap({ data, error }) {
  if (error) throw new Error(error.message)
  return data
}

// ---- Technicians -------------------------------------------------

export async function listTechnicians() {
  return unwrap(
    await supabase.from('technicians').select('id, name, phone, active').eq('active', true).order('name'),
  )
}

// ---- Orders --------------------------------------------------------

export async function listOrders({ status, technicianId, search } = {}) {
  let q = supabase
    .from('orders')
    .select(
      'id, order_no, customer_name, phone, address, problem_description, service_type, quoted_price, status, admin_notes, created_at, updated_at, assigned_technician_id, technicians ( name )',
    )
    .order('created_at', { ascending: false })

  if (status) q = q.eq('status', status)
  if (technicianId) q = q.eq('assigned_technician_id', technicianId)
  if (search) q = q.or(`customer_name.ilike.%${search}%,order_no.ilike.%${search}%`)

  return unwrap(await q)
}

export async function getOrder(orderId) {
  return unwrap(
    await supabase
      .from('orders')
      .select(
        'id, order_no, customer_name, phone, address, problem_description, service_type, quoted_price, status, admin_notes, created_at, updated_at, assigned_technician_id, technicians ( id, name )',
      )
      .eq('id', orderId)
      .single(),
  )
}

export async function createOrder(payload, createdBy = 'Admin') {
  const status = payload.assignedTechnicianId ? 'Assigned' : 'New'
  const row = unwrap(
    await supabase
      .from('orders')
      .insert({
        customer_name: payload.customerName,
        phone: payload.phone,
        address: payload.address,
        problem_description: payload.problemDescription,
        service_type: payload.serviceType,
        quoted_price: payload.quotedPrice || 0,
        assigned_technician_id: payload.assignedTechnicianId || null,
        admin_notes: payload.adminNotes || null,
        status,
        created_by: createdBy,
      })
      .select(
        'id, order_no, customer_name, phone, address, problem_description, service_type, quoted_price, status, admin_notes, created_at, assigned_technician_id, technicians ( name )',
      )
      .single(),
  )

  await logStatusChange(row.id, null, status, createdBy, 'Order created')
  return row
}

export async function assignTechnician(orderId, technicianId, changedBy = 'Admin') {
  const order = unwrap(
    await supabase
      .from('orders')
      .update({ assigned_technician_id: technicianId, status: 'Assigned' })
      .eq('id', orderId)
      .select('id, status')
      .single(),
  )
  await logStatusChange(orderId, order.status, 'Assigned', changedBy, 'Technician assigned')
  return order
}

export async function updateOrderStatus(orderId, newStatus, changedBy, note) {
  if (!ORDER_STATUSES.includes(newStatus)) {
    throw new Error(`Invalid status: ${newStatus}`)
  }
  const current = unwrap(await supabase.from('orders').select('status').eq('id', orderId).single())
  const row = unwrap(
    await supabase.from('orders').update({ status: newStatus }).eq('id', orderId).select().single(),
  )
  await logStatusChange(orderId, current.status, newStatus, changedBy, note)
  return row
}

async function logStatusChange(orderId, fromStatus, toStatus, changedBy, note) {
  return unwrap(
    await supabase.from('order_status_history').insert({
      order_id: orderId,
      from_status: fromStatus,
      to_status: toStatus,
      changed_by: changedBy,
      note: note || null,
    }),
  )
}

export async function getOrderHistory(orderId) {
  return unwrap(
    await supabase
      .from('order_status_history')
      .select('id, from_status, to_status, changed_by, note, changed_at')
      .eq('order_id', orderId)
      .order('changed_at', { ascending: true }),
  )
}

// ---- Service completion (Module 2) ---------------------------------

export async function addServiceCompletion(orderId, payload, technicianName) {
  const completion = unwrap(
    await supabase
      .from('service_completions')
      .insert({
        order_id: orderId,
        technician_name: technicianName,
        work_done: payload.workDone,
        extra_charges: payload.extraCharges || 0,
        final_amount: payload.finalAmount || 0,
        remarks: payload.remarks || null,
        media_urls: payload.mediaUrls || [],
      })
      .select()
      .single(),
  )

  await updateOrderStatus(orderId, 'Job Done', technicianName, 'Service completed in the field')
  return completion
}

export async function getServiceCompletion(orderId) {
  const { data, error } = await supabase
    .from('service_completions')
    .select('*')
    .eq('order_id', orderId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

// ---- Payments (Module 2 bonus) --------------------------------------

export async function addPayment(orderId, payload) {
  return unwrap(
    await supabase
      .from('payments')
      .insert({
        order_id: orderId,
        amount: payload.amount,
        method: payload.method,
        receipt_photo_url: payload.receiptPhotoUrl || null,
      })
      .select()
      .single(),
  )
}

// ---- File uploads -----------------------------------------------------

export async function uploadAttachment(file, orderId) {
  const ext = file.name.split('.').pop()
  const path = `${orderId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error } = await supabase.storage.from('attachments').upload(path, file)
  if (error) throw new Error(error.message)
  const { data } = supabase.storage.from('attachments').getPublicUrl(path)
  return data.publicUrl
}

// ---- Notifications log (Module 3) -----------------------------------

export async function logNotification({ orderId, recipientType, recipient, message, deepLink }) {
  return unwrap(
    await supabase
      .from('notifications_log')
      .insert({
        order_id: orderId,
        recipient_type: recipientType,
        recipient,
        message,
        deep_link: deepLink,
      })
      .select()
      .single(),
  )
}

export async function listNotifications(orderId) {
  return unwrap(
    await supabase
      .from('notifications_log')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false }),
  )
}

/** Recent "job completed" notifications logged for the manager (Module 2 bonus). */
export async function listManagerNotifications(limit = 8) {
  return unwrap(
    await supabase
      .from('notifications_log')
      .select('id, message, created_at, orders ( order_no )')
      .eq('recipient_type', 'manager')
      .order('created_at', { ascending: false })
      .limit(limit),
  )
}

// ---- KPI / reporting queries (Bonus module + AI module) --------------

function daysAgoIso(days) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

function startOfTodayIso() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

/** Completed jobs (status in Job Done/Reviewed/Closed) with completion data, in a date range. */
export async function listCompletedJobs({ sinceIso, technicianName } = {}) {
  let q = supabase
    .from('service_completions')
    .select('id, order_id, technician_name, work_done, final_amount, extra_charges, created_at, orders ( order_no, service_type, customer_name )')
    .order('created_at', { ascending: false })

  if (sinceIso) q = q.gte('created_at', sinceIso)
  if (technicianName) q = q.ilike('technician_name', technicianName)

  return unwrap(await q)
}

export async function jobsCompletedToday() {
  return listCompletedJobs({ sinceIso: startOfTodayIso() })
}

export async function jobsCompletedThisWeek() {
  return listCompletedJobs({ sinceIso: daysAgoIso(7) })
}

/** Weekly leaderboard: jobs completed + total amount per technician. */
export async function weeklyLeaderboard() {
  const jobs = await jobsCompletedThisWeek()
  const byTech = new Map()
  for (const j of jobs) {
    const key = j.technician_name
    if (!byTech.has(key)) byTech.set(key, { technician: key, jobsCompleted: 0, totalAmount: 0 })
    const entry = byTech.get(key)
    entry.jobsCompleted += 1
    entry.totalAmount += Number(j.final_amount || 0)
  }
  return Array.from(byTech.values()).sort((a, b) => b.jobsCompleted - a.jobsCompleted)
}

/** Orders that were postponed/rescheduled — approximated via status history notes. */
export async function weeklyPostponeCount() {
  const { data, error } = await supabase
    .from('order_status_history')
    .select('id, order_id, note, changed_at')
    .ilike('note', '%postpone%')
    .gte('changed_at', daysAgoIso(7))
  if (error) throw new Error(error.message)
  return data.length
}

export { ORDER_STATUSES }
