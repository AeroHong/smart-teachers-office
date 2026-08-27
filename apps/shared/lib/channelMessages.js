/**
 * 채널 메시지 — 채널 안에서 오가는 대화.
 *
 * ── 왜 업무 글과 따로 두는가 ────────────────────────────────
 *
 * 업무 글(requests)은 "누가 언제까지 무엇을 한다"이고 완료 체크·마감·대상이 붙는다.
 * 그런데 실제로 오가는 말의 대부분은 그게 아니다 — "감독교사가 전자기기를 직접 돌려주나요?"
 * 같은 되묻기와 그 답이다. 쿨메신저 반년치를 보면 같은 질문이 1:1 쪽지로 반복해 들어오고
 * 그때마다 같은 답을 다시 썼다. 채널에서 묻고 답하면 한 번의 답이 전원에게 남는다.
 *
 * 이걸 업무 글로 만들게 하면 아무도 안 쓴다. 되묻는 말 하나에 제목·대상·마감을 정하라고
 * 하는 셈이기 때문이다.
 *
 * ── 왜 채널의 하위 컬렉션인가 ───────────────────────────────
 *
 * 메시지는 **항상 채널 하나 안에서만** 조회된다. 그러면 channelId가 경로에 고정되므로
 * 보안 규칙이 채널 문서를 get()으로 읽어도 쿼리당 한 번이면 끝난다 — 문서 접근 상한에
 * 걸리지 않고 쿼리 안전성도 증명된다. requests는 채널을 가로질러 조회되고 채널 없는 글도
 * 있어서 최상위에 두고 비정규화했는데, 여기서는 그럴 필요가 없다. 의도된 비대칭이다.
 *
 * ── 본문은 서식 있는 HTML이다 (2026-08-26부터) ─────────────────
 *
 * 처음엔 평문이었다(comments.js와 같은 판단 — 정화기를 새로 늘리지 않으려고). 그런데
 * 그 정화기(richText.js의 sanitizeHtml)는 캔버스(requests.bodyHtml)·쪽지에서 이미
 * 쓰고 있던 것이라 "한 벌 더 느는" 게 아니라 세 번째로 같이 쓰는 것이었다. Slack처럼
 * 굵게·목록·#채널·@사람을 메시지에도 쓰고 싶다는 요청으로 bodyHtml을 추가했다.
 *
 * bodyHtml이 있으면 그게 진짜 내용이고, body는 htmlToText로 뽑아낸 평문 사본이다
 * (검색·미리보기·상한 검사용 — 지금 이걸 읽는 코드는 아직 없지만 나중에 필요해질 때
 * 다시 HTML을 파싱하지 않아도 되게 미리 채워 둔다). bodyHtml이 없는 문서는 옛 평문
 * 메시지다 — 화면에서 body를 줄바꿈만 살려 그대로 보여준다(richText.js의 "옛 글은
 * bodyHtml이 없다" 처리와 같은 방식).
 */
import { htmlToText } from './richText.js'

/** 메시지 본문 상한. 이보다 길어지면 업무 글로 쓸 내용이다. */
export const MESSAGE_BODY_MAX = 2000

/**
 * 캔버스를 다른 채널로 넘길 때 붙이는 한마디의 상한.
 *
 * 짧게 잡는다. 왜 넘겼는지("우리 부서도 해당됩니다") 한 줄이면 되고, 길게 쓸 말이면 그건
 * 넘기는 말이 아니라 그 채널에 쓸 새 글이다.
 */
export const SHARE_NOTE_MAX = 200

/**
 * 새 메시지 문서.
 *
 * authorName을 함께 저장하는 이유: 목록을 그릴 때마다 uid로 이름을 조회하면 메시지 수만큼
 * 읽기가 늘어난다. 보낸 시점의 이름을 박아두는 것은 업무 글·댓글과 같은 방식이다.
 *
 * @param {string} [bodyHtml] 서식 있는 본문(MessageComposer.jsx). **정화는 호출부 책임이다**
 *   (PostComposer.jsx가 캔버스에서 하는 것과 같은 자리 — sanitizeHtml은 DOMPurify가
 *   window를 요구해 이 파일처럼 Node 테스트에서도 도는 순수 함수 안에 넣을 수 없다).
 *   여기서는 htmlToText(순수 문자열 처리, DOM 불필요)로 평문만 뽑는다. 안 주면
 *   (channelActions.js의 전달·알림처럼 평문만 있는 호출부) body를 그대로 쓴다.
 * @param {string} [refRequestId] 이 메시지가 가리키는 업무 글. "쪽지=포인터, 업무 글=캔버스"
 *   원칙에 따라, 긴 내용을 붙여넣는 대신 캔버스를 가리킬 때 쓴다.
 * @param {object} [attachment] 이 메시지에 붙인 파일 — {url, name, size, kind}. 본문
 *   HTML에 섞지 않고 캔버스 참조처럼 별도 필드로 둔다(같은 이유: 메시지를 그릴 때마다
 *   파일을 다시 찾지 않아도 되고, 지우면 이 필드만 비운다).
 * @returns {object} Firestore에 넣을 필드 (createdAt은 호출부에서 serverTimestamp)
 */
