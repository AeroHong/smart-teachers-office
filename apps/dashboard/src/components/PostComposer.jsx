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
import Autocomplete from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Collapse from '@mui/material/Collapse'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined'
import StickyNote2OutlinedIcon from '@mui/icons-material/StickyNote2Outlined'
import TaskAltIcon from '@mui/icons-material/TaskAlt'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import CloseIcon from '@mui/icons-material/Close'
import DownloadIcon from '@mui/icons-material/DownloadOutlined'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, schoolPath } from '@shared/lib/schema'
import { describeRule, resolveTargets } from '@shared/lib/targeting'
import { completionStats, isRequest, newRequestPayload } from '@shared/lib/workRequests'
import { isDm, isSelfDm, postVisibilityFor } from '@shared/lib/channels'
import { deleteAttachment, fileKind, formatBytes } from '@shared/lib/requestAttachments'
import { htmlToText, isEmptyHtml, sanitizeHtml } from '@shared/lib/richText'
import { hydrateDateChips } from '@shared/lib/dateChips'
import TargetPicker from './TargetPicker'
import CanvasEditor from './CanvasEditor'
import { RICH_TEXT_SX } from './richTextStyles'
import { useToast } from './ToastProvider'
import { setSelfTaskDone, updatePostContent } from '../lib/requestActions'
import { postSystemNotice, shareCanvasToChannel } from '../lib/channelActions'
import { CLOUD_DANCER } from '../lib/pantone'

const EMPTY_RULE = { conditions: [], includeUids: [], excludeUids: [] }

/**
 * 사람이 고칠 수 있는 저장 내용의 지문. 떠날 때 "마지막 저장 이후 바뀐 게 있나"를 보는
 * 데만 쓴다 — 같으면 쓰지 않는다(PostComposer의 flushRef). 편집기에서 고칠 수 있는
 * 필드가 늘면 여기도 같이 늘려야 한다: 빠뜨리면 그 필드만 바꾸고 떠날 때 저장이 안 된다.
 * 첨부는 경로만 본다(같은 파일이면 이름·크기가 같다).
 */
function contentSig(c) {
  return JSON.stringify([
    c.title, c.bodyHtml, c.needsCompletion, c.pinned, c.dueDate, c.rule, c.ownerUids,
    (c.attachments || []).map(a => a.path), c.links,
    c.coverImageUrl, c.coverImagePath, c.coverImagePosition,
  ])
}

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
 * @param {({requestId, blockId}) => void} [onOpenBlockComments] 캔버스 블록 손잡이의
 *   댓글 아이콘을 눌렀을 때 — CanvasEditor는 blockId만 알므로 여기서 이 글의 requestId를
 *   더해 Channels.jsx에 넘긴다(3단 오른쪽 4번째 칸을 여는 것은 그쪽 소관).
 * @param {boolean} targetOpen "대상 좁히기" 펼침 여부 — 예전엔 이 컴포넌트의 로컬
 *   상태였는데, 그 토글 버튼이 채널 헤더(제목 줄 오른쪽)로 옮겨가면서 부모(Channels.jsx)가
 *   들고 있게 됐다(2026-08-28, 사용자 요청 — "대상 좁히기는 참여자 수 옆으로 이동").
 *   여기서는 Collapse가 펼쳐질지만 이 값으로 판단하고, 처음 값 계산(고칠 글이 채널
 *   전원과 다르면 자동으로 펼침)은 여기서 그대로 한다 — setTargetOpen만 부모 것을 쓴다.
 * @param {(v: boolean | ((prev: boolean) => boolean)) => void} setTargetOpen
 */
