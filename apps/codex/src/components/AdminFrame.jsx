import { Link as RouterLink } from 'react-router-dom'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import AppBar from './AppBar'
import { useRegulationRole } from '../lib/useRegulationRole'

/**
 * 관리·작업 화면 틀 — 권한이 없으면 안내만.
 * @param {{ title, need?: 'apply'|'edit', back?: string, actions?, children, maxWidth? }} p
 */
export default function AdminFrame({ title, need = 'apply', back = '/admin', actions, children, maxWidth = 1200 }) {
  const { canApply, canEdit, loading } = useRegulationRole()
  const ok = need === 'apply' ? canApply : canEdit
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar />
      <Box sx={{ maxWidth, mx: 'auto', px: 2, py: 3 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
          <Button size="small" startIcon={<ArrowBackIcon />} component={RouterLink} to={back}>뒤로</Button>
          <Typography variant="h5" flex={1}>{title}</Typography>
          {ok && actions}
        </Stack>
        {loading ? <CircularProgress /> : ok ? children : (
          <Alert severity="info">
            {need === 'apply' ? '학교 관리자·교감만 쓸 수 있는 화면입니다.' : '규정 담당자(관리자가 지정)와 관리자만 쓸 수 있는 화면입니다.'}
          </Alert>
        )}
      </Box>
    </Box>
  )
}
