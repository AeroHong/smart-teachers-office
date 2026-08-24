/**
 * 채널 — 왼쪽에 채널 목록, 오른쪽에 그 채널의 업무 글.
 *
 * 목록에 뱃지로 "진행 중 / 마감 지남"을 붙인다. 채널을 열어봐야 챙길 게 있는지 알 수
 * 있으면 결국 다 열어보게 되고, 그러면 목록이 있으나 마나다.
 *
 * 글 목록은 시간순이 아니라 급한 순이다(sortByUrgency). 채널의 쓸모가 "지금 뭐가
 * 남았지"에 답하는 것이라, 최근에 쓴 글보다 마감이 코앞인 글이 위에 있어야 한다.
 *
 * 보관함과 '나간 채널'은 비어 있으면 아예 그리지 않는다. 대부분의 사람에게는 평생 빈
 * 칸이라, 늘 자리를 차지하면 268px 사이드바에서 정작 볼 채널이 밀려 내려간다.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'
import EditIcon from '@mui/icons-material/EditOutlined'
import LockIcon from '@mui/icons-material/LockOutlined'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import PeopleIcon from '@mui/icons-material/PeopleAltOutlined'
import TagIcon from '@mui/icons-material/Tag'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, schoolPath } from '@shared/lib/schema'
import { resolveTargets } from '@shared/lib/targeting'
import {
  POST_POLICY, canManageChannel, canPostTo, channelPostPolicy, hasLeft, isPrivateChannel, memberDiff,
} from '@shared/lib/channels'
import { completionStats, dueState, isRequest, sortByUrgency } from '@shared/lib/workRequests'
import WorkspaceLayout, { DetailPlaceholder } from '../components/WorkspaceLayout'
import { MiniChip } from '../components/sidebarUi'
import ChannelDialog from '../components/ChannelDialog'
import ChannelMessages from '../components/ChannelMessages'
import ChannelSidebar from '../components/ChannelSidebar'
import PostDetail from '../components/PostDetail'
import { useToast } from '../components/ToastProvider'
import useChannels from '../lib/useChannels'
import useChannelPrefs from '../lib/useChannelPrefs'
import useSchoolMembers from '../lib/useSchoolMembers'
import {
  refreshChannelMembers, setChannelArchived, setChannelLeft, updateChannelAndPosts,
} from '../lib/channelActions'

const DUE_TONE = { overdue: 'danger', today: 'danger', soon: 'warning', normal: 'neutral', closed: 'neutral', none: 'neutral' }

const NO_DIFF = { added: [], removed: [], changed: false }

export default function Channels() {
  const { channelId, requestId } = useParams()
  const navigate = useNavigate()
  const { user, userName, schoolId, isAdmin } = useAuth()
  const toast = useToast()
  const { channels, archivedChannels, leftChannels, loading } = useChannels()
  const { members, loading: membersLoading } = useSchoolMembers()

  const [editing, setEditing] = useState(null)      // null | 'new' | channel
  const [menuAnchor, setMenuAnchor] = useState(null)
  const [confirm, setConfirm] = useState(null)      // null | 'archive' | 'leave'
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState('messages')
  const { markRead } = useChannelPrefs()

  // 보관했거나 나간 채널도 주소로 열 수 있어야 한다. 목록에서 접었다고 해서 링크가
  // 죽으면, 쿨메신저로 돌던 채널 주소가 어느 날 갑자기 안 열린다.
  const active = useMemo(
    () => [...channels, ...archivedChannels, ...leftChannels].find(c => c.id === channelId) || null,
    [channels, archivedChannels, leftChannels, channelId],
  )
  const posts = useMemo(() => sortByUrgency(active?.posts || []), [active])

  const canManage = canManageChannel(active, user?.uid, isAdmin)
  const canPost = canPostTo(active, user?.uid, isAdmin)
  const iLeft = hasLeft(active, user?.uid)

  // 채널을 열 때 읽은 것으로 표시한다. 나갈 때 하면 창을 그냥 닫는 경우에 기록이 안 남아
  // 다음에 들어와도 안읽음 점이 그대로 있다.
  useEffect(() => {
    if (channelId) markRead(channelId).catch(() => {})
  }, [channelId, markRead])

  /**
   * 저장된 참여자와 조건을 지금 다시 푼 결과의 차이.
   *
   * 구성원을 아직 못 읽었을 때는 아예 계산하지 않는다. 빈 명단으로 조건을 풀면 결과가
   * 0명이라 "전원이 빠집니다"가 잠깐 떴다 사라지는데, 그걸 본 사람은 갱신을 누르든
   * 안 누르든 이 표시를 다시는 믿지 않는다.
   */
  const sync = useMemo(() => {
    if (!active || membersLoading || members.length === 0) return NO_DIFF
    const resolved = resolveTargets(active.memberRule || {}, members)
    return { ...memberDiff(active.memberUids, resolved.uids), uids: resolved.uids }
  }, [active, members, membersLoading])

  const nameOf = useMemo(() => {
    const byUid = new Map(members.map(m => [m.uid, m.name]))
    // 학교를 떠난 사람은 구성원 명단에 없다. uid를 그대로 보여주면 읽을 수 없으니
    // 빠진다는 사실만 알린다.
    return uid => byUid.get(uid) || '(명단에 없음)'
  }, [members])

  // 이름 중복 검사에는 보관·나간 채널까지 넣는다. 보관함에 '성적-마감'이 있는데 같은
  // 이름으로 새로 만들 수 있으면, 나중에 보관을 푸는 순간 사이드바에 같은 이름이 둘이 된다.
  const allNames = useMemo(
    () => [...channels, ...archivedChannels, ...leftChannels].map(c => c.name),
    [channels, archivedChannels, leftChannels],
  )

  const run = async (fn, message, failure) => {
    setBusy(true)
    try {
      await fn()
      toast.success(message)
    } catch (e) {
      toast.error(failure, e)
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

  const sidebar = (
    <ChannelSidebar
      channels={channels}
      archivedChannels={archivedChannels}
      leftChannels={leftChannels}
      loading={loading}
      activeChannelId={channelId}
      onNewChannel={() => setEditing('new')}
    />
  )

  return (
    <WorkspaceLayout sidebar={sidebar}>
      {requestId ? (
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
            {isPrivateChannel(active)
              ? <LockIcon sx={{ fontSize: 20, color: 'warning.main', mt: '3px' }} />
              : <TagIcon sx={{ fontSize: 22, color: 'text.disabled', mt: '2px' }} />}
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <Typography variant="h6" fontWeight={800}>{active.name}</Typography>
              <Typography fontSize="0.76rem" color="text.secondary">
                {isPrivateChannel(active) && '비공개 · '}
                참여 {active.memberUids?.length ?? 0}명
                {active.memberRuleText && ` · ${active.memberRuleText}`}
                {channelPostPolicy(active) === POST_POLICY.OWNER && ' · 공지 전용'}
              </Typography>
            </Box>
            {canManage && (
              <Tooltip title="채널 고치기">
                <IconButton size="small" onClick={() => setEditing(active)}>
                  <EditIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
            )}
            <Tooltip title="채널 관리">
              <IconButton size="small" onClick={e => setMenuAnchor(e.currentTarget)}>
                <MoreVertIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
            {/* 공지 전용 채널에서 참여자는 글을 못 쓴다. 눌린 뒤 규칙에 막혀 튕기면
                사용자는 기능이 고장 난 것으로 읽으므로 버튼 자체를 감춘다. */}
            {canPostTo(active, user?.uid, isAdmin) && (
              <Button
                size="small" variant="contained"
                onClick={() => navigate(`/requests/new?channel=${active.id}`)}
              >
                글 쓰기
              </Button>
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
              onRefresh={() => run(
                () => refreshChannelMembers({
                  schoolId, channelId: active.id, memberUids: sync.uids,
                  channel: active, posts: active.posts || [],
                }),
                `참여자를 ${sync.uids.length}명으로 갱신했습니다.`,
                '참여자를 갱신하지 못했습니다.',
              )}
            />
          )}

            {/* 대화와 업무 글을 탭으로 가른다. 한 화면에 쌓으면 대화가 길어질수록 업무 글이
                아래로 밀려 안 보이는데, 정작 마감이 걸린 것은 그쪽이다. */}
            <Tabs
              value={tab} onChange={(e, v) => setTab(v)}
              sx={{ minHeight: 36, mt: 1, '& .MuiTab-root': { minHeight: 36, fontSize: '0.82rem', fontWeight: 700 } }}
            >
              <Tab value="messages" label="대화" />
              <Tab value="posts" label={`업무 글${posts.length ? ` ${posts.length}` : ''}`} />
            </Tabs>
          </Box>

          <Box sx={{ flexGrow: 1, minHeight: 0 }}>
            {tab === 'messages' ? (
              <ChannelMessages
                channelId={active.id}
                canPost={canPost}
                postBlockedReason={
                  iLeft
                    ? '나간 채널입니다. 다시 참여하면 대화에 쓸 수 있습니다.'
                    : '공지 전용 채널이라 만든 사람만 씁니다.'
                }
              />
            ) : (
              <Box sx={{ height: '100%', overflowY: 'auto', px: 2, pb: 2 }}>
                {posts.length === 0 ? (
                  <Typography color="text.secondary" fontSize="0.88rem" sx={{ py: 4, textAlign: 'center' }}>
                    아직 글이 없습니다. 이 채널에 첫 글을 써보세요.
                  </Typography>
                ) : (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.6, mt: 1.5 }}>
                    {posts.map(p => (
                      <PostRow key={p.id} post={p} onClick={() => navigate(`/channels/${active.id}/${p.id}`)} />
                    ))}
                  </Box>
                )}
              </Box>
            )}
          </Box>
        </Box>
      ) : (
        <DetailPlaceholder emoji="#️⃣" message="왼쪽에서 채널을 선택하세요." />
      )}

      <Menu
        anchorEl={menuAnchor} open={!!menuAnchor} onClose={() => setMenuAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        {iLeft ? (
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
        {canManage && (
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
        existingNames={allNames}
        onClose={() => setEditing(null)}
        onSave={saveChannel}
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

/** 채널 안의 글 한 줄 — 제목, 완료 현황, 마감. */
function PostRow({ post, onClick }) {
  const request = isRequest(post)
  const stats = request ? completionStats(post) : null
  const due = request ? dueState(post) : null
  const settled = stats && stats.total > 0 && stats.doneCount === stats.total

  return (
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
}
