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
  office: { label: '사무실', field: 'office' },
  department: { label: '부서', field: 'department' },
  subject: { label: '교과', field: 'subject' },
  position: { label: '직책', field: 'positionLabel' },
  teachingGrade: { label: '수업 학년', field: 'teachingGrades' },
  homeroom: { label: '담임 여부' },
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
      office: (a.office || '').trim(),
      department: (a.department || '').trim(),
      subject: (a.subject || '').trim(),
      positionLabel: (a.positionLabel || '').trim(),
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

  return {
    offices: distinct('office'),
    departments: distinct('department'),
    subjects: distinct('subject'),
    positions: distinct('positionLabel'),
    teachingGrades: grades,
    homeroomGrades,
  }
}

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

  const field = CONDITION_TYPES[condition.type]?.field
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

  const matched = members.filter(m =>
    includeUids.has(m.uid) || conditions.every(c => matchesCondition(m, c)),
  )
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
  const base = parts.length > 0 ? parts.join(' · ') : '전체 교직원'

  const extra = []
  if (rule.includeUids?.length) extra.push(`직접 추가 ${rule.includeUids.length}명`)
  if (rule.excludeUids?.length) extra.push(`제외 ${rule.excludeUids.length}명`)

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
  return `${CONDITION_TYPES[condition.type]?.label || condition.type} ${values.join('·')}`
}
