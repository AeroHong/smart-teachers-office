import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import GoogleIcon from '@mui/icons-material/Google'
import { PORTAL_URL } from './lib/links'
import Typography from '@mui/material/Typography'
import { useAuth } from '@shared/contexts/AuthContext'
import ProjectList from './pages/ProjectList'
import Workspace from './pages/Workspace'
import Handoff from './pages/Handoff'
import LogsPage from './pages/LogsPage'
import { useEffect, useState } from 'react'
import { useHubRoles, listElectiveManagers } from './lib/useHubRoles'

const STAFF_ROLES = ['teacher', 'admin', 'school_admin', 'principal', 'headmaster']

function Center({ children }) {
  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default', p: 3 }}>
      {children}
    </Box>
  )
}

/** 로그인 → 교직원 확인 → 프로젝트 목록 / 작업 창 */
export default function App() {
  const { user, role, schoolId, isSuperAdmin, loading, login, logout } = useAuth()
  const { pathname } = useLocation()

  // 스마트교무실에서 넘어오는 길(로그인 전에 처리해야 한다)
  if (pathname === '/auth/handoff') return <Handoff />
  if (loading) return <Center><CircularProgress /></Center>

  if (!user) {
    return (
      <Center>
        <Paper variant="outlined" sx={{ p: 5, width: 420, maxWidth: '92vw' }}>
          <Stack spacing={2.5}>
            <Typography variant="h5" fontWeight={700}>ClassFlow · 선택과목 분반 배정</Typography>
            <Typography color="text.secondary">
              스마트교무실과 같은 계정을 씁니다. 스마트교무실 메뉴의 「분반 배정」으로 들어오면 다시 로그인하지 않아도 됩니다.
            </Typography>
            <Button variant="contained" size="large" startIcon={<GoogleIcon />} onClick={() => login().catch((e) => console.error('로그인 실패:', e))}>
              학교 Google 계정으로 로그인
            </Button>
            <Button href={PORTAL_URL}>스마트교무실로 가기</Button>
          </Stack>
        </Paper>
      </Center>
    )
  }

  if (!(isSuperAdmin || STAFF_ROLES.includes(role)) || !schoolId) {
    return (
      <Center>
        <Paper variant="outlined" sx={{ p: 5, width: 420, maxWidth: '92vw', textAlign: 'center' }}>
          <Typography variant="h6" fontWeight={700} gutterBottom>교직원만 사용할 수 있습니다</Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            {schoolId ? '가입 승인이 끝난 교직원 계정으로 로그인해 주세요.' : '학교 소속이 확인되지 않았습니다. 스마트 교무실 포털에서 가입을 먼저 마쳐 주세요.'}
          </Typography>
          <Button onClick={logout}>다른 계정으로 로그인</Button>
        </Paper>
      </Center>
    )
  }

  return <RoleGate />
}

/** 선택과목 담당자(StudentHub 담당자 지정 'elective')·관리자·교감만 쓰고, 교장은 열람 */
function RoleGate() {
  const { schoolId, logout } = useAuth()
  const { canView, loading } = useHubRoles()
  const [names, setNames] = useState(null)
  useEffect(() => {
    if (!loading && !canView) listElectiveManagers(schoolId).then(setNames).catch(() => setNames([]))
  }, [loading, canView, schoolId])

  if (loading) return <Center><CircularProgress /></Center>
  if (!canView) {
    return (
      <Center>
        <Paper variant="outlined" sx={{ p: 5, width: 460, maxWidth: '92vw' }}>
          <Stack spacing={2}>
            <Typography variant="h6" fontWeight={700}>선택과목 담당자만 사용할 수 있습니다</Typography>
            <Typography color="text.secondary">
              분반 배정은 StudentHub 「담당자 지정」에서 <b>선택과목</b> 담당으로 지정된 선생님과 관리자·교감이 씁니다.
              필요하면 관리자에게 지정을 요청해 주세요.
            </Typography>
            {names && (
              <Typography variant="body2">
                지금 선택과목 담당: <b>{names.length ? names.join(', ') : '지정된 선생님이 없습니다'}</b>
              </Typography>
            )}
            <Stack direction="row" spacing={1}>
              <Button variant="contained" href={PORTAL_URL}>스마트교무실로 가기</Button>
              <Button onClick={logout}>다른 계정으로 로그인</Button>
            </Stack>
          </Stack>
        </Paper>
      </Center>
    )
  }
  return (
    <Routes>
      <Route path="/" element={<ProjectList />} />
      <Route path="/p/:projectId" element={<Workspace />} />
      <Route path="/logs" element={<LogsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
