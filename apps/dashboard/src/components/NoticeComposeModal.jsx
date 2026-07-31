import { useEffect, useState } from 'react'
import { addDoc, collection, getDocs, query, serverTimestamp, where } from 'firebase/firestore'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import Autocomplete from '@mui/material/Autocomplete'
import Button from '@mui/material/Button'
import Box from '@mui/material/Box'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, USERS, schoolPath } from '@shared/lib/schema'

const STAFF_ROLES = ['teacher', 'admin', 'school_admin', 'principal']

export default function NoticeComposeModal({ open, onClose }) {
  const { user, userName, schoolId } = useAuth()
  const [staff, setStaff] = useState([])
  const [recipient, setRecipient] = useState(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open || !schoolId) return
    getDocs(query(collection(db, USERS), where('schoolId', '==', schoolId), where('role', 'in', STAFF_ROLES)))
      .then(snap => setStaff(
        snap.docs
          .map(d => ({ uid: d.id, name: d.data().name || d.data().email }))
          .filter(s => s.uid !== user?.uid),
      ))
      .catch(e => console.error('구성원 조회 실패:', e))
  }, [open, schoolId, user])

  const reset = () => { setRecipient(null); setTitle(''); setContent('') }
  const handleClose = () => { reset(); onClose() }
  const canSave = recipient && title.trim() && content.trim()

  const handleSave = async () => {
    if (!canSave || saving) return
    setSaving(true)
    try {
      await addDoc(collection(db, ...schoolPath(schoolId, COL.PERSONAL_NOTICES)), {
        senderUid: user.uid,
        senderName: userName,
        recipientUid: recipient.uid,
        title: title.trim(),
        content: content.trim(),
        readAt: null,
        createdAt: serverTimestamp(),
      })
      handleClose()
    } catch (e) {
      console.error('쪽지 전송 실패:', e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle>쪽지 보내기</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 1 }}>
          <Autocomplete
            options={staff}
            getOptionLabel={o => o.name}
            isOptionEqualToValue={(a, b) => a.uid === b.uid}
            value={recipient}
            onChange={(_, value) => setRecipient(value)}
            renderInput={params => <TextField {...params} label="받는 사람" required autoFocus />}
          />
          <TextField
            label="제목"
            value={title}
            onChange={e => setTitle(e.target.value)}
            required
            fullWidth
          />
          <TextField
            label="내용"
            value={content}
            onChange={e => setContent(e.target.value)}
            required
            multiline
            minRows={3}
            fullWidth
          />
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose}>취소</Button>
        <Button variant="contained" onClick={handleSave} disabled={!canSave || saving}>보내기</Button>
      </DialogActions>
    </Dialog>
  )
}
