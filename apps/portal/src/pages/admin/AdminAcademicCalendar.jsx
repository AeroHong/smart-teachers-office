import { useEffect, useMemo, useState } from 'react'
import { addDoc, collection, doc, deleteDoc, getDoc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, schoolPath } from '@shared/lib/schema'
import { RowActions, EditAction, DeleteAction, table } from './adminUi'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import TextField from '@mui/material/TextField'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import AddIcon from '@mui/icons-material/Add'
import Switch from '@mui/material/Switch'
import FormControlLabel from '@mui/material/FormControlLabel'
import Alert from '@mui/material/Alert'
import Divider from '@mui/material/Divider'

const TYPES = ['시험', '휴업일', '행사', '기타']
const TYPE_STYLE = {
  시험: { bg: '#fdecea', fg: '#d32f2f' },
  휴업일: { bg: '#e8f5e9', fg: '#2e7d32' },
  행사: { bg: '#e7edf1', fg: '#3d5872' },
}
const DEFAULT_STYLE = { bg: '#f1f3f4', fg: '#5f6368' }
const SYNC_CHIP_STYLE = { bg: '#f1f3f4', fg: '#5f6368' }

const EMPTY_FORM = { title: '', type: TYPES[0], date: '', endDate: '' }

function toDate(value) {
  if (!value) return null
  return value.toDate ? value.toDate() : new Date(value)
}
function toInputValue(date) {
  if (!date) return ''
  return date.toISOString().slice(0, 10)
}
function formatDate(date) {
  if (!date) return ''
  return `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}.`
}

