/**
 * 캔버스 본문 안에 다른 업무 글을 카드로 심기 — "+캔버스".
 *
 * 채널 메시지의 전달 카드(ChannelMessages.jsx의 CanvasCard, `refRequestId` 원칙)와 같은
 * 생각이다: 복제하지 않고 가리키기만 한다("쪽지=포인터, 업무 글=캔버스" 원칙). 다만
 * 여기는 저장 형식이 Firestore 문서 필드가 아니라 **본문 HTML 문자열**이라, React
 * 컴포넌트를 그대로 재사용할 수 없다(dangerouslySetInnerHTML은 원시 HTML만 받는다).
 * 대신 마크업 생성 함수 하나를 편집기·읽기 화면이 같이 불러써서 같은 모양을 만든다 —
 * 클릭 동작은 각 화면이 이벤트 위임으로 따로 붙인다(PostDetail.jsx는 열기, 편집기
 * 안에서는 contenteditable="false"라 통째로 한 덩어리로만 다뤄진다).
 */

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * @param {{id: string, title: string, channelId: string}} post
 * @returns {string} 본문에 끼울 HTML 조각. 뒤에 빈 문단을 붙여 커서가 갈 자리를 준다.
 */
export function canvasRefCardHtml(post) {
  const title = escapeHtml(post?.title || '업무 글')
  const id = escapeHtml(post?.id || '')
  const channelId = escapeHtml(post?.channelId || '')
  return (
    `<div data-canvas-ref="${id}" data-canvas-title="${title}" data-canvas-channel="${channelId}" contenteditable="false">`
    + `📄 ${title}</div><p><br></p>`
  )
}

/** 클릭한 지점(또는 그 조상)이 캔버스 카드인지, 그렇다면 열 주소가 무엇인지. */
export function canvasRefTarget(el) {
  const card = el?.closest?.('[data-canvas-ref]')
  if (!card) return null
  const id = card.getAttribute('data-canvas-ref')
  const channelId = card.getAttribute('data-canvas-channel')
  if (!id) return null
  return channelId ? `/channels/${channelId}/${id}` : `/posts/${id}`
}
