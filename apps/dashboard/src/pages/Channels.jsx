/**
 * 채널 — 왼쪽에 채널 목록, 오른쪽에 그 채널의 업무 글.
 *
 * 목록에 뱃지로 "진행 중 / 마감 지남"을 붙인다. 채널을 열어봐야 챙길 게 있는지 알 수
 * 있으면 결국 다 열어보게 되고, 그러면 목록이 있으나 마나다.
 *
 * 글 목록은 시간순이 아니라 급한 순이다(sortByUrgency). 채널의 쓸모가 "지금 뭐가
 * 남았지"에 답하는 것이라, 최근에 쓴 글보다 마감이 코앞인 글이 위에 있어야 한다.
 */
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/EditOutlined'
import TagIcon from '@mui/icons-material/Tag'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, schoolPath } from '@shared/lib/schema'
import { completionStats, dueState, isRequest, sortByUrgency } from '@shared/lib/workRequests'
import WorkspaceLayout, { DetailPlaceholder } from '../components/WorkspaceLayout'
import { MiniChip, SidebarEmpty, SidebarItem } from '../components/sidebarUi'
import ChannelDialog from '../components/ChannelDialog'
import PostDetail from '../components/PostDetail'
import { useToast } from '../components/ToastProvider'
import useChannels from '../lib/useChannels'

const DUE_TONE = { overdue: 'danger', today: 'danger', soon: 'warning', normal: 'neutral', closed: 'neutral', none: 'neutral' }

export default function Channels() {
  const { channelId, requestId } = useParams()
  const navigate = useNavigate()
  const { user, userName, schoolId } = useAuth()
  const toast = useToast()
  const { channels, loading } = useChannels()
  const [editing, setEditing] = useState(null)   // null | 'new' | channel

  const active = useMemo(
    () => channels.find(c => c.id === channelId) || null,
    [channels, channelId],
  )
  const posts = useMemo(() => sortByUrgency(active?.posts || []), [active])
  const openPost = useMemo(
    () => posts.find(p => p.id === requestId) || null,
    [posts, requestId],
  )

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
        // 만든 사람과 만든 시각은 고치지 않는다
        const { createdBy, createdByName, ...rest } = payload
        await updateDoc(doc(db, ...schoolPath(schoolId, COL.CHANNELS), editing.id), {
          ...rest, updatedAt: serverTimestamp(),
        })
        toast.success('채널을 저장했습니다.')
      }
    } catch (e) {
      toast.error('채널을 저장하지 못했습니다.', e)
      throw e
    }
  }

  const sidebar = (
    <>
      <Button
        fullWidth size="small" startIcon={<AddIcon sx={{ fontSize: 17 }} />}
        onClick={() => setEditing('new')}
        sx={{ justifyContent: 'flex-start', mb: 0.5 }}
      >
        새 채널
      </Button>

      {loading ? null : channels.length === 0 ? (
        <SidebarEmpty>참여 중인 채널이 없습니다</SidebarEmpty>
      ) : channels.map(c => (
        <SidebarItem
          key={c.id}
          label={c.name}
          selected={c.id === channelId}
          onClick={() => navigate(`/channels/${c.id}`)}
          chip={
            c.stats.overdueCount > 0
              ? <MiniChip label={`마감 ${c.stats.overdueCount}`} tone="danger" selected={c.id === channelId} />
              : c.stats.openCount > 0
                ? <MiniChip label={c.stats.openCount} tone="neutral" selected={c.id === channelId} />
                : null
          }
        />
      ))}
    </>
  )

  return (
    <WorkspaceLayout sidebar={sidebar}>
      {openPost ? (
        <PostDetail
          request={openPost}
          onClose={() => navigate(`/channels/${channelId}`)}
        />
      ) : active ? (
        <Box sx={{ p: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 0.5 }}>
            <TagIcon sx={{ fontSize: 22, color: 'text.disabled', mt: '2px' }} />
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <Typography variant="h6" fontWeight={800}>{active.name}</Typography>
              <Typography fontSize="0.83rem" color="text.secondary">
                참여 {active.memberUids?.length ?? 0}명
                {active.memberRuleText && ` · ${active.memberRuleText}`}
              </Typography>
            </Box>
            <Tooltip title="채널 고치기">
              <IconButton size="small" onClick={() => setEditing(active)}>
                <EditIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
            <Button
              size="small" variant="contained"
              onClick={() => navigate(`/requests/new?channel=${active.id}`)}
            >
              글 쓰기
            </Button>
          </Box>

          {active.description && (
            <Typography fontSize="0.85rem" color="text.secondary" sx={{ mb: 1.5 }}>
              {active.description}
            </Typography>
          )}

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
      ) : (
        <DetailPlaceholder emoji="#️⃣" message="왼쪽에서 채널을 선택하세요." />
      )}

      <ChannelDialog
        open={!!editing}
        channel={editing === 'new' ? null : editing}
        existingNames={channels.map(c => c.name)}
        onClose={() => setEditing(null)}
        onSave={saveChannel}
      />
    </WorkspaceLayout>
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
