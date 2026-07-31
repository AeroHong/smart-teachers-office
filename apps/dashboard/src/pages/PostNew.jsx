/**
 * 업무 글 쓰기 — 안내(공지)와 요청을 한 화면에서.
 *
 * 게시판 글쓰기와 같은 순서로 둔다 — 제목 · 내용 · 자료를 쓰고, 그 아래에서 대상을 정한다.
 * 결국 "누구에게 보내는 글"이라 새로운 양식을 배울 이유가 없다.
 *
 * 안내와 요청을 따로 만들지 않는 이유: 필요한 것이 제목·내용·자료·대상까지 똑같고
 * 다른 건 "완료 확인을 받느냐" 하나뿐이다. 그래서 쓰는 사람은 "공지냐 요청이냐"가 아니라
 * "이거 확인받아야 하나"만 판단하면 된다. 그 체크를 켜야 마감일이 나타난다.
 *
 * 완료를 누가 표시할지는 묻지 않는다. 보통은 본인이 누르고, 안 누르는 사람은 담당자가
 * 확인해 채워 넣는다 — 둘 다 필요하므로 미리 고르게 할 이유가 없다.
 *
 * 문서 ID를 화면에 들어올 때 미리 만들어 두는 이유는 첨부 때문이다. 파일은 고르는 즉시
 * schools/{schoolId}/requests/{requestId}/ 아래로 올라가야 하는데, 저장 시점에 ID를
 * 만들면 그 전에 올린 파일의 경로를 정할 수 없다.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, doc, serverTimestamp, setDoc } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, schoolPath } from '@shared/lib/schema'
import { describeRule, resolveTargets } from '@shared/lib/targeting'
import { newRequestPayload } from '@shared/lib/workRequests'
import DashboardLayout from '../components/DashboardLayout'
import TargetPicker from '../components/TargetPicker'
import AttachmentPicker from '../components/AttachmentPicker'
import { useToast } from '../components/ToastProvider'
import useSchoolMembers from '../lib/useSchoolMembers'

const EMPTY_RULE = { conditions: [], includeUids: [], excludeUids: [] }

export default function PostNew() {
  const { user, userName, schoolId } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const { members, loading, error } = useSchoolMembers()

  // 첨부 경로에 쓸 문서 ID를 먼저 확보한다 (위 주석 참고)
  const requestId = useMemo(
    () => (schoolId ? doc(collection(db, ...schoolPath(schoolId, COL.REQUESTS))).id : null),
    [schoolId],
  )

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [needsCompletion, setNeedsCompletion] = useState(true)
  const [pinned, setPinned] = useState(false)
  const [dueDate, setDueDate] = useState('')
  const [rule, setRule] = useState(EMPTY_RULE)
  const [attachments, setAttachments] = useState([])
  const [links, setLinks] = useState([])
  const [saving, setSaving] = useState(false)

  const targets = useMemo(() => resolveTargets(rule, members).members, [rule, members])
  const canSave = title.trim() && targets.length > 0 && !saving

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      await setDoc(doc(db, ...schoolPath(schoolId, COL.REQUESTS), requestId), {
        ...newRequestPayload({
          kind: needsCompletion ? 'request' : 'notice',
          title,
          description,
          pinned,
          dueDate: dueDate ? new Date(dueDate) : null,
          attachments,
          links,
          targetRule: rule,
          targetRuleText: describeRule(rule),
          targets,
          createdBy: user.uid,
          createdByName: userName,
        }),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      toast.success(`${targets.length}명에게 ${needsCompletion ? '요청을' : '안내를'} 보냈습니다.`)
      navigate(`/requests/${requestId}`)
    } catch (e) {
      toast.error('요청을 만들지 못했습니다.', e)
    } finally {
      setSaving(false)
    }
  }

  if (error) {
    return (
      <DashboardLayout>
        <Typography color="error">구성원 정보를 불러오지 못했습니다. 새로고침해 주세요.</Typography>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <Box sx={{ maxWidth: 780, mx: 'auto' }}>
        <Typography variant="h6" fontWeight={800} mb={2.5}>글 쓰기</Typography>

        {/* 글쓰기 — 제목 · 내용 · 자료 */}
        <TextField
          fullWidth autoFocus variant="standard"
          placeholder="제목"
          value={title} onChange={e => setTitle(e.target.value)}
          inputProps={{ style: { fontSize: '1.15rem', fontWeight: 700 } }}
          sx={{ mb: 2 }}
        />
        <TextField
          fullWidth multiline minRows={8} variant="standard"
          placeholder="무엇을 어떻게 하면 되는지 적어주세요."
          value={description} onChange={e => setDescription(e.target.value)}
          InputProps={{ disableUnderline: true }}
          sx={{ mb: 2 }}
        />
        <AttachmentPicker
          requestId={requestId}
          attachments={attachments}
          links={links}
          onChange={({ attachments: a, links: l }) => { setAttachments(a); setLinks(l) }}
        />

        {/* 보내기 설정 — 누구에게, 언제까지 */}
        <Box sx={{
          mt: 4, p: 2.5, borderRadius: 3,
          border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper',
        }}>
          {loading
            ? <Typography color="text.secondary" fontSize="0.85rem">구성원 불러오는 중…</Typography>
            : <TargetPicker members={members} value={rule} onChange={setRule} />}

          <Box sx={{ mt: 2.5, pt: 2.5, borderTop: '1px solid', borderColor: 'divider' }}>
            <FormControlLabel
              control={<Checkbox checked={needsCompletion} onChange={e => setNeedsCompletion(e.target.checked)} />}
              label="완료 확인 받기"
            />
            <Typography fontSize="0.78rem" color="text.secondary" sx={{ ml: 4, mt: -0.5 }}>
              {needsCompletion
                ? '받는 분의 할 일 목록에 남고, 누가 했는지 집계됩니다.'
                : '읽으면 끝나는 안내입니다. 완료를 확인하지 않습니다.'}
            </Typography>

            {needsCompletion ? (
              <TextField
                label="마감일" type="date" size="small"
                InputLabelProps={{ shrink: true }}
                value={dueDate} onChange={e => setDueDate(e.target.value)}
                sx={{ mt: 2, width: 200, display: 'block' }}
              />
            ) : (
              <FormControlLabel
                sx={{ mt: 1, display: 'block' }}
                control={<Checkbox checked={pinned} onChange={e => setPinned(e.target.checked)} />}
                label="목록 맨 위에 고정"
              />
            )}
          </Box>
        </Box>

        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 2.5 }}>
          <Button onClick={() => navigate('/requests')}>취소</Button>
          <Button variant="contained" onClick={handleSave} disabled={!canSave}>
            {targets.length > 0 ? `${targets.length}명에게 보내기` : '보내기'}
          </Button>
        </Box>
      </Box>
    </DashboardLayout>
  )
}
