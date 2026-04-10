import { useState, useEffect } from 'react'
import Layout from '../../components/Layout'
import { useAuth } from '../../contexts/AuthContext'

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

// Apps Script API 주소 (기존 mypage.js 그대로)
const API_URL =
  'https://script.google.com/macros/s/AKfycbxlsUlIWiKDopF1w9ke4Bt97szdAHcF83L26C9lCdqxu6ck4topHDs3FRy7ZWeWDf-9/exec'

// 날짜 문자열을 Date 객체로 느슨하게 파싱 (기존 parseDateLoose 그대로)
function parseDateLoose(dateStr) {
  const match = String(dateStr).match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/)
  if (match) {
    return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]))
  }
  return new Date(dateStr)
}

export default function CoverMypage() {
  const { user } = useAuth()

  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // 내 보강 기록 불러오기
  useEffect(() => {
    if (!user) return

    const fetchMyData = async () => {
      setLoading(true)
      setError('')
      try {
        const res = await fetch(API_URL)
        const allData = await res.json()

        // 내 이메일과 일치하는 항목만 필터링
        const myRecords = allData.filter(
          item => item.coverTeacherEmail === user.email
        )

        // 날짜 최신순(내림차순) 정렬
        myRecords.sort((a, b) => {
          const dateA = parseDateLoose(String(a.date))
          const dateB = parseDateLoose(String(b.date))
          return dateB - dateA
        })

        setRecords(myRecords)
      } catch (err) {
        console.error('데이터 로딩 실패:', err)
        setError('데이터를 불러오지 못했습니다. 새로고침 해주세요.')
      } finally {
        setLoading(false)
      }
    }

    fetchMyData()
  }, [user])

  // 이름에서 "선생님" 제거
  const myName = user?.displayName?.replace(' 선생님', '').trim() ?? ''

  // 오늘 날짜 (완료/예정 뱃지 기준)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return (
    <Layout>
      {/* 로딩 */}
      {loading && (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 10, gap: 2 }}>
          <CircularProgress color="success" />
          <Typography color="text.secondary" fontWeight={600}>
            내 기록을 불러오는 중입니다...
          </Typography>
        </Box>
      )}

      {/* 에러 */}
      {!loading && error && (
        <Alert severity="error" sx={{ my: 2 }}>{error}</Alert>
      )}

      {/* 컨텐츠 */}
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
              {/* 총 지원 횟수 뱃지 */}
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
                <Typography variant="body2" fontWeight={700} color="success.dark">
                  총 지원 횟수
                </Typography>
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
            <Box
              sx={{
                px: 3,
                py: 2,
                borderBottom: '1px solid',
                borderColor: 'divider',
                bgcolor: 'grey.50',
              }}
            >
              <Typography variant="subtitle1">상세 내역</Typography>
            </Box>
            <TableContainer component={Paper} elevation={0}>
              <Table sx={{ whiteSpace: 'nowrap' }}>
                <TableHead>
                  <TableRow sx={{ bgcolor: 'grey.100' }}>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', color: 'text.secondary', textTransform: 'uppercase' }}>
                      날짜
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', color: 'text.secondary', textTransform: 'uppercase' }}>
                      대상(교시)
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', color: 'text.secondary', textTransform: 'uppercase' }}>
                      결강교사(과목)
                    </TableCell>
                    <TableCell
                      align="center"
                      sx={{ fontWeight: 700, fontSize: '0.78rem', color: 'text.secondary', textTransform: 'uppercase' }}
                    >
                      진행 상태
                    </TableCell>
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
                    records.map((item, idx) => {
                      const itemDate = parseDateLoose(String(item.date))
                      const isDone = itemDate < today

                      return (
                        <TableRow
                          key={item.id ?? idx}
                          hover
                          sx={{ '&:last-child td': { borderBottom: 0 } }}
                        >
                          {/* 날짜 */}
                          <TableCell sx={{ fontWeight: 500, color: 'text.primary' }}>
                            {item.date}
                          </TableCell>
                          {/* 대상(교시) */}
                          <TableCell>
                            <Box component="span" fontWeight={900} color="text.primary">
                              {item.className}
                            </Box>{' '}
                            <Box component="span" fontSize="0.78rem" color="text.secondary">
                              {item.period}교시
                            </Box>
                          </TableCell>
                          {/* 결강교사(과목) */}
                          <TableCell sx={{ color: 'text.secondary' }}>
                            {item.absentTeacher}{' '}
                            <Box component="span" fontSize="0.78rem" color="text.disabled">
                              ({item.subject})
                            </Box>
                          </TableCell>
                          {/* 진행 상태 배지 */}
                          <TableCell align="center">
                            {isDone ? (
                              <Chip
                                label="완료됨"
                                size="small"
                                variant="outlined"
                                sx={{ color: 'text.secondary', borderColor: 'divider' }}
                              />
                            ) : (
                              <Chip
                                label="예정됨"
                                size="small"
                                color="success"
                                variant="outlined"
                                sx={{
                                  animation: 'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite',
                                  '@keyframes pulse': {
                                    '0%, 100%': { opacity: 1 },
                                    '50%': { opacity: 0.55 },
                                  },
                                }}
                              />
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
