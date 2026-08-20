// WhatsApp deep-link notifications (Module 3).
// No WhatsApp Business API keys required for the assessment: we build a
// wa.me deep link with a pre-filled message. In production this would be
// swapped for the WhatsApp Cloud API, triggered server-side on the same
// status transition.

function digitsOnly(phone) {
  return (phone || '').replace(/[^\d]/g, '')
}

export function buildWaLink(phone, message) {
  const number = digitsOnly(phone)
  const text = encodeURIComponent(message)
  return number ? `https://wa.me/${number}?text=${text}` : `https://wa.me/?text=${text}`
}

export function jobAssignedMessage({ technicianName, orderNo, customerName, address, serviceType }) {
  return `Hi ${technicianName}, you have a new job assigned.\nOrder: ${orderNo}\nCustomer: ${customerName}\nAddress: ${address}\nService: ${serviceType}\nPlease check the technician portal for details.`
}

export function jobDoneCustomerMessage({ customerName, orderNo, technicianName, time }) {
  return `Hi ${customerName},\nJob ${orderNo} has been completed by Technician ${technicianName} at ${time}.\nPlease check and leave feedback.\nThank you!`
}

export function jobDoneManagerMessage({ orderNo, technicianName, finalAmount }) {
  return `Job ${orderNo} marked Job Done by ${technicianName}. Final amount: RM${finalAmount}. Please review when ready.`
}
