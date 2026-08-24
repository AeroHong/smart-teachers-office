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

import { ALL_STAFF_CHANNEL_ID } from './schema.js'

/** 채널 이름 — 사이드바 한 줄에 들어가야 하고, 검색으로 찾을 수 있어야 한다. */
export const CHANNEL_NAME_MAX = 24
export const CHANNEL_DESCRIPTION_MAX = 120

/**
 * 채널 종류. DM은 별도 시스템이 아니라 "이름 없는 2인 채널"이다(PLAN_channels.md
 * "메시징 모델" 참고). 그래야 검색·멘션·알림·보안 규칙을 한 벌만 만들면 DM에도 그대로 듣는다.
 */
export const CHANNEL_TYPE = { CHANNEL: 'channel', DM: 'dm' }

/**
 * 공개 범위.
 *  public  — 소속 교사 누구나 이름과 내용을 본다. 참여자가 아니어도 "넣어달라"고 말할 수 있다
 *  private — 참여자가 아니면 **존재 자체를 모른다**. 특수교육처럼 학생 개인정보가 오가는
 *            자리가 실제로 있어서 이름조차 노출되면 안 되는 채널이 필요하다
 */
export const VISIBILITY = { PUBLIC: 'public', PRIVATE: 'private' }

/**
 * 누가 글·메시지를 쓸 수 있는가.
 *  members — 참여자 전원. 되묻고 답하는 것이 채널의 값어치다
 *  owner   — 채널 주인만. 부장회의 안내·보안점검처럼 일방 안내만 필요한 자리에서,
 *            아무나 쓰면 안내가 대화에 묻힌다
 */
export const POST_POLICY = { MEMBERS: 'members', OWNER: 'owner' }

/**
 * 옛 문서에는 이 필드들이 없다. 읽는 곳마다 `?? 'public'`을 늘어놓지 않도록 여기서 흡수한다.
 *
 * **주의: 쿼리에는 이 기본값이 통하지 않는다.** where('visibility','==','public')은 필드가
 * 없는 문서를 아예 돌려주지 않아 목록에서 조용히 사라진다. 쿼리로 거를 값은 반드시
 * 백필해 두어야 한다(scripts/backfillChannelVisibility.js).
 */
export function channelType(channel) {
  return channel?.type === CHANNEL_TYPE.DM ? CHANNEL_TYPE.DM : CHANNEL_TYPE.CHANNEL
}

export function channelVisibility(channel) {
  return channel?.visibility === VISIBILITY.PRIVATE ? VISIBILITY.PRIVATE : VISIBILITY.PUBLIC
}

export function isPrivateChannel(channel) {
  return channelVisibility(channel) === VISIBILITY.PRIVATE
}

/** DM인가 — 이름 없는 2인 채널(CHANNEL_TYPE 주석 참고). */
export function isDm(channel) {
  return channelType(channel) === CHANNEL_TYPE.DM
}

/**
 * 전교직원 채널인가 — 학교 전체 공지가 모이는 자리.
 *
 * 이 채널만 나가기·보관을 막는다. 학교 공지가 도착하는 유일한 자리라, 한 번 나가면 그 뒤로
 * 오는 공지를 못 보는데 **화면에는 아무 일도 없어 보인다.** 보관도 같은 이유로 막는다 —
 * 관리자가 눌러 접으면 전 교직원의 사이드바에서 한꺼번에 사라진다.
 *
 * 참여자에서 빠지는 것 자체를 막지는 않는다(그건 인사이동의 몫이다). 막는 것은 **스스로
 * 길을 끊는 동작**뿐이다.
 */
export function isAllStaffChannel(channel) {
  return channel?.id === ALL_STAFF_CHANNEL_ID
}

export function channelPostPolicy(channel) {
  return channel?.postPolicy === POST_POLICY.OWNER ? POST_POLICY.OWNER : POST_POLICY.MEMBERS
}

/**
 * 이 채널에 글을 쓸 수 있는가.
 *
 * 화면에서 미리 막는 이유는 firestore.rules와 같다 — 눌린 뒤 권한 오류로 튕기면
 * 사용자는 기능이 고장 난 것으로 읽는다.
 */
export function canPostTo(channel, uid, isAdmin = false) {
  if (!channel || !uid) return false
  if (!isMember(channel, uid)) return false
  if (channelPostPolicy(channel) === POST_POLICY.MEMBERS) return true
  return !!isAdmin || channel.createdBy === uid
}

