/**
 * 본문 서식(HTML) 저장·표시 규칙.
 *
 * 글 본문이 평문에서 서식 있는 HTML로 바뀌면서 두 가지가 필요해졌다.
 *  1) 남이 쓴 HTML을 그대로 화면에 그리면 안 된다 — 같은 학교 교직원만 쓰는 도구라도
 *     한 계정만 뚫리면 전 교직원 화면에서 스크립트가 돈다. 항상 걸러서 그린다.
 *  2) 목록·검색·알림에는 태그 없는 글이 필요하다.
 *
 * 옛 글은 평문이라 bodyHtml이 없다. 그 경우 description을 줄바꿈만 살려 보여준다.
 */
import DOMPurify from 'dompurify'

/** 본문에 허용하는 태그. 서식 도구가 만들어내는 것과 붙여넣기로 흔히 들어오는 것만 둔다. */
const ALLOWED_TAGS = [
  'p', 'br', 'div', 'span',
  'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'font',
  'ul', 'ol', 'li',
  'a', 'img', 'hr',
  'blockquote', 'code', 'pre',
  'h1', 'h2', 'h3', 'h4',
  // 토글 — 긴 안내에서 세부 절차를 접어두는 용도. 자바스크립트 없이 브라우저가 여닫는다.
  'details', 'summary',
  // 콜아웃 — 꼭 봐야 할 한 문단. class는 걸러지므로 태그 자체가 서식 표시다
  // (richTextStyles.js가 aside를 꾸민다).
  'aside',
  // 표 — 테두리·간격은 richTextStyles.js가 태그 선택자로 준다(style은 대부분 걸러짐).
  'table', 'thead', 'tbody', 'tr', 'td', 'th',
]

// style을 통째로 허용하지 않고 color만 남긴다. 배경·위치·크기를 자유롭게 두면 남의 글이
// 화면을 덮거나 다른 요소를 가리게 만들 수 있다.
const ALLOWED_ATTR = [
  'href', 'target', 'rel', 'src', 'alt', 'width', 'height', 'color', 'style',
  // 날짜 칩(dateChips.js)·캔버스 삽입 카드(canvasRefCard.js)가 쓰는 표시용 데이터.
  // contenteditable="false"는 편집기 안에서 통째로 하나의 덩어리로 다루려는 것 —
  // 안에 글자를 따로 못 치게 막아 실수로 카드 안 내용이 깨지지 않게 한다.
  'data-date', 'data-canvas-ref', 'data-canvas-title', 'data-canvas-channel', 'contenteditable',
  // 채널 메시지의 #채널 · @사람 인라인 조각(channelMentionChip.js) — 같은 이유로
  // contenteditable="false"를 함께 쓴다.
  'data-channel-ref', 'data-mention-uid', 'data-mention-name',
]

const STYLE_ATTR = /\sstyle="([^"]*)"/gi

/** 화면에 그리기 직전에 거른다. 저장 시점에도 한 번 거르지만 옛 문서는 그 과정을 안 거쳤다. */
export function sanitizeHtml(html) {
  if (!html) return ''
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // data:·javascript: 주소를 막는다. 이미지는 Storage 다운로드 URL만 쓴다.
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:)/i,
  }).replace(STYLE_ATTR, (match, value) => {
    // style 안에서도 색만 남긴다 (위 주석 참고)
    const color = /(^|;)\s*color\s*:\s*([^;]+)/i.exec(value)
    return color ? ` style="color:${color[2].trim()}"` : ''
  })
}

/**
 * 태그를 걷어낸 평문. 목록 미리보기와 쿨메신저 안내 문구에 쓴다.
 * 브라우저 밖(Cloud Functions 등)에서도 부를 수 있게 DOM 없이 동작한다.
 */
export function htmlToText(html) {
  if (!html) return ''
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<hr\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-4]|blockquote|summary|details|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '· ')
    .replace(/<\/(td|th)>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** 내용이 실제로 있는지. 빈 <p><br></p> 같은 껍데기를 걸러낸다. */
export function isEmptyHtml(html) {
  if (!html) return true
  return htmlToText(html).length === 0 && !/<img\b/i.test(html)
}
