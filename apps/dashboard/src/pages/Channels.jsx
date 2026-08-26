/**
 * 채널 — 왼쪽에 채널 목록, 오른쪽에 그 채널의 업무 글.
 *
 * 목록에 뱃지로 "진행 중 / 마감 지남"을 붙인다. 채널을 열어봐야 챙길 게 있는지 알 수
 * 있으면 결국 다 열어보게 되고, 그러면 목록이 있으나 마나다.
 *
 * 업무 글(캔버스)은 목록이 아니라 채널 머리의 탭이다(P3-1). 캔버스는 마감이 있으니 만드는
 * 것이고 끝나면 탭에서 빠지므로, 한 채널에서 동시에 살아 있는 것은 몇 개뿐이다. 넘치면
 * '더보기'로 접는다 — 목록으로 되돌리면 "지금 살아 있는 일이 머리에 보인다"가 사라진다.
 *
 * 보관함과 '나간 채널'은 비어 있으면 아예 그리지 않는다. 대부분의 사람에게는 평생 빈
 * 칸이라, 늘 자리를 차지하면 268px 사이드바에서 정작 볼 채널이 밀려 내려간다.
 */
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'
import AddIcon from '@mui/icons-material/Add'
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined'
import EditIcon from '@mui/icons-material/EditOutlined'
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import LockIcon from '@mui/icons-material/LockOutlined'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import PeopleIcon from '@mui/icons-material/PeopleAltOutlined'
import PersonIcon from '@mui/icons-material/PersonOutline'
import TagIcon from '@mui/icons-material/Tag'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { ALL_STAFF_CHANNEL_ID, COL, schoolPath } from '@shared/lib/schema'
import { resolveTargets } from '@shared/lib/targeting'
import {
  CANVAS_TAB_MAX, POST_POLICY, canManageChannel, canPostTo, channelPostPolicy, dmTitle, hasLeft,
  isAllStaffChannel, isDm, isLivePost, isPrivateChannel, memberDiff, sortCanvasTabs,
} from '@shared/lib/channels'
import { completionStats, dueState, isRequest } from '@shared/lib/workRequests'
import WorkspaceLayout, { DetailPlaceholder } from '../components/WorkspaceLayout'
import { MiniChip } from '../components/sidebarUi'
import ChannelDialog from '../components/ChannelDialog'
import ChannelIntro from '../components/ChannelIntro'
import ChannelMessages from '../components/ChannelMessages'
import ChannelSidebar from '../components/ChannelSidebar'
import Directory from '../components/Directory'
import DmDialog from '../components/DmDialog'
import ShareCanvasDialog from '../components/ShareCanvasDialog'
import PostComposer from '../components/PostComposer'
import PostDetail from '../components/PostDetail'
import BlockCommentsPanel from '../components/BlockCommentsPanel'
import { useToast } from '../components/ToastProvider'
import useChannels from '../lib/useChannels'
import useChannelPrefs from '../lib/useChannelPrefs'
import useSchoolMembers from '../lib/useSchoolMembers'
import usePublicChannels from '../lib/usePublicChannels'
import {
  joinPublicChannel, openDm, refreshChannelMembers, setChannelArchived, setChannelLeft,
  setPostArchived, shareCanvasToChannel, updateChannelAndPosts,
} from '../lib/channelActions'

const DUE_TONE = { overdue: 'danger', today: 'danger', soon: 'warning', normal: 'neutral', closed: 'neutral', none: 'neutral' }

const NO_DIFF = { added: [], removed: [], changed: false }

// 직전에 보던 채널 — 기기 단위 편의값이라 Firestore가 아니라 localStorage에 둔다.
// 채널을 옮길 때마다 쓰는데, 그때마다 users/{uid} 문서에 쓰면 클릭 한 번마다 쓰기가
// 늘어난다(channelPrefs.js가 진짜 설정을 두는 이유와 반대 판단 — 이건 설정이 아니라
// "방금 어디 있었나"일 뿐이다).
const LAST_CHANNEL_KEY = 'lastChannelId'

