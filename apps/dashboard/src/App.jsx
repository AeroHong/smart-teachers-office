import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from '@shared/components/ProtectedRoute'
import ToastProvider from './components/ToastProvider'
import ErrorBoundary from './components/ErrorBoundary'
import CommandPalette from './components/CommandPalette'
import Login from './pages/Login'
import Home from './pages/Home'
import RequestList from './pages/RequestList'
import PostNew from './pages/PostNew'
import Messages from './pages/Messages'
import Members from './pages/Members'
import RedirectToPortal from './pages/RedirectToPortal'

export default function App() {
  return (
    <BrowserRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      {/* 저장·전송 실패를 어느 화면에서든 같은 방식으로 알린다 */}
      <ToastProvider>
        {/* Cmd/Ctrl+K — 어느 화면에서든 뜨도록 라우트 바깥에 둔다 */}
        <CommandPalette />
        <ErrorBoundary label="화면">
        <Routes>
          <Route path="/login" element={<Login />} />
          {/* 대시보드 앱에 없는 온보딩/학생 전용 화면은 포털로 이동 */}
          <Route path="/school-setup" element={<RedirectToPortal path="/school-setup" />} />
          <Route path="/student" element={<RedirectToPortal path="/student" />} />

          {/* 홈 — 왼쪽에 오늘 볼 것들(요청·안내·호출·일정), 오른쪽에 고른 것 하나.
              글은 주소를 가진다 (쿨메신저에 붙여넣는 링크가 특정 글을 가리켜야 하므로) */}
          <Route path="/" element={<ProtectedRoute anyUser><Home /></ProtectedRoute>} />
          <Route path="/posts/:requestId" element={<ProtectedRoute anyUser><Home /></ProtectedRoute>} />
          {/* 업무 요청 — 관리자가 아니라 부장·담당 교사가 쓰므로 대시보드에 둔다.
              상세는 만든 사람에게는 현황판, 대상 교사에게는 할 일 상세로 보인다
              (쿨메신저에 붙여넣는 링크가 이 주소를 가리킨다) */}
          <Route path="/requests" element={<ProtectedRoute anyUser><RequestList /></ProtectedRoute>} />
          <Route path="/requests/new" element={<ProtectedRoute anyUser><PostNew /></ProtectedRoute>} />
          <Route path="/requests/:requestId" element={<ProtectedRoute anyUser><RequestList /></ProtectedRoute>} />
          {/* 쪽지 — 위젯이 아니라 전용 탭. 쿨메신저를 대체하지 않고 병행하는 보조 수단이라
              매일 보는 대시보드의 자리를 차지하지 않는다 */}
          <Route path="/messages" element={<ProtectedRoute anyUser><Messages /></ProtectedRoute>} />
          {/* 구성원 — 오른쪽 칸이 상세 영역이 되면서 명단을 별도 탭으로 옮겼다 */}
          <Route path="/members" element={<ProtectedRoute anyUser><Members /></ProtectedRoute>} />
          {/* 구 경로 — 관리자 업무 현황은 업무 요청 목록의 '전체'로 통합됐다 */}
          <Route path="/admin" element={<Navigate to="/requests" replace />} />

          {/* 구 경로 — 이제 대시보드 위젯으로 통합됨 */}
          <Route path="/calls" element={<Navigate to="/" replace />} />
        </Routes>
        </ErrorBoundary>
      </ToastProvider>
    </BrowserRouter>
  )
}
