/**
 * 상단바 호출 알림.
 *
 * 사이드바 섹션이던 것을 종 아이콘으로 옮겼다. 호출은 훑어보는 목록이 아니라 "지금 학생이
 * 기다리고 있다"는 신호라, 안내·요청과 같은 줄에 나열하면 성격이 섞인다. 어느 화면에
 * 있든 눈에 들어와야 하기도 하고.
 *
 * 대기 중인 것만 다룬다. 끝난 호출은 다시 할 일이 없는데 목록만 길게 만든다.
 */
import { useState } from 'react'
import { collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore'
import Badge from '@mui/material/Badge'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Popover from '@mui/material/Popover'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import NotificationsIcon from '@mui/icons-material/NotificationsNone'
import { useEffect } from 'react'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, schoolPath } from '@shared/lib/schema'
import { useToast } from './ToastProvider'
import { formatRelative } from '../lib/formatTime'

export default function CallBell() {
  const { user, schoolId } = useAuth()
  const toast = useToast()
  const [calls, setCalls] = useState([])
  const [anchor, setAnchor] = useState(null)
  const [busy, setBusy] = useState(null)

  useEffect(() => {
    if (!schoolId || !user) return
    return onSnapshot(
      query(
        collection(db, ...schoolPath(schoolId, COL.CALL_REQUESTS)),
        where('teacherUid', '==', user.uid),
        orderBy('createdAt', 'desc'),
        limit(30),
      ),
      snap => setCalls(
        snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(c => c.status === 'pending' || c.status === 'acknowledged'),
      ),
      () => {},
    )
  }, [schoolId, user])

  const pendingCount = calls.filter(c => c.status === 'pending').length

  const setStatus = async (call, status) => {
    setBusy(call.id)
    try {
      const patch = { status }
      if (status === 'acknowledged') patch.acknowledgedAt = serverTimestamp()
      if (status === 'done') patch.doneAt = serverTimestamp()
      await updateDoc(doc(db, ...schoolPath(schoolId, COL.CALL_REQUESTS), call.id), patch)
    } catch (e) {
      toast.error('호출 상태를 바꾸지 못했습니다.', e)
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <Tooltip title="호출 알림">
        <IconButton size="small" onClick={e => setAnchor(e.currentTarget)} aria-label="호출 알림">
          <Badge
            badgeContent={pendingCount}
            color="error"
            sx={{ '& .MuiBadge-badge': { fontSize: '0.62rem', height: 15, minWidth: 15 } }}
          >
            <NotificationsIcon sx={{ fontSize: 20, color: calls.length > 0 ? 'text.primary' : 'text.disabled' }} />
          </Badge>
        </IconButton>
      </Tooltip>

      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 320, mt: 0.5 } } }}
      >
        <Box sx={{ px: 1.5, py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography fontSize="0.82rem" fontWeight={800}>
            대기 중인 호출 {calls.length > 0 && `(${calls.length})`}
          </Typography>
        </Box>

        {calls.length === 0 ? (
          <Typography color="text.disabled" fontSize="0.83rem" sx={{ px: 1.5, py: 2 }}>
            대기 중인 호출이 없습니다.
          </Typography>
        ) : (
          <Box sx={{ maxHeight: 360, overflowY: 'auto', py: 0.5 }}>
            {calls.map(call => (
              <Box key={call.id} sx={{ px: 1.5, py: 0.9, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Typography fontSize="0.86rem" fontWeight={call.status === 'pending' ? 700 : 600} noWrap>
                    {call.grade}-{call.classNo}-{call.number} {call.studentName}
                  </Typography>
                  <Typography fontSize="0.74rem" color="text.secondary" noWrap>
                    {call.office}{call.createdAt && ` · ${formatRelative(call.createdAt)}`}
                  </Typography>
                </Box>
                {call.status === 'pending' ? (
                  <Button size="small" disabled={busy === call.id} onClick={() => setStatus(call, 'acknowledged')}>
                    확인
                  </Button>
                ) : (
                  <Button size="small" color="inherit" disabled={busy === call.id} onClick={() => setStatus(call, 'done')}>
                    완료
                  </Button>
                )}
              </Box>
            ))}
          </Box>
        )}
      </Popover>
    </>
  )
}
