/**
 * 쪽지 쓰기.
 *
 * 업무 글쓰기와 같은 편집기를 쓴다. 쪽지라고 서식이 필요 없는 것이 아니다 — 절차를
 * 번호로 적거나 표를 캡처해 붙이는 일이 오히려 쪽지 쪽에서 더 잦고, 평문 상자에 적으면
 * 결국 "자세한 건 쿨메신저로 보내드릴게요"가 된다.
 *
 * 여러 명에게 한 번에 보낼 수 있다. 받는 사람마다 문서를 따로 만들고 batchId로 묶는다
 * (personalNotices.js 참고). 이미지는 묶음 ID 아래로 올라가므로 화면에 들어올 때 ID를
 * 미리 만들어 둔다 — 저장 시점에 만들면 그 전에 올린 이미지의 경로를 정할 수 없다.
 */
import { useEffect, useMemo, useState } from 'react'
import { collection, doc, getDocs, query, serverTimestamp, where, writeBatch } from 'firebase/firestore'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import Autocomplete from '@mui/material/Autocomplete'
import Button from '@mui/material/Button'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Typography from '@mui/material/Typography'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, USERS, schoolPath } from '@shared/lib/schema'
import { htmlToText, isEmptyHtml, sanitizeHtml } from '@shared/lib/richText'
import { deleteAttachment } from '@shared/lib/requestAttachments'
import { NOTICE_TITLE_MAX, newNoticePayload, replyTitle, validateNotice } from '@shared/lib/personalNotices'
import RichTextEditor from './RichTextEditor'
import AttachmentPicker from './AttachmentPicker'
import { useToast } from './ToastProvider'

const STAFF_ROLES = ['teacher', 'admin', 'school_admin', 'principal']

/**
 * @param {object} [replyTo] 답장 대상 쪽지. 있으면 받는 사람과 제목을 미리 채운다.
 * @param {Array}  [presetRecipients] [{ uid, name }] — 명단에서 골라 열었을 때 받는 사람들
 */
