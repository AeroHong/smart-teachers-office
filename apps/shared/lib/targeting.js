/**
 * 업무 요청 대상 지정 엔진.
 *
 * "2학년 수업에 들어가는 비담임 선생님" 같은 대상을 미리 만들어둔 그룹 없이 조건 조합으로
 * 뽑는다. 학교 업무는 대상이 매번 달라서 고정 그룹으로는 감당이 안 된다.
 *
 * Firestore에 의존하지 않는 순수 함수로 둔다. 대상이 틀리면 누군가 마감을 놓치고 그 책임이
 * 시스템으로 오기 때문에, 이 로직만은 화면 없이 단독으로 검증할 수 있어야 한다.
 * (targeting.test.js — node --test apps/shared/lib/targeting.test.js)
 *
 * 데이터 출처
 *  - users              : uid, name
 *  - teacherAssignments : office, department, subject, positionLabel, isHomeroom, homeroomGrade
 *  - teacherSubjects    : semester{1,2}Subjects[] 의 grade → 수업에 들어가는 학년
 */

/** 조건 종류. 화면의 조건 선택기와 describeRule이 같이 쓴다. */
export const CONDITION_TYPES = {
  department: { label: '부서', field: 'department' },
  subject: { label: '교과', field: 'subject' },
  rank: { label: '직급', field: 'rank' },
  teachingGrade: { label: '수업 학년', field: 'teachingGrades' },
  homeroom: { label: '담임 여부' },
}

/**
 * 직책 이름에서 직급을 뽑는다.
 *
 * 부장 직책은 학교마다 이름이 다르고(교무부장·연구부장·3학년부장·창의예체교육부장…)
 * 해마다 부서가 바뀌면 값도 바뀐다. 직책 값을 그대로 조건으로 쓰면 부장단을 지정할 때
 * 열 몇 개를 일일이 골라야 하고, 새 부장이 생기면 조용히 빠진다.
 *
 * 이름에 무엇이 들어 있는지만 보면 표기가 달라도 같은 층으로 묶인다. 부장단 안내에
 * 교감·교장이 늘 따라붙는 것도 직급 두 개를 고르면 끝난다.
 *
 * 순서가 중요하다 — '교무기획부장'은 기획과 부장을 다 갖고 있지만 부장이다.
 * 위에서부터 먼저 걸리는 쪽이 이긴다.
 *
 * 직책이 없는 사람은 '일반'이다 — 교사와 행정직을 이 값으로는 구분할 수 없어서,
 * 없는 정보를 있는 척하지 않고 그대로 둔다.
 */
export const RANKS = ['관리자', '부장', '기획', '일반']

const RANK_RULES = [
  { rank: '관리자', keywords: ['교장', '교감'] },
  { rank: '부장', keywords: ['부장'] },
  { rank: '기획', keywords: ['기획'] },
]

export function deriveRank(positionLabel) {
  const label = (positionLabel || '').replace(/\s/g, '')
  if (!label) return '일반'
  return RANK_RULES.find(r => r.keywords.some(k => label.includes(k)))?.rank || '일반'
}

/**
 * 화면에 쓸 원본 데이터를 판정하기 좋은 형태로 정리한다.
 *
 * @param {object} input
 * @param {Array} input.users            [{ uid, name }]
 * @param {Array} input.assignments      teacherAssignments 문서들
 * @param {Array} input.teacherSubjects  teacherSubjects 문서들
 * @param {number} input.semester        1 | 2 — 수업 학년을 어느 학기 기준으로 볼지
 * @returns {Array} 정규화된 구성원 목록
 */
