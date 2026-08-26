/**
 * 반응(이모지) 고르는 팝오버 — CanvasEditor/PostDetail 둘 다 최상위 상태(reactionPicker)로
 * 연다. anchorPosition(좌표값, blockMenu의 Menu와 같은 방식)을 쓰는 이유는 anchorEl(살아
 * 있는 DOM 노드)을 쓰면 그 노드가 사라지는(hoveredBlock이 바뀌어 손잡이 칸이 다시
 * 그려지는) 순간 팝오버도 같이 닫히기 때문이다 — 클릭한 자리 좌표만 기억해 두면 그
 * 뒤로 원본 버튼이 사라져도 팝오버는 그대로 열려 있다.
 */
import Box from '@mui/material/Box'
import Popover from '@mui/material/Popover'
import { REACTION_EMOJIS } from '@shared/lib/blockReactions'

export default function ReactionPicker({ anchor, onClose, onPick }) {
  return (
    <Popover
      open={!!anchor}
      anchorReference="anchorPosition"
      anchorPosition={anchor || { top: 0, left: 0 }}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
    >
      <Box sx={{ display: 'flex', gap: 0.3, p: 0.6 }}>
        {REACTION_EMOJIS.map(emoji => (
          <Box
            key={emoji} component="button" type="button"
            onClick={() => onPick(emoji)}
            sx={{
              border: 0, background: 'none', cursor: 'pointer', fontSize: '1.15rem',
              borderRadius: 0.75, p: 0.35, lineHeight: 1,
              '&:hover': { bgcolor: 'action.hover' },
            }}
          >
            {emoji}
          </Box>
        ))}
      </Box>
    </Popover>
  )
}
