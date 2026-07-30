import { useState } from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import { useKiosk } from '../contexts/KioskContext'

export default function Setup() {
  const { claimDevice } = useKiosk()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    if (code.length !== 6 || busy) return
    setBusy(true)
    setErrorMsg('')
    try {
      await claimDevice(code)
      // 성공하면 App이 클레임을 보고 자동으로 해당 화면으로 전환된다
    } catch (err) {
      setErrorMsg(err.message || '등록에 실패했습니다.')
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Box sx={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #6d28d9 0%, #7c3aed 60%, #8b5cf6 100%)', p: 3,
    }}>
      <Paper sx={{ p: 5, width: '100%', maxWidth: 460, textAlign: 'center', borderRadius: 4 }}>
        <Typography fontSize="3rem">🏫</Typography>
        <Typography variant="h6" fontWeight={800} mt={1}>기기 등록</Typography>
        <Typography variant="body2" color="text.secondary" mt={1} mb={3}>
          스마트교무실 관리자 페이지에서 발급받은<br />6자리 코드를 입력하세요.
        </Typography>

        <form onSubmit={submit}>
          <TextField
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            autoFocus
            fullWidth
            inputProps={{
              inputMode: 'numeric',
              style: { fontSize: '2.6rem', textAlign: 'center', letterSpacing: '0.5rem', fontWeight: 700 },
            }}
            sx={{ mb: 2 }}
          />
          {errorMsg && (
            <Typography color="error" variant="body2" mb={2}>{errorMsg}</Typography>
          )}
          <Button
            type="submit"
            variant="contained"
            size="large"
            fullWidth
            disabled={code.length !== 6 || busy}
            sx={{ py: 1.5, fontSize: '1.05rem' }}
          >
            {busy ? '등록 중...' : '등록'}
          </Button>
        </form>

        <Typography variant="caption" color="text.secondary" display="block" mt={3}>
          한 번 등록하면 재부팅 후에도 유지됩니다.
        </Typography>
      </Paper>
    </Box>
  )
}
