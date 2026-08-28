import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from '@shared/components/ProtectedRoute'
import ToastProvider from './components/ToastProvider'
import ProfileCardProvider from './components/ProfileCardProvider'
import ErrorBoundary from './components/ErrorBoundary'
import CommandPalette from './components/CommandPalette'
import OnboardingTour from './components/OnboardingTour'
import DesktopNotifications from './components/DesktopNotifications'
import MentionNotifications from './components/MentionNotifications'
import DesktopPresence from './components/DesktopPresence'
import DesktopClientReport from './components/DesktopClientReport'
import Login from './pages/Login'
import RequestList from './pages/RequestList'
import Channels from './pages/Channels'
import Activity from './pages/Activity'
import AcademicCalendar from './pages/AcademicCalendar'
import PostRedirect from './pages/PostRedirect'
import Messages from './pages/Messages'
import Coverage from './pages/Coverage'
import Members from './pages/Members'
import Settings from './pages/Settings'
import AdminDesktop from './pages/AdminDesktop'
import RedirectToPortal from './pages/RedirectToPortal'

export default function App() {
  return (
    <BrowserRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      {/* 저장·전송 실패를 어느 화면에서든 같은 방식으로 알린다 */}
      <ToastProvider>
      {/* 동료 프로필 카드 — 어느 화면에서든 useProfileCard().open(uid, anchorEl)로 띄운다 */}
      <ProfileCardProvider>
        {/* Cmd/Ctrl+K — 어느 화면에서든 뜨도록 라우트 바깥에 둔다 */}
        <CommandPalette />
        {/* 첫 사용자 온보딩(2026-08-29) — 로그인 후 처음 한 번, 핵심 화면을 짧게 훑어준다 */}
        <OnboardingTour />
        {/* Electron 트레이 알림 — window.smartOfficeDesktop 없으면 완전히 no-op */}
        <DesktopNotifications />
        {/* 멘션(@사람·@전체) 알림 — 같은 트레이 파이프라인, 채널 메시지만 따로 감시(P4-C) */}
        <MentionNotifications />
        {/* 재실 자동 감지 — 위와 같은 이유로 일반 브라우저에서는 완전히 no-op */}
        <DesktopPresence />
        {/* 설치 현황 보고 — 구버전(0.1.7 미만) 사용자를 찾아내기 위한 것이라
            자동 업데이트가 없던 0.1.5도 잡히도록 version만 보고 판정한다 */}
        <DesktopClientReport />
        <ErrorBoundary label="화면">
        <Routes>
          <Route path="/login" element={<Login />} />
          {/* 대시보드 앱에 없는 온보딩/학생 전용 화면은 포털로 이동 */}
          <Route path="/school-setup" element={<RedirectToPortal path="/school-setup" />} />
          <Route path="/student" element={<RedirectToPortal path="/student" />} />

          {/* 홈 = 채널 목록 (2026-08-25 재구성). 위젯형 홈이 하던 "오늘 볼 것들 훑기"는
              이제 채널이 그 자리다 — Channels.jsx를 그대로 재사용한다. */}
          <Route path="/" element={<ProtectedRoute anyUser><Channels /></ProtectedRoute>} />
          {/* 옛 홈이 쓰던 주소. 쿨메신저에 이미 붙여넣긴 링크가 이 형태를 가리킬 수 있어
              죽이지 않고 새 주소로 돌린다(PostRedirect.jsx). */}
          <Route path="/posts/:requestId" element={<ProtectedRoute anyUser><PostRedirect /></ProtectedRoute>} />
          {/* 내 활동 — "안 한 일". 채널별 뱃지와 달리 채널을 넘나들며 모아 보여준다.
              알림과 달리 읽어도 안 사라지고 완료해야 사라진다. */}
          <Route path="/activity" element={<ProtectedRoute anyUser><Activity /></ProtectedRoute>} />
          <Route path="/activity/:requestId" element={<ProtectedRoute anyUser><Activity /></ProtectedRoute>} />
          {/* 학사일정 — 1차 버전(목록+상세). 월 단위 캘린더 그리드는 나중 작업 */}
          <Route path="/calendar" element={<ProtectedRoute anyUser><AcademicCalendar /></ProtectedRoute>} />
          {/* 업무 요청 — 관리자가 아니라 부장·담당 교사가 쓰므로 대시보드에 둔다.
              상세는 만든 사람에게는 현황판, 대상 교사에게는 할 일 상세로 보인다
              (쿨메신저에 붙여넣는 링크가 이 주소를 가리킨다) */}
          <Route path="/requests" element={<ProtectedRoute anyUser><RequestList /></ProtectedRoute>} />
          <Route path="/requests/:requestId" element={<ProtectedRoute anyUser><RequestList /></ProtectedRoute>} />
          {/* 쪽지 — 위젯이 아니라 전용 탭. 쿨메신저를 대체하지 않고 병행하는 보조 수단이라
              매일 보는 대시보드의 자리를 차지하지 않는다 */}
          <Route path="/channels" element={<ProtectedRoute anyUser><Channels /></ProtectedRoute>} />
          {/* 정적 경로를 :channelId보다 먼저 둔다. react-router v6는 정적 구간을 더 높게
              치므로 순서와 무관하게 안전하지만, 읽는 사람에게도 'directory'가 채널 id가
              아니라는 것이 보여야 한다. */}
          <Route path="/channels/directory" element={<ProtectedRoute anyUser><Channels /></ProtectedRoute>} />
          {/* 글쓰기 — 채널 3단 안에서 그대로 쓴다(PLAN_composer.md). 예전 /requests/new
              같은 별도 페이지가 아니라 Channels.jsx가 자기 안에서 갈아 끼운다. */}
          <Route path="/channels/:channelId/new" element={<ProtectedRoute anyUser><Channels /></ProtectedRoute>} />
          <Route path="/channels/:channelId" element={<ProtectedRoute anyUser><Channels /></ProtectedRoute>} />
          <Route path="/channels/:channelId/:requestId" element={<ProtectedRoute anyUser><Channels /></ProtectedRoute>} />
          {/* 고치기 — 쓰기와 같은 화면을 쓴다. 글을 지우고 다시 쓰면 주소가 바뀌어
              쿨메신저에 뿌린 링크가 죽고 완료 기록도 함께 날아간다. 채널은 프롭으로
              고정이라 여기서 옮길 수 없다 — 옮기는 건 '전달'이 하는 일이다. */}
          <Route path="/channels/:channelId/:requestId/edit" element={<ProtectedRoute anyUser><Channels /></ProtectedRoute>} />

          <Route path="/messages" element={<ProtectedRoute anyUser><Messages /></ProtectedRoute>} />
          {/* 데스크톱 알림 클릭 → 해당 쪽지가 바로 열리도록 (목록만 뜨면 어느 게 새 건지 못 찾는다) */}
          <Route path="/messages/:noticeId" element={<ProtectedRoute anyUser><Messages /></ProtectedRoute>} />
          {/* 보강신청 — 포털의 /cover, /cover/mypage, /cover/status와 같은 컬렉션을 보는
              대시보드 쪽 진입점(2026-08-27). 셋 다 같은 컴포넌트가 pathname으로 모드를 가른다. */}
          <Route path="/cover" element={<ProtectedRoute anyUser><Coverage /></ProtectedRoute>} />
          <Route path="/cover/mypage" element={<ProtectedRoute anyUser><Coverage /></ProtectedRoute>} />
          <Route path="/cover/status" element={<ProtectedRoute anyUser><Coverage /></ProtectedRoute>} />
          {/* 구성원 — 오른쪽 칸이 상세 영역이 되면서 명단을 별도 탭으로 옮겼다 */}
          <Route path="/members" element={<ProtectedRoute anyUser><Members /></ProtectedRoute>} />
          {/* 설정 — 1단 톱니바퀴가 새 창으로 여는 화면(2026-08-28). WorkspaceLayout 없이
              독자적인 작은 레이아웃을 쓴다(Settings.jsx 참고). */}
          <Route path="/settings" element={<ProtectedRoute anyUser><Settings /></ProtectedRoute>} />
          {/* 구 경로 — 관리자 업무 현황은 업무 요청 목록의 '전체'로 통합됐다 */}
          {/* 데스크톱 설치 현황 — 배포·지원용이라 관리자만 본다 */}
          <Route path="/admin/desktop" element={<ProtectedRoute adminOnly><AdminDesktop /></ProtectedRoute>} />
          <Route path="/admin" element={<Navigate to="/requests" replace />} />

          {/* 구 경로 — 이제 대시보드 위젯으로 통합됨 */}
          <Route path="/calls" element={<Navigate to="/" replace />} />
        </Routes>
        </ErrorBoundary>
      </ProfileCardProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}
