import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where, orderBy, limit, doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { EmptyState, ListRow, RowStack, SectionLabel, ToneChip, useWidgetBadge } from '../components/widgetUi'
import { useToast } from '../components/ToastProvider'
import { formatRelative } from '../lib/formatTime'

const STATUS_STYLE = {
  pending:      { label: '대기 중', tone: 'danger' },
  acknowledged: { label: '확인함',  tone: 'success' },
  done:         { label: '완료',    tone: 'neutral' },
  expired:      { label: '만료',    tone: 'neutral' },
}

const PAST_COUNT = 5

export default function CallsWidget() {
  const { user, schoolId } = useAuth()
  const toast = useToast()
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
    past: calls.filter(c => c.status === 'done' || c.status === 'expired').slice(0, PAST_COUNT),
  }), [calls])

  // 아직 확인하지 않은 호출만 배지로 — 확인한 호출까지 세면 숫자가 줄지 않아 무시하게 된다
  const pendingCount = useMemo(() => active.filter(c => c.status === 'pending').length, [active])
  useWidgetBadge(pendingCount)

  const setStatus = async (call, status) => {
    const patch = { status }
    if (status === 'acknowledged') patch.acknowledgedAt = serverTimestamp()
    if (status === 'done') patch.doneAt = serverTimestamp()
    try {
      await updateDoc(doc(db, 'schools', schoolId, 'callRequests', call.id), patch)
    } catch (e) {
      toast.error('호출 상태를 바꾸지 못했습니다.', e)
    }
  }

  return (
    <Box>
      {active.length === 0 ? (
        <EmptyState emoji="🔔" message="대기 중인 호출이 없습니다." />
      ) : (
        <RowStack>
          {active.map(call => (
            <CallRow key={call.id} call={call} now={now} onSetStatus={setStatus} />
          ))}
        </RowStack>
      )}

      {past.length > 0 && (
        <>
          <SectionLabel>지난 호출</SectionLabel>
          <RowStack dense>
            {past.map(call => (
              <CallRow key={call.id} call={call} now={now} onSetStatus={setStatus} compact />
            ))}
          </RowStack>
        </>
      )}
    </Box>
  )
}

function CallRow({ call, now, onSetStatus, compact }) {
  const style = STATUS_STYLE[call.status] || STATUS_STYLE.done

  return (
    <ListRow dense={compact} muted={compact} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Typography fontWeight={600} fontSize={compact ? '0.88rem' : '0.98rem'} noWrap>
          {call.grade}-{call.classNo}-{call.number} {call.studentName}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
          {call.office}{call.createdAt && ` · ${formatRelative(call.createdAt, now)}`}
        </Typography>
      </Box>
      <ToneChip label={style.label} tone={style.tone} />
      {call.status === 'pending' && (
        <Button size="small" variant="contained" onClick={() => onSetStatus(call, 'acknowledged')}>확인</Button>
      )}
      {call.status === 'acknowledged' && (
        <Button size="small" variant="outlined" onClick={() => onSetStatus(call, 'done')}>완료</Button>
      )}
    </ListRow>
  )
}
