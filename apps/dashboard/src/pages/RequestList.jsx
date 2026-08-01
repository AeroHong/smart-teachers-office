/**
 * 내가 만든 업무 요청 목록.
 *
 * 담당자가 여러 건을 동시에 굴리는 게 보통이라(주간계획서·연수신청·원안제출이 겹친다),
 * 목록에서 바로 진행률이 보여야 어디를 챙길지 판단할 수 있다.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import LinearProgress from '@mui/material/LinearProgress'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, schoolPath } from '@shared/lib/schema'
import { POST_KIND, completionStats, dueState, isRequest, sortByUrgency } from '@shared/lib/workRequests'
import DashboardLayout from '../components/DashboardLayout'
import { EmptyState, ListSkeleton, ToneChip } from '../components/widgetUi'
import { useToast } from '../components/ToastProvider'

const DUE_TONE = { overdue: 'danger', today: 'danger', soon: 'warning', normal: 'neutral', closed: 'neutral', none: 'neutral' }

export default function RequestList() {
  const { user, schoolId, isAdmin } = useAuth()
  const toast = useToast()
  const [requests, setRequests] = useState([])
  const [loaded, setLoaded] = useState(false)
  // 관리자에게는 학교 전체 요청을 볼 수 있게 한다. 예전 '업무 현황' 페이지가 하던 역할로,
  // 여러 부서가 같은 주에 마감을 몰아놓지 않았는지 보려면 전체가 한눈에 보여야 한다.
  const [scope, setScope] = useState('mine')

  useEffect(() => {
    if (!schoolId || !user) return
    const col = collection(db, ...schoolPath(schoolId, COL.REQUESTS))
    // orderBy를 걸지 않고 클라이언트에서 급한 순으로 정렬한다 — 마감 임박·지남 판정이
    // 단순 날짜 정렬과 달라서(마감된 건 뒤로) 어차피 한 번 더 손봐야 한다
    const q = scope === 'all' && isAdmin ? col : query(col, where('createdBy', '==', user.uid))
    return onSnapshot(
      q,
      snap => { setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoaded(true) },
      e => { toast.error('요청 목록을 불러오지 못했습니다.', e); setLoaded(true) },
    )
  }, [schoolId, user, toast, scope, isAdmin])

  const sorted = useMemo(() => sortByUrgency(requests), [requests])
  const showingAll = scope === 'all' && isAdmin

  return (
    <DashboardLayout>
      <Box sx={{ maxWidth: 820, mx: 'auto' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" fontWeight={800}>안내 · 요청</Typography>
          <Box sx={{ flexGrow: 1 }} />
          <Button component={Link} to="/requests/new" variant="contained" size="small" startIcon={<AddIcon />}>
            글 쓰기
          </Button>
        </Box>

        {isAdmin && (
          <Tabs
            value={scope}
            onChange={(_, v) => setScope(v)}
            sx={{ mb: 2, borderBottom: '1px solid', borderColor: 'divider' }}
          >
            <Tab value="mine" label="내가 보낸 글" />
            <Tab value="all" label="전체" />
          </Tabs>
        )}

        {!loaded ? <ListSkeleton rows={3} /> : sorted.length === 0 ? (
          <EmptyState
            emoji="📤"
            message={showingAll ? '등록된 글이 없습니다.' : '보낸 글이 없습니다.'}
            hint="대상을 조건으로 뽑아 보내면, 요청은 누가 했는지 자동으로 집계됩니다."
          />
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.2 }}>
            {sorted.map(request => {
              const stats = completionStats(request)
              const due = dueState(request)
              const kind = isRequest(request) ? 'request' : 'notice'
              return (
                <Box
                  key={request.id}
                  component={Link}
                  to={`/requests/${request.id}`}
                  sx={{
                    display: 'block', p: 1.8, borderRadius: 3,
                    border: '1px solid', borderColor: 'divider',
                    bgcolor: 'background.paper', textDecoration: 'none', color: 'text.primary',
                    transition: 'box-shadow .15s ease',
                    '&:hover': { boxShadow: '0 6px 18px rgba(15,23,42,.07)' },
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.8 }}>
                    <Typography sx={{ fontSize: '0.95rem' }}>{POST_KIND[kind].emoji}</Typography>
                    <Typography fontWeight={700} fontSize="0.98rem" noWrap sx={{ flexGrow: 1, minWidth: 0 }}>
                      {request.title}
                    </Typography>
                    {request.pinned && <ToneChip label="고정" tone="warning" />}
                    {due.label && <ToneChip label={due.label} tone={DUE_TONE[due.state]} />}
                  </Box>

                  {kind === 'request' && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <LinearProgress
                        variant="determinate"
                        value={stats.percent}
                        sx={{ flexGrow: 1, height: 6, borderRadius: 3 }}
                      />
                      <Typography fontSize="0.8rem" color="text.secondary" sx={{ flexShrink: 0 }}>
                        {stats.doneCount}/{stats.total}명
                      </Typography>
                    </Box>
                  )}

                  <Typography fontSize="0.78rem" color="text.secondary" sx={{ mt: 0.6 }}>
                    {showingAll && `${request.createdByName} · `}
                    {kind === 'notice'
                      ? `안내 · 대상 ${stats.total}명`
                      : stats.pendingUids.length > 0 && request.status !== 'closed'
                        ? `미완료 ${stats.pendingUids.length}명`
                        : request.status === 'closed' ? '마감됨' : '모두 완료'}
                  </Typography>
                </Box>
              )
            })}
          </Box>
        )}
      </Box>
    </DashboardLayout>
  )
}
