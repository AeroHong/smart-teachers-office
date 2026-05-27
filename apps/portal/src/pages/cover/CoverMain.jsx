import { useState, useEffect, useRef } from 'react'
import {
  collection, query, where, orderBy, onSnapshot,
  doc, updateDoc, deleteDoc, writeBatch,
  serverTimestamp, getDocs,
} from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../contexts/AuthContext'
import Layout from '../../components/Layout'

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
import Alert from '@mui/material/Alert'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import TextField from '@mui/material/TextField'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import InputLabel from '@mui/material/InputLabel'
import FormControl from '@mui/material/FormControl'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import AddIcon from '@mui/icons-material/Add'
import Tooltip from '@mui/material/Tooltip'

// ── 유틸 함수 ───────────────────────────────────────────────────

// "YYYY-MM-DD", "YYYY. M. D.", "YYYY/M/D" 등 다양한 형식 파싱
function parseDate(dateStr) {
  const s = String(dateStr || '').trim()
  if (!s) return null
  const m = s.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/)
  if (m) return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]))
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

function getDayOfWeek(dateString) {
  const d = new Date(dateString)
  if (isNaN(d.getTime())) return ''
  return `(${['일', '월', '화', '수', '목', '금', '토'][d.getDay()]})`
}

function getOpenAtDate(openAtStr) {
  if (!openAtStr) return null
  const d = new Date(String(openAtStr).replace(' ', 'T'))
  return isNaN(d.getTime()) ? null : d
}

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

// ── 스프레드시트 입력 폼 ─────────────────────────────────────────
const COLS = [
  { key: 'date',          label: '날짜',     width: 130, placeholder: '2025-05-20' },
  { key: 'className',     label: '반',       width: 80,  placeholder: '2-3' },
  { key: 'period',        label: '교시',     width: 55,  placeholder: '3' },
  { key: 'absentTeacher', label: '결강교사', width: 100, placeholder: '홍길동' },
  { key: 'subject',       label: '교과',     width: 80,  placeholder: '수학' },
  { key: 'coverTeacher',  label: '보강교사', width: 110, placeholder: '지정 시 입력', optional: true },
  { key: 'openAt',        label: '오픈예약', width: 155, placeholder: '2025-05-19 08:00', optional: true },
]

function emptyRow() {
  return { date: '', className: '', period: '', absentTeacher: '', subject: '', coverTeacher: '', openAt: '' }
}

