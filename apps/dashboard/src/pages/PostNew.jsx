/**
 * 업무 글 쓰기 — 안내(공지)와 요청을 한 화면에서.
 *
 * 왼쪽은 글, 오른쪽은 보낼 설정으로 나눈다. 세로로 쭉 쌓아두니 대상을 고르려면 본문을
 * 지나쳐 한참 내려가야 했고, 조건을 바꾸며 명단을 확인하는 동안 제목이 보이지 않았다.
 * 둘은 오가며 손보는 것이라 나란히 있어야 한다.
 *
 * 노트북 화면(1366×768)을 기준으로 잡았다. 오른쪽 칸은 300px 안팎으로 두고 남는 폭은
 * 전부 본문에 준다. 좁아지면 설정이 본문 아래로 내려간다.
 *
 * 안내와 요청을 따로 만들지 않는 이유: 필요한 것이 제목·내용·자료·대상까지 똑같고
 * 다른 건 "완료 확인을 받느냐" 하나뿐이다. 쓰는 사람은 "공지냐 요청이냐"가 아니라
 * "이거 확인받아야 하나"만 판단하면 된다.
 *
 * 문서 ID를 화면에 들어올 때 미리 만들어 두는 이유는 첨부와 본문 이미지 때문이다.
 * 둘 다 고르는 즉시 schools/{schoolId}/requests/{requestId}/ 아래로 올라가야 하는데,
 * 저장 시점에 ID를 만들면 그 전에 올린 파일의 경로를 정할 수 없다.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, doc, serverTimestamp, setDoc } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Divider from '@mui/material/Divider'
import FormControlLabel from '@mui/material/FormControlLabel'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, schoolPath } from '@shared/lib/schema'
import { describeRule, resolveTargets } from '@shared/lib/targeting'
import { newRequestPayload } from '@shared/lib/workRequests'
import { deleteAttachment } from '@shared/lib/requestAttachments'
import { htmlToText, sanitizeHtml } from '@shared/lib/richText'
import WorkspaceLayout from '../components/WorkspaceLayout'
import TargetPicker from '../components/TargetPicker'
import AttachmentPicker from '../components/AttachmentPicker'
import RichTextEditor from '../components/RichTextEditor'
import { useToast } from '../components/ToastProvider'
import useSchoolMembers from '../lib/useSchoolMembers'

const EMPTY_RULE = { conditions: [], includeUids: [], excludeUids: [] }

export default function PostNew() {
  const { user, userName, schoolId } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const { members, loading, error } = useSchoolMembers()

  const requestId = useMemo(
    () => (schoolId ? doc(collection(db, ...schoolPath(schoolId, COL.REQUESTS))).id : null),
    [schoolId],
  )

  const [title, setTitle] = useState('')
  const [bodyHtml, setBodyHtml] = useState('')
  const [needsCompletion, setNeedsCompletion] = useState(true)
  const [pinned, setPinned] = useState(false)
  const [dueDate, setDueDate] = useState('')
  const [rule, setRule] = useState(EMPTY_RULE)
  const [attachments, setAttachments] = useState([])
  const [bodyImages, setBodyImages] = useState([])   // 본문에 넣은 이미지 (버릴 때 정리용)
  const [links, setLinks] = useState([])
  const [saving, setSaving] = useState(false)

  const targets = useMemo(() => resolveTargets(rule, members).members, [rule, members])
  const canSave = title.trim() && targets.length > 0 && !saving

  /**
   * 취소하면 이미 올라간 파일을 지운다.
   *
   * 첨부와 본문 이미지는 문서를 저장하기 전에 업로드된다(경로에 문서 ID가 필요해서).
   * 쓰다가 그만두면 아무도 참조하지 않는 파일이 저장소에 남는다. 나가는 길에 치운다.
   */
  const discardAndLeave = async () => {
    const uploaded = [...attachments, ...bodyImages]
    setAttachments([])
    setBodyImages([])
    navigate('/requests')
    await Promise.all(uploaded.map(a => deleteAttachment(a).catch(() => {})))
  }

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      const safeHtml = sanitizeHtml(bodyHtml)
      await setDoc(doc(db, ...schoolPath(schoolId, COL.REQUESTS), requestId), {
        ...newRequestPayload({
          kind: needsCompletion ? 'request' : 'notice',
          title,
          // 본문은 서식 있는 HTML로 저장하고, 목록·미리보기용 평문을 함께 둔다
          description: htmlToText(safeHtml),
          dueDate: dueDate ? new Date(dueDate) : null,
          pinned,
          attachments,
          links,
          targetRule: rule,
          targetRuleText: describeRule(rule),
          targets,
          createdBy: user.uid,
          createdByName: userName,
        }),
        bodyHtml: safeHtml,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      toast.success(`${targets.length}명에게 ${needsCompletion ? '요청을' : '안내를'} 보냈습니다.`)
      navigate(`/requests/${requestId}`)
    } catch (e) {
      toast.error('글을 보내지 못했습니다.', e)
    } finally {
      setSaving(false)
    }
  }

  if (error) {
    return (
      <WorkspaceLayout>
        <Typography color="error" sx={{ p: 2.5 }}>구성원 정보를 불러오지 못했습니다. 새로고침해 주세요.</Typography>
      </WorkspaceLayout>
    )
  }

  return (
    <WorkspaceLayout>
      <Box sx={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start',
        gap: 2, p: 2, maxWidth: 1240,
      }}>
        {/* 왼쪽 — 글 */}
        <Box sx={{ flex: '1 1 440px', minWidth: 0 }}>
          <TextField
            fullWidth autoFocus variant="standard"
            placeholder="제목"
            value={title} onChange={e => setTitle(e.target.value)}
            inputProps={{ style: { fontSize: '1.1rem', fontWeight: 700 } }}
            sx={{ mb: 1.5 }}
          />

          <RichTextEditor
            requestId={requestId}
            value={bodyHtml}
            onChange={setBodyHtml}
            onImageUploaded={img => setBodyImages(prev => [...prev, img])}
            placeholder="무엇을 어떻게 하면 되는지 적어주세요. 이미지는 붙여넣거나 끌어다 놓으면 됩니다."
          />

          <Box sx={{ mt: 1.5 }}>
            <AttachmentPicker
              requestId={requestId}
              attachments={attachments}
              links={links}
              onChange={({ attachments: a, links: l }) => { setAttachments(a); setLinks(l) }}
            />
          </Box>
        </Box>

        {/* 오른쪽 — 보낼 설정 */}
        <Box sx={{
          flex: '0 1 300px', minWidth: 262,
          border: '1px solid', borderColor: 'divider', borderRadius: 1.25,
          bgcolor: 'background.default',
          p: 1.5,
        }}>
          {loading
            ? <Typography color="text.secondary" fontSize="0.85rem">구성원 불러오는 중…</Typography>
            : <TargetPicker members={members} value={rule} onChange={setRule} />}

          <Divider sx={{ my: 1.75 }} />

          <FormControlLabel
            control={<Checkbox size="small" checked={needsCompletion} onChange={e => setNeedsCompletion(e.target.checked)} />}
            label={<Typography fontSize="0.85rem" fontWeight={700}>완료 확인 받기</Typography>}
          />
          <Typography fontSize="0.76rem" color="text.secondary" sx={{ ml: 3.7, mt: -0.5 }}>
            {needsCompletion
              ? '받는 분의 할 일 목록에 남고, 누가 했는지 집계됩니다.'
              : '읽으면 끝나는 안내입니다. 완료를 확인하지 않습니다.'}
          </Typography>

          {needsCompletion ? (
            <TextField
              label="마감일" type="date" size="small" fullWidth
              InputLabelProps={{ shrink: true }}
              value={dueDate} onChange={e => setDueDate(e.target.value)}
              sx={{ mt: 1.5 }}
            />
          ) : (
            <FormControlLabel
              sx={{ mt: 0.5, display: 'block' }}
              control={<Checkbox size="small" checked={pinned} onChange={e => setPinned(e.target.checked)} />}
              label={<Typography fontSize="0.85rem">목록 맨 위에 고정</Typography>}
            />
          )}

          <Divider sx={{ my: 1.75 }} />

          <Button fullWidth variant="contained" onClick={handleSave} disabled={!canSave}>
            {targets.length > 0 ? `${targets.length}명에게 보내기` : '보내기'}
          </Button>
          <Button fullWidth onClick={discardAndLeave} sx={{ mt: 0.5 }}>취소</Button>

          {!title.trim() && (
            <Typography fontSize="0.76rem" color="text.disabled" sx={{ mt: 1, textAlign: 'center' }}>
              제목을 입력해야 보낼 수 있습니다
            </Typography>
          )}
        </Box>
      </Box>
    </WorkspaceLayout>
  )
}
