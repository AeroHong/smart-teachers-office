import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import PendingApproval from '../pages/PendingApproval'

export default function ProtectedRoute({ children, adminOnly = false }) {
  const { user, role, loading } = useAuth()

  if (loading) return <div style={{ padding: '2rem' }}>로딩 중...</div>
  if (!user) return <Navigate to="/login" replace />
  if (role === 'pending') return <PendingApproval />
  if (role === 'rejected') return <Navigate to="/login" replace />
  if (adminOnly && role !== 'admin' && role !== 'school_admin') return <Navigate to="/" replace />

  return children
}
