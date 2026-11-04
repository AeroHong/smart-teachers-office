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
  detectEnrollmentLayout, suggestWorkInfo, folderOf, mergeProject, makeSolveLog, pushSolveLog, formatSolveLog,
  setGroupCount, freeCounts, hasFree, totalFree, maxPicks, matchSeparations, meetingReport,
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

// 교육부 수강신청 프로그램 원본과 같은 모양(가짜 이름): 1행 안내, 2행 학기, 3행 선택그룹, 4행 과목, 5행 고유번호,
// A~C열 1·2·3학년 학번(그 학년만 값, 나머지 0), D열 이름, E열 학생 고유번호, F열~ 0/1
const MOE_ROWS = [
  ['고유번호는 절대 변경하지 말고 …', null, null, null, null, null, null, null, null],
  ['1학년', '2학년', '3학년', '이름', '학기', '2-1', null, null, null],
  [null, null, null, null, '선택그룹', 'A', null, null, 'B'],
  [null, null, null, null, '과목', '물리학', '화학', '생명과학', '일본어'],
  [null, null, null, null, '고유번호', '2Y1ST100001', '2Y1ST100002', '2Y1ST100003', '2Y1ST100004'],
  [10101, 0, 0, '가나다', '3342M0000001', 1, 1, 0, 1],
  [10102, 0, 0, '라마바', '3342M0000002', 0, 1, 1, 1],
  [10103, 0, 0, '사아자', '3342M0000003', 0, 0, 0, 0],
]
const MOE_MERGES = [
  { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } }, { s: { r: 1, c: 0 }, e: { r: 4, c: 0 } },
  { s: { r: 1, c: 5 }, e: { r: 1, c: 8 } }, { s: { r: 2, c: 5 }, e: { r: 2, c: 7 } },
]

test('추출 — 교육부 원본 양식: 이름표로 과목·그룹·고유번호 행, 학번·이름 열을 찾는다', () => {
  const lay = detectEnrollmentLayout(MOE_ROWS, MOE_MERGES)
  assert.equal(lay.dataStart, 5)
  assert.deepEqual(lay.idCols, [0, 1, 2])
  assert.equal(lay.nameCol, 3)
  assert.equal(lay.subjectRow, 3)
  assert.equal(lay.blockRow, 2)
  assert.equal(lay.codeRow, 4)
  assert.deepEqual(lay.subjectCols, [5, 6, 7, 8])
  const p = parseEnrollmentRows(MOE_ROWS, MOE_MERGES)
  assert.deepEqual(p.subjects.map((s) => [s.name, s.block, s.code]), [
    ['물리학', 'A', '2Y1ST100001'], ['화학', 'A', '2Y1ST100002'], ['생명과학', 'A', '2Y1ST100003'], ['일본어', 'B', '2Y1ST100004']])
  assert.deepEqual(p.students, [{ id: '10101', subjects: [0, 1, 3] }, { id: '10102', subjects: [1, 2, 3] }])
  assert.deepEqual(p.excluded, [{ id: '10103', reason: '신청 과목 없음' }])
  assert.equal(p.names['10102'], '라마바')
  assert.equal(p.termLabel, '2-1')
  assert.equal(p.slotCount, 3)
})

test('추출 — 2학년 열에 학번이 있으면 그 값을 쓴다, 사람이 고친 행·열을 우선한다', () => {
  const rows = MOE_ROWS.map((r) => [...r])
  rows[5] = [0, 20101, 0, '가나다', '3342M0000001', 1, 1, 0, 1]
  const p = parseEnrollmentRows(rows, MOE_MERGES)
  assert.equal(p.students[0].id, '20101')
  // 과목 열을 앞 3개로 좁히기
  const q = parseEnrollmentRows(rows, MOE_MERGES, { lastCol: 7 })
  assert.deepEqual(q.subjects.map((s) => s.name), ['물리학', '화학', '생명과학'])
  // 이름 열 없음
  const r = parseEnrollmentRows(rows, MOE_MERGES, { nameCol: null })
  assert.deepEqual(r.names, {})
})

test('원본 양식 되돌리기 — 학생 정보 열(학번·이름·고유번호)을 살린다', () => {
  const pr = createProject(parseEnrollmentRows(MOE_ROWS, MOE_MERGES), { maxSize: 30 })
  const { rows } = neisExportRows(pr)
  assert.equal(rows.length, 8)
  assert.deepEqual(rows[5].slice(0, 5), [10101, 0, 0, '가나다', '3342M0000001'])
  assert.deepEqual(rows[7].slice(0, 5), [10103, 0, 0, '사아자', '3342M0000003'])
})

