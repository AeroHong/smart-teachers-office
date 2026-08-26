/**
 * 업무 글 댓글 — 글 상세 맨 아래(글 전체 댓글, blockId 없음)와 캔버스 블록 옆 패널
 * (블록 댓글, BlockCommentsPanel.jsx)이 이 컴포넌트 하나를 같이 쓴다.
 *
 * 담당자에게 되묻는 말이 쿨메신저로 돌아가면 같은 답을 여러 번 하게 되고, 그 답을
 * 나머지 사람은 보지 못한다. 글 아래(또는 블록 옆)에 붙여두면 한 번 답한 것이 대상
 * 전원에게 남는다.
 *
 * 실시간 구독인 이유도 같다 — 담당자가 답을 달았는데 새로고침해야 보이면, 기다리다
 * 지쳐 결국 쿨메신저로 다시 물어본다.
 *
 * ── 입력창은 MessageComposer.jsx를 재사용한다(사용자 명시 요청, PLAN_canvasBlocks.md
 * Phase 4) — 채널 메시지와 같은 서식·`@`멘션 경험. 본문은 그래서 서식 있는 HTML이다
 * (comments.js 위쪽 주석 참고). 옛 댓글(bodyHtml 없음)은 평문 그대로 줄바꿈만 살려 그린다.
 *
 * ── compact — 두 가지 모양
 *   기본(false): 글 상세 페이지 맨 아래, 문서 흐름을 따라 자연스럽게 스크롤(기존 모양).
 *   true: 오른쪽 블록 댓글 패널 — 패널 높이 안에서 목록만 따로 스크롤되고 입력창은
 *   아래 고정(ChannelMessages.jsx와 같은 뼈대). 폭이 좁아 maxWidth·여백도 줄인다.
 */
import { useEffect, useMemo, useState } from 'react'
import { addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import DeleteIcon from '@mui/icons-material/DeleteOutline'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, schoolPath } from '@shared/lib/schema'
import { canDeleteComment, commentsForBlock, newCommentPayload, sortComments, validateComment } from '@shared/lib/comments'
import { htmlToText, sanitizeHtml } from '@shared/lib/richText'
import { userMentionTarget } from '@shared/lib/channelMentionChip'
import { ListSkeleton } from './widgetUi'
import { useToast } from './ToastProvider'
import { formatRelative } from '../lib/formatTime'
import MessageComposer from './MessageComposer'
import { RICH_TEXT_SX } from './richTextStyles'
import { useProfileCard } from './ProfileCardProvider'

