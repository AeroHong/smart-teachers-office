/**
 * 채널 — 업무 글이 모이는 곳.
 *
 * 하나의 업무가 몇 달을 간다. 성적 마감은 계획서 제출 → NEIS 입력 안내 → 규정 검토
 * 의견 → 정정 기간까지 이어지는데, 지금은 이것들이 시간순 목록에 다른 업무와 섞여
 * 흩어진다. "성적 관련해서 지금 뭐가 남았지"를 물으면 답할 수 있는 자리가 없다.
 *
 * 채널은 새 글 종류가 아니라 기존 글에 붙는 이름표다. 요청·안내는 그대로고
 * (완료 집계·마감·대상 지정이 다 살아 있다), 채널은 그것들을 한 줄로 모아 볼 뿐이다.
 * 대화 스트림으로 만들지 않은 이유는 쿨메신저를 계속 쓰기 때문이다 — 대화가 두 곳으로
 * 갈라지면 어느 쪽을 봐야 하는지 애매해지고, 정작 "누가 했는지"는 여전히 안 보인다.
 *
 * 참여자는 targeting.js의 대상 조건을 그대로 쓴다. "2학년 담임"을 채널 참여자로
 * 뽑는 일과 업무 대상으로 뽑는 일은 같은 문제라 규칙을 두 벌 만들 이유가 없다.
 */

/** 채널 이름 — 사이드바 한 줄에 들어가야 하고, 검색으로 찾을 수 있어야 한다. */
export const CHANNEL_NAME_MAX = 24
export const CHANNEL_DESCRIPTION_MAX = 120

/**
 * 새 채널 문서.
 *
 * memberUids를 규칙과 함께 저장하는 이유: "내가 속한 채널"을 Firestore에서 뽑으려면
 * array-contains 쿼리가 필요한데, 조건만 저장해두면 클라이언트가 전체 채널을 읽어
 * 매번 판정해야 한다. 규칙은 나중에 인사이동으로 다시 계산할 때 쓴다.
 *
 * @param {object} input
 * @returns {object} Firestore에 넣을 필드 (createdAt은 호출부에서 serverTimestamp)
 */
export function newChannelPayload({
  name,
  description = '',
  memberRule = { conditions: [], includeUids: [], excludeUids: [] },
  memberRuleText = '',
  members = [],
  createdBy,
  createdByName = '',
}) {
  return {
    name: (name || '').trim().slice(0, CHANNEL_NAME_MAX),
    description: (description || '').trim().slice(0, CHANNEL_DESCRIPTION_MAX),
    memberRule,
    memberRuleText,
    memberUids: members.map(m => m.uid),
    createdBy,
    createdByName,
    archived: false,
  }
}

/** 채널 하나에 달린 글들의 요약 — 사이드바 뱃지와 채널 머리에 쓴다. */
export function channelStats(posts = [], now = new Date()) {
  const requests = posts.filter(p => (p?.kind || 'request') === 'request')
  const open = requests.filter(p => !isSettled(p))
  const overdue = open.filter(p => isOverdue(p, now))
  return {
    total: posts.length,
    openCount: open.length,
    overdueCount: overdue.length,
  }
}

/** 대상 전원이 완료했으면 끝난 것으로 본다. 대상이 0명이면 끝난 걸로 치지 않는다. */
function isSettled(post) {
  const targets = post?.targetUids || []
  if (targets.length === 0) return false
  const done = new Set(post?.completedUids || [])
  return targets.every(uid => done.has(uid))
}

function isOverdue(post, now) {
  const due = toDate(post?.dueDate)
  if (!due) return false
  const today = startOfDay(now)
  return startOfDay(due) < today
}

function toDate(value) {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value.toDate === 'function') return value.toDate()   // Firestore Timestamp
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function startOfDay(d) {
  const copy = new Date(d)
  copy.setHours(0, 0, 0, 0)
  return copy
}

/**
 * 채널 목록 정렬 — 챙길 것이 있는 채널을 위로.
 *
 * 마감 지난 글이 있는 채널 → 진행 중인 글이 있는 채널 → 조용한 채널 순.
 * 같은 급이면 이름 가나다순으로 둬서 자리가 흔들리지 않게 한다.
 */
export function sortChannels(channels = []) {
  return [...channels].sort((a, b) => {
    const sa = a.stats || {}
    const sb = b.stats || {}
    if ((sb.overdueCount || 0) !== (sa.overdueCount || 0)) return (sb.overdueCount || 0) - (sa.overdueCount || 0)
    if ((sb.openCount || 0) !== (sa.openCount || 0)) return (sb.openCount || 0) - (sa.openCount || 0)
    return (a.name || '').localeCompare(b.name || '', 'ko')
  })
}

/**
 * 채널 이름 검증.
 * 빈 이름은 사이드바에서 클릭할 수 없는 줄이 되고, 같은 이름이 둘이면 어느 쪽에 쓴 건지
 * 알 수 없다.
 *
 * @param {string} name
 * @param {string[]} existingNames 이미 있는 채널 이름들 (자기 자신은 빼고 넘길 것)
 * @returns {string|null} 문제가 없으면 null
 */
export function validateChannelName(name, existingNames = []) {
  const trimmed = (name || '').trim()
  if (!trimmed) return '채널 이름을 입력해 주세요.'
  if (trimmed.length > CHANNEL_NAME_MAX) return `이름은 ${CHANNEL_NAME_MAX}자까지 쓸 수 있습니다.`
  const taken = existingNames.some(n => (n || '').trim().toLowerCase() === trimmed.toLowerCase())
  if (taken) return '같은 이름의 채널이 이미 있습니다.'
  return null
}

/** 내가 이 채널의 참여자인가. 만든 사람은 조건에서 빠져도 계속 본다. */
export function isMember(channel, uid) {
  if (!channel || !uid) return false
  return channel.createdBy === uid || (channel.memberUids || []).includes(uid)
}
