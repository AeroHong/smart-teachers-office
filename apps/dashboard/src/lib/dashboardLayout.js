/**
 * 대시보드 위젯 배치 모델.
 *
 * 예전 구조는 열별 2차원 배열(`[['tasks'], ['presence','calls']]`)이라 위젯이 어느 열에
 * 있느냐로 크기가 정해졌다. 12열 그리드로 바꾸면서 "순서 + 각자의 폭"으로 바꾼다
 * (`[{ id:'tasks', size:'L' }, ...]`). 열이 아니라 폭을 직접 고르므로 화면 폭이 달라져도
 * 의도한 비율이 유지된다.
 *
 * 완전 자유 배치(태블릿 바탕화면)는 하지 않는다. 아이콘과 달리 위젯은 내용에 따라 높이가
 * 제각각이라 자유 배치하면 빈칸이 생기고 결국 사용자가 정리에 시간을 쓴다.
 * iOS 위젯도 자유 배치가 아니라 크기 3단계 + 그리드 스냅이다.
 */

export const GRID_COLUMNS = 12

/** 위젯이 차지할 수 있는 폭. 값은 12열 기준 열 수. */
export const SIZES = {
  S: { label: '좁게', span: 4 },
  M: { label: '보통', span: 6 },
  L: { label: '넓게', span: 12 },
}

export const SIZE_KEYS = ['S', 'M', 'L']

/** 위젯별 기본 폭 — 내용의 성격에 맞춰 정한다. */
const DEFAULT_SIZE = {
  tasks: 'L',
  announcements: 'L',
  calendar: 'M',
  notices: 'M',
  presence: 'S',
  calls: 'S',
}

export function defaultSizeFor(id) {
  return DEFAULT_SIZE[id] || 'M'
}

export const DEFAULT_LAYOUT = [
  { id: 'tasks', size: 'L' },
  { id: 'presence', size: 'S' },
  { id: 'calls', size: 'S' },
  { id: 'notices', size: 'M' },
  { id: 'announcements', size: 'L' },
  { id: 'calendar', size: 'M' },
]

function isLegacyLayout(saved) {
  // 예전 구조: [[id, id], [id]] — 배열의 배열
  return Array.isArray(saved) && saved.some(v => Array.isArray(v))
}

/**
 * 예전 열 기반 배치를 새 구조로 옮긴다.
 * 열을 왼쪽부터 훑어 순서를 만들고, 폭은 위젯별 기본값을 준다. 열 배분을 그대로 살리려
 * 애쓰지 않는 이유는 열 개수(2)와 폭 단계(3)가 대응되지 않아서다.
 */
function migrateLegacy(saved) {
  const ids = saved.flat().filter(id => typeof id === 'string')
  return ids.map(id => ({ id, size: defaultSizeFor(id) }))
}

/**
 * 저장값을 화면에 쓸 배치로 정리한다.
 *  - 예전 구조면 새 구조로 변환
 *  - 볼 수 없는 위젯(관리자가 끈 모듈)은 제거
 *  - 배치에 아직 없는 위젯은 뒤에 붙임 (새 위젯이 추가돼도 저절로 나타난다)
 *
 * @param {*} saved users/{uid}.dashboardLayout 원본
 * @param {string[]} visibleIds 지금 이 교사가 볼 수 있는 위젯 id 목록
 */
export function normalizeLayout(saved, visibleIds) {
  const base = isLegacyLayout(saved)
    ? migrateLegacy(saved)
    : Array.isArray(saved) && saved.length > 0
      ? saved.filter(item => item && typeof item.id === 'string')
      : DEFAULT_LAYOUT

  const allowed = new Set(visibleIds)
  const kept = base
    .filter(item => allowed.has(item.id))
    .map(item => ({ id: item.id, size: SIZES[item.size] ? item.size : defaultSizeFor(item.id) }))

  const placed = new Set(kept.map(item => item.id))
  const added = visibleIds
    .filter(id => !placed.has(id))
    .map(id => ({ id, size: defaultSizeFor(id) }))

  return [...kept, ...added]
}

/** 항목을 from 위치에서 to 위치로 옮긴 새 배열. */
export function moveItem(layout, from, to) {
  if (from === to || from < 0 || from >= layout.length) return layout
  const next = [...layout]
  const [item] = next.splice(from, 1)
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item)
  return next
}

export function setSize(layout, id, size) {
  return layout.map(item => (item.id === id ? { ...item, size } : item))
}
