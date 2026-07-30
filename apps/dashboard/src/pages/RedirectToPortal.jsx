import { useEffect } from 'react'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'

// 포털에만 있는 화면(학교 설정, 학생 포털 등)으로 이동시킬 때 사용
const PORTAL_URL = 'https://seonyoo-system.web.app'

export default function RedirectToPortal({ path }) {
  useEffect(() => {
    window.location.href = `${PORTAL_URL}${path}`
  }, [path])

  return (
    <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
      <CircularProgress />
    </Box>
  )
}
