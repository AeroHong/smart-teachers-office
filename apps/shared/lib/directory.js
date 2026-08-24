/**
 * 디렉터리 — 사람·채널·그룹을 한자리에서 찾는다.
 *
 * ── 왜 별도 화면인가 ────────────────────────────────────────
 *
 * 지금은 **내가 속한 채널만** 보인다. 새로 온 선생님이 "성적 관련 채널이 있나요"를 알아내려면
 * 사람에게 물어야 한다. 사람도 마찬가지다 — 이름을 알면 찾지만, "2학년 담임이 누구누구지"는
 * 조직도를 펼쳐야 안다. 둘 다 "무엇이 있는지 모른다"는 같은 문제라 한 화면에 둔다.
 *
 * ── 사용자 그룹을 새로 만들지 않는다 ────────────────────────
 *
 * Slack의 사용자 그룹은 손으로 관리하는 명단이라 인사이동 때 낡는다. 우리는 그 문제를 채널
 * 참여자에서 이미 겪었고(memberDiff), 답도 갖고 있다 — 조건으로 저장해 두고 필요할 때 다시
 * 푼다. 부서·교과·사무실·담임은 **배정 데이터에 이미 있으므로 저장할 것조차 없다.** 지금
 * 구성원 화면의 조직도 트리가 하는 일이 곧 Slack의 사용자 그룹이고, 이름만 안 붙어 있었다.
 *
 * 손으로 묶어야 하는 그룹("성적처리 TF")은 targeting.js의 includeUids로 이미 표현되지만,
 * 그걸 이름 붙여 저장하는 것은 P4(멘션)와 함께 설계한다 — 그룹 이름이 곧 멘션 핸들(@2학년담임)이
 * 되므로 이름 규칙과 중복 방지를 멘션과 따로 정하면 두 번 정하게 된다.
 */

/** 사람 카드에 적는 한 줄 — 직함·부서·교과 중 있는 것만. */
export function memberSubtitle(member) {
  return [member?.positionLabel, member?.department, member?.subject]
    .map(v => (v || '').trim())
    .filter(Boolean)
    .join(' · ')
}

/** 담임은 부서·교과와 성격이 다른 표시라 따로 뽑는다. */
export function homeroomLabel(member) {
  if (!member?.isHomeroom) return ''
  const { homeroomGrade: g, homeroomClassNo: c } = member
  if (g == null) return '담임'
  return c == null ? `${g}학년 담임` : `${g}-${c} 담임`
}

/**
 * 검색어와 필터로 사람을 좁힌다.
 *
 * 검색어는 이름만이 아니라 부서·교과·사무실·직함까지 훑는다. "누가 3층에 있지"처럼 사람
 * 이름을 모르는 채로 찾는 경우가 실제로 더 흔하기 때문이다.
 *
 * 필터는 값이 있는 것만 적용한다(AND). 빈 값을 "일치해야 함"으로 치면 배정이 아직 안 들어온
 * 사람이 어느 필터에도 안 걸려 명단에서 조용히 사라진다.
 *
 * @param {{keyword?: string, office?: string, department?: string, subject?: string,
 *          rank?: string, homeroomGrade?: number}} filter
 */
export function filterMembers(members = [], filter = {}) {
  const keyword = (filter.keyword || '').trim()
  return members.filter((m) => {
    if (filter.office && m.office !== filter.office) return false
    if (filter.department && m.department !== filter.department) return false
    if (filter.subject && m.subject !== filter.subject) return false
    if (filter.rank && m.rank !== filter.rank) return false
    if (filter.homeroomGrade != null && !(m.isHomeroom && m.homeroomGrade === filter.homeroomGrade)) return false
    if (!keyword) return true
    return [m.name, m.department, m.subject, m.office, m.positionLabel]
      .some(v => (v || '').includes(keyword))
  })
}

/** 이름 가나다순. 정렬을 고정해야 필터를 바꿔도 사람 자리가 튀지 않는다. */
export function sortMembers(members = []) {
  return [...members].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'))
}

/**
 * 배정 데이터에서 저절로 나오는 그룹들.
 *
 * 값이 빈 사람은 그룹을 만들지 않는다 — '(없음)' 그룹이 생기면 배정이 아직 안 들어온
 * 사람들이 한 덩어리로 묶여, 그룹처럼 보이지만 아무 뜻도 없는 줄이 된다.
 *
 * 한 사람이 여러 그룹에 등장하는 것은 의도한 것이다. 3층 교무실에 있으면서 국어과이고
 * 2학년 담임일 수 있고, 셋 다 그 사람을 찾는 경로다(구성원 화면의 조직도와 같은 구조).
 *
 * @returns {{key: string, label: string, groups: {name: string, members: object[]}[]}[]}
 */
export function autoGroups(members = []) {
  const byField = (field) => {
    const map = new Map()
    members.forEach((m) => {
      const value = (m?.[field] || '').trim()
      if (!value) return
      if (!map.has(value)) map.set(value, [])
      map.get(value).push(m)
    })
    return [...map.entries()]
      .map(([name, list]) => ({ name, members: sortMembers(list) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  }

  const homerooms = new Map()
  members.forEach((m) => {
    if (!m?.isHomeroom || m.homeroomGrade == null) return
    const name = `${m.homeroomGrade}학년 담임`
    if (!homerooms.has(name)) homerooms.set(name, [])
    homerooms.get(name).push(m)
  })

  return [
    { key: 'department', label: '부서', groups: byField('department') },
    { key: 'subject', label: '교과', groups: byField('subject') },
    { key: 'office', label: '사무실', groups: byField('office') },
    {
      key: 'homeroom',
      label: '담임',
      groups: [...homerooms.entries()]
        .map(([name, list]) => ({ name, members: sortMembers(list) }))
        .sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    },
  ].filter(section => section.groups.length > 0)
}

/**
 * 이 그룹을 그대로 채널 참여자 조건으로 옮긴다.
 *
 * 그룹을 보고 "이 사람들로 채널을 만들자"가 되는 것이 자동 그룹의 값어치다. uid를 복사해
 * 넣지 않고 **조건으로** 넘기는 것이 중요하다 — uid를 박으면 인사이동 뒤에 채널이 조용히
 * 낡고, 조건이면 memberDiff가 "갱신 필요"를 띄워준다.
 *
 * 사무실은 조건으로 넘기지 않는다. targeting.js에서 office는 옛 요청을 읽기 위한
 * LEGACY_FIELDS로만 남아 있어 조건 선택기가 그릴 수 없다 — 만들어 주면 나중에 그 채널의
 * 참여자 조건을 고치려 할 때 화면에 뜨지 않는 조건이 된다. 사무실로 채널을 만들 일이
 * 생기면 그때 조건 종류로 올린다.
 *
 * @returns {object|null} 채널 참여자 조건. 조건으로 옮길 수 없는 그룹이면 null
 */
export function groupToMemberRule(sectionKey, groupName) {
  const type = { department: 'department', subject: 'subject' }[sectionKey]
  if (type) {
    return { conditions: [{ type, values: [groupName] }], includeUids: [], excludeUids: [] }
  }
  if (sectionKey === 'homeroom') {
    const grade = Number(String(groupName).replace(/[^0-9]/g, ''))
    if (!Number.isFinite(grade)) return null
    return {
      conditions: [{ type: 'homeroom', is: true, grades: [grade] }],
      includeUids: [], excludeUids: [],
    }
  }
  return null
}
