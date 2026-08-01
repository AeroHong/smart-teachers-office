/**
 * 내가 보낸 안내·요청 — 왼쪽에 목록, 오른쪽에 현황.
 *
 * 담당자가 여러 건을 동시에 굴리는 게 보통이라(주간계획서·연수신청·원안제출이 겹친다),
 * 목록에서 진행률이 보여야 어디를 챙길지 판단할 수 있다.
 *
 * 관리자에게는 학교 전체를 보는 섹션을 더 준다. 예전 '업무 현황' 페이지가 하던 역할로,
 * 여러 부서가 같은 주에 마감을 몰아놓지 않았는지 보려면 전체가 한눈에 보여야 한다.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import Button from '@mui/material/Button'
import AddIcon from '@mui/icons-material/Add'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, schoolPath } from '@shared/lib/schema'
import { completionStats, dueState, isRequest, sortByUrgency } from '@shared/lib/workRequests'
import WorkspaceLayout, { DetailPlaceholder } from '../components/WorkspaceLayout'
import { MiniChip, SidebarEmpty, SidebarItem, SidebarSection } from '../components/sidebarUi'
import PostDetail from '../components/PostDetail'
import { useToast } from '../components/ToastProvider'

const DUE_TONE = { overdue: 'danger', today: 'danger', soon: 'warning', normal: 'neutral', closed: 'neutral', none: 'neutral' }

export default function RequestList() {
  const { requestId } = useParams()
  const navigate = useNavigate()
  const { user, schoolId, isAdmin } = useAuth()
  const toast = useToast()
  const [mine, setMine] = useState([])
  const [all, setAll] = useState([])
  const [open, setOpen] = useState({ mine: true, all: false })

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

  const renderItem = (post) => {
    const stats = completionStats(post)
    const due = dueState(post)
    const selected = requestId === post.id
    const label = isRequest(post) && stats.total > 0
      ? `${stats.doneCount}/${stats.total}`
      : due.label

    return (
      <SidebarItem
        key={post.id}
        label={post.title}
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
        icon="📤"
        count={sortedMine.length}
        open={open.mine}
        onToggle={() => setOpen(o => ({ ...o, mine: !o.mine }))}
      >
        {sortedMine.length === 0
          ? <SidebarEmpty>보낸 요청이 없습니다</SidebarEmpty>
          : sortedMine.map(renderItem)}
      </SidebarSection>

      {isAdmin && (
        <SidebarSection
          label="학교 전체"
          icon="🏫"
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
