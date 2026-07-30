import { BrowserRouter, Routes, Route } from 'react-router-dom'
import ProtectedRoute from '@shared/components/ProtectedRoute'
import Login from './pages/Login'
import MyTasks from './pages/MyTasks'
import AdminTasks from './pages/AdminTasks'
import RedirectToPortal from './pages/RedirectToPortal'

export default function App() {
  return (
    <BrowserRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <Routes>
        <Route path="/login" element={<Login />} />
        {/* 대시보드 앱에 없는 온보딩/학생 전용 화면은 포털로 이동 */}
        <Route path="/school-setup" element={<RedirectToPortal path="/school-setup" />} />
        <Route path="/student" element={<RedirectToPortal path="/student" />} />
        <Route path="/" element={<ProtectedRoute anyUser><MyTasks /></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute adminOnly><AdminTasks /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  )
}
