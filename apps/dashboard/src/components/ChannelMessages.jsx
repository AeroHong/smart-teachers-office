/**
 * 채널 대화 — 메시지 목록과 입력칸.
 *
 * 목록은 위에서 아래로 시간순이고 새 메시지는 아래에 붙는다. 업무 글 목록이 "급한 순"인
 * 것과 반대인데, 대화는 앞뒤 맥락이 있어 순서를 바꾸면 읽을 수가 없기 때문이다.
 *
 * 같은 사람이 연달아 보내면 이름과 시각을 한 번만 그린다. 한 줄짜리 대화가 오갈 때
 * 줄마다 이름이 반복되면 정작 내용이 눈에 안 들어온다.
 *
 * ── 입력칸은 서식 있는 HTML이다(2026-08-26부터) ─────────────────
 * MessageComposer.jsx(Slack 스타일 고정 툴바 + `#`채널·`@`사람·`+`첨부)를 쓴다.
 * 옛 메시지는 평문(body)만 있어 그대로 줄바꿈만 살려 그린다 — channelMessages.js의
 * "옛 글은 bodyHtml이 없다" 처리와 같다.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import CloseIcon from '@mui/icons-material/Close'
import DescriptionIcon from '@mui/icons-material/DescriptionOutlined'
import AttachFileIcon from '@mui/icons-material/AttachFile'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import { useAuth } from '@shared/contexts/AuthContext'
import { hasCanvasRef, validateMessage } from '@shared/lib/channelMessages'
import { channelMentionTarget, userMentionTarget } from '@shared/lib/channelMentionChip'
import { htmlToText, sanitizeHtml } from '@shared/lib/richText'
import { fileKind, formatBytes, uploadAttachment } from '@shared/lib/requestAttachments'
import { formatDateTime } from '../lib/formatTime'
import { useToast } from './ToastProvider'
import useChannelMessages from '../lib/useChannelMessages'
import MessageComposer from './MessageComposer'
import { RICH_TEXT_SX } from './richTextStyles'
import { useProfileCard } from './ProfileCardProvider'
import PersonAvatar from './PersonAvatar'

/** 같은 사람이 이 시간 안에 연달아 보내면 한 덩어리로 본다. */
const GROUP_WINDOW_MS = 5 * 60 * 1000