export default function AdminAcademicCalendar() {
  const { user, schoolId } = useAuth()
  const [items, setItems] = useState([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  // 구글 캘린더 동기화 설정 — workspaceSync(AdminAccounts.jsx)와 같은 자리
  // (schools/{schoolId} 문서 한 필드), 매일 새벽 4시 자동 실행 + 여기서 즉시 실행.
  const [syncEnabled, setSyncEnabled] = useState(false)
  const [calendarId, setCalendarId] = useState('')
  const [savingSync, setSavingSync] = useState(false)
  const [syncingNow, setSyncingNow] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  useEffect(() => {
    if (!schoolId) return
    return onSnapshot(collection(db, ...schoolPath(schoolId, COL.ACADEMIC_CALENDAR)), snap => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
  }, [schoolId])

  useEffect(() => {
    if (!schoolId) return
    getDoc(doc(db, 'schools', schoolId)).then(snap => {
      const cfg = snap.data()?.academicCalendarSync || {}
      setSyncEnabled(!!cfg.enabled)
      setCalendarId(cfg.calendarId || '')
    })
  }, [schoolId])

  const handleSaveSync = async () => {
    setSavingSync(true)
    setSyncMsg('')
    try {
      await updateDoc(doc(db, 'schools', schoolId), {
        academicCalendarSync: { enabled: syncEnabled, calendarId: calendarId.trim() },
      })
    } catch (e) {
      console.error('동기화 설정 저장 실패:', e)
    } finally {
      setSavingSync(false)
    }
  }

  const handleSyncNow = async () => {
    setSyncingNow(true)
    setSyncMsg('')
    try {
      const run = httpsCallable(functions, 'runAcademicCalendarSyncNow')
      const { data } = await run({ schoolId })
      const r = data.result || {}
      setSyncMsg(`✅ 동기화 완료 — 전체 ${r.total}건 중 신규 ${r.created}·갱신 ${r.updated}·삭제 ${r.deleted}`)
    } catch (e) {
      setSyncMsg(`❌ ${e.message || '동기화 중 오류가 발생했습니다.'}`)
    } finally {
      setSyncingNow(false)
    }
  }

  const sorted = useMemo(() => [...items]
    .map(e => ({ ...e, _start: toDate(e.date), _end: toDate(e.endDate) }))
    .sort((a, b) => (a._start?.getTime() || 0) - (b._start?.getTime() || 0)), [items])

  const openCreate = () => { setEditingId(null); setForm(EMPTY_FORM); setDialogOpen(true) }
  const openEdit = (item) => {
    setEditingId(item.id)
    setForm({
      title: item.title || '',
      type: item.type || TYPES[0],
      date: toInputValue(toDate(item.date)),
      endDate: toInputValue(toDate(item.endDate)),
    })
    setDialogOpen(true)
  }
  const closeDialog = () => { setDialogOpen(false); setEditingId(null); setForm(EMPTY_FORM) }

  const canSave = form.title.trim() && form.date

  const handleSave = async () => {
    if (!canSave || saving) return
    setSaving(true)
    try {
      const payload = {
        title: form.title.trim(),
        type: form.type,
        date: new Date(form.date),
        endDate: form.endDate ? new Date(form.endDate) : null,
        // 관리자가 직접 쓰는 일정은 늘 manual — 동기화(academicCalendarSync.js)는
        // source=='googleCalendar' 문서만 건드리므로 이 값이 그 대상에서 지켜준다.
        source: 'manual',
      }
      if (editingId) {
        await updateDoc(doc(db, ...schoolPath(schoolId, COL.ACADEMIC_CALENDAR), editingId), {
          ...payload,
          updatedAt: serverTimestamp(),
        })
      } else {
        await addDoc(collection(db, ...schoolPath(schoolId, COL.ACADEMIC_CALENDAR)), {
          ...payload,
          authorUid: user.uid,
          createdAt: serverTimestamp(),
        })
      }
      closeDialog()
    } catch (e) {
      console.error('학사일정 저장 실패:', e)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (item) => {
    if (!window.confirm(`"${item.title}" 일정을 삭제할까요?`)) return
    try {
      await deleteDoc(doc(db, ...schoolPath(schoolId, COL.ACADEMIC_CALENDAR), item.id))
    } catch (e) {
      console.error('학사일정 삭제 실패:', e)
    }
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" fontWeight={700}>학사일정</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate} sx={{ ml: 'auto' }}>
          새 일정
        </Button>
      </Box>

      {/* 구글 캘린더 동기화 — workspaceSync(AdminAccounts.jsx)와 같은 모양. 공개
          공유 캘린더라 API 키만으로 읽는다(도메인 위임 불필요). */}
      <Box sx={{ mb: 4, p: 2.5, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
        <Typography variant="h6" fontWeight={700} sx={{ mb: 1.5 }}>구글 캘린더 동기화</Typography>
        <Typography color="text.secondary" fontSize="0.85rem" sx={{ mb: 2 }}>
          공개 공유 캘린더 하나를 매일 새벽 4시 자동으로 가져옵니다. 여기서 만든 일정은
          손댈 수 없습니다 — 원본(구글 캘린더)에서 고치면 다음 동기화에 반영됩니다.
        </Typography>
        <FormControlLabel
          control={<Switch checked={syncEnabled} onChange={e => setSyncEnabled(e.target.checked)} />}
          label="자동 동기화 사용"
          sx={{ mb: 1.5 }}
        />
        <TextField
          label="캘린더 ID"
          value={calendarId}
          onChange={e => setCalendarId(e.target.value)}
          placeholder="c_xxxx@group.calendar.google.com"
          fullWidth
          size="small"
          sx={{ mb: 2, maxWidth: 480 }}
        />
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Button variant="contained" onClick={handleSaveSync} disabled={savingSync}>
            {savingSync ? '저장 중…' : '설정 저장'}
          </Button>
          <Button variant="outlined" onClick={handleSyncNow} disabled={syncingNow || !syncEnabled || !calendarId.trim()}>
            {syncingNow ? '동기화 중…' : '지금 동기화'}
          </Button>
        </Box>
        {syncMsg && (
          <Alert severity={syncMsg.startsWith('✅') ? 'success' : 'error'} sx={{ mt: 2 }}>
            {syncMsg}
          </Alert>
        )}
      </Box>

      <Divider sx={{ mb: 3 }} />

      <table style={table.table}>
        <thead style={table.thead}>
          <tr>
            <th style={table.th}>일정</th>
            <th style={table.th}>구분</th>
            <th style={table.th}>제목</th>
            <th style={table.th}></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(item => (
            <tr key={item.id} style={table.tr}>
              <td style={table.tdMuted}>
                {formatDate(item._start)}{item._end && item._end.getTime() !== item._start?.getTime() ? ` ~ ${formatDate(item._end)}` : ''}
              </td>
              <td style={table.td}>
                <Chip size="small" label={item.type} sx={{ bgcolor: (TYPE_STYLE[item.type] || DEFAULT_STYLE).bg, color: (TYPE_STYLE[item.type] || DEFAULT_STYLE).fg, fontWeight: 600, mr: item.source === 'googleCalendar' ? 0.6 : 0 }} />
                {item.source === 'googleCalendar' && (
                  <Chip size="small" label="구글 캘린더" sx={{ bgcolor: SYNC_CHIP_STYLE.bg, color: SYNC_CHIP_STYLE.fg, fontWeight: 600 }} />
                )}
              </td>
              <td style={table.td}>{item.title}</td>
              <td style={table.td}>
                <RowActions>
                  <EditAction
                    onClick={() => openEdit(item)}
                    disabled={item.source === 'googleCalendar'}
                    title={item.source === 'googleCalendar' ? '구글 캘린더에서 가져온 일정입니다 — 원본에서 고치세요' : '수정'}
                  />
                  <DeleteAction
                    onClick={() => handleDelete(item)}
                    disabled={item.source === 'googleCalendar'}
                    title={item.source === 'googleCalendar' ? '구글 캘린더에서 가져온 일정입니다 — 원본에서 지우세요' : '삭제'}
                  />
                </RowActions>
              </td>
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr><td style={table.tdMuted} colSpan={4}>등록된 학사일정이 없습니다.</td></tr>
          )}
        </tbody>
      </table>

      <Dialog open={dialogOpen} onClose={closeDialog} fullWidth maxWidth="sm">
        <DialogTitle>{editingId ? '일정 수정' : '새 일정 등록'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 1 }}>
            <TextField
              label="제목"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              autoFocus
              required
              fullWidth
            />
            <FormControl fullWidth>
              <InputLabel>구분</InputLabel>
              <Select
                value={form.type}
                label="구분"
                onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
              >
                {TYPES.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField
              label="시작일"
              type="date"
              value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              required
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="종료일 (여러 날짜인 경우만)"
              type="date"
              value={form.endDate}
              onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={closeDialog}>취소</Button>
          <Button variant="contained" onClick={handleSave} disabled={!canSave || saving}>저장</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
