/**
 * 보강신청 — 보강 목록. 포털의 CoverMain.jsx 포팅.
 *
 * 관리자가 결강 슬롯을 등록해두면 교사가 선착순으로 신청(claim)한다 — 승인/반려 없음.
 * 신청/취소는 `../lib/coverActions.js`가 Firestore를 건드리고(신청은 트랜잭션으로
 * 레이스 컨디션을 막는다), 날짜 파싱·정렬 판정 등 순수 로직은 `@shared/lib/coverRequests`.
 * 확인창은 포털의 window.confirm 대신 이 세션 전체가 써 온 MUI Dialog로 통일한다.
 */
import { useEffect, useRef, useState } from 'react'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardActions from '@mui/material/CardActions'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import Grid from '@mui/material/Grid'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/EditOutlined'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, schoolPath } from '@shared/lib/schema'
import {
  isCoverClosed, isCoverMine, isCoverOpenNow, parseCoverDate, parseOpenAt, weekdayLabel,
} from '@shared/lib/coverRequests'
import {
  cancelCover, claimCover, deleteCover, fetchTeachersList, registerCovers, updateCoverFields,
} from '../lib/coverActions'
import { useToast } from './ToastProvider'

const FETCH_RANGE_DAYS = 28

function formatCountdown(diffMs) {
  const totalSec = Math.max(0, Math.floor(diffMs / 1000))
  const days = Math.floor(totalSec / 86400)
  const hours = Math.floor((totalSec % 86400) / 3600)
  const mins = Math.floor((totalSec % 3600) / 60)
  const secs = totalSec % 60
  const pad = n => String(n).padStart(2, '0')
  if (days > 0) return `D-${days}  ${pad(hours)}:${pad(mins)}:${pad(secs)}`
  return `${pad(hours)}:${pad(mins)}:${pad(secs)}`
}

const COLS = [
  { key: 'date', label: '날짜', width: 130, placeholder: '2026-09-01' },
  { key: 'className', label: '반', width: 80, placeholder: '2-3' },
  { key: 'period', label: '교시', width: 55, placeholder: '3' },
  { key: 'absentTeacher', label: '결강교사', width: 100, placeholder: '홍길동' },
  { key: 'subject', label: '교과', width: 80, placeholder: '수학' },
  { key: 'coverTeacher', label: '보강교사', width: 110, placeholder: '지정 시 입력', optional: true },
  { key: 'openAt', label: '오픈예약', width: 155, placeholder: '2026-08-31 08:00', optional: true },
]

function emptyRow() {
  return { date: '', className: '', period: '', absentTeacher: '', subject: '', coverTeacher: '', openAt: '' }
}

/** 엑셀/시트에서 붙여넣기(Ctrl+V) 지원하는 표 입력 — 포털의 SheetInput 그대로. */
function SheetInput({ rows, setRows, teachersList }) {
  const inputRefs = useRef([])
  const setCell = (ri, key, val) => setRows(prev => prev.map((r, i) => (i === ri ? { ...r, [key]: val } : r)))
  const addRow = () => setRows(prev => [...prev, emptyRow()])
  const removeRow = ri => setRows(prev => (prev.length === 1 ? [emptyRow()] : prev.filter((_, i) => i !== ri)))
  const focusCell = (ri, ci) => setTimeout(() => inputRefs.current[ri]?.[ci]?.focus(), 0)

  const handleKeyDown = (e, ri, ci) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      if (!e.shiftKey) {
        if (ci < COLS.length - 1) focusCell(ri, ci + 1)
        else { if (ri === rows.length - 1) setRows(prev => [...prev, emptyRow()]); focusCell(ri + 1, 0) }
      } else if (ci > 0) focusCell(ri, ci - 1)
      else if (ri > 0) focusCell(ri - 1, COLS.length - 1)
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
          if (targetCi < COLS.length) newRows[targetRi] = { ...newRows[targetRi], [COLS[targetCi].key]: cell.trim() }
        })
      })
      return newRows
    })
  }

  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Box sx={{ display: 'inline-block', minWidth: '100%' }}>
        <Box sx={{ display: 'flex', gap: 0.5, mb: 0.5, pl: 4 }}>
          {COLS.map(col => (
            <Box key={col.key} sx={{ width: col.width, flexShrink: 0, px: 1 }}>
              <Typography variant="caption" fontWeight={700} color="text.secondary">
                {col.label}{!col.optional && ' *'}
              </Typography>
            </Box>
          ))}
        </Box>
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
                        width: '100%', boxSizing: 'border-box', padding: '5px 8px', border: '1px solid #ddd',
                        borderRadius: 4, fontSize: '0.82rem', outline: 'none', fontFamily: 'inherit',
                        backgroundColor: 'white', cursor: 'pointer',
                      }}
                    >
                      <option value="">— 미지정 —</option>
                      {teachersList.map(t => <option key={t.uid} value={t.name}>{t.name}</option>)}
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
                        width: '100%', boxSizing: 'border-box', padding: '5px 8px', border: '1px solid #ddd',
                        borderRadius: 4, fontSize: '0.82rem', outline: 'none', fontFamily: 'inherit',
                      }}
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
        <Button size="small" startIcon={<AddIcon />} onClick={addRow} sx={{ mt: 0.5, ml: 3.5, color: 'text.secondary', fontSize: '0.78rem' }}>
          행 추가
        </Button>
      </Box>
    </Box>
  )
}

