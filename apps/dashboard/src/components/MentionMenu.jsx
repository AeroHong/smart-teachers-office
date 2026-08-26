/**
 * `#`(채널)·`@`(사람) 입력으로 뜨는 자동완성 목록.
 *
 * SlashMenu.jsx와 같은 뼈대다(커서 위치에 뜨고, 아래 공간이 모자라면 위로 올리고,
 * 화살표·Enter로 고른다) — 다만 항목이 고정된 블록 목록이 아니라 채널·사람처럼
 * 매번 다른 목록이라 항목을 props로 받는 얇은 컴포넌트로 따로 뒀다.
 */
import { useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'

const MENU_WIDTH = 240
const MENU_MAX_HEIGHT = 260

/**
 * @param {{id, label, sublabel}[]} items 이미 query로 걸러 넘어온 목록
 * @param {string} [emptyText] 목록이 비었을 때 보여줄 안내(빈 화면 대신 "없습니다"를 보여줘야
 *   트리거 글자를 지워야 하는지 판단할 수 있다 — SlashMenu는 목록이 비면 아예 안 그리지만,
 *   여기서는 "#"·"@"를 쳤는데 아무 반응이 없으면 고장으로 보이기 쉬워 안내를 남긴다)
 */
export default function MentionMenu({ open, anchorRect, items, onSelect, onClose, emptyText }) {
  const [cursor, setCursor] = useState(0)
  const listRef = useRef(null)

  useEffect(() => { setCursor(0) }, [items])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.isComposing || e.keyCode === 229) return
      if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, items.length - 1)) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)) }
      else if (e.key === 'Enter' || e.key === 'Tab') {
        if (items[cursor]) { e.preventDefault(); onSelect(items[cursor]) }
      } else if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, items, cursor, onSelect, onClose])

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  if (!open || !anchorRect) return null

  const spaceBelow = window.innerHeight - anchorRect.bottom
  const above = spaceBelow < MENU_MAX_HEIGHT + 24
  const height = Math.min(MENU_MAX_HEIGHT, Math.max(items.length, 1) * 42 + 16)
  const top = above ? anchorRect.top - height - 6 : anchorRect.bottom + 6
  const left = Math.min(anchorRect.left, window.innerWidth - MENU_WIDTH - 16)

  return (
    <Paper
      elevation={8}
      ref={listRef}
      sx={{
        position: 'fixed', top, left, width: MENU_WIDTH, zIndex: 1400,
        maxHeight: MENU_MAX_HEIGHT, overflowY: 'auto', py: 0.5,
        border: '1px solid', borderColor: 'divider',
      }}
    >
      {items.length === 0 ? (
        <Typography fontSize="0.8rem" color="text.disabled" sx={{ px: 1.2, py: 0.8 }}>
          {emptyText || '찾는 항목이 없습니다'}
        </Typography>
      ) : items.map((item, i) => (
        <Box
          key={item.id}
          data-active={i === cursor}
          onMouseDown={e => { e.preventDefault(); onSelect(item) }}
          onMouseEnter={() => setCursor(i)}
          sx={{
            display: 'flex', alignItems: 'baseline', gap: 0.8,
            px: 1.2, py: 0.6, cursor: 'pointer',
            bgcolor: i === cursor ? 'action.hover' : 'transparent',
          }}
        >
          <Typography fontSize="0.85rem" fontWeight={600} noWrap>{item.label}</Typography>
          {item.sublabel && (
            <Typography fontSize="0.73rem" color="text.secondary" noWrap>{item.sublabel}</Typography>
          )}
        </Box>
      ))}
    </Paper>
  )
}
