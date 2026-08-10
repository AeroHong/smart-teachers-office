import useDesktopNotifications from '../lib/useDesktopNotifications'

// 트레이 알림 파이프라인을 마운트만 한다 — 화면에는 아무것도 그리지 않는다.
// CommandPalette처럼 라우트 바깥, BrowserRouter 안에 둬서 어느 화면에서든 동작한다.
export default function DesktopNotifications() {
  useDesktopNotifications()
  return null
}
