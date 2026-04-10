import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import ProtectedRoute from './components/ProtectedRoute'

// 즉시 로드 (공통)
import Login from './pages/Login'
import Home from './pages/Home'

// 보강신청
import CoverMain from './pages/cover/CoverMain'
import CoverMypage from './pages/cover/CoverMypage'
import CoverStatus from './pages/cover/CoverStatus'

// 출결 - lazy load (무거운 번들 분리)
const TeacherDashboard   = lazy(() => import('./pages/attendance/TeacherDashboard'))
const StudentList        = lazy(() => import('./pages/attendance/StudentList'))
const EventCreate        = lazy(() => import('./pages/attendance/EventCreate'))
const EventEdit          = lazy(() => import('./pages/attendance/EventEdit'))
const AttendanceDashboard = lazy(() => import('./pages/attendance/AttendanceDashboard'))
const StatsDashboard     = lazy(() => import('./pages/attendance/StatsDashboard'))
const StudentCheckin     = lazy(() => import('./pages/attendance/StudentCheckin'))
const Admin              = lazy(() => import('./pages/attendance/Admin'))

function PageLoader() {
  return (
    <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
      <CircularProgress />
    </Box>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* ── 공개 ── */}
          <Route path="/login" element={<Login />} />
          <Route path="/attendance/checkin/:schoolId/:eventId" element={<StudentCheckin />} />

          {/* ── 포털 (로그인만 하면 접근) ── */}
          <Route path="/" element={<ProtectedRoute anyUser><Home /></ProtectedRoute>} />

          {/* ── 보강신청 (로그인만 하면 접근) ── */}
          <Route path="/cover"         element={<ProtectedRoute anyUser><CoverMain /></ProtectedRoute>} />
          <Route path="/cover/mypage"  element={<ProtectedRoute anyUser><CoverMypage /></ProtectedRoute>} />
          <Route path="/cover/status"  element={<ProtectedRoute anyUser><CoverStatus /></ProtectedRoute>} />

          {/* ── 출결 (교사 승인 필요) ── */}
          <Route path="/attendance"                       element={<ProtectedRoute><TeacherDashboard /></ProtectedRoute>} />
          <Route path="/attendance/students"              element={<ProtectedRoute><StudentList /></ProtectedRoute>} />
          <Route path="/attendance/events/new"            element={<ProtectedRoute><EventCreate /></ProtectedRoute>} />
          <Route path="/attendance/events/:eventId"       element={<ProtectedRoute><AttendanceDashboard /></ProtectedRoute>} />
          <Route path="/attendance/events/:eventId/edit"  element={<ProtectedRoute><EventEdit /></ProtectedRoute>} />
          <Route path="/attendance/stats"                 element={<ProtectedRoute><StatsDashboard /></ProtectedRoute>} />

          {/* ── 관리자 전용 ── */}
          <Route path="/attendance/admin" element={<ProtectedRoute adminOnly><Admin /></ProtectedRoute>} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
