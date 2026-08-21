import useDesktopPresence from '../lib/useDesktopPresence'

// 재실 자동 감지 훅을 마운트만 한다 — 화면에는 아무것도 그리지 않는다.
// DesktopNotifications.jsx와 같은 자리(라우트 밖)에 둬서 어느 화면에서든 동작한다.
export default function DesktopPresence() {
  useDesktopPresence()
  return null
}
