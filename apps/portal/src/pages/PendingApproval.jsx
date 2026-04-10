import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import { useAuth } from '../contexts/AuthContext'

export default function PendingApproval() {
  const { user, logout } = useAuth()
  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#f4f6fb', p: 2 }}>
      <Paper sx={{ p: 5, maxWidth: 420, textAlign: 'center', borderRadius: 4 }}>
        <Typography fontSize="3rem">⏳</Typography>
        <Typography variant="h6" fontWeight={700} mt={1} mb={1}>승인 대기 중</Typography>
        <Typography variant="body2" color="text.secondary" mb={1}>{user?.displayName}</Typography>
        <Typography variant="body2" color="text.secondary" mb={3}>
          관리자 승인 후 출결 기능을 사용할 수 있습니다.
          보강신청 시스템은 바로 이용 가능합니다.
        </Typography>
        <Button variant="outlined" onClick={logout}>로그아웃</Button>
      </Paper>
    </Box>
  )
}
