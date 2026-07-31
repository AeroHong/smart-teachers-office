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
import FormControlLabel from '@mui/material/FormControlLabel'
import Checkbox from '@mui/material/Checkbox'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import AddIcon from '@mui/icons-material/Add'
import PushPinIcon from '@mui/icons-material/PushPin'

const CATEGORIES = ['일과/시간표', '행정', '행사', '기타']

const EMPTY_FORM = { title: '', content: '', category: CATEGORIES[0], pinned: false }

function toMillis(ts) {
  return ts?.toMillis?.() ?? 0
}

export default function AdminAnnouncements() {
  const { user, userName, schoolId } = useAuth()
  const [items, setItems] = useState([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!schoolId) return
    return onSnapshot(collection(db, ...schoolPath(schoolId, COL.ANNOUNCEMENTS)), snap => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
  }, [schoolId])

  const sorted = useMemo(() => [...items].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1
    return toMillis(b.createdAt) - toMillis(a.createdAt)
  }), [items])

  const openCreate = () => { setEditingId(null); setForm(EMPTY_FORM); setDialogOpen(true) }
  const openEdit = (item) => {
    setEditingId(item.id)
    setForm({ title: item.title || '', content: item.content || '', category: item.category || CATEGORIES[0], pinned: !!item.pinned })
    setDialogOpen(true)
  }
  const closeDialog = () => { setDialogOpen(false); setEditingId(null); setForm(EMPTY_FORM) }

  const canSave = form.title.trim() && form.content.trim()

  const handleSave = async () => {
    if (!canSave || saving) return
    setSaving(true)
    try {
      if (editingId) {
        await updateDoc(doc(db, ...schoolPath(schoolId, COL.ANNOUNCEMENTS), editingId), {
          title: form.title.trim(),
          content: form.content.trim(),
          category: form.category,
          pinned: form.pinned,
          updatedAt: serverTimestamp(),
        })
      } else {
        await addDoc(collection(db, ...schoolPath(schoolId, COL.ANNOUNCEMENTS)), {
          title: form.title.trim(),
          content: form.content.trim(),
          category: form.category,
          pinned: form.pinned,
          authorUid: user.uid,
          authorName: userName,
          createdAt: serverTimestamp(),
        })
      }
      closeDialog()
    } catch (e) {
      console.error('공지 저장 실패:', e)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (item) => {
    if (!window.confirm(`"${item.title}" 공지를 삭제할까요?`)) return
    try {
      await deleteDoc(doc(db, ...schoolPath(schoolId, COL.ANNOUNCEMENTS), item.id))
    } catch (e) {
      console.error('공지 삭제 실패:', e)
    }
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" fontWeight={700}>전체 공지</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate} sx={{ ml: 'auto' }}>
          새 공지
        </Button>
      </Box>

      <table style={table.table}>
        <thead style={table.thead}>
          <tr>
            <th style={table.th}></th>
            <th style={table.th}>제목</th>
            <th style={table.th}>분류</th>
            <th style={table.th}>작성자</th>
            <th style={table.th}></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(item => (
            <tr key={item.id} style={table.tr}>
              <td style={{ ...table.td, width: 32 }}>
                {item.pinned && <PushPinIcon sx={{ fontSize: 16, color: '#d97706' }} />}
              </td>
              <td style={table.td}>{item.title}</td>
              <td style={table.td}>
                <Chip size="small" label={item.category} sx={{ bgcolor: '#eef2ff', color: '#4f46e5', fontWeight: 600 }} />
              </td>
              <td style={table.tdMuted}>{item.authorName}</td>
              <td style={table.td}>
                <RowActions>
                  <EditAction onClick={() => openEdit(item)} />
                  <DeleteAction onClick={() => handleDelete(item)} />
                </RowActions>
              </td>
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr><td style={table.tdMuted} colSpan={5}>등록된 공지가 없습니다.</td></tr>
          )}
        </tbody>
      </table>

      <Dialog open={dialogOpen} onClose={closeDialog} fullWidth maxWidth="sm">
        <DialogTitle>{editingId ? '공지 수정' : '새 공지 작성'}</DialogTitle>
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
              <InputLabel>분류</InputLabel>
              <Select
                value={form.category}
                label="분류"
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              >
                {CATEGORIES.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField
              label="내용"
              value={form.content}
              onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
              required
              multiline
              minRows={4}
              fullWidth
            />
            <FormControlLabel
              control={<Checkbox checked={form.pinned} onChange={e => setForm(f => ({ ...f, pinned: e.target.checked }))} />}
              label="상단 고정"
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
