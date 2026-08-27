/**
 * 보강신청 — 1단 "보강신청" 레일 버튼의 진입점.
 *
 * 포털(`apps/portal/src/pages/cover/*.jsx`)의 /cover, /cover/mypage, /cover/status와
 * 같은 `coverRequests` 컬렉션을 보는 대시보드 쪽 추가 진입점이다(포털 화면은 그대로 두고
 * 안 건드림). 목록/내 현황/현황판 세 화면을 이 컴포넌트 하나가 pathname으로 갈라
 * 보여준다 — AcademicCalendar.jsx가 그리드+상세를 한 화면에서 다루는 것과 같은 발상,
 * 여기는 "고른 항목 하나"가 아니라 "세 모드 중 하나"라 목록/상세 대신 탭처럼 쓴다.
 */
import { useLocation, useNavigate } from 'react-router-dom'
import SwapHorizIcon from '@mui/icons-material/SwapHoriz'
import WorkspaceLayout from '../components/WorkspaceLayout'
import { SidebarItem, SidebarSection } from '../components/sidebarUi'
import CoverageList from '../components/CoverageList'
import CoverageMyStatus from '../components/CoverageMyStatus'
import CoverageOverview from '../components/CoverageOverview'

const MODES = [
  { key: 'list', path: '/cover', label: '보강 목록' },
  { key: 'mypage', path: '/cover/mypage', label: '내 현황' },
  { key: 'status', path: '/cover/status', label: '현황판' },
]

function modeFor(pathname) {
  if (pathname.startsWith('/cover/mypage')) return 'mypage'
  if (pathname.startsWith('/cover/status')) return 'status'
  return 'list'
}

export default function Coverage() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const mode = modeFor(pathname)

  const sidebar = (
    <SidebarSection label="보강신청" icon={SwapHorizIcon} open onToggle={() => {}}>
      {MODES.map(m => (
        <SidebarItem
          key={m.key}
          label={m.label}
          selected={mode === m.key}
          onClick={() => navigate(m.path)}
        />
      ))}
    </SidebarSection>
  )

  return (
    <WorkspaceLayout sidebar={sidebar}>
      {mode === 'list' && <CoverageList />}
      {mode === 'mypage' && <CoverageMyStatus />}
      {mode === 'status' && <CoverageOverview />}
    </WorkspaceLayout>
  )
}
