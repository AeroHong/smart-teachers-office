import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import AppBar from '@mui/material/AppBar'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Badge from '@mui/material/Badge'
import Box from '@mui/material/Box'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'

export default function DashboardLayout({ children }) {
  const { user, schoolId, userName, isAdmin, logout } = useAuth()
  const { pathname } = useLocation()
  const [pendingCalls, setPendingCalls] = useState(0)

  // 나를 찾는 대기 중 호출 수 — 상단 배지로 상시 노출
  useEffect(() => {
    if (!schoolId || !user) return
    const q = query(
      collection(db, 'schools', schoolId, 'callRequests'),
      where('teacherUid', '==', user.uid),
      where('status', '==', 'pending'),
    )
    return onSnapshot(q, snap => setPendingCalls(snap.size), () => setPendingCalls(0))
  }, [schoolId, user])

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f8fafc' }}>
      <AppBar position="sticky" color="inherit" sx={{ borderBottom: '1px solid #e8eaed' }}>
        <Toolbar sx={{ gap: 1 }}>
          <Typography fontWeight={800} sx={{ mr: 2 }}>📋 업무 대시보드</Typography>
          <Button component={Link} to="/" variant={pathname === '/' ? 'contained' : 'text'} size="small">
            내 업무
          </Button>
          <Button component={Link} to="/calls" variant={pathname === '/calls' ? 'contained' : 'text'} size="small">
            <Badge badgeContent={pendingCalls} color="error" sx={{ '& .MuiBadge-badge': { right: -12, top: 2 } }}>
              호출 알림
            </Badge>
          </Button>
          {isAdmin && (
            <Button component={Link} to="/admin" variant={pathname === '/admin' ? 'contained' : 'text'} size="small">
              관리자 뷰
            </Button>
          )}
          <Box sx={{ flexGrow: 1 }} />
          <Typography variant="body2" color="text.secondary" sx={{ mr: 1 }}>{userName}</Typography>
          <Button size="small" onClick={logout}>로그아웃</Button>
        </Toolbar>
      </AppBar>
      <Box sx={{ py: 4, px: { xs: 2, md: 3 } }}>
        {children}
      </Box>
    </Box>
  )
}
