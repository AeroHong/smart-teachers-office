/**
 * 내가 보낸 안내·요청 — 왼쪽에 목록, 오른쪽에 현황.
 *
 * 담당자가 여러 건을 동시에 굴리는 게 보통이라(주간계획서·연수신청·원안제출이 겹친다),
 * 목록에서 진행률이 보여야 어디를 챙길지 판단할 수 있다.
 *
 * 관리자에게는 학교 전체를 보는 섹션을 더 준다. 예전 '업무 현황' 페이지가 하던 역할로,
 * 여러 부서가 같은 주에 마감을 몰아놓지 않았는지 보려면 전체가 한눈에 보여야 한다.
 *
 * ── 총괄 섹션 (2026-08-25, PLAN_workCentric.md §4·§9) ──────────────
 *
 * "총괄은 개입이 아니라 가시성"이라는 정의를 그대로 따른다 — 새 권한도 새 데이터 구독도
 * 없다. 이미 useChannels()로 읽고 있는 채널·글을 부장 시각으로 다시 묶어 보여줄 뿐이다.
 * "내가 보낸 요청"은 내가 만든 것만 보이는데, 부장이 챙겨야 하는 건 부원이 만든 글까지다.
 *
 * "총괄하는 채널"의 판정은 새 필드를 만들지 않고 이미 있는 canManageChannel을 그대로
 * 쓴다(채널을 만든 사람 + 학교 관리자). **완벽한 승계 보장은 아니다** — 만든 사람이
 * 바뀌면 자동으로 안 따라간다. deriveRank로 역할 기반 자동 총괄을 주는 방법도 있었지만,
 * PLAN_workCentric.md §12.3도 이걸 "데이터로 답할 질문"으로 남겨뒀을 뿐 아직 검증되지
 * 않은 가설이다. 검증 안 된 자동화보다 있는 함수를 정확히 재사용하는 쪽을 택했다 —
 * 학교 관리자가 모든 채널의 총괄이 되는 것이 최소한의 안전판 역할을 한다.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import Button from '@mui/material/Button'
import AddIcon from '@mui/icons-material/Add'
import OutboxIcon from '@mui/icons-material/Outbox'
import SchoolIcon from '@mui/icons-material/School'
import SupervisorAccountIcon from '@mui/icons-material/SupervisorAccountOutlined'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, schoolPath } from '@shared/lib/schema'
import { canManageChannel } from '@shared/lib/channels'
import { completionStats, dueState, isRequest, sortByUrgency } from '@shared/lib/workRequests'
import WorkspaceLayout, { DetailPlaceholder } from '../components/WorkspaceLayout'
import { MiniChip, SidebarEmpty, SidebarItem, SidebarSection } from '../components/sidebarUi'
import PostDetail from '../components/PostDetail'
import { useToast } from '../components/ToastProvider'
import useChannels from '../lib/useChannels'

const DUE_TONE = { overdue: 'danger', today: 'danger', soon: 'warning', normal: 'neutral', closed: 'neutral', none: 'neutral' }

export default function RequestList() {
  const { requestId } = useParams()
  const navigate = useNavigate()
  const { user, schoolId, isAdmin } = useAuth()
  const toast = useToast()
  const [mine, setMine] = useState([])
  const [all, setAll] = useState([])
  const [open, setOpen] = useState({ mine: true, overview: true, all: false })
  // Channels.jsx 사이드바 뱃지와 정확히 같은 훅이다. 총괄에 필요한 "채널별 글과 진행률"을
  // 이미 계산해서 주므로, 여기서 별도로 requests를 다시 구독하고 채널별로 묶는 코드를
  // 새로 짤 필요가 없다.
  const { channels } = useChannels()

  useEffect(() => {
    if (!schoolId || !user) return
    return onSnapshot(
      query(collection(db, ...schoolPath(schoolId, COL.REQUESTS)), where('createdBy', '==', user.uid)),
      snap => setMine(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      e => toast.error('목록을 불러오지 못했습니다.', e),
    )
  }, [schoolId, user, toast])

  // 전체는 관리자가 그 섹션을 폈을 때만 구독한다 — 늘 켜두면 학교 전체 글에 리스너가 붙는다
  useEffect(() => {
    if (!schoolId || !isAdmin || !open.all) return
    return onSnapshot(
      collection(db, ...schoolPath(schoolId, COL.REQUESTS)),
      snap => setAll(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      () => {},
    )
  }, [schoolId, isAdmin, open.all])

  const sortedMine = useMemo(() => sortByUrgency(mine), [mine])
  const sortedAll = useMemo(() => sortByUrgency(all), [all])

  // 총괄하는 채널 = 내가 만들었거나 학교 관리자로서 다루는 채널. 여기서 하나도 안 나오면
  // (대부분의 교사) 섹션 자체를 안 그린다 — 총괄은 소수 발신자에게만 뜻이 있다.
  const managedChannels = useMemo(
    () => channels.filter(c => canManageChannel(c, user?.uid, isAdmin)),
    [channels, user, isAdmin],
  )
  const overview = useMemo(() => sortByUrgency(
    managedChannels.flatMap(c => (c.posts || []).map(p => ({ ...p, _channelName: c.name }))),
  ), [managedChannels])
  // "안 되고 있는 것"이 총괄의 요점이라(§8), 뱃지는 진행 중인 건수가 아니라 마감 지난
  // 건수로 둔다. 0이면 배지가 안 뜨고 count(전체 건수)로 대신한다 — SidebarSection의 규칙.
  const overviewOverdue = useMemo(
    () => managedChannels.reduce((sum, c) => sum + (c.stats?.overdueCount || 0), 0),
    [managedChannels],
  )

  const renderItem = (post, { channelName } = {}) => {
    const stats = completionStats(post)
    const due = dueState(post)
    const selected = requestId === post.id
    const label = isRequest(post) && stats.total > 0
      ? `${stats.doneCount}/${stats.total}`
      : due.label

    return (
      <SidebarItem
        key={channelName ? `${post.channelId}_${post.id}` : post.id}
        // 총괄 섹션은 여러 채널을 한데 모은 목록이라 제목만으로는 어느 채널 일인지 알 수
        // 없다. 줄은 한 줄로 끝낸다는 원칙(SidebarItem 주석)을 지키려고 두 번째 줄을
        // 만드는 대신 제목 앞에 채널명을 붙인다.
        label={channelName ? `${channelName} · ${post.title}` : post.title}
        selected={selected}
        muted={post.status === 'closed'}
        onClick={() => navigate(`/requests/${post.id}`)}
        chip={label ? (
          <MiniChip
            label={label}
            tone={isRequest(post) ? (stats.percent === 100 ? 'success' : DUE_TONE[due.state]) : 'neutral'}
            selected={selected}
          />
        ) : null}
      />
    )
  }

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
        label="내가 보낸 요청"
        icon={OutboxIcon}
        count={sortedMine.length}
        open={open.mine}
        onToggle={() => setOpen(o => ({ ...o, mine: !o.mine }))}
      >
        {sortedMine.length === 0
          ? <SidebarEmpty>보낸 요청이 없습니다</SidebarEmpty>
          : sortedMine.map(renderItem)}
      </SidebarSection>

      {managedChannels.length > 0 && (
        <SidebarSection
          label="총괄"
          icon={SupervisorAccountIcon}
          count={overview.length}
          badge={overviewOverdue}
          open={open.overview}
          onToggle={() => setOpen(o => ({ ...o, overview: !o.overview }))}
        >
          {overview.length === 0
            ? <SidebarEmpty>관리하는 채널에 아직 글이 없습니다</SidebarEmpty>
            : overview.map(post => renderItem(post, { channelName: post._channelName }))}
        </SidebarSection>
      )}

      {isAdmin && (
        <SidebarSection
          label="학교 전체"
          icon={SchoolIcon}
          count={open.all ? sortedAll.length : null}
          open={open.all}
          onToggle={() => setOpen(o => ({ ...o, all: !o.all }))}
        >
          {sortedAll.length === 0
            ? <SidebarEmpty>등록된 글이 없습니다</SidebarEmpty>
            : sortedAll.map(renderItem)}
        </SidebarSection>
      )}
    </>
  )

  return (
    <WorkspaceLayout sidebar={sidebar}>
      {requestId ? (
        <PostDetail requestId={requestId} onDeleted={() => navigate('/requests')} />
      ) : (
        <DetailPlaceholder emoji="📋" message="왼쪽에서 요청을 선택하면 현황이 열립니다." />
      )}
    </WorkspaceLayout>
  )
}