export default function Channels() {
  const { channelId, requestId } = useParams()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  // 'directory'는 채널 id가 아니라 정적 경로다(App.jsx). 채널과 같은 사이드바를 쓰는
  // 화면이라 페이지를 따로 만들지 않고 오른쪽 칸만 갈아 끼운다 — 페이지를 나누면 새 채널·
  // 새 대화 대화상자와 그 상태를 두 벌 들고 있어야 한다.
  const directory = pathname === '/channels/directory'
  // 글쓰기·고치기도 채널과 같은 사이드바 위에서 자리만 바꿔 그린다(PLAN_composer.md §2) —
  // 채널이 사라지지 않아야 쓰는 동안에도 옆 탭에 오간 말이 그대로 보인다.
  const composingNew = pathname === `/channels/${channelId}/new`
  const editingPostId = pathname.endsWith('/edit') ? requestId : null
  // 홈(레일의 '홈' 버튼)이 곧장 이 자리다 — channelId 없이 여기로 오면 아래 이펙트가
  // 직전 채널(또는 없으면 전체 공지)로 곧바로 돌린다. "3단이 비는 모습"을 없애려는 것이라
  // (사용자 요청, 2026-08-26), 리다이렉트가 끝나기 전 짧은 순간에도 빈 화면 문구 대신
  // 로딩 표시를 보여준다(아래 렌더 분기).
  const isHome = pathname === '/'
  const { user, userName, schoolId, isAdmin } = useAuth()
  const toast = useToast()
  const { channels, archivedChannels, leftChannels, dms, loading } = useChannels()
  const { members, loading: membersLoading, refetch: refetchMembers } = useSchoolMembers()
  const { channels: publicChannels, loading: publicLoading, reload: reloadPublic } = usePublicChannels(directory)

  const [editing, setEditing] = useState(null)      // null | 'new' | channel
  const [preset, setPreset] = useState(null)        // 새 채널을 미리 채워 열 때(디렉터리 그룹)
  const [pickingDm, setPickingDm] = useState(false)
  const [menuAnchor, setMenuAnchor] = useState(null)
  const [confirm, setConfirm] = useState(null)      // null | 'archive' | 'leave'
  const [busy, setBusy] = useState(false)
  // 캔버스 탭은 주소(requestId)가 정하고, 이 상태는 글이 열려 있지 않을 때만 쓴다.
  // 캔버스를 주소로 고르는 것은 P2a 이전부터 그랬고, 그래야 쿨메신저에 붙여넣은 링크가
  // 채널 머리까지 그대로 살아난다.
  const [sideView, setSideView] = useState('messages')   // 'messages' | 'archive'
  const [moreAnchor, setMoreAnchor] = useState(null)
  const [sharing, setSharing] = useState(false)   // 캔버스 넘기기 대화상자
  // 3단 오른쪽 4번째 칸(블록 댓글, PLAN_canvasBlocks.md Phase 4) — 어느 캔버스의 어느
  // 블록을 보고 있는지. WorkspaceLayout.jsx 자체는 안 건드리고 이 페이지가 캔버스 옆에
  // 조건부로 그린다(항상 있는 레일·사이드바와 달리 블록 하나를 고를 때만 뜨는 칸이라).
  const [blockComments, setBlockComments] = useState(null)   // { requestId, blockId } | null
  const { markRead } = useChannelPrefs()

  // 보관했거나 나간 채널도 주소로 열 수 있어야 한다. 목록에서 접었다고 해서 링크가
  // 죽으면, 쿨메신저로 돌던 채널 주소가 어느 날 갑자기 안 열린다.
  const active = useMemo(
    () => [...channels, ...archivedChannels, ...leftChannels, ...dms].find(c => c.id === channelId) || null,
    [channels, archivedChannels, leftChannels, dms, channelId],
  )

  // 홈 → 직전 채널(있으면) 또는 전체 공지로. 목록이 아직 안 왔으면(loading) 기다린다 —
  // 그 전에 돌리면 "직전 채널이 있었는지"를 알 방법이 없어 늘 전체 공지로만 떨어진다.
  useEffect(() => {
    if (!isHome || loading) return
    const known = new Set([...channels, ...archivedChannels, ...leftChannels, ...dms].map(c => c.id))
    let target = ALL_STAFF_CHANNEL_ID
    try {
      const last = localStorage.getItem(LAST_CHANNEL_KEY)
      if (last && known.has(last)) target = last
    } catch { /* 개인정보 보호 모드 등에서 localStorage가 막혀 있으면 기본값으로 */ }
    navigate(`/channels/${target}`, { replace: true })
  }, [isHome, loading, channels, archivedChannels, leftChannels, dms, navigate])

  // 채널을 열 때마다 "직전 채널"로 기억해 둔다. 디렉터리는 채널이 아니라 안 남긴다.
  useEffect(() => {
    if (!active?.id) return
    try { localStorage.setItem(LAST_CHANNEL_KEY, active.id) } catch { /* 막혀 있으면 그냥 넘어간다 */ }
  }, [active])

  /**
   * 캔버스 하나를 열 주소. 글쓴이면 늘 편집기로 보낸다 — 마감 여부와 무관하게, 돌아왔을
   * 때 "계속 쓰는 화면"이 나와야 한다는 사용자 확정(2026-08-26)에 따른 것. 제출현황
   * (완료 N/M명 확인·다시 알림·마감하기)은 더 이상 여기로 자동으로 떨어지지 않고,
   * PostComposer 안 '업무현황' 버튼을 눌러야 나온다 — 글쓴이가 아니면 그대로 보기
   * 화면(PostDetail)이라 대상자의 완료 체크 흐름은 그대로다.
   */
  const canvasUrl = (post) => {
    const editable = post?.createdBy === user?.uid
    return `/channels/${active.id}/${post.id}${editable ? '/edit' : ''}`
  }

  /**
   * 채널 머리에 세울 캔버스 탭.
   *
   * 살아 있는 글만 탭이 되고(isLivePost), CANVAS_TAB_MAX를 넘으면 오래된 것부터 '더보기'로
   * 접힌다. 지금 열려 있는 글이 그 안에 없으면 — 보관된 글을 목록에서 열었거나, 접힌 것을
   * 더보기에서 골랐을 때 — 맨 뒤에 한 자리를 만들어 붙인다. 안 그러면 눌러서 연 글의 탭이
   * 어디에도 없어서, 지금 뭘 보고 있는지가 화면에서 사라진다.
   */
  const canvas = useMemo(() => {
    const live = sortCanvasTabs((active?.posts || []).filter(p => isLivePost(p)))
    const shown = live.slice(0, CANVAS_TAB_MAX)
    const folded = live.slice(CANVAS_TAB_MAX)
    const archived = sortCanvasTabs((active?.posts || []).filter(p => !isLivePost(p)))

    const open = requestId ? (active?.posts || []).find(p => p.id === requestId) : null
    const tabs = open && !shown.some(p => p.id === open.id) ? [...shown, open] : shown
    return { tabs, folded, archived, open }
  }, [active, requestId])

  /**
   * MUI Tabs에 넘길 값. 어느 탭에도 없는 값을 주면 콘솔 경고가 뜨고 밑줄이 사라진다.
   *
   * 실제로 그럴 수 있는 경우가 둘 있다 — 주소의 글이 이 채널 글이 아니거나 아직 안 왔을 때,
   * 그리고 마지막 보관 글을 다시 꺼내서 '보관된 글' 탭 자체가 사라졌을 때다.
   */
  const tabValue = useMemo(() => {
    if (composingNew) return 'new'
    if (requestId) return canvas.tabs.some(p => p.id === requestId) ? requestId : false
    if (sideView === 'archive') return canvas.archived.length > 0 ? 'archive' : 'messages'
    return 'messages'
  }, [composingNew, requestId, sideView, canvas])

  const dm = isDm(active)
  // 나와의 대화 — memberUids가 나뿐인 DM. 헤더·빈 대화 문구를 "둘만"에서 "나만"으로
  // 바꿔야 한다 — 데이터모델은 같아도 실제로 보는 사람이 한 명뿐이라 문구가 틀리면
  // 여기가 메모장이라는 것이 아무 데도 드러나지 않는다.
  const isSelfDm = dm && (active?.memberUids || []).every(uid => uid === user?.uid)
  // 전교직원 채널은 학교 공지가 도착하는 유일한 자리라 나가기·보관을 막는다. 한 번 끊으면
  // 그 뒤로 오는 공지를 못 보는데 화면에는 아무 일도 없어 보인다(channels.js 참고).
  const allStaff = isAllStaffChannel(active)
  // DM에는 관리랄 것이 없다. 이름도 참여자도 고칠 수 없고(firestore.rules에서도 막는다),
  // 보관·나가기도 두지 않았다 — 둘 뿐인 대화에서 한쪽이 자리를 정리하는 동작은
  // 상대에게 어떻게 보일지가 정해지지 않았다. 필요해지면 그때 설계한다.
  const canManage = !dm && canManageChannel(active, user?.uid, isAdmin)
  const canPost = canPostTo(active, user?.uid, isAdmin)
  const iLeft = hasLeft(active, user?.uid)

  // 채널을 열 때 읽은 것으로 표시한다. 나갈 때 하면 창을 그냥 닫는 경우에 기록이 안 남아
  // 다음에 들어와도 안읽음 점이 그대로 있다.
  useEffect(() => {
    if (channelId) markRead(channelId).catch(() => {})
  }, [channelId, markRead])

  // 채널을 옮기면 대화로 돌아온다. 보관 목록에 머물러 있으면, 다음 채널을 열었을 때
  // 끝난 글부터 보이고 지금 오가는 말은 한 번 더 눌러야 나온다.
  useEffect(() => { setSideView('messages') }, [channelId])

  // 보던 캔버스(또는 편집 중인 글)가 바뀌면 블록 댓글 패널도 닫는다 — 안 그러면 다른
  // 글로 넘어갔는데 방금 전 블록의 댓글이 그대로 떠 있어 어느 글 얘기인지 헷갈린다.
  useEffect(() => { setBlockComments(null) }, [requestId, editingPostId, composingNew])

  /**
   * 저장된 참여자와 조건을 지금 다시 푼 결과의 차이.
   *
   * 구성원을 아직 못 읽었을 때는 아예 계산하지 않는다. 빈 명단으로 조건을 풀면 결과가
   * 0명이라 "전원이 빠집니다"가 잠깐 떴다 사라지는데, 그걸 본 사람은 갱신을 누르든
   * 안 누르든 이 표시를 다시는 믿지 않는다.
   */
  const sync = useMemo(() => {
    // DM은 조건으로 뽑은 명단이 아니라 두 사람을 지목한 것이라 '갱신'이라는 개념이 없다.
    if (!active || dm || membersLoading || members.length === 0) return NO_DIFF
    const resolved = resolveTargets(active.memberRule || {}, members)
    return { ...memberDiff(active.memberUids, resolved.uids), uids: resolved.uids }
  }, [active, dm, members, membersLoading])

  const nameOf = useMemo(() => {
    const byUid = new Map(members.map(m => [m.uid, m.name]))
    // 학교를 떠난 사람은 구성원 명단에 없다. uid를 그대로 보여주면 읽을 수 없으니
    // 빠진다는 사실만 알린다.
    return uid => byUid.get(uid) || '(명단에 없음)'
  }, [members])

  // 메시지 입력칸의 '@' 자동완성 — 학교 전체가 아니라 이 채널 참여자로 좁힌다
  // (ChannelMessages.jsx).
  const channelMembers = useMemo(() => {
    const uids = new Set(active?.memberUids || [])
    return members.filter(m => uids.has(m.uid))
  }, [members, active])

  // 이름 중복 검사에는 보관·나간 채널까지 넣는다. 보관함에 '성적-마감'이 있는데 같은
  // 이름으로 새로 만들 수 있으면, 나중에 보관을 푸는 순간 사이드바에 같은 이름이 둘이 된다.
  const allNames = useMemo(
    () => [...channels, ...archivedChannels, ...leftChannels].map(c => c.name),
    [channels, archivedChannels, leftChannels],
  )

  /** @returns {Promise<boolean>} 성공했는지. 실패한 뒤에도 화면을 옮기면 안 되는 곳에서 쓴다. */
  const run = async (fn, message, failure) => {
    setBusy(true)
    try {
      await fn()
      toast.success(message)
      return true
    } catch (e) {
      toast.error(failure, e)
      return false
    } finally {
      setBusy(false)
    }
  }

  const saveChannel = async (payload) => {
    try {
      if (editing === 'new') {
        const ref = await addDoc(collection(db, ...schoolPath(schoolId, COL.CHANNELS)), {
          ...payload,
          createdBy: user.uid,
          createdByName: userName,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
        toast.success(`'${payload.name}' 채널을 만들었습니다.`)
        navigate(`/channels/${ref.id}`)
      } else {
        // 만든 사람과 만든 시각은 고치지 않는다.
        // leftUids·archived도 뺀다 — 새 채널의 기본값이라 그대로 쓰면 채널을 고치는
        // 것만으로 나간 사람이 전부 되돌아오고 보관도 풀린다.
        const { createdBy, createdByName, leftUids, archived, ...rest } = payload
        // 공개 범위나 참여자가 바뀌면 이 채널 글의 열람 범위도 같이 움직여야 한다.
        // 채널만 비공개로 돌리고 글을 그대로 두면 이름만 감춘 셈이 된다.
        await updateChannelAndPosts({
          schoolId,
          channelId: editing.id,
          patch: rest,
          channelAfter: { ...editing, ...rest },
          posts: editing.posts || [],
        })
        toast.success('채널을 저장했습니다.')
      }
    } catch (e) {
      toast.error('채널을 저장하지 못했습니다.', e)
      throw e
    }
  }

  /**
   * 고른 사람과의 대화를 연다. 없으면 만들면서 연다.
   *
   * 문서를 만들자마자 그리로 이동한다. 사이드바 목록에 뜨기를 기다리지 않는 이유는,
   * 구독 스냅샷이 도착하는 짧은 사이에 "눌렀는데 아무 일도 안 일어난" 화면이 되기
   * 때문이다. 채널 페이지는 id로 열리므로 목록보다 먼저 도착해도 문제가 없다.
   */
  const startDm = async (member) => {
    setBusy(true)
    try {
      const id = await openDm({
        schoolId,
        me: { uid: user.uid, name: userName },
        other: { uid: member.uid, name: member.name },
        existingIds: dms.map(c => c.id),
      })
      setPickingDm(false)
      navigate(`/channels/${id}`)
    } catch (e) {
      toast.error('대화를 열지 못했습니다.', e)
    } finally {
      setBusy(false)
    }
  }

  /** 공개 채널에 스스로 참여한 뒤 그 채널로 들어간다. 참여만 하고 그 자리에 서 있으면
   *  "됐나?" 싶어 한 번 더 누르게 된다. */
  const joinChannel = async (channel) => {
    const ok = await run(
      () => joinPublicChannel({ schoolId, channelId: channel.id, uid: user.uid }),
      `'${channel.name}' 채널에 참여했습니다.`,
      '채널에 참여하지 못했습니다.',
    )
    if (!ok) return
    // 둘러보기 목록은 구독이 아니라 한 번 읽기라, 다시 읽지 않으면 '참여 중' 표시가 안 바뀐다.
    reloadPublic()
    navigate(`/channels/${channel.id}`)
  }

  /** 그룹을 조건 그대로 들고 새 채널 대화상자를 연다. uid를 복사하지 않는 이유는
   *  directory.js의 groupToMemberRule 주석 참고 — 조건이어야 인사이동 뒤에 갱신 표시가 뜬다. */
  const newChannelFromGroup = ({ name, rule }) => {
    setPreset({ name, memberRule: rule })
    setEditing('new')
  }

  /**
   * 글을 채널이나 사람에게 전달한다.
   *
   * 사람을 고르면 그 사람과의 DM을 열어(없으면 만들어) 거기에 남긴다. DM이 "이름 없는 2인
   * 채널"이라 전달 코드가 한 벌로 끝나는 것이 여기서 드러난다 — 채널이든 사람이든 마지막에
   * 하는 일은 같다.
   */
  const forwardPost = async ({ picked, note, post }) => {
    if (!picked || !post) return
    setBusy(true)
    try {
      const targetChannelId = picked.kind === 'member'
        ? await openDm({
          schoolId,
          me: { uid: user.uid, name: userName },
          other: { uid: picked.member.uid, name: picked.member.name },
          existingIds: dms.map(c => c.id),
        })
        : picked.id

      await shareCanvasToChannel({
        schoolId,
        targetChannelId,
        post,
        author: { uid: user.uid, name: userName },
        note,
      })
      toast.success(`${picked.name}에게 전달했습니다.`)
    } catch (e) {
      toast.error('전달하지 못했습니다.', e)
    } finally {
      setBusy(false)
    }
  }

  /** 쿨메신저에 붙여넣는 것이 아직도 가장 빠른 경우가 있어서 그 길을 막지 않는다. */
  const copyPostLink = async (post) => {
    if (!post) return
    const url = `${window.location.origin}/channels/${post.channelId || active?.id}/${post.id}`
    try {
      await navigator.clipboard.writeText(url)
      toast.success('링크를 복사했습니다.')
    } catch (e) {
      toast.error('링크를 복사하지 못했습니다.', e)
    }
  }

  const sidebar = (
    <ChannelSidebar
      channels={channels}
      archivedChannels={archivedChannels}
      leftChannels={leftChannels}
      dms={dms}
      myUid={user?.uid}
      loading={loading}
      activeChannelId={channelId}
      directoryActive={directory}
      onNewChannel={() => { setPreset(null); setEditing('new') }}
      onNewDm={() => setPickingDm(true)}
      onSelfDm={() => startDm({ uid: user.uid, name: userName })}
    />
  )

  return (
    <WorkspaceLayout sidebar={sidebar}>
      {directory ? (
        <Directory
          members={members}
          membersLoading={membersLoading}
          myUid={user?.uid}
          busy={busy}
          publicChannels={publicChannels}
          channelsLoading={publicLoading}
          onOpenChannel={c => navigate(`/channels/${c.id}`)}
          onJoinChannel={joinChannel}
          onStartDm={startDm}
          onNewChannelFromGroup={newChannelFromGroup}
        />
      ) : !active && requestId ? (
        // 채널을 못 찾았는데 글 주소가 있으면 글만 그린다. 보관한 채널의 글을 링크로 열거나
        // 채널 목록이 아직 안 왔을 때인데, 채널 껍데기를 기다리느라 글을 못 보여줄 이유가 없다.
        <PostDetail
          requestId={requestId}
          onDeleted={() => navigate(`/channels/${channelId}`)}
        />
      ) : active ? (
        // 세로 flex + height 100%. 메시지 목록이 화면 안에서 따로 스크롤되고 입력칸은
        // 아래에 붙어 있어야 하는데, 문서 흐름대로 두면 입력칸이 대화 밑으로 밀려 내려간다.
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
          <Box sx={{ flexShrink: 0, px: 2, pt: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 0.5 }}>
            {/* 비공개 채널은 자물쇠로 갈음한다. 여기가 아니라 설명 줄에만 적으면
                글을 쓰는 순간에는 눈에 안 들어온다 — 정작 그때 알아야 하는 사실이다. */}
            {dm
              ? <PersonIcon sx={{ fontSize: 22, color: 'text.disabled', mt: '2px' }} />
              : isPrivateChannel(active)
                ? <LockIcon sx={{ fontSize: 20, color: 'warning.main', mt: '3px' }} />
                : <TagIcon sx={{ fontSize: 22, color: 'text.disabled', mt: '2px' }} />}
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <Typography variant="h6" fontWeight={800}>
                {dm ? dmTitle(active, user?.uid) : active.name}
              </Typography>
              <Typography fontSize="0.76rem" color="text.secondary">
                {dm ? (
                  // 관리자도 못 읽는다는 사실을 적어 둔다. 업무 채널과 생김새가 같아서
                  // 여기가 둘만(혹은 나만) 보는 자리라는 것이 달리 드러날 곳이 없다
                  // (데이터모델 §10).
                  isSelfDm ? '나만 보는 공간입니다. 관리자도 읽지 않습니다.' : '둘만 보는 대화입니다. 관리자도 읽지 않습니다.'
                ) : (
                  <>
                    {isPrivateChannel(active) && '비공개 · '}
                    참여 {active.memberUids?.length ?? 0}명
                    {active.memberRuleText && ` · ${active.memberRuleText}`}
                    {channelPostPolicy(active) === POST_POLICY.OWNER && ' · 공지 전용'}
                  </>
                )}
              </Typography>
            </Box>
            {canManage && (
              <Tooltip title="채널 고치기">
                <IconButton size="small" onClick={() => setEditing(active)}>
                  <EditIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
            )}
            {!dm && (
              <Tooltip title="채널 관리">
                <IconButton size="small" onClick={e => setMenuAnchor(e.currentTarget)}>
                  <MoreVertIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
            )}
          </Box>

          {active.description && (
            <Typography fontSize="0.85rem" color="text.secondary" sx={{ mb: 1.5 }}>
              {active.description}
            </Typography>
          )}

          {active.archived && (
            <StateNote>
              보관된 채널입니다. 목록에서만 접혀 있을 뿐 아래 글은 그대로 있고, 새 글도 쓸 수 있습니다.
            </StateNote>
          )}

          {iLeft && (
            <StateNote>
              나간 채널입니다. 목록에서만 빠져 있고, 이 채널에 올라오는 업무 요청은 대상에 들어 있는 한 그대로 받습니다.
            </StateNote>
          )}

          {canManage && sync.changed && (
            <MemberSyncNote
              added={sync.added} removed={sync.removed} nameOf={nameOf} busy={busy}
              // 화면에 보이는 sync.uids로 바로 쓰지 않는다. 그건 이 페이지가 마운트될 때
              // 읽은 명단으로 계산한 값이고, 트레이 상주 앱은 그 마운트가 며칠 전일 수
              // 있다. 그 사이 누군가의 직급·부서가 바뀌었으면 옛 데이터로 계산한 명단이
              // 그대로 써진다 — 실제로 이 경로에서 채널을 만든 사람 본인이 조용히
              // 빠지는 사고가 있었다(2026-08-25, useSchoolMembers.js 주석 참고).
              // 누르는 순간 다시 읽어 그 결과로 계산한다.
              onRefresh={() => run(
                async () => {
                  const fresh = await refetchMembers()
                  const freshUids = resolveTargets(active.memberRule || {}, fresh).uids
                  await refreshChannelMembers({
                    schoolId, channelId: active.id, memberUids: freshUids,
                    channel: active, posts: active.posts || [],
                  })
                },
                '참여자를 갱신했습니다.',
                '참여자를 갱신하지 못했습니다.',
              )}
            />
          )}

            {/* 대화와 업무 글을 탭으로 가른다. 한 화면에 쌓으면 대화가 길어질수록 업무 글이
                아래로 밀려 안 보이는데, 정작 마감이 걸린 것은 그쪽이다.

                DM에는 업무 글을 두지 않는다. 업무 글은 requests 최상위 컬렉션이라 학교
                관리자가 읽을 수 있는데, DM 메시지는 관리자 열람에서 빼기로 못 박았다
                (데이터모델 §10). DM 안에 업무 글을 허용하면 "둘만 본다"가 한쪽으로 샌다.
                한 사람에게만 시키는 일은 업무 글의 대상을 그 사람으로 지정하면 된다. */}
            {!dm && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1 }}>
                <Tabs
                  value={tabValue}
                  onChange={(e, v) => {
                    if (v === 'messages' || v === 'archive') { setSideView(v); navigate(`/channels/${active.id}`) }
                    else navigate(canvasUrl(canvas.tabs.find(p => p.id === v) || { id: v }))
                  }}
                  variant="scrollable" scrollButtons={false}
                  sx={{
                    minHeight: 36, minWidth: 0, flexShrink: 1,
                    '& .MuiTab-root': {
                      minHeight: 36, fontSize: '0.82rem', fontWeight: 700, maxWidth: 180,
                      // 기본 text.secondary가 흐려서 진하게 지정한다(사용자 지적,
                      // 2026-08-26) — 선택된 탭은 그대로 primary(Blue Fusion)를 쓴다.
                      color: 'text.primary', minWidth: 0, gap: 0.5,
                    },
                  }}
                >
                  {/* '대화'가 아니라 '메시지' — 쿨메신저를 쓰던 사람에게 '대화'는 1:1 창을
                      가리키는 말이라 DM과 뜻이 겹친다(PLAN_composer.md §3 용어 정리) */}
                  <Tab
                    value="messages" label="메시지"
                    icon={<ForumOutlinedIcon sx={{ fontSize: 16 }} />} iconPosition="start"
                  />
                  {canvas.tabs.map(p => (
                    <Tab
                      key={p.id} value={p.id} label={p.title}
                      // 캔버스마다 고를 수 있는 아이콘은 다음 라운드로 미룬다 — 지금은
                      // 전부 같은 문서 아이콘(canvasRefCard.js의 📄와 같은 의미).
                      icon={<DescriptionOutlinedIcon sx={{ fontSize: 16 }} />} iconPosition="start"
                    />
                  ))}
                  {/* 새 글을 쓰는 동안만 뜨는 임시 탭. 저장하면 진짜 캔버스 탭이 그 자리를
                      대신하고, 취소하거나 다른 탭으로 옮기면 그냥 사라진다 — 초안을 남기지
                      않기로 했다(PLAN_composer.md §8). */}
                  {composingNew && <Tab value="new" label="새 글" />}
                  {/* 보관된 글이 하나도 없으면 탭을 만들지 않는다. 대부분의 채널에서 한동안
                      빈 칸일 텐데, 늘 자리를 차지하면 정작 살아 있는 캔버스가 먼저 접힌다. */}
                  {canvas.archived.length > 0 && sideView === 'archive' && !requestId && (
                    <Tab value="archive" label={`보관된 글 ${canvas.archived.length}`} />
                  )}
                </Tabs>

                {/* 새 캔버스 만들기 — Slack의 탭 줄 '＋'와 같은 자리(PLAN_composer.md §2).
                    공지 전용 채널의 참여자에게는 애초에 안 보인다 — 눌러도 규칙에 막혀
                    튕기면 기능이 고장 난 것으로 읽는다. Tabs가 flexGrow를 더는 안 가져가서
                    (바로 위 sx 참고) 마지막 탭 바로 옆에 붙는다 — 예전엔 Tabs 박스 전체가
                    폭을 다 차지해 이 버튼이 줄 맨 끝으로 밀려났다(사용자 지적, 2026-08-26). */}
                {canPost && !composingNew && (
                  <Tooltip title="새 글">
                    <IconButton
                      size="small"
                      onClick={() => navigate(`/channels/${active.id}/new`)}
                      sx={{ flexShrink: 0, color: 'text.primary' }}
                    >
                      <AddIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                  </Tooltip>
                )}

                {/* 남는 폭을 여기서 흡수한다 — '더보기'만 줄 오른쪽 끝에 고정하고
                    싶은데, 그 역할을 Tabs가 대신 하던 게 위 버그의 원인이었다. */}
                <Box sx={{ flexGrow: 1 }} />

                {(canvas.folded.length > 0 || canvas.archived.length > 0) && (
                  <Button
                    size="small" endIcon={<ExpandMoreIcon sx={{ fontSize: 16 }} />}
                    onClick={e => setMoreAnchor(e.currentTarget)}
                    sx={{ flexShrink: 0, fontSize: '0.8rem', fontWeight: 700, color: 'text.secondary' }}
                  >
                    더보기{canvas.folded.length > 0 ? ` ${canvas.folded.length}` : ''}
                  </Button>
                )}
              </Box>
            )}

            {/* 탭 줄과 아래 목록을 가르는 연한 구분선(사용자 요청, 2026-08-26) —
                DM에는 탭이 없어 !dm 블록 밖, 헤더 전체(제목 포함) 아래에 하나만 둔다. */}
            <Divider sx={{ mt: 1.5 }} />
          </Box>

          <Box sx={{ flexGrow: 1, minHeight: 0 }}>
            {composingNew || editingPostId ? (
              // PostComposer가 height:100% 세로 flex를 스스로 관리한다(제목·설정은
              // 고정, 본문만 스크롤, 저장 버튼은 아래 고정) — PostDetail처럼 바깥에서
              // overflowY:auto로 한 번 더 감싸면 저장 버튼까지 함께 스크롤돼 버린다.
              //
              // 블록 댓글 패널(4번째 칸, PLAN_canvasBlocks.md Phase 4)은 이 칸 안에서
              // 캔버스 옆에만 조건부로 뜬다 — WorkspaceLayout.jsx의 레일·사이드바처럼
              // 늘 있는 칸이 아니라서 그쪽을 고치지 않고 여기서 이렇게 다룬다.
              <Box sx={{ display: 'flex', height: '100%', minHeight: 0 }}>
                <Box sx={{ flexGrow: 1, minWidth: 0, height: '100%' }}>
                  <PostComposer
                    channel={active}
                    editingId={editingPostId}
                    members={members}
                    membersLoading={membersLoading}
                    // 자동저장이 새 글을 처음 만든 순간 1회 — 주소를 /new에서 /edit로 조용히
                    // 바꾼다. 보기 주소(/edit 없는)로 보내면 PostComposer 대신 PostDetail이
                    // 그려져, 한창 쓰는 중인 화면이 읽기 화면으로 튕겨버린다.
                    onSaved={id => navigate(`/channels/${active.id}/${id}/edit`, { replace: true })}
                    onCancel={() => navigate(editingPostId ? `/channels/${active.id}/${editingPostId}` : `/channels/${active.id}`)}
                    onOpenCanvasRef={to => navigate(to)}
                    onOpenBlockComments={setBlockComments}
                  />
                </Box>
                {blockComments && (
                  <BlockCommentsPanel
                    requestId={blockComments.requestId}
                    blockId={blockComments.blockId}
                    members={members}
                    onClose={() => setBlockComments(null)}
                  />
                )}
              </Box>
            ) : requestId ? (
              // 캔버스 하나. 탭 바는 위에 그대로 남는다 — 글을 열 때마다 채널 머리가
              // 통째로 사라지면, 돌아오려고 뒤로 가기를 눌러야 하고 옆 캔버스로 바로
              // 건너뛸 수도 없다.
              <Box sx={{ display: 'flex', height: '100%', minHeight: 0 }}>
                <Box sx={{ flexGrow: 1, minWidth: 0, height: '100%', overflowY: 'auto' }}>
                  <PostDetail
                    requestId={requestId}
                    onDeleted={() => navigate(`/channels/${active.id}`)}
                    onOpenBlockComments={setBlockComments}
                  />
                </Box>
                {blockComments && (
                  <BlockCommentsPanel
                    requestId={blockComments.requestId}
                    blockId={blockComments.blockId}
                    members={members}
                    onClose={() => setBlockComments(null)}
                  />
                )}
              </Box>
            ) : !dm && sideView === 'archive' ? (
              <Box sx={{ height: '100%', overflowY: 'auto', px: 2, pb: 2 }}>
                <Typography color="text.secondary" fontSize="0.78rem" sx={{ mt: 1.5, mb: 1 }}>
                  끝난 글입니다. 지워진 것이 아니라 채널 머리의 탭에서만 접혔습니다.
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.6 }}>
                  {canvas.archived.map(p => (
                    <PostRow
                      key={p.id}
                      post={p}
                      onClick={() => navigate(canvasUrl(p))}
                      onUnarchive={canManage ? () => run(
                        () => setPostArchived({ schoolId, requestId: p.id, archived: false }),
                        '탭에 다시 올렸습니다.',
                        '다시 꺼내지 못했습니다.',
                      ) : undefined}
                      busy={busy}
                    />
                  ))}
                </Box>
              </Box>
            ) : (
              <ChannelMessages
                channelId={active.id}
                canPost={canPost}
                onOpenCanvas={to => navigate(to)}
                canvases={active.posts || []}
                // '#' 자동완성은 이 채널 목록에서 고른다(DM은 안 보여준다 — 다른 사람과의
                // 1:1 대화를 채널 메시지에 노출하는 셈이 된다). '@'는 학교 전체가 아니라
                // 이 채널 참여자로 좁힌다 — 없는 사람을 멘션하게 두지 않는다.
                channels={channels}
                members={channelMembers}
                empty={isSelfDm ? (
                  <Box sx={{ py: 4, px: 3, textAlign: 'center' }}>
                    <Typography fontWeight={800} fontSize="0.92rem" sx={{ mb: 0.8 }}>
                      나와의 대화
                    </Typography>
                    <Typography color="text.secondary" fontSize="0.83rem" sx={{ lineHeight: 1.6 }}>
                      나만 쓰는 공간입니다. 메모를 남기거나 할 일을 적어두거나 링크·파일을
                      간편하게 보관해 보세요. 혼잣말도 괜찮지만, 대화를 주고받으려면 스스로
                      묻고 답해야 한다는 점만 참고해 주세요.
                    </Typography>
                  </Box>
                ) : dm ? (
                  <Typography color="text.secondary" fontSize="0.88rem" sx={{ py: 4, textAlign: 'center' }}>
                    아직 대화가 없습니다. 여기에 적은 말은 둘만 봅니다.
                  </Typography>
                ) : (active.posts || []).length > 0 ? (
                  // 캔버스가 하나라도 있으면 채널은 이미 굴러가고 있다. 그때도 "첫 글을
                  // 쓰세요"를 띄우면 이미 한 일을 다시 권하는 셈이다.
                  <Typography color="text.secondary" fontSize="0.88rem" sx={{ py: 4, textAlign: 'center' }}>
                    아직 대화가 없습니다. 되묻고 싶은 것을 여기에 적으면 답이 이 채널에 남습니다.
                  </Typography>
                ) : (
                  <ChannelIntro
                    channel={active}
                    canPost={canPost}
                    canManage={canManage}
                    onNewPost={() => navigate(`/channels/${active.id}/new`)}
                    onEditChannel={() => setEditing(active)}
                  />
                )}
                postBlockedReason={
                  iLeft
                    ? '나간 채널입니다. 다시 참여하면 대화에 쓸 수 있습니다.'
                    : '공지 전용 채널이라 만든 사람만 씁니다.'
                }
              />
            )}
          </Box>
        </Box>
      ) : isHome ? (
        // 위 리다이렉트 이펙트가 곧 실제 채널로 옮겨준다 — "채널을 선택하세요"라고
        // 안내하면 이 순간에만 잠깐 보였다 사라질 문구를 사람이 읽으려 든다.
        <DetailPlaceholder emoji="⏳" message="불러오는 중…" />
      ) : (
        <DetailPlaceholder emoji="#️⃣" message="왼쪽에서 채널을 선택하세요." />
      )}

      {/* 탭에서 접힌 캔버스와 보관된 글. 접힌 것을 여기서 고르면 그 글이 탭 자리를
          하나 얻는다(canvas.tabs) — 고른 것이 어디에도 안 보이면 뭘 보고 있는지 알 수 없다. */}
      <Menu
        anchorEl={moreAnchor} open={!!moreAnchor} onClose={() => setMoreAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        {canvas.folded.map(p => (
          <MenuItem
            key={p.id}
            sx={{ fontSize: '0.85rem', maxWidth: 280 }}
            onClick={() => { setMoreAnchor(null); navigate(canvasUrl(p)) }}
          >
            <Typography fontSize="0.85rem" noWrap>{p.title}</Typography>
          </MenuItem>
        ))}
        {canvas.folded.length > 0 && canvas.archived.length > 0 && <Divider />}
        {canvas.archived.length > 0 && (
          <MenuItem
            sx={{ fontSize: '0.85rem', color: 'text.secondary' }}
            onClick={() => { setMoreAnchor(null); setSideView('archive'); navigate(`/channels/${active.id}`) }}
          >
            보관된 글 {canvas.archived.length}
          </MenuItem>
        )}
      </Menu>

      <Menu
        anchorEl={menuAnchor} open={!!menuAnchor} onClose={() => setMenuAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        {allStaff ? (
          <MenuItem disabled sx={{ fontSize: '0.8rem', whiteSpace: 'normal', maxWidth: 240 }}>
            학교 공지가 도착하는 자리라 나가거나 보관할 수 없습니다.
          </MenuItem>
        ) : iLeft ? (
          <MenuItem
            sx={{ fontSize: '0.85rem' }}
            onClick={() => {
              setMenuAnchor(null)
              run(
                () => setChannelLeft({ schoolId, channelId: active.id, uid: user.uid, left: false }),
                '다시 참여했습니다.',
                '다시 참여하지 못했습니다.',
              )
            }}
          >
            다시 참여
          </MenuItem>
        ) : (
          <MenuItem
            sx={{ fontSize: '0.85rem' }}
            onClick={() => { setMenuAnchor(null); setConfirm('leave') }}
          >
            채널 나가기
          </MenuItem>
        )}
        {/* 캔버스를 다른 채널로 넘긴다. 비공개 채널의 글에는 자리 자체를 만들지 않는다 —
            넘겨봐야 참여자 아닌 사람에게는 안 열리는 줄만 남는다(channelActions 참고).
            내용이 새지는 않는다. 그건 원본 글의 규칙이 지킨다. */}
        {canvas.open && !isPrivateChannel(active) && (
          <MenuItem
            sx={{ fontSize: '0.85rem' }}
            onClick={() => { setMenuAnchor(null); setSharing(true) }}
          >
            이 글 전달
          </MenuItem>
        )}

        {/* 자동 판정이 아직 안 끝났다고 보는 글을 사람이 먼저 치운다. 되돌리기의 짝이다 —
            한쪽만 있으면 마감일 없는 안내처럼 끝난 신호가 없는 글이 탭에서 안 빠진다. */}
        {canManage && canvas.open && isLivePost(canvas.open) && (
          <MenuItem
            sx={{ fontSize: '0.85rem' }}
            onClick={() => {
              setMenuAnchor(null)
              const id = canvas.open.id
              run(
                () => setPostArchived({ schoolId, requestId: id, archived: true }),
                '탭에서 치웠습니다. 보관된 글에서 다시 꺼낼 수 있습니다.',
                '치우지 못했습니다.',
              ).then(ok => { if (ok) navigate(`/channels/${active.id}`) })
            }}
          >
            이 글을 탭에서 치우기
          </MenuItem>
        )}
        {canManage && !allStaff && (
          active?.archived ? (
            <MenuItem
              sx={{ fontSize: '0.85rem' }}
              onClick={() => {
                setMenuAnchor(null)
                run(
                  () => setChannelArchived({ schoolId, channelId: active.id, archived: false }),
                  '보관을 풀었습니다.',
                  '보관을 풀지 못했습니다.',
                )
              }}
            >
              보관 해제
            </MenuItem>
          ) : (
            <MenuItem
              sx={{ fontSize: '0.85rem' }}
              onClick={() => { setMenuAnchor(null); setConfirm('archive') }}
            >
              채널 보관
            </MenuItem>
          )
        )}
      </Menu>

      <ConfirmDialog
        open={confirm === 'archive'}
        title="이 채널을 보관할까요?"
        name={active?.name}
        // 보관을 삭제로 오해하면 끝난 업무의 채널을 아무도 정리하지 않는다.
        // 글이 남는다는 것과 되돌릴 수 있다는 것을 둘 다 적는다.
        body="채널 목록에서 접히고 보관함으로 들어갑니다. 글은 하나도 지워지지 않고, 언제든 보관 해제로 다시 꺼낼 수 있습니다."
        action="보관"
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null)
          run(
            () => setChannelArchived({ schoolId, channelId: active.id, archived: true }),
            '채널을 보관했습니다.',
            '채널을 보관하지 못했습니다.',
          )
        }}
      />

      <ConfirmDialog
        open={confirm === 'leave'}
        title="이 채널에서 나갈까요?"
        name={active?.name}
        // 채널은 글을 모아 보는 틀이지 대상 지정이 아니다. 나가면 업무도 안 온다고
        // 오해하면, 정작 목록을 정리해야 할 사람이 무서워서 못 나간다.
        body="내 채널 목록에서만 빠집니다. 이 채널에 올라오는 업무 요청은 대상에 들어 있는 한 그대로 받고, 홈의 '요청받은 일'에도 계속 나옵니다. '나간 채널'에서 언제든 다시 참여할 수 있습니다."
        action="나가기"
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null)
          run(
            () => setChannelLeft({ schoolId, channelId: active.id, uid: user.uid, left: true }),
            '채널에서 나갔습니다.',
            '채널에서 나가지 못했습니다.',
          )
        }}
      />

      <ChannelDialog
        open={!!editing}
        channel={editing === 'new' ? null : editing}
        preset={editing === 'new' ? preset : null}
        existingNames={allNames}
        onClose={() => { setEditing(null); setPreset(null) }}
        onSave={saveChannel}
      />

      <ShareCanvasDialog
        open={sharing}
        post={canvas.open}
        sourceChannel={active}
        channels={channels}
        members={members}
        myUid={user?.uid}
        isAdmin={isAdmin}
        busy={busy}
        onClose={() => setSharing(false)}
        onCopyLink={p => copyPostLink(p)}
        onShare={({ picked, note }) => forwardPost({ picked, note, post: canvas.open })}
      />

      <DmDialog
        open={pickingDm}
        members={members}
        loading={membersLoading}
        myUid={user?.uid}
        busy={busy}
        onClose={() => setPickingDm(false)}
        onPick={startDm}
      />
    </WorkspaceLayout>
  )
}