export default function CoverageList() {
  const { user, userName, schoolId, isAdmin } = useAuth()
  const toast = useToast()

  const [covers, setCovers] = useState([])
  const [loading, setLoading] = useState(true)
  const [teachersList, setTeachersList] = useState([])
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    if (!schoolId) return
    fetchTeachersList(schoolId).then(setTeachersList).catch(() => {})
  }, [schoolId])

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!schoolId) return
    const q = query(collection(db, ...schoolPath(schoolId, COL.COVER_REQUESTS)), orderBy('date', 'asc'))
    const unsub = onSnapshot(q, snap => {
      const today = new Date(); today.setHours(0, 0, 0, 0)
      const rangeEnd = new Date(); rangeEnd.setDate(rangeEnd.getDate() + FETCH_RANGE_DAYS); rangeEnd.setHours(23, 59, 59, 999)
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      const filtered = all.filter(item => {
        const d = parseCoverDate(item.date)
        return d && d >= today && d <= rangeEnd
      })
      filtered.sort((a, b) => {
        const mineA = isCoverMine(a, user?.email)
        const mineB = isCoverMine(b, user?.email)
        if (mineA && !mineB) return -1
        if (!mineA && mineB) return 1
        if (isCoverClosed(a) && !isCoverClosed(b)) return 1
        if (!isCoverClosed(a) && isCoverClosed(b)) return -1
        return 0
      })
      setCovers(filtered)
      setLoading(false)
    }, e => { toast.error('보강 목록을 불러오지 못했습니다.', e); setLoading(false) })
    return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, user?.email])

  // 신청/취소 확인 — window.confirm 대신 Dialog(이 세션 전체의 관례).
  const [confirmTarget, setConfirmTarget] = useState(null) // { type:'apply'|'cancel', cover } | null
  const [confirmBusy, setConfirmBusy] = useState(false)

  const runConfirm = async () => {
    if (!confirmTarget) return
    setConfirmBusy(true)
    try {
      if (confirmTarget.type === 'apply') {
        await claimCover({ schoolId, coverId: confirmTarget.cover.id, name: userName, email: user.email })
        toast.success('보강을 신청했습니다.')
      } else {
        await cancelCover({ schoolId, coverId: confirmTarget.cover.id })
        toast.success('신청을 취소했습니다.')
      }
      setConfirmTarget(null)
    } catch (e) {
      toast.error(e.message || '처리하지 못했습니다.', e)
    } finally {
      setConfirmBusy(false)
    }
  }

  // 관리자 — 새 보강 일괄 등록
  const [registerOpen, setRegisterOpen] = useState(false)
  const [rows, setRows] = useState([emptyRow()])
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const handleRegisterSubmit = async () => {
    setSubmitError('')
    setSubmitting(true)
    try {
      await registerCovers({ schoolId, rows, uid: user.uid, teachersList })
      setRows([emptyRow()])
      setRegisterOpen(false)
    } catch (e) {
      setSubmitError(e.message || '등록하지 못했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  // 관리자 — 수정
  const [editTarget, setEditTarget] = useState(null)
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

  const handleEditSave = async () => {
    const { id, date, className, period, absentTeacher, subject, openAt, coverTeacher } = editTarget
    if (!date || !className || !period || !absentTeacher || !subject) {
      setEditError('날짜, 반, 교시, 결강교사, 교과는 필수입니다.')
      return
    }
    setEditSaving(true)
    setEditError('')
    const coverTeacherName = (coverTeacher || '').trim()
    const matched = teachersList.find(t => t.name === coverTeacherName)
    try {
      await updateCoverFields(schoolId, id, {
        date: date.trim(), className: className.trim(), period: Number(period) || 0,
        absentTeacher: absentTeacher.trim(), subject: subject.trim(),
        openAt: (openAt || '').trim() || null,
        coverTeacher: coverTeacherName || null,
        coverTeacherEmail: coverTeacherName ? (matched?.email ?? editTarget.coverTeacherEmail ?? null) : null,
        status: coverTeacherName ? '마감' : '대기중',
      })
      setEditTarget(null)
    } catch (e) {
      setEditError(e.message || '저장하지 못했습니다.')
    } finally {
      setEditSaving(false)
    }
  }

  // 관리자 — 삭제
  const [deleteTarget, setDeleteTarget] = useState(null)
  const runDelete = async () => {
    try {
      await deleteCover(schoolId, deleteTarget.id)
      setDeleteTarget(null)
    } catch (e) {
      toast.error('삭제하지 못했습니다.', e)
    }
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 10, gap: 2 }}>
        <CircularProgress size={28} />
        <Typography color="text.secondary" fontSize="0.9rem">보강 목록을 불러오는 중입니다...</Typography>
      </Box>
    )
  }

  const cardConfig = (item) => {
    const mine = isCoverMine(item, user?.email)
    const closed = isCoverClosed(item)

    if (closed && mine) {
      return {
        sx: { border: '1.5px solid', borderColor: 'primary.light', height: '100%' },
        chip: <Chip label="내 신청 보강" size="small" color="primary" variant="outlined" />,
        button: (
          <Button fullWidth variant="outlined" color="error" onClick={() => setConfirmTarget({ type: 'cancel', cover: item })}>
            취소하기
          </Button>
        ),
      }
    }
    if (closed) {
      return {
        sx: { opacity: 0.6, height: '100%' },
        chip: <Chip label="신청 마감" size="small" />,
        button: <Button fullWidth variant="contained" disabled>신청 마감</Button>,
      }
    }
    const openAt = parseOpenAt(item.openAt)
    if (openAt && !isCoverOpenNow(item, now)) {
      const openDateStr = openAt.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      return {
        sx: { border: '1.5px solid', borderColor: 'warning.light', height: '100%' },
        chip: <Chip label="공개예정" size="small" color="warning" variant="outlined" />,
        button: (
          <Button fullWidth variant="outlined" color="warning" disabled sx={{ fontFamily: 'monospace' }}>
            ⏳ {formatCountdown(openAt - now)}
          </Button>
        ),
        openDateStr,
      }
    }
    return {
      sx: { height: '100%' },
      chip: <Chip label="신청가능" size="small" color="success" />,
      button: (
        <Button fullWidth variant="contained" onClick={() => setConfirmTarget({ type: 'apply', cover: item })}>
          보강 신청
        </Button>
      ),
    }
  }

  return (
    <Box sx={{ p: 2.5 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', mb: 2.5, flexWrap: 'wrap', gap: 1 }}>
        <Box>
          <Typography variant="h6" fontWeight={800}>보강 목록</Typography>
          <Typography color="text.secondary" fontSize="0.85rem" mt={0.5}>
            오늘부터 {FETCH_RANGE_DAYS}일 안의 신청 가능·예정 보강입니다.
          </Typography>
        </Box>
        {isAdmin && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setRows([emptyRow()]); setSubmitError(''); setRegisterOpen(true) }}>
            새 보강 등록
          </Button>
        )}
      </Box>

      {covers.length === 0 ? (
        <Typography color="text.secondary" fontSize="0.9rem" sx={{ py: 6, textAlign: 'center' }}>
          등록된 보강 내역이 없습니다.
        </Typography>
      ) : (
        <Grid container spacing={2}>
          {covers.map(item => {
            const { sx, chip, button, openDateStr } = cardConfig(item)
            return (
              <Grid item xs={12} sm={6} md={4} key={item.id}>
                <Card variant="outlined" sx={sx}>
                  <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                      {chip}
                      <Typography variant="body2" fontWeight={700} color="text.secondary">
                        {item.date}{weekdayLabel(item.date)}
                      </Typography>
                    </Box>
                    <Typography variant="h6" gutterBottom>
                      {item.className}{' '}
                      <Typography component="span" color="primary" fontWeight={700}>{item.period}교시</Typography>
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
                  <CardActions sx={{ px: 2, py: 1.2, gap: 0.5 }}>
                    <Box sx={{ flex: 1 }}>{button}</Box>
                    {isAdmin && (
                      <>
                        <Tooltip title="수정">
                          <IconButton size="small" onClick={() => { setEditTarget({ ...item, period: String(item.period) }); setEditError('') }}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="삭제">
                          <IconButton size="small" onClick={() => setDeleteTarget(item)}>
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

      {/* 신청/취소 확인 */}
      <Dialog open={!!confirmTarget} onClose={() => !confirmBusy && setConfirmTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>
          {confirmTarget?.type === 'apply' ? '이 보강을 신청할까요?' : '신청을 취소할까요?'}
        </DialogTitle>
        {confirmTarget?.type === 'cancel' && (
          <DialogContent>
            <Typography fontSize="0.9rem" color="text.secondary">취소하면 즉시 다른 선생님께 다시 노출됩니다.</Typography>
          </DialogContent>
        )}
        <DialogActions>
          <Button color="inherit" onClick={() => setConfirmTarget(null)} disabled={confirmBusy}>취소</Button>
          <Button variant="contained" onClick={runConfirm} disabled={confirmBusy}>
            {confirmBusy ? <CircularProgress size={18} color="inherit" /> : '확인'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 관리자 — 수정 */}
      <Dialog open={!!editTarget} onClose={() => !editSaving && setEditTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>보강 수정</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <TextField label="날짜" required size="small" sx={{ flex: 1 }} value={editTarget?.date ?? ''}
              onChange={e => setEditTarget(p => ({ ...p, date: e.target.value }))} placeholder="2026-09-01" />
            <TextField label="반" required size="small" sx={{ width: 90 }} value={editTarget?.className ?? ''}
              onChange={e => setEditTarget(p => ({ ...p, className: e.target.value }))} placeholder="2-3" />
            <TextField label="교시" required size="small" sx={{ width: 70 }} value={editTarget?.period ?? ''}
              onChange={e => setEditTarget(p => ({ ...p, period: e.target.value }))} placeholder="3" />
          </Box>
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <TextField label="결강교사" required size="small" sx={{ flex: 1 }} value={editTarget?.absentTeacher ?? ''}
              onChange={e => setEditTarget(p => ({ ...p, absentTeacher: e.target.value }))} />
            <TextField label="교과" required size="small" sx={{ flex: 1 }} value={editTarget?.subject ?? ''}
              onChange={e => setEditTarget(p => ({ ...p, subject: e.target.value }))} />
          </Box>
          <FormControl size="small" fullWidth>
            <InputLabel>보강교사 (선택)</InputLabel>
            <Select label="보강교사 (선택)" value={editTarget?.coverTeacher ?? ''}
              onChange={e => setEditTarget(p => ({ ...p, coverTeacher: e.target.value }))}>
              <MenuItem value=""><em>— 미지정 (대기중) —</em></MenuItem>
              {teachersList.map(t => <MenuItem key={t.uid} value={t.name}>{t.name}</MenuItem>)}
            </Select>
          </FormControl>
          <TextField label="오픈예약 (선택)" size="small" fullWidth value={editTarget?.openAt ?? ''}
            onChange={e => setEditTarget(p => ({ ...p, openAt: e.target.value }))}
            placeholder="2026-08-31 08:00" helperText="비워두면 즉시 공개" />
          {editError && <Alert severity="error">{editError}</Alert>}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEditTarget(null)} color="inherit" disabled={editSaving}>취소</Button>
          <Button variant="contained" onClick={handleEditSave} disabled={editSaving}>
            {editSaving ? <CircularProgress size={18} color="inherit" /> : '저장'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 관리자 — 삭제 확인 */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>이 보강 항목을 삭제할까요?</DialogTitle>
        <DialogActions>
          <Button color="inherit" onClick={() => setDeleteTarget(null)}>취소</Button>
          <Button color="error" variant="contained" onClick={runDelete}>삭제</Button>
        </DialogActions>
      </Dialog>

      {/* 관리자 — 새 보강 등록 */}
      <Dialog open={registerOpen} onClose={() => !submitting && setRegisterOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>새 보강 등록</DialogTitle>
        <DialogContent sx={{ pt: 2.5, pb: 1 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            아래 표에 직접 입력하거나, 엑셀/시트에서 <strong>복사 후 붙여넣기(Ctrl+V)</strong>하세요.
            열 순서: <strong>날짜 → 반 → 교시 → 결강교사 → 교과 → 보강교사(선택) → 오픈예약(선택)</strong>
          </Typography>
          <SheetInput rows={rows} setRows={setRows} teachersList={teachersList} />
          {submitError && <Alert severity="error" sx={{ mt: 1.5 }}>{submitError}</Alert>}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setRegisterOpen(false)} color="inherit" disabled={submitting}>취소</Button>
          <Button variant="contained" onClick={handleRegisterSubmit} disabled={submitting}>
            {submitting ? <CircularProgress size={18} color="inherit" /> : '등록하기'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
