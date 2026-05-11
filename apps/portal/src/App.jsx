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
const TeacherDashboard    = lazy(() => import('./pages/attendance/TeacherDashboard'))
const StudentList         = lazy(() => import('./pages/attendance/StudentList'))
const EventCreate         = lazy(() => import('./pages/attendance/EventCreate'))
const EventEdit           = lazy(() => import('./pages/attendance/EventEdit'))
const AttendanceDashboard = lazy(() => import('./pages/attendance/AttendanceDashboard'))
const StatsDashboard      = lazy(() => import('./pages/attendance/StatsDashboard'))
const StudentCheckin      = lazy(() => import('./pages/attendance/StudentCheckin'))
const Admin               = lazy(() => import('./pages/attendance/Admin'))

// 연수 서명부 - lazy load
const TrainingList    = lazy(() => import('./pages/training/TrainingList'))
const TrainingCreate  = lazy(() => import('./pages/training/TrainingCreate'))
const TrainingDetail  = lazy(() => import('./pages/training/TrainingDetail'))
const TrainingSign    = lazy(() => import('./pages/training/TrainingSign'))
const TrainingPresets = lazy(() => import('./pages/training/TrainingPresets'))

// 슈퍼 어드민 - lazy load
const SuperAdmin = lazy(() => import('./pages/SuperAdmin'))

// 데모 - lazy load
const DemoHome       = lazy(() => import('./pages/demo/DemoHome'))
const DemoCover      = lazy(() => import('./pages/demo/DemoCover'))
const DemoTraining   = lazy(() => import('./pages/demo/DemoTraining'))
const DemoAttendance = lazy(() => import('./pages/demo/DemoAttendance'))

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
          <Route path="/admin" element={<ProtectedRoute adminOnly><Admin /></ProtectedRoute>} />

          {/* ── 연수 서명부 ── */}
          <Route path="/training"              element={<ProtectedRoute anyUser><TrainingList /></ProtectedRoute>} />
          <Route path="/training/new"          element={<ProtectedRoute anyUser><TrainingCreate /></ProtectedRoute>} />
          <Route path="/training/presets"      element={<ProtectedRoute adminOnly><TrainingPresets /></ProtectedRoute>} />
          <Route path="/training/:id/sign"     element={<ProtectedRoute anyUser><TrainingSign /></ProtectedRoute>} />
          <Route path="/training/:id"          element={<ProtectedRoute anyUser><TrainingDetail /></ProtectedRoute>} />

          {/* ── 슈퍼 어드민 ── */}
          <Route path="/super-admin" element={<ProtectedRoute superAdminOnly><SuperAdmin /></ProtectedRoute>} />

          {/* ── 데모 (로그인 불필요) ── */}
          <Route path="/demo"            element={<DemoHome />} />
          <Route path="/demo/cover"      element={<DemoCover />} />
          <Route path="/demo/training"   element={<DemoTraining />} />
          <Route path="/demo/attendance" element={<DemoAttendance />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
