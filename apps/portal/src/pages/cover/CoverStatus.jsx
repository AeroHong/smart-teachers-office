import { useState, useEffect, useMemo } from 'react'
import {
  collection, query, orderBy, onSnapshot,
} from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../contexts/AuthContext'
import Layout from '../../components/Layout'

import Box from '@mui/material/Box'
import Grid from '@mui/material/Grid'
import Card from '@mui/material/Card'
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
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'

const MEDALS = ['🥇', '🥈', '🥉']
const ROWS_OPTIONS = [
  { value: 10, label: '10개씩 보기' },
  { value: 50, label: '50개씩 보기' },
  { value: 100, label: '100개씩 보기' },
  { value: 'all', label: '전체 보기' },
]

function parseMonthKey(dateStr) {
  const m = String(dateStr).match(/^(\d{4})-(\d{2})/)
  if (!m) return null
  return `${parseInt(m[1])}년 ${parseInt(m[2])}월`
}

export default function CoverStatus() {
  const { user, schoolId } = useAuth()

  const [allHistory, setAllHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [selectedMonth, setSelectedMonth] = useState('')
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [currentPage, setCurrentPage] = useState(1)
  const [hallTab, setHallTab] = useState('month')

  // Firestore 실시간 구독 (전체 기록)
  useEffect(() => {
    if (!user || !schoolId) return

    const q = query(
      collection(db, 'schools', schoolId, 'coverRequests'),
      orderBy('date', 'desc')
    )

    const unsub = onSnapshot(q, snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setAllHistory(data)
      setLoading(false)
    }, err => {
      setError(err.message)
      setLoading(false)
    })

    return unsub
  }, [user, schoolId])

  // 월 옵션 및 기본 선택
  const monthOptions = useMemo(() => {
    const keys = [...new Set(allHistory.map(r => parseMonthKey(r.date)).filter(Boolean))]
    return keys.sort().reverse()
  }, [allHistory])

  useEffect(() => {
    if (monthOptions.length === 0) return
    const now = new Date()
    const curKey = `${now.getFullYear()}년 ${now.getMonth() + 1}월`
    setSelectedMonth(monthOptions.includes(curKey) ? curKey : monthOptions[0])
  }, [monthOptions])

  // 명예의 전당 통계 계산
  const stats = useMemo(() => {
    const map = {}
    allHistory.filter(r => r.coverTeacher && r.coverTeacherEmail).forEach(r => {
      const key = r.coverTeacherEmail
      if (!map[key]) map[key] = { name: r.coverTeacher, email: r.coverTeacherEmail, totalCount: 0, monthCount: 0 }
      map[key].totalCount++
      if (parseMonthKey(r.date) === selectedMonth) map[key].monthCount++
    })
    return Object.values(map)
  }, [allHistory, selectedMonth])

  const hallStats = [...stats].sort((a, b) =>
    hallTab === 'total' ? b.totalCount - a.totalCount : b.monthCount - a.monthCount
  )

  // 필터 + 페이지네이션
  const filteredData = selectedMonth === 'all' || !selectedMonth
    ? allHistory
    : allHistory.filter(r => parseMonthKey(r.date) === selectedMonth)

  const effectiveRows = rowsPerPage === 'all' ? Math.max(filteredData.length, 1) : rowsPerPage
  const totalPages = Math.max(Math.ceil(filteredData.length / effectiveRows), 1)
  const paginatedData = filteredData.slice((currentPage - 1) * effectiveRows, currentPage * effectiveRows)

  const handleMonthChange = e => { setSelectedMonth(e.target.value); setCurrentPage(1) }
  const handleRowsChange  = e => { setRowsPerPage(e.target.value); setCurrentPage(1) }

  return (
    <Layout>
      <Typography variant="h5" sx={{ mb: 3 }}>보강 종합 현황판</Typography>

      {loading && (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 10, gap: 2 }}>
          <CircularProgress />
          <Typography color="primary" fontWeight={600}>데이터를 불러오는 중입니다...</Typography>
        </Box>
      )}

      {!loading && error && <Alert severity="error" sx={{ my: 2 }}>{error}</Alert>}

      {!loading && !error && (
        <Grid container spacing={3} alignItems="flex-start">
          {/* ─── 좌: 보강 운영 현황 ─── */}
          <Grid item xs={12} lg={8}>
            <Card sx={{ display: 'flex', flexDirection: 'column' }}>
              {/* 헤더 + 필터 */}
              <Box
                sx={{
                  px: 3, py: 2,
                  borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'grey.50',
                  display: 'flex',
                  flexDirection: { xs: 'column', sm: 'row' },
                  justifyContent: 'space-between',
                  alignItems: { xs: 'flex-start', sm: 'center' },
                  gap: 2,
                }}
              >
                <Box>
                  <Typography variant="subtitle1">보강 운영 현황</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                    전체 보강 요청 및 처리 내역입니다.
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <FormControl size="small" sx={{ minWidth: 130 }}>
                    <InputLabel>월 선택</InputLabel>
                    <Select value={selectedMonth} label="월 선택" onChange={handleMonthChange}>
                      <MenuItem value="all">전체 월 보기</MenuItem>
                      {monthOptions.map(m => <MenuItem key={m} value={m}>{m}</MenuItem>)}
                    </Select>
                  </FormControl>
                  <FormControl size="small" sx={{ minWidth: 130 }}>
                    <InputLabel>표시 개수</InputLabel>
                    <Select value={rowsPerPage} label="표시 개수" onChange={handleRowsChange}>
                      {ROWS_OPTIONS.map(opt => <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Box>
              </Box>

              {/* 현황 테이블 */}
              <TableContainer component={Paper} elevation={0} sx={{ overflowX: 'auto' }}>
                <Table sx={{ whiteSpace: 'nowrap' }}>
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'grey.100' }}>
                      {['날짜', '대상(교시)', '결강교사(과목)', '상태', '신청교사'].map(h => (
                        <TableCell key={h} align={h === '상태' ? 'center' : 'left'}
                          sx={{ fontWeight: 700, fontSize: '0.78rem', color: 'text.secondary', textTransform: 'uppercase' }}>
                          {h}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {paginatedData.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                          해당 조건의 데이터가 없습니다.
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedData.map(item => (
                        <TableRow key={item.id} hover sx={{ '&:last-child td': { borderBottom: 0 } }}>
                          <TableCell sx={{ fontWeight: 500 }}>{item.date}</TableCell>
                          <TableCell>
                            <Box component="span" fontWeight={700}>{item.className}</Box>{' '}
                            <Box component="span" fontSize="0.78rem" color="text.secondary">{item.period}교시</Box>
                          </TableCell>
                          <TableCell>
                            {item.absentTeacher}{' '}
                            <Box component="span" fontSize="0.78rem" color="text.disabled">({item.subject})</Box>
                          </TableCell>
                          <TableCell align="center">
                            {item.status === '마감' ? (
                              <Chip label="마감" size="small"
                                sx={{ bgcolor: 'grey.100', color: 'text.secondary', fontWeight: 700 }} />
                            ) : (
                              <Chip label="대기중" size="small" color="success" />
                            )}
                          </TableCell>
                          <TableCell>
                            {item.coverTeacher ? (
                              <Box component="span" fontWeight={700} color="primary.main">
                                {item.coverTeacher} 선생님
                              </Box>
                            ) : (
                              <Box component="span" color="text.disabled">미정</Box>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>

              {/* 페이지네이션 */}
              <Divider />
              <Box sx={{ px: 3, py: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Button variant="outlined" size="small" disabled={currentPage === 1}
                  onClick={() => setCurrentPage(p => p - 1)}>이전</Button>
                <Typography variant="body2" fontWeight={700} color="text.secondary">
                  {currentPage} / {totalPages} 페이지 (총 {filteredData.length}건)
                </Typography>
                <Button variant="outlined" size="small" disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(p => p + 1)}>다음</Button>
              </Box>
            </Card>
          </Grid>

          {/* ─── 우: 명예의 전당 ─── */}
          <Grid item xs={12} lg={4}>
            <Card sx={{ display: 'flex', flexDirection: 'column' }}>
              <Box
                sx={{
                  px: 3, py: 2,
                  borderBottom: '1px solid', borderColor: 'divider',
                  background: 'linear-gradient(135deg, #fffde7 0%, #fff3e0 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: 1, flexWrap: 'wrap',
                }}
              >
                <Box>
                  <Typography variant="subtitle1">🏆 명예의 전당</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                    {hallTab === 'total' ? '누적 보강 지원 순위' : `${selectedMonth || '이번 달'} 보강 지원 순위`}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', borderRadius: 1, overflow: 'hidden', border: '1px solid', borderColor: 'warning.light' }}>
                  {[{ key: 'month', label: '월별' }, { key: 'total', label: '전체' }].map(tab => (
                    <Box key={tab.key} onClick={() => setHallTab(tab.key)}
                      sx={{
                        px: 1.5, py: 0.5, fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
                        bgcolor: hallTab === tab.key ? 'warning.main' : 'transparent',
                        color: hallTab === tab.key ? 'white' : 'warning.dark',
                        transition: 'all 0.15s', userSelect: 'none',
                        '&:hover': { bgcolor: hallTab === tab.key ? 'warning.main' : 'warning.50' },
                      }}
                    >
                      {tab.label}
                    </Box>
                  ))}
                </Box>
              </Box>

              <TableContainer component={Paper} elevation={0} sx={{ maxHeight: 560, overflowY: 'auto' }}>
                <Table>
                  <TableBody>
                    {hallStats.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                          아직 보강 지원 내역이 없습니다.
                        </TableCell>
                      </TableRow>
                    ) : (
                      hallStats.map((item, index) => (
                        <TableRow key={item.email}
                          sx={{ '&:hover': { bgcolor: 'grey.50' }, '&:last-child td': { borderBottom: 0 } }}>
                          <TableCell align="center" sx={{ width: 48, py: 1.5, px: 1.5 }}>
                            {index < 3 ? (
                              <Typography fontSize="1.3rem">{MEDALS[index]}</Typography>
                            ) : (
                              <Typography fontWeight={700} color="text.secondary">{index + 1}</Typography>
                            )}
                          </TableCell>
                          <TableCell sx={{ fontWeight: index < 3 ? 700 : 500, color: index < 3 ? 'text.primary' : 'text.secondary', whiteSpace: 'nowrap', py: 1.5 }}>
                            {item.name} 쌤
                          </TableCell>
                          <TableCell align="right" sx={{ whiteSpace: 'nowrap', py: 1.5 }}>
                            <Box component="span" fontWeight={900} color="primary.main" fontSize="1rem">
                              {hallTab === 'total' ? item.totalCount : item.monthCount}
                            </Box>
                            <Box component="span" fontSize="0.78rem" color="text.disabled" ml={0.5}>회</Box>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Card>
          </Grid>
        </Grid>
      )}
    </Layout>
  )
}
