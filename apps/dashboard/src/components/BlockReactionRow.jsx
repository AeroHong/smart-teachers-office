/**
 * 블록 반응(이모지 리액션) 알약 줄 — CanvasEditor(쓰는 사람)와 PostDetail(읽는 사람) 둘 다
 * 같은 컴포넌트를 쓴다. 반응은 캔버스를 쓴 사람만이 아니라 채널의 누구나 남길 수 있어야
 * 하므로(PLAN_canvasBlocks.md Phase 3, "여러 명이 같은 이모지에 반응"), 편집기 안 손잡이
 * 오버레이 전용이 아니라 두 화면에서 재사용 가능한 순수 표시 컴포넌트로 뺐다.
 *
 * 실제 위치(고정 좌표)는 부르는 쪽이 정한다 — CanvasEditor는 손잡이처럼 hoveredBlock 옆에,
 * PostDetail은 useBlockReactionRects로 잰 블록 rect 옆에 띄운다.
 */
import { useState } from 'react'
import Box from '@mui/material/Box'
import Popover from '@mui/material/Popover'
import Tooltip from '@mui/material/Tooltip'
import AddReactionOutlinedIcon from '@mui/icons-material/AddReactionOutlined'
import { REACTION_EMOJIS, summarizeReactions } from '@shared/lib/blockReactions'

export default function BlockReactionRow({ data, uid, onToggle }) {
  const [anchor, setAnchor] = useState(null)
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
          onClick={e => { e.stopPropagation(); setAnchor(e.currentTarget) }}
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
      <Popover
        open={!!anchor} anchorEl={anchor} onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Box sx={{ display: 'flex', gap: 0.3, p: 0.6 }}>
          {REACTION_EMOJIS.map(emoji => (
            <Box
              key={emoji} component="button" type="button"
              onClick={() => { onToggle(emoji); setAnchor(null) }}
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
    </Box>
  )
}