/**
 * 채널에 딸린 업무 글이 가져야 할 열람 범위.
 *
 * 채널만 숨기고 글을 그대로 두면 채널 이름만 안 보일 뿐 내용은 다 읽힌다. 그래서 글에도
 * 같은 판정을 복사해 둔다.
 *
 * 공개 채널 글에는 visibleUids를 넣지 않는다. 넣으면 교직원 수십 명의 uid가 글마다 복제되고,
 * 인사이동 한 번에 학교 전체 글을 갱신해야 한다. 비공개는 소수라 그쪽만 유지하면 된다.
 *
 * @param {object|null} channel 채널 없는 글이면 null
 * @returns {{visibility: 'school'|'members', visibleUids: string[]}}
 */
export function postVisibilityFor(channel) {
  if (channel && isPrivateChannel(channel)) {
    return { visibility: 'members', visibleUids: [...new Set(channel.memberUids || [])] }
  }
  return { visibility: 'school', visibleUids: [] }
}

// ── 캔버스(업무 글) 탭 ────────────────────────────────────────

/**
 * 채널 머리에 탭으로 세울 캔버스의 최대 수.
 *
 * Slack은 보통 한둘이고 우리는 대여섯을 예상했다. 넘칠 때 목록으로 되돌리지 않고 '더보기'로
 * 접는 이유는, 목록으로 되돌리면 채널이 몇 개든 탭 방식의 이점(지금 살아 있는 일이 머리에
 * 보인다)이 통째로 사라지기 때문이다. 넘치는 채널만 조금 불편하면 된다.
 */
export const CANVAS_TAB_MAX = 4

/**
 * 이 글이 탭에 남아 있어야 하는가.
 *
 * ── 자동으로 판정하고, 사람이 되돌릴 수 있게 한다 (2026-08-24 확정) ──
 *
 * 자동만 두면 아직 볼 일이 남았는데 사라지고, 수동만 두면 아무도 안 눌러서 쌓인다. 둘 다
 * 실제로 일어나는 일이라 한쪽만 고를 수 없었다. 그래서 기본은 자동이고 `archived` 필드가
 * 있으면 그 뜻이 자동 판정을 이긴다 — **세 가지 상태가 아니라, 자동 판정에 대한 예외 표시다.**
 *
 *   archived 없음   → 자동 판정
 *   archived: true  → 아직 안 끝났지만 사람이 치웠다
 *   archived: false → 끝났지만 사람이 다시 꺼냈다
 *
 * 요청은 "대상 전원 완료"가 끝난 신호다. 마감이 지난 것은 끝난 것이 아니라 **가장 급한
 * 것**이라 그대로 둔다. 안내는 완료 개념이 없어 마감일이 지나면 볼 일이 끝난 것으로 본다.
 * 마감일 없는 안내는 신호가 없어 계속 남는데, 그건 CANVAS_TAB_MAX가 받아낸다.
 */
export function isLivePost(post, now = new Date()) {
  if (post?.archived === true) return false
  if (post?.archived === false) return true
  if ((post?.kind || 'request') === 'request') return !isSettled(post)
  return !isOverdue(post, now)
}

/**
 * 탭에 세울 순서 — 최근에 만든 것이 앞으로.
 *
 * 넘치는 것을 '오래된 것부터' 접기로 했으니, 오래된 것이 뒤로 가야 자연스럽게 잘린다.
 * 급한 순(sortByUrgency)을 쓰지 않는 이유는 탭 자리가 매일 바뀌기 때문이다 — 마감이
 * 다가오는 것만으로 탭이 옆으로 움직이면, 어제 오른쪽에서 누르던 것을 오늘 다시 찾아야 한다.
 */
export function sortCanvasTabs(posts = []) {
  return [...posts].sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))
}

// ── DM ────────────────────────────────────────────────────────

