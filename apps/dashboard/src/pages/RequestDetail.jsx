/**
 * 업무 요청 상세.
 *
 * 한 화면이 두 역할을 한다 — 만든 사람에게는 현황판, 대상 교사에게는 할 일 상세.
 * 쿨메신저에 붙여넣는 링크가 이 주소를 가리키므로, 누가 열든 자기에게 필요한 것이 보여야 한다.
 *
 * 담당자에게 가장 중요한 건 "누가 안 했나"다. 그 명단을 찾느라 뒤지는 일을 없애는 것이
 * 이 기능 전체의 요점이라, 미완료 명단을 접지 않고 펼쳐서 보여준다.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { collection, doc, onSnapshot } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import LinearProgress from '@mui/material/LinearProgress'
import Typography from '@mui/material/Typography'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import DeleteIcon from '@mui/icons-material/DeleteOutline'
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, schoolPath } from '@shared/lib/schema'
import { resolveTargets } from '@shared/lib/targeting'
import {
  POST_KIND, completionStats, dueState, isDoneBy, isRequest, isTargetOf, pendingMembers,
} from '@shared/lib/workRequests'
import DashboardLayout from '../components/DashboardLayout'
import RequestMaterials from '../components/RequestMaterials'
import { ListSkeleton, ToneChip } from '../components/widgetUi'
import { useToast } from '../components/ToastProvider'
import useSchoolMembers from '../lib/useSchoolMembers'
import {
  buildShareText, deletePost, recalculateTargets, remindPending,
  setCompletion, setCompletionsBulk, setRequestStatus,
} from '../lib/requestActions'

const DUE_TONE = { overdue: 'danger', today: 'danger', soon: 'warning', normal: 'neutral', closed: 'neutral', none: 'neutral' }

export default function RequestDetail() {
  const { requestId } = useParams()
  const { user, userName, schoolId } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const { members } = useSchoolMembers()

  const [request, setRequest] = useState(null)
  const [completions, setCompletions] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!schoolId || !requestId) return
    return onSnapshot(
      doc(db, ...schoolPath(schoolId, COL.REQUESTS), requestId),
      snap => { setRequest(snap.exists() ? { id: snap.id, ...snap.data() } : null); setLoaded(true) },
      e => { toast.error('요청을 불러오지 못했습니다.', e); setLoaded(true) },
    )
  }, [schoolId, requestId, toast])

  useEffect(() => {
    if (!schoolId || !requestId) return
    return onSnapshot(
      collection(db, ...schoolPath(schoolId, COL.REQUESTS), requestId, COL.REQUEST_COMPLETIONS),
      snap => setCompletions(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      () => {},
    )
  }, [schoolId, requestId])

  const isOwner = request?.createdBy === user?.uid
  const isTarget = isTargetOf(request, user?.uid)
  // 안내는 읽으면 끝이라 완료 표시도, 진행률도 없다
  const trackCompletion = isRequest(request)
  const stats = useMemo(() => (request ? completionStats(request) : null), [request])
  const pending = useMemo(() => (request ? pendingMembers(request) : []), [request])
  const doneList = useMemo(() => {
    if (!request) return []
    const names = new Map((request.targetUids || []).map((uid, i) => [uid, request.targetNames?.[i] || '']))
    const detail = new Map(completions.filter(c => c.doneAt).map(c => [c.id, c]))
    return (request.completedUids || [])
      .filter(uid => names.has(uid))
      .map(uid => ({ uid, name: names.get(uid), detail: detail.get(uid) }))
  }, [request, completions])

  const run = async (fn, successMessage) => {
    if (busy) return
    setBusy(true)
    try {
      await fn()
      if (successMessage) toast.success(successMessage)
    } catch (e) {
      toast.error('처리하지 못했습니다. 권한이나 연결 상태를 확인해 주세요.', e)
    } finally {
      setBusy(false)
    }
  }

  if (!loaded) {
    return (
      <DashboardLayout>
        <Box sx={{ maxWidth: 820, mx: 'auto' }}>
          <ListSkeleton rows={4} />
        </Box>
      </DashboardLayout>
    )
  }
  if (!request) {
    return (
      <DashboardLayout>
        <Typography color="text.secondary">요청을 찾을 수 없습니다. 삭제되었을 수 있습니다.</Typography>
      </DashboardLayout>
    )
  }

  const due = dueState(request)
  const myDone = isDoneBy(request, user?.uid)

  return (
    <DashboardLayout>
      <Box sx={{ maxWidth: 820, mx: 'auto' }}>
        <Button size="small" startIcon={<ArrowBackIcon />} onClick={() => navigate('/requests')} sx={{ mb: 1 }}>
          목록
        </Button>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
          <Typography sx={{ fontSize: '1.1rem' }}>
            {POST_KIND[isRequest(request) ? 'request' : 'notice'].emoji}
          </Typography>
          <Typography variant="h6" fontWeight={800} sx={{ flexGrow: 1, minWidth: 0 }}>{request.title}</Typography>
          {due.label && <ToneChip label={due.label} tone={DUE_TONE[due.state]} />}
          {request.status === 'closed' && <Chip size="small" label="마감됨" />}
          {isOwner && (
            <Button
              size="small" color="error" startIcon={<DeleteIcon sx={{ fontSize: 17 }} />}
              disabled={busy}
              onClick={() => {
                // 되돌릴 수 없는 동작이라 확인을 받는다. 첨부와 완료 기록까지 함께 사라진다.
                const count = request.targetUids?.length || 0
                if (!window.confirm(`"${request.title}"을(를) 삭제할까요?\n대상 ${count}명의 목록에서도 사라지고, 첨부 파일과 완료 기록도 함께 지워집니다.`)) return
                run(async () => {
                  await deletePost({ schoolId, requestId, attachments: request.attachments })
                  navigate('/requests')
                }, '삭제했습니다.')
              }}
            >
              삭제
            </Button>
          )}
        </Box>
        <Typography color="text.secondary" fontSize="0.82rem" mb={2}>
          {request.createdByName} · 대상 {request.targetRuleText || '전체 교직원'}
        </Typography>

        {request.description && (
          <Typography sx={{ whiteSpace: 'pre-wrap', mb: 2 }}>{request.description}</Typography>
        )}

        <Box sx={{ mb: 3 }}>
          <RequestMaterials attachments={request.attachments} links={request.links} />
        </Box>

        {/* 대상 교사 — 내 완료 표시 (안내에는 없다) */}
        {isTarget && trackCompletion && (
          <Box sx={{
            p: 2, mb: 3, borderRadius: 3,
            border: '1px solid', borderColor: myDone ? 'success.main' : 'primary.main',
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Checkbox
                checked={myDone}
                disabled={busy || request.status === 'closed'}
                onChange={(e) => run(() => setCompletion({
                  schoolId, requestId, done: e.target.checked, doneBy: 'self',
                  member: { uid: user.uid, name: userName },
                  actor: { uid: user.uid, name: userName },
                }))}
              />
              <Box>
                <Typography fontWeight={700} fontSize="0.95rem">
                  {myDone ? '완료했습니다' : '아직 완료하지 않았습니다'}
                </Typography>
              </Box>
            </Box>
          </Box>
        )}

        {/* 만든 사람 — 현황판 (안내는 대상 수만 보여주면 된다) */}
        {isOwner && !trackCompletion && (
          <Typography color="text.secondary" fontSize="0.85rem">
            대상 {request.targetUids?.length || 0}명에게 전달된 안내입니다.
          </Typography>
        )}
        {isOwner && trackCompletion && stats && (
          <>
            <Divider sx={{ mb: 2 }} />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Typography fontWeight={800} fontSize="1rem">
                {stats.doneCount} / {stats.total}명 완료
              </Typography>
              <Typography color="text.secondary" fontSize="0.85rem">{stats.percent}%</Typography>
              <Box sx={{ flexGrow: 1 }} />
              <Button
                size="small" startIcon={<ContentCopyIcon />}
                onClick={() => {
                  navigator.clipboard.writeText(buildShareText(request, window.location.origin))
                    .then(() => toast.success('쿨메신저에 붙여넣을 문구를 복사했습니다.'))
                    .catch(e => toast.error('복사하지 못했습니다.', e))
                }}
              >
                안내 문구 복사
              </Button>
            </Box>
            <LinearProgress variant="determinate" value={stats.percent} sx={{ height: 8, borderRadius: 4, mb: 2.5 }} />

            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2.5 }}>
              <Button
                size="small" variant="contained" startIcon={<NotificationsActiveIcon />}
                disabled={busy || pending.length === 0}
                onClick={() => run(
                  () => remindPending({ schoolId, requestId }),
                  `미완료 ${pending.length}명의 할 일 목록에서 이 요청이 강조됩니다.`,
                )}
              >
                미완료 {pending.length}명에게 독촉
              </Button>
              <Button
                size="small"
                disabled={busy || members.length === 0}
                onClick={() => run(async () => {
                  const targets = resolveTargets(request.targetRule, members).members
                  await recalculateTargets({ schoolId, requestId, targets })
                }, '대상을 다시 계산했습니다.')}
              >
                대상 다시 계산
              </Button>
              <Button
                size="small" color={request.status === 'closed' ? 'primary' : 'error'}
                disabled={busy}
                onClick={() => run(
                  () => setRequestStatus({ schoolId, requestId, status: request.status === 'closed' ? 'open' : 'closed' }),
                  request.status === 'closed' ? '요청을 다시 열었습니다.' : '요청을 마감했습니다.',
                )}
              >
                {request.status === 'closed' ? '다시 열기' : '마감하기'}
              </Button>
            </Box>

            <NameSection
              title={`미완료 ${pending.length}명`}
              tone="warning"
              members={pending}
              emptyText="모두 완료했습니다."
              action={(m) => (
                <Button
                  size="small" disabled={busy}
                  onClick={() => run(() => setCompletion({
                    schoolId, requestId, done: true, doneBy: 'manager',
                    member: m, actor: { uid: user.uid, name: userName },
                  }))}
                >
                  완료 표시
                </Button>
              )}
              bulkAction={pending.length > 0 && (
                <Button
                  size="small" disabled={busy}
                  onClick={() => run(() => setCompletionsBulk({
                    schoolId, requestId, members: pending, done: true,
                    actor: { uid: user.uid, name: userName },
                  }), `${pending.length}명을 완료로 표시했습니다.`)}
                >
                  전체 완료 표시
                </Button>
              )}
            />

            <NameSection
              title={`완료 ${doneList.length}명`}
              tone="success"
              members={doneList}
              emptyText="아직 아무도 완료하지 않았습니다."
              subtitle={(m) => (m.detail?.doneBy === 'manager' ? `${m.detail.markedByName} 확인` : '')}
              action={(m) => (
                <Button
                  size="small" color="inherit" disabled={busy}
                  onClick={() => run(() => setCompletion({
                    schoolId, requestId, done: false,
                    member: m, actor: { uid: user.uid, name: userName },
                  }))}
                >
                  취소
                </Button>
              )}
            />
          </>
        )}
      </Box>
    </DashboardLayout>
  )
}

function NameSection({ title, tone, members, emptyText, action, subtitle, bulkAction }) {
  return (
    <Box sx={{ mb: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <ToneChip label={title} tone={tone} />
        <Box sx={{ flexGrow: 1 }} />
        {bulkAction}
      </Box>
      {members.length === 0 ? (
        <Typography color="text.secondary" fontSize="0.85rem">{emptyText}</Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {members.map(m => (
            <Box
              key={m.uid}
              sx={{
                display: 'flex', alignItems: 'center', gap: 1,
                px: 1.2, py: 0.6, borderRadius: 2,
                border: '1px solid', borderColor: 'divider',
              }}
            >
              <Typography fontSize="0.88rem" fontWeight={600}>{m.name}</Typography>
              {subtitle?.(m) && (
                <Typography fontSize="0.75rem" color="text.secondary">{subtitle(m)}</Typography>
              )}
              <Box sx={{ flexGrow: 1 }} />
              {action?.(m)}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  )
}
