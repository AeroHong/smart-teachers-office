import useDesktopClientReport from '../lib/useDesktopClientReport'

// 설치 현황 보고 훅을 마운트만 한다 — 화면에는 아무것도 그리지 않는다.
// DesktopPresence.jsx와 같은 자리(라우트 밖)에 둬서 어느 화면에서든 보고된다.
export default function DesktopClientReport() {
  useDesktopClientReport()
  return null
}
