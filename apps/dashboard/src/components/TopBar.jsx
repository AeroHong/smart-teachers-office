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
import IconButton from '@mui/material/IconButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import SearchIcon from '@mui/icons-material/Search'
import RefreshIcon from '@mui/icons-material/Refresh'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { useAuth } from '@shared/contexts/AuthContext'
import { PRESENCE, PRESENCE_ORDER } from '@shared/lib/presence'
import { openCommandPalette } from './CommandPalette'
import CallBell from './CallBell'
import usePresence from '../lib/usePresence'
import { useProfileCard } from './ProfileCardProvider'

const isDesktop = typeof window !== 'undefined' && !!window.smartOfficeDesktop

/**
 * 새로고침 — 데스크톱 앱은 트레이 상주라 며칠씩 재시작 없이 켜둘 수 있고, 그동안
 * 새로 배포된 수정사항이 안 들어온다(main.js가 30분 넘게 숨겨졌다 복귀할 때만
 * 자동으로 새로 받아온다, 2026-08-29). 그 자동 새로고침을 기다리지 않고 사용자가
 * 언제든 직접 누를 수 있게 한다("이건 아무래도 앱에서 쓰는 캐시 문제 같기도 한데" —
 * 같은 라운드의 사용자 요청). 데스크톱 앱은 main.js의 reloadIgnoringCache를,
 * 일반 브라우저는 그냥 location.reload()를 쓴다.
 */
function handleReload() {
  if (isDesktop) window.smartOfficeDesktop.reloadApp()
  else window.location.reload()
}

// 오른쪽 칸(호출벨+이름+재실 상태 ≈ 195px + titleBarOverlay 버튼 자리 138px)은 무슨
// 일이 있어도 이 폭 밑으로 안 줄어야 한다 — 줄면 이름·재실 상태가 잘리고 두 줄로
// 접힌다(사용자가 스크린샷으로 확인, 2026-08-26).
const SIDE_COLUMN_WIDTH = 360
// 검색창이 "편하게" 유지하려는 폭 — 검색 버튼 자체의 maxWidth(아래)와 같다.
const SEARCH_TARGET_WIDTH = 560
// 검색창이 그래도 이 밑으로는 안 줄어드는 바닥 — 아이콘+⌘K 배지+안팎 여백만 겨우
// 남고 "검색" 글자는 이 바닥에서 이미 완전히 사라진 상태다(아래 검색 라벨 참고).
const SEARCH_MIN_WIDTH = 100
// 그리드 gap(아래 header의 gap:1 = 8px) × 칸 사이 2군데.
const GRID_GAP_PX = 16

