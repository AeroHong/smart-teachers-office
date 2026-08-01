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
import AppRail from './AppRail'
import TopBar from './TopBar'
import CallAlert from './CallAlert'

const SIDEBAR_WIDTH = 268

export default function WorkspaceLayout({ sidebar, children }) {
  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden', bgcolor: 'background.default' }}>
      <AppRail />

      <Box sx={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <TopBar />

        <Box sx={{ flexGrow: 1, minHeight: 0, display: 'flex' }}>
          {/* 글쓰기처럼 목록이 없는 화면에서는 칸 자체를 없앤다. 빈 칸을 남겨두면
              268px가 아무 것도 없이 낭비된다. */}
          {sidebar && (
            <Box
              component="nav"
              sx={{
                width: SIDEBAR_WIDTH, flexShrink: 0,
                borderRight: '1px solid', borderColor: 'divider',
                overflowY: 'auto', py: 1, px: 0.75,
                display: { xs: 'none', sm: 'block' },
              }}
            >
              {sidebar}
            </Box>
          )}

          <Box
            component="main"
            sx={{ flexGrow: 1, minWidth: 0, overflowY: 'auto', bgcolor: 'background.paper' }}
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
