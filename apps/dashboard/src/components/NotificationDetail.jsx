/**
 * 알림(멘션·쪽지·채널 신설) 3단 상세 — 공지는 PostDetail을 그대로 쓰므로 여기 없다.
 *
 * 다 짧다. 멘션은 채널 메시지 하나, 쪽지는 Messages.jsx의 본문 표시와 같은 모양, 채널
 * 신설은 채널 소개 한 장이라 굳이 별도 파일로 더 쪼개지 않는다.
 */
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import ReplyIcon from '@mui/icons-material/Reply'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import { Link } from 'react-router-dom'
import { sanitizeHtml } from '@shared/lib/richText'
import { RICH_TEXT_SX } from './richTextStyles'
import RequestMaterials from './RequestMaterials'
import { formatDateTime } from '../lib/formatTime'

export function MentionDetail({ item, onOpenChannel }) {
  const m = item.data
  return (
    <Box sx={{ p: 2.5, maxWidth: 760 }}>
      <Typography variant="h6" fontWeight={800} mb={0.5}>{item.label}</Typography>
      <Typography color="text.secondary" fontSize="0.83rem" mb={2}>
        {m.authorName || ''} · {formatDateTime(item.createdAt)}
      </Typography>
      {m.bodyHtml ? (
        <Box
          sx={{ mb: 3, fontSize: '0.95rem', lineHeight: 1.75, ...RICH_TEXT_SX }}
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(m.bodyHtml) }}
        />
      ) : (
        <Typography sx={{ whiteSpace: 'pre-wrap', fontSize: '0.95rem', mb: 3 }}>{m.body}</Typography>
      )}
      <Button variant="contained" startIcon={<OpenInNewIcon sx={{ fontSize: 17 }} />} onClick={() => onOpenChannel(m.channelId)}>
        채널에서 열기
      </Button>
    </Box>
  )
}

export function MessageDetail({ item }) {
  const n = item.data
  return (
    <Box sx={{ p: 2.5, maxWidth: 760 }}>
      <Typography variant="h6" fontWeight={800} mb={0.5}>{n.title || '새 쪽지'}</Typography>
      <Typography color="text.secondary" fontSize="0.83rem" mb={2}>
        {n.senderName || ''} · {formatDateTime(item.createdAt)}
      </Typography>
      {n.bodyHtml ? (
        <Box
          sx={{ mb: 2, fontSize: '0.95rem', lineHeight: 1.75, ...RICH_TEXT_SX }}
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(n.bodyHtml) }}
        />
      ) : (
        <Typography sx={{ whiteSpace: 'pre-wrap', fontSize: '0.95rem', mb: 2 }}>{n.content}</Typography>
      )}
      <RequestMaterials attachments={n.attachments} links={n.links} />
      <Button
        component={Link}
        to={`/messages/${n.id}?reply=1`}
        startIcon={<ReplyIcon sx={{ fontSize: 17 }} />}
        sx={{ mt: 2.5 }}
      >
        답장
      </Button>
    </Box>
  )
}

export function ChannelDetail({ item, onOpenChannel }) {
  const c = item.data
  return (
    <Box sx={{ p: 2.5, maxWidth: 760 }}>
      <Typography variant="h6" fontWeight={800} mb={0.5}>{c.name || '이름 없음'}</Typography>
      <Typography color="text.secondary" fontSize="0.83rem" mb={2}>
        {c.createdByName || ''}님이 개설 · {formatDateTime(item.createdAt)} · {(c.memberUids || []).length}명 참여
      </Typography>
      {c.description ? (
        <Typography sx={{ whiteSpace: 'pre-wrap', fontSize: '0.95rem', mb: 3 }}>{c.description}</Typography>
      ) : (
        <Typography color="text.disabled" fontSize="0.9rem" mb={3}>소개 문구가 없습니다.</Typography>
      )}
      <Button variant="contained" startIcon={<OpenInNewIcon sx={{ fontSize: 17 }} />} onClick={() => onOpenChannel(c.id)}>
        채널 열기
      </Button>
    </Box>
  )
}