// 왼쪽 칸은 내용이 없는 순수 균형용이라, 창이 넓을 땐 오른쪽과 같은 360으로 맞춰
// 검색창을 정가운데에 두고, 창이 좁아지면 검색창이 SEARCH_TARGET_WIDTH를 유지할
// 수 있는 한 이 칸부터 먼저 줄어든다(0까지) — 검색창은 그게 바닥난 다음에야
// SEARCH_MIN_WIDTH까지 줄어든다(사용자 요청, 2026-09-09: "검색창 왼쪽 영역이 먼저
// 줄어들고, 최소 폭에 도달하면 그 다음 검색창이 줄어들도록").
//
// 처음엔 왼쪽을 minmax(0,360), 가운데(검색)를 minmax(100,1fr)로 짜면 될 줄 알았는데
// 실측해보니 정반대로 동작했다 — CSS Grid의 트랙 sizing은 유한한 minmax 트랙을
// fr(무한 취급) 트랙보다 먼저 최대치까지 채우고, 남은 공간만 fr 트랙에 준다. 즉
// "나중에 채워지는 쪽(fr)이 창이 좁아질 때 먼저 비워진다" — fr을 준 검색창이 먼저
// 줄고 minmax를 준 왼쪽이 나중에 줄어, 원하는 것과 거꾸로였다(그래서 여기 왼쪽 칸의
// 폭 자체를 calc/clamp로 직접 계산해 이미 "정해진 길이"로 만든다 — 그러면 협상에
// 안 끼고, 검색창(1fr)이 항상 나머지를 그대로 가져간다).
const LEFT_COLUMN_WIDTH = `clamp(0px, calc(100% - ${
  SIDE_COLUMN_WIDTH + SEARCH_TARGET_WIDTH + GRID_GAP_PX
}px), ${SIDE_COLUMN_WIDTH}px)`

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
  const { user, userName } = useAuth()
  const { open: openProfile } = useProfileCard()
  const { current, setStatus, saving } = usePresence()
  const [anchor, setAnchor] = useState(null)
  const p = PRESENCE[current] || PRESENCE.unknown

  return (
    <Box
      component="header"
      sx={{
        flexShrink: 0, display: 'grid',
        gridTemplateColumns: `${LEFT_COLUMN_WIDTH} minmax(${SEARCH_MIN_WIDTH}px, 1fr) ${SIDE_COLUMN_WIDTH}px`,
        alignItems: 'center', gap: 1, px: 1.5, py: 0.75,
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
          width: '100%', minWidth: 0, maxWidth: 560, mx: 'auto', px: 1.3, py: 0.4,
          border: '1px solid', borderColor: 'divider', borderRadius: 0.75,
          bgcolor: 'background.paper', cursor: 'pointer', color: 'text.secondary',
          '&:hover': { borderColor: 'text.disabled' },
          // 누를 수 있는 요소는 드래그 영역에서 뺀다 — 안 빼면 클릭이 창 이동으로만 먹힌다.
          WebkitAppRegion: 'no-drag',
        }}
      >
        <SearchIcon sx={{ fontSize: 18, flexShrink: 0 }} />
        {/* 상자가 좁아지면(SEARCH_MIN_WIDTH 근처) 줄바꿈 대신 글자가 그냥 잘려
            사라지게 한다 — minWidth:0이 없으면 flex 아이템은 내용 폭 밑으로 안
            줄어 오히려 상자가 넘친다(사용자 지적, 2026-09-09: "줄바꿈으로 아래로
            내려오지 않고, 그냥 사라져버리는게 좋겠다"). */}
        <Typography
          fontSize="0.86rem"
          sx={{ flexGrow: 1, minWidth: 0, textAlign: 'left', overflow: 'hidden', whiteSpace: 'nowrap' }}
        >
          검색
        </Typography>
        <Typography fontSize="0.74rem" sx={{ color: 'text.disabled', flexShrink: 0 }}>⌘K</Typography>
      </Box>

      <ThemeProvider theme={darkGroupTheme}>
        <Box sx={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1,
          // 예전엔 이 칸 전체를 no-drag로 막아서, 실제 버튼들 사이·왼쪽의 빈 공간까지
          // 창 이동이 안 먹혔다(사용자 지적, 2026-08-29 — "오른쪽 빈 영역에서는 드래그가
          // 안 됨"). 이제 칸 자체는 드래그 영역으로 두고, 실제로 누를 것들에만
          // no-drag를 붙인다(아래 각 항목).
          // Windows가 titleBarOverlay로 최소화·최대화·닫기 버튼을 창 오른쪽 위에 겹쳐
          // 그린다 — 우리 내용이 그 자리를 먼저 차지하면 버튼과 겹친다. main.js에서 준
          // titleBarOverlay 폭만큼 오른쪽에 자리를 비워 둔다.
          pr: '138px',
        }}>
          {/* 새로고침 — 사용자 요청(2026-08-29): "앱 상단에 강제 새로고침 버튼이
              있으면 좋겠어". 데스크톱 앱은 트레이에 며칠씩 떠 있을 수 있어 자동
              새로고침(30분 이상 숨겨졌다 복귀할 때, main.js)을 기다리지 않고 언제든
              직접 누를 수 있게 한다. */}
          <Tooltip title="새로고침">
            <IconButton
              size="small"
              onClick={handleReload}
              sx={{ color: 'text.secondary', WebkitAppRegion: 'no-drag' }}
            >
              <RefreshIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          {/* 호출은 지금 학생이 기다린다는 신호라 어느 화면에 있든 눈에 들어와야 한다.
              CallBell.jsx 자체엔 no-drag가 없어 여기서 감싼다. */}
          <Box sx={{ display: 'flex', alignItems: 'center', WebkitAppRegion: 'no-drag' }}>
            <CallBell />
          </Box>
          {/* 내 이름 — 눌러서 프로필 카드를 연다(사용자 지적, 2026-08-27: "이름 아이콘을
              눌러도 프로필로 안넘어감" — AppRail의 아바타만 연결해 두고 이 자리는
              빠뜨렸었다). */}
          <Typography
            component="button" type="button"
            onClick={e => user && openProfile(user.uid, e.currentTarget)}
            sx={{
              fontSize: '0.86rem', fontWeight: 600, ml: 0.5, color: 'text.primary',
              border: 0, background: 'none', p: 0, fontFamily: 'inherit', cursor: 'pointer',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              WebkitAppRegion: 'no-drag',
              '&:hover': { textDecoration: 'underline' },
            }}
          >
            {userName}
          </Typography>
          <Button
            size="small"
            disabled={saving}
            onClick={e => setAnchor(e.currentTarget)}
            endIcon={<ExpandMoreIcon sx={{ fontSize: 16 }} />}
            sx={{ color: p.color, fontWeight: 700, fontSize: '0.85rem', px: 1, whiteSpace: 'nowrap', WebkitAppRegion: 'no-drag' }}
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
