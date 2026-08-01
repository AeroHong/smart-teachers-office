/**
 * 구성원 명단 트리 구성.
 *
 * 쿨메신저식 조직도 구조 — 사무실·교과·부서가 동시에 최상위 토글로 존재하고,
 * 한 사람이 여러 최상위 그룹에 중복해서 등장한다. 기준을 드롭다운으로 전환하지 않는
 * 이유는 교사들이 이미 그 구조에 익숙해서다 (PLAN_messenger.md의 "전환 비용" 대응).
 *
 * 교과는 teacherAssignments.subject(국어·수학 같은 교과)를 쓴다. teacherSubjects의
 * semester*Subjects(문학·독서와작문 같은 개별 과목)가 아니다 — 조직도에서 기대하는 단위는
 * "국어과"지 "독서와작문"이 아니다.
 */

export const ROOT_GROUPS = [
  { key: 'office', label: '사무실', field: 'office' },
  { key: 'subject', label: '교과', field: 'subject' },
  { key: 'department', label: '부서', field: 'department' },
]

const UNASSIGNED = '미지정'

/** 트리 노드 ID — 펼침 상태를 저장할 때 쓰는 키. */
export function nodeId(rootKey, groupName) {
  return groupName == null ? rootKey : `${rootKey}/${groupName}`
}

/**
 * @param {Array} members [{ uid, name, office, subject, department }]
 * @returns {Array} [{ key, label, groups: [{ name, id, members }] }]
 */
export function buildRosterTree(members) {
  return ROOT_GROUPS.map(root => {
    const byGroup = new Map()
    members.forEach(m => {
      const name = (m[root.field] || '').trim() || UNASSIGNED
      if (!byGroup.has(name)) byGroup.set(name, [])
      byGroup.get(name).push(m)
    })

    const groups = [...byGroup.entries()]
      .map(([name, list]) => ({
        name,
        id: nodeId(root.key, name),
        members: [...list].sort(byName),
      }))
      // '미지정'은 항상 맨 아래로 — 이름순으로 섞이면 목록 중간에 끼어 눈에 걸린다
      .sort((a, b) => {
        if ((a.name === UNASSIGNED) !== (b.name === UNASSIGNED)) return a.name === UNASSIGNED ? 1 : -1
        return a.name.localeCompare(b.name, 'ko')
      })

    return { key: root.key, label: root.label, id: nodeId(root.key), groups }
  })
}

function byName(a, b) {
  return (a.name || '').localeCompare(b.name || '', 'ko')
}

/**
 * 첫 접속 기본 펼침 — '사무실 > 내 사무실'만 편다.
 * 전부 펼치면 60명 × 기준 3개 = 180줄이라 280px 패널에서 감당이 안 된다.
 */
export function defaultExpanded(myOffice) {
  const ids = ['office']
  if (myOffice) ids.push(nodeId('office', myOffice))
  return ids
}

/**
 * 검색은 트리를 무시하고 평평하게 — 이름을 치면 어느 그룹에 있든 사람이 바로 나와야 한다.
 * 트리 계층을 유지한 채 필터링하면 오히려 찾기 어렵다.
 */
export function searchMembers(members, keyword) {
  const q = keyword.trim().toLowerCase()
  if (!q) return []
  return members
    .filter(m => (m.name || '').toLowerCase().includes(q))
    .sort(byName)
}

/** 검색 결과 한 줄에 붙는 소속 설명 — 어느 사무실/교과 사람인지 바로 알 수 있게. */
export function memberSubtitle(member) {
  return [member.office, member.subject].filter(Boolean).join(' · ')
}
