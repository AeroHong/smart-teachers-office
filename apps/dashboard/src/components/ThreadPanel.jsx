/**
 * 스레드(답장) 패널 — 3단 오른쪽에 뜨는 4번째 칸.
 *
 * `BlockCommentsPanel.jsx`(캔버스 블록 댓글)와 같은 자리·같은 모양이다 —
 * `Channels.jsx`가 메시지 목록(`ChannelMessages.jsx`) 옆에 조건부로 그린다.
 *
 * 메시지 한 줄을 그리는 방식은 메인 목록과 똑같아야 한다(반응·편집·삭제가 여기서도
 * 되어야 한다) — 그래서 `ChannelMessages.jsx`가 export하는 `MessageRow`·
 * `groupMessages`를 그대로 쓴다. 반응·편집·삭제 상태(`useMessageActions`)도 같은
 * 훅을 새로 불러 쓰지만, 상태 자체는 이 패널 전용 인스턴스라 메인 목록과 안 섞인다
 * (파일 위 MessageRow 설명 참고).
 */
import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import CloseIcon from '@mui/icons-material/Close'
import EditIcon from '@mui/icons-material/EditOutlined'
import DeleteIcon from '@mui/icons-material/DeleteOutline'
import { useAuth } from '@shared/contexts/AuthContext'
import { validateMessage } from '@shared/lib/channelMessages'
import { channelMentionTarget, isChannelWideMention, userMentionTarget } from '@shared/lib/channelMentionChip'
import { htmlToText, sanitizeHtml } from '@shared/lib/richText'
import { useToast } from './ToastProvider'
import { useProfileCard } from './ProfileCardProvider'
import useThreadMessages from '../lib/useThreadMessages'
import useMessageActions from '../lib/useMessageActions'
import MessageComposer from './MessageComposer'
import ReactionPicker from './ReactionPicker'
import { DayDivider, MessageRow, groupMessages } from './ChannelMessages'

