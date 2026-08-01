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
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import FormControlLabel from '@mui/material/FormControlLabel'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined'
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

// 상단 막대 높이. 설정 패널을 화면에 붙일 때 남은 세로 공간을 계산하는 데 쓴다.
const TOPBAR_HEIGHT = 66

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function shiftDays(n) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return ymd(d)
}

/** 다음 금요일. 오늘이 금요일이면 이번 주가 아니라 다음 주를 준다. */
function comingFriday() {
  const d = new Date()
  d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7 || 7))
  return ymd(d)
}

const DUE_PRESETS = [
  { label: '오늘', get: () => shiftDays(0) },
  { label: '내일', get: () => shiftDays(1) },
  { label: '금요일', get: comingFriday },
  { label: '1주 뒤', get: () => shiftDays(7) },
]

/** 마감일까지 며칠 남았는지. 날짜만 보고는 감이 안 와서 옆에 붙여둔다. */
function dueLabel(value) {
  if (!value) return '없음'
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const due = new Date(`${value}T00:00:00`)
  const days = Math.round((due - today) / 86400000)
  if (days === 0) return '오늘'
  if (days < 0) return `${-days}일 지남`
  return `${days}일 뒤`
}

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

  // 보내기가 막혀 있으면 왜 막혔는지 단추 바로 위에 적는다
  const blockReason = !title.trim() ? '제목을 입력해 주세요'
    : targets.length === 0 ? '조건에 맞는 대상이 없습니다'
    : null

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

        {/* 오른쪽 — 보낼 설정.
            설정이 길어져도 보내기 단추는 늘 보여야 한다. 패널을 화면에 붙여두고(sticky)
            안쪽만 스크롤시킨 뒤, 단추는 스크롤 밖 맨 아래에 고정한다. */}
        <Box sx={{
          flex: '0 1 300px', minWidth: 262,
          position: 'sticky', top: 0,
          maxHeight: `calc(100vh - ${TOPBAR_HEIGHT + 32}px)`,
          display: 'flex', flexDirection: 'column',
          border: '1px solid', borderColor: 'divider', borderRadius: 1.25,
          bgcolor: 'background.default',
          overflow: 'hidden',
        }}>
          <Box sx={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', p: 1.5 }}>
            {loading
              ? <Typography color="text.secondary" fontSize="0.85rem">구성원 불러오는 중…</Typography>
              : <TargetPicker members={members} value={rule} onChange={setRule} />}

            <Divider sx={{ my: 1.5 }} />

            <PanelLabel>보내는 방식</PanelLabel>
            <SegChoice
              value={needsCompletion ? 'request' : 'notice'}
              onChange={v => setNeedsCompletion(v === 'request')}
              options={[
                { value: 'request', label: '요청', Icon: CheckCircleOutlineIcon },
                { value: 'notice', label: '안내', Icon: CampaignOutlinedIcon },
              ]}
            />
            <Typography fontSize="0.76rem" color="text.secondary" sx={{ mt: 0.7 }}>
              {needsCompletion
                ? '받는 분의 할 일 목록에 남고, 누가 했는지 집계됩니다.'
                : '읽으면 끝나는 안내입니다. 완료를 확인하지 않습니다.'}
            </Typography>

            <Divider sx={{ my: 1.5 }} />

            {needsCompletion ? (
              <>
                <PanelLabel hint={dueLabel(dueDate)}>마감일</PanelLabel>
                <TextField
                  type="date" size="small" fullWidth
                  value={dueDate} onChange={e => setDueDate(e.target.value)}
                  inputProps={{ style: { fontSize: '0.85rem' } }}
                />
                {/* 학교 마감은 대개 '이번 주 금요일' 같은 말로 정해진다. 달력을 열어
                    날짜를 세는 대신 바로 찍을 수 있게 둔다. */}
                <Box sx={{ display: 'flex', gap: 0.5, mt: 0.7, flexWrap: 'wrap' }}>
                  {DUE_PRESETS.map(p => (
                    <Chip
                      key={p.label} size="small" variant="outlined" label={p.label}
                      onClick={() => setDueDate(p.get())}
                      sx={{ fontSize: '0.74rem', height: 24 }}
                    />
                  ))}
                  {dueDate && (
                    <Chip
                      size="small" variant="outlined" label="지우기"
                      onClick={() => setDueDate('')}
                      sx={{ fontSize: '0.74rem', height: 24, color: 'text.secondary' }}
                    />
                  )}
                </Box>
              </>
            ) : (
              <FormControlLabel
                sx={{ display: 'block', ml: -0.5 }}
                control={<Checkbox size="small" checked={pinned} onChange={e => setPinned(e.target.checked)} />}
                label={<Typography fontSize="0.85rem">목록 맨 위에 고정</Typography>}
              />
            )}
          </Box>

          {/* 스크롤 밖 — 늘 보이는 자리 */}
          <Box sx={{ flexShrink: 0, borderTop: '1px solid', borderColor: 'divider', p: 1.25 }}>
            {blockReason && (
              <Typography fontSize="0.76rem" color="text.secondary" sx={{ mb: 0.7, textAlign: 'center' }}>
                {blockReason}
              </Typography>
            )}
            <Button fullWidth variant="contained" onClick={handleSave} disabled={!canSave}>
              {targets.length > 0
                ? `${targets.length}명에게 ${needsCompletion ? '요청' : '안내'} 보내기`
                : '보내기'}
            </Button>
            <Button fullWidth size="small" onClick={discardAndLeave} sx={{ mt: 0.4 }}>취소</Button>
          </Box>
        </Box>
      </Box>
    </WorkspaceLayout>
  )
}

/** 설정 패널의 구역 제목. TargetPicker의 '대상 … 59 명' 머리와 같은 모양으로 맞춘다. */
function PanelLabel({ children, hint }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, mb: 0.8 }}>
      <Typography fontSize="0.85rem" fontWeight={700} sx={{ flexGrow: 1 }}>{children}</Typography>
      {hint && <Typography fontSize="0.78rem" color="text.secondary">{hint}</Typography>}
    </Box>
  )
}

/**
 * 둘 중 하나 고르기.
 *
 * 체크상자로 두면 "완료 확인 받기"를 껐을 때 무엇이 되는지가 안 보인다. 요청과 안내를
 * 나란히 놓아 지금 어느 쪽으로 나가는지 한눈에 보이게 한다.
 */
function SegChoice({ value, onChange, options }) {
  return (
    <Box sx={{ display: 'flex', gap: 0.4, p: 0.4, borderRadius: 1, bgcolor: 'action.hover' }}>
      {options.map(o => {
        const on = o.value === value
        return (
          <Box
            key={o.value} component="button" type="button"
            onClick={() => onChange(o.value)}
            sx={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5,
              border: 0, borderRadius: 0.75, py: 0.7, cursor: 'pointer',
              fontFamily: 'inherit', fontSize: '0.83rem',
              fontWeight: on ? 700 : 500,
              bgcolor: on ? 'background.paper' : 'transparent',
              boxShadow: on ? 1 : 0,
              color: on ? 'primary.main' : 'text.secondary',
            }}
          >
            <o.Icon sx={{ fontSize: 16 }} />{o.label}
          </Box>
        )
      })}
    </Box>
  )
}
