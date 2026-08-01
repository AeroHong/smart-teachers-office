/**
 * 나에게 온 업무 요청.
 *
 * 이 위젯이 대시보드 전체의 요점이다. 쿨메신저에서는 "6월 20일까지 성적 마감 눌러주세요"가
 * 수백 개 메시지에 묻혀 사라지지만, 여기서는 완료를 누르기 전까지 계속 남아 있다.
 * 교무수첩에 옮겨 적을 필요도, 기억할 필요도 없게 하는 것이 목적이다.
 *
 * 자료(양식·매뉴얼)를 목록 안에서 바로 펼쳐 받게 한 이유도 같다. 다른 화면으로 보내면
 * 그 순간 "첨부파일 어디 있어요?" 문의가 다시 시작된다.
 */
import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { Link } from 'react-router-dom'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Collapse from '@mui/material/Collapse'
import Typography from '@mui/material/Typography'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, schoolPath } from '@shared/lib/schema'
import { dueState, isDoneBy, sortByUrgency } from '@shared/lib/workRequests'
import { EmptyState, ListRow, RowStack, ToneChip, useWidgetBadge } from '../components/widgetUi'
import RequestMaterials from '../components/RequestMaterials'
import { useToast } from '../components/ToastProvider'
import { setCompletion } from '../lib/requestActions'
import useSeenPosts from '../lib/useSeenPosts'

const DUE_TONE = { overdue: 'danger', today: 'danger', soon: 'warning', normal: 'neutral', closed: 'neutral', none: 'neutral' }

export default function MyRequestsWidget() {
  const { user, userName, schoolId } = useAuth()
  const toast = useToast()
  const { isNew, markSeen } = useSeenPosts('request')
  const [requests, setRequests] = useState([])
  const [expandedId, setExpandedId] = useState(null)
  const [busyId, setBusyId] = useState(null)

  useEffect(() => {
    if (!schoolId || !user) return
    return onSnapshot(
      query(
        collection(db, ...schoolPath(schoolId, COL.REQUESTS)),
        where('targetUids', 'array-contains', user.uid),
        where('kind', '==', 'request'),
        where('status', '==', 'open'),
      ),
      snap => setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      e => toast.error('요청을 불러오지 못했습니다.', e),
    )
  }, [schoolId, user, toast])

  const sorted = useMemo(() => sortByUrgency(requests), [requests])
  const pendingCount = useMemo(
    () => requests.filter(r => !isDoneBy(r, user?.uid)).length,
    [requests, user],
  )
  useWidgetBadge(pendingCount)

  const newCount = useMemo(() => requests.filter(isNew).length, [requests, isNew])
  useEffect(() => {
    if (newCount > 0) markSeen()
  }, [newCount, markSeen])

  const toggle = async (request, done) => {
    setBusyId(request.id)
    try {
      await setCompletion({
        schoolId, requestId: request.id, done, doneBy: 'self',
        member: { uid: user.uid, name: userName },
        actor: { uid: user.uid, name: userName },
      })
    } catch (e) {
      toast.error('완료 표시를 저장하지 못했습니다.', e)
    } finally {
      setBusyId(null)
    }
  }

  if (sorted.length === 0) {
    return <EmptyState emoji="✅" message="받은 업무 요청이 없습니다." />
  }

  return (
    <RowStack>
      {sorted.map(request => {
        const done = isDoneBy(request, user?.uid)
        const due = dueState(request)
        const expanded = expandedId === request.id
        // 담당자가 독촉을 누르면 remindedAt이 찍힌다. 완료한 사람은 애초에 강조 대상이
        // 아니므로 다 한 사람을 다시 귀찮게 하지 않는다.
        const reminded = !done && !!request.remindedAt
        const fresh = !done && isNew(request)
        const hasMaterials = (request.attachments?.length || 0) + (request.links?.length || 0) > 0

        return (
          <ListRow
            key={request.id}
            onClick={() => setExpandedId(expanded ? null : request.id)}
            highlight={!done && (fresh || reminded || due.state === 'overdue' || due.state === 'today')}
            muted={done}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Checkbox
                size="small"
                checked={done}
                disabled={busyId === request.id}
                onClick={e => e.stopPropagation()}
                onChange={e => toggle(request, e.target.checked)}
              />
              <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                <Typography
                  fontWeight={done ? 600 : 700}
                  fontSize="0.95rem"
                  noWrap
                  sx={{ textDecoration: done ? 'line-through' : 'none' }}
                >
                  {request.title}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                  {request.createdByName}
                </Typography>
              </Box>
              {fresh && <ToneChip label="새 글" tone="info" />}
              {reminded && <ToneChip label="독촉" tone="danger" />}
              {due.label && <ToneChip label={due.label} tone={DUE_TONE[due.state]} />}
            </Box>

            <Collapse in={expanded}>
              <Box sx={{ pl: 4.5, pt: 1 }}>
                {request.description && (
                  <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap', mb: hasMaterials ? 1.2 : 0 }}>
                    {request.description}
                  </Typography>
                )}
                <RequestMaterials attachments={request.attachments} links={request.links} dense />
                <Button
                  component={Link}
                  to={`/requests/${request.id}`}
                  size="small"
                  onClick={e => e.stopPropagation()}
                  sx={{ mt: 1 }}
                >
                  자세히
                </Button>
              </Box>
            </Collapse>
          </ListRow>
        )
      })}
    </RowStack>
  )
}
