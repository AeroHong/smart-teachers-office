/**
 * 빈 채널의 첫 화면 — "여기서 무엇부터 해야 하나"에 답한다.
 *
 * 채널을 막 만든 사람이 보는 화면이 한 줄짜리 안내뿐이면, 만들어 놓고 아무것도 하지 않는다.
 * 그러면 참여자들에게는 이름만 있고 아무 일도 일어나지 않는 채널이 하나 늘고, 다음에 채널을
 * 만들 이유도 함께 사라진다. 첫 글 하나가 올라가느냐가 채널이 살아나느냐를 가른다.
 *
 * 할 일을 세 개까지만 보여준다. 이미 되어 있는 것(설명이 붙었다, 참여자가 있다)은 빼고
 * 남은 것만 남긴다 — 다 지운 목록은 저절로 사라지므로 "닫기"를 따로 둘 필요가 없다.
 *
 * 권한이 없으면 그 줄도 없앤다. 공지 전용 채널의 참여자에게 "첫 글을 쓰세요"를 권해놓고
 * 눌렀을 때 막으면, 시키는 대로 했는데 안 되는 화면이 된다.
 */
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import LockIcon from '@mui/icons-material/LockOutlined'
import TagIcon from '@mui/icons-material/Tag'
import { isPrivateChannel } from '@shared/lib/channels'

export default function ChannelIntro({ channel, canPost, canManage, onNewPost, onEditChannel }) {
  const priv = isPrivateChannel(channel)
  const memberCount = channel.memberUids?.length ?? 0

  const todos = [
    canPost && {
      key: 'post',
      label: '첫 업무 글 쓰기',
      // 여기가 채널의 값어치를 설명할 자리다. 글 쓰기 버튼이 어디 있는지가 아니라,
      // 그 글이 어떻게 다뤄지는지를 적는다
      hint: '마감과 대상이 있는 일을 올리면 채널 머리에 탭으로 붙고, 끝나면 저절로 접힙니다.',
      onClick: onNewPost,
    },
    canManage && !channel.description && {
      key: 'desc',
      label: '채널 설명 붙이기',
      hint: '무엇을 하는 자리인지 한 줄이면 충분합니다. 나중에 들어온 사람이 읽을 유일한 안내입니다.',
      onClick: onEditChannel,
    },
    canManage && memberCount <= 1 && {
      key: 'members',
      label: '참여자 정하기',
      hint: '지금은 나 혼자입니다. 조건("2학년 담임")으로 뽑으면 인사이동 뒤에도 다시 맞출 수 있습니다.',
      onClick: onEditChannel,
    },
  ].filter(Boolean)

  return (
    <Box sx={{ maxWidth: 620, py: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, mb: 1 }}>
        {priv
          ? <LockIcon sx={{ fontSize: 26, color: 'warning.main' }} />
          : <TagIcon sx={{ fontSize: 30, color: 'text.disabled' }} />}
        <Typography variant="h5" fontWeight={800}>{channel.name}</Typography>
      </Box>

      <Typography fontSize="0.95rem" color="text.secondary">
        여기가 이 채널의 시작입니다.
        {' '}
        {priv
          // 비공개는 "참여자만 본다"가 아니라 "참여자가 아니면 존재도 모른다"이다.
          // 여기서 정확히 적어두지 않으면 그 차이를 알 자리가 없다
          ? '참여자가 아니면 이 채널이 있다는 것도 모릅니다.'
          : '학교 선생님 누구나 이 채널을 찾아볼 수 있습니다.'}
      </Typography>

      {channel.description && (
        <Typography fontSize="0.9rem" sx={{ mt: 1 }}>{channel.description}</Typography>
      )}

      <Typography fontSize="0.8rem" color="text.disabled" sx={{ mt: 0.8 }}>
        참여 {memberCount}명
        {channel.memberRuleText && ` · ${channel.memberRuleText}`}
      </Typography>

      {todos.length > 0 && (
        <Box sx={{ mt: 2.5 }}>
          <Typography fontSize="0.72rem" fontWeight={800} color="text.disabled" sx={{ mb: 0.8, letterSpacing: '.03em' }}>
            다음에 할 일
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.6 }}>
            {todos.map(t => (
              <Box
                key={t.key}
                component="button" type="button" onClick={t.onClick}
                sx={{
                  display: 'flex', alignItems: 'flex-start', gap: 1, width: '100%',
                  border: '1px solid', borderColor: 'divider', borderRadius: 1,
                  bgcolor: 'background.paper', textAlign: 'left', px: 1.4, py: 1.1,
                  cursor: 'pointer', fontFamily: 'inherit',
                  '&:hover': {
                    borderColor: 'primary.light',
                    bgcolor: theme => alpha(theme.palette.primary.main, 0.04),
                  },
                }}
              >
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Typography fontSize="0.88rem" fontWeight={700}>{t.label}</Typography>
                  <Typography fontSize="0.78rem" color="text.secondary">{t.hint}</Typography>
                </Box>
                <ChevronRightIcon sx={{ fontSize: 18, color: 'text.disabled', mt: '2px' }} />
              </Box>
            ))}
          </Box>
        </Box>
      )}

      <Typography fontSize="0.82rem" color="text.secondary" sx={{ mt: 2.5 }}>
        되묻고 싶은 것은 아래에 그냥 적으면 됩니다. 한 번의 답이 참여자 전원에게 남습니다.
      </Typography>
    </Box>
  )
}
