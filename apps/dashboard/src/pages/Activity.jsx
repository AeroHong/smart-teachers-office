/**
 * 내 활동 — 안 한 일.
 *
 * 홈이 채널 목록으로 바뀌면서(2026-08-25, `PLAN_channels.md` "레일 구조 재편") 예전 홈의
 * "요청받은 일"이 갈 곳이 필요해졌다. 채널별 뱃지("마감 3")는 그 채널을 볼 때만 보이는데,
 * 정작 필요한 건 채널을 넘나들며 "지금 나한테 뭐가 남았지"에 답하는 자리다.
 *
 * 알림과 다른 점: 알림은 읽으면 사라지고 **할 일은 하기 전에는 안 사라진다.** 3주 전 요청을
 * 아직 완료 체크 안 했다면 알림은 이미 없어졌어도 이 목록엔 그대로 있어야 한다.
 *
 * 지금은 "안 한 일" 하나뿐이다. 멘션·전체·채널 관리는 P4 이후에 이 자리에 더한다
 * (`PLAN_channels.md` 목표 1단 — "내 활동 → 안 한 일 · 멘션 · DM · 전체 · 채널 관리").
 */
import { useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import TaskAltIcon from '@mui/icons-material/TaskAlt'
import { useAuth } from '@shared/contexts/AuthContext'
import { dueState, isDoneBy } from '@shared/lib/workRequests'
import WorkspaceLayout, { DetailPlaceholder } from '../components/WorkspaceLayout'
import { MiniChip, SidebarEmpty, SidebarItem, SidebarSection } from '../components/sidebarUi'
import PostDetail from '../components/PostDetail'
import useMyRequests from '../lib/useMyRequests'
import useSeenPosts from '../lib/useSeenPosts'

const DUE_TONE = { overdue: 'danger', today: 'danger', soon: 'warning', normal: 'neutral', closed: 'neutral', none: 'neutral' }

export default function Activity() {
  const { requestId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const requests = useMyRequests()
  const seen = useSeenPosts('request')

  const pendingCount = useMemo(
    () => requests.filter(r => !isDoneBy(r, user?.uid)).length,
    [requests, user],
  )

  // 목록을 본 시점을 기록한다. 화면의 굵은 표시는 그대로 둬서 무엇이 새로 왔는지 계속 보인다.
  useEffect(() => { if (pendingCount > 0) seen.markSeen() }, [pendingCount, seen])

  const sidebar = (
    <SidebarSection
      label="안 한 일"
      icon={TaskAltIcon}
      badge={pendingCount}
      open
      onToggle={() => {}}
    >
      {requests.length === 0 ? <SidebarEmpty>받은 요청이 없습니다</SidebarEmpty> : requests.map((r) => {
        const done = isDoneBy(r, user?.uid)
        const due = dueState(r)
        const selected = requestId === r.id
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
  )

  return (
    <WorkspaceLayout sidebar={sidebar}>
      {requestId ? (
        <PostDetail requestId={requestId} onDeleted={() => navigate('/activity')} />
      ) : (
        <DetailPlaceholder emoji="✅" message="왼쪽에서 항목을 선택하면 여기에 내용이 열립니다." />
      )}
    </WorkspaceLayout>
  )
}

// SidebarSection이 항상 펼쳐진 단일 섹션이라 접기 아이콘이 무의미하게 보일 수 있는데,
// 지금은 이 화면에 섹션이 하나뿐이라 접었다 폈다 할 대상이 없다. 나중에 멘션·전체가
// 더해지면 그때 자연히 접고 펴는 의미가 생긴다.