test('작업 정보 — 학년도 = 입학년도 + 학년 − 1, 작업명·묶음 기본값', () => {
  const a = suggestWorkInfo('2025입학생_수강신청일괄등록.xlsx', '3-1')
  assert.deepEqual([a.entryYear, a.year, a.grade, a.semester], [2025, 2027, 3, 1])
  assert.equal(a.title, '2027학년도 3학년 1학기 선택과목 분반')
  assert.equal(a.folder, '2025입학생')
  const b = suggestWorkInfo('2026입학생_수강신청일괄등록20261103 (1).xlsx', '2-1')
  assert.deepEqual([b.entryYear, b.year], [2026, 2027])
  const c = suggestWorkInfo('수강신청.xlsx', '2-2')
  assert.deepEqual([c.entryYear, c.year, c.grade], [null, null, 2])
  // 옛 작업: 학년도·학년으로 묶음 계산
  assert.equal(folderOf({ year: 2027, grade: 2 }), '2026입학생')
  assert.equal(folderOf({ folder: '내 묶음' }), '내 묶음')
  const pr = createProject(parseEnrollmentRows(MOE_ROWS, MOE_MERGES), { year: 2027, entryYear: 2026, title: 't' })
  assert.deepEqual([pr.year, pr.entryYear, pr.grade, pr.semester, pr.folder], [2027, 2026, 2, 1, '2026입학생'])
})

test('합치기 — 서로 다른 곳은 둘 다 남기고, 같은 곳은 최신본을 남기고 알린다', () => {
  const base = createProject(parseEnrollmentRows(MOE_ROWS, MOE_MERGES), { maxSize: 30, title: '처음' })
  // 나: 작업명·10101 신청 변경·분리 규칙 추가 / 다른 사람: 최대 인원·10102 배정·물리학 분반 수
  const mine = setStudentPicks({ ...base, title: '내 이름' }, '10101', [0, 2, 3])
  const mine2 = addSeparation(mine, ['10101', '10102'])
  const latest = resizeSections({ ...base, maxSize: 25, assignment: { ...base.assignment, 10102: [0, 0, 0] } }, 0, 2)
  const { project: m, conflicts } = mergeProject(base, mine2, latest)
  assert.equal(m.title, '내 이름')
  assert.equal(m.maxSize, 25)
  assert.deepEqual(m.requests['10101'], [0, 2, 3])
  assert.deepEqual(m.assignment['10102'], [0, 0, 0])
  assert.equal(m.subjects[0].sections, 2)
  assert.equal(m.separations.length, 1)
  assert.deepEqual(conflicts, [])

  // 같은 학생을 둘 다 고침 → 최신본
  const theirs = setStudentPicks(base, '10101', [1, 2, 3])
  const r = mergeProject(base, mine, theirs, (sid) => `학번 ${sid}`)
  assert.deepEqual(r.project.requests['10101'], [1, 2, 3])
  assert.equal(r.conflicts.length, 1)
  assert.match(r.conflicts[0], /학번 10101/)

  // 같은 과목의 서로 다른 항목: 분반 수(나) + 같은 그룹 금지(다른 사람) → 둘 다
  const a = resizeSections(base, 1, 2)
  const b = { ...base, subjects: base.subjects.map((s, i) => (i === 1 ? { ...s, distinctSlots: false } : s)) }
  const ab = mergeProject(base, a, b).project
  assert.equal(ab.subjects[1].sections, 2)
  assert.equal(ab.subjects[1].distinctSlots, false)
})

