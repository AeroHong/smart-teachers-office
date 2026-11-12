import { Link as RouterLink } from 'react-router-dom'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useAuth } from '@shared/contexts/AuthContext'
import { PORTAL_URL } from '../lib/links'
import { useRegulationRole } from '../lib/useRegulationRole'

const barSx = { bgcolor: 'primary.main', color: 'primary.contrastText', px: { xs: 1.5, md: 3 }, height: 52, display: 'flex', alignItems: 'center', position: 'sticky', top: 0, zIndex: 20 }
const linkSx = { color: 'inherit', opacity: 0.9, minWidth: 0, px: 1 }

export function Brand({ to = '/', sub = '학교 규정집' }) {
  return (
    <Typography component={RouterLink} to={to} variant="h6" noWrap sx={{ color: 'inherit', textDecoration: 'none', fontWeight: 800, letterSpacing: '-0.01em' }}>
      Codex-Edu <Box component="span" sx={{ fontWeight: 500, opacity: 0.8, ml: 0.5, display: { xs: 'none', sm: 'inline' } }}>{sub}</Box>
    </Typography>
  )
}

/** 상단 바 — 이름, 메뉴(개정안·관리는 권한 있을 때), 스마트교무실로 돌아가기 */
export default function AppBar() {
  const { userName, logout } = useAuth()
  const { canEdit, canApply } = useRegulationRole()
  return (
    <Box component="header" className="no-print" sx={barSx}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ width: '100%' }}>
        <Brand />
        <Box flex={1} />
        {canEdit && <Button size="small" component={RouterLink} to="/amendments" sx={linkSx}>개정안</Button>}
        {canApply && <Button size="small" component={RouterLink} to="/admin" sx={linkSx}>관리</Button>}
        {(canApply || canEdit) && (
          <Chip size="small" label={canApply ? '관리자' : '규정 담당'} sx={{ bgcolor: 'rgba(255,255,255,0.16)', color: 'inherit', display: { xs: 'none', md: 'flex' } }} />
        )}
        <Typography variant="body2" sx={{ opacity: 0.85, display: { xs: 'none', md: 'block' } }}>{userName}</Typography>
        <Button size="small" href={PORTAL_URL} sx={linkSx}>스마트교무실</Button>
        <Button size="small" onClick={logout} sx={{ ...linkSx, opacity: 0.75, display: { xs: 'none', sm: 'inline-flex' } }}>로그아웃</Button>
      </Stack>
    </Box>
  )
}

export { barSx }