function SheetInput({ rows, setRows, teachersList = [] }) {
  const inputRefs = useRef([])

  const setCell = (ri, key, val) => {
    setRows(prev => prev.map((r, i) => i === ri ? { ...r, [key]: val } : r))
  }

  const addRow = () => setRows(prev => [...prev, emptyRow()])

  const removeRow = (ri) => {
    setRows(prev => prev.length === 1 ? [emptyRow()] : prev.filter((_, i) => i !== ri))
  }

  const focusCell = (ri, ci) => {
    setTimeout(() => inputRefs.current[ri]?.[ci]?.focus(), 0)
  }

  const handleKeyDown = (e, ri, ci) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      if (!e.shiftKey) {
        if (ci < COLS.length - 1) {
          focusCell(ri, ci + 1)
        } else {
          if (ri === rows.length - 1) setRows(prev => [...prev, emptyRow()])
          focusCell(ri + 1, 0)
        }
      } else {
        if (ci > 0) {
          focusCell(ri, ci - 1)
        } else if (ri > 0) {
          focusCell(ri - 1, COLS.length - 1)
        }
      }
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (ri === rows.length - 1) setRows(prev => [...prev, emptyRow()])
      focusCell(ri + 1, 0)
    }
  }

  const handlePaste = (e, ri, ci) => {
    const text = e.clipboardData.getData('text')
    if (!text.includes('\t') && !text.includes('\n')) return
    e.preventDefault()

    const pastedRows = text.trim().split(/\r?\n/).map(row => row.split('\t'))
    setRows(prev => {
      const newRows = [...prev]
      pastedRows.forEach((pastedRow, dr) => {
        const targetRi = ri + dr
        while (newRows.length <= targetRi) newRows.push(emptyRow())
        pastedRow.forEach((cell, dc) => {
          const targetCi = ci + dc
          if (targetCi < COLS.length) {
            const key = COLS[targetCi].key
            newRows[targetRi] = { ...newRows[targetRi], [key]: cell.trim() }
          }
        })
      })
      return newRows
    })
  }

  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Box sx={{ display: 'inline-block', minWidth: '100%' }}>
        {/* 헤더 */}
        <Box sx={{ display: 'flex', gap: 0.5, mb: 0.5, pl: 4 }}>
          {COLS.map(col => (
            <Box
              key={col.key}
              sx={{ width: col.width, flexShrink: 0, px: 1 }}
            >
              <Typography variant="caption" fontWeight={700} color="text.secondary">
                {col.label}{!col.optional && ' *'}
              </Typography>
            </Box>
          ))}
        </Box>

        {/* 행들 */}
        {rows.map((row, ri) => {
          if (!inputRefs.current[ri]) inputRefs.current[ri] = []
          return (
            <Box key={ri} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
              <Typography variant="caption" color="text.disabled" sx={{ width: 24, textAlign: 'right', flexShrink: 0, pr: 0.5 }}>
                {ri + 1}
              </Typography>
              {COLS.map((col, ci) => (
                <Box key={col.key} sx={{ width: col.width, flexShrink: 0 }}>
                  {col.key === 'coverTeacher' ? (
                    <select
                      ref={el => { inputRefs.current[ri][ci] = el }}
                      value={row[col.key]}
                      onChange={e => setCell(ri, col.key, e.target.value)}
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        padding: '5px 8px',
                        border: '1px solid #ddd',
                        borderRadius: 4,
                        fontSize: '0.82rem',
                        outline: 'none',
                        fontFamily: 'inherit',
                        backgroundColor: 'white',
                        cursor: 'pointer',
                      }}
                      onFocus={e => { e.target.style.borderColor = '#1976d2'; e.target.style.boxShadow = '0 0 0 2px rgba(25,118,210,0.15)' }}
                      onBlur={e => { e.target.style.borderColor = '#ddd'; e.target.style.boxShadow = 'none' }}
                    >
                      <option value="">— 미지정 —</option>
                      {teachersList.map(t => (
                        <option key={t.uid} value={t.name}>{t.name}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      ref={el => { inputRefs.current[ri][ci] = el }}
                      value={row[col.key]}
                      placeholder={col.placeholder}
                      onChange={e => setCell(ri, col.key, e.target.value)}
                      onKeyDown={e => handleKeyDown(e, ri, ci)}
                      onPaste={e => handlePaste(e, ri, ci)}
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        padding: '5px 8px',
                        border: '1px solid #ddd',
                        borderRadius: 4,
                        fontSize: '0.82rem',
                        outline: 'none',
                        fontFamily: 'inherit',
                      }}
                      onFocus={e => { e.target.style.borderColor = '#1976d2'; e.target.style.boxShadow = '0 0 0 2px rgba(25,118,210,0.15)' }}
                      onBlur={e => { e.target.style.borderColor = '#ddd'; e.target.style.boxShadow = 'none' }}
                    />
                  )}
                </Box>
              ))}
              <IconButton size="small" onClick={() => removeRow(ri)} sx={{ flexShrink: 0 }}>
                <DeleteIcon fontSize="small" sx={{ color: '#ccc', '&:hover': { color: '#f44' } }} />
              </IconButton>
            </Box>
          )
        })}

        {/* 행 추가 */}
        <Button
          size="small"
          startIcon={<AddIcon />}
          onClick={addRow}
          sx={{ mt: 0.5, ml: 3.5, color: 'text.secondary', fontSize: '0.78rem' }}
        >
          행 추가
        </Button>
      </Box>
    </Box>
  )
}

