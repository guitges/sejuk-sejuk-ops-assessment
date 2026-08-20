import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { weeklyLeaderboard, weeklyPostponeCount, jobsCompletedThisWeek } from '../../lib/db'

export default function Dashboard() {
  const [leaderboard, setLeaderboard] = useState([])
  const [postpones, setPostpones] = useState(0)
  const [totalJobs, setTotalJobs] = useState(0)
  const [totalAmount, setTotalAmount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([weeklyLeaderboard(), weeklyPostponeCount(), jobsCompletedThisWeek()]).then(
      ([lb, pp, jobs]) => {
        setLeaderboard(lb)
        setPostpones(pp)
        setTotalJobs(jobs.length)
        setTotalAmount(jobs.reduce((s, j) => s + Number(j.final_amount || 0), 0))
        setLoading(false)
      },
    )
  }, [])

  if (loading) return <p className="text-sm text-slate-500">Loading...</p>

  return (
    <div>
      <h1 className="text-lg font-semibold text-slate-900 mb-1">KPI Dashboard</h1>
      <p className="text-sm text-slate-500 mb-5">Last 7 days</p>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Jobs Completed" value={totalJobs} />
        <StatCard label="Total Amount" value={`RM${totalAmount.toFixed(2)}`} />
        <StatCard label="Active Technicians" value={leaderboard.length} />
        <StatCard label="Postponed / Rescheduled" value={postpones} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">Jobs Completed by Technician</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={leaderboard}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="technician" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="jobsCompleted" fill="#0a83bb" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">Leaderboard</h2>
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500 uppercase">
              <tr>
                <th className="text-left py-1">#</th>
                <th className="text-left py-1">Technician</th>
                <th className="text-right py-1">Jobs</th>
                <th className="text-right py-1">Total (RM)</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((row, i) => (
                <tr key={row.technician} className="border-t border-slate-100">
                  <td className="py-1.5">{i + 1}</td>
                  <td className="py-1.5 font-medium">{row.technician}</td>
                  <td className="py-1.5 text-right">{row.jobsCompleted}</td>
                  <td className="py-1.5 text-right">{row.totalAmount.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className="text-2xl font-semibold text-slate-900">{value}</div>
    </div>
  )
}
