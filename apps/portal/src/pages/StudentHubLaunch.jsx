import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'
import { openStudentHub } from '@shared/lib/studentHub'

/**
 * 학적·고사 관리(StudentHub)로 넘어가는 중간 페이지.
 * 사이드바와 대시보드 바로가기가 이 주소(/studenthub?next=…)로 오면 다시 로그인하지 않고 넘겨준다.
 */
export default function StudentHubLaunch() {
  const [params] = useSearchParams()
  const next = params.get('next') || '/'

  useEffect(() => { openStudentHub(next) }, [next])

  return (
    <Box display="flex" flexDirection="column" alignItems="center" gap={2} mt={15}>
      <CircularProgress />
      <Typography color="text.secondary">학적·고사 관리로 이동하는 중…</Typography>
    </Box>
  )
}
