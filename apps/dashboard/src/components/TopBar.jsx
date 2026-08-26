/**
 * 상단바 — 검색과 내 상태.
 *
 * 검색은 Cmd/Ctrl+K 팔레트를 상시 노출로 끌어올린 것이다. 단축키만 있으면 아는 사람만
 * 쓰는데, 학교에서는 그 비율이 높지 않다. 상자를 보이게 두고 누르면 같은 팔레트가 열린다.
 *
 * 내 상태는 위젯 한 장을 차지하던 것을 드롭다운으로 접었다. 하루에 몇 번 바꾸는 값이라
 * 화면 자리를 상시로 내줄 이유가 없고, 대신 어느 화면에 있든 지금 상태가 보인다.
 *
 * 배경은 레일(1단)과 같은 색이다(사용자 요청, 2026-08-26) — 레일에서 상단바로 이어지는
 * 어두운 띠 하나로 보이고, 그 위에 흰 검색 알약과 오른쪽 묶음이 얹힌 모양. 오른쪽 묶음
 * (호출벨·이름·재실 상태)은 원래 밝은 배경을 가정한 색이라, 이 파일 안에서만 별도
 * 다크 테마로 감싸 글자·아이콘 색을 뒤집는다 — 그 컴포넌트들 자체는 손대지 않는다.
 */
import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Typography from '@mui/material/Typography'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import SearchIcon from '@mui/icons-material/Search'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { useAuth } from '@shared/contexts/AuthContext'
import { PRESENCE, PRESENCE_ORDER } from '@shared/lib/presence'
import { openCommandPalette } from './CommandPalette'
import CallBell from './CallBell'
import usePresence from '../lib/usePresence'

// 검색창이 가운데를 차지하는 만큼, 좌우 칸은 오른쪽 묶음(호출벨+이름+재실 상태 ≈ 195px)이
// + titleBarOverlay 버튼 자리(138px)를 더해도 절대 잘리지 않을 폭을 고정으로 준다.
// 이전엔 1fr끼리 나눠 갖게 했다가, 검색창이 넓어지면 오른쪽 묶음이 그만큼 밀려 이름·재실
// 상태가 잘리고 두 줄로 접혔다(사용자가 스크린샷으로 확인). 왼쪽은 내용이 없지만 같은
// 폭을 줘야 가운데 검색창이 실제로 창 정가운데에 온다.
const SIDE_COLUMN_WIDTH = 360

/** 오른쪽 묶음 전용 — 이 컴포넌트들(CallBell 포함)은 밝은 배경을 가정한 색을 쓰므로,
 *  여기서만 감싸 뒤집는다. */
const darkGroupTheme = (outer) => createTheme(outer, {
  palette: {
    mode: 'dark',
    background: { paper: outer.palette.rail.border },
    text: { primary: '#e2e8f0', secondary: '#94a3b8', disabled: '#64748b' },
    action: { hover: 'rgba(255,255,255,0.08)' },
    divider: 'rgba(255,255,255,0.09)',
  },
})

export default function TopBar() {
  const { userName } = useAuth()
  const { current, setStatus, saving } = usePresence()
  const [anchor, setAnchor] = useState(null)
  const p = PRESENCE[current] || PRESENCE.unknown

  return (
    <Box
      component="header"
      sx={{
        flexShrink: 0, display: 'grid',
        gridTemplateColumns: `${SIDE_COLUMN_WIDTH}px 1fr ${SIDE_COLUMN_WIDTH}px`,
        alignItems: 'center', gap: 1, px: 1.5, py: 1,
        bgcolor: 'rail.bg',
        // 데스크톱 앱은 OS 기본 제목줄을 없앴다(apps/desktop/main.js의 titleBarOverlay) —
        // 그러면서 "잡아서 창을 옮기는" 영역도 같이 사라져서, 이 바의 빈 공간이 그
        // 역할을 대신한다. 일반 브라우저 탭에서는 이 속성이 그냥 무시된다.
        WebkitAppRegion: 'drag',
      }}
    >
      {/* 왼쪽은 비워 균형만 잡는다 — 오른쪽 칸과 같은 고정 폭이라야 가운데 칸(검색)이
          실제로 창 정가운데에 온다. Slack이 검색을 창 가운데 두는 것과 같은 자리
          (사용자 확정, 2026-08-25). */}
      <Box />

      <Box
        component="button"
        type="button"
        onClick={openCommandPalette}
        sx={{
          display: 'flex', alignItems: 'center', gap: 0.8,
          width: '100%', maxWidth: 560, mx: 'auto', px: 1.3, py: 0.62,
          border: '1px solid', borderColor: 'divider', borderRadius: 0.75,
          bgcolor: 'background.paper', cursor: 'pointer', color: 'text.secondary',
          '&:hover': { borderColor: 'text.disabled' },
          // 누를 수 있는 요소는 드래그 영역에서 뺀다 — 안 빼면 클릭이 창 이동으로만 먹힌다.
          WebkitAppRegion: 'no-drag',
        }}
      >
        <SearchIcon sx={{ fontSize: 18 }} />
        <Typography fontSize="0.86rem" sx={{ flexGrow: 1, textAlign: 'left' }}>
          검색
        </Typography>
        <Typography fontSize="0.74rem" sx={{ color: 'text.disabled' }}>⌘K</Typography>
      </Box>

      <ThemeProvider theme={darkGroupTheme}>
        <Box sx={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1,
          WebkitAppRegion: 'no-drag',
          // Windows가 titleBarOverlay로 최소화·최대화·닫기 버튼을 창 오른쪽 위에 겹쳐
          // 그린다 — 우리 내용이 그 자리를 먼저 차지하면 버튼과 겹친다. main.js에서 준
          // titleBarOverlay 폭만큼 오른쪽에 자리를 비워 둔다.
          pr: '138px',
        }}>
          {/* 호출은 지금 학생이 기다린다는 신호라 어느 화면에 있든 눈에 들어와야 한다 */}
          <CallBell />
          <Typography fontSize="0.86rem" fontWeight={600} noWrap sx={{ ml: 0.5, color: 'text.primary' }}>
            {userName}
          </Typography>
          <Button
            size="small"
            disabled={saving}
            onClick={e => setAnchor(e.currentTarget)}
            endIcon={<ExpandMoreIcon sx={{ fontSize: 16 }} />}
            sx={{ color: p.color, fontWeight: 700, fontSize: '0.85rem', px: 1, whiteSpace: 'nowrap' }}
          >
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: p.color, mr: 0.8, flexShrink: 0 }} />
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
      </ThemeProvider>
    </Box>
  )
}
