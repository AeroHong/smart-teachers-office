/**
 * 선택과목 분반 배정 순수 로직 검증.
 *   node --test apps/shared/lib/sectioning.test.js
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseEnrollmentRows, createProject, suggestSections, sectionSizes, sectionLabel, validateProject,
  moveOptions, setStudentSection, resizeSections, toSolverInput, applySolverResult, neisExportRows,
  rosterGroups, timetableSummary, balanceSummary, moveSectionSlot,
  normalizeProject, recalcSections, setStudentPicks, toggleStudentPick, addStudent, removeStudent, roomsOf,
  placementCheck, placementCheckIfMoved, quickAssign, resetAssignment, sizeIssues,
  separationIssues, addSeparation, updateSeparation, removeSeparation, balanceScore, compareScore, unassignedBySubject,
} from './sectioning.js'

// 실제 나이스 수강신청 일괄등록 파일과 같은 모양(1행 학년·학기, 2행 칸막이 병합, 3행 과목명)
const ROWS = [
  ['1학년', '2-2', null, null, null],
  [null, 'C', null, null, 'D'],
  [null, '기하', '세계사', '정치', '일본어'],
  [10101, 1, 1, null, 1],
  [10102, null, 1, 1, 1],
  [10103, 1, null, 1, 1],
  [10104, null, null, null, null],
]
const MERGES = [
  { s: { r: 0, c: 0 }, e: { r: 2, c: 0 } },
  { s: { r: 1, c: 1 }, e: { r: 1, c: 3 } },
  { s: { r: 0, c: 1 }, e: { r: 0, c: 4 } },
]

test('파싱 — 칸막이·과목·학생·선택 수·학기', () => {
  const p = parseEnrollmentRows(ROWS, MERGES)
  assert.deepEqual(p.subjects.map((s) => [s.name, s.block]), [['기하', 'C'], ['세계사', 'C'], ['정치', 'C'], ['일본어', 'D']])
  assert.equal(p.students.length, 3)
  assert.deepEqual(p.students[0], { id: '10101', subjects: [0, 1, 3] })
  assert.deepEqual(p.excluded, [{ id: '10104', reason: '신청 과목 없음' }])
  assert.equal(p.slotCount, 3)
  assert.equal(p.termLabel, '2-2')
  assert.equal(p.headerRows.length, 3)
  assert.deepEqual(p.subjectCols, [1, 2, 3, 4])
})

test('파싱 — 칸막이 행이 병합되지 않아도 왼쪽 값을 이어받는다', () => {
  const p = parseEnrollmentRows(ROWS, [])
  assert.deepEqual(p.subjects.map((s) => s.block), ['C', 'C', 'C', 'D'])
})

test('파싱 — 학번 행이 없으면 오류', () => {
  assert.throws(() => parseEnrollmentRows([['a'], ['b']]), /학번/)
})

test('분반 수 — 최대 인원 기준 올림, 최소 1, 그룹 수 상한', () => {
  assert.equal(suggestSections(50, 35), 2)
  assert.equal(suggestSections(70, 35), 2)
  assert.equal(suggestSections(71, 35), 3)
  assert.equal(suggestSections(9, 35), 1)
  assert.equal(suggestSections(0, 35), 0)
  assert.equal(suggestSections(140, 25, 5), 5)
})

function solvedProject() {
  const pr = createProject(parseEnrollmentRows(ROWS, MERGES), { maxSize: 2 })
  // 기하 1, 세계사 1, 정치 1, 일본어 2(→타임 수 3 상한) 분반
  let p = resizeSections(pr, 3, 2)
  p = applySolverResult(p, {
    sections: [
      { subject: '기하', index: 0, slot: 0 }, { subject: '세계사', index: 0, slot: 1 },
      { subject: '정치', index: 0, slot: 1 }, { subject: '일본어', index: 0, slot: 2 }, { subject: '일본어', index: 1, slot: 0 },
    ],
    assignments: {
      10101: { 기하: 0, 세계사: 0, 일본어: 0 },
      10102: { 세계사: 0, 정치: 0, 일본어: 0 },  // 세계사·정치 같은 타임 → 충돌
      10103: { 기하: 0, 정치: 0, 일본어: 0 },
    },
  })
  return p
}

test('결과 반영·검사 — 충돌 학생을 찾는다', () => {
  const p = solvedProject()
  const v = validateProject(p)
  assert.deepEqual(v.unassigned, [])
  assert.deepEqual(v.conflicts, ['10102'])
  assert.deepEqual(sectionSizes(p)[3], [3, 0])
})

test('분반 기호 — 타임 글자, 같은 타임 2분반이면 번호', () => {
  let p = solvedProject()
  assert.equal(sectionLabel(p, 3, 0), 'C')
  assert.equal(sectionLabel(p, 3, 1), 'A')
  p = moveSectionSlot(p, 3, 1, 2)
  assert.equal(sectionLabel(p, 3, 0), 'C1')
  assert.equal(sectionLabel(p, 3, 1), 'C2')
  assert.deepEqual(validateProject(p).sameSlot, [3])
})

test('수동 변경 — 충돌 나는 분반은 막고 이유를 준다', () => {
  const p = solvedProject()
  // 10101: 기하 A, 세계사 B, 일본어 C. 일본어 A분반(k=1)은 기하와 같은 타임
  const opts = moveOptions(p, '10101', 3)
  assert.equal(opts[0].current, true)
  assert.equal(opts[1].ok, false)
  assert.match(opts[1].reason, /기하/)
  const q = setStudentSection(p, '10103', 3, 1)
  assert.equal(q.assignment['10103'][2], 1)
  assert.deepEqual(q.manualStudents, ['10103'])
})

test('분반 수 줄이기 — 사라진 분반 학생은 미배정', () => {
  let p = solvedProject()
  p = setStudentSection(p, '10103', 3, 1)
  p = resizeSections(p, 3, 1)
  assert.deepEqual(validateProject(p).unassigned, ['10103'])
})

test('솔버 입력 — 고정·이전 타임', () => {
  let p = solvedProject()
  p = { ...p, lockedStudents: ['10101'] }
  p = { ...p, subjects: p.subjects.map((s, i) => (i === 0 ? { ...s, locked: true } : s)) }
  const input = toSolverInput(p, { keepPrevious: true })
  assert.deepEqual(input.subjects[0].sectionSlots, { 0: 0 })
  assert.deepEqual(input.lockedAssignments['10101'], { 기하: 0, 세계사: 0, 일본어: 0 })
  assert.deepEqual(input.lockedAssignments['10103'], { 기하: 0 })
  assert.deepEqual(input.previous['10102'], { 세계사: 1, 정치: 1, 일본어: 2 })
  assert.equal(input.students.length, 3)
})

test('나이스 양식 — 헤더 유지, 과목 칸에 기호, 제외 학생은 빈 행', () => {
  const { rows, merges } = neisExportRows(solvedProject())
  assert.equal(rows.length, 3 + 3 + 1)
  assert.deepEqual(rows[2], [null, '기하', '세계사', '정치', '일본어'])
  assert.deepEqual(rows[3], [10101, 'A', 'B', null, 'C'])
  assert.deepEqual(rows[6], [10104, null, null, null, null])
  assert.equal(merges.length, 3)
})

test('명단·타임표·균형 요약', () => {
  const p = solvedProject()
  const roster = rosterGroups(p)
  assert.deepEqual(roster.find((g) => g.subject === '기하').students, ['10101', '10103'])
  const tt = timetableSummary(p)
  assert.deepEqual(tt[1].sections.map((x) => x.subject), ['세계사', '정치'])
  assert.equal(balanceSummary(p)[3].spread, 3)
})

test('수동 변경 — 겹치는 과목을 비는 타임으로 옮길 수 있으면 맞바꾸기 제안', () => {
  let p = resizeSections(solvedProject(), 0, 2)
  p = moveSectionSlot(p, 0, 1, 2)            // 기하 2분반을 C에
  const opts = moveOptions(p, '10101', 3)     // 10101: 기하 A, 세계사 B, 일본어 C
  assert.equal(opts[1].ok, false)             // 일본어 A는 기하 A와 겹침
  assert.deepEqual({ s: opts[1].swap.s, k: opts[1].swap.k }, { s: 0, k: 1 })  // 기하를 C로 옮기면 됨
})

test('옛 문서 맞추기 — 목표 인원·교실 수 숫자', () => {
  const base = solvedProject()
  const p = normalizeProject({ ...base, maxSize: undefined, defaultTarget: 25, rooms: 8,
    subjects: base.subjects.map((x) => ({ ...x, maxSize: undefined, target: 20 })) })
  assert.equal(p.maxSize, 25)
  assert.deepEqual(p.rooms, [null, null, null])   // 교실 수 제한은 쓰지 않음
  assert.equal(p.subjects[0].maxSize, 20)
})

test('그룹별 교실 수 — 그룹마다 따로 초과 검사', () => {
  const p = { ...solvedProject(), rooms: [5, 1, 5] }   // B그룹엔 세계사·정치 2분반
  assert.deepEqual(validateProject(p).roomOverflow.map((x) => x.slot), [1])
  assert.deepEqual(toSolverInput(p).rooms, [5, 1, 5])
  assert.deepEqual(roomsOf({ slots: ['A', 'B'], rooms: null }), [null, null])
})

test('분반 수 다시 계산 — 직접 고친 과목은 건너뛰고, force면 모두', () => {
  let p = { ...solvedProject(), maxSize: 1 }
  p = { ...p, subjects: p.subjects.map((x, i) => (i === 1 ? { ...x, sectionsManual: true } : x)) }
  const q = recalcSections(p)
  assert.equal(q.subjects[0].sections, 2)      // 기하 2명 / 최대 1명
  assert.equal(q.subjects[1].sections, 1)      // 직접 고친 세계사는 그대로
  assert.equal(recalcSections(p, { force: true }).subjects[1].sections, 2)
})

test('신청 고치기 — 남는 과목 배정 유지, 비면 제외, 추가·삭제', () => {
  let p = solvedProject()
  p = toggleStudentPick(p, '10101', 2)          // 정치 추가
  assert.deepEqual(p.requests['10101'], [0, 1, 2, 3])
  assert.deepEqual(p.assignment['10101'], [0, 0, null, 0])
  p = setStudentPicks(p, '10101', [])
  assert.equal(p.requests['10101'], undefined)
  assert.ok(p.excluded.some((x) => x.id === '10101'))
  p = toggleStudentPick(p, '10101', 0)
  assert.deepEqual(p.requests['10101'], [0])
  assert.ok(!p.excluded.some((x) => x.id === '10101'))
  p = addStudent(p, '10999')
  assert.ok(p.excluded.some((x) => x.id === '10999'))
  p = removeStudent(p, '10999')
  assert.ok(!p.excluded.some((x) => x.id === '10999'))
})

test('빠른 판정 — 그룹 배치로 배정 불가한 학생, 옮겼을 때 미리 보기', () => {
  const p = solvedProject()                     // 기하 A, 세계사 B, 정치 B, 일본어 C·A
  const c = placementCheck(p)
  assert.equal(c.count, 1)                      // 10102: 세계사·정치가 둘 다 B
  assert.deepEqual(c.blocked[0].sids, ['10102'])
  assert.equal(placementCheckIfMoved(p, 2, 0, 0), 1)   // 정치를 A로 옮기면 이번엔 10103(기하 A와 겹침)
})

test('빠른 재배정 — 충돌 학생을 풀고 고정 학생은 그대로', () => {
  let p = moveSectionSlot(solvedProject(), 2, 0, 2)    // 정치 C로 → 10102는 일본어 A로 풀림, 10103은 B에 둘 과목이 없음
  p = { ...p, lockedStudents: ['10101'] }
  const r = quickAssign(p)
  const v = validateProject(r.project)
  assert.deepEqual(v.conflicts, [])
  assert.deepEqual(r.unassigned, ['10103'])
  assert.deepEqual(r.project.assignment['10102'], [0, 0, 1])   // 세계사 B, 정치 C, 일본어 A
  assert.deepEqual(r.project.assignment['10101'], p.assignment['10101'])
})

test('배정 초기화 — 설정은 두고 그룹 배치·배정·고정만 지운다', () => {
  let p = { ...solvedProject(), lockedStudents: ['10101'], manualStudents: ['10102'], lastSolve: { ok: true } }
  p = { ...p, subjects: p.subjects.map((x, i) => (i === 0 ? { ...x, locked: true, maxSize: 20 } : x)) }
  const r = resetAssignment(p)
  assert.ok(r.subjects.every((x) => x.slotBySection.every((t) => t === null) && !x.locked))
  assert.equal(r.subjects[0].maxSize, 20)
  assert.equal(r.subjects[3].sections, 2)
  assert.deepEqual(validateProject(r).unassigned.length, 3)
  assert.deepEqual([r.lockedStudents, r.manualStudents, r.lastSolve], [[], [], null])
  assert.deepEqual(r.requests, p.requests)
})

test('분반 최대·최소 인원 — 솔버 입력과 검사(최소는 나눈 과목만)', () => {
  let p = { ...solvedProject(), maxSize: 2, maxMode: 'hard', minSize: 1, minMode: 'soft' }
  const input = toSolverInput(p)
  assert.equal(input.maxMode, 'hard')
  assert.equal(input.subjects[0].maxSize, 2)
  assert.equal(input.subjects[0].minSize, 1)
  // 일본어(2분반): A분반 0명 → 최소 미달, C분반 3명 → 최대 초과
  const issues = sizeIssues(p)
  assert.deepEqual(issues.map((x) => [x.s, x.k, x.kind]).sort(), [[3, 0, 'over'], [3, 1, 'under']])
  p = { ...p, maxMode: 'off' }
  assert.deepEqual(sizeIssues(p).map((x) => x.kind), ['under'])
})

test('분리 규칙 — 위반 찾기, 1분반 과목은 분리 불가로', () => {
  // 10101·10103: 기하(1분반 → 분리 불가), 일본어(2분반, 둘 다 k=0 → 위반)
  let p = addSeparation(solvedProject(), ['10101', '10103'], '생활지도')
  const sep = separationIssues(p)
  assert.deepEqual(sep.violations.map((x) => [x.s, x.k, x.students]), [[3, 0, ['10101', '10103']]])
  assert.deepEqual(sep.unsplittable.map((x) => x.s), [0])
  assert.equal(validateProject(p).ok, false)
  assert.equal(toSolverInput(p).separations[0].length, 2)
  // 학생 창: 10103 일본어를 A분반(k=1)로는 옮길 수 있고, 10101과 같은 k=0이면 막혀야 한다
  p = setStudentSection(p, '10103', 3, 1)
  assert.deepEqual(separationIssues(p).violations, [])
  const opts = moveOptions(p, '10103', 3)
  assert.match(opts[0].reason, /분리 대상 10101/)
})

test('분리 규칙 — 빠른 재배정이 규칙을 지킨다, 학생 삭제·규칙 편집', () => {
  // 과목 하나(2분반, 같은 그룹 허용), 학생 3명. s1·s2가 처음에 같은 분반 → 규칙이 있으면 떼어 놓는다
  const base = {
    slots: ['A'], maxSize: 30, subjects: [{ name: 'X', block: 'C', sections: 2, distinctSlots: false, slotBySection: [0, 0], lockedSections: [false, false], locked: false }],
    requests: { s1: [0], s2: [0], s3: [0] }, assignment: { s1: [0], s2: [0], s3: [1] },
    lockedStudents: [], manualStudents: [], excluded: [], separations: [],
  }
  assert.equal(quickAssign(base).project.assignment.s1[0], quickAssign(base).project.assignment.s2[0])  // 규칙 없으면 그대로(이미 2:1 균형)
  const withRule = addSeparation(base, ['s1', 's2'])
  const r = quickAssign(withRule).project
  assert.notEqual(r.assignment.s1[0], r.assignment.s2[0])
  assert.deepEqual(separationIssues(r).violations, [])
  let q = addSeparation(solvedProject(), ['10101', '10102', '10103'])
  q = removeStudent(q, '10102')
  assert.deepEqual(q.separations[0].students, ['10101', '10103'])
  q = removeStudent(q, '10103')
  assert.deepEqual(q.separations, [])
  let w = addSeparation(solvedProject(), ['10101', '10102'])
  w = updateSeparation(w, w.separations[0].id, { memo: '메모' })
  assert.equal(w.separations[0].memo, '메모')
  assert.deepEqual(removeSeparation(w, w.separations[0].id).separations, [])
})

test('최대 인원 꼭 지킴 — 편차가 작아도 넘는 배정은 진다, 빠른 재배정도 넘기지 않는다', () => {
  const a = { hard: 0, soft: 0, worst: 3, sum: 20 }
  const b = { hard: 2, soft: 0, worst: 1, sum: 5 }
  assert.ok(compareScore(a, b) < 0)
  // 과목 X 2분반(같은 그룹), 학생 4명, 최대 2명 꼭 지킴 — 처음에 3:1이면 2:2로
  const base = {
    slots: ['A'], maxSize: 2, maxMode: 'hard', minMode: 'off', separations: [],
    subjects: [{ name: 'X', block: 'C', sections: 2, distinctSlots: false, slotBySection: [0, 0], lockedSections: [false, false], locked: false }],
    requests: { s1: [0], s2: [0], s3: [0], s4: [0] }, assignment: { s1: [0], s2: [0], s3: [0], s4: [1] },
    lockedStudents: [], manualStudents: [], excluded: [],
  }
  assert.equal(balanceScore(base).hard, 1)
  const r = quickAssign(base).project
  assert.deepEqual(sectionSizes(r)[0], [2, 2])
  assert.equal(balanceScore(r).hard, 0)
})

test('과목별 미배정 — 분반 없음·그룹 미정·사라진 분반', () => {
  let p = solvedProject()
  assert.deepEqual(unassignedBySubject(p), [])
  p = resizeSections(p, 3, 1)                          // 일본어 2→1분반: k=1에 있던 학생 없음, 모두 k=0이라 그대로
  p = setStudentSection(p, '10101', 0, null)           // 10101 기하 미배정
  p = moveSectionSlot(p, 2, 0, null)                   // 정치 분반 그룹 미정 → 10102·10103 정치 미배정
  const r = unassignedBySubject(p)
  assert.deepEqual(r.map((x) => [x.name, x.count]), [['정치', 2], ['기하', 1]])
  assert.deepEqual(r[0].students, ['10102', '10103'])
})
