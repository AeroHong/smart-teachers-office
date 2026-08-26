/**
 * 작업 공간 셸 — 레일 · 상단바 · 목록 · 상세.
 *
 *   레일(64)  |  사이드바(268)   |  상세(가변)
 *   이동       |  제목만 훑기      |  고른 것 하나를 제대로
 *
 * 위젯을 여러 장 깔던 구조를 걷어내고 목록/상세로 바꿨다. 요청과 안내는 본래
 * "목록에서 고르고 내용을 읽는" 일인데, 위젯 안에서 접었다 펴려니 폭도 높이도 모자랐다.
 * 제목만 세로로 나열하면 위젯 다섯 장이 차지하던 자리에 열다섯 건이 들어가고,
 * 상세는 자료·완료 명단이 제 폭을 갖는다.
 *
 * 스크롤은 사이드바와 상세가 각자 한다. 함께 움직이면 목록을 내리는 동안 읽던 글이 사라진다.
 */
import Box from '@mui/material/Box'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import AppRail from './AppRail'
import TopBar from './TopBar'
import CallAlert from './CallAlert'
import UpdateBanner from './UpdateBanner'

// 268 → 240. Slack과 나란히 놓고 보니 우리 쪽이 더 넓으면서 글자는 더 작았다
// (sidebarUi.jsx가 그만큼 커진다) — 폭을 줄이고 글자를 키워 밀도를 맞춘다.
const SIDEBAR_WIDTH = 240

/**
 * 사이드바(2단) 전용 다크 테마 — 1단(rail.bg)과 같은 계열, 한 단계 밝은 rail.border를
 * 배경으로 쓴다(사용자 요청, 2026-08-26). sidebarUi.jsx·ChannelSidebar.jsx는 손대지
 * 않았다 — 그 파일들이 이미 text.primary/secondary/disabled·action.hover 같은 의미
 * 있는 토큰만 쓰고 있어서, 여기서 그 토큰들의 값만 밝은 배경용에서 어두운 배경용으로
 * 바꿔치기하면 하위 컴포넌트 전체가 자동으로 뒤집힌다(sidebarUi를 쓰는 다른 화면 —
 * 내 활동·학사일정·요청 현황·쪽지·구성원도 전부 같은 방식으로 반영됨). 팝업 메뉴도
 * React context를 통해 이 테마를 물려받아 함께 어두워진다.
 *
 * createTheme(outer, override) 형태로 쓰면 override는 outer.palette를 통째로 다시
 * 계산하지 않고 얕게 덧씌우기만 한다 — mode를 'dark'로 바꿔도 action.active처럼 여기서
 * 직접 안 적은 토큰은 outer(밝은 테마)의 값(거의 검정)이 그대로 남는다. 색을 지정하지
 * 않은 아이콘 버튼(+·⋮)이 어두운 배경 위에서 안 보인 원인이 이것이었다(사용자 확인,
 * 2026-08-26) — action 전체를 다크 기본값으로 명시한다.
 */
const sidebarTheme = (outer) => createTheme(outer, {
  palette: {
    mode: 'dark',
    background: { paper: outer.palette.rail.border },
    text: { primary: '#e2e8f0', secondary: '#94a3b8', disabled: '#64748b' },
    action: {
      active: '#e2e8f0',
      hover: 'rgba(255,255,255,0.06)',
      selected: 'rgba(255,255,255,0.12)',
      disabled: 'rgba(255,255,255,0.3)',
      disabledBackground: 'rgba(255,255,255,0.12)',
    },
    divider: 'rgba(255,255,255,0.09)',
  },
})

export default function WorkspaceLayout({ sidebar, children }) {
  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden', bgcolor: 'background.default' }}>
      <AppRail />

      <Box sx={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {/* 상단바보다 위에 둔다 — 새 배포 안내는 지금 보는 화면보다 앞서는 이야기다 */}
        <UpdateBanner />
        <TopBar />

        <Box sx={{ flexGrow: 1, minHeight: 0, display: 'flex' }}>
          {/* 글쓰기처럼 목록이 없는 화면에서는 칸 자체를 없앤다. 빈 칸을 남겨두면
              268px가 아무 것도 없이 낭비된다. */}
          {sidebar && (
            <Box
              component="nav"
              sx={{
                width: SIDEBAR_WIDTH, flexShrink: 0,
                bgcolor: 'rail.border',
                overflowY: 'auto', py: 1, px: 0.75,
                display: { xs: 'none', sm: 'block' },
              }}
            >
              <ThemeProvider theme={sidebarTheme}>
                {sidebar}
              </ThemeProvider>
            </Box>
          )}

          {/* 3단은 흰 배경을 유지하고, 바깥 어두운 프레임(1단·상단바)과 맞닿는 오른쪽·
              아래 가장자리에만 같은 색 테두리를 둘렀다 — 어두운 틀 안에 흰 카드가 얹힌
              인상. 위·왼쪽은 상단바·사이드바가 이미 어두워 경계가 저절로 생겨 테두리가
              필요 없다(사용자 요청, 2026-08-26). */}
          <Box
            component="main"
            sx={{
              flexGrow: 1, minWidth: 0, overflowY: 'auto', bgcolor: 'background.paper',
              // 1px는 화면에서 거의 안 보였다(사용자 확인, 2026-08-26) — 두께만 올린다.
              borderRight: '3px solid', borderBottom: '3px solid', borderColor: 'rail.bg',
              borderTopRightRadius: 10, borderBottomRightRadius: 10,
            }}
          >
            {children}
          </Box>
        </Box>
      </Box>

      {/* 어느 화면에 있든 학생 호출은 오른쪽 아래에서 올라온다 */}
      <CallAlert />
    </Box>
  )
}

/** 상세 영역에 아직 아무것도 안 고른 상태. */
export function DetailPlaceholder({ emoji = '👈', message = '왼쪽에서 항목을 선택하세요.' }) {
  return (
    <Box sx={{
      height: '100%', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 1, color: 'text.disabled',
    }}>
      <Box sx={{ fontSize: '1.6rem' }}>{emoji}</Box>
      <Box sx={{ fontSize: '0.88rem' }}>{message}</Box>
    </Box>
  )
}