export default function NoticeComposeModal({ open, onClose, replyTo, presetRecipients }) {
  const { user, userName, schoolId } = useAuth()
  const toast = useToast()
  const [staff, setStaff] = useState([])
  const [recipients, setRecipients] = useState([])
  const [title, setTitle] = useState('')
  const [bodyHtml, setBodyHtml] = useState('')
  const [attachments, setAttachments] = useState([])
  const [bodyImages, setBodyImages] = useState([])   // 본문에 넣은 이미지 (버릴 때 정리용)
  const [links, setLinks] = useState([])
  const [saving, setSaving] = useState(false)

  // 이미지 경로에 쓸 묶음 ID. 화면을 열 때마다 새로 잡아야 취소한 쪽지의 이미지와
  // 다음에 쓰는 쪽지의 이미지가 한 폴더에 섞이지 않는다.
  const [batchId, setBatchId] = useState(null)
  useEffect(() => {
    if (open && schoolId) {
      setBatchId(doc(collection(db, ...schoolPath(schoolId, COL.PERSONAL_NOTICES))).id)
    }
  }, [open, schoolId])

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

  // 답장이면 받는 사람·제목까지, 명단에서 열었으면 받는 사람만 채운다.
  //
  // presetRecipients를 의존성에 넣지 않는 이유: 부모가 매번 새 배열을 넘기면 이 효과가
  // 계속 다시 돌아 쓰던 내용을 지운다. 창이 열리는 순간의 값만 쓰면 충분하다.
  useEffect(() => {
    if (!open) return
    if (replyTo) {
      setRecipients([{ uid: replyTo.senderUid, name: replyTo.senderName }])
      setTitle(replyTitle(replyTo.title))
    } else {
      setRecipients(presetRecipients || [])
      setTitle('')
    }
    setBodyHtml('')
    setAttachments([])
    setBodyImages([])
    setLinks([])
  }, [open, replyTo])   // eslint-disable-line react-hooks/exhaustive-deps

  const bodyText = useMemo(() => (isEmptyHtml(bodyHtml) ? '' : htmlToText(bodyHtml)), [bodyHtml])
  const blockReason = validateNotice({ recipients, title, bodyText })
  const canSave = !blockReason && !saving && !!batchId

  /** 취소하면 이미 올라간 파일을 지운다. 아무도 참조하지 않는 파일이 저장소에 남는다. */
  const discardAndClose = async () => {
    const uploaded = [...attachments, ...bodyImages]
    setAttachments([])
    setBodyImages([])
    onClose()
    await Promise.all(uploaded.map(a => deleteAttachment(a).catch(() => {})))
  }

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      const safeHtml = sanitizeHtml(bodyHtml)
      const base = collection(db, ...schoolPath(schoolId, COL.PERSONAL_NOTICES))

      // 받는 사람마다 문서 하나씩. 한 배치로 묶어 일부에게만 가는 일이 없게 한다.
      const batch = writeBatch(db)
      recipients.forEach(recipient => {
        batch.set(doc(base), {
          ...newNoticePayload({
            batchId,
            senderUid: user.uid,
            senderName: userName,
            recipient,
            recipientCount: recipients.length,
            title,
            bodyHtml: safeHtml,
            content: htmlToText(safeHtml),
          }),
          attachments,
          links,
          createdAt: serverTimestamp(),
        })
      })
      await batch.commit()

      toast.success(recipients.length === 1
        ? `${recipients[0].name} 님에게 쪽지를 보냈습니다.`
        : `${recipients.length}명에게 쪽지를 보냈습니다.`)
      onClose()
    } catch (e) {
      toast.error('쪽지를 보내지 못했습니다. 잠시 후 다시 시도해 주세요.', e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onClose={discardAndClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ fontSize: '1rem', fontWeight: 800, pb: 1 }}>
        {replyTo ? '답장 보내기' : '쪽지 보내기'}
      </DialogTitle>
      <DialogContent dividers>
        <Autocomplete
          multiple
          options={staff}
          getOptionLabel={o => o.name}
          isOptionEqualToValue={(a, b) => a.uid === b.uid}
          value={recipients}
          onChange={(_, value) => setRecipients(value)}
          disabled={!!replyTo}
          renderTags={(value, getTagProps) =>
            value.map((o, i) => {
              const { key, ...tagProps } = getTagProps({ index: i })
              return <Chip {...tagProps} key={o.uid} size="small" label={o.name} />
            })
          }
          renderInput={params => (
            <TextField
              {...params}
              size="small"
              label="받는 사람"
              placeholder={recipients.length === 0 ? '이름으로 찾기' : ''}
              autoFocus={!replyTo && !presetRecipients?.length}
            />
          )}
          sx={{ mb: 1.5 }}
        />

        <TextField
          fullWidth size="small" label="제목"
          value={title} onChange={e => setTitle(e.target.value)}
          inputProps={{ maxLength: NOTICE_TITLE_MAX }}
          autoFocus={!!replyTo || !!presetRecipients?.length}
          sx={{ mb: 1.5 }}
        />

        <RichTextEditor
          docId={batchId}
          folder="notices"
          value={bodyHtml}
          onChange={setBodyHtml}
          onImageUploaded={img => setBodyImages(prev => [...prev, img])}
          placeholder="내용을 적어주세요. 이미지는 붙여넣거나 끌어다 놓으면 됩니다."
        />

        <Box sx={{ mt: 1.5 }}>
          <AttachmentPicker
            requestId={batchId}
            folder="notices"
            attachments={attachments}
            links={links}
            onChange={({ attachments: a, links: l }) => { setAttachments(a); setLinks(l) }}
          />
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 2, py: 1.25 }}>
        {blockReason && (
          <Typography fontSize="0.78rem" color="text.secondary" sx={{ flexGrow: 1 }}>
            {blockReason}
          </Typography>
        )}
        <Button onClick={discardAndClose}>취소</Button>
        <Button variant="contained" onClick={handleSave} disabled={!canSave}>
          {recipients.length > 1 ? `${recipients.length}명에게 보내기` : '보내기'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
