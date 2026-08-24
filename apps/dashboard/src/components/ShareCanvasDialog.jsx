/**
 * 캔버스를 다른 채널로 넘기기.
 *
 * 전교직원 채널에 올라온 글이 실은 한 부서 얘기인 경우가 잦다. 그때 글을 옮기거나 다시 쓰는
 * 대신, 그 채널에 **가리키는 메시지 하나**를 남긴다. 원본은 그대로 있고 완료 집계도 한 곳에
 * 모인다 — 복제하면 어느 쪽이 맞는지 알 수 없게 되고, 복제본에 완료 체크를 한 사람은 했다고
 * 믿지만 원본 집계에는 안 잡힌다.
 *
 * 한마디를 붙일 수 있게 한 이유: 왜 넘겼는지가 없으면 받는 쪽에서 "이걸 왜 여기 올렸지"가
 * 된다. 인용 없이 넘기는 것과 한 줄 붙여 넘기는 것은 받는 사람에게 전혀 다른 말이다.
 *
 * 넘길 수 있는 채널만 고르게 한다 — 내가 참여 중이고, 쓸 수 있고(공지 전용 채널이면 주인만),
 * 원본이 있던 채널은 뺀다. 고른 뒤에 규칙에 막히면 사용자는 기능이 고장 난 것으로 읽는다.
 */
import { useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import LockIcon from '@mui/icons-material/LockOutlined'
import TagIcon from '@mui/icons-material/Tag'
import { SHARE_NOTE_MAX } from '@shared/lib/channelMessages'
import { canPostTo, isPrivateChannel } from '@shared/lib/channels'

export default function ShareCanvasDialog({
  open, post, sourceChannel, channels, myUid, isAdmin, busy, onClose, onShare,
}) {
  const [targetId, setTargetId] = useState(null)
  const [note, setNote] = useState('')

  const candidates = useMemo(() => (channels || []).filter(c => (
    c.id !== sourceChannel?.id && canPostTo(c, myUid, isAdmin)
  )), [channels, sourceChannel, myUid, isAdmin])

  const close = () => { setTargetId(null); setNote(''); onClose() }

  const submit = () => {
    const target = candidates.find(c => c.id === targetId)
    if (!target) return
    onShare({ target, note: note.trim() })
    setTargetId(null)
    setNote('')
  }

  // 비공개 채널의 글은 애초에 이 대화상자를 열 수 없다(Channels.jsx). 그래도 여기서 한 번 더
  // 밝히는 이유는, 왜 메뉴가 없는지를 사용자가 알 자리가 달리 없기 때문이다.
  const blocked = sourceChannel && isPrivateChannel(sourceChannel)

  return (
    <Dialog open={open} onClose={close} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontSize: '1rem', fontWeight: 800 }}>다른 채널로 넘기기</DialogTitle>
      <DialogContent>
        <Typography fontSize="0.85rem" fontWeight={600} noWrap sx={{ mb: 0.3 }}>
          {post?.title}
        </Typography>
        <Typography fontSize="0.76rem" color="text.secondary" sx={{ mb: 1.5 }}>
          글을 옮기는 것이 아니라, 고른 채널에 이 글을 가리키는 메시지를 남깁니다.
          원본과 완료 현황은 그대로 한 곳에 있습니다.
        </Typography>

        {blocked ? (
          <Typography fontSize="0.85rem" color="warning.dark">
            비공개 채널의 글은 넘길 수 없습니다. 참여자가 아닌 사람에게는 링크가 열리지 않아,
            채널에 눌러도 안 열리는 줄만 남습니다.
          </Typography>
        ) : candidates.length === 0 ? (
          <Typography fontSize="0.85rem" color="text.secondary">
            넘길 수 있는 채널이 없습니다. 참여 중이면서 글을 쓸 수 있는 채널에만 넘길 수 있습니다.
          </Typography>
        ) : (
          <>
            <Box sx={{ maxHeight: 240, overflowY: 'auto', mb: 1.5 }}>
              {candidates.map(c => (
                <Box
                  key={c.id}
                  component="button" type="button"
                  onClick={() => setTargetId(c.id)}
                  sx={{
                    display: 'flex', alignItems: 'center', gap: 0.7, width: '100%',
                    border: '1px solid', borderRadius: 1, px: 1, py: 0.7, mb: 0.4,
                    borderColor: targetId === c.id ? 'primary.main' : 'divider',
                    bgcolor: targetId === c.id ? 'action.selected' : 'background.paper',
                    textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                    '&:hover': { borderColor: 'primary.light' },
                  }}
                >
                  {isPrivateChannel(c)
                    ? <LockIcon sx={{ fontSize: 15, color: 'warning.main', flexShrink: 0 }} />
                    : <TagIcon sx={{ fontSize: 16, color: 'text.disabled', flexShrink: 0 }} />}
                  <Typography fontSize="0.86rem" noWrap>{c.name}</Typography>
                </Box>
              ))}
            </Box>

            <TextField
              fullWidth size="small" multiline maxRows={3}
              label="한마디 (선택)"
              placeholder="예: 우리 부서도 해당됩니다"
              value={note}
              inputProps={{ maxLength: SHARE_NOTE_MAX }}
              onChange={e => setNote(e.target.value)}
            />
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={close}>취소</Button>
        <Button
          variant="contained"
          disabled={busy || blocked || !targetId}
          onClick={submit}
        >
          넘기기
        </Button>
      </DialogActions>
    </Dialog>
  )
}
