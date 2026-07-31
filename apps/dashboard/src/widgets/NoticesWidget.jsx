import { useEffect, useMemo, useState } from 'react'
import { collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Collapse from '@mui/material/Collapse'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Typography from '@mui/material/Typography'
import ReplyIcon from '@mui/icons-material/Reply'
import SendIcon from '@mui/icons-material/Send'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, schoolPath } from '@shared/lib/schema'
import { EmptyState, ListRow, RowStack, ToneChip, WidgetAction, useWidgetBadge } from '../components/widgetUi'
import { useToast } from '../components/ToastProvider'
import { formatRelative } from '../lib/formatTime'
import NoticeComposeModal from '../components/NoticeComposeModal'

const FETCH_LIMIT = 30

export default function NoticesWidget() {
  const { user, schoolId } = useAuth()
  const toast = useToast()
  const [box, setBox] = useState('inbox')          // inbox | sent
  const [inbox, setInbox] = useState([])
  const [sent, setSent] = useState([])
  const [expandedId, setExpandedId] = useState(null)
  const [compose, setCompose] = useState(null)     // null | {} | { replyTo }

  // 받은함과 보낸함을 각각 구독한다. 보낸함은 열었을 때만 읽어도 되지만, 안읽음 배지와
  // 달리 건수가 적고 탭 전환이 잦아 미리 구독해두는 편이 체감이 낫다.
  useEffect(() => {
    if (!schoolId || !user) return
    const base = collection(db, ...schoolPath(schoolId, COL.PERSONAL_NOTICES))
    const subscribe = (field, setter) => onSnapshot(
      query(base, where(field, '==', user.uid), orderBy('createdAt', 'desc'), limit(FETCH_LIMIT)),
      snap => setter(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      e => toast.error('쪽지를 불러오지 못했습니다.', e),
    )
    const unsubs = [subscribe('recipientUid', setInbox), subscribe('senderUid', setSent)]
    return () => unsubs.forEach(u => u())
  }, [schoolId, user, toast])

  const unreadCount = useMemo(() => inbox.filter(n => !n.readAt).length, [inbox])
  useWidgetBadge(unreadCount)

  const openNotice = (notice) => {
    const wasExpanded = expandedId === notice.id
    setExpandedId(wasExpanded ? null : notice.id)
    // 받은 쪽지를 펼칠 때만 읽음 처리한다 (보낸함에서 내 쪽지를 열어도 상대의 읽음은 그대로)
    if (!wasExpanded && box === 'inbox' && !notice.readAt) {
      updateDoc(doc(db, ...schoolPath(schoolId, COL.PERSONAL_NOTICES), notice.id), {
        readAt: serverTimestamp(),
      }).catch(e => toast.error('읽음 처리에 실패했습니다.', e))
    }
  }

  const list = box === 'inbox' ? inbox : sent

  return (
    <Box>
      <Tabs
        value={box}
        onChange={(_, v) => { setBox(v); setExpandedId(null) }}
        sx={{ minHeight: 34, mb: 1, '& .MuiTab-root': { minHeight: 34, py: 0, fontSize: '0.85rem' } }}
      >
        <Tab value="inbox" label={unreadCount > 0 ? `받은 쪽지 (${unreadCount})` : '받은 쪽지'} />
        <Tab value="sent" label="보낸 쪽지" />
      </Tabs>

      <WidgetAction icon={<SendIcon sx={{ fontSize: 16 }} />} onClick={() => setCompose({})}>
        쪽지 보내기
      </WidgetAction>

      {list.length === 0 ? (
        <EmptyState
          emoji="✉️"
          message={box === 'inbox' ? '받은 쪽지가 없습니다.' : '보낸 쪽지가 없습니다.'}
          actionLabel="쪽지 보내기"
          onAction={() => setCompose({})}
        />
      ) : (
        <RowStack>
          {list.map(notice => {
            const expanded = expandedId === notice.id
            const unread = box === 'inbox' && !notice.readAt
            return (
              <ListRow key={notice.id} onClick={() => openNotice(notice)} highlight={unread}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Typography fontWeight={unread ? 700 : 600} fontSize="0.95rem" noWrap>
                      {notice.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                      {box === 'inbox' ? notice.senderName : `받는 사람: ${notice.recipientName || '—'}`}
                      {' · '}{formatRelative(notice.createdAt)}
                    </Typography>
                  </Box>
                  {unread && <ToneChip label="안읽음" tone="info" />}
                  {box === 'sent' && <ToneChip label={notice.readAt ? '읽음' : '안읽음'} tone={notice.readAt ? 'success' : 'neutral'} />}
                </Box>

                <Collapse in={expanded}>
                  <Typography variant="body2" color="text.secondary" sx={{ pt: 1, whiteSpace: 'pre-wrap' }}>
                    {notice.content}
                  </Typography>
                  {box === 'inbox' && (
                    <Button
                      size="small"
                      startIcon={<ReplyIcon sx={{ fontSize: 16 }} />}
                      onClick={(e) => { e.stopPropagation(); setCompose({ replyTo: notice }) }}
                      sx={{ mt: 1 }}
                    >
                      답장
                    </Button>
                  )}
                </Collapse>
              </ListRow>
            )
          })}
        </RowStack>
      )}

      <NoticeComposeModal
        open={!!compose}
        replyTo={compose?.replyTo}
        onClose={() => setCompose(null)}
      />
    </Box>
  )
}
