/**
 * 안내·요청 상세 — 목록/상세 구조의 오른쪽 칸.
 *
 * 한 컴포넌트가 두 역할을 한다 — 만든 사람에게는 현황판, 대상 교사에게는 할 일 상세.
 * 쿨메신저에 붙여넣는 링크가 이 화면을 가리키므로, 누가 열든 자기에게 필요한 것이 보여야 한다.
 *
 * 담당자에게 가장 중요한 건 "누가 안 했나"다. 그 명단을 찾느라 뒤지는 일을 없애는 것이
 * 이 기능 전체의 요점이라, 미완료 명단을 접지 않고 펼쳐서 보여준다.
 *
 * 셸(레일·사이드바)은 바깥이 담당하므로 여기서는 내용만 그린다.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, doc, onSnapshot } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import LinearProgress from '@mui/material/LinearProgress'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import DeleteIcon from '@mui/icons-material/DeleteOutline'
import EditIcon from '@mui/icons-material/EditOutlined'
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { ALL_STAFF_CHANNEL_ID, COL, schoolPath } from '@shared/lib/schema'
import { resolveTargets } from '@shared/lib/targeting'
import {
  POST_KIND, completionStats, dueState, isDoneBy, isRequest, isTargetOf, pendingMembers,
} from '@shared/lib/workRequests'
import { sanitizeHtml } from '@shared/lib/richText'
import { canvasRefTarget } from '@shared/lib/canvasRefCard'
import { hydrateDateChips } from '@shared/lib/dateChips'
import PostComments from './PostComments'
import RequestMaterials from './RequestMaterials'
import BlockReactionRow from './BlockReactionRow'
import ReactionPicker from './ReactionPicker'
import BlockCommentButton from './BlockCommentButton'
import useBlockReactions from './useBlockReactions'
import useBlockReactionRects from './useBlockReactionRects'
import useBlockCommentCounts from './useBlockCommentCounts'
import { ListSkeleton, ToneChip } from './widgetUi'
import { RICH_TEXT_SX } from './richTextStyles'
import { useToast } from './ToastProvider'
import useSchoolMembers from '../lib/useSchoolMembers'
import {
  buildShareText, deletePost, recalculateTargets, remindPending,
  setCompletion, setCompletionsBulk, setRequestStatus,
} from '../lib/requestActions'

const DUE_TONE = { overdue: 'danger', today: 'danger', soon: 'warning', normal: 'neutral', closed: 'neutral', none: 'neutral' }

export default function PostDetail({ requestId, onDeleted, onOpenBlockComments }) {
  const { user, userName, schoolId } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const { members } = useSchoolMembers()

  const [request, setRequest] = useState(null)
  const [completions, setCompletions] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const bodyRef = useRef(null)

  useEffect(() => {
    if (!schoolId || !requestId) return
    return onSnapshot(
      doc(db, ...schoolPath(schoolId, COL.REQUESTS), requestId),
      snap => { setRequest(snap.exists() ? { id: snap.id, ...snap.data() } : null); setLoaded(true) },
      e => { toast.error('요청을 불러오지 못했습니다.', e); setLoaded(true) },
    )
  }, [schoolId, requestId, toast])

  // 캔버스 편집기가 저장한 날짜 칩은 "D-2" 문구를 저장하지 않고 매번 다시 계산한다
  // (dateChips.js) — 편집기 밖(읽기 화면)에서도 오늘 기준으로 다시 그려야 한다.
  useEffect(() => {
    hydrateDateChips(bodyRef.current)
  }, [request?.bodyHtml])

  // 블록 반응(이모지 리액션, PLAN_canvasBlocks.md Phase 3) — 편집기(CanvasEditor)와 같은
  // 훅을 쓴다. 이미 반응이 달린 블록만(다) 대상으로 한다 — 아직 하나도 없는 블록에 첫
  // 반응을 남기는 것은 편집기 쪽(글쓴이가 손잡이 옆에서) 몫으로 남겨 뒀다. 읽기 화면은
  // 캔버스처럼 마우스로 블록을 훑는 장치가 없어, 모든 블록마다 옅은 "+" 단추를 늘
  // 띄우면 글이 훨씬 산만해진다 — 이미 누가 반응을 남긴 블록만 보여주는 편이 안전하다.
  const { byBlock: blockReactions, toggle: toggleReaction, uid: reactionUid } = useBlockReactions({
    schoolId, requestId,
  })
  const reactionRects = useBlockReactionRects(bodyRef, Object.keys(blockReactions), request?.bodyHtml)
  // 이모지 고르는 팝오버 자리 — CanvasEditor와 같은 이유로 별도 상태로 둔다(마우스가
  // 움직여도 이미 연 팝오버는 안 닫혀야 한다).
  const [reactionPicker, setReactionPicker] = useState(null)   // { blockId, anchor: {top,left} }

  // 블록 댓글(PLAN_canvasBlocks.md Phase 4) — 반응과 같은 이유로 이미 댓글 달린 블록만
  // 대상으로 한다. 패널을 여는 건 이 컴포넌트가 아니라 Channels.jsx(3단 오른쪽 4번째
  // 칸) 몫이라 onOpenBlockComments로 위임한다.
  const commentCounts = useBlockCommentCounts({ schoolId, requestId })
  const commentRects = useBlockReactionRects(bodyRef, Object.keys(commentCounts), request?.bodyHtml)

  /** 본문 안 캔버스 삽입 카드를 누르면 그 글을 연다(canvasRefCard.js). */
  const handleBodyClick = (e) => {
    const target = canvasRefTarget(e.target)
    if (target) navigate(target)
  }

  useEffect(() => {
    if (!schoolId || !requestId) return
    return onSnapshot(
      collection(db, ...schoolPath(schoolId, COL.REQUESTS), requestId, COL.REQUEST_COMPLETIONS),
      snap => setCompletions(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      () => {},
    )
  }, [schoolId, requestId])

  const isOwner = request?.createdBy === user?.uid
  const isTarget = isTargetOf(request, user?.uid)
  // 안내는 읽으면 끝이라 완료 표시도, 진행률도 없다
  const trackCompletion = isRequest(request)
  const stats = useMemo(() => (request ? completionStats(request) : null), [request])
  const pending = useMemo(() => (request ? pendingMembers(request) : []), [request])
  const doneList = useMemo(() => {
    if (!request) return []
    const names = new Map((request.targetUids || []).map((uid, i) => [uid, request.targetNames?.[i] || '']))
    const detail = new Map(completions.filter(c => c.doneAt).map(c => [c.id, c]))
    return (request.completedUids || [])
      .filter(uid => names.has(uid))
      .map(uid => ({ uid, name: names.get(uid), detail: detail.get(uid) }))
  }, [request, completions])

  const run = async (fn, successMessage) => {
    if (busy) return
    setBusy(true)
    try {
      await fn()
      if (successMessage) toast.success(successMessage)
    } catch (e) {
      toast.error('처리하지 못했습니다. 권한이나 연결 상태를 확인해 주세요.', e)
    } finally {
      setBusy(false)
    }
  }

  if (!loaded) {
    return <Box sx={{ p: 2.5 }}><ListSkeleton rows={4} /></Box>
  }
  if (!request) {
    return (
      <Typography color="text.secondary" sx={{ p: 2.5, fontSize: '0.9rem' }}>
        글을 찾을 수 없습니다. 삭제되었을 수 있습니다.
      </Typography>
    )
  }

  const due = dueState(request)
  const myDone = isDoneBy(request, user?.uid)

  return (
    <>
      {/* 바깥은 넓게 두되 '읽는 것'만 좁게 잡는다. 제목·설명은 한 줄이 길면 눈이 끝까지
          따라가야 하지만, 완료 명단 수십 명은 좁은 칸에 세로로 쌓이면 스크롤만 길어진다. */}
      <Box sx={{ maxWidth: 1120, p: 2.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
          <Typography sx={{ fontSize: '1.1rem' }}>
            {POST_KIND[isRequest(request) ? 'request' : 'notice'].emoji}
          </Typography>
          <Typography variant="h6" fontWeight={800} sx={{ flexGrow: 1, minWidth: 0 }}>{request.title}</Typography>
          {due.label && <ToneChip label={due.label} tone={DUE_TONE[due.state]} />}
          {request.status === 'closed' && <Chip size="small" label="마감됨" />}
          {isOwner && (
            <Button
              size="small" startIcon={<EditIcon sx={{ fontSize: 17 }} />}
              disabled={busy}
              onClick={() => navigate(`/channels/${request.channelId || ALL_STAFF_CHANNEL_ID}/${requestId}/edit`)}
            >
              수정
            </Button>
          )}
          {isOwner && (
            <Button
              size="small" color="error" startIcon={<DeleteIcon sx={{ fontSize: 17 }} />}
              disabled={busy}
              onClick={() => setConfirmDelete(true)}
            >
              삭제
            </Button>
          )}
        </Box>
        <Typography color="text.secondary" fontSize="0.82rem" mb={2}>
          {request.createdByName} · 대상 {request.targetRuleText || '전체 교직원'}
        </Typography>

        <Box sx={{ maxWidth: 760 }}>
          {/* 서식 있는 본문은 항상 걸러서 그린다. 옛 글은 bodyHtml이 없어 평문으로 남는다. */}
          {request.bodyHtml ? (
            <Box
              ref={bodyRef}
              onClick={handleBodyClick}
              sx={{
                mb: 2, fontSize: '0.95rem', lineHeight: 1.75,
                ...RICH_TEXT_SX,
              }}
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(request.bodyHtml) }}
            />
          ) : request.description ? (
            <Typography sx={{ whiteSpace: 'pre-wrap', mb: 2 }}>{request.description}</Typography>
          ) : null}
          {/* 반응이 달린 블록마다 그 자리 아래에 알약 줄을 fixed로 띄운다(useBlockReactionRects
              — CanvasEditor의 손잡이·이미지 리사이즈와 같은 "rect에 고정" 패턴). */}
          {reactionRects.map(({ blockId, rect }) => (
            <Box key={blockId} sx={{ position: 'fixed', top: rect.bottom + 2, left: rect.left, zIndex: 5 }}>
              <BlockReactionRow
                data={blockReactions[blockId]}
                uid={reactionUid}
                onToggle={emoji => toggleReaction(blockId, emoji)}
                onAddClick={e => {
                  const r = e.currentTarget.getBoundingClientRect()
                  setReactionPicker({ blockId, anchor: { top: r.bottom + 4, left: r.left } })
                }}
              />
            </Box>
          ))}
          {/* 팝오버는 reactionRects와 무관한 별도 상태로 연다 — CanvasEditor와 같은 이유
              (마우스가 움직여 rect 목록이 다시 계산돼도 이미 연 팝오버는 안 닫혀야 한다). */}
          <ReactionPicker
            anchor={reactionPicker?.anchor}
            onClose={() => setReactionPicker(null)}
            onPick={emoji => {
              if (reactionPicker) toggleReaction(reactionPicker.blockId, emoji)
              setReactionPicker(null)
            }}
          />
          {/* 댓글이 달린 블록도 같은 자리(블록 왼쪽 아래)에 늘 보여준다 — 그 블록에 이미
              반응이 있으면 반응 줄 아래로 한 칸 내려 겹치지 않게 한다. */}
          {commentRects.map(({ blockId, rect }) => (
            <Box
              key={`c-${blockId}`}
              sx={{
                position: 'fixed',
                top: rect.bottom + (blockReactions[blockId] ? 30 : 2),
                left: rect.left, zIndex: 5,
              }}
            >
              <BlockCommentButton
                count={commentCounts[blockId] || 0}
                onClick={() => onOpenBlockComments?.({ requestId, blockId })}
              />
            </Box>
          ))}
          <Box sx={{ mb: 3 }}>
            <RequestMaterials attachments={request.attachments} links={request.links} />
          </Box>
        </Box>

        {/* 대상 교사 — 내 완료 표시 (안내에는 없다).
            상자 전체가 버튼이다. 예전에는 왼쪽 동그라미가 그림일 뿐이라 눌러도 아무 일이
            없었고, 실제 버튼은 760px 건너편 오른쪽 끝에 있었다. 체크 표시를 누르려는 것이
            자연스러운 동작이므로 어디를 눌러도 같게 만든다. */}
        {isTarget && trackCompletion && (
          <Box
            component="button"
            type="button"
            disabled={busy || request.status === 'closed'}
            onClick={() => run(() => setCompletion({
              schoolId, requestId, done: !myDone, doneBy: 'self',
              member: { uid: user.uid, name: userName },
              actor: { uid: user.uid, name: userName },
            }))}
            sx={theme => {
              const tone = myDone ? theme.palette.success.main : theme.palette.primary.main
              return {
                display: 'flex', alignItems: 'center', gap: 1.5, textAlign: 'left',
                width: '100%', maxWidth: 760, px: 2, py: 1.5, mb: 2.5,
                borderRadius: 1.25, border: '1px solid', borderColor: tone,
                bgcolor: alpha(tone, 0.05),
                fontFamily: 'inherit', cursor: 'pointer',
                transition: 'background-color .12s ease',
                '&:hover': { bgcolor: alpha(tone, 0.13) },
                '&:disabled': { cursor: 'default', opacity: 0.55, '&:hover': { bgcolor: alpha(tone, 0.05) } },
              }
            }}
          >
            {myDone
              ? <CheckCircleIcon sx={{ fontSize: 26, color: 'success.main', flexShrink: 0 }} />
              : <RadioButtonUncheckedIcon sx={{ fontSize: 26, color: 'primary.main', flexShrink: 0 }} />}
            <Box component="span" sx={{ flexGrow: 1, minWidth: 0 }}>
              <Typography component="span" sx={{ display: 'block' }} fontWeight={700} fontSize="0.92rem">
                {myDone ? '완료했습니다' : '아직 완료하지 않았습니다'}
              </Typography>
              <Typography component="span" sx={{ display: 'block' }} fontSize="0.78rem" color="text.secondary">
                {request.status === 'closed'
                  ? '마감된 요청이라 바꿀 수 없습니다.'
                  : myDone
                    ? '담당자 현황에 반영됐습니다. 취소하려면 누르세요.'
                    : '끝내셨으면 눌러주세요.'}
              </Typography>
            </Box>
            {/* 상자가 곧 버튼이라 이건 눌러야 할 곳이 아니라 지금 무엇이 되는지를 알리는 표다 */}
            <Box
              component="span"
              sx={{
                flexShrink: 0, px: 1.4, py: 0.5, borderRadius: 5,
                fontSize: '0.8rem', fontWeight: 700,
                color: myDone ? 'text.secondary' : 'primary.contrastText',
                bgcolor: myDone ? 'action.hover' : 'primary.main',
              }}
            >
              {myDone ? '완료 취소' : '완료로 표시'}
            </Box>
          </Box>
        )}

        {/* 만든 사람 — 현황판 (안내는 대상 수만 보여주면 된다) */}
        {isOwner && !trackCompletion && (
          <Typography color="text.secondary" fontSize="0.85rem">
            대상 {request.targetUids?.length || 0}명에게 전달된 안내입니다.
          </Typography>
        )}
        {isOwner && trackCompletion && stats && (
          <>
            <Divider sx={{ mb: 2 }} />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Typography fontWeight={800} fontSize="1rem">
                {stats.doneCount} / {stats.total}명 완료
              </Typography>
              <Typography color="text.secondary" fontSize="0.85rem">{stats.percent}%</Typography>
              <Box sx={{ flexGrow: 1 }} />
              <Button
                size="small" startIcon={<ContentCopyIcon />}
                onClick={() => {
                  navigator.clipboard.writeText(buildShareText(request, window.location.origin))
                    .then(() => toast.success('쿨메신저에 붙여넣을 문구를 복사했습니다.'))
                    .catch(e => toast.error('복사하지 못했습니다.', e))
                }}
              >
                안내 문구 복사
              </Button>
            </Box>
            <LinearProgress variant="determinate" value={stats.percent} sx={{ height: 8, borderRadius: 4, mb: 2.5 }} />

            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2.5 }}>
              <Button
                size="small" variant="contained" startIcon={<NotificationsActiveIcon />}
                disabled={busy || pending.length === 0}
                onClick={() => run(
                  () => remindPending({ schoolId, requestId }),
                  `미완료 ${pending.length}명에게 알렸습니다.`,
                )}
              >
                미완료 {pending.length}명에게 다시 알림
              </Button>
              <Button
                size="small"
                disabled={busy || members.length === 0}
                onClick={() => run(async () => {
                  const targets = resolveTargets(request.targetRule, members).members
                  await recalculateTargets({ schoolId, requestId, targets })
                }, '대상을 다시 계산했습니다.')}
              >
                대상 다시 계산
              </Button>
              <Button
                size="small" color={request.status === 'closed' ? 'primary' : 'error'}
                disabled={busy}
                onClick={() => run(
                  () => setRequestStatus({ schoolId, requestId, status: request.status === 'closed' ? 'open' : 'closed' }),
                  request.status === 'closed' ? '요청을 다시 열었습니다.' : '요청을 마감했습니다.',
                )}
              >
                {request.status === 'closed' ? '다시 열기' : '마감하기'}
              </Button>
            </Box>

            <NameSection
              title={`미완료 ${pending.length}명`}
              tone="warning"
              members={pending}
              emptyText="모두 완료했습니다."
              action={(m) => (
                <Button
                  size="small" disabled={busy}
                  onClick={() => run(() => setCompletion({
                    schoolId, requestId, done: true, doneBy: 'manager',
                    member: m, actor: { uid: user.uid, name: userName },
                  }))}
                >
                  완료 표시
                </Button>
              )}
              bulkAction={pending.length > 0 && (
                <Button
                  size="small" disabled={busy}
                  onClick={() => run(() => setCompletionsBulk({
                    schoolId, requestId, members: pending, done: true,
                    actor: { uid: user.uid, name: userName },
                  }), `${pending.length}명을 완료로 표시했습니다.`)}
                >
                  전체 완료 표시
                </Button>
              )}
            />

            <NameSection
              title={`완료 ${doneList.length}명`}
              tone="success"
              members={doneList}
              emptyText="아직 아무도 완료하지 않았습니다."
              subtitle={(m) => (m.detail?.doneBy === 'manager' ? `${m.detail.markedByName} 확인` : '')}
              action={(m) => (
                <Button
                  size="small" color="inherit" disabled={busy}
                  onClick={() => run(() => setCompletion({
                    schoolId, requestId, done: false,
                    member: m, actor: { uid: user.uid, name: userName },
                  }))}
                >
                  취소
                </Button>
              )}
            />
          </>
        )}

        {/* 댓글은 누가 열든 보인다 — 되묻는 말은 담당자에게만 생기는 것이 아니고,
            같은 질문에 대한 답을 대상 전원이 함께 보는 것이 이 기능의 요점이다.
            blockId를 안 줘 글 전체 댓글(null)만 보여준다 — 블록 댓글은 3단 오른쪽
            패널(BlockCommentsPanel)에서 따로 본다. */}
        <PostComments requestId={requestId} members={members} />
      </Box>

      {/* 되돌릴 수 없는 동작이라 확인을 받는다. window.confirm은 앱과 모양이 따로 놀고
          브라우저에 따라 동작이 제각각이라 앱 안의 다이얼로그를 쓴다. */}
      <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)} maxWidth="xs" fullWidth>
        <DialogTitle>이 글을 삭제할까요?</DialogTitle>
        <DialogContent>
          <Typography fontSize="0.9rem">
            <strong>{request.title}</strong>
          </Typography>
          <Typography color="text.secondary" fontSize="0.85rem" sx={{ mt: 1 }}>
            대상 {request.targetUids?.length || 0}명의 목록에서 사라지고, 첨부 파일과 완료 기록도
            함께 지워집니다. 되돌릴 수 없습니다.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setConfirmDelete(false)}>취소</Button>
          <Button
            variant="contained" color="error" disabled={busy}
            onClick={() => {
              setConfirmDelete(false)
              run(async () => {
                await deletePost({ schoolId, requestId })
                onDeleted?.()
              }, '삭제했습니다.')
            }}
          >
            삭제
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}

