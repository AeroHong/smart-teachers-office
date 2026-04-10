import { BrowserRouter, Routes, Route } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import TeacherDashboard from './pages/TeacherDashboard'
import EventCreate from './pages/EventCreate'
import StudentCheckin from './pages/StudentCheckin'
import StudentList from './pages/StudentList'
import EventEdit from './pages/EventEdit'
import AttendanceDashboard from './pages/AttendanceDashboard'
import Admin from './pages/Admin'
import StatsDashboard from './pages/StatsDashboard'

export default function App() {
  return (
    <BrowserRouter basename="/attendance">
      <Routes>
        {/* 공개 */}
        <Route path="/login" element={<Login />} />
        <Route path="/checkin/:schoolId/:eventId" element={<StudentCheckin />} />

        {/* 교사 (로그인 + 승인 필요) */}
        <Route path="/" element={<ProtectedRoute><TeacherDashboard /></ProtectedRoute>} />
        <Route path="/students" element={<ProtectedRoute><StudentList /></ProtectedRoute>} />
        <Route path="/events/new" element={<ProtectedRoute><EventCreate /></ProtectedRoute>} />
        <Route path="/events/:eventId" element={<ProtectedRoute><AttendanceDashboard /></ProtectedRoute>} />
        <Route path="/events/:eventId/edit" element={<ProtectedRoute><EventEdit /></ProtectedRoute>} />
        <Route path="/stats" element={<ProtectedRoute><StatsDashboard /></ProtectedRoute>} />

        {/* 관리자 전용 */}
        <Route path="/admin" element={<ProtectedRoute adminOnly><Admin /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  )
}
