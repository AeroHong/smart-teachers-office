/**
 * 채널 대화 — 메시지 목록과 입력칸.
 *
 * 목록은 위에서 아래로 시간순이고 새 메시지는 아래에 붙는다. 업무 글 목록이 "급한 순"인
 * 것과 반대인데, 대화는 앞뒤 맥락이 있어 순서를 바꾸면 읽을 수가 없기 때문이다.
 *
 * 같은 사람이 연달아 보내면 이름과 시각을 한 번만 그린다. 한 줄짜리 대화가 오갈 때
 * 줄마다 이름이 반복되면 정작 내용이 눈에 안 들어온다.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import SendIcon from '@mui/icons-material/Send'
import { MESSAGE_BODY_MAX, validateMessage } from '@shared/lib/channelMessages'
import { formatDateTime } from '../lib/formatTime'
import { useToast } from './ToastProvider'
import useChannelMessages from '../lib/useChannelMessages'

/** 같은 사람이 이 시간 안에 연달아 보내면 한 덩어리로 본다. */
const GROUP_WINDOW_MS = 5 * 60 * 1000

export default function ChannelMessages({ channelId, canPost, postBlockedReason }) {
  const toast = useToast()
  const { messages, loading, send } = useChannelMessages(channelId)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef(null)

  // 채널을 바꾸면 쓰던 초안이 따라가지 않게 비운다. 다른 채널에 쓰려던 말이 남아 있으면
  // 엉뚱한 곳에 보내는 사고가 난다.
  useEffect(() => { setDraft('') }, [channelId])

  // 새 메시지가 오면 아래로 내린다. 대화는 아래쪽이 현재라, 위에 멈춰 있으면 방금 온 말을
  // 놓친다.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, channelId])

  const rows = useMemo(() => groupMessages(messages), [messages])

  const submit = async () => {
    const error = validateMessage(draft)
    if (error) { toast.error(error); return }
    setSending(true)
    try {
      await send({ body: draft })
      setDraft('')
    } catch (e) {
      // 실패를 삼키면 보낸 줄 알고 넘어간다. 초안은 지우지 않아 다시 누르면 된다.
      toast.error('메시지를 보내지 못했습니다.', e)
    } finally {
      setSending(false)
    }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Box sx={{ flexGrow: 1, minHeight: 0, overflowY: 'auto', px: 2, py: 1.5 }}>
        {loading ? null : rows.length === 0 ? (
          <Typography color="text.secondary" fontSize="0.88rem" sx={{ py: 4, textAlign: 'center' }}>
            아직 대화가 없습니다. 되묻고 싶은 것을 여기에 적으면 답이 이 채널에 남습니다.
          </Typography>
        ) : rows.map(m => (
          <Box key={m.id} sx={{ mb: m.grouped ? 0.2 : 1.2 }}>
            {!m.grouped && (
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.8, mb: 0.2 }}>
                <Typography fontSize="0.82rem" fontWeight={700}>{m.authorName || '(이름 없음)'}</Typography>
                <Typography fontSize="0.7rem" color="text.disabled">{formatDateTime(m.createdAt)}</Typography>
              </Box>
            )}
            {/* 평문이라 그대로 그린다. 줄바꿈만 살린다 — 서식을 허용하면 정화기가 한 벌
                더 늘고, 한 군데라도 빠뜨리면 그대로 XSS가 된다(channelMessages.js 참고) */}
            <Typography fontSize="0.88rem" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {m.body}
            </Typography>
          </Box>
        ))}
        <div ref={bottomRef} />
      </Box>

      <Box sx={{ flexShrink: 0, borderTop: '1px solid', borderColor: 'divider', p: 1.2 }}>
        {canPost ? (
          <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 0.8 }}>
            <TextField
              fullWidth multiline maxRows={6} size="small"
              placeholder="메시지를 입력하세요"
              value={draft}
              disabled={sending}
              inputProps={{ maxLength: MESSAGE_BODY_MAX }}
              onChange={e => setDraft(e.target.value)}
              // Enter로 보내고 Shift+Enter로 줄바꿈. 쿨메신저와 같은 방식이라 따로 익힐 것이 없다.
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  submit()
                }
              }}
            />
            <IconButton
              color="primary" disabled={sending || !draft.trim()}
              onClick={submit} aria-label="보내기"
            >
              <SendIcon sx={{ fontSize: 20 }} />
            </IconButton>
          </Box>
        ) : (
          <Typography fontSize="0.8rem" color="text.secondary" sx={{ px: 0.5, py: 0.6 }}>
            {postBlockedReason}
          </Typography>
        )}
      </Box>
    </Box>
  )
}

/**
 * 연달아 온 같은 사람의 메시지를 한 덩어리로 묶는다(이름·시각을 한 번만 그리도록).
 *
 * 시각이 아직 안 붙은 메시지(방금 보내 서버 시각을 기다리는 중)는 묶지 않는다 —
 * 시간을 모르는 것을 "5분 안"으로 칠 수 없다.
 */
function groupMessages(messages) {
  let prev = null
  return messages.map((m) => {
    const at = m.createdAt?.toMillis?.() ?? 0
    const prevAt = prev?.createdAt?.toMillis?.() ?? 0
    const grouped = !!prev
      && prev.authorUid === m.authorUid
      && at > 0 && prevAt > 0
      && at - prevAt < GROUP_WINDOW_MS
    prev = m
    return { ...m, grouped }
  })
}
