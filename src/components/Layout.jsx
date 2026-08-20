import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const NAV_BY_ROLE = {
  admin: [
    { to: '/admin', label: 'Orders' },
    { to: '/admin/new', label: 'New Order' },
  ],
  technician: [{ to: '/technician', label: 'My Jobs' }],
  manager: [
    { to: '/manager', label: 'Review Queue' },
    { to: '/manager/dashboard', label: 'KPI Dashboard' },
    { to: '/manager/ai', label: 'Ask AI' },
  ],
}

export default function Layout({ children }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  if (!user) return children

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-brand-800 text-white">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <span className="font-semibold tracking-tight">Sejuk Sejuk Ops</span>
            <nav className="flex flex-wrap gap-1">
              {(NAV_BY_ROLE[user.role] || []).map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/admin' || item.to === '/manager' || item.to === '/technician'}
                  className={({ isActive }) =>
                    `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      isActive ? 'bg-white text-brand-800' : 'text-brand-100 hover:bg-brand-700'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-brand-100 truncate max-w-[40vw] sm:max-w-none">
              {user.name} <span className="text-brand-300">·</span> {user.role}
            </span>
            <button
              onClick={handleLogout}
              className="shrink-0 px-2.5 py-1 rounded-md bg-brand-700 hover:bg-brand-600 text-white text-xs font-medium"
            >
              Switch role
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6">{children}</main>
    </div>
  )
}
