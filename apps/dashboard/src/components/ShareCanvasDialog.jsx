/**
 * 글을 다른 채널·사람에게 전달하기.
 *
 * 전체 공지에 올라온 글이 실은 한 부서 얘기인 경우가 잦다. 그때 글을 옮기거나 다시 쓰는
 * 대신, 그 자리에 **가리키는 메시지 하나**를 남긴다. 원본은 그대로 있고 완료 집계도 한 곳에
 * 모인다 — 복제하면 어느 쪽이 맞는지 알 수 없게 되고, 복제본에 완료 체크를 한 사람은 했다고
 * 믿지만 원본 집계에는 안 잡힌다.
 *
 * ── 채널과 사람을 한 칸에서 고른다 ──────────────────────────
 *
 * "이 글을 누구에게 보여줄까"를 정할 때 머릿속에서 채널과 사람이 갈라져 있지 않다. 부서
 * 채널일 수도 있고 그 담당자 한 명일 수도 있다. 목록을 둘로 나누면 고르기 전에 어느 쪽인지를
 * 먼저 정해야 하고, 그건 사용자가 아니라 우리 자료구조의 사정이다.
 *
 * 사람을 고르면 DM으로 간다 — DM이 "이름 없는 2인 채널"이라 전달 코드가 한 벌로 끝난다.
 *
 * ── 무엇을 보내는지 보여준다 ────────────────────────────────
 *
 * 고르는 화면에 원본이 안 보이면, 탭을 여러 개 띄워 둔 사람은 지금 무엇을 넘기는지 확신이
 * 없는 채로 누르게 된다. 잘못 보낸 글은 지울 수는 있어도 이미 읽힌 뒤다.
 */
import { useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import CloseIcon from '@mui/icons-material/Close'
import LockIcon from '@mui/icons-material/LockOutlined'
import PersonIcon from '@mui/icons-material/PersonOutline'
import TagIcon from '@mui/icons-material/Tag'
import { SHARE_NOTE_MAX } from '@shared/lib/channelMessages'
import { canPostTo, isPrivateChannel } from '@shared/lib/channels'

export default function ShareCanvasDialog({
  open, post, sourceChannel, channels, members, myUid, isAdmin, busy,
  onClose, onShare, onCopyLink,
}) {
  const [keyword, setKeyword] = useState('')
  const [picked, setPicked] = useState(null)   // { kind: 'channel'|'member', id, name, ... }
  const [note, setNote] = useState('')

  // 비공개 채널의 글은 애초에 이 대화상자를 열 수 없다(Channels.jsx). 그래도 여기서 한 번 더
  // 밝히는 이유는, 왜 메뉴가 없는지를 사용자가 알 자리가 달리 없기 때문이다.
  const blocked = sourceChannel && isPrivateChannel(sourceChannel)

  const options = useMemo(() => {
    const k = keyword.trim()
    const chans = (channels || [])
      .filter(c => c.id !== sourceChannel?.id && canPostTo(c, myUid, isAdmin))
      .filter(c => !k || (c.name || '').includes(k))
      .map(c => ({ kind: 'channel', id: c.id, name: c.name, channel: c }))
    const people = (members || [])
      .filter(m => m.uid !== myUid)
      .filter(m => !k || m.name.includes(k) || (m.department || '').includes(k))
      .map(m => ({ kind: 'member', id: m.uid, name: m.name, member: m }))

    // 채널을 먼저 보여준다. "채널 우선, DM은 폴백"이 확정 사항이고, 목록 순서가 곧 권유다.
    // 검색어가 없을 때 사람 예순 명이 쏟아지면 채널이 밀려나므로 그때는 잘라 둔다.
    return [...chans, ...people.slice(0, k ? 20 : 5)]
  }, [channels, members, sourceChannel, myUid, isAdmin, keyword])

  const close = () => { setKeyword(''); setPicked(null); setNote(''); onClose() }

  return (
    <Dialog open={open} onClose={close} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontSize: '1.05rem', fontWeight: 800, pr: 6 }}>
        이 글 전달
        <IconButton onClick={close} sx={{ position: 'absolute', right: 12, top: 12 }} aria-label="닫기">
          <CloseIcon sx={{ fontSize: 20 }} />
        </IconButton>
      </DialogTitle>

      <DialogContent>
        {blocked ? (
          <Typography fontSize="0.88rem" color="warning.dark" sx={{ py: 2 }}>
            비공개 채널의 글은 전달할 수 없습니다. 참여자가 아닌 사람에게는 링크가 열리지 않아,
            받는 자리에 눌러도 안 열리는 줄만 남습니다.
          </Typography>
        ) : (
          <>
            {picked ? (
              <Box sx={{
                display: 'flex', alignItems: 'center', gap: 0.7, mb: 1,
                border: '1px solid', borderColor: 'primary.main', borderRadius: 1, px: 1.2, py: 0.9,
              }}>
                <OptionIcon option={picked} />
                <Typography fontSize="0.9rem" fontWeight={600} sx={{ flexGrow: 1 }} noWrap>
                  {picked.name}
                </Typography>
                <Button size="small" onClick={() => setPicked(null)} sx={{ fontSize: '0.75rem' }}>
                  바꾸기
                </Button>
              </Box>
            ) : (
              <>
                <TextField
                  autoFocus fullWidth size="small"
                  placeholder="채널 또는 사용자 검색"
                  value={keyword}
                  onChange={e => setKeyword(e.target.value)}
                />
                <Box sx={{
                  maxHeight: 220, overflowY: 'auto', mt: 0.5, mb: 1,
                  border: '1px solid', borderColor: 'divider', borderRadius: 1,
                }}>
                  {options.length === 0 ? (
                    <Typography fontSize="0.84rem" color="text.disabled" sx={{ p: 2, textAlign: 'center' }}>
                      전달할 곳이 없습니다.
                    </Typography>
                  ) : options.map(o => (
                    <Box
                      key={`${o.kind}-${o.id}`}
                      component="button" type="button"
                      onClick={() => { setPicked(o); setKeyword('') }}
                      sx={{
                        display: 'flex', alignItems: 'center', gap: 0.8, width: '100%',
                        border: 0, background: 'none', textAlign: 'left', px: 1.2, py: 0.8,
                        cursor: 'pointer', fontFamily: 'inherit',
                        '&:hover': { bgcolor: 'action.hover' },
                      }}
                    >
                      <OptionIcon option={o} />
                      <Typography fontSize="0.88rem" noWrap sx={{ flexGrow: 1 }}>{o.name}</Typography>
                      {o.kind === 'member' && (
                        <Typography fontSize="0.72rem" color="text.disabled" noWrap>
                          {o.member.department || '개인 대화'}
                        </Typography>
                      )}
                    </Box>
                  ))}
                </Box>
              </>
            )}

            <TextField
              fullWidth size="small" multiline maxRows={3}
              placeholder="한마디 붙이기 (선택) — 예: 우리 부서도 해당됩니다"
              value={note}
              inputProps={{ maxLength: SHARE_NOTE_MAX }}
              onChange={e => setNote(e.target.value)}
              sx={{ mb: 1.5 }}
            />

            {/* 무엇을 보내는지 — 받는 쪽에 뜰 카드와 같은 모양으로 그린다 */}
            <Box sx={{
              border: '1px solid', borderColor: 'divider', borderRadius: 1,
              bgcolor: 'action.hover', px: 1.3, py: 1,
            }}>
              <Typography fontSize="0.7rem" color="text.disabled" sx={{ mb: 0.3 }}>
                전달할 글
              </Typography>
              <Typography fontSize="0.9rem" fontWeight={700} noWrap>{post?.title}</Typography>
              <Typography fontSize="0.74rem" color="text.secondary" noWrap>
                {post?.createdByName}
                {sourceChannel?.name && ` · # ${sourceChannel.name}에 게시됨`}
              </Typography>
            </Box>

            <Typography fontSize="0.74rem" color="text.disabled" sx={{ mt: 1 }}>
              글을 옮기는 것이 아니라 가리키는 메시지를 남깁니다. 원본과 완료 현황은 한 곳에 그대로 있습니다.
            </Typography>
          </>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2, justifyContent: 'space-between' }}>
        {/* 전달할 곳이 마땅치 않을 때의 탈출구. 쿨메신저에 붙여넣는 것이 아직도 가장 빠른
            경우가 있어서, 그 길을 막지 않는다. */}
        <Button onClick={() => onCopyLink(post)} disabled={!post} sx={{ fontSize: '0.8rem' }}>
          링크 복사
        </Button>
        <Box>
          <Button onClick={close}>취소</Button>
          <Button
            variant="contained"
            disabled={busy || blocked || !picked}
            onClick={() => { onShare({ picked, note: note.trim() }); close() }}
          >
            전달
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  )
}

function OptionIcon({ option }) {
  if (option.kind === 'member') {
    return <PersonIcon sx={{ fontSize: 17, color: 'text.disabled', flexShrink: 0 }} />
  }
  return isPrivateChannel(option.channel)
    ? <LockIcon sx={{ fontSize: 15, color: 'warning.main', flexShrink: 0 }} />
    : <TagIcon sx={{ fontSize: 16, color: 'text.disabled', flexShrink: 0 }} />
}
