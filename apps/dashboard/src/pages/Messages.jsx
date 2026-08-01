/**
 * 쪽지 — 왼쪽에 목록, 오른쪽에 내용.
 *
 * 쪽지는 쿨메신저를 대체하는 게 아니라 병행하는 보조 수단이라 별도 탭에 둔다.
 * 안읽음은 레일 배지로 알리므로 이 화면을 열지 않아도 새 쪽지가 온 것은 보인다.
 */
import { useEffect, useMemo, useState } from 'react'
import {
  collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where,
} from 'firebase/firestore'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import ReplyIcon from '@mui/icons-material/Reply'
import SendIcon from '@mui/icons-material/Send'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, schoolPath } from '@shared/lib/schema'
import WorkspaceLayout, { DetailPlaceholder } from '../components/WorkspaceLayout'
import { MiniChip, SidebarEmpty, SidebarItem, SidebarSection } from '../components/sidebarUi'
import NoticeComposeModal from '../components/NoticeComposeModal'
import { useToast } from '../components/ToastProvider'
import { formatDateTime, formatRelative } from '../lib/formatTime'

const FETCH_LIMIT = 50

export default function Messages() {
  const { user, schoolId } = useAuth()
  const toast = useToast()
  const [inbox, setInbox] = useState([])
  const [sent, setSent] = useState([])
  const [selected, setSelected] = useState(null)
  const [compose, setCompose] = useState(null)
  const [open, setOpen] = useState({ inbox: true, sent: false })

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

  const openNotice = (notice, box) => {
    setSelected({ ...notice, _box: box })
    // 받은 쪽지를 열 때만 읽음 처리한다 (보낸함에서 내 쪽지를 열어도 상대의 읽음은 그대로)
    if (box === 'inbox' && !notice.readAt) {
      updateDoc(doc(db, ...schoolPath(schoolId, COL.PERSONAL_NOTICES), notice.id), {
        readAt: serverTimestamp(),
      }).catch(e => toast.error('읽음 처리에 실패했습니다.', e))
    }
  }

  const sidebar = (
    <>
      <Button
        fullWidth size="small" variant="contained" startIcon={<SendIcon sx={{ fontSize: 16 }} />}
        onClick={() => setCompose({})}
        sx={{ mb: 1 }}
      >
        쪽지 보내기
      </Button>

      <SidebarSection
        label="받은 쪽지"
        count={inbox.length}
        badge={unreadCount}
        open={open.inbox}
        onToggle={() => setOpen(o => ({ ...o, inbox: !o.inbox }))}
      >
        {inbox.length === 0 ? <SidebarEmpty>받은 쪽지가 없습니다</SidebarEmpty> : inbox.map(n => (
          <SidebarItem
            key={n.id}
            label={n.title}
            selected={selected?.id === n.id}
            strong={!n.readAt}
            onClick={() => openNotice(n, 'inbox')}
            chip={<MiniChip label={n.senderName} selected={selected?.id === n.id} />}
          />
        ))}
      </SidebarSection>

      <SidebarSection
        label="보낸 쪽지"
        count={sent.length}
        open={open.sent}
        onToggle={() => setOpen(o => ({ ...o, sent: !o.sent }))}
      >
        {sent.length === 0 ? <SidebarEmpty>보낸 쪽지가 없습니다</SidebarEmpty> : sent.map(n => (
          <SidebarItem
            key={n.id}
            label={n.title}
            selected={selected?.id === n.id}
            onClick={() => openNotice(n, 'sent')}
            chip={<MiniChip
              label={n.readAt ? '읽음' : '안읽음'}
              tone={n.readAt ? 'success' : 'neutral'}
              selected={selected?.id === n.id}
            />}
          />
        ))}
      </SidebarSection>
    </>
  )

  return (
    <WorkspaceLayout sidebar={sidebar}>
      {selected ? (
        <Box sx={{ p: 2.5, maxWidth: 720 }}>
          <Typography variant="h6" fontWeight={800} mb={0.5}>{selected.title}</Typography>
          <Typography color="text.secondary" fontSize="0.83rem" mb={2.5}>
            {selected._box === 'inbox'
              ? selected.senderName
              : `받는 사람: ${selected.recipientName || '—'}`}
            {' · '}{formatDateTime(selected.createdAt)}
            {selected._box === 'sent' && ` · ${selected.readAt ? '읽음' : '아직 안 읽음'}`}
          </Typography>

          <Typography sx={{ whiteSpace: 'pre-wrap', fontSize: '0.95rem' }}>
            {selected.content}
          </Typography>

          {selected._box === 'inbox' && (
            <Button
              startIcon={<ReplyIcon sx={{ fontSize: 17 }} />}
              onClick={() => setCompose({ replyTo: selected })}
              sx={{ mt: 2.5 }}
            >
              답장
            </Button>
          )}
        </Box>
      ) : (
        <DetailPlaceholder emoji="✉️" message="왼쪽에서 쪽지를 선택하세요." />
      )}

      <NoticeComposeModal
        open={!!compose}
        replyTo={compose?.replyTo}
        onClose={() => setCompose(null)}
      />
    </WorkspaceLayout>
  )
}
