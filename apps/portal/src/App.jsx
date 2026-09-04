import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import ProtectedRoute from '@shared/components/ProtectedRoute'

// 즉시 로드 (공통)
import Login from './pages/Login'
import Home from './pages/Home'
import Messenger from './pages/Messenger'
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

// 교수학습 및 평가 운영 계획 - lazy load
const EvalPlanHome             = lazy(() => import('./pages/evalplan/EvalPlanHome'))
const EvalPlanSubmit           = lazy(() => import('./pages/evalplan/EvalPlanSubmit'))
const EvalPlanDetail           = lazy(() => import('./pages/evalplan/EvalPlanDetail'))
const EvalPlanEdit             = lazy(() => import('./pages/evalplan/EvalPlanEdit'))
const EvalPlanManagerDashboard = lazy(() => import('./pages/evalplan/EvalPlanManagerDashboard'))

// 검·인정도서 선정 - lazy load
const TextbookHome             = lazy(() => import('./pages/textbook/TextbookHome'))
const TextbookEvaluate         = lazy(() => import('./pages/textbook/TextbookEvaluate'))
const TextbookDetail           = lazy(() => import('./pages/textbook/TextbookDetail'))
const TextbookManagerDashboard = lazy(() => import('./pages/textbook/TextbookManagerDashboard'))
const TextbookPrincipalConfirm = lazy(() => import('./pages/textbook/TextbookPrincipalConfirm'))

// 생기부 세특 점검 도구 - lazy load
const SetukUpload         = lazy(() => import('./pages/setuk/SetukUpload'))
const SetukCheckDetail    = lazy(() => import('./pages/setuk/SetukCheckDetail'))
const SetukSubjectDetail  = lazy(() => import('./pages/setuk/SetukSubjectDetail'))
const SetukGuide          = lazy(() => import('./pages/setuk/SetukGuide'))

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

// 관리자
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'))
const AdminHome = lazy(() => import('./pages/admin/AdminHome'))
const AdminAccounts = lazy(() => import('./pages/admin/AdminAccounts'))
const AdminStaff = lazy(() => import('./pages/admin/AdminStaff'))
const AdminStudents = lazy(() => import('./pages/admin/AdminStudents'))
const AdminSubjects = lazy(() => import('./pages/admin/AdminSubjects'))
const AdminSpaces = lazy(() => import('./pages/admin/AdminSpaces'))
const AdminAcademicCalendar = lazy(() => import('./pages/admin/AdminAcademicCalendar'))
const AdminDashboardModules = lazy(() => import('./pages/admin/AdminDashboardModules'))
const AdminEvalPlanManagers = lazy(() => import('./pages/admin/AdminEvalPlanManagers'))
const AdminTextbookSubjects = lazy(() => import('./pages/admin/AdminTextbookSubjects'))
const AdminTextbookDeptHeads = lazy(() => import('./pages/admin/AdminTextbookDeptHeads'))