function NameSection({ title, tone, members, emptyText, action, subtitle, bulkAction }) {
  return (
    <Box sx={{ mb: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <ToneChip label={title} tone={tone} />
        <Box sx={{ flexGrow: 1 }} />
        {bulkAction}
      </Box>
      {/* 이름 한 줄에 화면 전체 폭을 쓰면 59명이 스크롤 두 화면이 된다.
          폭이 허락하는 만큼 열을 늘려 한눈에 담는다. */}
      {members.length === 0 ? (
        <Typography color="text.secondary" fontSize="0.85rem">{emptyText}</Typography>
      ) : (
        <Box sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(232px, 1fr))',
          gap: 0.6,
        }}>
          {members.map(m => (
            <Box
              key={m.uid}
              sx={{
                display: 'flex', alignItems: 'center', gap: 1,
                px: 1.2, py: 0.5, borderRadius: 0.75,
                border: '1px solid', borderColor: 'divider',
                // 59칸에 버튼이 다 떠 있으면 이름보다 버튼이 먼저 눈에 들어온다.
                // 담당자가 보려는 건 '누가 안 했나'지 버튼이 아니다 — 마우스를 올릴 때만 꺼낸다.
                '&:hover .row-action': { opacity: 1 },
              }}
            >
              <Typography fontSize="0.88rem" fontWeight={600}>{m.name}</Typography>
              {subtitle?.(m) && (
                <Typography fontSize="0.75rem" color="text.secondary">{subtitle(m)}</Typography>
              )}
              <Box sx={{ flexGrow: 1 }} />
              <Box
                className="row-action"
                sx={{ opacity: 0, transition: 'opacity .12s ease', flexShrink: 0 }}
              >
                {action?.(m)}
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  )
}
