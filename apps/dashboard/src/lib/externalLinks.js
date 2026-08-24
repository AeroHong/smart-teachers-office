/**
 * 바로가기 — 스마트교무실 밖에 있지만 매일 함께 여는 곳들.
 *
 * 업무의 절반은 여기 있고 절반은 구글 드라이브에 있다. 쿨메신저 쪽지를 보면 안내마다
 * 드라이브·스프레드시트 링크가 붙어 있는데, 그 링크는 쪽지를 지우거나 아래로 밀리면
 * 다시 찾기 어렵다. 자주 가는 곳을 늘 같은 자리에 두면 "그 링크 어디 갔지"가 줄어든다.
 *
 * 지금은 이 파일을 손으로 고친다. 학교마다 다른 값이라 언젠가는 관리자 화면에서
 * 넣고 빼야 하지만(다학교 확장), 목록이 서너 개인 동안은 화면을 만드는 값이 안 나온다.
 * 옮길 때는 schools/{schoolId}/externalLinks 쯤이 자리가 될 것이다.
 */
import { PORTAL_URL } from './portalUrl'

/**
 * @type {{label: string, href: string, hint?: string}[]}
 */
export const EXTERNAL_LINKS = [
  {
    label: '구글 드라이브',
    href: 'https://drive.google.com/',
    hint: '학교 공유 드라이브',
  },
  {
    label: '스마트교무실 포털',
    href: PORTAL_URL,
    hint: '학생·과목·연수 관리',
  },
  {
    label: '고사 업무 지원',
    href: 'https://exam-support-kr.web.app/',
    hint: '별도 앱',
  },
]