export function newMessagePayload({
  authorUid, authorName = '', body, bodyHtml = null,
  refRequestId = null, refTitle = '', refChannelId = null, attachment = null,
}) {
  const text = bodyHtml
    ? htmlToText(bodyHtml).slice(0, MESSAGE_BODY_MAX)
    : String(body || '').trim().slice(0, MESSAGE_BODY_MAX)
  return {
    authorUid,
    authorName,
    body: text,
    bodyHtml: bodyHtml || null,
    // 멘션 알림(useMentionNotifications.js)이 메시지 본문을 다시 파싱하지 않고 이
    // 두 필드만 보고 판단하게 저장 시점에 뽑아 둔다(authorName과 같은 비정규화 판단).
    mentionedUids: extractMentionedUids(bodyHtml),
    mentionsChannel: mentionsChannelWide(bodyHtml),
    refRequestId: refRequestId || null,
    // 제목과 원래 채널을 함께 박아둔다. 안 그러면 메시지를 그릴 때마다 가리키는 글을
    // 하나씩 읽어야 하는데, 그 글이 다른 채널에 있으면 목록 쿼리로 묶을 수조차 없다
    // (authorName·memberNames와 같은 판단이다).
    //
    // 제목이 새는 것 아닌가: 넘기는 사람은 이미 그 글을 읽을 수 있고, 제목을 옮기고 싶으면
    // 본문에 타이핑해도 그만이다. 새로 열리는 경로가 아니다. 정작 내용은 원본 규칙이
    // 지키므로, 읽을 수 없는 사람이 링크를 눌러도 열리지 않는다.
    refTitle: refRequestId ? String(refTitle || '').trim().slice(0, 120) : '',
    refChannelId: refRequestId ? (refChannelId || null) : null,
    attachment: attachment || null,
  }
}

/** 이 메시지가 캔버스를 가리키고 있는가. */
export function hasCanvasRef(message) {
  return !!message?.refRequestId
}

/**
 * bodyHtml 안의 @사람 조각(channelMentionChip.js의 userMentionHtml)에서 uid를 모두
 * 뽑는다. DOM 없이 정규식으로 처리한다 — 이 파일은 Node 테스트에서도 도는 순수 함수라
 * DOMParser에 기댈 수 없다(sanitizeHtml과 같은 제약, 파일 위 설명 참고).
 */
function extractMentionedUids(html) {
  if (!html) return []
  const uids = new Set()
  const re = /data-mention-uid="([^"]*)"/g
  let m
  // eslint-disable-next-line no-cond-assign
  while ((m = re.exec(html))) { if (m[1]) uids.add(m[1]) }
  return [...uids]
}

/** bodyHtml에 @전체(channelWideMentionHtml) 조각이 있는가. */
function mentionsChannelWide(html) {
  return !!html && html.includes('data-mention-channel')
}

/**
 * 보낼 수 있는 메시지인가.
 * 빈 메시지는 목록에 누를 수 없는 줄을 남기고, 상한을 넘으면 잘린 채 저장돼
 * "내가 쓴 게 왜 없어졌지"가 된다.
 *
 * @returns {string|null} 문제가 없으면 null
 */
export function validateMessage(body) {
  const trimmed = String(body || '').trim()
  if (!trimmed) return '보낼 내용을 입력해 주세요.'
  if (trimmed.length > MESSAGE_BODY_MAX) return `메시지는 ${MESSAGE_BODY_MAX}자까지 쓸 수 있습니다.`
  return null
}

// ── 읽음 ──────────────────────────────────────────────────────

/**
 * 안 읽은 메시지가 있는가.
 *
 * 메시지마다 readBy 배열을 두지 않는다. 그러면 메시지 한 건당 쓰기가 참여자 수만큼 일어나고
 * 배열이 무한히 자란다. 대신 사람마다 "마지막으로 읽은 시각" 하나만 두고, 채널에 적힌
 * "마지막 메시지 시각"과 견준다.
 *
 * **추가 읽기가 0회라는 것이 이 방식의 값어치다.** 채널 목록(이미 구독 중)과 내 users 문서
 * (이미 읽고 있음)만으로 사이드바 전체의 안읽음 표시가 계산된다.
 *
 * 정확한 "몇 건"은 세지 않는다. 세려면 채널마다 메시지를 조회해야 하는데, 뱃지 하나 때문에
 * 채널 수만큼 쿼리를 더 날릴 이유가 없다. 점 하나로 충분하다.
 *
 * @param {object} channel lastMessageAt을 가진 채널 문서
 * @param {object} reads users/{uid}.channelReads — { [channelId]: timestamp }
 */
export function hasUnread(channel, reads = {}) {
  const last = toMillis(channel?.lastMessageAt)
  if (!last) return false                    // 메시지가 하나도 없는 채널
  const seen = toMillis(reads?.[channel.id])
  if (!seen) return true                     // 한 번도 안 들어가 본 채널
  return last > seen
}

function toMillis(value) {
  if (!value) return 0
  if (typeof value.toMillis === 'function') return value.toMillis()   // Firestore Timestamp
  if (value instanceof Date) return value.getTime()
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

// ── DM ────────────────────────────────────────────────────────

/**
 * 두 사람의 DM 채널 문서 ID.
 *
 * uid를 사전순으로 정렬해 이어붙인다. 양쪽이 같은 ID를 계산하므로 같은 상대와 DM이 두 개
 * 생길 수 없다 — 자동 ID를 쓰면 두 사람이 동시에 말을 걸었을 때 대화가 둘로 갈라지고,
 * 갈라진 뒤에는 어느 쪽에 답했는지 알 수 없다.
 *
 * 문서 ID만 봐도 DM임을 알 수 있어 규칙에서도 검증할 수 있다(정렬 함수가 없는 규칙에서는
 * memberUids[0]/[1]과 맞춰 보는 식으로).
 */
export function dmChannelId(uidA, uidB) {
  return `dm_${[uidA, uidB].sort().join('_')}`
}

/** DM 상대의 uid. 나 자신과의 DM(메모용)이면 나를 돌려준다. */
export function dmPartnerUid(channel, myUid) {
  const uids = channel?.memberUids || []
  return uids.find(uid => uid !== myUid) || myUid
}
