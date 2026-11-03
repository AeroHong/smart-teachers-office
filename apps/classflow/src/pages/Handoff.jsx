import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signInWithCustomToken } from 'firebase/auth'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { auth } from '@shared/lib/firebase'

/**
 * 스마트교무실 → 분반 배정 재로그인 없는 이동(StudentHub·ExamCore와 같은 issueHubHandoffToken).
 * portal이 받은 custom token을 #token=…으로 넘긴다. 해시는 서버로 가지 않고, 쓰자마자 주소창에서 지운다.
 */
export default function Handoff() {
  const navigate = useNavigate()
  const [error, setError] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1))
    const token = params.get('token')
    const next = params.get('next') || '/'
    window.history.replaceState(null, '', window.location.pathname)
    if (!token) { navigate('/', { replace: true }); return }
    signInWithCustomToken(auth, token)
      .then(() => navigate(next.startsWith('/') ? next : '/', { replace: true }))
      .catch((e) => setError(e.message))
  }, [navigate])

  return (
    <Box display="flex" justifyContent="center" mt={20}>
      {error ? (
        <Stack spacing={2} alignItems="center">
          <Alert severity="warning">자동 로그인에 실패했습니다({error}). 직접 로그인해 주세요.</Alert>
          <Button variant="contained" onClick={() => navigate('/', { replace: true })}>로그인 화면으로</Button>
        </Stack>
      ) : (
        <Stack spacing={2} alignItems="center">
          <CircularProgress />
          <Typography color="text.secondary">스마트교무실 계정으로 들어가는 중…</Typography>
        </Stack>
      )}
    </Box>
  )
}