export function buildTargetMembers({ users = [], assignments = [], teacherSubjects = [], semester = 1 }) {
  const assignByUid = new Map(assignments.map(a => [a.uid, a]))
  const subjectsByUid = new Map(teacherSubjects.map(s => [s.teacherUid, s]))
  const field = semester === 2 ? 'semester2Subjects' : 'semester1Subjects'

  return users.map(u => {
    const a = assignByUid.get(u.uid) || {}
    const rows = subjectsByUid.get(u.uid)?.[field] || []

    // 한 교사가 같은 학년 과목을 여러 개 맡을 수 있으므로 학년은 중복을 없앤다
    const teachingGrades = [...new Set(
      rows.map(r => Number(r?.grade)).filter(g => Number.isFinite(g)),
    )].sort((x, y) => x - y)

    return {
      uid: u.uid,
      name: u.name || '(이름 없음)',
      email: u.email || '',
      photoURL: u.photoURL || null,
      office: (a.office || '').trim(),
      department: (a.department || '').trim(),
      subject: (a.subject || '').trim(),
      positionLabel: (a.positionLabel || '').trim(),
      rank: deriveRank(a.positionLabel),
      isHomeroom: !!a.isHomeroom,
      homeroomGrade: a.homeroomGrade ?? null,
      homeroomClassNo: a.homeroomClassNo ?? null,
      teachingGrades,
    }
  })
}

/** 조건 선택기에 채울 보기 목록. 실제 데이터에 있는 값만 노출한다. */
export function collectFacets(members = []) {
  const distinct = (field) => [...new Set(
    members.map(m => m[field]).filter(v => v && String(v).trim()),
  )].sort((a, b) => String(a).localeCompare(String(b), 'ko'))

  const grades = [...new Set(members.flatMap(m => m.teachingGrades))].sort((a, b) => a - b)
  const homeroomGrades = [...new Set(
    members.filter(m => m.isHomeroom && m.homeroomGrade != null).map(m => m.homeroomGrade),
  )].sort((a, b) => a - b)

  // 직급은 데이터에 있는 것만 보여주되 관리자 → 부장 → 기획 → 일반 순서를 지킨다.
  // 가나다순이면 순서가 뒤섞여 고르는 순간마다 위치를 다시 찾아야 한다.
  const ranks = RANKS.filter(r => members.some(m => m.rank === r))

  return {
    offices: distinct('office'),
    departments: distinct('department'),
    subjects: distinct('subject'),
    ranks,
    teachingGrades: grades,
    homeroomGrades,
  }
}

/**
 * 화면에서 없앤 조건 종류.
 *
 *  - position(직책) : 직급과 거의 같은 대상을 뽑으면서 값만 열 몇 개로 흩어져 있었다.
 *  - office(사무실) : 업무 요청은 조직(부서·직급·교과)으로 나가지 앉은 자리로 나가지
 *    않는다. 사무실은 구성원 명단(rosterTree)에서 자리 확인·호출 기준으로만 쓴다.
 *
 * 이미 저장된 요청의 targetRule에는 남아 있을 수 있는데, 여기서 모르는 종류라고
 * 무시해버리면 조건 하나가 사라지면서 대상이 조용히 전체로 넓어진다.
 * 새로 만들 수는 없어도 판정은 예전 그대로 한다.
 */
const LEGACY_FIELDS = { position: 'positionLabel', office: 'office' }

/** 옛 요청의 조건을 문장으로 옮길 때 쓸 이름. 없으면 'office 2층 교무실'처럼 나온다. */
const LEGACY_LABELS = { position: '직책', office: '사무실' }

function matchesCondition(member, condition) {
  if (!condition || !condition.type) return true

  if (condition.type === 'homeroom') {
    if (condition.is === false) return !member.isHomeroom
    if (!member.isHomeroom) return false
    // 학년을 지정하지 않으면 전 학년 담임
    const grades = condition.grades || []
    return grades.length === 0 || grades.includes(member.homeroomGrade)
  }

  const values = (condition.values || []).filter(v => v !== '' && v != null)
  // 값을 하나도 고르지 않은 조건은 아직 작성 중인 것으로 보고 무시한다
  // (여기서 0명으로 만들어버리면 조건을 추가하는 순간 명단이 비어 당황하게 된다)
  if (values.length === 0) return true

  if (condition.type === 'teachingGrade') {
    return member.teachingGrades.some(g => values.includes(g))
  }

  const field = CONDITION_TYPES[condition.type]?.field || LEGACY_FIELDS[condition.type]
  if (!field) return true
  return values.includes(member[field])
}

