import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../../components/Layout'
import { useAuth } from '../../contexts/AuthContext'

import Box from '@mui/material/Box'
import Grid from '@mui/material/Grid'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardActions from '@mui/material/CardActions'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import Alert from '@mui/material/Alert'
import Divider from '@mui/material/Divider'

// Apps Script API 주소 (기존 cover.js 그대로)
const API_URL =
  'https://script.google.com/macros/s/AKfycbxlsUlIWiKDopF1w9ke4Bt97szdAHcF83L26C9lCdqxu6ck4topHDs3FRy7ZWeWDf-9/exec'

// openAt 문자열을 Date 객체로 파싱 (시트에 "YYYY-MM-DD HH:MM" 텍스트로 저장)
function getOpenAtDate(openAtStr) {
  if (!openAtStr) return null
  const d = new Date(String(openAtStr).replace(' ', 'T'))
  return isNaN(d.getTime()) ? null : d
}

// 남은 시간을 카운트다운 문자열로 변환
function formatCountdown(diffMs) {
  const totalSec = Math.max(0, Math.floor(diffMs / 1000))
  const days  = Math.floor(totalSec / 86400)
  const hours = Math.floor((totalSec % 86400) / 3600)
  const mins  = Math.floor((totalSec % 3600) / 60)
  const secs  = totalSec % 60
  const pad = n => String(n).padStart(2, '0')
  if (days > 0) return `D-${days}  ${pad(hours)}:${pad(mins)}:${pad(secs)}`
  return `${pad(hours)}:${pad(mins)}:${pad(secs)}`
}

// 날짜 문자열에서 요일 반환 (예: "(화)")
function getDayOfWeek(dateString) {
  const d = new Date(dateString)
  if (isNaN(d.getTime())) return ''
  const days = ['일', '월', '화', '수', '목', '금', '토']
  return `(${days[d.getDay()]})`
}

// 오늘~14일 이내의 유효한 항목만 필터링, 내 신청 우선 정렬
function processData(data, currentUser) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const filtered = data.filter(item => {
    if (!item.id || !item.date) return false
    const coverDate = new Date(item.date)
    if (isNaN(coverDate.getTime())) return true // 날짜 파싱 실패 시 포함 유지
    coverDate.setHours(0, 0, 0, 0)
    const diffDays = Math.round((coverDate - today) / (1000 * 60 * 60 * 24))
    return diffDays >= 0 && diffDays <= 14
  })

  filtered.sort((a, b) => {
    const isAMine = currentUser && a.coverTeacherEmail === currentUser.email
    const isBMine = currentUser && b.coverTeacherEmail === currentUser.email
    if (isAMine && !isBMine) return -1
    if (!isAMine && isBMine) return 1
    if (a.status === '마감' && b.status !== '마감') return 1
    if (a.status !== '마감' && b.status === '마감') return -1
    return 0
  })

  return filtered
}

