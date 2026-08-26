/**
 * 채널 메시지 안의 #채널 · @사람 조각.
 *
 * 캔버스 삽입 카드(canvasRefCard.js)와 같은 이유로 data-* 속성에 값을 심어 두고
 * 화면에는 라벨만 보인다 — 다만 카드가 아니라 문장 속에 섞이는 인라인 조각이다.
 * 메시지는 짧은 대화라 "#일반 채널에 물어보세요"처럼 문장 중간에 오는 것이
 * 자연스럽고, 카드로 쪼개면 오히려 대화 흐름이 끊긴다(Slack의 #channel·@name과
 * 같은 자리).
 */

function escapeLabel(text) {
  return String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
}

/** #채널 조각. DM은 대상에 넣지 않는다 — 상대에게 다른 사람과의 1:1 대화 존재를
 *  드러내는 셈이라 채널(공개·비공개 업무 채널)만 대상으로 한다(호출부에서 걸러 넘김). */
export function channelMentionHtml(channel) {
  const label = escapeLabel(channel?.name)
  return `<span data-channel-ref="${channel.id}" contenteditable="false">#${label}</span>&nbsp;`
}

/** @사람 조각. 이름을 속성에도 함께 담아 둔다 — 나중에 멘션 알림을 붙일 때
 *  메시지 문서만 보고도(멤버 목록을 다시 조회하지 않고) 누구인지 알 수 있게. */
export function userMentionHtml(member) {
  const label = escapeLabel(member?.name)
  return `<span data-mention-uid="${member.uid}" data-mention-name="${label}" contenteditable="false">@${label}</span>&nbsp;`
}

/** #채널 조각을 클릭했을 때 이동할 주소. 조각이 아니면 null. */
export function channelMentionTarget(el) {
  const node = el?.closest?.('[data-channel-ref]')
  if (!node) return null
  return `/channels/${node.getAttribute('data-channel-ref')}`
}

/** @사람 조각을 클릭했을 때의 uid. 조각이 아니면 null(프로필 카드를 여는 자리 —
 *  ChannelMessages.jsx·PostComments.jsx 참고). */
export function userMentionTarget(el) {
  const node = el?.closest?.('[data-mention-uid]')
  if (!node) return null
  return node.getAttribute('data-mention-uid')
}