/**
 * DM 채널 문서.
 *
 * 채널과 같은 컬렉션·같은 필드를 쓴다. 그래야 목록 구독·안읽음 계산·메시지 전송·보안 규칙이
 * 한 벌로 끝난다 — DM을 별도 컬렉션으로 두면 그 네 가지를 전부 두 번씩 만들어야 한다.
 *
 * **memberNames를 문서에 박아 두는 이유**: 사이드바는 교직원 명단을 읽지 않는다(채널은
 * 이름이 문서에 있으니 필요가 없었다). DM만을 위해 명단 조회를 사이드바에 들이면 화면
 * 하나 그리려고 users를 통째로 읽게 된다. 보낸 사람 이름을 메시지에 박아두는 것
 * (channelMessages.js의 authorName)과 같은 판단이고, 학교를 떠난 사람과의 지난 대화가
 * uid로 보이지 않는다는 이점도 같다.
 *
 * memberUids는 **반드시 정렬해서** 넣는다. 문서 ID(dmChannelId)가 정렬을 전제로 만들어지고
 * 보안 규칙도 그 순서로 ID를 맞춰 보기 때문에, 순서가 뒤집히면 규칙에 막힌다.
 *
 * @param {{uid: string, name?: string}} me
 * @param {{uid: string, name?: string}} other
 */
export function newDmPayload({ me, other }) {
  const uids = [me.uid, other.uid].sort()
  return {
    name: '',
    description: '',
    // 조건으로 뽑은 참여자가 아니라 두 사람을 직접 지목한 것이다. 조건을 비워 두면
    // '참여자 갱신' 계산이 "두 명 다 빠짐"으로 읽는다.
    memberRule: { conditions: [], includeUids: uids, excludeUids: [] },
    memberRuleText: '',
    memberUids: uids,
    memberNames: { [me.uid]: me.name || '', [other.uid]: other.name || '' },
    leftUids: [],
    createdBy: me.uid,
    createdByName: me.name || '',
    archived: false,
    type: CHANNEL_TYPE.DM,
    visibility: VISIBILITY.PRIVATE,
    postPolicy: POST_POLICY.MEMBERS,
  }
}

/**
 * DM을 목록에 뭐라고 적을 것인가 — 상대의 이름.
 *
 * 이름이 없는 채널이라 name 필드를 그대로 쓰면 빈 줄이 된다. 나 자신과의 DM(메모 용도로
 * 열어둔 경우)은 상대가 없으므로 그렇게 밝힌다.
 */
export function dmTitle(channel, myUid) {
  const names = channel?.memberNames || {}
  const otherUid = (channel?.memberUids || []).find(uid => uid !== myUid)
  if (!otherUid) return '나와의 대화'
  return names[otherUid] || '(이름 없음)'
}

/**
 * DM 목록 순서 — 최근에 말이 오간 것이 위로.
 *
 * 채널은 급한 순(마감·진행 중)으로 정렬하는데 DM은 그럴 근거가 없다. 대화는 마감이 없고,
 * 방금 온 말에 답하는 것이 거의 항상 다음에 할 일이다.
 */
export function sortDms(dms = [], myUid) {
  return [...dms].sort((a, b) => {
    const diff = toMillis(b.lastMessageAt) - toMillis(a.lastMessageAt)
    if (diff !== 0) return diff
    return dmTitle(a, myUid).localeCompare(dmTitle(b, myUid), 'ko')
  })
}

