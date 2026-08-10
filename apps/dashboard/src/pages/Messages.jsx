/**
 * 쪽지 — 왼쪽에 목록, 오른쪽에 내용.
 *
 * 쪽지는 쿨메신저를 대체하는 게 아니라 병행하는 보조 수단이라 별도 탭에 둔다.
 * 안읽음은 레일 배지로 알리므로 이 화면을 열지 않아도 새 쪽지가 온 것은 보인다.
 *
 * 보낸함은 묶음 단위로 접는다. 여러 명에게 보내면 받는 사람마다 문서가 생기는데
 * (personalNotices.js 참고) 그대로 두면 같은 제목이 사람 수만큼 늘어서 목록을 못 쓴다.
 * 접은 줄에는 "5명 · 3명 읽음"을 붙여 다시 챙길지 판단할 수 있게 한다.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import {
  collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where,
} from 'firebase/firestore'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Typography from '@mui/material/Typography'
import ReplyIcon from '@mui/icons-material/Reply'
import SendIcon from '@mui/icons-material/Send'
import InboxIcon from '@mui/icons-material/Inbox'
import OutboxIcon from '@mui/icons-material/Outbox'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, schoolPath } from '@shared/lib/schema'
import { sanitizeHtml } from '@shared/lib/richText'
import { describeSentGroup, groupSentNotices } from '@shared/lib/personalNotices'
import WorkspaceLayout, { DetailPlaceholder } from '../components/WorkspaceLayout'
import { MiniChip, SidebarEmpty, SidebarItem, SidebarSection } from '../components/sidebarUi'
import NoticeComposeModal from '../components/NoticeComposeModal'
import { useToast } from '../components/ToastProvider'
import RequestMaterials from '../components/RequestMaterials'
import { formatDateTime } from '../lib/formatTime'

const FETCH_LIMIT = 50

export default function Messages() {
  const { user, schoolId } = useAuth()
  const { noticeId } = useParams()
  const [searchParams] = useSearchParams()
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

  // /messages/:noticeId — 데스크톱 알림을 클릭했을 때 그 쪽지가 바로 열리게 한다.
  // 목록에서 다른 쪽지를 골라도 다시 끌려오지 않도록 id마다 한 번씩만 적용한다.
  const appliedIdRef = useRef(null)
  useEffect(() => {
    if (!noticeId || appliedIdRef.current === noticeId || !user) return
    const found = inbox.find(n => n.id === noticeId) || sent.find(n => n.id === noticeId)
    if (!found) return
    appliedIdRef.current = noticeId
    const box = found.recipientUid === user.uid ? 'inbox' : 'sent'
    openNotice(found, box)
    // 알림의 '답장' 버튼으로 들어온 경우 작성창까지 바로 연다.
    // 받은 쪽지에만 해당한다 — 내가 보낸 쪽지에 답장할 대상은 나 자신이다.
    if (searchParams.get('reply') === '1' && box === 'inbox') {
      setCompose({ replyTo: { ...found, _box: box } })
    }
  }, [noticeId, inbox, sent, user, searchParams])

  const unreadCount = useMemo(() => inbox.filter(n => !n.readAt).length, [inbox])
  const sentGroups = useMemo(() => groupSentNotices(sent), [sent])

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
        icon={InboxIcon}
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
        icon={OutboxIcon}
        count={sentGroups.length}
        open={open.sent}
        onToggle={() => setOpen(o => ({ ...o, sent: !o.sent }))}
      >
        {sentGroups.length === 0 ? <SidebarEmpty>보낸 쪽지가 없습니다</SidebarEmpty> : sentGroups.map(g => (
          <SidebarItem
            key={g.id}
            label={g.title}
            selected={selected?.id === g.id}
            onClick={() => setSelected({ ...g, _box: 'sent' })}
            chip={<MiniChip
              label={g.total > 1 ? `${g.readCount}/${g.total}` : (g.readCount ? '읽음' : '안읽음')}
              tone={g.readCount === g.total ? 'success' : 'neutral'}
              selected={selected?.id === g.id}
            />}
          />
        ))}
      </SidebarSection>
    </>
  )

  return (
    <WorkspaceLayout sidebar={sidebar}>
      {selected ? (
        <Box sx={{ p: 2.5, maxWidth: 760 }}>
          <Typography variant="h6" fontWeight={800} mb={0.5}>{selected.title}</Typography>
          <Typography color="text.secondary" fontSize="0.83rem" mb={2}>
            {selected._box === 'inbox'
              ? selected.senderName
              : describeSentGroup(selected)}
            {' · '}{formatDateTime(selected.createdAt)}
            {selected._box === 'inbox' && selected.recipientCount > 1
              && ` · 나 포함 ${selected.recipientCount}명에게`}
          </Typography>

          <NoticeBody notice={selected} />

          {selected._box === 'sent' && selected.total > 1 && (
            <ReadRoster recipients={selected.recipients} />
          )}

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

/** 쪽지 본문 — 서식이 있으면 걸러서 그리고, 옛 쪽지는 평문으로 남는다. */
function NoticeBody({ notice }) {
  return (
    <>
      {notice.bodyHtml ? (
        <Box
          sx={{
            mb: 2, fontSize: '0.95rem', lineHeight: 1.75,
            '& img': { maxWidth: '100%', borderRadius: 1, my: 0.5 },
            '& ul, & ol': { pl: 3, my: 0.5 },
            '& a': { color: 'primary.main' },
            '& p': { m: 0 },
          }}
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(notice.bodyHtml) }}
        />
      ) : (
        <Typography sx={{ whiteSpace: 'pre-wrap', fontSize: '0.95rem', mb: 2 }}>
          {notice.content}
        </Typography>
      )}
      <RequestMaterials attachments={notice.attachments} links={notice.links} />
    </>
  )
}

/**
 * 여럿에게 보낸 쪽지의 읽음 현황.
 *
 * 안 읽은 사람을 앞에 둔다. 다 읽은 사람 스무 명을 지나 아래에서 두 명을 찾게 하면
 * 목록을 안 보게 된다 — 여기서 알고 싶은 것은 "누가 아직 안 봤나" 하나다.
 */
function ReadRoster({ recipients }) {
  const pending = recipients.filter(r => !r.readAt)
  const done = recipients.filter(r => r.readAt)

  return (
    <Box sx={{ mt: 3, borderTop: '1px solid', borderColor: 'divider', pt: 1.5 }}>
      <Typography fontSize="0.83rem" fontWeight={700} mb={1}>
        읽음 {done.length}/{recipients.length}
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
        {[...pending, ...done].map(r => (
          <Chip
            key={r.uid} size="small" variant="outlined" label={r.name}
            color={r.readAt ? 'success' : 'default'}
            sx={{ fontSize: '0.76rem', height: 24, opacity: r.readAt ? 0.7 : 1 }}
          />
        ))}
      </Box>
      {pending.length === 0 && (
        <Typography fontSize="0.78rem" color="success.main" sx={{ mt: 0.8 }}>
          모두 읽었습니다.
        </Typography>
      )}
    </Box>
  )
}
