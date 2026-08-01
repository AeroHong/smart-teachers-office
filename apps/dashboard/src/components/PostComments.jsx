/**
 * 업무 글 댓글 — 글 상세 맨 아래.
 *
 * 담당자에게 되묻는 말이 쿨메신저로 돌아가면 같은 답을 여러 번 하게 되고, 그 답을
 * 나머지 사람은 보지 못한다. 글 아래에 붙여두면 한 번 답한 것이 대상 전원에게 남는다.
 *
 * 실시간 구독인 이유도 같다 — 담당자가 답을 달았는데 새로고침해야 보이면, 기다리다
 * 지쳐 결국 쿨메신저로 다시 물어본다.
 *
 * 본문은 평문이다. 이유는 @shared/lib/comments.js 위쪽 주석 참고.
 * 여기서도 절대 dangerouslySetInnerHTML로 그리지 않는다.
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
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import DeleteIcon from '@mui/icons-material/DeleteOutline'
import SendIcon from '@mui/icons-material/Send'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, schoolPath } from '@shared/lib/schema'
import {
  MAX_COMMENT_LENGTH, canDeleteComment, commentLength, newCommentPayload, sortComments,
  validateComment,
} from '@shared/lib/comments'
import { ListSkeleton } from './widgetUi'
import { useToast } from './ToastProvider'
import { formatRelative } from '../lib/formatTime'

export default function PostComments({ requestId }) {
  const { user, userName, schoolId, isAdmin } = useAuth()
  const toast = useToast()

  const [comments, setComments] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [draft, setDraft] = useState('')
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

  // orderBy 대신 받아서 정렬한다. 방금 쓴 댓글의 createdAt은 서버 왕복 전까지 비어 있어
  // 서버 정렬에 맡기면 목록에서 잠깐 사라졌다 나타난다. 한 글의 댓글은 많아야 수십 개라
  // 가져오는 양도 문제가 되지 않는다.
  const ordered = useMemo(() => sortComments(comments), [comments])

  const check = validateComment(draft)
  const length = commentLength(draft)

  const submit = async () => {
    // 인증이 아직 안 붙은 순간에 보내면 schools/null/... 로 경로가 만들어져 조용히 실패한다
    if (sending || !check.ok || !schoolId || !user?.uid) return
    setSending(true)
    try {
      await addDoc(
        collection(db, ...schoolPath(schoolId, COL.REQUESTS), requestId, COL.REQUEST_COMMENTS),
        {
          ...newCommentPayload({ body: draft, authorUid: user.uid, authorName: userName }),
          createdAt: serverTimestamp(),
        },
      )
      setDraft('')
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

  const onKeyDown = (e) => {
    // 한글 입력 중의 Enter는 '글자 확정'이지 '전송'이 아니다. 여기서 가로채면 마지막
    // 글자가 확정되기 전에 전송돼 끝 글자가 잘린 댓글이 올라간다 (SlashMenu.jsx 같은 문제).
    if (e.isComposing || e.keyCode === 229) return
    // Enter 단독은 줄바꿈으로 남긴다. 두 줄짜리 댓글을 쓰다가 반만 올라가는 쪽이
    // 버튼을 한 번 더 누르는 것보다 훨씬 곤란하다.
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      submit()
    }
  }

  const now = Date.now()

  return (
    <>
      <Divider sx={{ my: 2.5 }} />
      <Box sx={{ maxWidth: 760 }}>
        <Typography fontWeight={800} fontSize="0.9rem" sx={{ mb: 1.5 }}>
          댓글 {ordered.length > 0 ? ordered.length : ''}
        </Typography>

        {!loaded ? (
          <ListSkeleton rows={2} />
        ) : ordered.length === 0 ? (
          <Typography color="text.secondary" fontSize="0.8rem" sx={{ mb: 1.5 }}>
            궁금한 점이나 진행 상황을 남겨주세요.
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.6, mb: 1.5 }}>
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
                  <Typography fontSize="0.8rem" fontWeight={700}>
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
                {/* 평문이라 그대로 그린다. 줄바꿈만 CSS로 살린다. */}
                <Typography fontSize="0.85rem" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {comment.body}
                </Typography>
              </Box>
            ))}
          </Box>
        )}

        <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 1 }}>
          <TextField
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="댓글 남기기"
            size="small"
            multiline
            maxRows={6}
            fullWidth
            disabled={sending}
            inputProps={{ 'aria-label': '댓글 내용' }}
            sx={{ '& .MuiInputBase-input': { fontSize: '0.85rem' } }}
          />
          <Button
            variant="contained"
            size="small"
            startIcon={<SendIcon sx={{ fontSize: 16 }} />}
            disabled={sending || !check.ok}
            onClick={submit}
            sx={{ flexShrink: 0, mb: 0.2 }}
          >
            등록
          </Button>
        </Box>
        <Typography
          fontSize="0.72rem"
          color={length > MAX_COMMENT_LENGTH ? 'error.main' : 'text.secondary'}
          sx={{ mt: 0.5 }}
        >
          {length > MAX_COMMENT_LENGTH
            ? check.error
            : `Ctrl(⌘) + Enter로 등록${length > 0 ? ` · ${length}/${MAX_COMMENT_LENGTH}자` : ''}`}
        </Typography>
      </Box>

      {/* 지우면 되돌릴 수 없어 확인을 받는다. window.confirm은 앱과 모양이 따로 놀고
          브라우저마다 동작이 달라 앱 안의 다이얼로그를 쓴다 (PostDetail의 삭제와 같은 방식). */}
      <Dialog open={!!pendingDelete} onClose={() => setPendingDelete(null)} maxWidth="xs" fullWidth>
        <DialogTitle>이 댓글을 지울까요?</DialogTitle>
        <DialogContent>
          <Typography fontSize="0.85rem" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {pendingDelete?.body}
          </Typography>
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
    </>
  )
}