export default function PostComments({
  requestId, blockId = null, members = [], channels = [],
  compact = false, placeholder = '댓글 남기기',
  emptyText = '궁금한 점이나 진행 상황을 남겨주세요.',
}) {
  const { user, userName, schoolId, isAdmin } = useAuth()
  const toast = useToast()
  const { open: openProfile } = useProfileCard()

  const [comments, setComments] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [draftHtml, setDraftHtml] = useState('')
  const [sending, setSending] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(null)

  useEffect(() => {
    if (!schoolId || !requestId) return
    return onSnapshot(
      collection(db, ...schoolPath(schoolId, COL.REQUESTS), requestId, COL.REQUEST_COMMENTS),
      snap => { setComments(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoaded(true) },
      e => { toast.error('댓글을 불러오지 못했습니다.', e); setLoaded(true) },
    )
  }, [schoolId, requestId, toast])

  // 이 글의 댓글 전체에서 blockId로 거른다 — 글 전체 댓글(null)과 블록 댓글을 같은
  // 화면에 섞지 않는다(comments.js commentsForBlock). orderBy 대신 받아서 정렬하는
  // 이유는 기존과 같다 — 방금 쓴 댓글의 createdAt은 서버 왕복 전까지 비어 있다.
  const ordered = useMemo(
    () => sortComments(commentsForBlock(comments, blockId)),
    [comments, blockId],
  )

  // 채널을 바꾸거나(blockId가 다른 블록으로 바뀌면) 쓰던 초안이 따라가지 않게 비운다.
  useEffect(() => { setDraftHtml('') }, [requestId, blockId])

  const submit = async () => {
    if (sending || !schoolId || !user?.uid) return
    // 정화는 여기서 한다(ChannelMessages.jsx submit과 같은 자리) — newCommentPayload는
    // 순수 함수라 sanitizeHtml(DOMPurify가 window를 요구)을 안 쓴다.
    const safeHtml = sanitizeHtml(draftHtml)
    const text = htmlToText(safeHtml)
    const check = validateComment(text)
    if (!check.ok) { toast.error(check.error); return }
    setSending(true)
    try {
      await addDoc(
        collection(db, ...schoolPath(schoolId, COL.REQUESTS), requestId, COL.REQUEST_COMMENTS),
        {
          ...newCommentPayload({
            body: text, bodyHtml: safeHtml, authorUid: user.uid, authorName: userName, blockId,
          }),
          createdAt: serverTimestamp(),
        },
      )
      setDraftHtml('')
    } catch (e) {
      toast.error('댓글을 남기지 못했습니다. 연결 상태를 확인해 주세요.', e)
    } finally {
      setSending(false)
    }
  }

  const removeComment = async (comment) => {
    try {
      await deleteDoc(
        doc(db, ...schoolPath(schoolId, COL.REQUESTS), requestId, COL.REQUEST_COMMENTS, comment.id),
      )
    } catch (e) {
      toast.error('댓글을 지우지 못했습니다. 권한을 확인해 주세요.', e)
    }
  }

  const now = Date.now()

  const list = !loaded ? (
    <ListSkeleton rows={2} />
  ) : ordered.length === 0 ? (
    <Typography color="text.secondary" fontSize="0.8rem" sx={{ mb: compact ? 0 : 1.5 }}>
      {emptyText}
    </Typography>
  ) : (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.6, mb: compact ? 0 : 1.5 }}>
      {ordered.map(comment => (
        <Box
          key={comment.id}
          sx={{
            px: 1.2, py: 0.8, borderRadius: 1,
            border: '1px solid', borderColor: 'divider',
            // 댓글마다 삭제 버튼이 떠 있으면 읽는 내용보다 버튼이 먼저 눈에 들어온다
            '&:hover .comment-action': { opacity: 1 },
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, mb: 0.3 }}>
            <Typography
              component="button" type="button"
              onClick={e => openProfile(comment.authorUid, e.currentTarget)}
              sx={{
                fontSize: '0.8rem', fontWeight: 700, border: 0, background: 'none', p: 0,
                fontFamily: 'inherit', cursor: 'pointer', color: 'inherit',
                '&:hover': { textDecoration: 'underline' },
              }}
            >
              {comment.authorName || '(이름 없음)'}
            </Typography>
            <Typography fontSize="0.72rem" color="text.secondary">
              {formatRelative(comment.createdAt, now) || '보내는 중…'}
            </Typography>
            <Box sx={{ flexGrow: 1 }} />
            {canDeleteComment(comment, { uid: user?.uid, isAdmin }) && (
              <IconButton
                className="comment-action"
                size="small"
                aria-label="댓글 삭제"
                onClick={() => setPendingDelete(comment)}
                sx={{ opacity: 0, transition: 'opacity .12s ease', p: 0.3 }}
              >
                <DeleteIcon sx={{ fontSize: 16 }} />
              </IconButton>
            )}
          </Box>
          {comment.bodyHtml ? (
            // 저장 시점에 이미 한 번 걸렀지만(newCommentPayload 호출 전 submit에서),
            // 그리기 직전에 다시 거른다 — richText.js와 같은 이중 정화. @멘션 조각도
            // 눌러 프로필을 열 수 있다(ChannelMessages.jsx의 handleBodyClick과 같은 방식).
            <Box
              onClick={e => {
                const uid = userMentionTarget(e.target)
                if (uid) openProfile(uid, e.target.closest('[data-mention-uid]'))
              }}
              sx={{ fontSize: '0.85rem', lineHeight: 1.6, ...RICH_TEXT_SX }}
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(comment.bodyHtml) }}
            />
          ) : (
            // 옛 평문 댓글 — 줄바꿈만 CSS로 살린다.
            <Typography fontSize="0.85rem" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {comment.body}
            </Typography>
          )}
        </Box>
      ))}
    </Box>
  )

  const composer = (
    <MessageComposer
      value={draftHtml}
      onChange={setDraftHtml}
      onSubmit={submit}
      disabled={sending}
      members={members}
      channels={channels}
      placeholder={placeholder}
    />
  )

  const deleteDialog = (
    // 지우면 되돌릴 수 없어 확인을 받는다. window.confirm은 앱과 모양이 따로 놀고
    // 브라우저마다 동작이 달라 앱 안의 다이얼로그를 쓴다 (PostDetail의 삭제와 같은 방식).
    <Dialog open={!!pendingDelete} onClose={() => setPendingDelete(null)} maxWidth="xs" fullWidth>
      <DialogTitle>이 댓글을 지울까요?</DialogTitle>
      <DialogContent>
        {pendingDelete?.bodyHtml ? (
          <Box sx={{ fontSize: '0.85rem', ...RICH_TEXT_SX }} dangerouslySetInnerHTML={{ __html: sanitizeHtml(pendingDelete.bodyHtml) }} />
        ) : (
          <Typography fontSize="0.85rem" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {pendingDelete?.body}
          </Typography>
        )}
        <Typography color="text.secondary" fontSize="0.78rem" sx={{ mt: 1 }}>
          되돌릴 수 없습니다.
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={() => setPendingDelete(null)}>취소</Button>
        <Button
          variant="contained"
          color="error"
          onClick={() => {
            const target = pendingDelete
            setPendingDelete(null)
            removeComment(target)
          }}
        >
          삭제
        </Button>
      </DialogActions>
    </Dialog>
  )

  if (compact) {
    // 패널 높이 안에서 목록만 스크롤, 입력창은 아래 고정(ChannelMessages.jsx와 같은 뼈대).
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
        <Box sx={{ flexGrow: 1, minHeight: 0, overflowY: 'auto', px: 1.2, py: 1 }}>
          {list}
        </Box>
        <Box sx={{ flexShrink: 0, borderTop: '1px solid', borderColor: 'divider', p: 1 }}>
          {composer}
        </Box>
        {deleteDialog}
      </Box>
    )
  }

  return (
    <>
      <Divider sx={{ my: 2.5 }} />
      <Box sx={{ maxWidth: 760 }}>
        <Typography fontWeight={800} fontSize="0.9rem" sx={{ mb: 1.5 }}>
          댓글 {ordered.length > 0 ? ordered.length : ''}
        </Typography>
        {list}
        {composer}
      </Box>
      {deleteDialog}
    </>
  )
}
