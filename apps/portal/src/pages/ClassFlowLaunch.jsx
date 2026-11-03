import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'
import { openClassFlow } from '@shared/lib/studentHub'

/**
 * 선택과목 분반 배정(ClassFlow)으로 넘어가는 중간 페이지 — StudentHub·ExamCore와 같은 방식.
 * StudentHub 사이드바의 「분반 배정」이 이 주소(/classflow?next=…)로 오면 다시 로그인하지 않고 넘겨준다.
 * (스마트교무실 메뉴에는 두지 않는다 — 선택과목 담당 업무라 StudentHub 안에서 들어간다, 2026-11-03)
 */
export default function ClassFlowLaunch() {
  const [params] = useSearchParams()
  const next = params.get('next') || '/'

  useEffect(() => { openClassFlow(next) }, [next])

  return (
    <Box display="flex" flexDirection="column" alignItems="center" gap={2} mt={15}>
      <CircularProgress />
      <Typography color="text.secondary">선택과목 분반 배정으로 이동하는 중…</Typography>
    </Box>
  )
}
