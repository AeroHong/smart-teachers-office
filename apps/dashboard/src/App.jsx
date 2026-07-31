import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from '@shared/components/ProtectedRoute'
import ToastProvider from './components/ToastProvider'
import Login from './pages/Login'
import DashboardHome from './pages/DashboardHome'
import AdminTasks from './pages/AdminTasks'
import RedirectToPortal from './pages/RedirectToPortal'

export default function App() {
  return (
    <BrowserRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      {/* 저장·전송 실패를 어느 화면에서든 같은 방식으로 알린다 */}
      <ToastProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          {/* 대시보드 앱에 없는 온보딩/학생 전용 화면은 포털로 이동 */}
          <Route path="/school-setup" element={<RedirectToPortal path="/school-setup" />} />
          <Route path="/student" element={<RedirectToPortal path="/student" />} />

          {/* 내 업무·호출·상태는 한 화면에 위젯으로 */}
          <Route path="/" element={<ProtectedRoute anyUser><DashboardHome /></ProtectedRoute>} />
          {/* 관리자 업무 현황은 권한 있는 교사만 보는 별도 페이지 */}
          <Route path="/admin" element={<ProtectedRoute adminOnly><AdminTasks /></ProtectedRoute>} />

          {/* 구 경로 — 이제 대시보드 위젯으로 통합됨 */}
          <Route path="/calls" element={<Navigate to="/" replace />} />
        </Routes>
      </ToastProvider>
    </BrowserRouter>
  )
}
