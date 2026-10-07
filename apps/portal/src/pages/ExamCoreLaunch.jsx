import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'
import { openExamCore } from '@shared/lib/studentHub'

/**
 * 고사 업무(ExamCore)로 넘어가는 중간 페이지 — StudentHubLaunch와 같은 방식.
 * 사이드바 바로가기가 이 주소(/examcore?next=…)로 오면 다시 로그인하지 않고 넘겨준다.
 */
export default function ExamCoreLaunch() {
  const [params] = useSearchParams()
  const next = params.get('next') || '/'

  useEffect(() => { openExamCore(next) }, [next])

  return (
    <Box display="flex" flexDirection="column" alignItems="center" gap={2} mt={15}>
      <CircularProgress />
      <Typography color="text.secondary">고사 업무(ExamCore)로 이동하는 중…</Typography>
    </Box>
  )
}
