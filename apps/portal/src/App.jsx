import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import ProtectedRoute from './components/ProtectedRoute'

// 즉시 로드 (공통)
import Login from './pages/Login'
import Home from './pages/Home'
import SchoolSetup from './pages/SchoolSetup'
import PrivacyPolicy from './pages/PrivacyPolicy'

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

// 스마트 공지 - lazy load
const NoticeList    = lazy(() => import('./pages/notices/NoticeList'))
const StudentPortal = lazy(() => import('./pages/student/StudentPortal'))

// 슈퍼 어드민 - lazy load
const SuperAdmin            = lazy(() => import('./pages/SuperAdmin'))
const SuperAdminGuests      = lazy(() => import('./pages/SuperAdminGuests'))
const SuperAdminDomainSetup = lazy(() => import('./pages/SuperAdminDomainSetup'))

// 도구모음 - lazy load
const ToolsHome          = lazy(() => import('./pages/tools/ToolsHome'))
const QrNoticeGenerator  = lazy(() => import('./pages/tools/QrNoticeGenerator'))
const AsaSupport         = lazy(() => import('./pages/tools/AsaSupport'))
const AsaSupportCutoffs  = lazy(() => import('./pages/tools/AsaSupportCutoffs'))
const GradeRankCalculator    = lazy(() => import('./pages/tools/GradeRankCalculator'))
const AsaChecklistHome       = lazy(() => import('./pages/tools/AsaChecklistHome'))
const AsaChecklistAdmin      = lazy(() => import('./pages/tools/AsaChecklistAdmin'))
const AsaChecklistPrincipal  = lazy(() => import('./pages/tools/AsaChecklistPrincipal'))
const AsaChecklistForm       = lazy(() => import('./pages/tools/AsaChecklistForm'))
const AsaChecklistFormResult = lazy(() => import('./pages/tools/AsaChecklistFormResult'))


function PageLoader() {
  return (
    <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
      <CircularProgress />
    </Box>
  )
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* ── 공개 ── */}
          <Route path="/login" element={<Login />} />
          <Route path="/school-setup" element={<SchoolSetup />} />
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
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

          {/* ── 스마트 공지 ── */}
          <Route path="/notices" element={<ProtectedRoute><NoticeList /></ProtectedRoute>} />

          {/* ── 학생 포털 ── */}
          <Route path="/student" element={<ProtectedRoute anyUser studentAllowed><StudentPortal /></ProtectedRoute>} />

          {/* ── 관리자 전용 ── */}
          <Route path="/admin" element={<ProtectedRoute adminOnly><Admin /></ProtectedRoute>} />

          {/* ── 도구모음 ── */}
          <Route path="/tools"                    element={<ProtectedRoute anyUser><ToolsHome /></ProtectedRoute>} />
          <Route path="/tools/qr-notice"           element={<ProtectedRoute anyUser><QrNoticeGenerator /></ProtectedRoute>} />
          <Route path="/tools/asa-support"         element={<ProtectedRoute anyUser><AsaSupport /></ProtectedRoute>} />
          <Route path="/tools/asa-support/cutoffs" element={<ProtectedRoute adminOnly><AsaSupportCutoffs /></ProtectedRoute>} />
          <Route path="/tools/asa-checklist"                         element={<ProtectedRoute anyUser><AsaChecklistHome /></ProtectedRoute>} />
          <Route path="/tools/asa-checklist/admin"                    element={<ProtectedRoute adminOnly><AsaChecklistAdmin /></ProtectedRoute>} />
          <Route path="/tools/asa-checklist/principal"                element={<ProtectedRoute principalAllowed><AsaChecklistPrincipal /></ProtectedRoute>} />
          <Route path="/tools/asa-checklist/:subjectId/process"       element={<ProtectedRoute anyUser><AsaChecklistForm /></ProtectedRoute>} />
          <Route path="/tools/asa-checklist/:subjectId/result"        element={<ProtectedRoute anyUser><AsaChecklistFormResult /></ProtectedRoute>} />
          <Route path="/tools/grade-rank"          element={<ProtectedRoute anyUser><GradeRankCalculator /></ProtectedRoute>} />

          {/* ── 연수 서명부 ── */}
          <Route path="/training"              element={<ProtectedRoute anyUser><TrainingList /></ProtectedRoute>} />
          <Route path="/training/new"          element={<ProtectedRoute anyUser><TrainingCreate /></ProtectedRoute>} />
          <Route path="/training/presets"      element={<ProtectedRoute adminOnly><TrainingPresets /></ProtectedRoute>} />
          <Route path="/training/:id/sign"     element={<ProtectedRoute anyUser><TrainingSign /></ProtectedRoute>} />
          <Route path="/training/:id"          element={<ProtectedRoute anyUser><TrainingDetail /></ProtectedRoute>} />

          {/* ── 슈퍼 어드민 ── */}
          <Route path="/super-admin" element={<ProtectedRoute superAdminOnly><SuperAdmin /></ProtectedRoute>} />
          <Route path="/super-admin/guests" element={<ProtectedRoute superAdminOnly><SuperAdminGuests /></ProtectedRoute>} />
          <Route path="/super-admin/domain-setup" element={<ProtectedRoute superAdminOnly><SuperAdminDomainSetup /></ProtectedRoute>} />

        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
