// 카카오톡·네이버 등 앱 내 브라우저(웹뷰)에서는 구글이 로그인 자체를 막는다
// (disallowed_useragent). 교사 로그인 화면과 학생 출결 체크인 화면이 같이 쓴다.
export function detectInAppBrowser() {
  const ua = navigator.userAgent
  if (/KAKAOTALK/i.test(ua)) return 'kakaotalk'
  if (/NAVER/i.test(ua)) return 'naver'
  if (/Line\//i.test(ua)) return 'line'
  if (/Instagram/i.test(ua)) return 'instagram'
  if (/FB_IAB|FBAN|FBDV/i.test(ua)) return 'facebook'
  // Android WebView
  if (/wv\)/.test(ua) && /Android/.test(ua)) return 'webview'
  // iOS WebView (Safari 없고 CriOS/FxiOS도 아닌 경우)
  if (/iPhone|iPad|iPod/.test(ua) && !/Safari/.test(ua) && !/CriOS/.test(ua) && !/FxiOS/.test(ua)) return 'webview'
  return null
}

export const APP_NAMES = {
  kakaotalk: '카카오톡',
  naver: '네이버',
  line: '라인',
  instagram: '인스타그램',
  facebook: '페이스북',
  webview: '앱',
}

// 다른 브라우저로 여는 방법 안내 문구 (기기별)
export function openInBrowserHint() {
  return /Android/.test(navigator.userAgent)
    ? '오른쪽 상단 메뉴(⋮) → 다른 브라우저로 열기 → Chrome 선택 후 로그인해 주세요.'
    : '화면 하단 또는 오른쪽 메뉴 → Safari로 열기 선택 후 로그인해 주세요.'
}