/** 채널 상태 한 줄 안내 — 보관·나감처럼 "왜 목록에 없지"의 답이 되는 것들. */
function StateNote({ children }) {
  return (
    <Box sx={{
      border: '1px solid', borderColor: 'divider', borderRadius: 1,
      bgcolor: 'action.hover', px: 1.2, py: 0.8, mb: 1.2,
    }}>
      <Typography fontSize="0.76rem" color="text.secondary">{children}</Typography>
    </Box>
  )
}

/**
 * 참여자가 낡았다는 알림.
 *
 * 숫자만 쓰지 않고 이름을 같이 적는다. "3명 갱신 필요"만 있으면 누를지 말지 판단할
 * 근거가 없어 결국 눈 감고 누르게 되고, 그러면 확인을 받는 의미가 없다.
 */
function MemberSyncNote({ added, removed, nameOf, busy, onRefresh }) {
  const lines = []
  if (added.length > 0) lines.push(`추가 ${added.length}명 — ${added.map(nameOf).join(', ')}`)
  if (removed.length > 0) lines.push(`빠짐 ${removed.length}명 — ${removed.map(nameOf).join(', ')}`)

  return (
    <Box sx={{
      display: 'flex', alignItems: 'flex-start', gap: 1,
      border: '1px solid', borderColor: 'warning.light', borderRadius: 1,
      bgcolor: theme => alpha(theme.palette.warning.main, 0.07),
      px: 1.2, py: 0.9, mb: 1.2,
    }}>
      <PeopleIcon sx={{ fontSize: 17, color: 'warning.dark', mt: '2px', flexShrink: 0 }} />
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Typography fontSize="0.8rem" fontWeight={700} color="warning.dark">
          참여자 {added.length + removed.length}명 갱신 필요
        </Typography>
        {lines.map(line => (
          <Typography key={line} fontSize="0.76rem" color="text.secondary">{line}</Typography>
        ))}
      </Box>
      <Button size="small" variant="outlined" color="warning" disabled={busy} onClick={onRefresh}>
        갱신
      </Button>
    </Box>
  )
}

