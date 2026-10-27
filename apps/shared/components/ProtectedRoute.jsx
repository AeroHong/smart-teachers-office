import { Navigate, useLocation } from 'react-router-dom'
import CircularProgress from '@mui/material/CircularProgress'
import Box from '@mui/material/Box'
import { useAuth } from '@shared/contexts/AuthContext'
import PendingApproval from '@shared/pages/PendingApproval'

export default function ProtectedRoute({
  children,
  adminOnly = false,
  anyUser = false,
  superAdminOnly = false,
  studentAllowed = false,
  principalAllowed = false,  // 교감도 접근 가능한 페이지
  superAdminRedirect = null, // 슈퍼 어드민이 오면 대신 보낼 곳 (학교 소속이 없어 학교 화면이 비는 페이지)
}) {
  const { user, role, isSuperAdmin, loading, needsSchoolSetup } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    )
  }

  // 로그인 뒤 원래 가려던 곳으로(공유 링크로 들어온 경우) — Login이 state.from을 읽는다
  if (!user) return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />

  // 학교 미설정 → 학교 선택/등록 페이지
  if (needsSchoolSetup) return <Navigate to="/school-setup" replace />

  // 슈퍼 어드민은 학교 소속이 없다 — 학교 홈 같은 화면 대신 시스템 관리 화면으로
  if (isSuperAdmin && superAdminRedirect) return <Navigate to={superAdminRedirect} replace />

  // 슈퍼 어드민 전용
  if (superAdminOnly) {
    return isSuperAdmin ? children : <Navigate to="/" replace />
  }

  // anyUser: 로그인만 하면 접근 가능 (포털 홈, 보강신청 등)
  // 단, 학생은 studentAllowed 표시된 페이지(학생 포털)만 접근 가능
  if (anyUser) {
    if (role === 'student' && !studentAllowed) return <Navigate to="/student" replace />
    return children
  }

  // 슈퍼 어드민은 모든 페이지 접근 가능
  if (isSuperAdmin) return children

  // 학생은 교사 전용 페이지 접근 불가 → 학생 포털로
  if (role === 'student') return <Navigate to="/student" replace />

  // 미승인 교사
  if (role === 'pending') return <PendingApproval />
  if (role === 'rejected') return <Navigate to="/login" replace />

  // 교감 전용: principalAllowed 없는 페이지는 홈으로
  if (role === 'principal' && !principalAllowed && !adminOnly) return children
  if (role === 'principal' && adminOnly) return <Navigate to="/" replace />

  // 관리자 전용 페이지
  if (adminOnly && role !== 'admin' && role !== 'school_admin') return <Navigate to="/" replace />

  return children
}
