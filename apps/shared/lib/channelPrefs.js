/**
 * 채널 개인화 — 즐겨찾기와 사용자 정의 섹션.
 *
 * 채널이 늘어나면 사이드바는 "가나다순으로 쌓인 스무 줄"이 된다. 매일 여는 서너 개를
 * 눈으로 찾는 시간이 매번 들고, 그 서너 개가 목록 아래쪽에 있으면 스크롤까지 해야 한다.
 * 즐겨찾기는 그걸 맨 위로 끌어올리고, 섹션은 성격이 다른 묶음(예: 고사 관련 / 학년 업무)을
 * 갈라 놓는다.
 *
 * ── 한 채널은 한 곳에만 나온다 ──────────────────────────────
 *
 * 즐겨찾기 > 사용자 섹션 > 기본('채널') 순으로 자리를 정하고, 앞에서 자리를 잡으면 뒤에는
 * 나오지 않는다. 중복을 허용하면 같은 채널이 두 줄이 되어 안읽음 표시가 두 번 뜨고, 어느
 * 줄을 눌러야 하는지 매번 헷갈린다. (구성원 명단은 반대로 중복을 허용하는데, 거기서는
 * "이 사람이 국어과이면서 1교무실"이라는 사실 자체가 정보이기 때문이다. 채널은 아니다.)
 *
 * ── 저장 위치 ────────────────────────────────────────────────
 *
 * users/{uid}.channelPrefs — 개인 설정이라 학교 데이터와 섞지 않는다. 규칙에서 본인
 * 문서는 이미 자기가 고칠 수 있으므로 firestore.rules를 건드릴 필요가 없다.
 * 채널별 알림 끄기(mutedChannelIds)도 같은 자리에 있다. 나중에 읽음 마커도 여기 들어온다.
 */

/** 섹션 이름 — 268px 사이드바 한 줄에 들어가야 한다. */
export const SECTION_NAME_MAX = 20

/** 섹션 개수 상한. 이보다 많아지면 섹션을 찾는 일이 채널을 찾는 일만큼 어려워진다. */
export const SECTION_MAX = 12

/** 기본 그룹(어디에도 넣지 않은 채널)과 즐겨찾기 그룹의 고정 ID. */
export const FAVORITES_ID = '__favorites'
export const DEFAULT_ID = '__default'

const EMPTY = Object.freeze({ favorites: [], sections: [], collapsed: [], mutedChannelIds: [] })

/**
 * Firestore에서 읽은 값을 안전한 모양으로 다듬는다.
 *
 * 필드가 아예 없는 사용자(대부분)와, 손으로 고쳐 모양이 깨진 값을 같은 자리에서 흡수한다.
 * 화면 코드가 매번 `?.` 와 `|| []` 를 늘어놓지 않게 하려는 것이다.
 */
export function normalizePrefs(raw) {
  if (!raw || typeof raw !== 'object') return { ...EMPTY }

  const favorites = uniqueStrings(raw.favorites)
  const collapsed = uniqueStrings(raw.collapsed)
  const mutedChannelIds = uniqueStrings(raw.mutedChannelIds)

  const seenIds = new Set()
  const sections = (Array.isArray(raw.sections) ? raw.sections : [])
    .filter(s => s && typeof s.id === 'string' && s.id)
    .filter(s => !seenIds.has(s.id) && seenIds.add(s.id))
    .slice(0, SECTION_MAX)
    .map(s => ({
      id: s.id,
      name: String(s.name || '').slice(0, SECTION_NAME_MAX),
      // 즐겨찾기가 이겼으므로 섹션 쪽에서는 빼둔다 — 저장값이 어떻든 화면에는 한 번만 나온다
      channelIds: uniqueStrings(s.channelIds).filter(id => !favorites.includes(id)),
    }))

  return { favorites, sections, collapsed, mutedChannelIds }
}

