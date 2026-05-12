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
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import FormControlLabel from '@mui/material/FormControlLabel'
import TextField from '@mui/material/TextField'
import DownloadIcon from '@mui/icons-material/Download'

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

function parseDate(dateStr) {
  if (!dateStr) return null
  const d = new Date(String(dateStr).trim())
  return isNaN(d.getTime()) ? null : d
}

export default function CoverStatus() {
  const { user, schoolId, role } = useAuth()
  const isAdmin = ['school_admin', 'admin', 'super_admin'].includes(role)

  const [allHistory, setAllHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [selectedMonth, setSelectedMonth] = useState('')
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [currentPage, setCurrentPage] = useState(1)
  const [hallTab, setHallTab] = useState('month')

  // Excel 다운로드 다이얼로그
  const [dlOpen, setDlOpen] = useState(false)
  const [dlMode, setDlMode] = useState('current') // 'current' | 'all' | 'range'
  const [dlStart, setDlStart] = useState('')
  const [dlEnd, setDlEnd] = useState('')
  const [dlLoading, setDlLoading] = useState(false)

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

  // 다운로드 대상 데이터 계산
  const dlPreviewData = useMemo(() => {
    if (dlMode === 'current') return filteredData
    if (dlMode === 'all') return allHistory
    if (!dlStart || !dlEnd) return []
    const start = new Date(dlStart)
    const end = new Date(dlEnd)
    end.setHours(23, 59, 59, 999)
    if (start > end) return []
    return allHistory.filter(r => {
      const d = parseDate(r.date)
      if (!d) return false
      return d >= start && d <= end
    })
  }, [dlMode, dlStart, dlEnd, filteredData, allHistory])

  // Excel 다운로드 실행
  const handleExcelDownload = async () => {
    const data = [...dlPreviewData].sort((a, b) => {
      const da = new Date(a.date || 0)
      const db_ = new Date(b.date || 0)
      return da - db_
    })

    if (data.length === 0) {
      alert('다운로드할 데이터가 없습니다.')
      return
    }

    setDlLoading(true)
    try {
      const { default: ExcelJS } = await import('exceljs')
      const workbook = new ExcelJS.Workbook()
      workbook.creator = '선유고 스마트 교무실'
      workbook.created = new Date()

      const sheet = workbook.addWorksheet('보강현황')

      sheet.columns = [
        { header: '날짜',     key: 'date',          width: 14 },
        { header: '반',       key: 'className',      width: 10 },
        { header: '교시',     key: 'period',         width: 8  },
        { header: '결강교사', key: 'absentTeacher',  width: 14 },
        { header: '교과',     key: 'subject',        width: 14 },
        { header: '상태',     key: 'status',         width: 10 },
        { header: '보강교사', key: 'coverTeacher',   width: 14 },
        { header: '오픈예약', key: 'openAt',         width: 20 },
        { header: '신청일시', key: 'appliedAt',      width: 22 },
      ]

      // 헤더 스타일
      const headerRow = sheet.getRow(1)
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1565C0' } }
      headerRow.alignment = { horizontal: 'center', vertical: 'middle' }
      headerRow.height = 22
      headerRow.eachCell(cell => {
        cell.border = {
          top:    { style: 'thin', color: { argb: 'FFBBDEFB' } },
          left:   { style: 'thin', color: { argb: 'FFBBDEFB' } },
          bottom: { style: 'thin', color: { argb: 'FFBBDEFB' } },
          right:  { style: 'thin', color: { argb: 'FFBBDEFB' } },
        }
      })

      // 데이터 행 추가
      data.forEach((item, idx) => {
        const appliedAt = item.appliedAt?.toDate?.()
        const row = sheet.addRow({
          date:          item.date || '',
          className:     item.className || '',
          period:        item.period != null ? `${item.period}교시` : '',
          absentTeacher: item.absentTeacher || '',
          subject:       item.subject || '',
          status:        item.status || '',
          coverTeacher:  item.coverTeacher || '',
          openAt:        item.openAt || '',
          appliedAt:     appliedAt ? appliedAt.toLocaleString('ko-KR') : '',
        })

        if (idx % 2 === 1) {
          row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F9FA' } }
        }

        const statusCell = row.getCell('status')
        statusCell.font = {
          color: { argb: item.status === '마감' ? 'FF616161' : 'FF2E7D32' },
          bold: true,
        }

        row.eachCell(cell => {
          cell.border = {
            top:    { style: 'thin', color: { argb: 'FFE0E0E0' } },
            left:   { style: 'thin', color: { argb: 'FFE0E0E0' } },
            bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
            right:  { style: 'thin', color: { argb: 'FFE0E0E0' } },
          }
        })
      })

      // ── 두 번째 시트: 보강 참여 집계 ──────────────────────────────
      const rankSheet = workbook.addWorksheet('참여 집계')

      const countMap = {}
      data.forEach(item => {
        if (!item.coverTeacher || !item.coverTeacherEmail) return
        const key = item.coverTeacherEmail
        if (!countMap[key]) countMap[key] = { name: item.coverTeacher, email: item.coverTeacherEmail, count: 0 }
        countMap[key].count++
      })
      const rankData = Object.values(countMap).sort((a, b) => b.count - a.count)

      rankSheet.columns = [
        { header: '순위',     key: 'rank',  width: 10 },
        { header: '교사명',   key: 'name',  width: 16 },
        { header: '이메일',   key: 'email', width: 30 },
        { header: '보강 횟수', key: 'count', width: 12 },
      ]

      const rankHeader = rankSheet.getRow(1)
      rankHeader.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
      rankHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E7D32' } }
      rankHeader.alignment = { horizontal: 'center', vertical: 'middle' }
      rankHeader.height = 22
      rankHeader.eachCell(cell => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFA5D6A7' } },
          left: { style: 'thin', color: { argb: 'FFA5D6A7' } },
          bottom: { style: 'thin', color: { argb: 'FFA5D6A7' } },
          right: { style: 'thin', color: { argb: 'FFA5D6A7' } },
        }
      })

      const RANK_MEDALS = ['🥇', '🥈', '🥉']
      rankData.forEach((item, idx) => {
        const row = rankSheet.addRow({
          rank:  idx < 3 ? `${RANK_MEDALS[idx]} ${idx + 1}위` : `${idx + 1}위`,
          name:  item.name,
          email: item.email,
          count: item.count,
        })

        if (idx % 2 === 1) {
          row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F8E9' } }
        }
        if (idx < 3) row.font = { bold: true }

        const countCell = row.getCell('count')
        countCell.font = { bold: true, color: { argb: 'FF1565C0' } }
        countCell.alignment = { horizontal: 'center' }

        row.eachCell(cell => {
          cell.border = {
            top:    { style: 'thin', color: { argb: 'FFE0E0E0' } },
            left:   { style: 'thin', color: { argb: 'FFE0E0E0' } },
            bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
            right:  { style: 'thin', color: { argb: 'FFE0E0E0' } },
          }
        })
      })

      // 파일명
      let fileName = '보강현황'
      if (dlMode === 'current') {
        fileName += selectedMonth === 'all' || !selectedMonth ? '_전체' : `_${selectedMonth}`
      } else if (dlMode === 'all') {
        fileName += '_전체'
      } else {
        fileName += `_${dlStart}~${dlEnd}`
      }
      fileName += '.xlsx'

      const buffer = await workbook.xlsx.writeBuffer()
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      setDlOpen(false)
    } catch (err) {
      alert('Excel 생성 중 오류가 발생했습니다: ' + err.message)
    } finally {
      setDlLoading(false)
    }
  }

  const handleOpenDlDialog = () => {
    setDlMode('current')
    setDlStart('')
    setDlEnd('')
    setDlOpen(true)
  }

  return (
    <Layout>
      {/* 헤더 */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5">보강 종합 현황판</Typography>
        {isAdmin && (
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={handleOpenDlDialog}
            sx={{ whiteSpace: 'nowrap' }}
          >
            Excel 다운로드
          </Button>
        )}
      </Box>

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

      {/* ─── Excel 다운로드 다이얼로그 ─── */}
      <Dialog open={dlOpen} onClose={() => !dlLoading && setDlOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>Excel 다운로드</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
          <Typography variant="body2" color="text.secondary">
            다운로드할 기간을 선택하세요.
            <br />
            <Box component="span" sx={{ fontSize: '0.72rem', color: 'text.disabled' }}>
              시트 1: 보강 현황 목록 · 시트 2: 교사별 참여 횟수 집계
            </Box>
          </Typography>

          <RadioGroup value={dlMode} onChange={e => setDlMode(e.target.value)}>
            <FormControlLabel
              value="current"
              control={<Radio size="small" />}
              label={
                <Typography variant="body2">
                  현재 화면 기준
                  <Box component="span" sx={{ ml: 0.5, fontSize: '0.75rem', color: 'text.secondary' }}>
                    ({selectedMonth === 'all' || !selectedMonth ? '전체' : selectedMonth})
                  </Box>
                </Typography>
              }
            />
            <FormControlLabel
              value="all"
              control={<Radio size="small" />}
              label={<Typography variant="body2">전체 기간</Typography>}
            />
            <FormControlLabel
              value="range"
              control={<Radio size="small" />}
              label={<Typography variant="body2">기간 직접 입력</Typography>}
            />
          </RadioGroup>

          {dlMode === 'range' && (
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', pl: 3.5 }}>
              <TextField
                label="시작일" size="small" type="date" sx={{ flex: 1 }}
                value={dlStart}
                onChange={e => setDlStart(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
              <Typography color="text.secondary" sx={{ flexShrink: 0 }}>~</Typography>
              <TextField
                label="종료일" size="small" type="date" sx={{ flex: 1 }}
                value={dlEnd}
                onChange={e => setDlEnd(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            </Box>
          )}

          <Box
            sx={{
              bgcolor: '#E3F2FD', borderRadius: 1, px: 2, py: 1.5,
              display: 'flex', alignItems: 'center', gap: 1,
            }}
          >
            <Typography variant="body2" color="primary.dark">
              총{' '}
              <Box component="span" fontWeight={700} fontSize="1rem">
                {dlPreviewData.length}
              </Box>
              건 다운로드 예정
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button onClick={() => setDlOpen(false)} color="inherit" disabled={dlLoading}>
            취소
          </Button>
          <Button
            variant="contained"
            startIcon={dlLoading ? <CircularProgress size={16} color="inherit" /> : <DownloadIcon />}
            onClick={handleExcelDownload}
            disabled={dlLoading || dlPreviewData.length === 0}
          >
            {dlLoading ? '생성 중...' : '다운로드'}
          </Button>
        </DialogActions>
      </Dialog>
    </Layout>
  )
}
