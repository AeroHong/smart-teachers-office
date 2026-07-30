import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where, orderBy, limit, doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'

const STATUS_STYLE = {
  pending:      { label: '대기 중', bg: '#fdecea', fg: '#d32f2f' },
  acknowledged: { label: '확인함',  bg: '#e8f5e9', fg: '#2e7d32' },
  done:         { label: '완료',    bg: '#f1f3f4', fg: '#5f6368' },
  expired:      { label: '만료',    bg: '#f1f3f4', fg: '#9aa0a6' },
}

export default function CallsWidget() {
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
      limit(30),
    )
    return onSnapshot(q, snap => setCalls(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [schoolId, user])

  const { active, past } = useMemo(() => ({
    active: calls.filter(c => c.status === 'pending' || c.status === 'acknowledged'),
    past: calls.filter(c => c.status === 'done' || c.status === 'expired').slice(0, 5),
  }), [calls])

  const setStatus = async (call, status) => {
    const patch = { status }
    if (status === 'acknowledged') patch.acknowledgedAt = serverTimestamp()
    if (status === 'done') patch.doneAt = serverTimestamp()
    await updateDoc(doc(db, 'schools', schoolId, 'callRequests', call.id), patch)
  }

  return (
    <Box>
      {active.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography fontSize="2rem" mb={0.5}>🔔</Typography>
          <Typography color="text.secondary" fontSize="0.9rem">대기 중인 호출이 없습니다.</Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {active.map(call => (
            <CallRow key={call.id} call={call} now={now} onSetStatus={setStatus} />
          ))}
        </Box>
      )}

      {past.length > 0 && (
        <>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2, mb: 0.8 }}>
            지난 호출
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.7 }}>
            {past.map(call => (
              <CallRow key={call.id} call={call} now={now} onSetStatus={setStatus} compact />
            ))}
          </Box>
        </>
      )}
    </Box>
  )
}

function CallRow({ call, now, onSetStatus, compact }) {
  const style = STATUS_STYLE[call.status] || STATUS_STYLE.done
  const createdMs = call.createdAt?.toMillis?.() ?? null

  return (
    <Box sx={{
      p: compact ? 1 : 1.3, borderRadius: 2, border: '1px solid #ececf1',
      opacity: compact ? 0.65 : 1,
      display: 'flex', alignItems: 'center', gap: 1,
    }}>
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Typography fontWeight={600} fontSize={compact ? '0.88rem' : '0.98rem'} noWrap>
          {call.grade}-{call.classNo}-{call.number} {call.studentName}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
          {call.office}{createdMs && ` · ${formatWhen(createdMs, now)}`}
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
  )
}

function formatWhen(ms, now) {
  const sec = Math.floor((now - ms) / 1000)
  if (sec < 60) return '방금 전'
  if (sec < 3600) return `${Math.floor(sec / 60)}분 전`
  return new Date(ms).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
