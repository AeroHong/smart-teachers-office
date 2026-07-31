import { useEffect, useMemo, useState } from 'react'
import { collection, limit, onSnapshot, query } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Collapse from '@mui/material/Collapse'
import Typography from '@mui/material/Typography'
import PushPinIcon from '@mui/icons-material/PushPin'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, schoolPath } from '@shared/lib/schema'
import { EmptyState, ListRow, RowStack, ToneChip } from '../components/widgetUi'
import { formatDateTime } from '../lib/formatTime'
import { portalLink } from '../lib/portalUrl'

// 위젯은 훑어보는 자리이므로 접힌 상태로 몇 건만 보여주고, 나머지는 더보기로 편다.
const COLLAPSED_COUNT = 5
const FETCH_LIMIT = 50

export default function AnnouncementsWidget() {
  const { schoolId, isAdmin } = useAuth()
  const [announcements, setAnnouncements] = useState([])
  const [expandedId, setExpandedId] = useState(null)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    if (!schoolId) return
    return onSnapshot(
      query(collection(db, ...schoolPath(schoolId, COL.ANNOUNCEMENTS)), limit(FETCH_LIMIT)),
      snap => setAnnouncements(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    )
  }, [schoolId])

  // 고정 공지가 위로, 그다음 최신순. orderBy를 쓰지 않는 이유는 pinned와 createdAt을
  // 함께 정렬하려면 복합 인덱스가 필요한데 공지 건수가 적어 클라이언트 정렬로 충분해서다.
  const sorted = useMemo(() => [...announcements].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1
    return (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0)
  }), [announcements])

  const shown = showAll ? sorted : sorted.slice(0, COLLAPSED_COUNT)

  if (sorted.length === 0) {
    return (
      <EmptyState
        emoji="📢"
        message="등록된 공지가 없습니다."
        hint={isAdmin ? undefined : '공지는 관리자가 등록합니다.'}
        actionLabel={isAdmin ? '공지 등록하기' : undefined}
        href={isAdmin ? portalLink('/admin/announcements') : undefined}
      />
    )
  }

  return (
    <Box>
      <RowStack>
        {shown.map(item => {
          const expanded = expandedId === item.id
          return (
            <ListRow key={item.id} onClick={() => setExpandedId(expanded ? null : item.id)}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {item.pinned && <PushPinIcon sx={{ fontSize: 16, color: 'warning.main' }} />}
                <Typography fontWeight={600} fontSize="0.95rem" noWrap sx={{ flexGrow: 1, minWidth: 0 }}>
                  {item.title}
                </Typography>
                {item.category && <ToneChip label={item.category} tone="info" />}
              </Box>

              <Collapse in={expanded}>
                <Box sx={{ pt: 1 }}>
                  {item.content && (
                    <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>
                      {item.content}
                    </Typography>
                  )}
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                    {item.authorName}{item.createdAt && ` · ${formatDateTime(item.createdAt)}`}
                  </Typography>
                </Box>
              </Collapse>
            </ListRow>
          )
        })}
      </RowStack>

      {sorted.length > COLLAPSED_COUNT && (
        <Button size="small" fullWidth onClick={() => setShowAll(v => !v)} sx={{ mt: 1 }}>
          {showAll ? '접기' : `공지 ${sorted.length - COLLAPSED_COUNT}건 더 보기`}
        </Button>
      )}
    </Box>
  )
}
