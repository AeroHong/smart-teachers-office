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
import { useToast } from './ToastProvider'

const STAFF_ROLES = ['teacher', 'admin', 'school_admin', 'principal']

/** 답장 제목은 한 번만 'Re: '를 붙인다 (Re: Re: 가 쌓이지 않게). */
function replyTitle(title = '') {
  return title.startsWith('Re: ') ? title : `Re: ${title}`
}

/**
 * @param {object} [replyTo] 답장 대상 쪽지. 있으면 받는 사람과 제목을 미리 채운다.
 * @param {object} [presetRecipient] { uid, name } — 명단에서 이름을 눌러 열었을 때 받는 사람
 */
export default function NoticeComposeModal({ open, onClose, replyTo, presetRecipient }) {
  const { user, userName, schoolId } = useAuth()
  const toast = useToast()
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
          .filter(s => s.uid !== user?.uid)
          .sort((a, b) => a.name.localeCompare(b.name, 'ko')),
      ))
      .catch(e => toast.error('구성원 목록을 불러오지 못했습니다.', e))
  }, [open, schoolId, user, toast])

  // 답장이면 받는 사람·제목까지, 명단에서 열었으면 받는 사람만 채운다
  useEffect(() => {
    if (!open) return
    if (replyTo) {
      setRecipient({ uid: replyTo.senderUid, name: replyTo.senderName })
      setTitle(replyTitle(replyTo.title))
    } else {
      setRecipient(presetRecipient ? { uid: presetRecipient.uid, name: presetRecipient.name } : null)
      setTitle('')
    }
    setContent('')
  }, [open, replyTo, presetRecipient])

  const canSave = recipient && title.trim() && content.trim()

  const handleSave = async () => {
    if (!canSave || saving) return
    setSaving(true)
    try {
      await addDoc(collection(db, ...schoolPath(schoolId, COL.PERSONAL_NOTICES)), {
        senderUid: user.uid,
        senderName: userName,
        recipientUid: recipient.uid,
        // 보낸함에서 받는 사람을 보여주려면 이름이 필요하다 (발신 시점 스냅샷)
        recipientName: recipient.name,
        title: title.trim(),
        content: content.trim(),
        readAt: null,
        createdAt: serverTimestamp(),
      })
      toast.success(`${recipient.name} 님에게 쪽지를 보냈습니다.`)
      onClose()
    } catch (e) {
      toast.error('쪽지를 보내지 못했습니다. 잠시 후 다시 시도해 주세요.', e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{replyTo ? '답장 보내기' : '쪽지 보내기'}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 1 }}>
          <Autocomplete
            options={staff}
            getOptionLabel={o => o.name}
            isOptionEqualToValue={(a, b) => a.uid === b.uid}
            value={recipient}
            onChange={(_, value) => setRecipient(value)}
            renderInput={params => (
              <TextField {...params} label="받는 사람" required autoFocus={!replyTo && !presetRecipient} />
            )}
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
            autoFocus={!!replyTo || !!presetRecipient}
          />
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>취소</Button>
        <Button variant="contained" onClick={handleSave} disabled={!canSave || saving}>보내기</Button>
      </DialogActions>
    </Dialog>
  )
}