/**
 * 조건 + 직접 추가/제외로 최종 대상을 뽑는다.
 *
 * 조건들은 AND(교집합), 한 조건 안의 값들은 OR로 본다.
 * 예) [수업학년 = 2] + [담임 = 아니오]  →  "2학년 수업에 들어가는 비담임"
 *
 * 순서는 (조건 통과 ∪ 직접 추가) − 직접 제외.
 * 직접 추가가 조건보다 우선인 이유는, 조건으로는 안 잡히는 예외 인원을 넣는 용도라서다.
 *
 * @param {object} rule { conditions: [], includeUids: [], excludeUids: [] }
 * @param {Array} members buildTargetMembers 결과
 * @returns {{ members: Array, uids: string[], warnings: string[] }}
 */
export function resolveTargets(rule = {}, members = []) {
  const conditions = (rule.conditions || []).filter(Boolean)
  const includeUids = new Set(rule.includeUids || [])
  const excludeUids = new Set(rule.excludeUids || [])

  // 조건이 없으면 전체가 대상이다. 다만 개별 지정만 한 경우에는 그 사람들만이어야 한다.
  // 빈 배열의 every()는 참이라 예전에는 조건이 없으면 늘 전원이 잡혔고, 개별 지정이
  // '전체에 더하기'가 되어 전체 교직원을 뺄 방법이 아예 없었다.
  const matchesAll = conditions.length > 0
    ? (m) => conditions.every(c => matchesCondition(m, c))
    : () => includeUids.size === 0

  const matched = members.filter(m => includeUids.has(m.uid) || matchesAll(m))
  const result = matched.filter(m => !excludeUids.has(m.uid))

  const warnings = []
  if (result.length === 0) {
    warnings.push('조건에 맞는 대상이 없습니다.')
  }
  if (conditions.length === 0 && includeUids.size === 0) {
    warnings.push('조건이 없어 전체 교직원이 대상입니다.')
  }
  // 명단에 없는 uid를 직접 추가/제외에 남겨두면 대상 수가 조용히 어긋난다
  const known = new Set(members.map(m => m.uid))
  const missing = [...includeUids, ...excludeUids].filter(uid => !known.has(uid))
  if (missing.length > 0) {
    warnings.push(`구성원 목록에 없는 대상 ${missing.length}명이 지정돼 있습니다.`)
  }

  return {
    members: [...result].sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    uids: result.map(m => m.uid),
    warnings,
  }
}

/** 조건을 사람이 읽는 문장으로. 요청 상세와 감사 기록에 그대로 남긴다. */
export function describeRule(rule = {}) {
  const parts = (rule.conditions || []).filter(Boolean).map(describeCondition).filter(Boolean)
  const includeCount = rule.includeUids?.length || 0
  const excludeCount = rule.excludeUids?.length || 0

  // 조건 없이 개별 지정만 하면 대상은 그 사람들뿐이다(resolveTargets와 같은 규칙).
  // 여기서 '전체 교직원'이라고 하면 실제 대상과 정반대로 읽힌다.
  if (parts.length === 0 && includeCount > 0) {
    const only = `개별 지정 ${includeCount}명`
    return excludeCount > 0 ? `${only} (제외 ${excludeCount}명)` : only
  }

  const base = parts.length > 0 ? parts.join(' · ') : '전체 교직원'

  const extra = []
  if (includeCount) extra.push(`직접 추가 ${includeCount}명`)
  if (excludeCount) extra.push(`제외 ${excludeCount}명`)

  return extra.length > 0 ? `${base} (${extra.join(', ')})` : base
}

function describeCondition(condition) {
  if (condition.type === 'homeroom') {
    if (condition.is === false) return '담임 아님'
    const grades = condition.grades || []
    return grades.length > 0 ? `${grades.join('·')}학년 담임` : '담임'
  }

  const values = (condition.values || []).filter(v => v !== '' && v != null)
  if (values.length === 0) return ''

  if (condition.type === 'teachingGrade') return `${values.join('·')}학년 수업 담당`
  if (condition.type === 'rank') return values.join('·')
  const label = CONDITION_TYPES[condition.type]?.label || LEGACY_LABELS[condition.type] || condition.type
  return `${label} ${values.join('·')}`
}
