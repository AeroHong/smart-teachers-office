/**
 * 블록 반응(이모지 리액션) 알약 줄 — CanvasEditor(쓰는 사람)와 PostDetail(읽는 사람) 둘 다
 * 같은 컴포넌트를 쓴다. 반응은 캔버스를 쓴 사람만이 아니라 채널의 누구나 남길 수 있어야
 * 하므로(PLAN_canvasBlocks.md Phase 3, "여러 명이 같은 이모지에 반응"), 편집기 안 손잡이
 * 오버레이 전용이 아니라 두 화면에서 재사용 가능한 순수 표시 컴포넌트로 뺐다.
 *
 * 이모지 고르는 팝오버는 이 컴포넌트가 직접 열지 않는다("반응 추가" 단추는 onAddClick만
 * 부른다) — 부르는 쪽(CanvasEditor/PostDetail)이 자기 최상위 상태(reactionPicker)로 연다.
 * 예전에는 이 컴포넌트 안 useState로 팝오버를 관리했는데, 그 팝오버가 들어있던 칸이
 * hoveredBlock에 매여 있어서 마우스가 살짝만 움직여도(다른 블록으로 인식되면) 칸 전체가
 * 사라지며 막 열었던 팝오버까지 함께 닫혀버렸다(사용자 확인, 2026-08-26 — "그때부터는
 * 마우스가 움직여도 계속 해당 이모지 창이 떠있어야 함"). 팝오버 상태를 hoveredBlock과
 * 무관한 자리로 옮겨야 이 문제가 없어진다.
 */
import Box from '@mui/material/Box'
import Tooltip from '@mui/material/Tooltip'
import AddReactionOutlinedIcon from '@mui/icons-material/AddReactionOutlined'
import { summarizeReactions } from '@shared/lib/blockReactions'

export default function BlockReactionRow({ data, uid, onToggle, onAddClick }) {
  const pills = summarizeReactions(data, uid)

  return (
    <Box sx={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.4 }}>
      {pills.map(p => (
        <Box
          key={p.emoji} component="button" type="button"
          onClick={() => onToggle(p.emoji)}
          sx={{
            display: 'inline-flex', alignItems: 'center', gap: '0.25em',
            fontFamily: 'inherit', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer',
            border: '1px solid', borderColor: p.mine ? 'primary.main' : 'divider',
            bgcolor: p.mine ? 'primary.main' : 'background.paper',
            color: p.mine ? 'primary.contrastText' : 'text.secondary',
            borderRadius: 999, px: 0.7, py: 0.15, lineHeight: 1.5, boxShadow: 1,
          }}
        >
          <span>{p.emoji}</span><span>{p.count}</span>
        </Box>
      ))}
      <Tooltip title="반응 추가">
        <Box
          component="button" type="button"
          onClick={e => { e.stopPropagation(); onAddClick(e) }}
          sx={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 20, height: 20, border: '1px dashed', borderColor: 'divider',
            borderRadius: 999, cursor: 'pointer', bgcolor: 'background.paper', color: 'text.disabled',
            boxShadow: pills.length ? 1 : 0,
            '&:hover': { bgcolor: 'action.hover', color: 'text.secondary' },
          }}
        >
          <AddReactionOutlinedIcon sx={{ fontSize: 13 }} />
        </Box>
      </Tooltip>
    </Box>
  )
}
