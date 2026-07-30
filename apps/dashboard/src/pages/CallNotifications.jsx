import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where, orderBy, limit, doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import DashboardLayout from '../components/DashboardLayout'

const STATUS_STYLE = {
  pending:      { label: '대기 중', bg: '#fdecea', fg: '#d32f2f' },
  acknowledged: { label: '확인함',  bg: '#e8f5e9', fg: '#2e7d32' },
  done:         { label: '완료',    bg: '#f1f3f4', fg: '#5f6368' },
  expired:      { label: '만료',    bg: '#f1f3f4', fg: '#9aa0a6' },
}

export default function CallNotifications() {
  const { user, schoolId } = useAuth()
  const [calls, setCalls] = useState([])
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!schoolId || !user) return
    const q = query(
      collection(db, 'schools', schoolId, 'callRequests'),
      where('teacherUid', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(50),
    )
    return onSnapshot(q, snap => setCalls(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [schoolId, user])

  const { active, past } = useMemo(() => ({
    active: calls.filter(c => c.status === 'pending' || c.status === 'acknowledged'),
    past: calls.filter(c => c.status === 'done' || c.status === 'expired'),
  }), [calls])

  const setStatus = async (call, status) => {
    const patch = { status }
    if (status === 'acknowledged') patch.acknowledgedAt = serverTimestamp()
    if (status === 'done') patch.doneAt = serverTimestamp()
    await updateDoc(doc(db, 'schools', schoolId, 'callRequests', call.id), patch)
  }

  return (
    <DashboardLayout>
      <Box sx={{ maxWidth: 880, mx: 'auto' }}>
        <Typography variant="h6" fontWeight={700} mb={2}>나를 찾는 학생</Typography>

        {active.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <Typography fontSize="2.5rem" mb={1}>🔔</Typography>
            <Typography color="text.secondary">대기 중인 호출이 없습니다.</Typography>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {active.map(call => (
              <CallCard key={call.id} call={call} now={now} onSetStatus={setStatus} />
            ))}
          </Box>
        )}

        {past.length > 0 && (
          <>
            <Typography variant="subtitle2" color="text.secondary" mt={4} mb={1.5}>지난 호출</Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {past.map(call => (
                <CallCard key={call.id} call={call} now={now} onSetStatus={setStatus} compact />
              ))}
            </Box>
          </>
        )}
      </Box>
    </DashboardLayout>
  )
}

function CallCard({ call, now, onSetStatus, compact }) {
  const style = STATUS_STYLE[call.status] || STATUS_STYLE.done
  const createdMs = call.createdAt?.toMillis?.() ?? null

  return (
    <Card sx={{ p: compact ? 1.5 : 2, opacity: compact ? 0.7 : 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography fontWeight={600} fontSize={compact ? '0.95rem' : '1.05rem'}>
            {call.grade}학년 {call.classNo}반 {call.number}번 {call.studentName}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {call.office}
            {createdMs && ` · ${formatWhen(createdMs, now)}`}
          </Typography>
        </Box>

        <Chip size="small" label={style.label} sx={{ bgcolor: style.bg, color: style.fg, fontWeight: 600 }} />

        {call.status === 'pending' && (
          <Button size="small" variant="contained" onClick={() => onSetStatus(call, 'acknowledged')}>확인</Button>
        )}
        {call.status === 'acknowledged' && (
          <Button size="small" variant="outlined" onClick={() => onSetStatus(call, 'done')}>완료</Button>
        )}
      </Box>
    </Card>
  )
}

function formatWhen(ms, now) {
  const sec = Math.floor((now - ms) / 1000)
  if (sec < 60) return '방금 전'
  if (sec < 3600) return `${Math.floor(sec / 60)}분 전`
  return new Date(ms).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
