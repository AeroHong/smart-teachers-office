/**
 * 호출 상세.
 *
 * 지난 호출 목록은 없앴다. 이미 끝난 호출은 다시 할 일이 없는데 목록만 길게 만들어,
 * 정작 지금 기다리는 학생이 묻혔다. 대기 중인 것만 남긴다.
 */
import { useState } from 'react'
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, schoolPath } from '@shared/lib/schema'
import { ToneChip } from './widgetUi'
import { useToast } from './ToastProvider'
import { formatRelative } from '../lib/formatTime'

const STATUS = {
  pending: { label: '대기 중', tone: 'danger' },
  acknowledged: { label: '확인함', tone: 'success' },
}

export default function CallDetail({ call }) {
  const { schoolId } = useAuth()
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  const setStatus = async (status) => {
    setBusy(true)
    try {
      const patch = { status }
      if (status === 'acknowledged') patch.acknowledgedAt = serverTimestamp()
      if (status === 'done') patch.doneAt = serverTimestamp()
      await updateDoc(doc(db, ...schoolPath(schoolId, COL.CALL_REQUESTS), call.id), patch)
    } catch (e) {
      toast.error('호출 상태를 바꾸지 못했습니다.', e)
    } finally {
      setBusy(false)
    }
  }

  const s = STATUS[call.status] || STATUS.pending

  return (
    <Box sx={{ p: 2.5, maxWidth: 640 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <Typography sx={{ fontSize: '1.1rem' }}>🔔</Typography>
        <Typography variant="h6" fontWeight={800}>
          {call.grade}-{call.classNo}-{call.number} {call.studentName}
        </Typography>
        <ToneChip label={s.label} tone={s.tone} />
      </Box>
      <Typography color="text.secondary" fontSize="0.85rem" mb={2.5}>
        {call.office}{call.createdAt && ` · ${formatRelative(call.createdAt)}`}
      </Typography>

      <Box sx={{ display: 'flex', gap: 1 }}>
        {call.status === 'pending' && (
          <Button variant="contained" disabled={busy} onClick={() => setStatus('acknowledged')}>
            확인했습니다
          </Button>
        )}
        <Button variant="outlined" disabled={busy} onClick={() => setStatus('done')}>
          완료 처리
        </Button>
      </Box>

      <Typography color="text.secondary" fontSize="0.8rem" sx={{ mt: 2 }}>
        완료로 표시하면 목록에서 사라집니다.
      </Typography>
    </Box>
  )
}
