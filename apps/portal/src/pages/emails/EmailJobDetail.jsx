/**
 * 발송 진행률 + 완료 후 상세보기.
 *
 * status가 'queued'든 'done'이든 같은 onSnapshot 구독 하나로 화면을 그린다 — 진행 중
 * 화면과 완료 후 상세보기를 굳이 나눌 이유가 없다(최종 상태도 그냥 마지막 스냅샷이다).
 *
 * 실제로 발송된 메일 내용은 이 화면 맨 위에 "한 번만" 보여준다 — 받는 사람이 몇 명이든
 * 같은 메일이므로, 아래 수신자별 표에는 전달 성공/실패 여부만 두고 내용을 중복해서
 * 보여주지 않는다(사용자 피드백, 2026-09-15).
 */
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { doc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import Button from '@mui/material/Button'
import LinearProgress from '@mui/material/LinearProgress'
import CircularProgress from '@mui/material/CircularProgress'
import Alert from '@mui/material/Alert'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Paper from '@mui/material/Paper'
import CancelIcon from '@mui/icons-material/Cancel'
import { useAuth } from '@shared/contexts/AuthContext'
import { db } from '@shared/lib/firebase'
import { buildEmailHtml } from '@shared/lib/emailTemplate'
import Layout from '../../components/Layout'

const STATUS_LABEL = {
  scheduled: { label: '예약됨', color: 'info' },
  queued: { label: '대기 중', color: 'default' },
  sending: { label: '발송 중', color: 'info' },
  done: { label: '발송 완료', color: 'success' },
  done_with_errors: { label: '일부 실패', color: 'warning' },
  failed: { label: '발송 실패', color: 'error' },
  cancelled: { label: '예약 취소됨', color: 'default' },
}

const RECIPIENT_STATUS_LABEL = {
  pending: { label: '대기', color: 'default' },
  sent: { label: '성공', color: 'success' },
  failed: { label: '실패', color: 'error' },
}

export default function EmailJobDetail() {
  const { jobId } = useParams()
  const { schoolId, user, isAdmin } = useAuth()
  const [job, setJob] = useState(null)
  const [notFound, setNotFound] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  useEffect(() => {
    if (!schoolId || !jobId) return
    const unsub = onSnapshot(doc(db, 'schools', schoolId, 'emailJobs', jobId), snap => {
      if (!snap.exists()) { setNotFound(true); return }
      setJob(snap.data())
    })
    return unsub
  }, [schoolId, jobId])

  if (notFound) {
    return <Layout><Alert severity="error">발송 내역을 찾을 수 없습니다.</Alert></Layout>
  }

  if (!job) {
    return (
      <Layout>
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
          <CircularProgress />
        </Box>
      </Layout>
    )
  }

  const { total, sent, failed } = job.counts || { total: 0, sent: 0, failed: 0 }
  const progress = total > 0 ? Math.round(((sent + failed) / total) * 100) : 0
  const inProgress = job.status === 'queued' || job.status === 'sending'
  const isScheduled = job.status === 'scheduled'
  const canCancel = isScheduled && (isAdmin || job.senderUid === user?.uid)
  const statusInfo = STATUS_LABEL[job.status] || { label: job.status, color: 'default' }

  const handleCancel = async () => {
    if (!window.confirm('예약된 발송을 취소할까요?')) return
    setCancelling(true)
    try {
      await updateDoc(doc(db, 'schools', schoolId, 'emailJobs', jobId), {
        status: 'cancelled',
        cancelledAt: serverTimestamp(),
      })
    } catch (err) {
      alert('취소 중 오류가 발생했습니다: ' + err.message)
    } finally {
      setCancelling(false)
    }
  }

  return (
    <Layout>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1, flexWrap: 'wrap' }}>
        <Typography variant="h5">{job.subject}</Typography>
        <Chip label={statusInfo.label} color={statusInfo.color} size="small" sx={{ fontWeight: 700 }} />
        {canCancel && (
          <Button
            size="small" color="error" variant="outlined" startIcon={<CancelIcon />}
            onClick={handleCancel} disabled={cancelling} sx={{ ml: 'auto' }}
          >
            예약 취소
          </Button>
        )}
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        보낸 사람: {job.senderName} ({job.senderEmail})
        {isScheduled && job.scheduledAt && (
          <> · 예정 발송 시각: {job.scheduledAt.toDate().toLocaleString('ko-KR')}</>
        )}
      </Typography>

      {job.status === 'failed' && job.failReason && (
        <Alert severity="error" sx={{ mb: 2 }}>{job.failReason}</Alert>
      )}
      {job.status === 'cancelled' && (
        <Alert severity="info" sx={{ mb: 2 }}>예약이 취소되어 발송되지 않았습니다.</Alert>
      )}

      {!isScheduled && job.status !== 'cancelled' && (
        <Box sx={{ mb: 3, maxWidth: 500 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              {sent + failed} / {total}명 처리됨
            </Typography>
            <Typography variant="body2" color="text.secondary">{progress}%</Typography>
          </Box>
          <LinearProgress
            variant={inProgress ? 'indeterminate' : 'determinate'}
            value={progress}
            color={failed > 0 ? 'warning' : 'primary'}
          />
          <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
            <Typography variant="body2" color="success.main">성공 {sent}</Typography>
            <Typography variant="body2" color="error.main">실패 {failed}</Typography>
          </Box>
        </Box>
      )}

      <Box sx={{ mb: 3, maxWidth: 700 }}>
        <Typography variant="subtitle2" sx={{ mb: 0.75 }}>발송된 메일 내용</Typography>
        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
          <Box
            component="iframe"
            title="sent-email-content"
            srcDoc={buildEmailHtml(job.schoolName, job.bodyHtml)}
            sx={{ display: 'block', width: '100%', height: 420, border: 0 }}
          />
        </Box>
      </Box>

      <Typography variant="subtitle2" sx={{ mb: 0.75 }}>받는 사람 ({total}명)</Typography>
      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider', maxWidth: 700 }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: 'grey.100' }}>
              <TableCell>학생</TableCell>
              <TableCell>이메일</TableCell>
              <TableCell align="center">상태</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(job.recipients || []).map(r => {
              const rs = RECIPIENT_STATUS_LABEL[r.status] || { label: r.status, color: 'default' }
              return (
                <TableRow key={r.workspaceUserId}>
                  <TableCell>{r.grade}학년 {r.class}반 {r.number}번 {r.name}</TableCell>
                  <TableCell>{r.email}</TableCell>
                  <TableCell align="center">
                    <Chip label={r.error ? `${rs.label}: ${r.error}` : rs.label} color={rs.color} size="small" />
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Layout>
  )
}
