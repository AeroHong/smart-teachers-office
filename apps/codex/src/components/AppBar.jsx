import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useAuth } from '@shared/contexts/AuthContext'
import { PORTAL_URL } from '../lib/links'
import { useRegulationRole } from '../lib/useRegulationRole'

/** 상단 바 — 이름, 권한 표시, 스마트교무실로 돌아가기 */
export default function AppBar() {
  const { user, logout } = useAuth()
  const { canEdit, canApply } = useRegulationRole()
  return (
    <Box component="header" className="no-print" sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', px: { xs: 2, md: 3 }, py: 1.25 }}>
      <Stack direction="row" alignItems="center" spacing={2}>
        <Typography component="a" href="/" variant="h6" sx={{ color: 'inherit', textDecoration: 'none', fontWeight: 800, letterSpacing: '-0.01em' }}>
          Codex-Edu <Box component="span" sx={{ fontWeight: 500, opacity: 0.8, ml: 0.5 }}>학교 규정집</Box>
        </Typography>
        <Box flex={1} />
        {(canApply || canEdit) && (
          <Chip size="small" label={canApply ? '관리자' : '규정 담당'} sx={{ bgcolor: 'rgba(255,255,255,0.16)', color: 'inherit' }} />
        )}
        <Typography variant="body2" sx={{ opacity: 0.85, display: { xs: 'none', sm: 'block' } }}>{user?.displayName}</Typography>
        <Button size="small" href={PORTAL_URL} sx={{ color: 'inherit' }}>스마트교무실</Button>
        <Button size="small" onClick={logout} sx={{ color: 'inherit', opacity: 0.8 }}>로그아웃</Button>
      </Stack>
    </Box>
  )
}
