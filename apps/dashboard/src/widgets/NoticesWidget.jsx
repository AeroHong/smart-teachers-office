import { useEffect, useState } from 'react'
import { collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Collapse from '@mui/material/Collapse'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import SendIcon from '@mui/icons-material/Send'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, schoolPath } from '@shared/lib/schema'
import NoticeComposeModal from '../components/NoticeComposeModal'

function formatWhen(ts) {
  const date = ts?.toDate?.()
  if (!date) return ''
  return date.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function NoticesWidget() {
  const { user, schoolId } = useAuth()
  const [notices, setNotices] = useState([])
  const [expandedId, setExpandedId] = useState(null)
  const [composeOpen, setComposeOpen] = useState(false)

  useEffect(() => {
    if (!schoolId || !user) return
    const q = query(
      collection(db, ...schoolPath(schoolId, COL.PERSONAL_NOTICES)),
      where('recipientUid', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(30),
    )
    return onSnapshot(q, snap => setNotices(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [schoolId, user])

  const openNotice = (notice) => {
    const expanded = expandedId === notice.id
    setExpandedId(expanded ? null : notice.id)
    if (!expanded && !notice.readAt) {
      updateDoc(doc(db, ...schoolPath(schoolId, COL.PERSONAL_NOTICES), notice.id), {
        readAt: serverTimestamp(),
      }).catch(e => console.error('읽음 처리 실패:', e))
    }
  }

  return (
    <Box>
      <Button
        size="small"
        startIcon={<SendIcon sx={{ fontSize: 16 }} />}
        onClick={() => setComposeOpen(true)}
        sx={{ mb: 1.5 }}
      >
        쪽지 보내기
      </Button>

      {notices.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 5 }}>
          <Typography fontSize="2rem" mb={0.5}>✉️</Typography>
          <Typography color="text.secondary" fontSize="0.9rem">받은 쪽지가 없습니다.</Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {notices.map(notice => {
            const expanded = expandedId === notice.id
            const unread = !notice.readAt
            return (
              <Box
                key={notice.id}
                onClick={() => openNotice(notice)}
                sx={{
                  p: 1.2, borderRadius: 2, cursor: 'pointer',
                  border: '1px solid #ececf1',
                  bgcolor: unread ? 'rgba(99,102,241,.04)' : 'transparent',
                  transition: 'box-shadow .15s ease, border-color .15s ease',
                  '&:hover': { boxShadow: '0 4px 14px rgba(15,23,42,.07)', borderColor: 'transparent' },
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Typography fontWeight={unread ? 700 : 600} fontSize="0.95rem" noWrap>
                      {notice.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                      {notice.senderName} · {formatWhen(notice.createdAt)}
                    </Typography>
                  </Box>
                  {unread && <Chip size="small" label="안읽음" sx={{ bgcolor: '#eef2ff', color: '#4f46e5', fontWeight: 600 }} />}
                </Box>

                <Collapse in={expanded}>
                  <Typography variant="body2" color="text.secondary" sx={{ pt: 1, whiteSpace: 'pre-wrap' }}>
                    {notice.content}
                  </Typography>
                </Collapse>
              </Box>
            )
          })}
        </Box>
      )}

      <NoticeComposeModal open={composeOpen} onClose={() => setComposeOpen(false)} />
    </Box>
  )
}
