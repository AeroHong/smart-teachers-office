/**
 * 발송 내역 목록 — 본인 것만(일반 교사) / 전체(관리자).
 *
 * firestore.rules가 이미 이 범위를 강제하므로(emailJobs read 규칙), 여기서 쿼리를
 * 좁히지 않아도 안전하지만, 관리자가 아닌 계정이 where 없이 전체를 구독하면 규칙
 * 위반으로 거부되므로 쿼리도 규칙과 같은 기준으로 나눠야 한다.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Paper from '@mui/material/Paper'
import Alert from '@mui/material/Alert'
import AddIcon from '@mui/icons-material/Add'
import { useAuth } from '@shared/contexts/AuthContext'
import { db } from '@shared/lib/firebase'
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

export default function EmailHistory() {
  const { schoolId, user, isAdmin } = useAuth()
  const navigate = useNavigate()
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!schoolId || !user) return
    const q = isAdmin
      ? query(collection(db, 'schools', schoolId, 'emailJobs'), orderBy('createdAt', 'desc'))
      : query(collection(db, 'schools', schoolId, 'emailJobs'), where('senderUid', '==', user.uid), orderBy('createdAt', 'desc'))

    const unsub = onSnapshot(q, snap => {
      setJobs(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    }, err => {
      setError(err.message)
      setLoading(false)
    })
    return unsub
  }, [schoolId, user, isAdmin])

  const formatDate = (ts) => {
    if (!ts) return ''
    return ts.toDate().toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <Layout>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5">이메일 발송 내역{isAdmin ? ' (전체)' : ''}</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/emails/new')}>
          새 메일 작성
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : jobs.length === 0 ? (
        <Typography color="text.secondary">발송 내역이 없습니다.</Typography>
      ) : (
        <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'grey.100' }}>
                <TableCell>제목</TableCell>
                {isAdmin && <TableCell>보낸 사람</TableCell>}
                <TableCell align="center">대상</TableCell>
                <TableCell align="center">상태</TableCell>
                <TableCell align="right">일시</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {jobs.map(job => {
                const statusInfo = STATUS_LABEL[job.status] || { label: job.status, color: 'default' }
                return (
                  <TableRow key={job.id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/emails/${job.id}`)}>
                    <TableCell sx={{ fontWeight: 600 }}>{job.subject}</TableCell>
                    {isAdmin && <TableCell>{job.senderName}</TableCell>}
                    <TableCell align="center">{job.counts?.total ?? 0}명</TableCell>
                    <TableCell align="center">
                      <Chip label={statusInfo.label} color={statusInfo.color} size="small" />
                    </TableCell>
                    <TableCell align="right">{formatDate(job.createdAt)}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Layout>
  )
}
