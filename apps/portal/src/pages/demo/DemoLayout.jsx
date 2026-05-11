import { useNavigate, useLocation } from 'react-router-dom'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'

const TABS = [
  { label: '👨‍🏫 보강 신청', path: '/demo/cover' },
  { label: '✍️ 연수 서명부', path: '/demo/training' },
  { label: '📋 스마트 출결', path: '/demo/attendance' },
]

export default function DemoLayout({ children }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#fdf8ff', display: 'flex', flexDirection: 'column' }}>

      {/* 데모 배너 */}
      <Box sx={{
        background: 'linear-gradient(90deg, #6d28d9, #7c3aed)',
        px: { xs: 2, md: 4 }, py: 0.9,
        display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap',
      }}>
        <Chip label="🎮 데모 모드" size="small"
          sx={{ bgcolor: 'rgba(255,255,255,0.18)', color: '#fff', fontWeight: 700, fontSize: '0.72rem' }} />
        <Typography fontSize="0.82rem" color="rgba(255,255,255,0.8)" sx={{ flex: 1, minWidth: 0 }}>
          실제 데이터가 아닙니다 · 변경 사항은 저장되지 않습니다
        </Typography>
        <Button size="small" onClick={() => navigate('/login')}
          sx={{
            color: '#fff', border: '1px solid rgba(255,255,255,0.4)',
            fontSize: '0.78rem', py: 0.3, px: 1.5, borderRadius: 2,
            '&:hover': { bgcolor: 'rgba(255,255,255,0.12)', borderColor: '#fff' },
          }}>
          로그인 →
        </Button>
      </Box>

      {/* 헤더 */}
      <Box sx={{ bgcolor: '#fff', borderBottom: '1px solid #ede9fe', px: { xs: 2, md: 4 }, pt: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
          <Typography
            fontWeight={800} fontSize="1rem" color="#6d28d9"
            sx={{ cursor: 'pointer', letterSpacing: '-0.02em' }}
            onClick={() => navigate('/demo')}
          >
            🏫 스마트 교무실
          </Typography>
          <Typography fontSize="0.74rem" color="#a78bfa" fontWeight={600}>체험판</Typography>
        </Box>
        <Box sx={{ display: 'flex' }}>
          {TABS.map(tab => {
            const active = pathname.startsWith(tab.path)
            return (
              <Button key={tab.path} onClick={() => navigate(tab.path)} disableRipple
                sx={{
                  fontSize: '0.85rem', px: 2, py: 0.9, borderRadius: 0,
                  color: active ? '#7c3aed' : '#64748b',
                  fontWeight: active ? 700 : 400,
                  borderBottom: active ? '2px solid #7c3aed' : '2px solid transparent',
                  '&:hover': { bgcolor: '#faf5ff', color: '#7c3aed' },
                }}>
                {tab.label}
              </Button>
            )
          })}
        </Box>
      </Box>

      {/* 콘텐츠 */}
      <Box sx={{ flex: 1, maxWidth: 1100, width: '100%', mx: 'auto', px: { xs: 2, md: 4 }, py: 3.5 }}>
        {children}
      </Box>

      <Box sx={{ textAlign: 'center', py: 2.5, fontSize: '0.74rem', color: '#c4b5fd' }}>
        Designed &amp; Built by{' '}
        <a href="https://github.com/AeroHong" target="_blank" rel="noopener noreferrer"
          style={{ color: '#a78bfa', fontWeight: 700, textDecoration: 'none' }}>
          @AeroHong
        </a>
      </Box>
    </Box>
  )
}
