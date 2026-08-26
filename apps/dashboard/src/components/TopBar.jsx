/**
 * 상단바 — 검색과 내 상태.
 *
 * 검색은 Cmd/Ctrl+K 팔레트를 상시 노출로 끌어올린 것이다. 단축키만 있으면 아는 사람만
 * 쓰는데, 학교에서는 그 비율이 높지 않다. 상자를 보이게 두고 누르면 같은 팔레트가 열린다.
 *
 * 내 상태는 위젯 한 장을 차지하던 것을 드롭다운으로 접었다. 하루에 몇 번 바꾸는 값이라
 * 화면 자리를 상시로 내줄 이유가 없고, 대신 어느 화면에 있든 지금 상태가 보인다.
 */
import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Typography from '@mui/material/Typography'
import SearchIcon from '@mui/icons-material/Search'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { useAuth } from '@shared/contexts/AuthContext'
import { PRESENCE, PRESENCE_ORDER } from '@shared/lib/presence'
import { openCommandPalette } from './CommandPalette'
import CallBell from './CallBell'
import usePresence from '../lib/usePresence'

export default function TopBar() {
  const { userName } = useAuth()
  const { current, setStatus, saving } = usePresence()
  const [anchor, setAnchor] = useState(null)
  const p = PRESENCE[current] || PRESENCE.unknown

  return (
    <Box
      component="header"
      sx={{
        flexShrink: 0, display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center',
        gap: 1, px: 1.5, py: 1,
        borderBottom: '1px solid', borderColor: 'divider',
      }}
    >
      {/* 왼쪽은 비워 균형만 잡는다 — 오른쪽 묶음 폭과 무관하게 가운데 칸이 창
          정가운데에 오려면 양옆에 같은 1fr을 줘야 한다(flex 스페이서 하나로는
          오른쪽 묶음 폭만큼 가운데가 밀린다). Slack이 검색을 창 가운데 두는 것과 같은
          자리(사용자 확정, 2026-08-26). */}
      <Box />

      <Box
        component="button"
        type="button"
        onClick={openCommandPalette}
        sx={{
          display: 'flex', alignItems: 'center', gap: 0.8,
          width: '100%', maxWidth: 480, mx: 'auto', px: 1.3, py: 0.62,
          border: '1px solid', borderColor: 'divider', borderRadius: 0.75,
          bgcolor: 'background.paper', cursor: 'pointer', color: 'text.secondary',
          '&:hover': { borderColor: 'text.disabled' },
        }}
      >
        <SearchIcon sx={{ fontSize: 18 }} />
        <Typography fontSize="0.86rem" sx={{ flexGrow: 1, textAlign: 'left' }}>
          검색
        </Typography>
        <Typography fontSize="0.74rem" sx={{ color: 'text.disabled' }}>⌘K</Typography>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1 }}>
        {/* 호출은 지금 학생이 기다린다는 신호라 어느 화면에 있든 눈에 들어와야 한다 */}
        <CallBell />
        <Typography fontSize="0.86rem" fontWeight={600} noWrap sx={{ ml: 0.5 }}>{userName}</Typography>
        <Button
          size="small"
          disabled={saving}
          onClick={e => setAnchor(e.currentTarget)}
          endIcon={<ExpandMoreIcon sx={{ fontSize: 16 }} />}
          sx={{ color: p.color, fontWeight: 700, fontSize: '0.85rem', px: 1 }}
        >
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: p.color, mr: 0.8 }} />
          {p.label}
        </Button>
      </Box>

      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        {PRESENCE_ORDER.map(key => {
          const s = PRESENCE[key]
          return (
            <MenuItem
              key={key}
              selected={current === key}
              onClick={() => { setStatus(key); setAnchor(null) }}
              sx={{ fontSize: '0.85rem', gap: 1 }}
            >
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: s.color }} />
              {s.label}
            </MenuItem>
          )
        })}
      </Menu>
    </Box>
  )
}
