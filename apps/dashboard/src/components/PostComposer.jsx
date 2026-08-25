/**
 * 글쓰기·고치기 — 채널 3단 안에서 그대로 쓴다.
 *
 * 예전에는 `/requests/new`가 별도 페이지였다. 채널을 보다가 '글 쓰기'를 누르면 2단(채널
 * 목록)이 사라지고 3단이 전체 폭을 차지하는 화면으로 튀었다 — 쓰는 동안 어느 채널에
 * 쓰는 중인지, 그 채널에 무슨 말이 오갔는지가 화면에서 없어졌다. 그래서 여기서는 채널
 * 화면(Channels.jsx)의 3단 자리에 그대로 얹힌다(`PLAN_composer.md` §2).
 *
 * 채널을 고르는 화면이 아니다 — 채널은 이미 정해져 있다(부모가 넘겨주는 `channel`).
 * "채널 없음"과 채널 <Select>는 P3-A(모든 글이 채널을 갖는다) 이후로 뜻이 없어져 없앴다.
 * 글을 쓴 뒤 다른 채널로 옮길 일은 남아 있지만, 그건 쓰는 중이 아니라 쓴 뒤에 '전달'로
 * 하는 일이다(`PLAN_composer.md` §4).
 *
 * 대상도 기본은 "이 채널 참여자 전원"이고 좁히는 것은 예외라, 한 줄로만 알리고 눌러야
 * TargetPicker가 펼쳐진다. 고치는 글이 이미 좁혀져 있으면(채널 전원과 다르면) 처음부터
 * 펼쳐 보여준다 — 좁혀둔 걸 숨기면 고치는 사람이 그 사실을 놓친다.
 *
 * 문서 ID를 화면에 들어올 때 미리 만들어 두는 이유는 첨부와 본문 이미지 때문이다. 둘 다
 * 고르는 즉시 schools/{schoolId}/requests/{requestId}/ 아래로 올라가야 하는데, 저장
 * 시점에 ID를 만들면 그 전에 올린 파일의 경로를 정할 수 없다(PostNew.jsx 시절부터의 이유).
 *
 * ── 자동저장(2026-08-26) ──────────────────────────────────────
 *
 * "알림 보내기"를 눌러야만 저장되던 예전 방식은 안 누르고 나가면 쓴 내용이 그냥
 * 사라졌다. 노션처럼 무엇이든 쓰는 순간 이미 저장된 것으로 바꿨다 — 제목·본문·대상·
 * 요청/안내·마감일·첨부 중 하나라도 바뀌면 자동으로 저장된다(`syncSave` 이펙트).
 * 완전히 빈 상태에서는 아직 문서를 만들지 않는다(제목 없는 빈 문서가 채널 탭에
 * 쌓이는 것을 막는다) — 뭐라도 쓰는 순간 즉시(디바운스 없이) 한 번 만들고, 그 뒤
 * 변경은 700ms 디바운스로 갱신한다. 화면을 떠날 때(unmount) 디바운스를 기다리지 않고
 * 마지막 상태를 한 번 더 조용히 밀어 넣는다 — 타이핑 직후 곧바로 다른 채널을 눌러도
 * 700ms 안의 마지막 몇 글자까지 지켜지도록.
 *
 * "알림 보내기"는 이제 저장과 무관한 별도 동작이다 — 채널 메시지 탭에 이 글을
 * 가리키는 메시지를 하나 남긴다(전달 기능과 같은 함수, 같은 채널로 보내는 것뿐).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { collection, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Collapse from '@mui/material/Collapse'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import CloseIcon from '@mui/icons-material/Close'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, schoolPath } from '@shared/lib/schema'
import { describeRule, resolveTargets } from '@shared/lib/targeting'
import { completionStats, isRequest, newRequestPayload } from '@shared/lib/workRequests'
import { postVisibilityFor } from '@shared/lib/channels'
import { deleteAttachment, fileKind, formatBytes } from '@shared/lib/requestAttachments'
import { htmlToText, isEmptyHtml, sanitizeHtml } from '@shared/lib/richText'
import TargetPicker from './TargetPicker'
import CanvasEditor from './CanvasEditor'
import { useToast } from './ToastProvider'
import { updatePostContent } from '../lib/requestActions'
import { shareCanvasToChannel } from '../lib/channelActions'

const EMPTY_RULE = { conditions: [], includeUids: [], excludeUids: [] }

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
  if (!value) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const due = new Date(`${value}T00:00:00`)
  const days = Math.round((due - today) / 86400000)
  if (days === 0) return '오늘'
  if (days < 0) return `${-days}일 지남`
  return `${days}일 뒤`
}

/**
 * @param {object} channel 지금 글을 쓰는 채널. 대상 기본값과 열람 범위가 여기서 나온다.
 * @param {string} [editingId] 있으면 고치기 모드 — 그 글을 읽어와 채운다.
 * @param {(requestId: string) => void} onSaved 문서가 처음 만들어진 직후 1회(새 글이면
 *   새로 만든 id) — Channels.jsx가 주소를 `/new`에서 실제 캔버스 주소로 조용히 바꾼다.
 * @param {() => void} onCancel 고칠 글을 못 찾았을 때만 쓴다(더 이상 '취소' 버튼은 없다 —
 *   자동저장이라 되돌릴 '쓰다 만 것'이 없다).
 * @param {object[]} members 학교 구성원 — 부모(Channels.jsx)가 이미 구독 중인 것을 그대로 받는다.
 * @param {boolean} membersLoading
 * @param {(to: string) => void} onOpenCanvasRef 본문 안 '캔버스 삽입' 카드를 눌렀을 때
 *   그 글로 이동한다. ChannelMessages.jsx가 CanvasCard에 쓰는 onOpenCanvas와 같은 역할.
 */
