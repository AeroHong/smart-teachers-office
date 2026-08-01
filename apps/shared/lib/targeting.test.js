/**
 * 대상 지정 엔진 검증.
 *   node --test apps/shared/lib/targeting.test.js
 *
 * 화면 없이 돌릴 수 있게 Firestore 의존을 뺀 이유가 이 파일이다. 대상이 틀리면 누군가
 * 마감을 놓치는데, 그건 화면을 눈으로 봐서는 잡히지 않는다.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildTargetMembers, collectFacets, deriveRank, describeRule, resolveTargets } from './targeting.js'

// 선유고를 축소한 가상 교직원 6명
const users = [
  { uid: 'u1', name: '김국어' },
  { uid: 'u2', name: '이수학' },
  { uid: 'u3', name: '박영어' },
  { uid: 'u4', name: '최과학' },
  { uid: 'u5', name: '정체육' },
  { uid: 'u6', name: '한행정' },
]

const assignments = [
  { uid: 'u1', office: '1교무실', department: '교무부', subject: '국어', positionLabel: '부장교사', isHomeroom: true, homeroomGrade: 2 },
  { uid: 'u2', office: '1교무실', department: '연구부', subject: '수학', positionLabel: '', isHomeroom: true, homeroomGrade: 2 },
  { uid: 'u3', office: '2교무실', department: '교무부', subject: '영어', positionLabel: '', isHomeroom: false },
  { uid: 'u4', office: '2교무실', department: '연구부', subject: '과학', positionLabel: '', isHomeroom: false },
  { uid: 'u5', office: '2교무실', department: '체육부', subject: '체육', positionLabel: '부장교사', isHomeroom: true, homeroomGrade: 1 },
  { uid: 'u6', office: '행정실', department: '행정실', subject: '', positionLabel: '', isHomeroom: false },
]

const teacherSubjects = [
  { teacherUid: 'u1', semester1Subjects: [{ subjectName: '문학', grade: 2, classes: [1, 2] }] },
  { teacherUid: 'u2', semester1Subjects: [{ subjectName: '수학I', grade: 2 }, { subjectName: '수학II', grade: 3 }] },
  { teacherUid: 'u3', semester1Subjects: [{ subjectName: '영어I', grade: 2 }] },
  { teacherUid: 'u4', semester1Subjects: [{ subjectName: '통합과학', grade: 1 }] },
  { teacherUid: 'u5', semester1Subjects: [{ subjectName: '체육', grade: 1 }, { subjectName: '체육', grade: 2 }] },
  // u6(행정실)은 수업이 없다
]

const members = buildTargetMembers({ users, assignments, teacherSubjects, semester: 1 })
const namesOf = (result) => result.members.map(m => m.name)

test('수업 학년은 teacherSubjects에서 중복 없이 뽑힌다', () => {
  const byUid = Object.fromEntries(members.map(m => [m.uid, m]))
  assert.deepEqual(byUid.u2.teachingGrades, [2, 3])
  assert.deepEqual(byUid.u5.teachingGrades, [1, 2])  // 같은 과목 두 학년 → 중복 제거
  assert.deepEqual(byUid.u6.teachingGrades, [])      // 수업 없음
})

test('조건이 없으면 전체 교직원이 대상이고 경고가 붙는다', () => {
  const result = resolveTargets({}, members)
  assert.equal(result.uids.length, 6)
  assert.ok(result.warnings.some(w => w.includes('전체 교직원')))
})

test('2학년 수업에 들어가는 비담임 — 조건 두 개의 교집합', () => {
  const rule = {
    conditions: [
      { type: 'teachingGrade', values: [2] },
      { type: 'homeroom', is: false },
    ],
  }
  // 2학년 수업: u1,u2,u3,u5 / 그중 비담임: u3만 (u1·u2는 2학년 담임, u5는 1학년 담임)
  assert.deepEqual(namesOf(resolveTargets(rule, members)), ['박영어'])
  assert.equal(describeRule(rule), '2학년 수업 담당 · 담임 아님')
})

test('2학년 담임만', () => {
  const rule = { conditions: [{ type: 'homeroom', is: true, grades: [2] }] }
  assert.deepEqual(namesOf(resolveTargets(rule, members)), ['김국어', '이수학'])
  assert.equal(describeRule(rule), '2학년 담임')
})

test('담임 조건에 학년을 안 주면 전 학년 담임', () => {
  const rule = { conditions: [{ type: 'homeroom', is: true }] }
  assert.deepEqual(namesOf(resolveTargets(rule, members)), ['김국어', '이수학', '정체육'])
})

test('한 조건 안의 여러 값은 OR', () => {
  const rule = { conditions: [{ type: 'department', values: ['교무부', '체육부'] }] }
  assert.deepEqual(namesOf(resolveTargets(rule, members)), ['김국어', '박영어', '정체육'])
})

test('부장 지정 — 주간 계획서 요청 같은 경우', () => {
  const rule = { conditions: [{ type: 'rank', values: ['부장'] }] }
  assert.deepEqual(namesOf(resolveTargets(rule, members)), ['김국어', '정체육'])
})

test('화면에서 없앤 직책 조건도 옛 요청에서는 그대로 판정된다', () => {
  // 조건을 모른다고 무시하면 대상이 조용히 전체로 넓어진다
  const rule = { conditions: [{ type: 'position', values: ['부장교사'] }] }
  assert.deepEqual(namesOf(resolveTargets(rule, members)), ['김국어', '정체육'])
  assert.equal(describeRule(rule), '직책 부장교사')
})

test('직접 추가는 조건을 통과하지 못해도 포함된다', () => {
  const rule = {
    conditions: [{ type: 'department', values: ['교무부'] }],
    includeUids: ['u6'],   // 행정실 직원을 예외로 넣는다
  }
  assert.deepEqual(namesOf(resolveTargets(rule, members)), ['김국어', '박영어', '한행정'])
})

test('직접 제외는 조건과 직접 추가보다 우선한다', () => {
  const rule = {
    conditions: [{ type: 'department', values: ['교무부'] }],
    includeUids: ['u6'],
    excludeUids: ['u6', 'u1'],
  }
  assert.deepEqual(namesOf(resolveTargets(rule, members)), ['박영어'])
})

test('값을 아직 고르지 않은 조건은 명단을 비우지 않는다', () => {
  // 조건을 추가한 직후 값이 비어 있을 때 0명이 되면, 쓰는 사람이 당황한다
  const rule = { conditions: [{ type: 'department', values: [] }] }
  assert.equal(resolveTargets(rule, members).uids.length, 6)
})

test('대상이 0명이면 경고한다', () => {
  const rule = { conditions: [{ type: 'department', values: ['없는부서'] }] }
  const result = resolveTargets(rule, members)
  assert.equal(result.uids.length, 0)
  assert.ok(result.warnings.some(w => w.includes('대상이 없습니다')))
})

test('명단에 없는 uid를 지정하면 경고한다', () => {
  const result = resolveTargets({ includeUids: ['없는사람'] }, members)
  assert.ok(result.warnings.some(w => w.includes('구성원 목록에 없는')))
})

test('결과는 이름 가나다순으로 정렬된다', () => {
  const result = resolveTargets({ conditions: [{ type: 'department', values: ['연구부', '체육부'] }] }, members)
  assert.deepEqual(namesOf(result), ['이수학', '정체육', '최과학'])
})

test('화면에서 없앤 사무실 조건도 옛 요청에서는 그대로 판정된다', () => {
  const rule = { conditions: [{ type: 'office', values: ['2교무실'] }] }
  assert.deepEqual(namesOf(resolveTargets(rule, members)), ['박영어', '정체육', '최과학'])
  assert.equal(describeRule(rule), '사무실 2교무실')   // 'office 2교무실'로 새면 안 된다
})

test('보기 목록은 실제 데이터에 있는 값만 담는다', () => {
  const facets = collectFacets(members)
  assert.deepEqual(facets.offices, ['1교무실', '2교무실', '행정실'])  // 구성원 명단이 쓴다
  assert.deepEqual(facets.ranks, ['부장', '일반'])          // 직책 없는 사람은 일반
  assert.deepEqual(facets.teachingGrades, [1, 2, 3])
  assert.deepEqual(facets.homeroomGrades, [1, 2])
})

test('describeRule은 직접 추가·제외까지 문장에 남긴다', () => {
  const rule = {
    conditions: [{ type: 'subject', values: ['국어'] }],
    includeUids: ['u6'],
    excludeUids: ['u1'],
  }
  assert.equal(describeRule(rule), '교과 국어 (직접 추가 1명, 제외 1명)')
})

test('2학기 기준으로 보면 수업 학년이 달라진다', () => {
  const twoSemesters = [
    { teacherUid: 'u1', semester1Subjects: [{ subjectName: '문학', grade: 2 }], semester2Subjects: [{ subjectName: '독서와작문', grade: 3 }] },
  ]
  const sem2 = buildTargetMembers({
    users: [{ uid: 'u1', name: '김국어' }], assignments, teacherSubjects: twoSemesters, semester: 2,
  })
  assert.deepEqual(sem2[0].teachingGrades, [3])
})


// ── 직급 (선유고 실제 직책 이름을 그대로 씀) ─────────────────
test('직책 이름이 달라도 부장으로 묶인다', () => {
  const heads = ['교무부장', '연구부장', '3학년부장', '인문사회교육부장', '창의예체교육부장', '진로상담복지부장']
  heads.forEach(label => assert.equal(deriveRank(label), '부장', label))
})

test('교장·교감은 관리자', () => {
  assert.equal(deriveRank('교장'), '관리자')
  assert.equal(deriveRank('교감'), '관리자')
})

test('직책이 없으면 일반 — 교사와 행정직을 이 값으로는 구분할 수 없다', () => {
  assert.equal(deriveRank(''), '일반')
  assert.equal(deriveRank(null), '일반')
  assert.equal(deriveRank('  '), '일반')
})

test("'기획'이 들어가면 기획", () => {
  assert.equal(deriveRank('교무기획'), '기획')
  assert.equal(deriveRank('연구기획'), '기획')
  assert.equal(deriveRank('인문사회교육기획'), '기획')
})

test('기획부장은 기획이 아니라 부장 — 위 규칙이 먼저 걸린다', () => {
  // '교무기획부장'은 기획과 부장을 다 갖고 있다. 부장단 안내에서 빠지면 안 된다
  assert.equal(deriveRank('교무기획부장'), '부장')
  assert.equal(deriveRank('연구기획부장'), '부장')
})

test('부장단 = 직급 하나로 관리자와 부장을 함께 (열두 번 고르지 않아도 된다)', () => {
  const staff = [
    { uid: 'p', name: '교장' }, { uid: 'v', name: '교감' },
    { uid: 'h1', name: '교무부장' }, { uid: 'h2', name: '3학년부장' },
    { uid: 't1', name: '평교사' },
  ]
  const assigns = [
    { uid: 'p', positionLabel: '교장' }, { uid: 'v', positionLabel: '교감' },
    { uid: 'h1', positionLabel: '교무부장' }, { uid: 'h2', positionLabel: '3학년부장' },
    { uid: 't1', positionLabel: '' },
  ]
  const list = buildTargetMembers({ users: staff, assignments: assigns, teacherSubjects: [], semester: 1 })

  const rule = { conditions: [{ type: 'rank', values: ['관리자', '부장'] }] }
  const result = resolveTargets(rule, list)
  assert.deepEqual(result.members.map(m => m.name), ['3학년부장', '교감', '교무부장', '교장'])
  assert.equal(describeRule(rule), '관리자·부장')

  // 부장만 따로도 뽑힌다
  assert.equal(resolveTargets({ conditions: [{ type: 'rank', values: ['부장'] }] }, list).uids.length, 2)
})

test('직급 보기 목록은 관리자 → 부장 → 기획 → 일반 순서를 지킨다', () => {
  const list = buildTargetMembers({
    users: ['a', 'b', 'c', 'd'].map(uid => ({ uid, name: uid.toUpperCase() })),
    assignments: [
      { uid: 'a', positionLabel: '' },
      { uid: 'b', positionLabel: '교무부장' },
      { uid: 'c', positionLabel: '교감' },
      { uid: 'd', positionLabel: '연구기획' },
    ],
    teacherSubjects: [], semester: 1,
  })
  assert.deepEqual(collectFacets(list).ranks, ['관리자', '부장', '기획', '일반'])
})
