import { useEffect, useState } from 'react'
import { limit, onSnapshot, orderBy, query } from 'firebase/firestore'
import { Link as RouterLink } from 'react-router-dom'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Popper from '@mui/material/Popper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useAuth } from '@shared/contexts/AuthContext'
import { ACTIONS, logCol, relativeTime } from '../lib/activity'

/** 최근 사용자 로그 n건 실시간(StudentHub useRecentLogs와 같은 쿼리, classflowLogs) */
function useRecentLogs(n = 5) {
  const { schoolId } = useAuth()
  const [data, setData] = useState([])
  useEffect(() => {
    if (!schoolId) return undefined
    const q = query(logCol(schoolId), orderBy('at', 'desc'), limit(n))
    return onSnapshot(q, (snap) => setData(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), (e) => console.warn('최근 활동:', e.message))
  }, [schoolId, n])
  return data
}

/**
 * 상단 바 최근 활동 — StudentHub·ExamCore RecentActivityTicker와 같은 모양.
 * 최신 1건을 한 줄로, 마우스를 올리면 최근 5건과 「전체 보기」(ClassFlow 사용자 로그).
 */
export default function RecentActivityTicker() {
  const data = useRecentLogs(5)
  const [anchor, setAnchor] = useState(null)
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 30000)
    return () => clearInterval(t)
  }, [])
  if (!data.length) return null
  const [first] = data
  const line = (l) => (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
      <Chip size="small" label={ACTIONS[l.action]?.label || l.action} color={ACTIONS[l.action]?.color || 'default'}
        variant={ACTIONS[l.action]?.color ? 'filled' : 'outlined'} />
      <Typography variant="body2" noWrap sx={{ maxWidth: '22rem' }}>{l.name} · {l.summary}</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>{relativeTime(l.at)}</Typography>
    </Stack>
  )
  return (
    <Box onMouseEnter={(e) => setAnchor(e.currentTarget)} onMouseLeave={() => setAnchor(null)}>
      <ButtonBase component={RouterLink} to="/logs" sx={{ borderRadius: 2, px: 1, py: 0.5 }}>{line(first)}</ButtonBase>
      <Popper open={!!anchor} anchorEl={anchor} placement="bottom-end" sx={{ zIndex: 1300 }}>
        <Paper variant="outlined" sx={{ p: 1.5, mt: 0.5, boxShadow: 3 }}>
          <Stack spacing={1}>
            {data.map((l) => <Box key={l.id}>{line(l)}</Box>)}
            <ButtonBase component={RouterLink} to="/logs" sx={{ alignSelf: 'flex-end' }}>
              <Typography variant="caption" color="primary">활동 기록 전체 보기 →</Typography>
            </ButtonBase>
          </Stack>
        </Paper>
      </Popper>
    </Box>
  )
}