export default function CoverMain() {
  const { user } = useAuth()
  const navigate = useNavigate()

  // 목록/로딩/에러 상태
  const [covers, setCovers] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMsg, setLoadingMsg] = useState('보강 목록을 불러오는 중입니다...')
  const [error, setError] = useState('')

  // 관리자 여부
  const [isAdmin, setIsAdmin] = useState(false)

  // 새 보강 등록 모달 상태
  const [modalOpen, setModalOpen] = useState(false)
  const [formData, setFormData] = useState({
    date: '',
    period: '',
    className: '',
    subject: '',
    absentTeacher: '',
    openAt: '',
  })
  const [submitting, setSubmitting] = useState(false)

  // 공개예정 카운트다운용 — 1초마다 갱신
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // 보강 목록 불러오기
  const fetchCoverData = useCallback(async (msg = '보강 목록을 불러오는 중입니다...') => {
    setLoadingMsg(msg)
    setLoading(true)
    setError('')
    try {
      const res = await fetch(API_URL)
      const data = await res.json()
      setCovers(processData(data, user))
    } catch (err) {
      console.error('로딩 실패:', err)
      setError('데이터 로딩에 실패했습니다. 네트워크를 확인해주세요.')
    } finally {
      setLoading(false)
    }
  }, [user])

  // 관리자 권한 확인
  const checkAdminRole = useCallback(async () => {
    if (!user) return
    try {
      const myName = user.displayName?.replace(' 선생님', '').trim() ?? ''
      const res = await fetch(
        `${API_URL}?action=getRole&email=${encodeURIComponent(user.email)}&name=${encodeURIComponent(myName)}`
      )
      const result = await res.json()
      if (result.role === '관리자') setIsAdmin(true)
    } catch (e) {
      console.error('권한 확인 실패:', e)
    }
  }, [user])

  useEffect(() => {
    if (user) {
      checkAdminRole()
      fetchCoverData()
    }
  }, [user, checkAdminRole, fetchCoverData])

  // 보강 신청
  const handleApply = async (coverId) => {
    if (!user) return
    if (!window.confirm('이 보강을 신청하시겠습니까?')) return
    const myName = user.displayName?.replace(' 선생님', '').trim() ?? ''
    setLoadingMsg('보강 신청 처리 중입니다...')
    setLoading(true)
    try {
      const res = await fetch(
        `${API_URL}?action=apply&id=${coverId}&name=${encodeURIComponent(myName)}&email=${encodeURIComponent(user.email)}`
      )
      const result = await res.json()
      if (result.success) {
        alert('보강 신청이 완료되었습니다!')
      } else if (result.reason === 'not_open_yet') {
        alert('아직 신청 가능 시간이 아닙니다.\n공개 예약 시간 이후에 다시 시도해주세요.')
      } else {
        alert('오류가 발생했습니다. (이미 마감됨)')
      }
    } catch {
      alert('인터넷 연결이 불안정합니다.')
    } finally {
      fetchCoverData()
    }
  }

  // 보강 신청 취소
  const handleCancel = async (coverId) => {
    if (!user) return
    if (!window.confirm('정말로 이 보강 신청을 취소하시겠습니까?\n(취소 즉시 다른 선생님께 노출됩니다.)')) return
    setLoadingMsg('보강 신청 취소 중입니다...')
    setLoading(true)
    try {
      const res = await fetch(
        `${API_URL}?action=cancel&id=${coverId}&email=${encodeURIComponent(user.email)}`
      )
      const result = await res.json()
      if (result.success) {
        alert('안전하게 취소되었습니다.')
      } else {
        alert('취소 중 오류가 발생했습니다. (권한 없음)')
      }
    } catch {
      alert('인터넷 연결이 불안정합니다.')
    } finally {
      fetchCoverData()
    }
  }

  // 새 보강 등록 제출
  const handleCreateSubmit = async (e) => {
    e.preventDefault()
    setModalOpen(false)
    setSubmitting(true)
    setLoadingMsg('새 보강을 DB에 등록 중입니다...')
    setLoading(true)
    try {
      const { date, period, className, subject, absentTeacher, openAt } = formData
      const res = await fetch(
        `${API_URL}?action=create&date=${date}&period=${period}&className=${encodeURIComponent(className)}&subject=${encodeURIComponent(subject)}&absentTeacher=${encodeURIComponent(absentTeacher)}&openAt=${encodeURIComponent(openAt ? openAt.replace('T', ' ') : '')}`
      )
      const result = await res.json()
      if (result.success) {
        alert('성공적으로 등록되었습니다!')
        setFormData({ date: '', period: '', className: '', subject: '', absentTeacher: '', openAt: '' })
      } else {
        alert('등록 중 오류가 발생했습니다.')
      }
    } catch {
      alert('등록 중 에러가 발생했습니다.')
    } finally {
      setSubmitting(false)
      fetchCoverData()
    }
  }

  // 카드 상태에 따른 색상/뱃지/버튼 결정
  const getCardConfig = (item) => {
    const isClosed = item.status === '마감'
    const isMine = user && item.coverTeacherEmail === user.email

    if (isClosed && isMine) {
      return {
        sx: { border: '1.5px solid', borderColor: 'primary.light', bgcolor: '#f0f6ff', height: '100%' },
        chip: <Chip label="내 신청 보강" size="small" color="primary" variant="outlined" />,
        button: (
          <Button
            fullWidth
            variant="outlined"
            color="error"
            onClick={() => handleCancel(item.id)}
          >
            취소하기
          </Button>
        ),
      }
    }
    if (isClosed) {
      return {
        sx: { opacity: 0.55, filter: 'grayscale(40%)', height: '100%' },
        chip: <Chip label="신청 마감" size="small" sx={{ bgcolor: '#e0e0e0', color: '#757575' }} />,
        button: (
          <Button fullWidth variant="contained" disabled>
            신청 마감
          </Button>
        ),
      }
    }

    // 공개예정: openAt이 설정되어 있고 아직 해당 시각이 되지 않은 경우
    const openAt = getOpenAtDate(item.openAt)
    if (openAt && openAt > now) {
      const diffMs = openAt - now
      const openDateStr = openAt.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      return {
        sx: { border: '1.5px solid', borderColor: 'warning.light', bgcolor: '#fffdf0', height: '100%' },
        chip: <Chip label="공개예정" size="small" color="warning" variant="outlined" />,
        button: (
          <Button fullWidth variant="outlined" color="warning" disabled
            sx={{ fontFamily: 'monospace', fontSize: '1rem', letterSpacing: '0.05em' }}>
            ⏳ {formatCountdown(diffMs)}
          </Button>
        ),
        openDateStr,
      }
    }

    return {
      sx: { height: '100%' },
      chip: <Chip label="신청가능" size="small" color="success" />,
      button: (
        <Button
          fullWidth
          variant="contained"
          color="primary"
          onClick={() => handleApply(item.id)}
        >
          보강 신청
        </Button>
      ),
    }
  }

  return (
    <Layout>
      {/* 헤더 영역 */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', mb: 3 }}>
        <Box>
          <Typography variant="h5">보강 신청 목록</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            신청 가능한 보강과 공개 예정 보강이 함께 표시됩니다.
          </Typography>
        </Box>
        {isAdmin && (
          <Button
            variant="contained"
            onClick={() => setModalOpen(true)}
            sx={{ whiteSpace: 'nowrap' }}
          >
            + 새 보강 등록
          </Button>
        )}
      </Box>

      {/* 로딩 */}
      {loading && (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 10, gap: 2 }}>
          <CircularProgress />
          <Typography color="primary" fontWeight={600}>{loadingMsg}</Typography>
        </Box>
      )}

      {/* 에러 */}
      {!loading && error && (
        <Alert severity="error" sx={{ my: 2 }}>{error}</Alert>
      )}

      {/* 빈 상태 */}
      {!loading && !error && covers.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 12 }}>
          <Typography color="text.secondary" fontSize="1.1rem">
            등록된 보강 내역이 없습니다.
          </Typography>
        </Box>
      )}

      {/* 카드 그리드 */}
      {!loading && !error && covers.length > 0 && (
        <Grid container spacing={3}>
          {covers.map(item => {
            const { sx, chip, button, openDateStr } = getCardConfig(item)
            const displayDate = `${item.date}${getDayOfWeek(item.date)}`
            return (
              <Grid item xs={12} sm={6} md={4} key={item.id}>
                <Card sx={sx}>
                  <CardContent sx={{ flexGrow: 1 }}>
                    {/* 뱃지 + 날짜 */}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                      {chip}
                      <Typography variant="body2" fontWeight={700} color="text.secondary">
                        {displayDate}
                      </Typography>
                    </Box>
                    {/* 반 + 교시 */}
                    <Typography variant="h6" gutterBottom>
                      {item.className}{' '}
                      <Typography component="span" color="primary" fontWeight={700}>
                        {item.period}교시
                      </Typography>
                    </Typography>
                    {/* 교과 + 결강 교사 */}
                    <Typography variant="body2" color="text.secondary">
                      {item.subject} ({item.absentTeacher} 선생님 결강)
                    </Typography>
                    {/* 공개예정 시각 안내 */}
                    {openDateStr && (
                      <Typography variant="caption" color="warning.main" sx={{ mt: 1, display: 'block' }}>
                        {openDateStr} 신청 오픈
                      </Typography>
                    )}
                  </CardContent>
                  <Divider />
                  <CardActions sx={{ px: 2, py: 1.5 }}>
                    {button}
                  </CardActions>
                </Card>
              </Grid>
            )
          })}
        </Grid>
      )}

      {/* 새 보강 등록 모달 */}
      <Dialog open={modalOpen} onClose={() => setModalOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ bgcolor: 'primary.main', color: 'white', fontWeight: 700 }}>
          새 보강 등록
        </DialogTitle>
        <Box component="form" onSubmit={handleCreateSubmit}>
          <DialogContent sx={{ pt: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* 날짜 + 교시 */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <TextField
                label="날짜"
                type="date"
                required
                InputLabelProps={{ shrink: true }}
                value={formData.date}
                onChange={e => setFormData(f => ({ ...f, date: e.target.value }))}
              />
              <TextField
                label="교시 (숫자)"
                type="number"
                required
                inputProps={{ min: 1, max: 9 }}
                value={formData.period}
                onChange={e => setFormData(f => ({ ...f, period: e.target.value }))}
              />
            </Box>
            {/* 반 + 교과 */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <TextField
                label="대상 반 (예: 2-3)"
                required
                value={formData.className}
                onChange={e => setFormData(f => ({ ...f, className: e.target.value }))}
              />
              <TextField
                label="교과"
                required
                value={formData.subject}
                onChange={e => setFormData(f => ({ ...f, subject: e.target.value }))}
              />
            </Box>
            {/* 결강 교사 */}
            <TextField
              label="결강 교사 (이름만)"
              required
              value={formData.absentTeacher}
              onChange={e => setFormData(f => ({ ...f, absentTeacher: e.target.value }))}
            />
            {/* 오픈 예약 시각 */}
            <TextField
              label="오픈 예약 시각 (선택)"
              type="datetime-local"
              InputLabelProps={{ shrink: true }}
              value={formData.openAt}
              onChange={e => setFormData(f => ({ ...f, openAt: e.target.value }))}
              helperText="비워두면 즉시 신청 가능 상태로 공개됩니다"
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setModalOpen(false)} color="inherit">취소</Button>
            <Button type="submit" variant="contained" disabled={submitting}>
              DB에 등록하기
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    </Layout>
  )
}