// ── 메인 컴포넌트 ────────────────────────────────────────────────
export default function CoverMain() {
  const { user, role, schoolId } = useAuth()
  const isAdmin = role === 'school_admin' || role === 'admin'

  const [covers, setCovers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [teachersList, setTeachersList] = useState([])
  useEffect(() => {
    if (!schoolId) return
    getDocs(query(collection(db, 'users'), where('schoolId', '==', schoolId)))
      .then(snap => {
        const list = snap.docs
          .map(d => ({ uid: d.id, ...d.data() }))
          .filter(u => u.staffType === '교사')
          .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'))
        setTeachersList(list)
      })
      .catch(() => {})
  }, [schoolId])

  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // 새 보강 등록 모달
  const [modalOpen, setModalOpen] = useState(false)
  const [rows, setRows] = useState([emptyRow()])
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  // 보강 수정 모달
  const [editTarget, setEditTarget] = useState(null)  // { id, date, className, period, absentTeacher, subject, openAt }
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

  // Firestore 실시간 구독 (전체 로드 후 클라이언트 필터링)
  // — Sheets에서 마이그레이션된 날짜가 "YYYY. M. D." 등 비표준일 수 있어
  //   Firestore 범위 쿼리 대신 클라이언트에서 오늘~14일 필터 적용
  useEffect(() => {
    if (!schoolId) return

    const q = query(
      collection(db, 'schools', schoolId, 'coverRequests'),
      orderBy('date', 'asc')
    )

    const unsub = onSnapshot(q, snap => {
      const today = new Date(); today.setHours(0, 0, 0, 0)
      const limit = new Date(); limit.setDate(limit.getDate() + 14); limit.setHours(23, 59, 59, 999)

      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      const filtered = all.filter(item => {
        const d = parseDate(item.date)
        if (!d) return false
        return d >= today && d <= limit
      })

      filtered.sort((a, b) => {
        const isMineA = user && a.coverTeacherEmail === user.email
        const isMineB = user && b.coverTeacherEmail === user.email
        if (isMineA && !isMineB) return -1
        if (!isMineA && isMineB) return 1
        if (a.status === '마감' && b.status !== '마감') return 1
        if (a.status !== '마감' && b.status === '마감') return -1
        return 0
      })
      setCovers(filtered)
      setLoading(false)
    }, err => {
      setError(err.message)
      setLoading(false)
    })

    return unsub
  }, [schoolId, user])

  // 보강 신청
  const handleApply = async (cover) => {
    if (!user || !schoolId) return
    if (!window.confirm('이 보강을 신청하시겠습니까?')) return

    const openAt = getOpenAtDate(cover.openAt)
    if (openAt && openAt > now) {
      alert('아직 신청 가능 시간이 아닙니다.\n공개 예약 시간 이후에 다시 시도해주세요.')
      return
    }

    const myName = user.displayName?.replace(' 선생님', '').trim() ?? ''
    try {
      await updateDoc(doc(db, 'schools', schoolId, 'coverRequests', cover.id), {
        status: '마감',
        coverTeacher: myName,
        coverTeacherEmail: user.email,
        appliedAt: serverTimestamp(),
      })
    } catch (err) {
      alert('신청 중 오류: ' + err.message)
    }
  }

  // 보강 신청 취소
  const handleCancel = async (coverId) => {
    if (!user || !schoolId) return
    if (!window.confirm('정말로 이 보강 신청을 취소하시겠습니까?\n(취소 즉시 다른 선생님께 노출됩니다.)')) return
    try {
      await updateDoc(doc(db, 'schools', schoolId, 'coverRequests', coverId), {
        status: '대기중',
        coverTeacher: null,
        coverTeacherEmail: null,
        appliedAt: null,
      })
    } catch (err) {
      alert('취소 중 오류: ' + err.message)
    }
  }

  // 보강 수정 저장 (관리자)
  const handleEditSave = async () => {
    if (!editTarget) return
    const { id, date, className, period, absentTeacher, subject, openAt, coverTeacher } = editTarget
    if (!date || !className || !period || !absentTeacher || !subject) {
      setEditError('날짜, 반, 교시, 결강교사, 교과는 필수입니다.')
      return
    }
    setEditSaving(true)
    setEditError('')
    const coverTeacherName = (coverTeacher ?? '').trim()
    const matched = teachersList.find(t => t.name === coverTeacherName)
    try {
      await updateDoc(doc(db, 'schools', schoolId, 'coverRequests', id), {
        date: date.trim(),
        className: className.trim(),
        period: Number(period) || 0,
        absentTeacher: absentTeacher.trim(),
        subject: subject.trim(),
        openAt: openAt?.trim() || null,
        coverTeacher: coverTeacherName || null,
        coverTeacherEmail: coverTeacherName ? (matched?.email ?? editTarget.coverTeacherEmail ?? null) : null,
        status: coverTeacherName ? '마감' : '대기중',
      })
      setEditTarget(null)
    } catch (err) {
      setEditError('저장 중 오류: ' + err.message)
    } finally {
      setEditSaving(false)
    }
  }

  // 보강 삭제 (관리자)
  const handleDelete = async (coverId) => {
    if (!window.confirm('이 보강 항목을 삭제하시겠습니까?')) return
    try {
      await deleteDoc(doc(db, 'schools', schoolId, 'coverRequests', coverId))
    } catch (err) {
      alert('삭제 중 오류: ' + err.message)
    }
  }

  // 새 보강 일괄 등록
  const handleCreateSubmit = async () => {
    setSubmitError('')
    const validRows = rows.filter(r => r.date && r.className && r.period && r.absentTeacher && r.subject)
    if (validRows.length === 0) {
      setSubmitError('최소 한 행 이상 필수 항목(날짜, 반, 교시, 결강교사, 교과)을 입력하세요.')
      return
    }

    setSubmitting(true)
    try {
      const batch = writeBatch(db)
      validRows.forEach(r => {
        const ref = doc(collection(db, 'schools', schoolId, 'coverRequests'))
        const coverTeacherName = r.coverTeacher?.trim() || ''
        const matched = teachersList.find(t => t.name === coverTeacherName)
        batch.set(ref, {
          date: r.date.trim(),
          className: r.className.trim(),
          period: Number(r.period) || 0,
          absentTeacher: r.absentTeacher.trim(),
          subject: r.subject.trim(),
          status: coverTeacherName ? '마감' : '대기중',
          coverTeacher: coverTeacherName || null,
          coverTeacherEmail: matched?.email || null,
          appliedAt: coverTeacherName ? serverTimestamp() : null,
          openAt: r.openAt.trim() || null,
          createdAt: serverTimestamp(),
          createdBy: user.uid,
        })
      })
      await batch.commit()
      setRows([emptyRow()])
      setModalOpen(false)
    } catch (err) {
      setSubmitError('등록 실패: ' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // 카드 스타일/버튼 결정
  const getCardConfig = (item) => {
    const isMine = user && item.coverTeacherEmail === user.email
    const isClosed = item.status === '마감'

    if (isClosed && isMine) {
      return {
        sx: { border: '1.5px solid', borderColor: 'primary.light', bgcolor: '#f0f6ff', height: '100%' },
        chip: <Chip label="내 신청 보강" size="small" color="primary" variant="outlined" />,
        button: (
          <Button fullWidth variant="outlined" color="error" onClick={() => handleCancel(item.id)}>
            취소하기
          </Button>
        ),
      }
    }
    if (isClosed) {
      return {
        sx: { opacity: 0.55, filter: 'grayscale(40%)', height: '100%' },
        chip: <Chip label="신청 마감" size="small" sx={{ bgcolor: '#e0e0e0', color: '#757575' }} />,
        button: <Button fullWidth variant="contained" disabled>신청 마감</Button>,
      }
    }

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
        <Button fullWidth variant="contained" color="primary" onClick={() => handleApply(item)}>
          보강 신청
        </Button>
      ),
    }
  }

  return (
    <Layout>
      {/* 헤더 */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', mb: 3 }}>
        <Box>
          <Typography variant="h5">보강 신청 목록</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            신청 가능한 보강과 공개 예정 보강이 함께 표시됩니다.
          </Typography>
        </Box>
        {isAdmin && (
          <Button variant="contained" onClick={() => { setRows([emptyRow()]); setSubmitError(''); setModalOpen(true) }}
            sx={{ whiteSpace: 'nowrap' }}>
            + 새 보강 등록
          </Button>
        )}
      </Box>

      {/* 로딩 */}
      {loading && (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 10, gap: 2 }}>
          <CircularProgress />
          <Typography color="primary" fontWeight={600}>보강 목록을 불러오는 중입니다...</Typography>
        </Box>
      )}

      {/* 에러 */}
      {!loading && error && <Alert severity="error" sx={{ my: 2 }}>{error}</Alert>}

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
            return (
              <Grid item xs={12} sm={6} md={4} key={item.id}>
                <Card sx={sx}>
                  <CardContent sx={{ flexGrow: 1 }}>
                    {/* 뱃지 + 날짜 */}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                      {chip}
                      <Typography variant="body2" fontWeight={700} color="text.secondary">
                        {item.date}{getDayOfWeek(item.date)}
                      </Typography>
                    </Box>
                    <Typography variant="h6" gutterBottom>
                      {item.className}{' '}
                      <Typography component="span" color="primary" fontWeight={700}>
                        {item.period}교시
                      </Typography>
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {item.subject} ({item.absentTeacher} 선생님 결강)
                    </Typography>
                    {openDateStr && (
                      <Typography variant="caption" color="warning.main" sx={{ mt: 1, display: 'block' }}>
                        {openDateStr} 신청 오픈
                      </Typography>
                    )}
                  </CardContent>
                  <Divider />
                  <CardActions sx={{ px: 2, py: 1.5, gap: 0.5 }}>
                    <Box sx={{ flex: 1 }}>{button}</Box>
                    {isAdmin && (
                      <>
                        <Tooltip title="수정">
                          <IconButton
                            size="small"
                            onClick={() => { setEditTarget({ ...item, period: String(item.period) }); setEditError('') }}
                            sx={{ color: '#bbb', '&:hover': { color: '#1976d2' } }}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="삭제">
                          <IconButton
                            size="small"
                            onClick={() => handleDelete(item.id)}
                            sx={{ color: '#bbb', '&:hover': { color: '#f44' } }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </>
                    )}
                  </CardActions>
                </Card>
              </Grid>
            )
          })}
        </Grid>
      )}

      {/* ── 보강 수정 모달 ── */}
      <Dialog open={!!editTarget} onClose={() => !editSaving && setEditTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>보강 수정</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <TextField
              label="날짜" required size="small" sx={{ flex: 1 }}
              value={editTarget?.date ?? ''}
              onChange={e => setEditTarget(p => ({ ...p, date: e.target.value }))}
              placeholder="2025-05-20"
            />
            <TextField
              label="반" required size="small" sx={{ width: 90 }}
              value={editTarget?.className ?? ''}
              onChange={e => setEditTarget(p => ({ ...p, className: e.target.value }))}
              placeholder="2-3"
            />
            <TextField
              label="교시" required size="small" sx={{ width: 70 }}
              value={editTarget?.period ?? ''}
              onChange={e => setEditTarget(p => ({ ...p, period: e.target.value }))}
              placeholder="3"
            />
          </Box>
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <TextField
              label="결강교사" required size="small" sx={{ flex: 1 }}
              value={editTarget?.absentTeacher ?? ''}
              onChange={e => setEditTarget(p => ({ ...p, absentTeacher: e.target.value }))}
            />
            <TextField
              label="교과" required size="small" sx={{ flex: 1 }}
              value={editTarget?.subject ?? ''}
              onChange={e => setEditTarget(p => ({ ...p, subject: e.target.value }))}
            />
          </Box>
          <FormControl size="small" fullWidth>
            <InputLabel>보강교사 (선택)</InputLabel>
            <Select
              label="보강교사 (선택)"
              value={editTarget?.coverTeacher ?? ''}
              onChange={e => setEditTarget(p => ({ ...p, coverTeacher: e.target.value }))}
            >
              <MenuItem value=""><em>— 미지정 (대기중) —</em></MenuItem>
              {teachersList.map(t => (
                <MenuItem key={t.uid} value={t.name}>{t.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="오픈예약 (선택)" size="small" fullWidth
            value={editTarget?.openAt ?? ''}
            onChange={e => setEditTarget(p => ({ ...p, openAt: e.target.value }))}
            placeholder="2025-05-19 08:00"
            helperText="비워두면 즉시 공개"
          />
          {editError && <Alert severity="error">{editError}</Alert>}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEditTarget(null)} color="inherit" disabled={editSaving}>취소</Button>
          <Button variant="contained" onClick={handleEditSave} disabled={editSaving}>
            {editSaving ? <CircularProgress size={18} color="inherit" /> : '저장'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── 새 보강 등록 모달 (스프레드시트 입력) ── */}
      <Dialog open={modalOpen} onClose={() => !submitting && setModalOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ bgcolor: 'primary.main', color: 'white', fontWeight: 700 }}>
          새 보강 등록
        </DialogTitle>
        <DialogContent sx={{ pt: 2.5, pb: 1 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            아래 표에 직접 입력하거나, 엑셀/시트에서 <strong>복사 후 붙여넣기(Ctrl+V)</strong>하세요.
            열 순서: <strong>날짜 → 반 → 교시 → 결강교사 → 교과 → 보강교사(선택) → 오픈예약(선택)</strong>
          </Typography>
          <SheetInput rows={rows} setRows={setRows} teachersList={teachersList} />
          {submitError && <Alert severity="error" sx={{ mt: 1.5 }}>{submitError}</Alert>}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setModalOpen(false)} color="inherit" disabled={submitting}>취소</Button>
          <Button variant="contained" onClick={handleCreateSubmit} disabled={submitting}>
            {submitting ? <CircularProgress size={18} color="inherit" /> : 'DB에 등록하기'}
          </Button>
        </DialogActions>
      </Dialog>
    </Layout>
  )
}