export default function PostComposer({
  channel, editingId, onSaved, onCancel, members, membersLoading, onOpenCanvasRef,
}) {
  const { user, userName, schoolId } = useAuth()
  const toast = useToast()
  const canvasEditorRef = useRef(null)

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
  const [rule, setRule] = useState(channel?.memberRule || EMPTY_RULE)
  const [targetOpen, setTargetOpen] = useState(false)
  const [attachments, setAttachments] = useState([])
  const [links, setLinks] = useState([])
  const [loadingPost, setLoadingPost] = useState(!!editingId)
  // 실제 Firestore 문서가 이미 만들어졌는가. 고치기는 처음부터 true, 새 글은 첫 자동저장이
  // 만든 순간 true가 된다 — 그 전까지는 완전히 로컬 상태다.
  const [created, setCreated] = useState(!!editingId)
  const [saveState, setSaveState] = useState('idle')   // idle | saving | saved | error
  // '업무현황 N/M' 버튼 표시용. 자동저장이 title·bodyHtml 등을 실시간으로 반영하는 것과
  // 달리 이 값은 여기서 손대지 않는다(완료 체크는 PostDetail 쪽 일) — 고칠 글을 읽어올
  // 때 한 번 채워서 보여주기만 한다. 실시간이 아니라서 편집하는 동안 다른 사람이 방금
  // 완료해도 숫자가 바로 안 바뀔 수 있다 — 버튼을 눌러 실제 현황(PostDetail)으로 가면
  // 거기는 구독이라 정확하다.
  const [completedUids, setCompletedUids] = useState([])

  // 고치기를 시작한 시점에 이미 붙어 있던 파일. 도중에 그만둬도 이건 지우면 안 된다.
  const keptFiles = useRef(new Set())

  // 첫 자동저장이 새 글을 만들면 주소가 /new → /edit로 조용히 바뀐다(아래 onSaved).
  // editingId가 undefined→실값으로 바뀌는 그 순간, 아래 "고칠 글 읽어오기" 이펙트가
  // 방금 내가 막 저장한 문서를 다시 읽어와 그사이 친 글자를 덮어써 버릴 뻔했다 —
  // 이 플래그가 "방금 내가 만든 것"이면 그 재조회를 한 번 건너뛰게 한다.
  const justCreatedRef = useRef(false)

  /**
   * 고칠 글을 한 번만 읽어온다. onSnapshot으로 구독하지 않는 이유: 쓰는 도중에 서버 값이
   * 들어오면 방금 친 내용이 덮인다.
   */
  useEffect(() => {
    if (!editingId || !schoolId) return
    if (justCreatedRef.current) { justCreatedRef.current = false; return }
    let alive = true
    getDoc(doc(db, ...schoolPath(schoolId, COL.REQUESTS), editingId))
      .then(snap => {
        if (!alive) return
        if (!snap.exists()) {
          toast.error('글을 찾을 수 없습니다. 삭제되었을 수 있습니다.')
          onCancel()
          return
        }
        const post = snap.data()
        setTitle(post.title || '')
        setBodyHtml(post.bodyHtml || '')
        setNeedsCompletion(isRequest(post))
        setPinned(!!post.pinned)
        setDueDate(post.dueDate?.toDate ? ymd(post.dueDate.toDate()) : '')
        setRule(post.targetRule || channel?.memberRule || EMPTY_RULE)
        // 채널 참여자 전원과 다르면 처음부터 펼친다 — 접어두면 이미 좁혀 놓은 대상을
        // 고치는 사람이 못 보고 "채널 전체 대상"으로 착각한 채 저장할 수 있다.
        const channelUids = new Set(channel?.memberUids || [])
        const savedUids = post.targetUids || []
        const narrowed = savedUids.length !== channelUids.size || savedUids.some(uid => !channelUids.has(uid))
        setTargetOpen(narrowed)
        setAttachments(post.attachments || [])
        setLinks(post.links || [])
        setCompletedUids(post.completedUids || [])
        keptFiles.current = new Set((post.attachments || []).map(a => a.path))
        setLoadingPost(false)
      })
      .catch(e => {
        if (!alive) return
        toast.error('글을 불러오지 못했습니다.', e)
        setLoadingPost(false)
      })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId, schoolId])

  const targets = useMemo(() => resolveTargets(rule, members).members, [rule, members])
  const stats = useMemo(
    () => completionStats({ targetUids: targets.map(t => t.uid), completedUids }),
    [targets, completedUids],
  )

  // '+캔버스'로 심을 수 있는 후보 — 이 채널의 다른 업무 글만 준다(지금 쓰는 글 자신은 뺀다).
  const canvasOptions = useMemo(
    () => (channel?.posts || [])
      .filter(p => p.id !== requestId)
      .map(p => ({ id: p.id, title: p.title, channelId: p.channelId || channel.id })),
    [channel, requestId],
  )

  /**
   * '+파일'로 올린 파일. AttachmentPicker.jsx가 하던 일을 그대로 한다 — 고치는 중이면
   * (deferRemove와 같은 이유로) 실제 삭제는 자동저장이 처리한다(아래 flushRef 참고).
   */
  const removeAttachment = async (a) => {
    setAttachments(prev => prev.filter(x => x.path !== a.path))
    if (editingId) return
    try {
      await deleteAttachment(a)
    } catch (e) {
      toast.error('파일을 지우지 못했습니다. 목록에서는 제거됐습니다.', e)
    }
  }

  /**
   * "지금 이 순간 저장한다면"을 매 렌더 다시 만들어 둔다 — 디바운스 타이머와 언마운트
   * 정리(cleanup) 양쪽에서 **항상 최신 상태**로 부를 수 있어야 하기 때문이다. 언마운트
   * cleanup은 빈 배열 이펙트라 등록 시점의 클로저만 갖는데, ref 안의 함수는 매 렌더
   * 다시 대입되므로 unmount 순간의 최신 값을 쓸 수 있다.
   *
   * @param {boolean} silent 언마운트 중 부를 때 true. 화면이 이미 사라지는 중이라
   *   상태 갱신(setCreated 등)도, onSaved(→navigate)도 하지 않는다 — 안 그러면 사용자가
   *   막 눌러서 옮겨간 다른 채널에서 이 글로 도로 튕겨간다.
   */
  const flushRef = useRef(async () => {})
  flushRef.current = async ({ silent = false } = {}) => {
    if (loadingPost) return
    const isEmpty = !title.trim() && isEmptyHtml(bodyHtml) && attachments.length === 0
    if (!created && isEmpty) return

    try {
      const safeHtml = sanitizeHtml(bodyHtml)
      const payload = newRequestPayload({
        kind: needsCompletion ? 'request' : 'notice',
        title,
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

      if (!created) {
        await setDoc(doc(db, ...schoolPath(schoolId, COL.REQUESTS), requestId), {
          ...payload,
          bodyHtml: safeHtml,
          channelId: channel.id,
          ...postVisibilityFor(channel),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
        if (!silent) { justCreatedRef.current = true; setCreated(true); onSaved(requestId) }
      } else {
        // 고칠 때 넘기지 않는 것 — completedUids(이미 한 사람의 기록), status(마감 여부),
        // createdBy/createdByName(글쓴이). 채널은 프롭으로 고정이라 옮길 수 없다(전달로 한다).
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
            channelId: channel.id,
            ...postVisibilityFor(channel),
          },
        })
        const kept = new Set(attachments.map(a => a.path))
        await Promise.all([...keptFiles.current]
          .filter(path => !kept.has(path))
          .map(path => deleteAttachment({ path }).catch(() => {})))
      }
      if (!silent) setSaveState('saved')
    } catch (e) {
      if (!silent) {
        setSaveState('error')
        toast.error('저장하지 못했습니다.', e)
      }
    }
  }

  // 처음 한 번(마운트, 또는 고치기 로딩 완료 직후)은 저장을 건너뛴다 — 안 그러면 아무것도
  // 안 고쳤는데도 로딩 직후 값이 채워지는 것 자체를 "변경"으로 잡아 헛저장이 한 번 나간다.
  const skipNextSaveRef = useRef(true)

  useEffect(() => {
    if (loadingPost) { skipNextSaveRef.current = true; return }
    if (skipNextSaveRef.current) { skipNextSaveRef.current = false; return }

    setSaveState('saving')
    // 문서가 아직 없으면(첫 저장) 디바운스 없이 바로 만든다 — "썼는데 안 만들어졌다"로
    // 보이는 시간을 없앤다. 이미 있으면 타이핑 한 글자마다 쓰지 않도록 모아서 보낸다.
    // created는 일부러 의존성 배열에서 뺐다 — 첫 저장이 created를 true로 바꾸는 순간
    // 이 이펙트가 그것 때문에 다시 돌면, 방금 막 저장한 것과 똑같은 내용을 700ms 뒤에
    // 한 번 더 쓰는 헛수고가 생긴다. flushRef.current()는 매 렌더 최신 created를
    // 참조하므로 다음 실제 변경부터는 어차피 옳은 값으로 판단한다.
    const timer = setTimeout(() => { flushRef.current() }, created ? 700 : 0)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, bodyHtml, needsCompletion, pinned, dueDate, rule, attachments, targets, loadingPost])

  // 화면을 완전히 떠날 때(다른 채널·다른 탭으로 이동해 이 컴포넌트가 사라질 때)만 도는
  // 정리 함수. 위 디바운스가 아직 안 끝났어도 마지막 상태를 한 번 더 조용히 저장한다.
  useEffect(() => {
    return () => { flushRef.current({ silent: true }) }
  }, [])

  const [notifying, setNotifying] = useState(false)

  /**
   * 알림 보내기 — 저장과 완전히 무관한 별도 동작이다. 채널 '전달' 기능과 같은 함수를
   * 같은 채널로 부르는 것뿐이다(shareCanvasToChannel) — 새 백엔드 로직이 필요 없다.
   * 여러 번 눌러도 매번 새 메시지가 쌓인다(토글이 아니다).
   */
  const notifyChannel = async () => {
    if (!created) return
    setNotifying(true)
    try {
      await shareCanvasToChannel({
        schoolId,
        targetChannelId: channel.id,
        post: { id: requestId, title: title || '(제목 없음)', channelId: channel.id },
        author: { uid: user.uid, name: userName },
      })
      toast.success('채널에 알렸습니다.')
    } catch (e) {
      toast.error('알리지 못했습니다.', e)
    } finally {
      setNotifying(false)
    }
  }

  if (loadingPost) {
    return <Typography color="text.secondary" sx={{ p: 2.5 }}>글을 불러오는 중…</Typography>
  }

  const due = dueLabel(dueDate)

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Box sx={{ flexShrink: 0, px: 2, pt: 1.5 }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mb: 1 }}>
          <SegChoice
            value={needsCompletion ? 'request' : 'notice'}
            onChange={v => setNeedsCompletion(v === 'request')}
            options={[
              { value: 'request', label: '요청', Icon: CheckCircleOutlineIcon },
              { value: 'notice', label: '안내', Icon: CampaignOutlinedIcon },
            ]}
          />
          {/* 이제 채널 탭을 눌러 돌아오면 글쓴이는 무조건 이 편집기로 온다(제출현황으로
              자동으로 안 튕긴다 — 사용자 확정, 2026-08-26). 그 대신 제출현황(완료 관리)을
              보고 싶을 때 누르는 문이 이 버튼이다 — 보기 화면(PostDetail)으로 보낸다.
              완료 수는 실시간이 아니다(고칠 글을 한 번만 읽어오므로) — 정확한 값은
              눌러서 들어간 화면이 보여준다. */}
          {needsCompletion && created && (
            <Button
              size="small" variant="outlined"
              onClick={() => onOpenCanvasRef?.(`/channels/${channel.id}/${requestId}`)}
              sx={{ fontSize: '0.76rem' }}
            >
              업무현황 {stats.doneCount}/{stats.total}
            </Button>
          )}
          {needsCompletion ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
              <TextField
                type="date" size="small"
                value={dueDate} onChange={e => setDueDate(e.target.value)}
                inputProps={{ style: { fontSize: '0.8rem' } }}
                sx={{ width: 148 }}
              />
              {DUE_PRESETS.map(p => (
                <Chip
                  key={p.label} size="small" variant="outlined" label={p.label}
                  onClick={() => setDueDate(p.get())}
                  sx={{ fontSize: '0.72rem', height: 22 }}
                />
              ))}
              {due && <Typography fontSize="0.74rem" color="text.secondary">{due}</Typography>}
            </Box>
          ) : (
            <FormControlLabel
              sx={{ ml: 0 }}
              control={<Checkbox size="small" checked={pinned} onChange={e => setPinned(e.target.checked)} />}
              label={<Typography fontSize="0.8rem">목록 맨 위에 고정</Typography>}
            />
          )}
        </Box>

        <Box sx={{ mb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
            {/* 예전엔 대상이 0명이면 저장을 막았다. 자동저장은 막을 자리가 없어져서
                (막으면 그 사이 다른 변경까지 다 저장이 안 된다) 대신 경고만 상시 띄운다. */}
            <Typography
              fontSize="0.8rem"
              color={targets.length === 0 ? 'warning.main' : 'text.secondary'}
              fontWeight={targets.length === 0 ? 700 : 400}
              sx={{ flexGrow: 1 }}
            >
              {targets.length === 0
                ? '⚠ 대상이 없습니다 — 아직 아무에게도 가지 않습니다'
                : `이 채널 참여자 ${targets.length}명이 대상입니다`}
            </Typography>
            <Button size="small" onClick={() => setTargetOpen(v => !v)} sx={{ fontSize: '0.76rem' }}>
              {targetOpen ? '접기' : '대상 좁히기'}
            </Button>
          </Box>
          <Collapse in={targetOpen}>
            <Box sx={{ mt: 1, maxWidth: 420 }}>
              {membersLoading
                ? <Typography color="text.secondary" fontSize="0.85rem">구성원 불러오는 중…</Typography>
                : <TargetPicker members={members} value={rule} onChange={setRule} />}
            </Box>
          </Collapse>
        </Box>

        {/* '+파일'로 올린 것들 — 예전 AttachmentPicker의 폼(파일첨부 버튼 + 링크 붙여넣기
            입력칸)을 없애고 얇은 줄만 남겼다(PLAN_canvasEditor.md 3단계). 하이퍼링크는
            본문에서 글을 골라 링크를 무는 것으로 충분하다고 보고 별도 '링크 첨부'는
            안 만들었다. */}
        {attachments.length > 0 && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.6, mb: 1 }}>
            {attachments.map(a => {
              const kind = fileKind(a.name)
              return (
                <Box
                  key={a.path}
                  sx={{
                    display: 'flex', alignItems: 'center', gap: 0.5,
                    border: '1px solid', borderColor: 'divider', borderRadius: 5,
                    pl: 1, pr: 0.3, py: 0.2,
                  }}
                >
                  <Typography fontSize="0.8rem">{kind.emoji}</Typography>
                  <Typography fontSize="0.78rem" fontWeight={600} noWrap sx={{ maxWidth: 160 }}>
                    {a.name}
                  </Typography>
                  <Typography fontSize="0.7rem" color="text.secondary">{formatBytes(a.size)}</Typography>
                  <IconButton size="small" onClick={() => removeAttachment(a)} aria-label="파일 제거" sx={{ p: 0.2 }}>
                    <CloseIcon sx={{ fontSize: 13 }} />
                  </IconButton>
                </Box>
              )
            })}
          </Box>
        )}
      </Box>

      <Box sx={{ flexGrow: 1, minHeight: 0, overflowY: 'auto', px: 2 }}>
        {/* 제목도 캔버스 영역으로 내렸다(사용자 요청, 2026-08-26) — 노션처럼 페이지를
            열면 곧바로 "제목을 쓰는 상태"가 되도록. 위 대상·요청/안내·마감일은 설정값이라
            그대로 고정 칸에 남지만, 제목은 글의 일부라 캔버스 흐름 맨 위에 둔다.
            테두리·밑줄을 없애 입력 상자가 아니라 캔버스 위의 큰 제목처럼 보이게 한다. */}
        <TextField
          fullWidth autoFocus variant="standard"
          placeholder="제목"
          value={title} onChange={e => setTitle(e.target.value)}
          InputProps={{ disableUnderline: true }}
          inputProps={{ style: { fontSize: '1.6rem', fontWeight: 800 } }}
          sx={{ mb: 1 }}
          // 제목을 쓰고 Enter를 치면 본문으로 이어지는 게 자연스럽다 — 지금은 한 줄
          // 입력창이라 Enter가 아무 일도 안 하고 있었다.
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); canvasEditorRef.current?.focus() }
          }}
        />
        <CanvasEditor
          ref={canvasEditorRef}
          docId={requestId}
          value={bodyHtml}
          onChange={setBodyHtml}
          onFileUploaded={file => setAttachments(prev => [...prev, file])}
          onOpenCanvasRef={onOpenCanvasRef}
          canvasOptions={canvasOptions}
          placeholder="무엇을 어떻게 하면 되는지 적어주세요. '+'로 이미지·표·날짜·다른 업무 글도 넣을 수 있습니다."
        />
      </Box>

      <Box sx={{
        flexShrink: 0, borderTop: '1px solid', borderColor: 'divider',
        px: 2, py: 1.1, display: 'flex', alignItems: 'center', gap: 1.2,
      }}>
        <SaveStateLabel state={saveState} />
        <Box sx={{ flexGrow: 1 }} />
        <Button
          size="small" variant="contained" startIcon={<NotificationsActiveIcon sx={{ fontSize: 16 }} />}
          disabled={!created || notifying}
          onClick={notifyChannel}
        >
          알림 보내기
        </Button>
      </Box>
    </Box>
  )
}

