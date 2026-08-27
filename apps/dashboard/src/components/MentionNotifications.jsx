import useMentionNotifications from '../lib/useMentionNotifications'

// DesktopNotifications.jsx와 같은 자리 — 파이프라인을 마운트만 한다. 화면에는 아무것도
// 그리지 않는다.
export default function MentionNotifications() {
  useMentionNotifications()
  return null
}
