import { useState, useEffect } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardActions from '@mui/material/CardActions'
import Grid from '@mui/material/Grid'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import Snackbar from '@mui/material/Snackbar'
import DemoLayout from './DemoLayout'

// ── 샘플 데이터 ────────────────────────────────────────────
const fmt = d => d.toISOString().slice(0, 10)
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r }

function makeSamples() {
  const today = new Date()
  const openSoon = new Date(Date.now() + 75 * 1000)
  const openSoonStr = openSoon.toISOString().replace('T', ' ').slice(0, 16)
  return [
    { id: 1, date: fmt(today),            className: '1-3', period: 2, absentTeacher: '김영희', subject: '국어',  status: '대기중', openAt: null },
    { id: 2, date: fmt(today),            className: '2-1', period: 4, absentTeacher: '박철수', subject: '수학',  status: '대기중', openAt: null },
    { id: 3, date: fmt(addDays(today,1)), className: '3-2', period: 1, absentTeacher: '이민준', subject: '영어',  status: '대기중', openAt: null },
    { id: 4, date: fmt(today),            className: '1-5', period: 5, absentTeacher: '최지현', subject: '과학',  status: '마감',   openAt: null, coverTeacher: '홍길동' },
    { id: 5, date: fmt(today),            className: '2-4', period: 3, absentTeacher: '정수연', subject: '체육',  status: '대기중', openAt: openSoonStr },
    { id: 6, date: fmt(addDays(today,2)), className: '3-1', period: 6, absentTeacher: '강민서', subject: '음악',  status: '대기중', openAt: null },
  ]
}

function getDayOfWeek(dateStr) {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ''
  return `(${['일','월','화','수','목','금','토'][d.getDay()]})`
}

function getOpenAt(str) {
  if (!str) return null
  const d = new Date(String(str).replace(' ', 'T'))
  return isNaN(d.getTime()) ? null : d
}

function formatCountdown(ms) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const pad = n => String(n).padStart(2, '0')
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`
}

// ── 컴포넌트 ───────────────────────────────────────────────
export default function DemoCover() {
  const [covers, setCovers] = useState(makeSamples)
  const [now, setNow] = useState(new Date())
  const [snackbar, setSnackbar] = useState('')
  const [myApplied, setMyApplied] = useState(null)  // 내가 신청한 카드 id

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const handleApply = (id) => {
    if (myApplied) {
      setSnackbar('데모에서는 한 번만 신청할 수 있습니다.')
      return
    }
    setCovers(prev => prev.map(c => c.id === id
      ? { ...c, status: '마감', coverTeacher: '나 (데모)' }
      : c
    ))
    setMyApplied(id)
    setSnackbar('✅ 보강 신청이 완료되었습니다! (데모)')
  }

  const handleCancel = (id) => {
    setCovers(prev => prev.map(c => c.id === id
      ? { ...c, status: '대기중', coverTeacher: null }
      : c
    ))
    setMyApplied(null)
    setSnackbar('신청이 취소되었습니다.')
  }

  return (
    <DemoLayout>
      <Box sx={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', mb: 3, flexWrap: 'wrap', gap: 1 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>보강 신청 목록</Typography>
          <Typography variant="body2" color="text.secondary" mt={0.5}>
            신청 가능한 보강과 공개 예정 보강이 함께 표시됩니다.
          </Typography>
        </Box>
        <Chip label="샘플 데이터" size="small" sx={{ bgcolor: '#ede9fe', color: '#7c3aed', fontWeight: 600 }} />
      </Box>

      <Grid container spacing={2.5}>
        {covers.map(item => {
          const isMine = myApplied === item.id
          const isClosed = item.status === '마감'
          const openAt = getOpenAt(item.openAt)
          const isScheduled = openAt && openAt > now
          const diffMs = isScheduled ? openAt - now : 0

          let cardSx, chip, button

          if (isClosed && isMine) {
            cardSx = { border: '1.5px solid', borderColor: 'primary.light', bgcolor: '#f0f6ff', height: '100%' }
            chip = <Chip label="내 신청 보강" size="small" color="primary" variant="outlined" />
            button = <Button fullWidth variant="outlined" color="error" onClick={() => handleCancel(item.id)}>취소하기</Button>
          } else if (isClosed) {
            cardSx = { opacity: 0.55, filter: 'grayscale(40%)', height: '100%' }
            chip = <Chip label="신청 마감" size="small" sx={{ bgcolor: '#e0e0e0', color: '#757575' }} />
            button = <Button fullWidth variant="contained" disabled>신청 마감</Button>
          } else if (isScheduled) {
            const openDateStr = openAt.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
            cardSx = { border: '1.5px solid', borderColor: 'warning.light', bgcolor: '#fffdf0', height: '100%' }
            chip = <Chip label="공개예정" size="small" color="warning" variant="outlined" />
            button = (
              <Button fullWidth variant="outlined" color="warning" disabled
                sx={{ fontFamily: 'monospace', fontSize: '1rem', letterSpacing: '0.05em' }}>
                ⏳ {formatCountdown(diffMs)}
              </Button>
            )
            // 카운트다운 끝나면 자동으로 신청가능으로 전환
            if (diffMs <= 0) {
              setTimeout(() => {
                setCovers(prev => prev.map(c => c.id === item.id ? { ...c, openAt: null } : c))
              }, 0)
            }
          } else {
            cardSx = { height: '100%' }
            chip = <Chip label="신청가능" size="small" color="success" />
            button = <Button fullWidth variant="contained" color="primary" onClick={() => handleApply(item.id)}>보강 신청</Button>
          }

          return (
            <Grid item xs={12} sm={6} md={4} key={item.id}>
              <Card sx={{ ...cardSx, borderLeft: `4px solid ${isClosed && !isMine ? '#94a3b8' : isMine ? '#4f46e5' : isScheduled ? '#f59e0b' : '#22c55e'}` }}>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    {chip}
                    <Typography variant="body2" fontWeight={700} color="text.secondary">
                      {item.date}{getDayOfWeek(item.date)}
                    </Typography>
                  </Box>
                  <Typography variant="h6" gutterBottom>
                    {item.className}{' '}
                    <Typography component="span" color="primary" fontWeight={700}>{item.period}교시</Typography>
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {item.subject} ({item.absentTeacher} 선생님 결강)
                  </Typography>
                  {isClosed && item.coverTeacher && (
                    <Typography variant="caption" color="primary" sx={{ mt: 0.5, display: 'block' }}>
                      신청자: {item.coverTeacher}
                    </Typography>
                  )}
                </CardContent>
                <Divider />
                <CardActions sx={{ px: 2, py: 1.5 }}>
                  {button}
                </CardActions>
              </Card>
            </Grid>
          )
        })}
      </Grid>

      <Snackbar
        open={!!snackbar} autoHideDuration={3000}
        onClose={() => setSnackbar('')} message={snackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </DemoLayout>
  )
}
