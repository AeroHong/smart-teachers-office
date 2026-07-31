/**
 * 쪽지함 (별도 탭).
 *
 * 위젯이 아니라 전용 화면으로 둔 이유는 성격이 달라서다. 대시보드 위젯은 "훑어보는" 자리인데
 * 쪽지는 읽고 답장하는 화면이라 폭과 높이가 필요하다. 게다가 학교에서 쪽지가 쿨메신저를
 * 대체하는 게 아니라 병행하는 보조 수단이라, 매일 보는 대시보드의 자리를 차지할 이유가 없다.
 *
 * 안읽음 개수는 레일 배지로 알린다 — 화면을 열지 않아도 새 쪽지가 왔는지는 보여야 한다.
 */
import { useEffect, useMemo, useState } from 'react'
import {
  collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where,
} from 'firebase/firestore'
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
import DashboardLayout from '../components/DashboardLayout'
import NoticeComposeModal from '../components/NoticeComposeModal'
import { EmptyState, ListRow, RowStack, ToneChip } from '../components/widgetUi'
import { useToast } from '../components/ToastProvider'
import { formatRelative } from '../lib/formatTime'

const FETCH_LIMIT = 50

export default function Messages() {
  const { user, schoolId } = useAuth()
  const toast = useToast()
  const [box, setBox] = useState('inbox')
  const [inbox, setInbox] = useState([])
  const [sent, setSent] = useState([])
  const [expandedId, setExpandedId] = useState(null)
  const [compose, setCompose] = useState(null)   // null | {} | { replyTo }

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
    <DashboardLayout>
      <Box sx={{ maxWidth: 820, mx: 'auto' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" fontWeight={800}>쪽지</Typography>
          <Box sx={{ flexGrow: 1 }} />
          <Button
            variant="contained" size="small"
            startIcon={<SendIcon sx={{ fontSize: 16 }} />}
            onClick={() => setCompose({})}
          >
            쪽지 보내기
          </Button>
        </Box>

        <Tabs
          value={box}
          onChange={(_, v) => { setBox(v); setExpandedId(null) }}
          sx={{ mb: 2, borderBottom: '1px solid', borderColor: 'divider' }}
        >
          <Tab value="inbox" label={unreadCount > 0 ? `받은 쪽지 (${unreadCount})` : '받은 쪽지'} />
          <Tab value="sent" label="보낸 쪽지" />
        </Tabs>

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
                    {box === 'sent' && (
                      <ToneChip label={notice.readAt ? '읽음' : '안읽음'} tone={notice.readAt ? 'success' : 'neutral'} />
                    )}
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
    </DashboardLayout>
  )
}
