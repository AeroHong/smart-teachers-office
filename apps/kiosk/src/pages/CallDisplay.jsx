import { useEffect, useState, useMemo } from 'react'
import { collection, onSnapshot, query, where, orderBy, limit } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import { db } from '@shared/lib/firebase'
import { useKiosk } from '../contexts/KioskContext'

const ACTIVE_STATUSES = ['pending', 'acknowledged']

export default function CallDisplay() {
  const { device } = useKiosk()
  const [calls, setCalls] = useState([])
  const [now, setNow] = useState(Date.now())
  const [error, setError] = useState('')

  // 경과 시간 표시를 위해 1초마다 갱신
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    // office 필터가 보안 규칙(kioskOffice 일치)과 맞아야 쿼리가 통과한다
    const q = query(
      collection(db, 'schools', device.schoolId, 'callRequests'),
      where('office', '==', device.office),
      orderBy('createdAt', 'desc'),
      limit(100),
    )
    const unsub = onSnapshot(q,
      snap => setCalls(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => setError(err.message),
    )
    return unsub
  }, [device.schoolId, device.office])

  const active = useMemo(
    () => calls.filter(c => ACTIVE_STATUSES.includes(c.status)).reverse(),  // 오래된 호출이 위로
    [calls],
  )

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#0f172a', color: '#fff', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{
        px: 4, py: 2.5, display: 'flex', alignItems: 'center', gap: 2,
        borderBottom: '1px solid rgba(255,255,255,0.1)',
      }}>
        <Typography fontSize="1.5rem" fontWeight={800}>🔔 학생 호출 현황</Typography>
        <Typography fontSize="1.1rem" sx={{ color: 'rgba(255,255,255,0.55)' }}>{device.office}</Typography>
        <Box sx={{ ml: 'auto', textAlign: 'right' }}>
          <Typography fontSize="1.6rem" fontWeight={700} sx={{ lineHeight: 1 }}>
            {new Date(now).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
          </Typography>
        </Box>
      </Box>

      {error ? (
        <Empty icon="⚠️" title="호출 목록을 불러오지 못했습니다" sub={error} />
      ) : active.length === 0 ? (
        <Empty icon="☕" title="대기 중인 호출이 없습니다" sub="학생이 호출하면 이 화면에 바로 표시됩니다." />
      ) : (
        <Box sx={{ flex: 1, p: 3, display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
          {active.map(call => (
            <CallCard key={call.id} call={call} now={now} />
          ))}
        </Box>
      )}
    </Box>
  )
}

function CallCard({ call, now }) {
  const isPending = call.status === 'pending'
  const createdMs = call.createdAt?.toMillis?.() ?? null
  const elapsed = createdMs ? Math.floor((now - createdMs) / 1000) : null

  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', gap: 3, px: 3.5, py: 2.5, borderRadius: 3,
      bgcolor: isPending ? 'rgba(239,68,68,0.14)' : 'rgba(255,255,255,0.06)',
      border: '2px solid', borderColor: isPending ? '#ef4444' : 'rgba(255,255,255,0.12)',
    }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography fontSize="2rem" fontWeight={800} sx={{ lineHeight: 1.25 }}>
          {call.teacherName} 선생님
        </Typography>
        <Typography fontSize="1.25rem" sx={{ color: 'rgba(255,255,255,0.75)' }}>
          {call.grade}학년 {call.classNo}반 {call.number}번 {call.studentName} 학생이 찾아왔습니다
        </Typography>
      </Box>

      <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
        <Chip
          label={isPending ? '대기 중' : '확인함'}
          sx={{
            fontSize: '1rem', fontWeight: 700, height: 36, px: 1,
            bgcolor: isPending ? '#ef4444' : '#22c55e', color: '#fff', mb: 0.5,
          }}
        />
        {elapsed !== null && (
          <Typography fontSize="1.05rem" sx={{ color: 'rgba(255,255,255,0.55)' }}>
            {formatElapsed(elapsed)}
          </Typography>
        )}
      </Box>
    </Box>
  )
}

function formatElapsed(sec) {
  if (sec < 60) return `${sec}초 전`
  const m = Math.floor(sec / 60)
  return `${m}분 ${sec % 60}초 전`
}

function Empty({ icon, title, sub }) {
  return (
    <Box sx={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 1.5,
    }}>
      <Typography fontSize="4.5rem">{icon}</Typography>
      <Typography fontSize="1.8rem" fontWeight={700}>{title}</Typography>
      <Typography fontSize="1.1rem" sx={{ color: 'rgba(255,255,255,0.5)' }}>{sub}</Typography>
    </Box>
  )
}
