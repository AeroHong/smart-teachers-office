/**
 * 캔버스 본문 안에 외부 링크를 Notion 스타일 북마크 카드로 심기.
 *
 * "+캔버스"(canvasRefCard.js)와 같은 이유로 마크업 생성 함수 하나를 편집기·읽기 화면이
 * 같이 불러쓴다 — 여기서 다루는 건 이 앱 안의 다른 글이 아니라 임의의 외부 주소라, 클릭
 * 동작도 내부 이동이 아니라 새 탭으로 여는 쪽으로 다르다(CanvasEditor.jsx·PostDetail.jsx가
 * 각각 붙인다).
 *
 * 메타데이터(title/description/image)는 fetchLinkPreview Cloud Function이 미리 가져와
 * 넘겨준 값을 그대로 마크업에 심을 뿐이라 여기서는 요청을 보내지 않는다.
 */

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function isSafeUrl(url) {
  return /^https?:\/\//i.test(String(url || ''))
}

/**
 * @param {{url: string, title?: string, description?: string, image?: string, siteName?: string}} meta
 * @returns {string} 본문에 끼울 HTML 조각. 뒤에 빈 문단을 붙여 커서가 갈 자리를 준다.
 */
export function linkBookmarkCardHtml(meta) {
  const url = meta?.url || ''
  if (!isSafeUrl(url)) return ''

  const title = escapeHtml(meta?.title || meta?.siteName || url)
  const description = escapeHtml(meta?.description || '')
  const siteName = escapeHtml(meta?.siteName || url)
  const image = isSafeUrl(meta?.image) ? escapeHtml(meta.image) : ''

  return (
    `<div data-bookmark-url="${escapeHtml(url)}" contenteditable="false">`
    + `<div><b>${title}</b>`
    + (description ? `<span>${description}</span>` : '')
    + `<small>🔗 ${siteName}</small></div>`
    + (image ? `<img src="${image}" alt="" />` : '')
    + `</div><p><br></p>`
  )
}

/** 클릭한 지점(또는 그 조상)이 북마크 카드인지, 그렇다면 열 주소가 무엇인지. */
export function linkBookmarkTarget(el) {
  const card = el?.closest?.('[data-bookmark-url]')
  if (!card) return null
  const url = card.getAttribute('data-bookmark-url') || ''
  return isSafeUrl(url) ? url : null
}
