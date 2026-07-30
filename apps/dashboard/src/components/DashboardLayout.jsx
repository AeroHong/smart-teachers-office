import { Link, useLocation } from 'react-router-dom'
import AppBar from '@mui/material/AppBar'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Box from '@mui/material/Box'
import { useAuth } from '@shared/contexts/AuthContext'
import CallAlert from './CallAlert'

export default function DashboardLayout({ children }) {
  const { userName, isAdmin, logout } = useAuth()
  const { pathname } = useLocation()

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f8fafc' }}>
      <AppBar position="sticky" color="inherit" sx={{ borderBottom: '1px solid #e8eaed' }}>
        <Toolbar sx={{ gap: 1 }}>
          <Typography fontWeight={800} sx={{ mr: 2 }}>📋 업무 대시보드</Typography>
          <Button component={Link} to="/" variant={pathname === '/' ? 'contained' : 'text'} size="small">
            대시보드
          </Button>
          {isAdmin && (
            <Button component={Link} to="/admin" variant={pathname === '/admin' ? 'contained' : 'text'} size="small">
              업무 현황 (관리자)
            </Button>
          )}
          <Box sx={{ flexGrow: 1 }} />
          <Typography variant="body2" color="text.secondary" sx={{ mr: 1 }}>{userName}</Typography>
          <Button size="small" onClick={logout}>로그아웃</Button>
        </Toolbar>
      </AppBar>

      <Box sx={{ py: 3, px: { xs: 2, md: 3 } }}>
        {children}
      </Box>

      {/* 어느 화면에 있든 학생 호출은 오른쪽 아래에서 올라온다 */}
      <CallAlert />
    </Box>
  )
}