function toMillis(value) {
  if (!value) return 0
  if (typeof value.toMillis === 'function') return value.toMillis()
  if (value instanceof Date) return value.getTime()
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

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
  visibility = VISIBILITY.PUBLIC,
  postPolicy = POST_POLICY.MEMBERS,
  type = CHANNEL_TYPE.CHANNEL,
}) {
  return {
    name: (name || '').trim().slice(0, CHANNEL_NAME_MAX),
    description: (description || '').trim().slice(0, CHANNEL_DESCRIPTION_MAX),
    memberRule,
    memberRuleText,
    memberUids: members.map(m => m.uid),
    leftUids: [],
    createdBy,
    createdByName,
    archived: false,
    // 셋 다 반드시 값을 채워 넣는다. 쿼리로 걸러야 하는 값이라 필드가 없으면 그 채널이
    // 목록에서 조용히 빠진다(channelVisibility 주석 참고).
    type: type === CHANNEL_TYPE.DM ? CHANNEL_TYPE.DM : CHANNEL_TYPE.CHANNEL,
    visibility: visibility === VISIBILITY.PRIVATE ? VISIBILITY.PRIVATE : VISIBILITY.PUBLIC,
    postPolicy: postPolicy === POST_POLICY.OWNER ? POST_POLICY.OWNER : POST_POLICY.MEMBERS,
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
export function isSettled(post) {
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

/**
 * 나갔다는 사실을 memberUids에서 빼는 대신 따로 기억하는 이유.
 *
 * memberUids는 사람의 뜻이 아니라 조건을 지금 구성원에 펼친 계산 결과다. 거기서 자기를
 * 지워봐야 다음 갱신 때 조건이 그대로 다시 채워 넣는다. 나갔다는 것은 조건과 무관하게
 * 살아남아야 하는 사실이라 조건의 결과물과 같은 칸에 둘 수 없다.
 *
 * 규칙 검증에도 이 편이 낫다. 나가기가 leftUids 하나만 건드리면 "움직인 uid가 본인뿐인가"를
 * completedUids와 똑같은 방식으로 볼 수 있다. 나가기가 memberUids를 건드리게 두면 참여자
 * 명단을 바꾸는 일과 나가는 일이 한 필드에서 일어나 규칙으로 둘을 갈라낼 수 없고,
 * 결국 "명단을 고칠 수 있는 사람"과 "나갈 수 있는 사람"의 권한이 같아져 버린다.
 *
 * 갱신할 때 leftUids를 정리하지 않는 것도 같은 이유다. 조건이 이 사람을 다시 데려와도
 * 본인이 밝힌 뜻은 그대로 남아야 한다 — 돌아오는 것은 본인이 '다시 참여'를 누를 때다.
 */
export function hasLeft(channel, uid) {
  if (!channel || !uid) return false
  return (channel.leftUids || []).includes(uid)
}

/** 내가 이 채널의 참여자인가. 만든 사람은 조건에서 빠져도 계속 본다. */
export function isMember(channel, uid) {
  if (!channel || !uid) return false
  // 나간 사람은 만든 사람이라도 목록에서 빼준다. 스스로 밝힌 뜻이 조건보다 뒤에 오면
  // 나가기 버튼이 아무 일도 안 하는 버튼이 된다.
  if (hasLeft(channel, uid)) return false
  return channel.createdBy === uid || (channel.memberUids || []).includes(uid)
}

/**
 * 보관·갱신·고치기를 만든 사람과 관리자로 묶는 기준.
 *
 * firestore.rules의 채널 update 조건과 같은 판정을 화면에서도 해서, 규칙에 막힐 동작이
 * 애초에 눌리지 않게 한다. 눌린 뒤 권한 오류로 튕기면 사용자는 기능이 고장 난 것으로 읽는다.
 */
export function canManageChannel(channel, uid, isAdmin = false) {
  if (!channel || !uid) return false
  return !!isAdmin || channel.createdBy === uid
}

/**
 * 저장된 참여자 명단과, 조건을 지금 구성원에 다시 푼 결과를 견준다.
 *
 * 인사이동이나 배정 입력이 있으면 memberUids가 조용히 낡는다. 화면은 어제와 똑같아서
 * 아무도 눈치채지 못하는데, 새로 온 선생님에게는 채널이 안 보이고 떠난 선생님에게는
 * 계속 보인다. 목록을 눈으로 훑어서는 못 잡는 종류의 어긋남이라 계산으로 잡는다.
 *
 * 자동으로 덮어쓰지 않고 사람에게 보이기만 하는 이유: 참여자가 바뀌는 것은 알아야 할
 * 변화다. 조건을 잘못 고쳐 절반이 빠지는 경우와 인사이동으로 두 명이 바뀌는 경우가
 * 화면에 똑같이 보이면, 갱신 버튼은 내용을 안 읽고 누르는 버튼이 된다.
 *
 * 순서와 중복은 변화로 세지 않는다. 조건 엔진은 이름순으로 정렬해 돌려주기 때문에
 * 개명 하나로도 uid 순서가 바뀌는데, 그걸 변화로 치면 실제로는 그대로인 채널에
 * 갱신 표시가 영영 붙어 있고 그러면 표시 자체를 안 믿게 된다.
 *
 * @param {string[]} savedUids    채널 문서의 memberUids
 * @param {string[]} resolvedUids resolveTargets로 지금 다시 푼 uid들
 * @returns {{ added: string[], removed: string[], changed: boolean }}
 */
export function memberDiff(savedUids = [], resolvedUids = []) {
  const saved = new Set((savedUids || []).filter(Boolean))
  const resolved = new Set((resolvedUids || []).filter(Boolean))

  const added = [...resolved].filter(uid => !saved.has(uid)).sort()
  const removed = [...saved].filter(uid => !resolved.has(uid)).sort()

  return { added, removed, changed: added.length > 0 || removed.length > 0 }
}