/** 자동저장 상태 한 줄 — 구글독스·노션과 같은 자리, 같은 뜻. */
function SaveStateLabel({ state }) {
  if (state === 'saving') {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
        <CircularProgress size={12} thickness={5} />
        <Typography fontSize="0.76rem" color="text.secondary">저장 중…</Typography>
      </Box>
    )
  }
  if (state === 'saved') {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <CheckCircleIcon sx={{ fontSize: 14, color: 'success.main' }} />
        <Typography fontSize="0.76rem" color="text.secondary">저장됨</Typography>
      </Box>
    )
  }
  if (state === 'error') {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <ErrorOutlineIcon sx={{ fontSize: 14, color: 'error.main' }} />
        <Typography fontSize="0.76rem" color="error.main">저장하지 못했습니다</Typography>
      </Box>
    )
  }
  return null
}

/**
 * 둘 중 하나 고르기. 체크상자로 두면 "완료 확인 받기"를 껐을 때 무엇이 되는지가 안
 * 보인다. 요청과 안내를 나란히 놓아 지금 어느 쪽으로 나가는지 한눈에 보이게 한다.
 */
function SegChoice({ value, onChange, options }) {
  return (
    <Box sx={{ display: 'flex', gap: 0.3, p: 0.3, borderRadius: 1, bgcolor: 'action.hover' }}>
      {options.map(o => {
        const on = o.value === value
        return (
          <Box
            key={o.value} component="button" type="button"
            onClick={() => onChange(o.value)}
            sx={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.4,
              border: 0, borderRadius: 0.75, py: 0.4, px: 1, cursor: 'pointer',
              fontFamily: 'inherit', fontSize: '0.8rem',
              fontWeight: on ? 700 : 500,
              bgcolor: on ? 'background.paper' : 'transparent',
              boxShadow: on ? 1 : 0,
              color: on ? 'primary.main' : 'text.secondary',
            }}
          >
            <o.Icon sx={{ fontSize: 15 }} />{o.label}
          </Box>
        )
      })}
    </Box>
  )
}
