/**
 * 홈 — 왼쪽에 오늘 볼 것들, 오른쪽에 고른 것 하나.
 *
 * 위젯을 여러 장 깔던 화면을 대체한다. 위젯 다섯 장이 차지하던 자리에 제목만 나열하면
 * 열다섯 건이 들어가고, "오늘 뭐 있지"에 훨씬 잘 답한다. 고른 항목은 오른쪽에서 제 폭으로
 * 펼쳐지므로 자료·완료 명단이 좁아서 답답하던 문제도 같이 풀린다.
 *
 * 글(안내·요청)만 주소를 갖는다. 쿨메신저에 붙여넣는 링크가 특정 글을 가리켜야 하기
 * 때문이다. 호출·일정은 그럴 일이 없어 화면 안의 선택 상태로만 둔다.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import AddIcon from '@mui/icons-material/Add'
import { useAuth } from '@shared/contexts/AuthContext'
import { dueState, isDoneBy, isRequest } from '@shared/lib/workRequests'
import WorkspaceLayout, { DetailPlaceholder } from '../components/WorkspaceLayout'
import { MiniChip, SidebarEmpty, SidebarItem, SidebarSection } from '../components/sidebarUi'
import PostDetail from '../components/PostDetail'
import EventDetail from '../components/EventDetail'
import useHomeFeed from '../lib/useHomeFeed'
import TaskAltIcon from '@mui/icons-material/TaskAlt'
import CampaignIcon from '@mui/icons-material/Campaign'
import EventIcon from '@mui/icons-material/Event'
import LaunchIcon from '@mui/icons-material/Launch'
import useSeenPosts from '../lib/useSeenPosts'
import { EXTERNAL_LINKS } from '../lib/externalLinks'

const DUE_TONE = { overdue: 'danger', today: 'danger', soon: 'warning', normal: 'neutral', closed: 'neutral', none: 'neutral' }

export default function Home() {
  const { requestId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { requests, notices, events } = useHomeFeed()
  const seenRequests = useSeenPosts('request')
  const seenNotices = useSeenPosts('notice')

  // 글 외의 선택(호출·일정)은 주소가 없으므로 화면 안에서만 기억한다
  const [localSel, setLocalSel] = useState(null)
  // 학사일정도 펴둔다. 접어두면 D-day가 코앞인 일정을 열어봐야만 알 수 있는데,
  // 그건 "놓치지 않게 한다"는 이 화면의 목적과 어긋난다.
  // 바로가기는 접어둔 채로 시작한다 — 내용이 바뀌지 않는 고정 목록이라, 매일 챙겨야 하는
  // 요청·공지보다 먼저 눈에 들어오면 안 된다.
  const [open, setOpen] = useState({ requests: true, notices: true, events: true, links: false })

  // 글을 고르면 주소가 바뀌므로 화면 안의 선택은 지운다 (양쪽이 동시에 선택돼 보이지 않게)
  useEffect(() => { if (requestId) setLocalSel(null) }, [requestId])

  const pendingCount = useMemo(
    () => requests.filter(r => !isDoneBy(r, user?.uid)).length,
    [requests, user],
  )
  const newNoticeCount = useMemo(
    () => notices.filter(seenNotices.isNew).length,
    [notices, seenNotices],
  )

  // 목록을 본 시점을 기록한다. 화면의 굵은 표시는 그대로 둬서 무엇이 새로 왔는지 보인다.
  useEffect(() => { if (pendingCount > 0) seenRequests.markSeen() }, [pendingCount, seenRequests])
  useEffect(() => { if (newNoticeCount > 0) seenNotices.markSeen() }, [newNoticeCount, seenNotices])

  const selectPost = (id) => navigate(`/posts/${id}`)
  const selectLocal = (type, item) => { setLocalSel({ type, item }); if (requestId) navigate('/') }

  const sidebar = (
    <>
      <Button
        fullWidth size="small" variant="contained" startIcon={<AddIcon />}
        onClick={() => navigate('/requests/new')}
        sx={{ mb: 1 }}
      >
        글 쓰기
      </Button>

      <SidebarSection
        label="요청받은 일"
        icon={TaskAltIcon}
        badge={pendingCount}
        open={open.requests}
        onToggle={() => setOpen(o => ({ ...o, requests: !o.requests }))}
      >
        {requests.length === 0 ? <SidebarEmpty>받은 요청이 없습니다</SidebarEmpty> : requests.map(r => {
          const done = isDoneBy(r, user?.uid)
          const due = dueState(r)
          const selected = requestId === r.id
          return (
            <SidebarItem
              key={r.id}
              label={r.title}
              selected={selected}
              muted={done}
              strong={!done && seenRequests.isNew(r)}
              onClick={() => selectPost(r.id)}
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
        label="전체 공지"
        icon={CampaignIcon}
        count={notices.length}
        badge={newNoticeCount}
        open={open.notices}
        onToggle={() => setOpen(o => ({ ...o, notices: !o.notices }))}
      >
        {notices.length === 0 ? <SidebarEmpty>등록된 안내가 없습니다</SidebarEmpty> : notices.map(n => {
          const selected = requestId === n.id
          return (
            <SidebarItem
              key={n.id}
              label={n.title}
              selected={selected}
              strong={seenNotices.isNew(n)}
              onClick={() => selectPost(n.id)}
              chip={n.pinned ? <MiniChip label="고정" tone="warning" selected={selected} /> : null}
            />
          )
        })}
      </SidebarSection>

      <SidebarSection
        label="학사일정"
        icon={EventIcon}
        count={events.length}
        open={open.events}
        onToggle={() => setOpen(o => ({ ...o, events: !o.events }))}
      >
        {events.length === 0 ? <SidebarEmpty>예정된 일정이 없습니다</SidebarEmpty> : events.map(e => {
          const selected = localSel?.type === 'event' && localSel.item.id === e.id
          return (
            <SidebarItem
              key={e.id}
              label={e.title}
              selected={selected}
              onClick={() => selectLocal('event', e)}
              chip={<MiniChip label={`${e._start.getMonth() + 1}/${e._start.getDate()}`} selected={selected} />}
            />
          )
        })}
      </SidebarSection>

      <SidebarSection
        label="바로가기"
        icon={LaunchIcon}
        count={EXTERNAL_LINKS.length}
        open={open.links}
        onToggle={() => setOpen(o => ({ ...o, links: !o.links }))}
      >
        {EXTERNAL_LINKS.map(link => (
          <SidebarItem
            key={link.href}
            label={link.label}
            href={link.href}
            chip={<MiniChip label="↗" />}
          />
        ))}
      </SidebarSection>
    </>
  )

  return (
    <WorkspaceLayout sidebar={sidebar}>
      {requestId ? (
        <PostDetail requestId={requestId} onDeleted={() => navigate('/')} />
      ) : localSel?.type === 'event' ? (
        <EventDetail event={localSel.item} />
      ) : (
        <DetailPlaceholder message="왼쪽에서 항목을 선택하면 여기에 내용이 열립니다." />
      )}
    </WorkspaceLayout>
  )
}