// 도구모음 - lazy load
const ToolsHome          = lazy(() => import('./pages/tools/ToolsHome'))
const QrNoticeGenerator  = lazy(() => import('./pages/tools/QrNoticeGenerator'))
const AsaSupport         = lazy(() => import('./pages/tools/AsaSupport'))
const AsaSupportCutoffs  = lazy(() => import('./pages/tools/AsaSupportCutoffs'))
const GradeRankCalculator    = lazy(() => import('./pages/tools/GradeRankCalculator'))
const MinAchievement         = lazy(() => import('./pages/tools/MinAchievement'))
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
          <Route path="/messenger" element={<ProtectedRoute anyUser><Messenger /></ProtectedRoute>} />

          {/* ── 보강신청 (로그인만 하면 접근) ── */}
          <Route path="/cover"         element={<ProtectedRoute anyUser><CoverMain /></ProtectedRoute>} />
          <Route path="/cover/mypage"  element={<ProtectedRoute anyUser><CoverMypage /></ProtectedRoute>} />
          <Route path="/cover/status"  element={<ProtectedRoute anyUser><CoverStatus /></ProtectedRoute>} />

          {/* ── 교수학습 및 평가 운영 계획 (로그인만 하면 접근, 조회 범위는 컴포넌트 내부에서 판정) ── */}
          <Route path="/evalplan"              element={<ProtectedRoute anyUser><EvalPlanHome /></ProtectedRoute>} />
          <Route path="/evalplan/new"          element={<ProtectedRoute anyUser><EvalPlanSubmit /></ProtectedRoute>} />
          <Route path="/evalplan/all"          element={<ProtectedRoute anyUser><EvalPlanManagerDashboard /></ProtectedRoute>} />
          <Route path="/evalplan/:planId"      element={<ProtectedRoute anyUser><EvalPlanDetail /></ProtectedRoute>} />
          <Route path="/evalplan/:planId/edit" element={<ProtectedRoute anyUser><EvalPlanEdit /></ProtectedRoute>} />

          {/* ── 검·인정도서 선정 (로그인만 하면 접근, 조회·채점 권한은 컴포넌트 내부에서 판정) ── */}
          <Route path="/textbook"                       element={<ProtectedRoute anyUser><TextbookHome /></ProtectedRoute>} />
          <Route path="/textbook/all"                    element={<ProtectedRoute anyUser><TextbookManagerDashboard /></ProtectedRoute>} />
          <Route path="/textbook/principal"               element={<ProtectedRoute anyUser principalAllowed><TextbookPrincipalConfirm /></ProtectedRoute>} />
          <Route path="/textbook/:adoptionId"             element={<ProtectedRoute anyUser><TextbookDetail /></ProtectedRoute>} />
          <Route path="/textbook/:adoptionId/evaluate"    element={<ProtectedRoute anyUser><TextbookEvaluate /></ProtectedRoute>} />

          <Route path="/setuk"                        element={<ProtectedRoute anyUser><SetukUpload /></ProtectedRoute>} />
          <Route path="/setuk/guide"                  element={<ProtectedRoute anyUser><SetukGuide /></ProtectedRoute>} />
          <Route path="/setuk/subject/:subjectName"  element={<ProtectedRoute anyUser><SetukSubjectDetail /></ProtectedRoute>} />
          <Route path="/setuk/:checkId"               element={<ProtectedRoute anyUser><SetukCheckDetail /></ProtectedRoute>} />

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
          <Route path="/admin" element={<ProtectedRoute adminOnly><AdminLayout /></ProtectedRoute>}>
            <Route index element={<AdminHome />} />
            <Route path="accounts" element={<AdminAccounts />} />
            <Route path="staff" element={<AdminStaff />} />
            <Route path="students" element={<AdminStudents />} />
            <Route path="subjects" element={<AdminSubjects />} />
            <Route path="spaces" element={<AdminSpaces />} />
            <Route path="academic-calendar" element={<AdminAcademicCalendar />} />
            <Route path="dashboard-modules" element={<AdminDashboardModules />} />
            <Route path="evaluation-plan-managers" element={<AdminEvalPlanManagers />} />
            <Route path="textbook-subjects" element={<AdminTextbookSubjects />} />
            <Route path="textbook-dept-heads" element={<AdminTextbookDeptHeads />} />

            {/* 기존 도구 페이지들 */}
            <Route path="asa-cutoffs" element={<AsaSupportCutoffs />} />
            <Route path="asa-checklist" element={<AsaChecklistAdmin />} />
            <Route path="training-presets" element={<TrainingPresets />} />
          </Route>

          {/* ── 구 관리자 경로 리다이렉트 ── */}
          <Route path="/admin/users" element={<Navigate to="/admin/accounts" replace />} />
          <Route path="/tools/asa-support/cutoffs" element={<Navigate to="/admin/asa-cutoffs" replace />} />
          <Route path="/tools/asa-checklist/admin" element={<Navigate to="/admin/asa-checklist" replace />} />
          <Route path="/training/presets"          element={<Navigate to="/admin/training-presets" replace />} />

          {/* ── 도구모음 ── */}
          <Route path="/tools"                    element={<ProtectedRoute anyUser><ToolsHome /></ProtectedRoute>} />
          <Route path="/tools/qr-notice"           element={<ProtectedRoute anyUser><QrNoticeGenerator /></ProtectedRoute>} />
          <Route path="/tools/asa-support"         element={<ProtectedRoute anyUser><AsaSupport /></ProtectedRoute>} />
          <Route path="/tools/min-achievement"     element={<ProtectedRoute anyUser><MinAchievement /></ProtectedRoute>} />
          <Route path="/tools/asa-checklist"                         element={<ProtectedRoute anyUser><AsaChecklistHome /></ProtectedRoute>} />
          <Route path="/tools/asa-checklist/principal"                element={<ProtectedRoute principalAllowed><AsaChecklistPrincipal /></ProtectedRoute>} />
          <Route path="/tools/asa-checklist/:subjectId/process"       element={<ProtectedRoute anyUser><AsaChecklistForm /></ProtectedRoute>} />
          <Route path="/tools/asa-checklist/:subjectId/result"        element={<ProtectedRoute anyUser><AsaChecklistFormResult /></ProtectedRoute>} />
          <Route path="/tools/grade-rank"          element={<ProtectedRoute anyUser><GradeRankCalculator /></ProtectedRoute>} />

          {/* ── 연수 서명부 ── */}
          <Route path="/training"              element={<ProtectedRoute anyUser><TrainingList /></ProtectedRoute>} />
          <Route path="/training/new"          element={<ProtectedRoute anyUser><TrainingCreate /></ProtectedRoute>} />
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
