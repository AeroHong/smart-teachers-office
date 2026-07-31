/**
 * 업무 요청 만들기.
 *
 * 게시판 글쓰기와 같은 순서로 둔다 — 제목 · 내용 · 자료를 쓰고, 그 아래에서 대상과 마감을
 * 정한다. 요청도 결국 "누구에게 보내는 글"이라 새로운 양식을 배울 이유가 없다.
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

export default function RequestNew() {
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
          title,
          description,
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
      toast.success(`${targets.length}명에게 요청을 보냈습니다.`)
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
        <Typography variant="h6" fontWeight={800} mb={2.5}>업무 요청 만들기</Typography>

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

          <TextField
            label="마감일" type="date" size="small"
            InputLabelProps={{ shrink: true }}
            value={dueDate} onChange={e => setDueDate(e.target.value)}
            sx={{ mt: 2.5, width: 200 }}
          />
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