/**
 * 활성 채널을 화면에 그릴 그룹으로 묶는다.
 *
 * 보관함·나간 채널은 여기 넣지 않는다. 그건 개인 취향이 아니라 채널 상태라서
 * 호출하는 쪽(Channels.jsx)이 이미 갈라 두었다.
 *
 * **없어진 채널 ID는 그릴 때만 거르고 저장값은 건드리지 않는다.** 채널 목록을 잠깐 못
 * 읽는 순간(로그인 직후, 권한 로딩 중)에 정리해버리면 즐겨찾기가 조용히 날아간다.
 * 되돌릴 방법이 없는 손실이라, 화면에서 안 보이는 쪽을 택한다.
 *
 * 그룹 안의 채널 순서는 넘겨받은 순서를 그대로 쓴다. 호출부가 sortChannels로 급한 순
 * (마감 지남 → 진행 중 → 조용함)을 이미 매겨두었고, 그 순서가 개인 취향보다 유용하다.
 *
 * @param {object[]} channels 활성 채널 (이미 정렬된 상태)
 * @param {object} prefs normalizePrefs를 거친 값
 * @returns {{id: string, name: string, kind: 'favorites'|'section'|'default', channels: object[]}[]}
 */
export function groupChannels(channels = [], prefs = EMPTY) {
  const { favorites, sections } = normalizePrefs(prefs)
  const byId = new Map(channels.map(c => [c.id, c]))
  const taken = new Set()

  const pick = (ids) => {
    const out = []
    for (const id of ids) {
      const c = byId.get(id)
      if (!c || taken.has(id)) continue
      taken.add(id)
      out.push(c)
    }
    return out
  }

  // 즐겨찾기 안에서는 사용자가 넣은 순서를 지킨다 — 직접 고른 몇 개라 자리가 흔들리면
  // 오히려 못 찾는다. 나머지 그룹은 급한 순(넘겨받은 순서)을 따른다.
  const favChannels = pick(favorites)
  const sectionGroups = sections.map(s => ({
    id: s.id,
    name: s.name,
    kind: 'section',
    channels: sortLike(pick(s.channelIds), channels),
  }))
  const rest = channels.filter(c => !taken.has(c.id))

  const groups = []
  // 비어 있으면 그리지 않는다 — 대부분의 사람에게 평생 빈 칸이면 자리만 차지한다
  // (보관함·나간 채널을 감추는 것과 같은 판단).
  if (favChannels.length) {
    groups.push({ id: FAVORITES_ID, name: '즐겨찾기', kind: 'favorites', channels: favChannels })
  }
  // 사용자 섹션은 비어도 그린다. 일부러 만든 것이라 사라지면 만들기가 실패한 것처럼 보이고,
  // 채널을 옮겨 넣을 자리도 없어진다.
  groups.push(...sectionGroups)
  if (rest.length) {
    groups.push({ id: DEFAULT_ID, name: '채널', kind: 'default', channels: rest })
  }
  return groups
}

/** 넘겨받은 전체 순서(급한 순)를 기준으로 다시 정렬한다. */
function sortLike(subset, ordered) {
  const rank = new Map(ordered.map((c, i) => [c.id, i]))
  return [...subset].sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0))
}

/** 즐겨찾기에 넣거나 뺀다. 넣을 때는 섹션에서 빠진다(한 곳에만 나오므로). */
export function toggleFavorite(prefs, channelId) {
  const next = normalizePrefs(prefs)
  if (next.favorites.includes(channelId)) {
    next.favorites = next.favorites.filter(id => id !== channelId)
    return next
  }
  next.favorites = [...next.favorites, channelId]
  next.sections = next.sections.map(s => ({
    ...s,
    channelIds: s.channelIds.filter(id => id !== channelId),
  }))
  return next
}

export function isFavorite(prefs, channelId) {
  return normalizePrefs(prefs).favorites.includes(channelId)
}

/**
 * 채널 알림 끄기(mute) 토글 — 즐겨찾기·섹션 소속과는 무관하다(알림 여부와 "어디에
 * 보이는가"는 다른 축이라 즐겨찾기에 넣은 채널도 뮤트할 수 있어야 한다).
 * useMentionNotifications.js가 이 목록에 있는 채널은 리스너 자체를 열지 않는다.
 */
