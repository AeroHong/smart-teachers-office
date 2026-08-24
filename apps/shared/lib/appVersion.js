/**
 * 배포 갱신 감지 — 지금 돌고 있는 코드가 최신인지 본다.
 *
 * 데스크톱 앱은 트레이에 상주하는 것이 전제라 껐다 켜는 일이 드물다. 아침에 켜고 종일
 * 두면 그날 배포한 수정이 다음 날까지 반영되지 않는다. 원격 URL을 로드하는 구조라
 * "다시 설치하세요"가 아니라 "새로고침하세요"면 끝나는데, 그걸 알릴 방법이 없었다.
 *
 * ── 어떻게 판정하나 ──────────────────────────────────────────
 *
 * Vite가 만드는 번들 파일 이름에는 내용 해시가 들어간다(index-c1Ui3EDA.js). 내용이
 * 바뀌면 이름이 바뀌므로, index.html이 가리키는 스크립트 이름만 견주면 새 배포인지 알 수 있다.
 * 별도 버전 파일을 만들지 않는 이유가 이것이다 — 빌드 설정을 건드리지 않아도 되고,
 * 버전을 올리는 것을 잊어 감지가 조용히 죽는 일이 없다.
 *
 * firebase.json에서 index.html은 `no-cache`, /assets/**는 `immutable`이라 이 방식이 성립한다.
 * 캐시 정책을 바꾸면 여기도 함께 봐야 한다.
 *
 * 대시보드에서만 쓰지만 포털도 같은 빌드 구조라 그대로 가져다 쓸 수 있어 shared에 둔다.
 */

/** 파일 이름이 해시가 붙은 번들인지. */
function assetFileName(src) {
  if (typeof src !== 'string') return null
  // 쿼리·해시를 떼고 본다. 캐시 무력화용으로 ?_=123 을 붙여 요청할 수 있다.
  const clean = src.split('?')[0].split('#')[0]
  if (!/\/assets\/[^/]+\.js$/i.test(clean)) return null
  return clean.split('/').pop()
}

/**
 * 스크립트 주소 목록에서 배포 서명을 만든다.
 *
 * 파일 하나만 보지 않고 전부 모아 정렬해 잇는다. 코드 분할이 들어오면 진입 번들 이름이
 * 그대로인데 다른 조각만 바뀌는 경우가 생기고, 그러면 바뀐 배포를 놓친다. 정렬하는 것은
 * 문서에 적힌 순서가 달라져도 같은 배포를 다른 것으로 오해하지 않게 하려는 것이다.
 *
 * @param {(string|null|undefined)[]} srcs
 * @returns {string} 서명. 하나도 못 찾으면 빈 문자열
 */
export function signatureFrom(srcs = []) {
  const names = srcs.map(assetFileName).filter(Boolean)
  return [...new Set(names)].sort().join('|')
}

/** index.html 본문에서 배포 서명을 뽑는다. */
export function signatureFromHtml(html) {
  if (typeof html !== 'string') return ''
  const srcs = []
  const re = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi
  let m
  while ((m = re.exec(html)) !== null) srcs.push(m[1])
  return signatureFrom(srcs)
}

/**
 * 새 배포가 올라왔는가.
 *
 * **둘 중 하나라도 못 읽었으면 아니라고 답한다.** 네트워크가 잠깐 끊기거나 학교 망이
 * 응답을 가로채 빈 문서를 돌려주면 서명이 빈 문자열이 되는데, 그걸 "달라졌다"로 치면
 * 아무 일도 없는데 새로고침 띠가 뜬다. 한 번 헛띄우면 그 다음부터는 진짜일 때도
 * 아무도 안 누른다.
 */
export function isOutdated(currentSignature, latestSignature) {
  if (!currentSignature || !latestSignature) return false
  return currentSignature !== latestSignature
}
