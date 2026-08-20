const COLORS = {
  New: 'bg-slate-200 text-slate-700',
  Assigned: 'bg-blue-100 text-blue-700',
  'In Progress': 'bg-amber-100 text-amber-700',
  'Job Done': 'bg-emerald-100 text-emerald-700',
  Reviewed: 'bg-purple-100 text-purple-700',
  Closed: 'bg-slate-800 text-white',
}

export default function StatusBadge({ status }) {
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${COLORS[status] || 'bg-slate-100 text-slate-600'}`}>
      {status}
    </span>
  )
}
