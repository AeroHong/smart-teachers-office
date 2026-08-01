/**
 * 대시보드 3분할 셸.
 *
 *   레일(64px)  |  캔버스(가변)  |  구성원 명단(280px)
 *   이동         |  내 작업       |  사람
 *
 * 영역마다 성격을 다르게 둔다. 왼쪽은 고정된 이동 수단, 가운데는 교사가 직접 배치하는
 * 작업 공간, 오른쪽은 항상 같은 자리에 있는 사람 목록. 역할이 갈려 있어야 화면이 커져도
 * 어디를 봐야 할지 헷갈리지 않는다.
 *
 * 스크롤은 캔버스와 명단이 각자 따로 한다. 페이지 전체가 함께 스크롤되면 명단을 보려고
 * 내렸을 때 위젯이 같이 사라진다.
 */
import { useState } from 'react'
import Box from '@mui/material/Box'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import AppRail from './AppRail'
import MemberRoster from './MemberRoster'
import CallAlert from './CallAlert'

const ROSTER_WIDTH = 244

export default function DashboardLayout({ children }) {
  const theme = useTheme()
  // 명단까지 나란히 두려면 폭이 꽤 필요하다. 좁으면 접고 레일 버튼으로 여닫는다.
  const wideEnough = useMediaQuery(theme.breakpoints.up('lg'))
  const [rosterOpenNarrow, setRosterOpenNarrow] = useState(false)

  const rosterOpen = wideEnough || rosterOpenNarrow

  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden', bgcolor: 'background.default' }}>
      <AppRail
        rosterOpen={rosterOpen}
        onToggleRoster={() => setRosterOpenNarrow(v => !v)}
        showRosterToggle={!wideEnough}
      />

      <Box component="main" sx={{ flexGrow: 1, minWidth: 0, overflowY: 'auto', px: { xs: 1.75, md: 2.5 }, py: 2 }}>
        {children}
      </Box>

      {rosterOpen && (
        <Box
          component="aside"
          sx={{
            width: ROSTER_WIDTH, flexShrink: 0,
            bgcolor: 'background.paper',
            borderLeft: '1px solid', borderColor: 'divider',
            display: 'flex', flexDirection: 'column', minHeight: 0,
            // 좁은 화면에서는 캔버스 위로 덮어 띄운다 (캔버스를 더 좁히지 않기 위해)
            ...(!wideEnough && {
              position: 'fixed', right: 0, top: 0, bottom: 0, zIndex: theme.zIndex.drawer,
              boxShadow: '-8px 0 24px rgba(15,23,42,.12)',
            }),
          }}
        >
          <MemberRoster onClose={!wideEnough ? () => setRosterOpenNarrow(false) : undefined} />
        </Box>
      )}

      {/* 어느 화면에 있든 학생 호출은 오른쪽 아래에서 올라온다 */}
      <CallAlert />
    </Box>
  )
}
