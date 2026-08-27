/**
 * 보강신청 — 현황판. 포털의 CoverStatus.jsx 포팅(다운로드 다이얼로그의 "기간 직접 입력"
 * 모드는 이번 범위에서 뺐다 — 핵심은 "현재 필터/전체" 두 가지로도 충분하다).
 */
import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Divider from '@mui/material/Divider'
import FormControl from '@mui/material/FormControl'
import Grid from '@mui/material/Grid'
import InputLabel from '@mui/material/InputLabel'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import DownloadIcon from '@mui/icons-material/Download'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, schoolPath } from '@shared/lib/schema'
import { coverStats, monthKeyOf, parseCoverDate } from '@shared/lib/coverRequests'
import { useToast } from './ToastProvider'

const MEDALS = ['🥇', '🥈', '🥉']
const ROWS_OPTIONS = [
  { value: 10, label: '10개씩 보기' },
  { value: 50, label: '50개씩 보기' },
  { value: 100, label: '100개씩 보기' },
  { value: 'all', label: '전체 보기' },
]

export default function CoverageOverview() {
  const { schoolId, isAdmin } = useAuth()
  const toast = useToast()

  const [allHistory, setAllHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState('all')
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [currentPage, setCurrentPage] = useState(1)
  const [hallTab, setHallTab] = useState('month')
  const [dlLoading, setDlLoading] = useState(false)
  const [dlMode, setDlMode] = useState('current')

  useEffect(() => {
    if (!schoolId) return
    const q = query(collection(db, ...schoolPath(schoolId, COL.COVER_REQUESTS)), orderBy('date', 'desc'))
    const unsub = onSnapshot(q, snap => {
      setAllHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    }, e => { toast.error('보강 현황을 불러오지 못했습니다.', e); setLoading(false) })
    return unsub
  }, [schoolId, toast])

  const monthOptions = useMemo(() => {
    const keys = [...new Set(allHistory.map(r => monthKeyOf(r.date)).filter(Boolean))]
    return keys.sort().reverse()
  }, [allHistory])

  useEffect(() => {
    if (monthOptions.length === 0) return
    const now = new Date()
    const curKey = `${now.getFullYear()}년 ${now.getMonth() + 1}월`
    setSelectedMonth(monthOptions.includes(curKey) ? curKey : monthOptions[0])
  }, [monthOptions])

  const hallStats = useMemo(() => {
    const stats = coverStats(allHistory, selectedMonth)
    return [...stats].sort((a, b) => (hallTab === 'total' ? b.totalCount - a.totalCount : b.monthCount - a.monthCount))
  }, [allHistory, selectedMonth, hallTab])

  const filteredData = selectedMonth === 'all' || !selectedMonth
    ? allHistory
    : allHistory.filter(r => monthKeyOf(r.date) === selectedMonth)

  const effectiveRows = rowsPerPage === 'all' ? Math.max(filteredData.length, 1) : rowsPerPage
  const totalPages = Math.max(Math.ceil(filteredData.length / effectiveRows), 1)
  const paginatedData = filteredData.slice((currentPage - 1) * effectiveRows, currentPage * effectiveRows)

  const handleMonthChange = e => { setSelectedMonth(e.target.value); setCurrentPage(1) }
  const handleRowsChange = e => { setRowsPerPage(e.target.value); setCurrentPage(1) }

  const downloadData = dlMode === 'all' ? allHistory : filteredData

  const handleExcelDownload = async () => {
    const data = [...downloadData].sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0))
    if (data.length === 0) { toast.error('다운로드할 데이터가 없습니다.'); return }

    setDlLoading(true)
    try {
      const { default: ExcelJS } = await import('exceljs')
      const workbook = new ExcelJS.Workbook()
      workbook.creator = '선유고 스마트 교무실'
      workbook.created = new Date()

      const sheet = workbook.addWorksheet('보강현황')
      sheet.columns = [
        { header: '날짜', key: 'date', width: 14 },
        { header: '반', key: 'className', width: 10 },
        { header: '교시', key: 'period', width: 8 },
        { header: '결강교사', key: 'absentTeacher', width: 14 },
        { header: '교과', key: 'subject', width: 14 },
        { header: '상태', key: 'status', width: 10 },
        { header: '보강교사', key: 'coverTeacher', width: 14 },
        { header: '오픈예약', key: 'openAt', width: 20 },
        { header: '신청일시', key: 'appliedAt', width: 22 },
      ]
      sheet.getRow(1).font = { bold: true }
      data.forEach(item => {
        const appliedAt = item.appliedAt?.toDate?.()
        sheet.addRow({
          date: item.date || '', className: item.className || '',
          period: item.period != null ? `${item.period}교시` : '',
          absentTeacher: item.absentTeacher || '', subject: item.subject || '',
          status: item.status || '', coverTeacher: item.coverTeacher || '',
          openAt: item.openAt || '', appliedAt: appliedAt ? appliedAt.toLocaleString('ko-KR') : '',
        })
      })

      const rankSheet = workbook.addWorksheet('참여 집계')
      const rankData = coverStats(data, null).sort((a, b) => b.totalCount - a.totalCount)
      rankSheet.columns = [
        { header: '순위', key: 'rank', width: 10 },
        { header: '교사명', key: 'name', width: 16 },
        { header: '이메일', key: 'email', width: 30 },
        { header: '보강 횟수', key: 'count', width: 12 },
      ]
      rankSheet.getRow(1).font = { bold: true }
      rankData.forEach((item, idx) => {
        rankSheet.addRow({
          rank: idx < 3 ? `${MEDALS[idx]} ${idx + 1}위` : `${idx + 1}위`,
          name: item.name, email: item.email, count: item.totalCount,
        })
      })

      const fileName = `보강현황_${dlMode === 'all' ? '전체' : (selectedMonth === 'all' ? '전체' : selectedMonth)}.xlsx`
      const buffer = await workbook.xlsx.writeBuffer()
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = fileName
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) {
      toast.error('Excel 생성 중 오류가 발생했습니다.', e)
    } finally {
      setDlLoading(false)
    }
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 10, gap: 2 }}>
        <CircularProgress size={28} />
        <Typography color="text.secondary" fontSize="0.9rem">보강 현황을 불러오는 중입니다...</Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ p: 2.5 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5 }}>
        <Typography variant="h6" fontWeight={800}>보강 종합 현황판</Typography>
        {isAdmin && (
          <Box sx={{ display: 'flex', gap: 1 }}>
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <Select value={dlMode} onChange={e => setDlMode(e.target.value)}>
                <MenuItem value="current">현재 필터만</MenuItem>
                <MenuItem value="all">전체 기간</MenuItem>
              </Select>
            </FormControl>
            <Button
              variant="outlined"
              startIcon={dlLoading ? <CircularProgress size={16} color="inherit" /> : <DownloadIcon />}
              onClick={handleExcelDownload}
              disabled={dlLoading}
            >
              Excel 다운로드
            </Button>
          </Box>
        )}
      </Box>

      <Grid container spacing={2.5} alignItems="flex-start">
        <Grid item xs={12} lg={8}>
          <Card variant="outlined">
            <Box sx={{
              px: 2.5, py: 1.5, borderBottom: '1px solid', borderColor: 'divider',
              display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 1.5,
            }}>
              <Typography variant="subtitle2" fontWeight={700}>보강 운영 현황</Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
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

            <TableContainer sx={{ overflowX: 'auto' }}>
              <Table size="small" sx={{ whiteSpace: 'nowrap' }}>
                <TableHead>
                  <TableRow>
                    {['날짜', '대상(교시)', '결강교사(과목)', '상태', '신청교사'].map(h => (
                      <TableCell key={h} align={h === '상태' ? 'center' : 'left'} sx={{ fontWeight: 700, color: 'text.secondary' }}>
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
                      <TableRow key={item.id} hover>
                        <TableCell>{item.date}</TableCell>
                        <TableCell>
                          <Box component="span" fontWeight={700}>{item.className}</Box>{' '}
                          <Box component="span" fontSize="0.78rem" color="text.secondary">{item.period}교시</Box>
                        </TableCell>
                        <TableCell>
                          {item.absentTeacher}{' '}
                          <Box component="span" fontSize="0.78rem" color="text.disabled">({item.subject})</Box>
                        </TableCell>
                        <TableCell align="center">
                          {item.status === '마감'
                            ? <Chip label="마감" size="small" />
                            : <Chip label="대기중" size="small" color="success" />}
                        </TableCell>
                        <TableCell>
                          {item.coverTeacher
                            ? <Box component="span" fontWeight={700} color="primary.main">{item.coverTeacher} 선생님</Box>
                            : <Box component="span" color="text.disabled">미정</Box>}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            <Divider />
            <Box sx={{ px: 2.5, py: 1.2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Button variant="outlined" size="small" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>이전</Button>
              <Typography variant="body2" fontWeight={700} color="text.secondary">
                {currentPage} / {totalPages} 페이지 (총 {filteredData.length}건)
              </Typography>
              <Button variant="outlined" size="small" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)}>다음</Button>
            </Box>
          </Card>
        </Grid>

        <Grid item xs={12} lg={4}>
          <Card variant="outlined">
            <Box sx={{
              px: 2.5, py: 1.5, borderBottom: '1px solid', borderColor: 'divider',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap',
            }}>
              <Typography variant="subtitle2" fontWeight={700}>🏆 명예의 전당</Typography>
              <Box sx={{ display: 'flex', borderRadius: 1, overflow: 'hidden', border: '1px solid', borderColor: 'divider' }}>
                {[{ key: 'month', label: '월별' }, { key: 'total', label: '전체' }].map(tab => (
                  <Box key={tab.key} onClick={() => setHallTab(tab.key)} sx={{
                    px: 1.3, py: 0.4, fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer',
                    bgcolor: hallTab === tab.key ? 'primary.main' : 'transparent',
                    color: hallTab === tab.key ? 'primary.contrastText' : 'text.secondary',
                  }}>
                    {tab.label}
                  </Box>
                ))}
              </Box>
            </Box>
            <TableContainer sx={{ maxHeight: 480, overflowY: 'auto' }}>
              <Table size="small">
                <TableBody>
                  {hallStats.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                        아직 보강 지원 내역이 없습니다.
                      </TableCell>
                    </TableRow>
                  ) : hallStats.map((item, index) => (
                    <TableRow key={item.email}>
                      <TableCell align="center" sx={{ width: 40 }}>
                        {index < 3 ? <Typography fontSize="1.2rem">{MEDALS[index]}</Typography>
                          : <Typography fontWeight={700} color="text.secondary">{index + 1}</Typography>}
                      </TableCell>
                      <TableCell sx={{ fontWeight: index < 3 ? 700 : 500 }}>{item.name} 쌤</TableCell>
                      <TableCell align="right">
                        <Box component="span" fontWeight={900} color="primary.main">
                          {hallTab === 'total' ? item.totalCount : item.monthCount}
                        </Box>
                        <Box component="span" fontSize="0.78rem" color="text.disabled" ml={0.5}>회</Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
}
