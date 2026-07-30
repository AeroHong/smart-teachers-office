import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'
import { useKiosk } from './contexts/KioskContext'
import Setup from './pages/Setup'
import CallInput from './pages/CallInput'
import CallDisplay from './pages/CallDisplay'

/**
 * 라우터 없이 기기 클레임(deviceType)에 따라 화면이 고정된다.
 * 키오스크는 주소창이 없는 전체화면으로 쓰이므로 URL 이동 개념이 필요 없고,
 * 기기가 임의로 다른 화면으로 넘어가지 못하게 하는 편이 안전하다.
 */
export default function App() {
  const { loading, error, device } = useKiosk()

  if (loading) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress size={48} />
      </Box>
    )
  }

  if (error) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, p: 4 }}>
        <Typography fontSize="3rem">⚠️</Typography>
        <Typography variant="h6" fontWeight={700}>기기 인증에 실패했습니다</Typography>
        <Typography color="text.secondary" textAlign="center">{error}</Typography>
        <Typography variant="body2" color="text.secondary">네트워크 연결을 확인한 뒤 새로고침해 주세요.</Typography>
      </Box>
    )
  }

  if (!device) return <Setup />
  return device.deviceType === 'display' ? <CallDisplay /> : <CallInput />
}
