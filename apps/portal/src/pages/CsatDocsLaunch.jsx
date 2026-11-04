import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'
import { openCsatDocs } from '@shared/lib/studentHub'

/**
 * 수능 시험장 양식(CSAT-Docs)으로 넘어가는 중간 페이지 — ExamCoreLaunch와 같은 방식.
 * 사이드바 바로가기가 이 주소(/csat-docs?next=…)로 오면 다시 로그인하지 않고 넘겨준다.
 */
export default function CsatDocsLaunch() {
  const [params] = useSearchParams()
  const next = params.get('next') || '/'

  useEffect(() => { openCsatDocs(next) }, [next])

  return (
    <Box display="flex" flexDirection="column" alignItems="center" gap={2} mt={15}>
      <CircularProgress />
      <Typography color="text.secondary">수능 시험장 양식(CSAT-Docs)으로 이동하는 중…</Typography>
    </Box>
  )
}
