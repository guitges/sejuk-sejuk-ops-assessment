import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import OrdersList from './pages/admin/OrdersList'
import NewOrder from './pages/admin/NewOrder'
import OrderDetail from './pages/admin/OrderDetail'
import JobsList from './pages/technician/JobsList'
import JobComplete from './pages/technician/JobComplete'
import ReviewQueue from './pages/manager/ReviewQueue'
import Dashboard from './pages/manager/Dashboard'
import AIQuery from './pages/manager/AIQuery'

function RequireRole({ role, children }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/" replace />
  if (user.role !== role) return <Navigate to="/" replace />
  return children
}

export default function App() {
  const { user } = useAuth()

  return (
    <Layout>
      <Routes>
        <Route path="/" element={user ? <Navigate to={`/${user.role}`} replace /> : <Login />} />

        <Route path="/admin" element={<RequireRole role="admin"><OrdersList /></RequireRole>} />
        <Route path="/admin/new" element={<RequireRole role="admin"><NewOrder /></RequireRole>} />
        <Route path="/admin/orders/:id" element={<RequireRole role="admin"><OrderDetail /></RequireRole>} />

        <Route path="/technician" element={<RequireRole role="technician"><JobsList /></RequireRole>} />
        <Route path="/technician/jobs/:id" element={<RequireRole role="technician"><JobComplete /></RequireRole>} />

        <Route path="/manager" element={<RequireRole role="manager"><ReviewQueue /></RequireRole>} />
        <Route path="/manager/dashboard" element={<RequireRole role="manager"><Dashboard /></RequireRole>} />
        <Route path="/manager/ai" element={<RequireRole role="manager"><AIQuery /></RequireRole>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}
