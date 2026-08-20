import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { listTechnicians } from '../lib/db'

const ROLE_HOME = { admin: '/admin', technician: '/technician', manager: '/manager' }

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [technicians, setTechnicians] = useState([])
  const [selectedTech, setSelectedTech] = useState('')

  useEffect(() => {
    listTechnicians()
      .then((rows) => {
        setTechnicians(rows)
        if (rows.length) setSelectedTech(rows[0].name)
      })
      .catch(() => setTechnicians([]))
  }, [])

  const handleLogin = (role) => {
    const name = role === 'technician' ? selectedTech || 'Ali' : role === 'admin' ? 'Admin' : 'Manager'
    login(role, name)
    navigate(ROLE_HOME[role])
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 px-4">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 max-w-md w-full p-8">
        <h1 className="text-xl font-semibold text-slate-900">Sejuk Sejuk Service</h1>
        <p className="text-sm text-slate-500 mt-1 mb-6">Operations system — pick a role to continue (mock login).</p>

        <div className="space-y-3">
          <button
            onClick={() => handleLogin('admin')}
            className="w-full text-left px-4 py-3 rounded-lg border border-slate-200 hover:border-brand-400 hover:bg-brand-50 transition-colors"
          >
            <div className="font-medium text-slate-900">Admin</div>
            <div className="text-xs text-slate-500">Create orders, assign technicians</div>
          </button>

          <div className="px-4 py-3 rounded-lg border border-slate-200">
            <div className="font-medium text-slate-900 mb-2">Technician</div>
            <select
              value={selectedTech}
              onChange={(e) => setSelectedTech(e.target.value)}
              className="w-full mb-2 border border-slate-300 rounded-md px-2 py-1.5 text-sm"
            >
              {technicians.length === 0 && <option>Ali</option>}
              {technicians.map((t) => (
                <option key={t.id} value={t.name}>
                  {t.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => handleLogin('technician')}
              className="w-full px-3 py-1.5 rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium"
            >
              Continue as {selectedTech || 'technician'}
            </button>
          </div>

          <button
            onClick={() => handleLogin('manager')}
            className="w-full text-left px-4 py-3 rounded-lg border border-slate-200 hover:border-brand-400 hover:bg-brand-50 transition-colors"
          >
            <div className="font-medium text-slate-900">Manager</div>
            <div className="text-xs text-slate-500">Review jobs, KPI dashboard, ask AI</div>
          </button>
        </div>

        <p className="text-xs text-slate-400 mt-6">
          Real authentication is not implemented per the assessment brief — this is a role switcher only.
        </p>
      </div>
    </div>
  )
}
