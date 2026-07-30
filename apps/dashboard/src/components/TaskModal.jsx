import { useEffect, useState } from 'react'
import { collection, addDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import Autocomplete from '@mui/material/Autocomplete'
import Button from '@mui/material/Button'
import Box from '@mui/material/Box'
import Link from '@mui/material/Link'
import Collapse from '@mui/material/Collapse'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import ToggleButton from '@mui/material/ToggleButton'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'

const STAFF_ROLES = ['teacher', 'admin', 'school_admin', 'principal']

export default function TaskModal({ open, onClose }) {
  const { user, userName, schoolId, isAdmin } = useAuth()
  const [staff, setStaff] = useState([])
  const [title, setTitle] = useState('')
  const [assignees, setAssignees] = useState([])
  const [dueDate, setDueDate] = useState('')
  const [showMore, setShowMore] = useState(false)
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('')
  const [visibility, setVisibility] = useState('개인')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open || !schoolId) return
    setVisibility(isAdmin ? '전체공개' : '개인')
    getDocs(query(collection(db, 'users'), where('schoolId', '==', schoolId), where('role', 'in', STAFF_ROLES)))
      .then((snap) => setStaff(snap.docs.map((d) => ({ uid: d.id, name: d.data().name || d.data().email }))))
      .catch((e) => console.error('구성원 조회 실패:', e))
  }, [open, schoolId, isAdmin])

  const reset = () => {
    setTitle(''); setAssignees([]); setDueDate('')
    setShowMore(false); setDescription(''); setPriority('')
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const canSave = title.trim() && assignees.length > 0 && dueDate

  const handleSave = async () => {
    if (!canSave || saving) return
    setSaving(true)
    try {
      await addDoc(collection(db, 'schools', schoolId, 'tasks'), {
        title: title.trim(),
        description: description.trim() || null,
        createdBy: user.uid,
        createdByName: userName,
        assignees: assignees.map((a) => a.uid),
        assigneeNames: assignees.map((a) => a.name),
        dueDate: new Date(dueDate),
        priority: priority || null,
        status: '진행중',
        visibility,
        sourceModule: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      handleClose()
    } catch (e) {
      console.error('업무 등록 실패:', e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle>새 업무 등록</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 1 }}>
          <TextField
            label="제목"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
            required
            fullWidth
          />
          <Autocomplete
            multiple
            options={staff}
            getOptionLabel={(o) => o.name}
            isOptionEqualToValue={(a, b) => a.uid === b.uid}
            value={assignees}
            onChange={(_, value) => setAssignees(value)}
            renderInput={(params) => <TextField {...params} label="담당자" required />}
          />
          <TextField
            label="마감일"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            required
            fullWidth
            InputLabelProps={{ shrink: true }}
          />

          <Link component="button" type="button" underline="hover" onClick={() => setShowMore((v) => !v)} sx={{ textAlign: 'left' }}>
            {showMore ? '추가 옵션 접기' : '추가 옵션 (설명·우선순위·공개범위)'}
          </Link>
          <Collapse in={showMore}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              <TextField
                label="설명"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                multiline
                minRows={2}
                fullWidth
              />
              <TextField
                label="우선순위"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                fullWidth
              />
              <ToggleButtonGroup
                exclusive
                value={visibility}
                onChange={(_, value) => value && setVisibility(value)}
                size="small"
              >
                <ToggleButton value="개인">개인</ToggleButton>
                <ToggleButton value="전체공개">전체공개</ToggleButton>
              </ToggleButtonGroup>
            </Box>
          </Collapse>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose}>취소</Button>
        <Button variant="contained" onClick={handleSave} disabled={!canSave || saving}>등록</Button>
      </DialogActions>
    </Dialog>
  )
}
