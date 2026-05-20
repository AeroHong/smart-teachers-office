import { Navigate } from 'react-router-dom'
import CircularProgress from '@mui/material/CircularProgress'
import Box from '@mui/material/Box'
import { useAuth } from '../contexts/AuthContext'
import PendingApproval from '../pages/PendingApproval'

export default function ProtectedRoute({
  children,
  adminOnly = false,
  anyUser = false,
  superAdminOnly = false,
}) {
  const { user, role, isSuperAdmin, loading, needsSchoolSetup } = useAuth()

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  // 학교 미설정 → 학교 선택/등록 페이지
  if (needsSchoolSetup) return <Navigate to="/school-setup" replace />

  // 슈퍼 어드민 전용
  if (superAdminOnly) {
    return isSuperAdmin ? children : <Navigate to="/" replace />
  }

  // anyUser: 로그인만 하면 접근 가능 (포털 홈, 보강신청 등)
  if (anyUser) return children

  // 슈퍼 어드민은 모든 페이지 접근 가능
  if (isSuperAdmin) return children

  // 학생은 출결 교사 기능 접근 불가
  if (role === 'student') return <Navigate to="/" replace />

  // 미승인 교사
  if (role === 'pending') return <PendingApproval />
  if (role === 'rejected') return <Navigate to="/login" replace />

  // 관리자 전용 페이지
  if (adminOnly && role !== 'admin' && role !== 'school_admin') return <Navigate to="/" replace />

  return children
}
