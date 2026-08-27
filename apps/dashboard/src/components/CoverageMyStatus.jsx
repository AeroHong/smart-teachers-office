/**
 * 보강신청 — 내 현황. 포털의 CoverMypage.jsx 포팅(로직은 거의 그대로, Layout 제거하고
 * 대시보드 3단 본문 스타일로).
 */
import { useEffect, useState } from 'react'
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, schoolPath } from '@shared/lib/schema'
import { parseCoverDate, weekdayLabel } from '@shared/lib/coverRequests'
import { useToast } from './ToastProvider'

export default function CoverageMyStatus() {
  const { user, userName, schoolId } = useAuth()
  const toast = useToast()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user || !schoolId) return
    const q = query(
      collection(db, ...schoolPath(schoolId, COL.COVER_REQUESTS)),
      where('coverTeacherEmail', '==', user.email),
      orderBy('date', 'desc'),
    )
    const unsub = onSnapshot(q, snap => {
      setRecords(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    }, e => {
      toast.error('내 보강 기록을 불러오지 못했습니다.', e)
      setLoading(false)
    })
    return unsub
  }, [user, schoolId, toast])

  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 10, gap: 2 }}>
        <CircularProgress size={28} />
        <Typography color="text.secondary" fontSize="0.9rem">내 기록을 불러오는 중입니다...</Typography>
      </Box>
    )
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return (
    <Box sx={{ p: 2.5, maxWidth: 760 }}>
      <Typography variant="h6" fontWeight={800} mb={0.5}>{userName}님의 보강 노트</Typography>
      <Typography color="text.secondary" fontSize="0.85rem" mb={2}>
        지금까지 지원해주신 보강 {records.length}건입니다.
      </Typography>

      {records.length === 0 ? (
        <Typography color="text.secondary" fontSize="0.9rem" sx={{ py: 4 }}>
          아직 보강 지원 내역이 없습니다. '보강 목록'에서 신청해보세요.
        </Typography>
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700, color: 'text.secondary' }}>날짜</TableCell>
              <TableCell sx={{ fontWeight: 700, color: 'text.secondary' }}>대상</TableCell>
              <TableCell sx={{ fontWeight: 700, color: 'text.secondary' }}>결강교사(과목)</TableCell>
              <TableCell align="center" sx={{ fontWeight: 700, color: 'text.secondary' }}>상태</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {records.map(item => {
              const d = parseCoverDate(item.date)
              const isDone = d && d < today
              return (
                <TableRow key={item.id} hover>
                  <TableCell>{item.date} {weekdayLabel(item.date)}</TableCell>
                  <TableCell>
                    <Box component="span" fontWeight={700}>{item.className}</Box>{' '}
                    <Box component="span" fontSize="0.78rem" color="text.secondary">{item.period}교시</Box>
                  </TableCell>
                  <TableCell sx={{ color: 'text.secondary' }}>
                    {item.absentTeacher}{' '}
                    <Box component="span" fontSize="0.78rem" color="text.disabled">({item.subject})</Box>
                  </TableCell>
                  <TableCell align="center">
                    {isDone ? (
                      <Chip label="완료됨" size="small" variant="outlined" sx={{ color: 'text.secondary' }} />
                    ) : (
                      <Chip label="예정됨" size="small" color="success" variant="outlined" />
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
    </Box>
  )
}