test('배정 기록 — 만들기·최근 5회·글로 내보내기(원본 줄은 기본 제외)', () => {
  const pr = createProject(parseEnrollmentRows(MOE_ROWS, MOE_MERGES), { maxSize: 30, title: '기록 시험', year: 2027 })
  const c = {
    title: '배정 실행', startedAt: Date.UTC(2026, 10, 4, 1, 2, 3),
    logs: [{ t: 10, type: 'local', text: '시작' }, { t: 500, type: 'raw', text: '#1 원본' }, { t: 900, type: 'done', text: '검사 통과' }],
    done: { ok: true, summary: '최적해' },
  }
  const log = makeSolveLog(pr, c, { byName: '홍길동', after: pr })
  assert.equal(log.settings.students, 2)
  assert.equal(log.result.subjects.length, 4)
  let p = pr
  for (let i = 0; i < 7; i++) p = pushSolveLog(p, { ...log, id: `l${i}` })
  assert.equal(p.solveLogs.length, 5)
  assert.equal(p.solveLogs[0].id, 'l2')
  const text = formatSolveLog(pr, log)
  assert.match(text, /기록 시험/)
  assert.match(text, /홍길동/)
  assert.match(text, /검사 통과/)
  assert.doesNotMatch(text, /#1 원본/)
  assert.match(formatSolveLog(pr, log, { raw: true }), /#1 원본/)
  // 합치기: 기록은 둘 다
  const m = mergeProject(pr, pushSolveLog(pr, { ...log, id: 'a', at: '2026-11-04T01:00:00Z' }), pushSolveLog(pr, { ...log, id: 'b', at: '2026-11-04T02:00:00Z' })).project
  assert.deepEqual(m.solveLogs.map((x) => x.id), ['a', 'b'])
})

test('공강 그룹 — 그룹 늘리기·공강 인원·하한은 학생 최대 과목 수', () => {
  const p = solvedProject()
  assert.equal(maxPicks(p), 3)
  assert.equal(hasFree(p), false)
  assert.equal(setGroupCount(p, 2), p)
  const p4 = setGroupCount(p, 4)
  assert.deepEqual(p4.slots, ['A', 'B', 'C', 'D'])
  assert.equal(hasFree(p4), true)
  assert.equal(totalFree(p4), 3)
  // 10102는 세계사·정치가 같은 B라 A·D가 비어 있다
  assert.deepEqual(freeCounts(p4), [1, 0, 0, 3])
})

test('공강 그룹 — 줄이면 없어진 그룹의 분반은 그룹 미정, 그 학생은 미배정', () => {
  let p4 = moveSectionSlot(setGroupCount(solvedProject(), 4), 3, 1, 3)
  p4 = { ...p4, assignment: { ...p4.assignment, 10101: [0, 0, 1] } }
  const p3 = setGroupCount(p4, 3)
  assert.deepEqual(p3.subjects[3].slotBySection, [2, null])
  assert.deepEqual(p3.assignment['10101'], [0, 0, null])
  assert.ok(validateProject(p3).unassigned.includes('10101'))
})

test('공강 최대 인원 — 검사와 솔버 입력(공강 없는 작업은 무시)', () => {
  const p4 = { ...setGroupCount(solvedProject(), 4), freeMax: 2 }
  assert.deepEqual(validateProject(p4).freeOver, [{ slot: 3, free: 3, limit: 2 }])
  assert.equal(toSolverInput(p4).freeMax, 2)
  const p = { ...solvedProject(), freeMax: 2 }
  assert.deepEqual(validateProject(p).freeOver, [])
  assert.equal(toSolverInput(p).freeMax, null)
  assert.equal(normalizeProject(solvedProject()).freeMax, null)
})

test('분리 규칙 가져오기 — 학번이 같으면 그대로, 바뀌었으면 이름으로, 동명이인·없음은 못 찾음', () => {
  const p = { ...solvedProject(), names: { 10101: '가', 10102: '나', 10103: '나' } }
  const r = matchSeparations([
    { id: 'r1', students: ['10101', '99999'], memo: '메모' },
    { id: 'r2', students: ['88888', '77777'] },
    { id: 'r3', students: ['20101', '66666'] },
  ], { 99999: '나', 20101: '가', 66666: '라' }, p)
  assert.deepEqual(r[0].students.map((x) => x.how), ['id', 'ambiguous'])
  assert.equal(r[0].ok, false)
  assert.deepEqual(r[1].students.map((x) => x.how), ['missing', 'missing'])
  assert.deepEqual(r[2].students.map((x) => x.how), ['name', 'missing'])

  const q = { ...solvedProject(), names: { 10101: '가', 10102: '나', 10103: '다' } }
  const m = matchSeparations([{ id: 'r1', students: ['20101', '20102'] }], { 20101: '가', 20102: '나' }, q)
  assert.deepEqual(m[0].ids, ['10101', '10102'])
  assert.equal(m[0].ok, true)
  const withRule = addSeparation(q, ['10102', '10101'])
  const d = matchSeparations([{ id: 'r1', students: ['20101', '20102'] }], { 20101: '가', 20102: '나' }, withRule)
  assert.equal(d[0].duplicate, true)
  assert.equal(d[0].ok, false)
})

test('회의 자료 — 배정표 격자·상태, 분리 규칙은 개수만', () => {
  const p = addSeparation(solvedProject(), ['10101', '10103'], '비밀')
  const r = meetingReport(p)
  assert.equal(r.groups.length, 3)
  assert.equal(r.cols.length, 4)
  assert.deepEqual(r.groups[0].cells[0], [{ k: 0, label: 'A', size: 2 }])
  assert.equal(r.status.conflicts, 1)
  assert.equal(r.status.separationRules, 1)
  assert.equal(JSON.stringify(r).includes('비밀'), false)
  assert.equal(r.showFree, false)
  assert.equal(meetingReport(setGroupCount(p, 4)).groups[3].free, 3)
})
