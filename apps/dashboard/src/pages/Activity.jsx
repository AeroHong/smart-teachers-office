/**
 * 알림 — 업무 진행 중 · 새 공지·멘션·쪽지·채널 신설.
 *
 * 홈이 채널 목록으로 바뀌면서(2026-08-25, `PLAN_channels.md` "레일 구조 재편") 예전 홈의
 * "요청받은 일"이 갈 곳이 필요해졌다. 채널별 뱃지("마감 3")는 그 채널을 볼 때만 보이는데,
 * 정작 필요한 건 채널을 넘나들며 "지금 나한테 뭐가 남았지"에 답하는 자리다 — 이 화면의
 * "업무 진행 중" 섹션(옛 이름 "안 한 일")이 그 역할이다.
 *
 * "업무 진행 중"과 다른 점: 이쪽은 읽으면 사라지고, 저쪽은 **완료 전까지 안 사라진다.**
 * 3주 전 요청을 아직 완료 체크 안 했다면 알림은 이미 없어졌어도 저 목록엔 그대로 있어야
 * 한다 — 그래서 완료 개념이 있는 새 업무요청(kind='request')은 알림에 다시 넣지 않는다.
 * 이미 저기 떠 있는 걸 여기서도 보여주면 같은 일이 두 번 보인다.
 *
 * 알림 쪽은 사용자 요청(2026-08-31)에 따라 "이미 읽음 상태가 있는 것"부터 시작한다 —
 * 새 공지·멘션·쪽지·채널 신설. 댓글·일반 채널 메시지(멘션 아닌 것)는 읽음 판정 기반을
 * 새로 만들어야 해서 다음 단계로 미룬다(useNotificationFeed.js 참고).
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import TaskAltIcon from '@mui/icons-material/TaskAlt'
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, schoolPath } from '@shared/lib/schema'
import { dueState, isDoneBy } from '@shared/lib/workRequests'
import WorkspaceLayout, { DetailPlaceholder } from '../components/WorkspaceLayout'
import { MiniChip, SidebarEmpty, SidebarItem, SidebarSection } from '../components/sidebarUi'
import PostDetail from '../components/PostDetail'
import { ChannelDetail, MentionDetail, MessageDetail } from '../components/NotificationDetail'
import useMyRequests from '../lib/useMyRequests'
import useSeenPosts from '../lib/useSeenPosts'
import useNotificationFeed from '../lib/useNotificationFeed'

const DUE_TONE = { overdue: 'danger', today: 'danger', soon: 'warning', normal: 'neutral', closed: 'neutral', none: 'neutral' }

export default function Activity() {
  const { requestId } = useParams()
  const navigate = useNavigate()
  const { user, schoolId } = useAuth()
  const requests = useMyRequests()
  const seen = useSeenPosts('request')
  const { items: notifItems, unreadCount: notifUnread, markChannelRead } = useNotificationFeed()

  const [open, setOpen] = useState({ progress: true, notif: true })
  const [selectedNotif, setSelectedNotif] = useState(null) // { type:'mention'|'message'|'channel', id, ... } | null

  // 업무 진행 중으로 이동하면 그 옆에 열려 있던 알림 상세는 정리한다 — 3단에 둘 다 남아
  // 있을 이유가 없다.
  useEffect(() => { if (requestId) setSelectedNotif(null) }, [requestId])

  const pendingCount = useMemo(
    () => requests.filter(r => !isDoneBy(r, user?.uid)).length,
    [requests, user],
  )

  // 목록을 본 시점을 기록한다. 화면의 굵은 표시는 그대로 둬서 무엇이 새로 왔는지 계속 보인다.
  useEffect(() => { if (pendingCount > 0) seen.markSeen() }, [pendingCount, seen])

  const openNotif = (item) => {
    // 공지·멘션·채널 신설은 채널 단위 읽음이라, 열어본 채널을 지금 읽은 것으로 같이
    // 표시해야 굵은 글씨(안읽음)가 실제로 없어진다 — useNotificationFeed.js 위쪽 주석 참고.
    if (item.type === 'notice' || item.type === 'mention') markChannelRead(item.data.channelId)
    if (item.type === 'channel') markChannelRead(item.id)

    if (item.type === 'notice') { navigate(`/activity/${item.id}`); return }
    navigate('/activity')
    setSelectedNotif(item)
    // 쪽지만 문서 자체에 읽음 시각이 있다 — 열 때 딱 한 번 찍는다(Messages.jsx와 같은 기준).
    if (item.type === 'message' && !item.data.readAt) {
      updateDoc(doc(db, ...schoolPath(schoolId, COL.PERSONAL_NOTICES), item.id), {
        readAt: serverTimestamp(),
      }).catch(() => {})
    }
  }

  const sidebar = (
    <>
      <SidebarSection
        label="업무 진행 중"
        icon={TaskAltIcon}
        badge={pendingCount}
        open={open.progress}
        onToggle={() => setOpen(o => ({ ...o, progress: !o.progress }))}
      >
        {requests.length === 0 ? <SidebarEmpty>받은 요청이 없습니다</SidebarEmpty> : requests.map((r) => {
          const done = isDoneBy(r, user?.uid)
          const due = dueState(r)
          const selected = !selectedNotif && requestId === r.id
          return (
            <SidebarItem
              key={r.id}
              label={r.title}
              selected={selected}
              muted={done}
              strong={!done && seen.isNew(r)}
              onClick={() => navigate(`/activity/${r.id}`)}
              chip={
                !done && (r.remindedAt
                  ? <MiniChip label="다시 알림" tone="warning" selected={selected} />
                  : due.label ? <MiniChip label={due.label} tone={DUE_TONE[due.state]} selected={selected} /> : null)
              }
            />
          )
        })}
      </SidebarSection>

      <SidebarSection
        label="알림"
        icon={NotificationsNoneIcon}
        badge={notifUnread}
        open={open.notif}
        onToggle={() => setOpen(o => ({ ...o, notif: !o.notif }))}
      >
        {notifItems.length === 0 ? <SidebarEmpty>새 소식이 없습니다</SidebarEmpty> : notifItems.map((item) => {
          const selected = selectedNotif?.type === item.type && selectedNotif?.id === item.id
          return (
            <SidebarItem
              key={`${item.type}:${item.id}`}
              label={item.label}
              selected={selected}
              strong={item.isNew}
              highlightUnread
              onClick={() => openNotif(item)}
              chip={<MiniChip label={item.chipLabel} tone={item.isNew ? 'info' : 'neutral'} selected={selected} />}
            />
          )
        })}
      </SidebarSection>
    </>
  )

  return (
    <WorkspaceLayout sidebar={sidebar}>
      {requestId ? (
        <PostDetail requestId={requestId} onDeleted={() => navigate('/activity')} />
      ) : selectedNotif?.type === 'mention' ? (
        <MentionDetail item={selectedNotif} onOpenChannel={(channelId) => navigate(`/channels/${channelId}`)} />
      ) : selectedNotif?.type === 'message' ? (
        <MessageDetail item={selectedNotif} />
      ) : selectedNotif?.type === 'channel' ? (
        <ChannelDetail item={selectedNotif} onOpenChannel={(channelId) => navigate(`/channels/${channelId}`)} />
      ) : (
        <DetailPlaceholder emoji="✅" message="왼쪽에서 항목을 선택하면 여기에 내용이 열립니다." />
      )}
    </WorkspaceLayout>
  )
}
