/**
 * 나에게 온 안내(공지).
 *
 * 예전에는 별도 announcements 컬렉션을 관리자만 쓸 수 있었는데, 실제로 "단축수업 안내"나
 * "시간표 변경 안내"를 내는 사람은 교무부 담당 교사다. 요청과 같은 글로 합치면서
 * 작성 권한도 교사 전체로 열렸고, 덤으로 대상 지정과 자료 첨부가 따라왔다.
 *
 * 안내는 읽으면 끝이라 완료 체크가 없다. 요청과 갈리는 지점은 그것뿐이다.
 */
import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { Link } from 'react-router-dom'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Collapse from '@mui/material/Collapse'
import Typography from '@mui/material/Typography'
import PushPinIcon from '@mui/icons-material/PushPin'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, schoolPath } from '@shared/lib/schema'
import { EmptyState, ListRow, RowStack } from '../components/widgetUi'
import RequestMaterials from '../components/RequestMaterials'
import { useToast } from '../components/ToastProvider'
import { formatDateTime } from '../lib/formatTime'

// 위젯은 훑어보는 자리라 접힌 상태로 몇 건만 보여주고 나머지는 더보기로 편다
const COLLAPSED_COUNT = 5

export default function AnnouncementsWidget() {
  const { user, schoolId } = useAuth()
  const toast = useToast()
  const [notices, setNotices] = useState([])
  const [expandedId, setExpandedId] = useState(null)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    if (!schoolId || !user) return
    return onSnapshot(
      query(
        collection(db, ...schoolPath(schoolId, COL.REQUESTS)),
        where('targetUids', 'array-contains', user.uid),
        where('kind', '==', 'notice'),
      ),
      snap => setNotices(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      e => toast.error('공지를 불러오지 못했습니다.', e),
    )
  }, [schoolId, user, toast])

  // 고정 공지가 위로, 그다음 최신순. orderBy를 쓰지 않는 이유는 pinned와 createdAt을
  // 함께 정렬하려면 복합 인덱스가 필요한데 건수가 적어 클라이언트 정렬로 충분해서다.
  const sorted = useMemo(() => [...notices].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1
    return (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0)
  }), [notices])

  const shown = showAll ? sorted : sorted.slice(0, COLLAPSED_COUNT)

  if (sorted.length === 0) {
    return (
      <EmptyState
        emoji="📢"
        message="등록된 안내가 없습니다."
        actionLabel="안내 쓰기"
        onAction={() => { window.location.href = '/requests/new' }}
      />
    )
  }

  return (
    <Box>
      <RowStack>
        {shown.map(item => {
          const expanded = expandedId === item.id
          const hasMaterials = (item.attachments?.length || 0) + (item.links?.length || 0) > 0
          return (
            <ListRow key={item.id} onClick={() => setExpandedId(expanded ? null : item.id)}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {item.pinned && <PushPinIcon sx={{ fontSize: 16, color: 'warning.main' }} />}
                <Typography fontWeight={600} fontSize="0.95rem" noWrap sx={{ flexGrow: 1, minWidth: 0 }}>
                  {item.title}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                  {item.createdByName}
                </Typography>
              </Box>

              <Collapse in={expanded}>
                <Box sx={{ pt: 1 }}>
                  {item.description && (
                    <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap', mb: hasMaterials ? 1.2 : 0.5 }}>
                      {item.description}
                    </Typography>
                  )}
                  <RequestMaterials attachments={item.attachments} links={item.links} dense />
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                    {formatDateTime(item.createdAt)}
                  </Typography>
                  <Button
                    component={Link}
                    to={`/requests/${item.id}`}
                    size="small"
                    onClick={e => e.stopPropagation()}
                  >
                    자세히
                  </Button>
                </Box>
              </Collapse>
            </ListRow>
          )
        })}
      </RowStack>

      {sorted.length > COLLAPSED_COUNT && (
        <Button size="small" fullWidth onClick={() => setShowAll(v => !v)} sx={{ mt: 1 }}>
          {showAll ? '접기' : `안내 ${sorted.length - COLLAPSED_COUNT}건 더 보기`}
        </Button>
      )}
    </Box>
  )
}
