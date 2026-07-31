import { useEffect, useMemo, useState } from 'react'
import { addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '@shared/lib/firebase'
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

const TYPES = ['시험', '휴업일', '행사', '기타']
const TYPE_STYLE = {
  시험: { bg: '#fdecea', fg: '#d32f2f' },
  휴업일: { bg: '#e8f5e9', fg: '#2e7d32' },
  행사: { bg: '#eef2ff', fg: '#4f46e5' },
}
const DEFAULT_STYLE = { bg: '#f1f3f4', fg: '#5f6368' }

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

  useEffect(() => {
    if (!schoolId) return
    return onSnapshot(collection(db, ...schoolPath(schoolId, COL.ACADEMIC_CALENDAR)), snap => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
  }, [schoolId])

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
                <Chip size="small" label={item.type} sx={{ bgcolor: (TYPE_STYLE[item.type] || DEFAULT_STYLE).bg, color: (TYPE_STYLE[item.type] || DEFAULT_STYLE).fg, fontWeight: 600 }} />
              </td>
              <td style={table.td}>{item.title}</td>
              <td style={table.td}>
                <RowActions>
                  <EditAction onClick={() => openEdit(item)} />
                  <DeleteAction onClick={() => handleDelete(item)} />
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
