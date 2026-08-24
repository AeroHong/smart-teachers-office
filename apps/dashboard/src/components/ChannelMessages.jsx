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
import AddIcon from '@mui/icons-material/Add'
import CloseIcon from '@mui/icons-material/Close'
import DescriptionIcon from '@mui/icons-material/DescriptionOutlined'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import { MESSAGE_BODY_MAX, hasCanvasRef, validateMessage } from '@shared/lib/channelMessages'
import { formatDateTime } from '../lib/formatTime'
import { useToast } from './ToastProvider'
import useChannelMessages from '../lib/useChannelMessages'

/** 같은 사람이 이 시간 안에 연달아 보내면 한 덩어리로 본다. */
const GROUP_WINDOW_MS = 5 * 60 * 1000

export default function ChannelMessages({
  channelId, canPost, postBlockedReason, empty, onOpenCanvas, canvases = [],
}) {
  const toast = useToast()
  const { messages, loading, send } = useChannelMessages(channelId)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  // 이 메시지에 실어 보낼 캔버스. 하나만 붙인다 — 여러 개를 붙일 일이면 그건 메시지가
  // 아니라 그 채널에 쓸 새 글이다.
  const [attached, setAttached] = useState(null)
  const [pickerAnchor, setPickerAnchor] = useState(null)
  const bottomRef = useRef(null)

  // 채널을 바꾸면 쓰던 초안이 따라가지 않게 비운다. 다른 채널에 쓰려던 말이 남아 있으면
  // 엉뚱한 곳에 보내는 사고가 난다.
  useEffect(() => { setDraft(''); setAttached(null) }, [channelId])

  // 새 메시지가 오면 아래로 내린다. 대화는 아래쪽이 현재라, 위에 멈춰 있으면 방금 온 말을
  // 놓친다.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, channelId])

  const rows = useMemo(() => groupMessages(messages), [messages])

  const submit = async () => {
    // 캔버스를 붙였으면 본문이 비어도 보낼 수 있다. 카드만으로 뜻이 통하고, 한마디를
    // 강제하면 "봐주세요" 같은 빈말이 늘 뿐이다.
    const error = attached ? null : validateMessage(draft)
    if (error) { toast.error(error); return }
    setSending(true)
    try {
      await send({
        body: draft,
        refRequestId: attached?.id || null,
        refTitle: attached?.title || '',
        refChannelId: attached?.channelId || channelId,
      })
      setDraft('')
      setAttached(null)
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
          // 빈 화면을 바깥에서 그리게 열어 둔다. 채널을 막 만든 사람에게는 "무엇부터
          // 해야 하나"를 깔아주고(ChannelIntro), DM에는 한 줄이면 충분하다 — 그 판단에
          // 필요한 것(권한·채널 문서)이 전부 이 컴포넌트 바깥에 있다.
          empty || (
            <Typography color="text.secondary" fontSize="0.88rem" sx={{ py: 4, textAlign: 'center' }}>
              아직 대화가 없습니다. 되묻고 싶은 것을 여기에 적으면 답이 이 채널에 남습니다.
            </Typography>
          )
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
            {m.body && (
              <Typography fontSize="0.88rem" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {m.body}
              </Typography>
            )}
            {hasCanvasRef(m) && <CanvasCard message={m} onOpen={onOpenCanvas} />}
          </Box>
        ))}
        <div ref={bottomRef} />
      </Box>

      <Box sx={{ flexShrink: 0, borderTop: '1px solid', borderColor: 'divider', p: 1.2 }}>
        {canPost ? (
          <>
          {/* 붙인 캔버스는 입력칸 위가 아니라 아래에 둔다. 위에 두면 타이핑하는 동안 글자가
              밀려 내려가 방금 쓴 줄이 눈에서 사라진다. */}
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
              color="primary" disabled={sending || (!draft.trim() && !attached)}
              onClick={submit} aria-label="보내기"
            >
              <SendIcon sx={{ fontSize: 20 }} />
            </IconButton>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, mt: 0.6 }}>
            {attached ? (
              <Box sx={{
                display: 'flex', alignItems: 'center', gap: 0.8, maxWidth: 420,
                border: '1px solid', borderColor: 'divider', borderRadius: 1,
                bgcolor: 'action.hover', px: 1.1, py: 0.7,
              }}>
                <DescriptionIcon sx={{ fontSize: 18, color: 'primary.main', flexShrink: 0 }} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography fontSize="0.84rem" fontWeight={600} noWrap>{attached.title}</Typography>
                  {/* Slack은 여기에 편집 권한 선택이 붙는다. 우리 업무 글은 만든 사람만
                      고치고 대상자는 완료 체크만 하므로, 권한을 고를 것이 아직 없다.
                      공동 편집을 열려면 동시 편집 충돌 처리가 함께 와야 한다. */}
                  <Typography fontSize="0.7rem" color="text.disabled">읽기 전용으로 함께 갑니다</Typography>
                </Box>
                <IconButton size="small" onClick={() => setAttached(null)} aria-label="캔버스 빼기" sx={{ p: 0.25 }}>
                  <CloseIcon sx={{ fontSize: 15 }} />
                </IconButton>
              </Box>
            ) : canvases.length > 0 && (
              <Button
                size="small" startIcon={<AddIcon sx={{ fontSize: 16 }} />}
                onClick={e => setPickerAnchor(e.currentTarget)}
                sx={{ fontSize: '0.76rem', color: 'text.secondary' }}
              >
                업무 글 붙이기
              </Button>
            )}
          </Box>

          {/* 이 채널의 캔버스만 고르게 한다. 다른 채널 글을 여기서 붙이려면 그 글 쪽에서
              '전달'을 쓰는 것이 맞다 — 두 길이 같은 일을 서로 반대 방향에서 한다. */}
          <Menu
            anchorEl={pickerAnchor} open={!!pickerAnchor} onClose={() => setPickerAnchor(null)}
            anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
            transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
          >
            {canvases.map(c => (
              <MenuItem
                key={c.id}
                sx={{ fontSize: '0.85rem', maxWidth: 320 }}
                onClick={() => { setAttached(c); setPickerAnchor(null) }}
              >
                <Typography fontSize="0.85rem" noWrap>{c.title}</Typography>
              </MenuItem>
            ))}
          </Menu>
          </>
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
 * 메시지에 실린 캔버스 — 내용을 복제하지 않고 가리키기만 한다.
 *
 * 제목을 메시지에 박아둔 값(refTitle)으로 그린다. 가리키는 글을 읽어서 그리면 메시지 수만큼
 * 읽기가 늘고, 그 글이 다른 채널에 있으면 목록 쿼리로 묶을 수조차 없다.
 *
 * 눌러도 안 열릴 수 있다 — 비공개 채널의 글을 넘기는 길은 화면에서 막아 두었지만, 그 뒤에
 * 원본 채널이 비공개로 바뀌면 링크만 남는다. 그때 열리지 않는 것이 맞다(원본 규칙이 지킨다).
 */
function CanvasCard({ message, onOpen }) {
  const target = message.refChannelId
    ? `/channels/${message.refChannelId}/${message.refRequestId}`
    : `/posts/${message.refRequestId}`

  return (
    <Box
      component="button" type="button"
      onClick={() => onOpen?.(target)}
      sx={{
        display: 'flex', alignItems: 'center', gap: 0.8, mt: 0.5, maxWidth: 420,
        border: '1px solid', borderColor: 'divider', borderRadius: 1,
        bgcolor: 'action.hover', textAlign: 'left', px: 1.1, py: 0.7,
        cursor: 'pointer', fontFamily: 'inherit',
        '&:hover': { borderColor: 'primary.light' },
      }}
    >
      <DescriptionIcon sx={{ fontSize: 17, color: 'text.disabled', flexShrink: 0 }} />
      <Box sx={{ minWidth: 0 }}>
        <Typography fontSize="0.84rem" fontWeight={600} noWrap>
          {message.refTitle || '업무 글'}
        </Typography>
        <Typography fontSize="0.7rem" color="text.disabled">업무 글 열기</Typography>
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
