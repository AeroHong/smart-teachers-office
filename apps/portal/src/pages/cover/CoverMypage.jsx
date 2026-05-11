import { useState, useEffect } from 'react'
import {
  collection, query, where, orderBy, onSnapshot,
} from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../contexts/AuthContext'
import Layout from '../../components/Layout'

import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Alert from '@mui/material/Alert'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Paper from '@mui/material/Paper'

export default function CoverMypage() {
  const { user, schoolId } = useAuth()

  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const myName = user?.displayName?.replace(' 선생님', '').trim() ?? ''

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  useEffect(() => {
    if (!user || !schoolId) return

    const q = query(
      collection(db, 'schools', schoolId, 'coverRequests'),
      where('coverTeacherEmail', '==', user.email),
      orderBy('date', 'desc')
    )

    const unsub = onSnapshot(q, snap => {
      setRecords(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    }, err => {
      setError(err.message)
      setLoading(false)
    })

    return unsub
  }, [user, schoolId])

  return (
    <Layout>
      {loading && (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 10, gap: 2 }}>
          <CircularProgress color="success" />
          <Typography color="text.secondary" fontWeight={600}>내 기록을 불러오는 중입니다...</Typography>
        </Box>
      )}

      {!loading && error && <Alert severity="error" sx={{ my: 2 }}>{error}</Alert>}

      {!loading && !error && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* 프로필 + 총 횟수 카드 */}
          <Card>
            <CardContent
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 2,
                p: { xs: 3, sm: 4 },
              }}
            >
              <Box>
                <Typography variant="h5">
                  <Box component="span" color="success.main">{myName}</Box>
                  {' '}선생님의 보강 노트
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  지금까지 학교를 위해 지원해주신 소중한 기록입니다.
                </Typography>
              </Box>
              <Box
                sx={{
                  textAlign: 'center',
                  bgcolor: 'success.50',
                  border: '1px solid',
                  borderColor: 'success.light',
                  borderRadius: 3,
                  px: 4,
                  py: 2,
                }}
              >
                <Typography variant="body2" fontWeight={700} color="success.dark">총 지원 횟수</Typography>
                <Typography
                  sx={{ fontSize: { xs: '2rem', sm: '2.4rem' }, fontWeight: 900, color: 'success.main', lineHeight: 1.2, mt: 0.5 }}
                >
                  {records.length}
                  <Box component="span" sx={{ fontSize: '1rem', fontWeight: 400, color: 'text.secondary', ml: 0.5 }}>
                    회
                  </Box>
                </Typography>
              </Box>
            </CardContent>
          </Card>

          {/* 상세 내역 테이블 */}
          <Card>
            <Box sx={{ px: 3, py: 2, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'grey.50' }}>
              <Typography variant="subtitle1">상세 내역</Typography>
            </Box>
            <TableContainer component={Paper} elevation={0}>
              <Table sx={{ whiteSpace: 'nowrap' }}>
                <TableHead>
                  <TableRow sx={{ bgcolor: 'grey.100' }}>
                    {['날짜', '대상(교시)', '결강교사(과목)', '진행 상태'].map(h => (
                      <TableCell key={h} align={h === '진행 상태' ? 'center' : 'left'}
                        sx={{ fontWeight: 700, fontSize: '0.78rem', color: 'text.secondary', textTransform: 'uppercase' }}>
                        {h}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {records.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                        아직 보강 지원 내역이 없습니다. 첫 보강을 신청해보세요!
                      </TableCell>
                    </TableRow>
                  ) : (
                    records.map(item => {
                      const itemDate = new Date(item.date)
                      const isDone = !isNaN(itemDate.getTime()) && itemDate < today

                      return (
                        <TableRow key={item.id} hover sx={{ '&:last-child td': { borderBottom: 0 } }}>
                          <TableCell sx={{ fontWeight: 500 }}>{item.date}</TableCell>
                          <TableCell>
                            <Box component="span" fontWeight={900}>{item.className}</Box>{' '}
                            <Box component="span" fontSize="0.78rem" color="text.secondary">{item.period}교시</Box>
                          </TableCell>
                          <TableCell sx={{ color: 'text.secondary' }}>
                            {item.absentTeacher}{' '}
                            <Box component="span" fontSize="0.78rem" color="text.disabled">({item.subject})</Box>
                          </TableCell>
                          <TableCell align="center">
                            {isDone ? (
                              <Chip label="완료됨" size="small" variant="outlined"
                                sx={{ color: 'text.secondary', borderColor: 'divider' }} />
                            ) : (
                              <Chip label="예정됨" size="small" color="success" variant="outlined"
                                sx={{
                                  animation: 'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite',
                                  '@keyframes pulse': {
                                    '0%, 100%': { opacity: 1 },
                                    '50%': { opacity: 0.55 },
                                  },
                                }} />
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>
        </Box>
      )}
    </Layout>
  )
}