export default function PostComposer({
  channel, editingId, onSaved, onCancel, members, membersLoading, onOpenCanvasRef,
  onOpenBlockComments, targetOpen, setTargetOpen,
}) {
  const { user, userName, schoolId } = useAuth()
  const toast = useToast()

  // 새 글은 첨부 경로에 쓸 ID를 미리 만들고, 고칠 때는 이미 있는 문서를 그대로 쓴다
  const draftId = useMemo(
    () => (schoolId && !editingId ? doc(collection(db, ...schoolPath(schoolId, COL.REQUESTS))).id : null),
    [schoolId, editingId],
  )
  const requestId = editingId || draftId

  /**
   * DM(1:1·여러 명·나와의 대화)인가.
   *
   * DM에 넣는 캔버스는 "업무 배정"이 아니라 그 대화에서 같이 보는 문서다. 그런데 이
   * 편집기는 채널용으로만 만들어져 있어서 DM에서도 요청/안내 선택·마감일·완료 현황·
   * 대상 경고가 그대로 떴다 — 혼자 쓰는 '나와의 대화'에서도 기본이 "업무 요청"이라
   * 내 메모에 완료 확인이 붙었다(사용자 지적, 2026-09-17). DM에서는 그 갈래를 통째로
   * 접고 늘 '안내'로 둔다.
   */
  const dm = isDm(channel)
  /**
   * '나와의 대화'인가 — 개인 할 일 목록으로 쓰는 곳(2026-09-18, 사용자 확정 설계).
   * 여기서는 '요청/안내' 대신 '할 일/메모'를 고르고, 할 일이면 마감기한과 완료 체크를
   * 이 편집기 머리에서 바로 한다. 업무현황(PostDetail)으로 보내지 않는다 — 대상이 나
   * 하나뿐인 할 일에 완료 현황 화면은 복잡하기만 하다("복잡해 보이는 업무현황 페이지로
   * 넘어가지 말고"). 완료 체크는 곧 끝(마감)이다(requestActions.js setSelfTaskDone).
   */
  const selfDm = isSelfDm(channel)

  const [title, setTitle] = useState('')
  const [bodyHtml, setBodyHtml] = useState('')
  const [needsCompletion, setNeedsCompletion] = useState(!dm)
  const [pinned, setPinned] = useState(false)
  const [dueDate, setDueDate] = useState('')
  const [rule, setRule] = useState(channel?.memberRule || EMPTY_RULE)
  // 담당자(ownerUids) — 글쓴이 말고 함께 편집·관리할 사람들(2026-09-10, 사용자 요청
  // "업무 담당자와 담당 부장이 공동작업 가능해야 함"). workRequests.js의 ownerOf가
  // 비어 있으면 글쓴이만으로 보므로, 아무도 안 골라도 예전과 동작이 같다.
  const [ownerUids, setOwnerUids] = useState([])
  const [attachments, setAttachments] = useState([])
  const [links, setLinks] = useState([])
  const [coverImageUrl, setCoverImageUrl] = useState(null)
  const [coverImagePath, setCoverImagePath] = useState(null)
  const [coverImagePosition, setCoverImagePosition] = useState(50)   // 세로 위치 %, 기본 가운데
  const [loadingPost, setLoadingPost] = useState(!!editingId)
  // 실제 Firestore 문서가 이미 만들어졌는가. 고치기는 처음부터 true, 새 글은 첫 자동저장이
  // 만든 순간 true가 된다 — 그 전까지는 완전히 로컬 상태다.
  const [created, setCreated] = useState(!!editingId)
  /**
   * 지금 편집기 state(제목·본문·첨부…)가 어느 문서의 내용인가.
   *
   * 저장은 늘 requestId에 쓰는데, requestId는 editingId가 바뀌는 렌더에서 곧바로 바뀌고
   * 내용 state는 getDoc이 끝나야 바뀐다. 그 사이 저장이 돌면 떠나온 글의 내용이 새 글에
   * 써진다 — 캔버스 탭 복제 사고의 공통 뿌리다(Channels.jsx의 composerKey 설명). 지금은
   * key로 글마다 인스턴스를 새로 만들어 그 틈 자체가 없지만, 이 값을 내용과 **같은 배치로**
   * 바꿔 두고 flushRef.current가 "requestId === 이 값"일 때만 쓰게 해서, 앞으로 어떤
   * 경로로 저장이 불리든 남의 문서에 쓰는 일은 구조적으로 막는다. 고칠 글은 불러오기 전엔
   * 주인이 없다(null) — 빈 state를 그 글에 쓰면 안 되기 때문이다.
   */
  const [contentOwnerId, setContentOwnerId] = useState(editingId ? null : draftId)
  const [saveState, setSaveState] = useState('idle')   // idle | saving | saved | error
  // '업무현황 N/M' 버튼 표시용. 자동저장이 title·bodyHtml 등을 실시간으로 반영하는 것과
  // 달리 이 값은 여기서 손대지 않는다(완료 체크는 PostDetail 쪽 일) — 고칠 글을 읽어올
  // 때 한 번 채워서 보여주기만 한다. 실시간이 아니라서 편집하는 동안 다른 사람이 방금
  // 완료해도 숫자가 바로 안 바뀔 수 있다 — 버튼을 눌러 실제 현황(PostDetail)으로 가면
  // 거기는 구독이라 정확하다.
  const [completedUids, setCompletedUids] = useState([])
  // 글의 status('draft'|'open'|'closed'). '나와의 대화' 할 일의 완료 체크 표시에만 쓴다 —
  // 자동저장은 status를 안 건드린다(발행 순간만 예외, flushRef).
  const [postStatus, setPostStatus] = useState(null)
  // 사람이 탭 메뉴로 직접 보관한 글인가 — 완료 체크가 그런 글을 탭으로 끌어내지 않게 한다
  // (requestActions.js setSelfTaskDone의 keepInTabs).
  const [manuallyArchived, setManuallyArchived] = useState(false)
  const [togglingDone, setTogglingDone] = useState(false)

  // PDF·DOCX 다운로드용 — 글쓴이는 캔버스 탭을 눌러도 늘 이 편집기로 오지 PostDetail
  // (보기 화면)로 가지 않으므로, 다운로드 버튼을 여기에도 둬야 글쓴이가 실제로 쓸 수
  // 있다(2026-09-10, 사용자 신고 — "다운로드 버튼이 안 보여"). 편집 중인 contentEditable
  // 노드를 그대로 캡처하면 커서·리사이즈 손잡이 등 편집 전용 흔적이 같이 찍히므로,
  // PostDetail과 똑같은 방식(sanitizeHtml + dangerouslySetInnerHTML)으로 화면 밖에
  // 안 보이게 따로 그려서 그 노드를 내보낸다.
  const exportBodyRef = useRef(null)
  const [downloadAnchor, setDownloadAnchor] = useState(null)
  const [exporting, setExporting] = useState(false)
  useEffect(() => { hydrateDateChips(exportBodyRef.current) }, [bodyHtml])

  // 고치기를 시작한 시점에 이미 붙어 있던 파일. 도중에 그만둬도 이건 지우면 안 된다.
  const keptFiles = useRef(new Set())
  // 고치기를 시작한 시점의 표지 경로 — keptFiles와 같은 이유, 값 하나짜리라 Set이 아니다.
  const keptCoverPathRef = useRef(null)

  // 첫 자동저장이 새 글을 만들면 주소가 /new → /edit로 조용히 바뀐다(아래 onSaved).
  // editingId가 undefined→실값으로 바뀌는 그 순간, 아래 "고칠 글 읽어오기" 이펙트가
  // 방금 내가 막 저장한 문서를 다시 읽어와 그사이 친 글자를 덮어써 버릴 뻔했다 —
  // 이 플래그가 "방금 내가 만든 것"이면 그 재조회를 한 번 건너뛰게 한다.
  const justCreatedRef = useRef(false)
  // 이번에 다루는 글이 이 화면에 들어올 때 이미 저장돼 있던 것인가 — 새로 쓰다가 방금
  // 만들어진 글과 "원래 있던 글을 고치는 중"을 가르는 데 쓴다(아래 flushRef, 사용자
  // 요청 2026-09-07 — "기존 캔버스가 수정된다거나" 시스템 알림). 새로 만든 직후의
  // 계속된 편집에는 "수정됨" 알림을 또 붙이지 않는다 — 만들었다는 알림과 중복이다.
  const wasAlreadyCreatedRef = useRef(!!editingId)
  // 이번 방문에서 실제로 내용이 바뀌었는가. 자동저장마다 알리면 타이핑할 때마다 알림이
  // 쌓이므로, 이 화면을 떠날 때(flushRef의 silent 호출) 한 번만 모아 알린다.
  const editedThisSessionRef = useRef(false)
  /**
   * 새로 만드는 캔버스의 발행 상태 — 'none' | 'pending' | 'done'.
   *
   * 새 글의 첫 저장은 디바운스가 0ms다(쓴 것을 잃지 않으려고). 그런데 그 순간 문서가
   * status:'open' + targetUids 전원으로 만들어지는 바람에, **제목 첫 글자를 치자마자**
   * 대상자 전원에게 배달됐다 — 61명 채널에서 "ㄱ"이라는 제목으로 Windows 팝업이 가고,
   * 채널에도 "새 캔버스를 만들었습니다: ㄱ"가 남았다(2026-09-17).
   *
   * 저장과 발행을 떼어 놓는다. 문서는 예전처럼 바로 만들되 status를 'draft'로 두고,
   * 작성을 마치고 화면을 떠날 때 'open'으로 올리면서 알림을 한 번 낸다.
   *
   * status를 쓰는 이유(targetUids를 비우지 않는 이유): 배달 여부를 판정하는 두 쿼리
   * (useDesktopNotifications의 '새 업무 요청', useMyRequests)가 모두 status=='open'을
   * 함께 보므로 draft면 양쪽 다 걸리지 않는다. 반면 targetUids를 비우는 방식은 중간에
   * 실패하면 대상이 0명으로 굳는다 — 그 사고를 이미 한 번 겪었다(c871382, 09-10).
   * status는 실패해도 대상 명단이 온전히 남아, 다시 열어 고치면 그때 발행된다.
   *
   * 'done'으로 잠그는 것은 언마운트 때 두 정리 함수가 겹쳐 들어와도 같은 알림이 두 번
   * 나가지 않게 하기 위해서다.
   */
  const publishRef = useRef('none')
  // 마지막으로 저장했거나 불러온 내용의 지문(contentSig). 떠날 때 이것과 같으면 쓰지
  // 않는다(아래 flushRef). 새 글은 아직 저장한 적이 없어 null.
  const lastSavedSigRef = useRef(null)

  /**
   * 고칠 글을 한 번만 읽어온다. onSnapshot으로 구독하지 않는 이유: 쓰는 도중에 서버 값이
   * 들어오면 방금 친 내용이 덮인다.
   */
  useEffect(() => {
    if (!schoolId) return
    if (!editingId) {
      // 고치던 글에서 '새 글'로 건너뛴 경우 — 둘 다 Channels.jsx의 같은 조건(composingNew
      // || editingPostId)에 걸려 이 컴포넌트가 안 사라지고 그대로 남는다. editingId만
      // null로 바뀌었다고 방금 전 글의 제목·본문·created가 남아있으면, 아직 Firestore에
      // 없는 새 draftId를 "수정"하려다 실패한다(사용자 지적, 2026-08-27 — "기존 캔버스
      // 내용이 그대로 보임, 수정하면 저장도 안됨"). 첫 마운트 때의 초기값으로 되돌린다.
      setTitle('')
      setBodyHtml('')
      setNeedsCompletion(!dm)
      setPinned(false)
      setDueDate('')
      setRule(channel?.memberRule || EMPTY_RULE)
      setTargetOpen(false)
      setOwnerUids([])
      setAttachments([])
      setLinks([])
      setCoverImageUrl(null)
      setCoverImagePath(null)
      setCoverImagePosition(50)
      setCompletedUids([])
      setPostStatus(null)
      keptFiles.current = new Set()
      keptCoverPathRef.current = null
      setLoadingPost(false)
      setCreated(false)
      setContentOwnerId(draftId)
      setSaveState('idle')
      wasAlreadyCreatedRef.current = false
      editedThisSessionRef.current = false
      publishRef.current = 'none'
      // 여기서 flushRef.current({silent:true})를 부르면 안 된다 — 한때 그렇게 했다가
      // 실제 데이터가 깨지는 사고로 이어졌다(2026-09-09). 이 정리 함수가 실행되는
      // 시점엔 이미 다음 렌더(새 editingId)가 먼저 커밋된 뒤라 flushRef.current가
      // 새 글(비어 있는 draftId)을 가리키는데, 정작 state(title 등)는 아직 옛 글의
      // 값 그대로다 — 그 상태로 flush하면 옛 글의 내용이 새 글로 잘못 저장된다.
      // "이 글을 수정했다"는 시스템 알림은 진짜 언마운트(아래 useEffect)에서만 낸다.
      return undefined
    }
    if (justCreatedRef.current) {
      // 방금 만든 글이 /new → /{id}/edit로 바뀐 것뿐이다 — 다시 읽지 않는다(위 설명).
      //
      // 예전엔 여기서 정리 함수로 flushRef.current({ silent: true })를 걸어 두었다
      // ("여기는 안전하다"). 안전하지 않았다: 그 정리 함수는 다음에 editingId가 바뀔 때,
      // 즉 사용자가 옆 탭을 누른 렌더에서 실행되는데 그때 flushRef.current는 이미 옆 탭의
      // requestId로 다시 대입돼 있고 제목·본문은 방금 만든 글의 것이다. 그래서 캔버스를
      // 두 개 연달아 만들고 먼저 만든 탭을 누르면 그 탭이 최신 캔버스로 복제됐고, 방금 만든
      // 글의 발행(draft→open)까지 옆 탭으로 가서 정작 그 글은 대상자에게 배달되지 않았다
      // (2026-09-18 브라우저로 재현 확인). 떠날 때 저장·발행은 아래 언마운트 이펙트가
      // 맡는다 — 이제 탭을 옮기면 이 인스턴스가 통째로 사라지므로(Channels.jsx의
      // composerKey) 그 정리 함수가 자기 글의 마지막 상태로 돈다.
      justCreatedRef.current = false
      return undefined
    }
    // 탭을 바로 옆의 이미 저장된 다른 탭으로 옮기는 경우(둘 다 editingId가 실제 id) —
    // 여기서 즉시 loadingPost를 true로 켜야 한다. 안 그러면 이 getDoc이 끝나기 전까지
    // title·bodyHtml이 옛 탭(A) 값 그대로 남아있는 채로 requestId만 새 탭(B)을 가리키는
    // 순간이 생기고, 그 사이에 A를 편집하며 걸어둔 자동저장 디바운스 타이머(최대 700ms)가
    // 뒤늦게 fire하면 flushRef.current()가 "A의 옛 내용"을 "B의 문서"에 그대로 덮어써
    // 버린다(사용자 신고, 2026-09-16 — "기존 캔버스 탭이 최근 캔버스로 덮어써지며 사라짐").
    // loadingPost는 아래 자동저장 이펙트의 의존성이라, true로 바뀌는 순간 그 이펙트가
    // 다시 돌면서 cleanup으로 A의 남은 타이머를 확실히 지운다.
    setLoadingPost(true)
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
        // 불러온 글은 이미 있는 문서다. 예전엔 여기서 created를 안 켜서, "새 글" 화면에서
        // 기존 탭으로 넘어와 고치면 created가 false로 남아 그 글을 setDoc으로 통째로 새로
        // 썼다(status가 draft로·완료 기록이 빈 배열로 돌아감). contentOwnerId는 아래
        // setTitle 등과 같은 배치로 바뀌어야 한다(위 설명).
        // state에 넣는 값과 "불러온 내용의 지문"을 한 객체에서 만든다 — 따로 쓰면 둘이
        // 조금만 어긋나도 떠날 때마다 헛저장이 나간다(아래 flushRef의 지문 비교).
        const loaded = {
          title: post.title || '',
          bodyHtml: post.bodyHtml || '',
          needsCompletion: isRequest(post),
          pinned: !!post.pinned,
          dueDate: post.dueDate?.toDate ? ymd(post.dueDate.toDate()) : '',
          rule: post.targetRule || channel?.memberRule || EMPTY_RULE,
          ownerUids: post.ownerUids || [],
          attachments: post.attachments || [],
          links: post.links || [],
          coverImageUrl: post.coverImageUrl || null,
          coverImagePath: post.coverImagePath || null,
          coverImagePosition: post.coverImagePosition ?? 50,
        }
        lastSavedSigRef.current = contentSig(loaded)
        setCreated(true)
        setContentOwnerId(editingId)
        setTitle(loaded.title)
        setBodyHtml(loaded.bodyHtml)
        setNeedsCompletion(loaded.needsCompletion)
        setPinned(loaded.pinned)
        setDueDate(loaded.dueDate)
        setRule(loaded.rule)
        setOwnerUids(loaded.ownerUids)
        // 채널 참여자 전원과 다르면 처음부터 펼친다 — 접어두면 이미 좁혀 놓은 대상을
        // 고치는 사람이 못 보고 "채널 전체 대상"으로 착각한 채 저장할 수 있다.
        const channelUids = new Set(channel?.memberUids || [])
        const savedUids = post.targetUids || []
        const narrowed = savedUids.length !== channelUids.size || savedUids.some(uid => !channelUids.has(uid))
        setTargetOpen(narrowed)
        setAttachments(loaded.attachments)
        setLinks(loaded.links)
        setCoverImageUrl(loaded.coverImageUrl)
        setCoverImagePath(loaded.coverImagePath)
        setCoverImagePosition(loaded.coverImagePosition)
        setCompletedUids(post.completedUids || [])
        setPostStatus(post.status || null)
        setManuallyArchived(post.archived === true)
        keptFiles.current = new Set((post.attachments || []).map(a => a.path))
        keptCoverPathRef.current = post.coverImagePath || null
        wasAlreadyCreatedRef.current = true
        editedThisSessionRef.current = false
        // 지난번에 발행 못 하고 draft로 남은 글이면 이번에 나갈 때 발행한다(위 publishRef
        // 설명의 안전망). 이미 발행된 글은 'none' 그대로 둔다.
        publishRef.current = post.status === 'draft' ? 'pending' : 'none'
        setLoadingPost(false)
      })
      .catch(e => {
        if (!alive) return
        toast.error('글을 불러오지 못했습니다.', e)
        setLoadingPost(false)
      })
    // 이 정리 함수에서 flushRef.current({silent:true})를 부르지 않는다 — 캔버스 탭을
    // 바로 옆 탭으로 옮겨 다닐 때(editingId가 real id → 다른 real id로 바뀔 때) 이
    // 정리 함수가 실행되는 시점엔 이미 새 editingId로 렌더가 끝난 뒤라, flushRef.current는
    // 새 글을 가리키는데 state는 아직 옛 글 값 그대로다. 그 상태로 저장하면 옛 글의
    // 제목·본문이 새 글에 덮어써진다 — 실제로 두 캔버스 탭을 오가며 테스트하다 이
    // 사고를 재현했다(2026-09-09, 탭 순서 버그를 고치던 중 발견 — 사용자가 신고한
    // 건 아니고 검증 과정에서 직접 찾음). "수정함" 알림은 진짜 언마운트(아래
    // useEffect)에서만 낸다 — 탭만 옮기는 경우는 놓치지만, 데이터가 깨지는 것보다는 낫다.
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId, schoolId])

  // DM은 조건(rule) 기반 대상 지정을 안 쓴다 — TargetPicker가 숨겨져 있어 rule은 항상
  // EMPTY_RULE로 남는데, resolveTargets(EMPTY_RULE, members)는 "조건 없음 = 전체
  // 교직원"으로 푼다(targeting.js). 그 members는 채널이 아니라 학교 전체 명단이라,
  // DM에서 그대로 썼다면 요청을 복구하는 순간 대화 상대와 무관한 전교직원이 대상·완료
  // 추적 명단에 들어갈 뻔했다. DM의 대상은 언제나 그 대화 참여자다 — 고를 것이 없다.
  const targets = useMemo(
    () => (dm
      ? members.filter(m => (channel?.memberUids || []).includes(m.uid))
      : resolveTargets(rule, members).members),
    [dm, channel, rule, members],
  )
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
   * 표지 바꾸기·삭제 — removeAttachment와 같은 즉시/지연 분기. 새 글(아직 아무것도
   * 저장 안 됨)이면 밀려난 이전 표지를 바로 지우고, 고치는 중이면 자동저장이
   * keptCoverPathRef와 diff해서 지운다(아래 flushRef 참고).
   */
  const changeCover = (uploaded) => {
    const prevPath = coverImagePath
    setCoverImageUrl(uploaded.url)
    setCoverImagePath(uploaded.path)
    setCoverImagePosition(50)   // 새 이미지는 위치 조정값이 안 딸려온다 — 가운데부터 다시
    if (!editingId && prevPath) deleteAttachment({ path: prevPath }).catch(() => {})
  }
  const removeCover = () => {
    const prevPath = coverImagePath
    setCoverImageUrl(null)
    setCoverImagePath(null)
    setCoverImagePosition(50)
    if (!editingId && prevPath) deleteAttachment({ path: prevPath }).catch(() => {})
  }
  // 위치만 바뀐다 — 파일은 그대로라 삭제 판단이 필요 없다.
  const repositionCover = (position) => setCoverImagePosition(position)

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
    // 저장할 것이 없어 그냥 돌아가는 길에는 'saving'을 걷어낸다. 저장 표시는 이 함수를
    // 부르기 전에 이펙트가 미리 켜두는데, 여기서 아무 일도 안 하고 나가면 그 표시가
    // 영영 남는다 — 새 캔버스를 열어두고 아무것도 안 썼을 때 "저장 중…"이 계속 돌아가
    // 보였다(사용자 지적, 2026-09-17).
    const stopSaving = () => { if (!silent) setSaveState('idle') }
    // 지금 들고 있는 내용이 이 문서(requestId)의 것이 아니면 절대 쓰지 않는다(위
    // contentOwnerId 설명). 두 값은 같은 렌더의 state라 어긋날 수 없고, 어긋났다면 그건
    // 떠나온 글의 내용이 새 글 ID로 가려는 순간이다. 2026-09-18 오전에 넣었던 forId(타이머를
    // 건 시점의 ID와 대조)는 디바운스 타이머 경로만 막아서, 실제로 매번 터지던 정리 함수
    // 경로(justCreatedRef 분기)를 못 막았다 — 이 검사는 부른 쪽이 누구든 똑같이 막는다.
    if (contentOwnerId !== requestId) { stopSaving(); return }
    if (loadingPost) { stopSaving(); return }
    const isEmpty = !title.trim() && isEmptyHtml(bodyHtml) && attachments.length === 0
    if (!created && isEmpty) { stopSaving(); return }

    // 이 화면을 떠날 때(silent) 두 정리 함수(글을 바꿔 타는 이펙트·완전히 사라질 때의
    // 이펙트)가 거의 동시에 flushRef.current를 부를 수 있다 — 둘 다 언마운트 한 번에
    // 걸리기 때문이다. "수정함" 알림을 낼지는 그 경합이 끼어들기 전, await 없는 지금
    // 이 자리에서 미리 정하고 플래그를 바로 꺼둔다. 그래야 뒤이어 들어온 두 번째 호출은
    // 이미 꺼진 플래그를 보고 조용히 넘어간다 — 안 그러면 같은 편집을 두 번 알린다.
    const shouldNotifyEdit = silent && editedThisSessionRef.current
    if (shouldNotifyEdit) editedThisSessionRef.current = false
    // 이 글을 떠나는 순간(silent)에만, 이번 방문에서 실제로 뭔가 바뀌었을 때만 한 번
    // 알린다 — 자동저장마다 알리면 타이핑할 때마다 알림이 쌓인다(사용자 요청,
    // 2026-09-07 — "기존 캔버스가 수정된다거나").
    const notifyEdited = () => {
      postSystemNotice({
        schoolId, channelId: channel.id, actorUid: user.uid,
        text: title ? `${userName}님이 캔버스를 수정했습니다: ${title}` : `${userName}님이 캔버스를 수정했습니다.`,
        refRequestId: requestId, refTitle: title,
      }).catch(() => {})
    }

    /**
     * 아직 배달되지 않은 글인가(위 publishRef 설명). 두 경우가 있다.
     *  - 이번에 새로 만드는 중        → publishRef 'none' + 기존 글이 아님
     *  - 지난번에 발행 못 하고 남은 draft → 읽어올 때 'pending'으로 표시해 둔다
     * 두 번째가 안전망이다. 작성 중 창을 그냥 닫으면 정리 함수가 안 돌아 draft로 남는데,
     * 그 글을 다시 열어 고치면 나갈 때 발행된다 — 영영 묻히지 않는다.
     */
    const unpublished = publishRef.current === 'pending'
      || (publishRef.current === 'none' && !wasAlreadyCreatedRef.current)
    const publishing = silent && unpublished

    // 마지막으로 저장한(또는 불러온) 뒤 바뀐 게 없으면 쓰지 않는다. 글마다 편집기를 새로
    // 띄우게 되면서(Channels.jsx의 composerKey) 탭을 떠날 때마다 이 함수가 도는데, 탭만
    // 훑어봐도 쓰기가 나가면 그 쓰기가 requests를 구독하는 모든 화면에 읽기로 퍼진다
    // (2026-09-18 프레즌스 N² 사고와 같은 구조). 아직 발행 안 된 글(draft)은 status를
    // 올려야 하므로 그대로 쓴다.
    const sig = contentSig({
      title, bodyHtml, needsCompletion, pinned, dueDate, rule, ownerUids,
      attachments, links, coverImageUrl, coverImagePath, coverImagePosition,
    })
    if (created && !publishing && sig === lastSavedSigRef.current) {
      stopSaving()
      if (shouldNotifyEdit) notifyEdited()
      return
    }

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
        coverImageUrl,
        coverImagePath,
        coverImagePosition,
        targetRule: rule,
        targetRuleText: describeRule(rule),
        targets,
        createdBy: user.uid,
        createdByName: userName,
        // DM에 넣은 캔버스는 그 대화에 있는 사람이 모두 함께 고칠 수 있다(사용자 확정,
        // 2026-09-17 — "DM 구성원은 함께 작성할 수 있거나 말거나 둘 중 하나"). 예전에는
        // '함께 편집할 사람'에 손으로 넣은 사람만 고칠 수 있어, 같은 대화 안에서도 되기도
        // 하고 안 되기도 했다. ownerUids에 참여자를 담아 두면 firestore.rules의 기존
        // update 조건(ownerUids 포함 여부)이 그대로 열어주므로 규칙을 건드릴 필요가 없다.
        ownerUids: dm ? [...new Set([...(channel?.memberUids || []), user.uid])] : ownerUids,
      })

      if (!created) {
        await setDoc(doc(db, ...schoolPath(schoolId, COL.REQUESTS), requestId), {
          ...payload,
          // 작성 중에는 'draft' — 아직 아무에게도 배달하지 않는다. 타이핑하다 바로 나간
          // 경우(첫 저장이 곧 언마운트)는 그 자리에서 발행한다.
          status: publishing ? 'open' : 'draft',
          bodyHtml: safeHtml,
          channelId: channel.id,
          ...postVisibilityFor(channel),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
        // 알림은 여기서 내지 않는다 — 이 시점은 제목 첫 글자를 친 순간일 수 있다.
        // 예약만 해두고 발행 시점에 완성된 제목으로 낸다(위 publishRef 설명).
        if (publishRef.current === 'none') publishRef.current = 'pending'
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
            coverImageUrl: payload.coverImageUrl,
            coverImagePath: payload.coverImagePath,
            coverImagePosition: payload.coverImagePosition,
            targetRule: payload.targetRule,
            targetRuleText: payload.targetRuleText,
            targetUids: payload.targetUids,
            targetNames: payload.targetNames,
            ownerUids: payload.ownerUids,
            // 발행하는 순간에만 status를 올린다. 그 외에는 여기서 status를 넘기지
            // 않으므로 이미 마감된 글의 상태를 되살리는 일도 없다.
            ...(publishing ? { status: 'open' } : {}),
            bodyHtml: safeHtml,
            channelId: channel.id,
            ...postVisibilityFor(channel),
          },
        })
        const kept = new Set(attachments.map(a => a.path))
        await Promise.all([...keptFiles.current]
          .filter(path => !kept.has(path))
          .map(path => deleteAttachment({ path }).catch(() => {})))
        if (keptCoverPathRef.current && keptCoverPathRef.current !== coverImagePath) {
          deleteAttachment({ path: keptCoverPathRef.current }).catch(() => {})
        }
        // 원래 있던 글을 고치는 중일 때만 표시한다 — 방금 만든 글을 계속 쓰는 것은
        // 나갈 때 "만들었다"고 알릴 것이라 또 "수정했다"고 겹쳐 알리지 않는다.
        // 아직 발행 안 된 draft도 마찬가지다(그쪽은 '만들었습니다'로 나간다).
        if (wasAlreadyCreatedRef.current && !unpublished) editedThisSessionRef.current = true
      }
      lastSavedSigRef.current = sig
      if (!silent) setSaveState('saved')
    } catch (e) {
      if (!silent) {
        setSaveState('error')
        toast.error('저장하지 못했습니다.', e)
      }
    }

    // 발행 — 새 캔버스는 다 쓰고 화면을 떠날 때 한 번만 알린다. 만들어진 직후가 아니라
    // 이 시점이라 제목도 완성돼 있다(위 publishRef 설명). 'done'으로 먼저 잠가, 언마운트
    // 때 두 정리 함수가 겹쳐 들어와도 같은 알림이 두 번 나가지 않게 한다.
    if (publishing && publishRef.current === 'pending') {
      publishRef.current = 'done'
      postSystemNotice({
        schoolId, channelId: channel.id, actorUid: user.uid,
        text: title.trim()
          ? `${userName}님이 새 캔버스를 만들었습니다: ${title}`
          : `${userName}님이 새 캔버스를 만들었습니다.`,
        refRequestId: requestId, refTitle: title,
      }).catch(() => {})
    }

    if (shouldNotifyEdit) notifyEdited()
  }

  // 처음 한 번(마운트, 또는 고치기 로딩 완료 직후)은 저장을 건너뛴다 — 안 그러면 아무것도
  // 안 고쳤는데도 로딩 직후 값이 채워지는 것 자체를 "변경"으로 잡아 헛저장이 한 번 나간다.
  const skipNextSaveRef = useRef(true)

  useEffect(() => {
    // 학교 구성원 명단(useSchoolMembers)이 아직 안 왔으면 첫 저장을 미룬다. 새 글의
    // 첫 저장은 디바운스가 0ms라, 명단이 오기 전에(막 채널을 열자마자 빠르게 타이핑·
    // 붙여넣기 하면 실제로 이 창이 열린다) targets가 빈 배열로 확정돼 targetUids: []가
    // 그대로 저장되는 사고가 있었다(2026-09-10, 사용자 신고 — "나와의 대화"에서 만든
    // 글의 대상이 계속 0명으로 남음). loadingPost와 같은 방식으로 미뤄 뒀다가, 명단이
    // 도착해 targets가 다시 계산되는 순간 이 이펙트가 다시 돌며 그때의 옳은 값으로 저장한다.
    if (loadingPost || membersLoading) { skipNextSaveRef.current = true; return }
    if (skipNextSaveRef.current) { skipNextSaveRef.current = false; return }

    setSaveState('saving')
    // 문서가 아직 없으면(첫 저장) 디바운스 없이 바로 만든다 — "썼는데 안 만들어졌다"로
    // 보이는 시간을 없앤다. 이미 있으면 타이핑 한 글자마다 쓰지 않도록 모아서 보낸다.
    // created는 일부러 의존성 배열에서 뺐다 — 첫 저장이 created를 true로 바꾸는 순간
    // 이 이펙트가 그것 때문에 다시 돌면, 방금 막 저장한 것과 똑같은 내용을 700ms 뒤에
    // 한 번 더 쓰는 헛수고가 생긴다. flushRef.current()는 매 렌더 최신 created를
    // 참조하므로 다음 실제 변경부터는 어차피 옳은 값으로 판단한다.
    //
    const timer = setTimeout(() => { flushRef.current() }, created ? 700 : 0)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, bodyHtml, needsCompletion, pinned, dueDate, rule, ownerUids, attachments, coverImageUrl, coverImagePath, coverImagePosition, targets, loadingPost, membersLoading])

  // 화면을 완전히 떠날 때(다른 채널·다른 탭으로 이동해 이 컴포넌트가 사라질 때)만 도는
  // 정리 함수. 위 디바운스가 아직 안 끝났어도 마지막 상태를 한 번 더 조용히 저장한다.
  useEffect(() => {
    return () => { flushRef.current({ silent: true }) }
  }, [])

  // '나와의 대화' 할 일의 완료 체크 — 체크 = 끝(마감), 풀면 다시 열린다(setSelfTaskDone).
  // 완료만 찍혔거나 마감만 된 옛 글도 끝난 것으로 본다.
  const taskDone = completedUids.includes(user?.uid) || postStatus === 'closed'
  const toggleTaskDone = async () => {
    if (!created || togglingDone) return
    const done = !taskDone
    setTogglingDone(true)
    try {
      await setSelfTaskDone({
        schoolId, requestId, actor: { uid: user.uid, name: userName }, done, keepInTabs: !manuallyArchived,
      })
      setCompletedUids(prev => (done ? [...new Set([...prev, user.uid])] : prev.filter(uid => uid !== user.uid)))
      setPostStatus(done ? 'closed' : 'open')
      // 아직 발행 전(draft)인 새 할 일이면, 떠날 때의 발행(status: 'open')이 방금 마감한 것을
      // 도로 열어 버린다(flushRef의 publishing). 발행은 끝난 것으로 친다 — 나와의 대화라
      // "새 캔버스를 만들었습니다" 알림이 안 나가도 잃는 게 없다.
      publishRef.current = 'done'
      toast.success(done ? '완료했습니다. 업무 진행 중에서 내려갑니다.' : '완료를 취소했습니다.')
    } catch (e) {
      toast.error('완료 표시를 바꾸지 못했습니다.', e)
    } finally {
      setTogglingDone(false)
    }
  }

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

  /** PostDetail.jsx의 handleExport와 같다 — 무거운 라이브러리는 누를 때만 받아온다. */
  const handleExport = async (format) => {
    setDownloadAnchor(null)
    if (exporting || !created) return
    setExporting(true)
    try {
      const { exportCanvasAsDocx, exportCanvasAsPdf } = await import('../lib/canvasExport')
      const meta = `${userName} · 대상 ${describeRule(rule)}`
      if (format === 'pdf') {
        await exportCanvasAsPdf({ title, meta, bodyEl: exportBodyRef.current, coverImageUrl })
      } else {
        await exportCanvasAsDocx({ title, meta, bodyEl: exportBodyRef.current })
      }
    } catch (e) {
      toast.error('파일을 만들지 못했습니다.', e)
    } finally {
      setExporting(false)
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
          {/* DM에서도 고를 수 있다(2026-09-18 복구 — 개인 업무 목록을 '나와의 대화'에
              넣어두고 마감을 확인하는 데 쓰는 선생님이 있었다). 2026-09-17에는 이 갈래
              자체를 DM에서 통째로 숨겼었는데, 그러면서 딱 이 용도가 같이 막혔다. 기본값만
              '안내'로 두고(위 useState(!dm) — 캐주얼한 메모에 완료 확인이 기본으로 붙는
              것은 그때 지적대로 여전히 원치 않는다), 켜고 끄는 선택 자체는 돌려준다.
              '나와의 대화'는 받는 사람이 없으니 '할 일/메모'라고 부른다(위 selfDm 설명) —
              저장되는 값은 같다(kind 'request'/'notice'). */}
          <SegChoice
            value={needsCompletion ? 'request' : 'notice'}
            onChange={v => setNeedsCompletion(v === 'request')}
            options={selfDm
              ? [
                  { value: 'request', label: '할 일', Icon: TaskAltIcon },
                  { value: 'notice', label: '메모', Icon: StickyNote2OutlinedIcon },
                ]
              : [
                  { value: 'request', label: '요청', Icon: CheckCircleOutlineIcon },
                  { value: 'notice', label: '안내', Icon: CampaignOutlinedIcon },
                ]}
          />
          {/* 이제 채널 탭을 눌러 돌아오면 글쓴이는 무조건 이 편집기로 온다(제출현황으로
              자동으로 안 튕긴다 — 사용자 확정, 2026-08-26). 그 대신 제출현황(완료 관리)을
              보고 싶을 때 누르는 문이 이 버튼이다 — 보기 화면(PostDetail)으로 보낸다.
              완료 수는 실시간이 아니다(고칠 글을 한 번만 읽어오므로) — 정확한 값은
              눌러서 들어간 화면이 보여준다. '나와의 대화'에서는 안 보인다 — 완료는 아래
              체크박스로 이 자리에서 한다. */}
          {needsCompletion && created && !selfDm && (
            <Button
              size="small" variant="outlined"
              onClick={() => onOpenCanvasRef?.(`/channels/${channel.id}/${requestId}`)}
              sx={{ fontSize: '0.76rem' }}
            >
              업무현황 {stats.doneCount}/{stats.total}
            </Button>
          )}
          {/* 글쓴이는 캔버스 탭을 눌러도 이 편집기로만 오지 보기 화면(PostDetail)의
              다운로드 버튼까지는 안 가므로, 여기에도 같은 기능을 둔다. */}
          {created && (
            <Button
              size="small" startIcon={<DownloadIcon sx={{ fontSize: 17 }} />}
              disabled={exporting}
              onClick={(e) => setDownloadAnchor(e.currentTarget)}
              sx={{ fontSize: '0.76rem' }}
            >
              {exporting ? '만드는 중…' : '다운로드'}
            </Button>
          )}
          <Menu anchorEl={downloadAnchor} open={!!downloadAnchor} onClose={() => setDownloadAnchor(null)}>
            <MenuItem onClick={() => handleExport('pdf')}>PDF로 저장</MenuItem>
            <MenuItem onClick={() => handleExport('docx')}>DOCX(워드)로 저장</MenuItem>
          </Menu>
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
              {due && !(selfDm && taskDone) && <Typography fontSize="0.74rem" color="text.secondary">{due}</Typography>}
              {/* '나와의 대화' 할 일의 완료 — 체크 = 끝(마감). 첫 저장 전에는 문서가 없어
                  잠가 둔다(제목 한 글자만 쳐도 곧바로 저장된다). */}
              {selfDm && (
                <FormControlLabel
                  sx={{ ml: 0.5, mr: 0 }}
                  disabled={!created || togglingDone}
                  control={<Checkbox size="small" checked={taskDone} onChange={toggleTaskDone} />}
                  label={(
                    <Typography fontSize="0.8rem" fontWeight={700} color={taskDone ? 'success.main' : 'text.primary'}>
                      {taskDone ? '완료됨' : '완료'}
                    </Typography>
                  )}
                />
              )}
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
          {/* 예전엔 대상이 0명이면 저장을 막았다. 자동저장은 막을 자리가 없어져서(막으면
              그 사이 다른 변경까지 다 저장이 안 된다) 대신 경고만 상시 띄운다. 문제 없을
              땐 아무것도 안 보여준다 — "이 채널 참여자 N명이 대상입니다"는 채널 헤더에
              이미 참여자 수가 보이니 중복이라 뺐다(2026-08-28, 사용자 지적). "대상 좁히기"
              토글도 같은 이유로 헤더(제목 줄 오른쪽)로 옮겨갔다 — 여기 남은 건 Collapse뿐. */}
          {/* DM에서는 '대상'이라는 개념 자체가 없다 — 그 대화에 있는 사람이 곧 독자다.
              경고를 띄우면 고칠 방법도 없는 것을 고치라고 말하는 셈이 된다. */}
          {!dm && targets.length === 0 && (
            <Typography fontSize="0.8rem" color="warning.main" fontWeight={700}>
              ⚠ 대상이 없습니다 — 아직 아무에게도 가지 않습니다
            </Typography>
          )}
          <Collapse in={targetOpen}>
            <Box sx={{ mt: 1, maxWidth: 420 }}>
              {membersLoading
                ? <Typography color="text.secondary" fontSize="0.85rem">구성원 불러오는 중…</Typography>
                : <TargetPicker members={members} value={rule} onChange={setRule} />}
            </Box>
          </Collapse>
        </Box>

        {/* 담당자 — 나(글쓴이) 말고 함께 편집·마감·다시 알림을 할 수 있는 사람(2026-09-10,
            사용자 요청). 대상(누구에게 가는가)과는 다른 개념이라 따로 둔다 — 대상은
            "받는 사람", 담당자는 "굴리는 사람"이다(workRequests.js). 안 골라도 글쓴이는
            그대로 편집할 수 있어 늘 펼쳐 둬도 부담이 없다.

            DM에서는 안 보여준다 — 그 대화의 참여자가 자동으로 담당자가 되므로(위 payload의
            ownerUids) 고를 것이 없고, 빈 칸만 남으면 "골라야 하나" 싶어진다. */}
        {!dm && !membersLoading && (
          <Box sx={{ mb: 1, maxWidth: 420 }}>
            <Autocomplete
              multiple size="small" autoHighlight
              options={members.filter(m => m.uid !== user.uid)}
              getOptionLabel={m => m.name}
              isOptionEqualToValue={(a, b) => a.uid === b.uid}
              value={members.filter(m => ownerUids.includes(m.uid))}
              onChange={(_, next) => setOwnerUids(next.map(m => m.uid))}
              renderInput={params => (
                <TextField {...params} label="담당자" placeholder="나 말고 함께 편집할 사람" />
              )}
              sx={{ '& .MuiInputBase-root': { fontSize: '0.85rem' } }}
            />
          </Box>
        )}

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
            제목 입력창 자체는 CanvasEditor.jsx 안에서 그린다(목차와 같은 칸을 써야
            본문과 왼쪽 여백이 맞는다 — 예전엔 여기서 따로 그려서 목차가 있는 글은
            제목·본문 왼쪽 여백이 서로 달랐다, 사용자 지적 2026-08-26). */}
        <CanvasEditor
          docId={requestId}
          value={bodyHtml}
          onChange={setBodyHtml}
          onFileUploaded={file => setAttachments(prev => [...prev, file])}
          onOpenCanvasRef={onOpenCanvasRef}
          canvasOptions={canvasOptions}
          placeholder="무엇을 어떻게 하면 되는지 적어주세요. '+'로 이미지·표·날짜·다른 업무 글도 넣을 수 있습니다."
          title={title}
          onTitleChange={setTitle}
          onOpenBlockComments={blockId => onOpenBlockComments?.({ requestId, blockId })}
          coverImageUrl={coverImageUrl}
          coverImagePosition={coverImagePosition}
          onCoverChange={changeCover}
          onCoverRemove={removeCover}
          onCoverPositionChange={repositionCover}
        />
      </Box>

      {/* 다운로드용 — 편집 중인 contentEditable을 그대로 캡처하면 편집 전용 흔적(커서·
          리사이즈 손잡이 등)이 같이 찍히므로, PostDetail과 같은 방식으로 화면 밖에 따로
          그려서 그 노드를 내보낸다. */}
      <Box
        ref={exportBodyRef}
        sx={{ display: 'none', ...RICH_TEXT_SX }}
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(bodyHtml) }}
      />

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
              // 흰색 대신 Cloud Dancer — 사이드바 선택 줄과 같은 톤으로 한번
              // 맞춰봤다(사용자 요청, 2026-08-26). 순백보다 살짝 따뜻해서
              // 선택된 쪽이 더 또렷하게 뜬다.
              bgcolor: on ? CLOUD_DANCER : 'transparent',
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