export function toggleMuted(prefs, channelId) {
  const next = normalizePrefs(prefs)
  next.mutedChannelIds = next.mutedChannelIds.includes(channelId)
    ? next.mutedChannelIds.filter(id => id !== channelId)
    : [...next.mutedChannelIds, channelId]
  return next
}

export function isMuted(prefs, channelId) {
  return normalizePrefs(prefs).mutedChannelIds.includes(channelId)
}

/** 이 채널이 들어 있는 섹션 ID. 없으면 null. */
export function sectionOf(prefs, channelId) {
  const { sections } = normalizePrefs(prefs)
  return sections.find(s => s.channelIds.includes(channelId))?.id ?? null
}

/**
 * 채널을 섹션으로 옮긴다. sectionId가 null이면 기본 그룹으로 되돌린다.
 * 옮기면 즐겨찾기에서도 빠진다 — 한 곳에만 나온다는 규칙 때문이다.
 */
export function moveToSection(prefs, channelId, sectionId) {
  const next = normalizePrefs(prefs)
  next.favorites = next.favorites.filter(id => id !== channelId)
  next.sections = next.sections.map(s => ({
    ...s,
    channelIds: s.id === sectionId
      ? [...s.channelIds.filter(id => id !== channelId), channelId]
      : s.channelIds.filter(id => id !== channelId),
  }))
  return next
}

/** 새 섹션. id는 테스트에서 고정하려고 밖에서 넣을 수 있게 열어둔다. */
export function createSection(prefs, name, id = newSectionId()) {
  const next = normalizePrefs(prefs)
  if (next.sections.length >= SECTION_MAX) return next
  next.sections = [...next.sections, {
    id,
    name: String(name || '').trim().slice(0, SECTION_NAME_MAX),
    channelIds: [],
  }]
  return next
}

export function renameSection(prefs, sectionId, name) {
  const next = normalizePrefs(prefs)
  next.sections = next.sections.map(s => (
    s.id === sectionId ? { ...s, name: String(name || '').trim().slice(0, SECTION_NAME_MAX) } : s
  ))
  return next
}

/**
 * 섹션을 지운다. **안에 있던 채널은 기본 그룹으로 돌아갈 뿐 사라지지 않는다.**
 * 섹션은 보기 좋게 묶어둔 것일 뿐 채널 참여와는 무관하므로, 지웠다고 채널이 목록에서
 * 없어지면 사람들은 섹션 정리를 무서워하게 된다.
 */
export function removeSection(prefs, sectionId) {
  const next = normalizePrefs(prefs)
  next.sections = next.sections.filter(s => s.id !== sectionId)
  next.collapsed = next.collapsed.filter(id => id !== sectionId)
  return next
}

/** 접힘 상태 토글. 다음 접속에도 유지되어야 해서 개인 설정에 함께 저장한다. */
export function toggleCollapsed(prefs, groupId) {
  const next = normalizePrefs(prefs)
  next.collapsed = next.collapsed.includes(groupId)
    ? next.collapsed.filter(id => id !== groupId)
    : [...next.collapsed, groupId]
  return next
}

export function isCollapsed(prefs, groupId) {
  return normalizePrefs(prefs).collapsed.includes(groupId)
}

/**
 * 섹션 이름 검증.
 * 빈 이름은 누를 수 없는 줄이 되고, 같은 이름이 둘이면 어디에 넣은 건지 알 수 없다.
 *
 * @param {string[]} existingNames 이미 있는 이름들 (자기 자신은 빼고 넘길 것)
 */
export function validateSectionName(name, existingNames = []) {
  const trimmed = String(name || '').trim()
  if (!trimmed) return '섹션 이름을 입력해 주세요.'
  if (trimmed.length > SECTION_NAME_MAX) return `이름은 ${SECTION_NAME_MAX}자까지 쓸 수 있습니다.`
  if (existingNames.some(n => String(n || '').trim().toLowerCase() === trimmed.toLowerCase())) {
    return '같은 이름의 섹션이 이미 있습니다.'
  }
  return null
}

function newSectionId() {
  return `sec_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

function uniqueStrings(v) {
  if (!Array.isArray(v)) return []
  return [...new Set(v.filter(x => typeof x === 'string' && x))]
}
