import { useState, useEffect } from 'react'
import Layout from '../../components/Layout'
import { useAuth } from '../../contexts/AuthContext'

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

// Apps Script API 주소 (기존 status.js 그대로)
const API_URL =
  'https://script.google.com/macros/s/AKfycbxlsUlIWiKDopF1w9ke4Bt97szdAHcF83L26C9lCdqxu6ck4topHDs3FRy7ZWeWDf-9/exec'

// 메달 이모지 (1~3위)
const MEDALS = ['🥇', '🥈', '🥉']

// 행/페이지 옵션
const ROWS_OPTIONS = [
  { value: 10, label: '10개씩 보기' },
  { value: 50, label: '50개씩 보기' },
  { value: 100, label: '100개씩 보기' },
  { value: 'all', label: '전체 보기' },
]

export default function CoverStatus() {
  const { user } = useAuth()

  // 전체 데이터
  const [allHistory, setAllHistory] = useState([])
  const [stats, setStats] = useState([])

  // 로딩/에러
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // 필터 상태
  const [selectedMonth, setSelectedMonth] = useState('') // '' = 아직 미확정 (초기 설정용)
  const [monthOptions, setMonthOptions] = useState([])
  const [rowsPerPage, setRowsPerPage] = useState(10)

  // 페이지네이션
  const [currentPage, setCurrentPage] = useState(1)

  // 두 API를 Promise.all로 동시 호출
  useEffect(() => {
    const fetchAllData = async () => {
      setLoading(true)
      setError('')
      try {
        const [historyRes, statsRes] = await Promise.all([
          fetch(API_URL),                            // 전체 목록
          fetch(`${API_URL}?action=getStats`),        // 통계 데이터
        ])
        const historyData = await historyRes.json()
        const statsData = await statsRes.json()

        // 날짜 파싱 + monthKey 추가
        const parsed = historyData
          .map(item => {
            const match = String(item.date).match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/)
            if (!match) return null
            const parsedDate = new Date(
              parseInt(match[1]),
              parseInt(match[2]) - 1,
              parseInt(match[3])
            )
            const monthKey = `${match[1]}년 ${match[2]}월`
            return { ...item, parsedDate, monthKey }
          })
          .filter(Boolean)

        // 날짜 내림차순 정렬
        parsed.sort((a, b) => b.parsedDate - a.parsedDate)

        setAllHistory(parsed)
        setStats(statsData)

        // 월 필터 옵션 구성
        const uniqueMonths = [...new Set(parsed.map(item => item.monthKey))]
        setMonthOptions(uniqueMonths)

        // 이번 달을 기본 선택
        const now = new Date()
        const currentMonthKey = `${now.getFullYear()}년 ${now.getMonth() + 1}월`
        setSelectedMonth(
          uniqueMonths.includes(currentMonthKey) ? currentMonthKey : 'all'
        )
      } catch (err) {
        console.error('데이터 로딩 실패:', err)
        setError('데이터를 불러오지 못했습니다. 새로고침 해주세요.')
      } finally {
        setLoading(false)
      }
    }

    if (user) fetchAllData()
  }, [user])

  // 필터 + 페이지네이션 계산
  const filteredData =
    selectedMonth === 'all' || selectedMonth === ''
      ? allHistory
      : allHistory.filter(item => item.monthKey === selectedMonth)

  const effectiveRows =
    rowsPerPage === 'all' ? filteredData.length || 1 : rowsPerPage

  const totalPages = Math.ceil(filteredData.length / effectiveRows) || 1

  const paginatedData = filteredData.slice(
    (currentPage - 1) * effectiveRows,
    currentPage * effectiveRows
  )

  // 필터 변경 시 1페이지로 초기화
  const handleMonthChange = (e) => {
    setSelectedMonth(e.target.value)
    setCurrentPage(1)
  }
  const handleRowsChange = (e) => {
    setRowsPerPage(e.target.value)
    setCurrentPage(1)
  }

  return (
    <Layout>
      <Typography variant="h5" sx={{ mb: 3 }}>
        보강 종합 현황판
      </Typography>

      {/* 로딩 */}
      {loading && (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 10, gap: 2 }}>
          <CircularProgress />
          <Typography color="primary" fontWeight={600}>
            데이터를 불러오는 중입니다...
          </Typography>
        </Box>
      )}

      {/* 에러 */}
      {!loading && error && (
        <Alert severity="error" sx={{ my: 2 }}>{error}</Alert>
      )}

      {/* 대시보드 콘텐츠 */}
      {!loading && !error && (
        <Grid container spacing={3} alignItems="flex-start">
          {/* ─── 왼쪽: 보강 운영 현황 (2/3 너비) ─── */}
          <Grid item xs={12} lg={8}>
            <Card sx={{ display: 'flex', flexDirection: 'column' }}>
              {/* 헤더 + 필터 */}
              <Box
                sx={{
                  px: 3,
                  py: 2,
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  bgcolor: 'grey.50',
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
                  {/* 월 필터 */}
                  <FormControl size="small" sx={{ minWidth: 130 }}>
                    <InputLabel>월 선택</InputLabel>
                    <Select
                      value={selectedMonth}
                      label="월 선택"
                      onChange={handleMonthChange}
                    >
                      <MenuItem value="all">전체 월 보기</MenuItem>
                      {monthOptions.map(m => (
                        <MenuItem key={m} value={m}>{m}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  {/* 행 수 필터 */}
                  <FormControl size="small" sx={{ minWidth: 130 }}>
                    <InputLabel>표시 개수</InputLabel>
                    <Select
                      value={rowsPerPage}
                      label="표시 개수"
                      onChange={handleRowsChange}
                    >
                      {ROWS_OPTIONS.map(opt => (
                        <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                      ))}
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
                        <TableCell
                          key={h}
                          align={h === '상태' ? 'center' : 'left'}
                          sx={{ fontWeight: 700, fontSize: '0.78rem', color: 'text.secondary', textTransform: 'uppercase' }}
                        >
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
                      paginatedData.map((item, idx) => (
                        <TableRow
                          key={item.id ?? idx}
                          hover
                          sx={{ '&:last-child td': { borderBottom: 0 } }}
                        >
                          <TableCell sx={{ fontWeight: 500 }}>{item.date}</TableCell>
                          <TableCell>
                            <Box component="span" fontWeight={700}>{item.className}</Box>{' '}
                            <Box component="span" fontSize="0.78rem" color="text.secondary">{item.period}교시</Box>
                          </TableCell>
                          <TableCell>
                            {item.absentTeacher}{' '}
                            <Box component="span" fontSize="0.78rem" color="text.disabled">
                              ({item.subject})
                            </Box>
                          </TableCell>
                          <TableCell align="center">
                            {item.status === '마감' ? (
                              <Chip
                                label="마감"
                                size="small"
                                sx={{ bgcolor: 'grey.100', color: 'text.secondary', fontWeight: 700 }}
                              />
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
              <Box
                sx={{
                  px: 3,
                  py: 1.5,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Button
                  variant="outlined"
                  size="small"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(p => p - 1)}
                >
                  이전
                </Button>
                <Typography variant="body2" fontWeight={700} color="text.secondary">
                  {currentPage} / {totalPages} 페이지 (총 {filteredData.length}건)
                </Typography>
                <Button
                  variant="outlined"
                  size="small"
                  disabled={currentPage === totalPages || totalPages === 0}
                  onClick={() => setCurrentPage(p => p + 1)}
                >
                  다음
                </Button>
              </Box>
            </Card>
          </Grid>

          {/* ─── 오른쪽: 명예의 전당 (1/3 너비) ─── */}
          <Grid item xs={12} lg={4}>
            <Card sx={{ display: 'flex', flexDirection: 'column' }}>
              {/* 명예의 전당 헤더 */}
              <Box
                sx={{
                  px: 3,
                  py: 2.5,
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  background: 'linear-gradient(135deg, #fffde7 0%, #fff3e0 100%)',
                }}
              >
                <Typography variant="subtitle1">🏆 명예의 전당</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                  가장 많이 지원해주신 분들
                </Typography>
              </Box>

              {/* 명예의 전당 목록 */}
              <TableContainer
                component={Paper}
                elevation={0}
                sx={{ maxHeight: 560, overflowY: 'auto' }}
              >
                <Table>
                  <TableBody>
                    {stats.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                          아직 보강 지원 내역이 없습니다.
                        </TableCell>
                      </TableRow>
                    ) : (
                      stats.map((item, index) => (
                        <TableRow
                          key={item.name}
                          sx={{
                            bgcolor: index < 3 ? 'background.paper' : undefined,
                            '&:hover': { bgcolor: 'grey.50' },
                            '&:last-child td': { borderBottom: 0 },
                          }}
                        >
                          {/* 순위 */}
                          <TableCell align="center" sx={{ width: 48, py: 1.5, px: 1.5 }}>
                            {index < 3 ? (
                              <Typography fontSize="1.3rem">{MEDALS[index]}</Typography>
                            ) : (
                              <Typography fontWeight={700} color="text.secondary">
                                {index + 1}
                              </Typography>
                            )}
                          </TableCell>
                          {/* 이름 */}
                          <TableCell
                            sx={{
                              fontWeight: index < 3 ? 700 : 500,
                              color: index < 3 ? 'text.primary' : 'text.secondary',
                              whiteSpace: 'nowrap',
                              py: 1.5,
                            }}
                          >
                            {item.name} 쌤
                          </TableCell>
                          {/* 횟수 */}
                          <TableCell align="right" sx={{ whiteSpace: 'nowrap', py: 1.5 }}>
                            <Box component="span" fontWeight={900} color="primary.main" fontSize="1rem">
                              {item.count}
                            </Box>
                            <Box component="span" fontSize="0.78rem" color="text.disabled" ml={0.5}>
                              회
                            </Box>
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
