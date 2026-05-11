import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Avatar from '@mui/material/Avatar'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const NAV_ITEMS = [
  { label: '학교 도메인 관리', path: '/super-admin', icon: '🏫' },
]

export default function SuperAdminLayout({ children }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: '#f8fafc' }}>

      {/* ── 사이드바 ── */}
      <Box sx={{
        width: 240,
        flexShrink: 0,
        bgcolor: '#1e293b',
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        top: 0, left: 0,
        height: '100vh',
      }}>
        {/* 로고 */}
        <Box sx={{ px: 3, py: 2.5, borderBottom: '1px solid #334155' }}>
          <Typography sx={{ color: '#f1f5f9', fontWeight: 800, fontSize: '0.95rem', lineHeight: 1.3 }}>
            🛡️ 스마트 교무실
          </Typography>
          <Typography sx={{ color: '#64748b', fontSize: '0.72rem', mt: 0.25 }}>
            플랫폼 관리자
          </Typography>
        </Box>

        {/* 네비 */}
        <Box sx={{ flex: 1, py: 2 }}>
          {NAV_ITEMS.map(item => {
            const active = location.pathname === item.path
            return (
              <Box
                key={item.path}
                component={Link}
                to={item.path}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  mx: 1.5,
                  px: 1.5,
                  py: 0.9,
                  borderRadius: '8px',
                  textDecoration: 'none',
                  fontSize: '0.875rem',
                  fontWeight: active ? 600 : 400,
                  color: active ? '#e2e8f0' : '#94a3b8',
                  bgcolor: active ? '#334155' : 'transparent',
                  transition: 'all 0.15s',
                  '&:hover': { bgcolor: '#334155', color: '#e2e8f0' },
                }}
              >
                <span>{item.icon}</span>
                {item.label}
              </Box>
            )
          })}
        </Box>

        {/* 유저 영역 */}
        <Box sx={{ p: 2, borderTop: '1px solid #334155' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1.5 }}>
            {user?.photoURL
              ? <Avatar src={user.photoURL} sx={{ width: 32, height: 32 }} />
              : <Avatar sx={{ width: 32, height: 32, bgcolor: '#4f46e5', fontSize: '0.8rem' }}>
                  {user?.displayName?.[0]}
                </Avatar>
            }
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: '#e2e8f0', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.displayName || user?.email}
              </Typography>
              <Typography sx={{ fontSize: '0.68rem', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.email}
              </Typography>
            </Box>
          </Box>
          <Button
            fullWidth
            size="small"
            onClick={handleLogout}
            sx={{ color: '#94a3b8', fontSize: '0.78rem', justifyContent: 'flex-start', px: 1 }}
          >
            로그아웃
          </Button>
        </Box>
      </Box>

      {/* ── 메인 영역 ── */}
      <Box sx={{ flex: 1, ml: '240px', display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        {/* 상단 헤더 */}
        <Box sx={{
          px: 4, py: 2,
          bgcolor: '#fff',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          position: 'sticky',
          top: 0,
          zIndex: 50,
        }}>
          <Typography sx={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 500 }}>
            플랫폼 관리자
          </Typography>
          <Typography sx={{ color: '#cbd5e1', fontSize: '0.85rem' }}>/</Typography>
          <Typography sx={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>
            학교 도메인 관리
          </Typography>
        </Box>

        {/* 콘텐츠 */}
        <Box component="main" sx={{ flex: 1, maxWidth: 1000, width: '100%', mx: 'auto', px: 4, py: 3 }}>
          {children}
        </Box>
      </Box>
    </Box>
  )
}
