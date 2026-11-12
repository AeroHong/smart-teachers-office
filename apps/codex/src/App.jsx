import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import GoogleIcon from '@mui/icons-material/Google'
import { useAuth } from '@shared/contexts/AuthContext'
import { PORTAL_URL } from './lib/links'
import Handoff from './pages/Handoff'
import Home from './pages/Home'
import RegulationPage from './pages/RegulationPage'
import SearchPage from './pages/SearchPage'

// 열람 화면은 바로, 관리·편집·공개 화면은 필요할 때 불러온다
const HistoryPage = lazy(() => import('./pages/HistoryPage'))
const AmendmentsPage = lazy(() => import('./pages/AmendmentsPage'))
const AmendmentEditor = lazy(() => import('./pages/AmendmentEditor'))
const AdminHome = lazy(() => import('./pages/AdminHome'))
const ImportPage = lazy(() => import('./pages/ImportPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const ManagersPage = lazy(() => import('./pages/ManagersPage'))
const PublicApp = lazy(() => import('./pages/PublicApp'))
const StructurePage = lazy(() => import('./pages/StructurePage'))
const HierarchySettingsPage = lazy(() => import('./pages/HierarchySettingsPage'))
const LawReviewPage = lazy(() => import('./pages/LawReviewPage'))

const STAFF_ROLES = ['teacher', 'admin', 'school_admin', 'principal', 'headmaster']

function Center({ children }) {
  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default', p: 3 }}>
      {children}
    </Box>
  )
}

const wait = <Center><CircularProgress /></Center>

/** 로그인 → 교직원 확인 → 규정집. 공개 화면(/public/…)은 로그인 없이. 개정·관리는 안에서 권한으로 거른다 */
export default function App() {
  const { user, role, schoolId, isSuperAdmin, loading, login, logout } = useAuth()
  const { pathname } = useLocation()

  if (pathname.startsWith('/public/')) {
    return <Suspense fallback={wait}><Routes><Route path="/public/:schoolId/*" element={<PublicApp />} /></Routes></Suspense>
  }
  // 스마트교무실에서 넘어오는 길(로그인 전에 처리해야 한다)
  if (pathname === '/auth/handoff') return <Handoff />
  if (loading) return wait

  if (!user) {
    return (
      <Center>
        <Paper variant="outlined" sx={{ p: 5, width: 420, maxWidth: '92vw' }}>
          <Stack spacing={2.5}>
            <Typography variant="h5" fontWeight={700}>Codex-Edu · 학교 규정집</Typography>
            <Typography color="text.secondary">
              스마트교무실과 같은 계정을 씁니다. 스마트교무실 메뉴의 「학교 규정집」으로 들어오면 다시 로그인하지 않아도 됩니다.
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
            {schoolId ? '가입 승인이 끝난 교직원 계정으로 로그인해 주세요.' : '학교 소속이 확인되지 않았습니다. 스마트교무실 포털에서 가입을 먼저 마쳐 주세요.'}
          </Typography>
          <Button onClick={logout}>다른 계정으로 로그인</Button>
        </Paper>
      </Center>
    )
  }

  return (
    <Suspense fallback={wait}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/r/:regId" element={<RegulationPage />} />
        <Route path="/r/:regId/history" element={<HistoryPage />} />
        <Route path="/amendments" element={<AmendmentsPage />} />
        <Route path="/amendments/:id" element={<AmendmentEditor />} />
        <Route path="/admin" element={<AdminHome />} />
        <Route path="/admin/import" element={<ImportPage />} />
        <Route path="/admin/settings" element={<SettingsPage />} />
        <Route path="/admin/managers" element={<ManagersPage />} />
        <Route path="/admin/structure" element={<HierarchySettingsPage />} />
        <Route path="/admin/laws" element={<LawReviewPage />} />
        <Route path="/structure" element={<StructurePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