/** 되돌릴 수 있는 동작이라도 확인은 받는다. window.confirm은 앱과 모양이 따로 논다. */
function ConfirmDialog({ open, title, name, body, action, busy, onCancel, onConfirm }) {
  return (
    <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontSize: '1rem', fontWeight: 800 }}>{title}</DialogTitle>
      <DialogContent>
        <Typography fontSize="0.9rem"><strong>{name}</strong></Typography>
        <Typography color="text.secondary" fontSize="0.85rem" sx={{ mt: 1 }}>{body}</Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onCancel}>취소</Button>
        <Button variant="contained" disabled={busy} onClick={onConfirm}>{action}</Button>
      </DialogActions>
    </Dialog>
  )
}

/**
 * 채널 안의 글 한 줄 — 제목, 완료 현황, 마감.
 *
 * 보관된 글 목록에서만 '다시 꺼내기'가 붙는다. 줄 자체가 버튼이라 그 안에 버튼을 넣을 수
 * 없어서, 사이드바 줄과 같은 방식으로 옆에 나란히 둔다.
 */
function PostRow({ post, onClick, onUnarchive, busy }) {
  const request = isRequest(post)
  const stats = request ? completionStats(post) : null
  const due = request ? dueState(post) : null
  const settled = stats && stats.total > 0 && stats.doneCount === stats.total

  const row = (
    <Box
      component="button" type="button" onClick={onClick}
      sx={{
        display: 'flex', alignItems: 'center', gap: 1, width: '100%',
        border: '1px solid', borderColor: 'divider', borderRadius: 1,
        bgcolor: 'background.paper', textAlign: 'left', px: 1.2, py: 0.9,
        cursor: 'pointer', fontFamily: 'inherit',
        '&:hover': { borderColor: 'primary.light' },
      }}
    >
      <Typography component="span" fontSize="0.95rem" sx={{ flexShrink: 0 }}>
        {request ? (settled ? '✅' : '⬜') : '📢'}
      </Typography>
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Typography fontSize="0.88rem" fontWeight={600} noWrap>{post.title}</Typography>
        <Typography fontSize="0.76rem" color="text.secondary" noWrap>
          {post.createdByName}
          {due && due.label && ` · ${due.label}`}
        </Typography>
      </Box>
      {stats && (
        <MiniChip
          label={`${stats.doneCount}/${stats.total}`}
          tone={settled ? 'success' : DUE_TONE[due?.state] || 'neutral'}
        />
      )}
    </Box>
  )

  if (!onUnarchive) return row

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
      {row}
      <Button
        size="small" variant="outlined" disabled={busy}
        onClick={onUnarchive}
        sx={{ flexShrink: 0, fontSize: '0.76rem', whiteSpace: 'nowrap' }}
      >
        다시 꺼내기
      </Button>
    </Box>
  )
}
