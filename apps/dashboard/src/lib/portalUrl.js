/**
 * 포털(apps/portal)은 대시보드와 다른 호스팅이라 라우터로 못 가고 절대 URL이 필요하다.
 * 학교 설정·학생 포털 이동과, 위젯 빈 화면에서 관리자 페이지로 보내는 링크가 같이 쓴다.
 */
const DEFAULT_PORTAL_URL = 'https://seonyoo-system.web.app'

export const PORTAL_URL = import.meta.env.VITE_PORTAL_URL || DEFAULT_PORTAL_URL

export function portalLink(path) {
  return `${PORTAL_URL}${path}`
}