export default function ChannelMessages({
  channelId, canPost, postBlockedReason, empty, onOpenCanvas, canvases = [],
  channels = [], members = [],
}) {
  const { schoolId } = useAuth()
  const toast = useToast()
  const { open: openProfile } = useProfileCard()
  const { messages, loading, send, newMessageId } = useChannelMessages(channelId)
  const [draftHtml, setDraftHtml] = useState('')
  const [sending, setSending] = useState(false)
  // 이 메시지에 실어 보낼 캔버스·파일. 각자 하나씩만 — 여러 개를 붙일 일이면 그건
  // 메시지가 아니라 그 채널에 쓸 새 글이다.
  const [attached, setAttached] = useState(null)
  const [attachedFile, setAttachedFile] = useState(null)
  const [uploadingFile, setUploadingFile] = useState(false)
  const [pickerAnchor, setPickerAnchor] = useState(null)
  const bottomRef = useRef(null)
  const fileInputRef = useRef(null)
  // 파일을 올리려면 문서 ID가 먼저 있어야 한다(uploadAttachment의 저장 경로가 docId를
  // 씀) — 같은 메시지를 쓰는 동안은 같은 ID를 계속 쓴다. ref인 이유는 이 값 자체가
  // 화면에 그릴 것이 없어서다(state로 두면 리렌더만 한 번 더 생긴다).
  const messageIdRef = useRef(null)

  // 채널을 바꾸면 쓰던 초안이 따라가지 않게 비운다. 다른 채널에 쓰려던 말이 남아 있으면
  // 엉뚱한 곳에 보내는 사고가 난다.
  useEffect(() => {
    setDraftHtml(''); setAttached(null); setAttachedFile(null); messageIdRef.current = null
  }, [channelId])

  // 새 메시지가 오면 아래로 내린다. 대화는 아래쪽이 현재라, 위에 멈춰 있으면 방금 온 말을
  // 놓친다.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, channelId])

  const rows = useMemo(() => groupMessages(messages), [messages])

  const submit = async () => {
    // 정화는 여기서 한다(PostComposer.jsx가 캔버스에서 하는 것과 같은 자리) —
    // newMessagePayload은 순수 함수라 sanitizeHtml(DOMPurify가 window를 요구)을 안 쓴다.
    const safeHtml = sanitizeHtml(draftHtml)
    // 캔버스·파일을 붙였으면 본문이 비어도 보낼 수 있다. 카드만으로 뜻이 통하고, 한마디를
    // 강제하면 "봐주세요" 같은 빈말이 늘 뿐이다.
    const text = htmlToText(safeHtml)
    const error = (attached || attachedFile) ? null : validateMessage(text)
    if (error) { toast.error(error); return }
    setSending(true)
    try {
      await send({
        messageId: messageIdRef.current || undefined,
        bodyHtml: safeHtml,
        refRequestId: attached?.id || null,
        refTitle: attached?.title || '',
        refChannelId: attached?.channelId || channelId,
        attachment: attachedFile,
      })
      setDraftHtml('')
      setAttached(null)
      setAttachedFile(null)
      messageIdRef.current = null
    } catch (e) {
      // 실패를 삼키면 보낸 줄 알고 넘어간다. 초안은 지우지 않아 다시 누르면 된다.
      toast.error('메시지를 보내지 못했습니다.', e)
    } finally {
      setSending(false)
    }
  }

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const id = messageIdRef.current || newMessageId()
    messageIdRef.current = id
    setUploadingFile(true)
    try {
      const uploaded = await uploadAttachment({ schoolId, docId: id, folder: 'messages', file })
      setAttachedFile({ name: uploaded.name, size: uploaded.size, path: uploaded.path, url: uploaded.url })
    } catch (e2) {
      toast.error('파일을 올리지 못했습니다.', e2)
    } finally {
      setUploadingFile(false)
    }
  }

  // 메시지 본문 안의 #채널·@사람 조각을 눌렀을 때. 캔버스 카드 클릭(onOpenCanvas)과
  // 같은 자리이지만 대상이 채널·사람이라 하는 일이 다르다.
  const handleBodyClick = (e) => {
    const channelTarget = channelMentionTarget(e.target)
    if (channelTarget) { onOpenCanvas?.(channelTarget); return }
    const uid = userMentionTarget(e.target)
    if (uid) openProfile(uid, e.target.closest('[data-mention-uid]'))
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
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, mb: 0.3 }}>
                {/* 이름 글자 높이(0.82rem)의 두 배 크기 아바타(사용자 요청, 2026-08-27) —
                    채널 안 다른 구성원 목록(members)에서 uid로 찾는다. 채널을 나간
                    사람의 옛 메시지는 못 찾아도 PersonAvatar가 이름 첫 글자로 대신한다. */}
                <Box
                  component="button" type="button"
                  onClick={e => openProfile(m.authorUid, e.currentTarget)}
                  sx={{ border: 0, background: 'none', p: 0, cursor: 'pointer', lineHeight: 0, flexShrink: 0 }}
                  aria-label={`${m.authorName || '이름 없음'} 프로필`}
                >
                  <PersonAvatar
                    name={m.authorName}
                    photoURL={members.find(mem => mem.uid === m.authorUid)?.photoURL}
                    size={26}
                  />
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.8 }}>
                  <Typography
                    component="button" type="button"
                    onClick={e => openProfile(m.authorUid, e.currentTarget)}
                    sx={{
                      fontSize: '0.82rem', fontWeight: 700, border: 0, background: 'none', p: 0,
                      fontFamily: 'inherit', cursor: 'pointer', color: 'inherit',
                      '&:hover': { textDecoration: 'underline' },
                    }}
                  >
                    {m.authorName || '(이름 없음)'}
                  </Typography>
                  <Typography fontSize="0.7rem" color="text.disabled">{formatDateTime(m.createdAt)}</Typography>
                </Box>
              </Box>
            )}
            {m.bodyHtml ? (
              // 저장 시점에 이미 한 번 걸렀지만(newMessagePayload), 그리기 직전에 다시
              // 거른다 — richText.js와 같은 이중 정화(옛 문서·다른 경로로 들어온 값 대비).
              <Box
                onClick={handleBodyClick}
                sx={{ fontSize: '0.88rem', lineHeight: 1.6, ...RICH_TEXT_SX }}
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(m.bodyHtml) }}
              />
            ) : m.body && (
              // 평문 메시지(옛 글, 또는 channelActions.js가 보낸 전달·알림 한마디).
              <Typography fontSize="0.88rem" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {m.body}
              </Typography>
            )}
            {hasCanvasRef(m) && <CanvasCard message={m} onOpen={onOpenCanvas} />}
            {m.attachment && <FileCard attachment={m.attachment} />}
          </Box>
        ))}
        <div ref={bottomRef} />
      </Box>

      <Box sx={{ flexShrink: 0, borderTop: '1px solid', borderColor: 'divider', p: 1.2 }}>
        {canPost ? (
          <>
          {/* 붙인 캔버스·파일은 입력칸 위가 아니라 아래에 둔다. 위에 두면 타이핑하는 동안
              글자가 밀려 내려가 방금 쓴 줄이 눈에서 사라진다. */}
          <MessageComposer
            value={draftHtml}
            onChange={setDraftHtml}
            onSubmit={submit}
            disabled={sending}
            channels={channels}
            members={members}
            onPlusClick={e => setPickerAnchor(e.currentTarget)}
          />

          {(attached || attachedFile || uploadingFile) && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.8, mt: 0.6 }}>
              {attached && (
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
              )}
              {uploadingFile && (
                <Typography fontSize="0.78rem" color="text.secondary">파일 올리는 중…</Typography>
              )}
              {attachedFile && (
                <Box sx={{
                  display: 'flex', alignItems: 'center', gap: 0.8, maxWidth: 320,
                  border: '1px solid', borderColor: 'divider', borderRadius: 1,
                  bgcolor: 'action.hover', px: 1.1, py: 0.7,
                }}>
                  <Typography fontSize="1rem" sx={{ flexShrink: 0 }}>{fileKind(attachedFile.name).emoji}</Typography>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography fontSize="0.84rem" fontWeight={600} noWrap>{attachedFile.name}</Typography>
                    <Typography fontSize="0.7rem" color="text.disabled">{formatBytes(attachedFile.size)}</Typography>
                  </Box>
                  <IconButton size="small" onClick={() => setAttachedFile(null)} aria-label="파일 빼기" sx={{ p: 0.25 }}>
                    <CloseIcon sx={{ fontSize: 15 }} />
                  </IconButton>
                </Box>
              )}
            </Box>
          )}

          <input ref={fileInputRef} type="file" hidden onChange={handleFileChange} />

          {/* '+' 메뉴 — 파일 첨부, 그 아래 이 채널의 캔버스 목록. 다른 채널 글을 여기서
              붙이려면 그 글 쪽에서 '전달'을 쓰는 것이 맞다 — 두 길이 같은 일을 서로
              반대 방향에서 한다. */}
          <Menu
            anchorEl={pickerAnchor} open={!!pickerAnchor} onClose={() => setPickerAnchor(null)}
            anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
            transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
          >
            <MenuItem
              sx={{ fontSize: '0.85rem', gap: 1 }}
              onClick={() => { setPickerAnchor(null); fileInputRef.current?.click() }}
            >
              <AttachFileIcon sx={{ fontSize: 17 }} />파일 첨부
            </MenuItem>
            <Divider />
            <Typography sx={{ px: 2, py: 0.5, fontSize: '0.7rem', fontWeight: 800, color: 'text.disabled' }}>
              이 채널의 캔버스
            </Typography>
            {canvases.length === 0 ? (
              <MenuItem disabled sx={{ fontSize: '0.82rem', whiteSpace: 'normal', maxWidth: 260 }}>
                아직 업무 글이 없습니다. '글 쓰기'로 만들면 여기에 붙일 수 있습니다.
              </MenuItem>
            ) : canvases.map(c => (
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

/** 메시지에 실린 파일. 새 탭에서 연다 — 한글·엑셀은 다운로드로, 이미지는 브라우저가 보여준다. */
function FileCard({ attachment }) {
  const kind = fileKind(attachment.name)
  return (
    <Box
      component="a" href={attachment.url} target="_blank" rel="noopener noreferrer"
      sx={{
        display: 'flex', alignItems: 'center', gap: 0.8, mt: 0.5, maxWidth: 420,
        border: '1px solid', borderColor: 'divider', borderRadius: 1,
        bgcolor: 'action.hover', textAlign: 'left', px: 1.1, py: 0.7,
        textDecoration: 'none', color: 'inherit',
        '&:hover': { borderColor: 'primary.light' },
      }}
    >
      <Typography fontSize="1.1rem" sx={{ flexShrink: 0 }}>{kind.emoji}</Typography>
      <Box sx={{ minWidth: 0 }}>
        <Typography fontSize="0.84rem" fontWeight={600} noWrap>{attachment.name}</Typography>
        <Typography fontSize="0.7rem" color="text.disabled">
          {kind.label} · {formatBytes(attachment.size)}
        </Typography>
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