export default function ThreadPanel({
  channelId, parentMessageId, members = [], channels = [],
  canPost, postBlockedReason, onOpenCanvas, onClose,
}) {
  const { schoolId } = useAuth()
  const toast = useToast()
  const { open: openProfile } = useProfileCard()
  const { parent, replies, sendReply } = useThreadMessages(channelId, parentMessageId)
  const {
    reactionsByMessage, toggleReaction, reactionUid,
    reactionPicker, openReactionPicker, closeReactionPicker,
    messageMenu, openMessageMenu, closeMessageMenu,
    editingMessageId, editDraft, setEditDraft, startEdit, cancelEdit, saveEdit,
    deleteTarget, setDeleteTarget, confirmDelete,
    canEditMessage, canDeleteMessage,
  } = useMessageActions({ schoolId, channelId })

  const [hoveredMessageId, setHoveredMessageId] = useState(null)
  const [draftHtml, setDraftHtml] = useState('')
  const [sending, setSending] = useState(false)

  // 다른 스레드로 옮겨가면(부모가 바뀌면) 쓰던 답장 초안이 따라가지 않게 비운다.
  useEffect(() => { setDraftHtml('') }, [parentMessageId])

  const handleBodyClick = (e) => {
    const channelTarget = channelMentionTarget(e.target)
    if (channelTarget) { onOpenCanvas?.(channelTarget); return }
    if (isChannelWideMention(e.target)) return
    const uid = userMentionTarget(e.target)
    if (uid) openProfile(uid, e.target.closest('[data-mention-uid]'))
  }

  const submit = async () => {
    const safeHtml = sanitizeHtml(draftHtml)
    const text = htmlToText(safeHtml)
    const error = validateMessage(text)
    if (error) { toast.error(error); return }
    setSending(true)
    try {
      await sendReply({ body: text, bodyHtml: safeHtml })
      setDraftHtml('')
    } catch (e) {
      toast.error('답장을 보내지 못했습니다.', e)
    } finally {
      setSending(false)
    }
  }

  const rows = groupMessages(replies)
  const menuMessage = messageMenu?.message || null
  const menuMine = menuMessage && canEditMessage(menuMessage)
  const menuCanDelete = menuMessage && canDeleteMessage(menuMessage)

  const rowProps = (m, opts = {}) => ({
    message: m,
    members, channels,
    onOpenProfile: openProfile, onOpenCanvas, onBodyClick: handleBodyClick,
    reactionData: reactionsByMessage[m.id], reactionUid,
    onToggleReaction: toggleReaction, onOpenReactionPicker: openReactionPicker,
    hovered: hoveredMessageId === m.id,
    onMouseEnter: () => setHoveredMessageId(m.id),
    onMouseLeave: () => setHoveredMessageId(null),
    onOpenMenu: openMessageMenu,
    editing: editingMessageId === m.id,
    editDraft, onEditChange: setEditDraft, onSaveEdit: saveEdit, onCancelEdit: cancelEdit,
    showReplyIndicator: false,
    // 이 패널의 스크롤 컨테이너는 px:1.5라 메인 목록(px:2)과 다르다 — 줄 강조가
    // 패널 테두리에 맞게 번지려면 MessageRow에 이 값을 맞춰 넘겨야 한다.
    bleed: 1.5,
    ...opts,
  })

  return (
    <Box sx={{
      width: 360, flexShrink: 0, display: 'flex', flexDirection: 'column',
      height: '100%', minHeight: 0, borderLeft: '1px solid', borderColor: 'divider',
      bgcolor: 'background.paper',
    }}>
      <Box sx={{
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 0.5,
        px: 1.3, py: 1, borderBottom: '1px solid', borderColor: 'divider',
      }}>
        <Typography fontWeight={800} fontSize="0.85rem" sx={{ flexGrow: 1 }}>스레드</Typography>
        <Tooltip title="닫기">
          <IconButton size="small" onClick={onClose} aria-label="스레드 닫기">
            <CloseIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      </Box>

      <Box sx={{ flexGrow: 1, minHeight: 0, overflowY: 'auto', px: 1.5, py: 1.2 }}>
        {parent && (
          <>
            {/* 부모는 늘 이름·시각을 보여준다(grouped:false) — 답장과 헷갈리면 안 된다. */}
            <MessageRow {...rowProps({ ...parent, grouped: false })} />
            <Divider sx={{ my: 1 }} />
            {replies.length > 0 && (
              <Typography fontSize="0.72rem" fontWeight={800} color="text.disabled" sx={{ mb: 0.8 }}>
                {replies.length}개 답장
              </Typography>
            )}
          </>
        )}
        {rows.map(m => (
          <Box key={m.id}>
            {m.dayLabel && <DayDivider label={m.dayLabel} />}
            <MessageRow {...rowProps(m)} />
          </Box>
        ))}

        <ReactionPicker
          anchor={reactionPicker?.anchor}
          onClose={closeReactionPicker}
          onPick={emoji => {
            if (reactionPicker) toggleReaction(reactionPicker.messageId, emoji)
            closeReactionPicker()
          }}
        />
        <Menu
          anchorReference="anchorPosition"
          anchorPosition={messageMenu?.anchor || { top: 0, left: 0 }}
          open={!!messageMenu}
          onClose={closeMessageMenu}
        >
          {menuMine && (
            <MenuItem sx={{ fontSize: '0.85rem', gap: 1 }} onClick={() => startEdit(menuMessage)}>
              <EditIcon sx={{ fontSize: 16 }} />메시지 편집
            </MenuItem>
          )}
          {menuCanDelete && (
            <MenuItem
              sx={{ fontSize: '0.85rem', gap: 1, color: 'error.main' }}
              onClick={() => { closeMessageMenu(); setDeleteTarget(menuMessage) }}
            >
              <DeleteIcon sx={{ fontSize: 16 }} />메시지 삭제
            </MenuItem>
          )}
        </Menu>

        <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
          <DialogTitle sx={{ fontSize: '1rem', fontWeight: 800 }}>이 메시지를 삭제할까요?</DialogTitle>
          <DialogContent>
            <Typography color="text.secondary" fontSize="0.85rem">되돌릴 수 없습니다.</Typography>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setDeleteTarget(null)}>취소</Button>
            <Button variant="contained" color="error" onClick={confirmDelete}>삭제</Button>
          </DialogActions>
        </Dialog>
      </Box>

      <Box sx={{ flexShrink: 0, borderTop: '1px solid', borderColor: 'divider', p: 1 }}>
        {canPost ? (
          <MessageComposer
            value={draftHtml}
            onChange={setDraftHtml}
            onSubmit={submit}
            disabled={sending}
            channels={channels}
            members={members}
            showAttach={false}
            onPlusClick={() => {}}
            placeholder="답장 입력…"
          />
        ) : (
          <Typography fontSize="0.8rem" color="text.secondary" sx={{ px: 0.5, py: 0.6 }}>
            {postBlockedReason}
          </Typography>
        )}
      </Box>
    </Box>
  )
}
