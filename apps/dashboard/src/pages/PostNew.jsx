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
 *
 * 쓰기와 고치기를 한 화면이 겸한다(`/requests/:requestId/edit`). 오타 하나에도 글을 지우고
 * 다시 써야 했는데, 그러면 주소가 바뀌어 쿨메신저에 뿌린 링크가 죽고 완료 기록도 날아간다.
 * 고칠 때 건드리지 않는 것은 완료 명단·상태·글쓴이 세 가지다 (handleSave 참고).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { collection, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
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
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, schoolPath } from '@shared/lib/schema'
import { describeRule, resolveTargets } from '@shared/lib/targeting'
import { isRequest, newRequestPayload } from '@shared/lib/workRequests'
import { deleteAttachment } from '@shared/lib/requestAttachments'
import { htmlToText, sanitizeHtml } from '@shared/lib/richText'
import WorkspaceLayout from '../components/WorkspaceLayout'
import TargetPicker from '../components/TargetPicker'
import AttachmentPicker from '../components/AttachmentPicker'
import RichTextEditor from '../components/RichTextEditor'
import { useToast } from '../components/ToastProvider'
import useSchoolMembers from '../lib/useSchoolMembers'
import useChannels from '../lib/useChannels'
import { updatePostContent } from '../lib/requestActions'

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
  const { requestId: editingId } = useParams()
  const isEdit = !!editingId
  const [searchParams] = useSearchParams()
  const toast = useToast()
  const { members, loading, error } = useSchoolMembers()
  const { channels } = useChannels()

  // 새 글은 첨부 경로에 쓸 ID를 미리 만들고, 고칠 때는 이미 있는 문서를 그대로 쓴다
  const draftId = useMemo(
    () => (schoolId && !editingId ? doc(collection(db, ...schoolPath(schoolId, COL.REQUESTS))).id : null),
    [schoolId, editingId],
  )
  const requestId = editingId || draftId

  const [title, setTitle] = useState('')
  const [bodyHtml, setBodyHtml] = useState('')
  const [needsCompletion, setNeedsCompletion] = useState(true)
  const [pinned, setPinned] = useState(false)
  const [dueDate, setDueDate] = useState('')
  const [rule, setRule] = useState(EMPTY_RULE)
  const [channelId, setChannelId] = useState(searchParams.get('channel') || '')
  const [attachments, setAttachments] = useState([])
  const [bodyImages, setBodyImages] = useState([])   // 본문에 넣은 이미지 (버릴 때 정리용)
  const [links, setLinks] = useState([])
  const [saving, setSaving] = useState(false)
  const [loadingPost, setLoadingPost] = useState(isEdit)

  // 고치기를 시작한 시점에 이미 붙어 있던 파일. 도중에 그만둬도 이건 지우면 안 된다.
  const keptFiles = useRef(new Set())

  const channel = useMemo(() => channels.find(c => c.id === channelId) || null, [channels, channelId])

  /**
   * 고칠 글을 한 번만 읽어온다.
   *
   * onSnapshot으로 구독하지 않는 이유: 쓰는 도중에 서버 값이 들어오면 방금 친 내용이
   * 덮인다. 같은 글을 둘이 동시에 고치는 일은 학교에서 사실상 없고, 있어도 나중에 저장한
   * 쪽이 남는 편이 예측 가능하다.
   */
  useEffect(() => {
    if (!isEdit || !schoolId) return
    let alive = true
    getDoc(doc(db, ...schoolPath(schoolId, COL.REQUESTS), editingId))
      .then(snap => {
        if (!alive) return
        if (!snap.exists()) {
          toast.error('글을 찾을 수 없습니다. 삭제되었을 수 있습니다.')
          navigate('/requests')
          return
        }
        const post = snap.data()
        setTitle(post.title || '')
        setBodyHtml(post.bodyHtml || '')
        setNeedsCompletion(isRequest(post))
        setPinned(!!post.pinned)
        setDueDate(post.dueDate?.toDate ? ymd(post.dueDate.toDate()) : '')
        setRule(post.targetRule || EMPTY_RULE)
        setChannelId(post.channelId || '')
        setAttachments(post.attachments || [])
        setLinks(post.links || [])
        keptFiles.current = new Set((post.attachments || []).map(a => a.path))
        setLoadingPost(false)
      })
      .catch(e => {
        if (!alive) return
        toast.error('글을 불러오지 못했습니다.', e)
        setLoadingPost(false)
      })
    return () => { alive = false }
  }, [isEdit, schoolId, editingId, navigate, toast])

  /**
   * 채널을 고르면 대상을 그 채널의 참여자 조건으로 채운다. 채널에 쓰는 글은 대개 채널
   * 전원에게 가는데, 조건을 처음부터 다시 짜게 하면 채널을 고른 의미가 없다. 채운 뒤에는
   * 그대로 편집할 수 있다 — 채널 안에서 일부에게만 보낼 때가 있다.
   */
  const pickChannel = (id) => {
    setChannelId(id)
    const picked = channels.find(c => c.id === id)
    if (picked?.memberRule) setRule(picked.memberRule)
  }

  // 주소로 채널을 지정해 들어온 새 글(`?channel=…`)도 같게 채운다. 채널 목록이 늦게 도착하므로
  // 그때 한 번만 적용한다. 고치는 중에는 하지 않는다 — 저장된 대상을 덮어쓰면 안 된다.
  const [presetDone, setPresetDone] = useState(isEdit || !searchParams.get('channel'))
  useEffect(() => {
    if (presetDone || !channel?.memberRule) return
    setRule(channel.memberRule)
    setPresetDone(true)
  }, [channel, presetDone])

  const targets = useMemo(() => resolveTargets(rule, members).members, [rule, members])
  const canSave = title.trim() && targets.length > 0 && !saving && !loadingPost

  // 보내기가 막혀 있으면 왜 막혔는지 단추 바로 위에 적는다
  const blockReason = !title.trim() ? '제목을 입력해 주세요'
    : targets.length === 0 ? '조건에 맞는 대상이 없습니다'
    : null

  /**
   * 취소하면 이번에 올린 파일을 지운다.
   *
   * 첨부와 본문 이미지는 문서를 저장하기 전에 업로드된다(경로에 문서 ID가 필요해서).
   * 쓰다가 그만두면 아무도 참조하지 않는 파일이 저장소에 남는다. 나가는 길에 치운다.
   *
   * 고치는 중이라면 원래 붙어 있던 파일(keptFiles)은 건드리지 않는다 — 저장을 안 했으니
   * 글에는 그대로 붙어 있고, 여기서 지우면 멀쩡한 글의 첨부가 깨진다.
   */
  const discardAndLeave = async () => {
    const uploaded = [...attachments, ...bodyImages].filter(a => !keptFiles.current.has(a.path))
    setAttachments([])
    setBodyImages([])
    navigate(
      isEdit
        ? (channelId ? `/channels/${channelId}/${editingId}` : `/requests/${editingId}`)
        : (channelId ? `/channels/${channelId}` : '/requests'),
    )
    await Promise.all(uploaded.map(a => deleteAttachment(a).catch(() => {})))
  }

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      const safeHtml = sanitizeHtml(bodyHtml)
      const payload = newRequestPayload({
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
      })

      if (isEdit) {
        // 고칠 때 넘기지 않는 셋 — completedUids(이미 한 사람의 기록), status(마감 여부),
        // createdBy/createdByName(글쓴이). 관리자가 남의 글을 손봐도 글쓴이가 바뀌면 안 되고,
        // 마감한 요청이 오타 수정만으로 다시 열려서도 안 된다.
        await updatePostContent({
          schoolId,
          requestId,
          patch: {
            kind: payload.kind,
            title: payload.title,
            description: payload.description,
            dueDate: payload.dueDate,
            pinned: payload.pinned,
            attachments: payload.attachments,
            links: payload.links,
            targetRule: payload.targetRule,
            targetRuleText: payload.targetRuleText,
            targetUids: payload.targetUids,
            targetNames: payload.targetNames,
            bodyHtml: safeHtml,
            channelId: channelId || null,
          },
        })
        // 고치면서 뺀 첨부는 이제서야 지운다 (AttachmentPicker의 deferRemove 참고)
        const kept = new Set(attachments.map(a => a.path))
        await Promise.all([...keptFiles.current]
          .filter(path => !kept.has(path))
          .map(path => deleteAttachment({ path }).catch(() => {})))
        toast.success('수정한 내용을 저장했습니다.')
      } else {
        await setDoc(doc(db, ...schoolPath(schoolId, COL.REQUESTS), requestId), {
          ...payload,
          bodyHtml: safeHtml,
          channelId: channelId || null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
        toast.success(`${targets.length}명에게 ${needsCompletion ? '요청을' : '안내를'} 보냈습니다.`)
      }
      navigate(channelId ? `/channels/${channelId}/${requestId}` : `/requests/${requestId}`)
    } catch (e) {
      toast.error(isEdit ? '수정 내용을 저장하지 못했습니다.' : '글을 보내지 못했습니다.', e)
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

  // 고칠 글을 읽기 전에 빈 칸을 보여주면 방금 쓴 글이 날아간 것처럼 보인다
  if (loadingPost) {
    return (
      <WorkspaceLayout>
        <Typography color="text.secondary" sx={{ p: 2.5 }}>글을 불러오는 중…</Typography>
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
            docId={requestId}
            value={bodyHtml}
            onChange={setBodyHtml}
            onImageUploaded={img => setBodyImages(prev => [...prev, img])}
            placeholder="무엇을 어떻게 하면 되는지 적어주세요. 이미지는 붙여넣거나 끌어다 놓으면 됩니다."
          />

          <Box sx={{ mt: 1.5 }}>
            <AttachmentPicker
              requestId={requestId}
              deferRemove={isEdit}
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
            <PanelLabel>채널</PanelLabel>
            <Select
              size="small" fullWidth displayEmpty
              value={channels.some(c => c.id === channelId) ? channelId : ''}
              onChange={e => pickChannel(e.target.value)}
              sx={{ fontSize: '0.83rem', mb: 0.6 }}
            >
              <MenuItem value="" sx={{ fontSize: '0.85rem' }}>채널 없음</MenuItem>
              {channels.map(c => (
                <MenuItem key={c.id} value={c.id} sx={{ fontSize: '0.85rem' }}>{c.name}</MenuItem>
              ))}
            </Select>
            <Typography fontSize="0.76rem" color="text.secondary">
              {channelId
                ? '채널에 쌓여 이어지는 업무로 볼 수 있습니다.'
                : '채널을 고르면 그 채널 참여자가 대상으로 채워집니다.'}
            </Typography>

            <Divider sx={{ my: 1.5 }} />

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
              {isEdit
                ? '수정한 내용 저장'
                : targets.length > 0
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
