/**
 * 업무분장 만들기 순수 로직 검증.
 *   node --test apps/shared/lib/dutyPlan.test.js
 *
 * 기준값은 2026학년도 업무분장 hwpx(결재 첨부본) 그대로다 — 부서 10개, 카드 54장, 끝줄 인원 요약
 * "전체 교원 50명(교장, 교감 2명 포함) ■ 학년부 21 + 3(특수) = 24명 ■ 일반 부서 21 + 3(사서, 보건, 영양) = 24명".
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  addDepartment, addDuty, duplicateDuty, moveTasks, swapTasks, clearAssignees, moveAssignee, unlinkedNames, splitDepartments, pickDepartments, addTask, findTask, moveTask, normalizeTasks, planData, removeDutyKeepTasks, removeTask, updateTask, yearOverYear, removeDuty, approvalRows, headRoster, nameWithSubject, assignDuty, linkPerson, mergeStaffPool, setSubjectHead, staffLoad, wishSummary, wishersOf, applyNameMatches, assignmentChanges, clonePlanData, describeDataDiff, diffAssignments,
  groupPlan, homeroomSlots, interpretDutyTables, isSharedStage, joinTasks, mergeDutyPlan, moveDuty, parseHomeroomMark,
  parseNameSubject, planStage, removeDepartment, roleTypeOf, setHomeroom, shiftDepartment, splitTasks, staffKindOf,
  summarizeStaff, summaryLine, updateDuty, validatePlan,
} from './dutyPlan.js'
import { dutyTables2026 } from './dutyPlan.fixture2026.js'

const p2026 = interpretDutyTables(dutyTables2026)
const dept = (name) => p2026.departments.find((d) => d.name === name)
const cardsOf = (data, name) => data.duties.filter((d) => d.deptId === data.departments.find((x) => x.name === name)?.id)

test('표기 — 직급·직군·담임 칸·이름(과목)', () => {
  assert.equal(roleTypeOf('부장'), '부장')
  assert.equal(roleTypeOf('교무기획'), '기획')
  assert.equal(roleTypeOf('고사1'), '일반')
  assert.equal(staffKindOf('3'), '교사')
  assert.equal(staffKindOf('특수'), '교사')
  assert.equal(staffKindOf('교육실무사(교무)'), '교육실무사(교무)')
  assert.equal(parseHomeroomMark('2담'), 2)
  assert.equal(parseHomeroomMark('비'), null)
  assert.deepEqual(parseNameSubject('신진영(도덕・윤리)'), { name: '신진영', subject: '도덕・윤리' })
  assert.deepEqual(parseNameSubject('이서정'), { name: '이서정', subject: '' })
})

test('세부 업무 — 괄호 안 쉼표는 자르지 않는다', () => {
  const t = splitTasks('정기고사(부) 진행, 정기고사 고사실 배치 및 관리(선택과목 고사실 좌석배치 및 관리, 무시험 학생 배치 및 관리),  방송담당 ')
  assert.deepEqual(t, ['정기고사(부) 진행', '정기고사 고사실 배치 및 관리(선택과목 고사실 좌석배치 및 관리, 무시험 학생 배치 및 관리)', '방송담당'])
  assert.equal(joinTasks(t).split(', ').length, 4) // 괄호 안 쉼표 하나 포함
})

test('2026 hwpx — 부서 10개·구분·카드 수', () => {
  assert.deepEqual(p2026.departments.map((d) => d.name), [
    '교무기획부', '교육연구부', '안전인성부', '진로상담복지부', '인문사회교육부', '과학정보부', '창의예체교육부',
    '1학년부', '2학년부', '3학년부',
  ])
  assert.equal(dept('창의예체교육부').category, '교무행정지원') // 두 번째 표에서 이어진 구분
  assert.equal(dept('1학년부').category, '교육활동')
  assert.equal(p2026.duties.length, 54)
  assert.equal(cardsOf(p2026, '교무기획부').length, 9)
  assert.equal(cardsOf(p2026, '3학년부').length, 7)
  assert.deepEqual(p2026.warnings, [])
})

test('2026 hwpx — 카드 내용', () => {
  const g2 = cardsOf(p2026, '교무기획부').find((d) => d.title === '고사2')
  assert.equal(g2.assigneeName, '하승철')
  assert.equal(g2.slotLabel, '7')
  assert.equal(g2.tasks.length, 3)
  const head = cardsOf(p2026, '교무기획부')[0]
  assert.equal(head.roleType, '부장')
  assert.equal(head.assigneeName, '홍창기')
  const staff = cardsOf(p2026, '교무기획부').find((d) => d.assigneeName === '박밀양')
  assert.equal(staff.staffKind, '교육실무사(교무)')
  assert.equal(staff.title, '학적')
  assert.ok(new Set(p2026.duties.map((d) => d.dutyKey)).size === 54, 'dutyKey는 카드마다 다르다')
})

test('2026 hwpx — 담임·부담임·교과부장', () => {
  assert.equal(p2026.homerooms.length, 24)
  const h = p2026.homerooms.find((x) => x.grade === 2 && x.classNo === 4)
  assert.equal(h.homeroomName, '신진영')
  assert.equal(h.subHomeroomName, '강혜련')
  const sp = p2026.homerooms.find((x) => x.grade === 3 && x.classNo === '특수')
  assert.equal(sp.homeroomName, '안경숙')
  assert.equal(sp.subHomeroomName, '')
  assert.equal(p2026.subjectHeads.length, 8)
  assert.deepEqual(p2026.subjectHeads.find((s) => s.group === '예술체육과'), { group: '예술체육과', uid: null, name: '이정근', note: '음악, 미술, 체육' })
  assert.equal(p2026.staffPool.find((p) => p.name === '홍창기').subject, '물리')
})

test('2026 hwpx — 끝줄 인원 요약이 원본과 같다', () => {
  const s = summarizeStaff(p2026)
  assert.equal(s.grade, 24)
  assert.equal(s.special, 3)
  assert.equal(s.general, 24)
  assert.equal(s.generalNonSubject, 3)
  assert.equal(summaryLine(s, { admins: 2 }),
    '◯ 전체 교원 50명(교장, 교감 2명 포함)   ■ 학년부 : 21 + 3(특수) = 24명    ■ 일반 부서 : 21 + 3(사서, 보건, 영양) = 24명')
})

test('단계', () => {
  assert.equal(planStage({}), 'draft')
  assert.equal(planStage({ stage: 'review' }), 'review')
  assert.equal(isSharedStage('draft'), false)
  assert.equal(isSharedStage('review'), true)
  assert.equal(isSharedStage('confirmed'), true)
})

test('묶기 — 구분 → 부서 순서, 보관함 따로', () => {
  const g = groupPlan(moveDuty(p2026, p2026.duties[0].id, ''))
  assert.deepEqual(g.categories.map((c) => c.category), ['교무행정지원', '교육활동'])
  assert.equal(g.categories[0].departments.length, 7)
  assert.equal(g.tray.length, 1)
  assert.equal(g.categories[0].departments[0].duties.length, 8)
})

test('카드 이동 — 다른 부서의 자리로, 같은 부서 순서 바꾸기', () => {
  const card = cardsOf(p2026, '교무기획부').find((d) => d.title === '고사2')
  const moved = moveDuty(p2026, card.id, dept('3학년부').id, 1)
  const g3 = cardsOf(moved, '3학년부').sort((a, b) => a.order - b.order)
  assert.equal(g3.length, 8)
  assert.equal(g3[1].id, card.id)
  assert.deepEqual(g3.map((d) => d.order), [0, 1, 2, 3, 4, 5, 6, 7])
  assert.equal(cardsOf(moved, '교무기획부').length, 8)
  // 같은 부서 안 맨 앞으로
  const first = moveDuty(moved, card.id, dept('3학년부').id, 0)
  assert.equal(cardsOf(first, '3학년부').sort((a, b) => a.order - b.order)[0].id, card.id)
})

test('부서 추가·삭제(카드는 보관함으로)·순서', () => {
  const { data, dept: d } = addDepartment(p2026, { name: '혁신부', category: '교무행정지원' })
  assert.equal(d.order, 7)
  const { data: withCard } = addDuty(data, d.id, { title: '혁신기획' })
  const removed = removeDepartment(withCard, d.id)
  assert.equal(removed.departments.length, 10)
  assert.equal(groupPlan(removed).tray.map((x) => x.title).join(), '혁신기획')
  const shifted = shiftDepartment(p2026, dept('교육연구부').id, -1)
  assert.equal(groupPlan(shifted).categories[0].departments[0].name, '교육연구부')
})

test('담임 칸 — 격자·고치기', () => {
  const slots = homeroomSlots(p2026, { 1: 7, 2: 7, 3: 7 }, { 1: true, 2: true, 3: true })
  assert.equal(slots.length, 24)
  const next = setHomeroom(p2026, 1, 1, 'sub', { uid: 'u1', name: '김새봄' })
  const h = next.homerooms.find((x) => x.grade === 1 && x.classNo === 1)
  assert.equal(h.subHomeroomName, '김새봄')
  assert.equal(h.homeroomName, '하고운')
})

test('점검 — 부서 겹침·업무 없는 교직원·부장 없는 부서', () => {
  let data = applyNameMatches(p2026, new Map([['홍창기', 'u-hong']]))
  const card = cardsOf(data, '3학년부').find((d) => d.title === '진학')
  data = updateDuty(data, card.id, { assigneeUid: 'u-hong', assigneeName: '홍창기' })
  data = { ...data, staffPool: [...data.staffPool, { uid: 'u-new', name: '신규전입' }] }
  const head = cardsOf(data, '교육연구부').find((d) => d.roleType === '부장')
  data = updateDuty(data, head.id, { roleType: '일반' })
  const texts = validatePlan(data).map((w) => w.text)
  assert.ok(texts.some((t) => t.startsWith('홍창기: 부서 2곳(교무기획부·3학년부)')))
  assert.ok(texts.some((t) => t.includes('업무가 없는 교직원') && t.includes('신규전입') && t.includes('민나영')))
  assert.ok(texts.includes('교육연구부: 부장 카드가 없습니다.'))
})

test('수정 기록 요약', () => {
  const card = cardsOf(p2026, '교무기획부').find((d) => d.title === '고사2')
  const after = updateDuty(moveDuty(p2026, card.id, dept('3학년부').id), card.id, { tasks: [{ id: 'x', key: 'x', text: '정기고사 진행' }] })
  const lines = describeDataDiff(p2026, after)
  assert.ok(lines.includes("'고사2' 교무기획부 → 3학년부 이동"))
  assert.ok(lines.includes("'고사2' 수정 (주요 업무 내용)"))
})

test('동시 편집 병합 — 다른 카드는 둘 다 살리고, 같은 카드 충돌은 최신본', () => {
  const [a, b] = p2026.duties
  const mine = updateDuty(p2026, a.id, { note: '내 메모' })
  const latest = updateDuty(p2026, b.id, { note: '남 메모' })
  const m = mergeDutyPlan(p2026, mine, latest)
  assert.equal(m.duties.find((d) => d.id === a.id).note, '내 메모')
  assert.equal(m.duties.find((d) => d.id === b.id).note, '남 메모')
  assert.deepEqual(m.conflicts, [])
  const clash = mergeDutyPlan(p2026, mine, updateDuty(p2026, a.id, { note: '다른 메모' }))
  assert.equal(clash.duties.find((d) => d.id === a.id).note, '다른 메모')
  assert.equal(clash.conflicts.length, 1)
})

test('복제 — 카드 id는 새로, dutyKey는 유지, 업무분장안은 담당자 비움', () => {
  const c = clonePlanData(p2026, { keepAssignees: false })
  assert.equal(c.duties.length, 54)
  assert.ok(c.duties.every((d, i) => d.id !== p2026.duties[i].id && d.dutyKey === p2026.duties[i].dutyKey))
  assert.ok(c.duties.every((d) => !d.assigneeName && !d.assigneeUid))
  assert.equal(c.homerooms.length, 0)
  assert.equal(groupPlan(c).categories[1].departments[2].duties.length, 7) // 부서 연결이 새 id로 이어진다
})

test('비교 — 사람 기준 이동표', () => {
  const card = cardsOf(p2026, '교무기획부').find((d) => d.title === '고사2')
  const after = moveDuty(p2026, card.id, dept('3학년부').id)
  const d = diffAssignments(p2026, after)
  assert.equal(d.length, 1)
  assert.deepEqual(d[0], { key: 'name:하승철', name: '하승철', before: ['교무기획부 고사2'], after: ['3학년부 고사2'] })
})

test('확정 반영 — 바뀌는 칸만, uid 없는 이름은 건너뜀', () => {
  const data = applyNameMatches(p2026, new Map([['홍창기', 'u-hong'], ['하승철', 'u-ha'], ['김한결', 'u-kim']]))
  const current = new Map([
    ['u-hong', { department: '교무기획부', positionLabel: '교무기획부장', duty: '부장', isHomeroom: false, homeroomGrade: null, homeroomClassNo: null, isSubHomeroom: true, subHomeroomGrade: 2, subHomeroomClassNo: 5 }],
  ])
  const { changes, skipped } = assignmentChanges(data, current)
  assert.ok(!changes.some((c) => c.uid === 'u-hong'), '홍창기는 그대로라 반영할 것이 없다')
  const ha = changes.find((c) => c.uid === 'u-ha')
  assert.deepEqual(ha.fields.department, { from: null, to: '교무기획부' })
  assert.deepEqual(ha.fields.homeroomClassNo, { from: null, to: 6 })
  assert.equal(ha.fields.positionLabel, undefined, '부장이 아니면 직함은 빈 값 — 처음부터 비어 있으면 바뀐 것이 아니다')
  const kim = changes.find((c) => c.uid === 'u-kim')
  assert.deepEqual(kim.fields.subHomeroomGrade, { from: null, to: 1 })
  assert.ok(skipped.includes('민나영'))
  // 부장을 내려놓으면 직함을 비우고, 부장과 무관한 직함은 그대로
  const cur2 = new Map([['u-ha', { positionLabel: '교무기획부장' }], ['u-kim', { positionLabel: '수석교사' }]])
  const r2 = assignmentChanges(data, cur2)
  assert.deepEqual(r2.changes.find((c) => c.uid === 'u-ha').fields.positionLabel, { from: '교무기획부장', to: '' })
  assert.equal(r2.changes.find((c) => c.uid === 'u-kim').fields.positionLabel, undefined)
})

test('업무 나누기 — 바로 뒤에 새 키로, 원래 키를 기억', () => {
  const card = cardsOf(p2026, '교무기획부').find((d) => d.title === '교무기획')
  const { data, duty } = duplicateDuty(p2026, card.id)
  const list = cardsOf(data, '교무기획부').sort((a, b) => a.order - b.order)
  assert.equal(list.length, 10)
  assert.equal(list[card.order + 1].id, duty.id)
  assert.notEqual(duty.dutyKey, card.dutyKey)
  assert.deepEqual(duty.prevKeys, [card.dutyKey])
  assert.equal(duty.assigneeName, '')
  assert.equal(duty.tasks.length, 0) // 업무 내용은 카드로 옮긴다
})

test('인원 배치 — 카드·명단·이름 자리 잇기', () => {
  const blank = clonePlanData(p2026, { keepAssignees: false })
  const card = blank.duties.find((d) => d.title === '고사1')
  let data = mergeStaffPool({ ...blank, staffPool: [] }, [{ uid: 'u1', name: '김윤아', subject: '수학' }, { name: '전입교사' }])
  data = assignDuty(data, card.id, { name: '전입교사' })
  const load = staffLoad(data)
  assert.equal(load.length, 2)
  assert.equal(load.find((l) => l.person.name === '전입교사').duties.length, 1)
  assert.equal(load.find((l) => l.person.uid === 'u1').duties.length, 0)
  data = linkPerson(data, '전입교사', 'u9')
  assert.equal(data.duties.find((d) => d.id === card.id).assigneeUid, 'u9')
  assert.equal(data.staffPool.find((p) => p.name === '전입교사').uid, 'u9')
  data = setSubjectHead(data, '국어과', { uid: 'u1', name: '김윤아' })
  assert.equal(data.subjectHeads.find((x) => x.group === '국어과').name, '김윤아')
})

test('희망원 — 카드별 지망자(나눈 카드는 원래 키로도), 미제출자', () => {
  const card = p2026.duties.find((d) => d.title === '고사1')
  const { data, duty: split } = duplicateDuty(p2026, card.id)
  const wishes = [
    { uid: 'a', name: '가', choices: [{ rank: 2, dutyKey: card.dutyKey }] },
    { uid: 'b', name: '나', choices: [{ rank: 1, dutyKey: card.dutyKey }, { rank: 2, dutyKey: 'x' }] },
  ]
  assert.deepEqual(wishersOf(card, wishes).map((w) => w.name), ['나', '가'])
  assert.equal(wishersOf(split, wishes).length, 2)
  const s = wishSummary(data, wishes, [{ uid: 'a' }, { uid: 'b' }, { uid: 'c', name: '다' }])
  assert.equal(s.submitted, 2)
  assert.deepEqual(s.missing.map((m) => m.uid), ['c'])
})

test('결재 첨부 표 — 원본과 같은 병합·번호·담임 칸', () => {
  const rows = approvalRows(p2026)
  assert.equal(rows.length, 54)
  assert.equal(rows[0].categorySpan, 36) // 교무행정지원 7개 부서 9+3+6+3+5+4+6
  assert.equal(rows[0].deptSpan, 9)
  assert.equal(rows.filter((r) => r.categorySpan).length, 2)
  const g2 = rows.find((r) => r.title === '고사2')
  assert.deepEqual([g2.slotLabel, g2.name, g2.mark], ['7', '하승철', '2담'])
  const staff = rows.find((r) => r.name === '박밀양')
  assert.deepEqual([staff.slotLabel, staff.mark], ['교육실무사(교무)', ''])
  assert.equal(rows.find((r) => r.name === '조성은').mark, '비')
  assert.equal(rows.find((r) => r.name === '이서정').mark, '1담') // 특수학급 담임
  const heads = headRoster(p2026)
  assert.deepEqual(heads[0], { deptId: dept('교무기획부').id, dept: '교무기획부', name: '홍창기', subject: '물리', note: '' })
  assert.equal(nameWithSubject(p2026, null, '하고운'), '하고운(국어)')
  // 카드를 옮기면 번호를 다시 매긴다
  const moved = moveDuty(p2026, p2026.duties.find((d) => d.title === '고사2').id, dept('3학년부').id, 0)
  const r3 = approvalRows(moved).filter((r) => r.dept === '3학년부')
  assert.deepEqual(r3.slice(0, 3).map((r) => r.slotLabel), ['1', '2', '3'])
})

test('작년 대비 변경 — 신설·폐지·이동·이름·담당 교체·나눔', () => {
  let next = clonePlanData(p2026, { keepAssignees: true })
  const g2 = next.duties.find((d) => d.title === '고사2')
  const g1 = next.duties.find((d) => d.title === '고사1')
  const lib = next.duties.find((d) => d.title === '사서')
  next = moveDuty(next, g2.id, next.departments.find((d) => d.name === '3학년부').id)
  next = updateDuty(next, g1.id, { title: '정기고사', assigneeName: '홍길동' })
  next = removeDuty(next, lib.id)
  next = addDuty(next, next.departments[0].id, { title: 'AI 교육' }).data
  next = duplicateDuty(next, g1.id).data
  const y = yearOverYear(p2026, next)
  assert.deepEqual(y.moved, [{ title: '고사2', from: '교무기획부', to: '3학년부' }])
  assert.deepEqual(y.renamed, [{ dept: '교무기획부', from: '고사1', to: '정기고사' }])
  assert.deepEqual(y.handover, [{ title: '정기고사', dept: '교무기획부', before: '김윤아', after: '홍길동' }])
  assert.deepEqual(y.removed, [{ title: '사서', dept: '인문사회교육부' }])
  assert.deepEqual(y.added, [{ title: 'AI 교육', dept: '교무기획부' }])
  assert.deepEqual(y.split, [{ title: '정기고사 (나눔)', dept: '교무기획부', from: '교무기획부 고사1' }])
})

test('업무 내용 카드 — 줄 사이로 옮기기·같은 줄 순서·추가·고치기·지우기', () => {
  const g1 = p2026.duties.find((d) => d.title === '고사1')
  const g2 = p2026.duties.find((d) => d.title === '고사2')
  const card = g1.tasks[1]
  let data = moveTask(p2026, card.id, g2.id, 0)
  assert.equal(data.duties.find((d) => d.id === g1.id).tasks.length, g1.tasks.length - 1)
  assert.equal(data.duties.find((d) => d.id === g2.id).tasks[0].key, card.key, '옮겨도 key(기록)는 그대로')
  // 같은 줄 안에서 뒤로: 0번을 2번 자리(2번 앞)로 → [1, 0, 2…]
  const ids = g1.tasks.map((x) => x.id)
  const re = moveTask(p2026, ids[0], g1.id, 2).duties.find((d) => d.id === g1.id).tasks.map((x) => x.id)
  assert.deepEqual(re.slice(0, 3), [ids[1], ids[0], ids[2]])
  // 보관함으로
  data = moveTask(data, card.id, '')
  assert.equal(data.looseTasks[0].id, card.id)
  assert.equal(findTask(data, card.id).dutyId, '')
  const { data: d2, task } = addTask(data, g1.id, '새 업무')
  assert.equal(d2.duties.find((d) => d.id === g1.id).tasks.at(-1).text, '새 업무')
  const d3 = updateTask(d2, task.id, { text: '고친 업무' })
  assert.equal(findTask(d3, task.id).task.text, '고친 업무')
  assert.equal(findTask(removeTask(d3, task.id), task.id), null)
  // 줄을 지우면 카드는 보관함으로
  const d4 = removeDutyKeepTasks(p2026, g1.id)
  assert.equal(d4.looseTasks.length, g1.tasks.length)
})

test('예전 저장본(문자열 tasks)도 같은 카드로 읽힌다', () => {
  const old = { id: 'd1', dutyKey: 'k1', tasks: ['가', '나'] }
  assert.deepEqual(normalizeTasks(old), [{ id: 'd1~0', key: 'k1~0', text: '가' }, { id: 'd1~1', key: 'k1~1', text: '나' }])
  assert.deepEqual(normalizeTasks(old), normalizeTasks(old))
  assert.equal(planData({ duties: [old] }).duties[0].tasks[1].text, '나')
})

test('두 쪽 보기 — 부서 경계에서 줄 수가 고르게', () => {
  const [a, b] = splitDepartments(p2026)
  const rows = (ids) => approvalRows(pickDepartments(p2026, ids)).length
  assert.equal(a.size + b.size, 10)
  assert.ok(Math.abs(rows(a) - rows(b)) <= 6, `${rows(a)} / ${rows(b)}`)
  assert.equal(rows(a) + rows(b), 54)
  assert.equal(approvalRows(pickDepartments(p2026, b))[0].categorySpan > 0, true) // 2쪽 첫 줄에도 구분 칸
})

test('이름 카드 — 옮기기·맞바꾸기·복사, 계정 없는 이름', () => {
  const g1 = p2026.duties.find((d) => d.title === '고사1')
  const g2 = p2026.duties.find((d) => d.title === '고사2')
  const sw = moveAssignee(p2026, g1.id, g2.id)
  assert.equal(sw.duties.find((d) => d.id === g2.id).assigneeName, '김윤아')
  assert.equal(sw.duties.find((d) => d.id === g1.id).assigneeName, '하승철')
  const empty = assignDuty(p2026, g2.id, null)
  const mv = moveAssignee(empty, g1.id, g2.id)
  assert.equal(mv.duties.find((d) => d.id === g1.id).assigneeName, '')
  const cp = moveAssignee(empty, g1.id, g2.id, { copy: true })
  assert.equal(cp.duties.find((d) => d.id === g1.id).assigneeName, '김윤아')
  assert.ok(unlinkedNames(p2026).includes('이서정'))
  assert.ok(!unlinkedNames(applyNameMatches(p2026, new Map([['이서정', 'u']]))).includes('이서정'))
})

test('카드 여러 장 옮기기·맞바꾸기', () => {
  const g1 = p2026.duties.find((d) => d.title === '고사1')
  const g2 = p2026.duties.find((d) => d.title === '고사2')
  const ids = [g1.tasks[0].id, g1.tasks[2].id]
  const m = moveTasks(p2026, ids, g2.id, 1)
  const t2 = m.duties.find((d) => d.id === g2.id).tasks.map((t) => t.id)
  assert.deepEqual(t2.slice(1, 3), ids)
  assert.equal(m.duties.find((d) => d.id === g1.id).tasks.length, g1.tasks.length - 2)
  // 같은 줄 안에서 뒤로: 0,1번을 4번 자리(옮기기 전 기준) 앞으로
  const same = moveTasks(p2026, [g1.tasks[0].id, g1.tasks[1].id], g1.id, 4).duties.find((d) => d.id === g1.id).tasks.map((t) => t.id)
  assert.deepEqual(same.slice(0, 4), [g1.tasks[2].id, g1.tasks[3].id, g1.tasks[0].id, g1.tasks[1].id])
  const sw = swapTasks(p2026, g1.tasks[0].id, g2.tasks[1].id)
  assert.equal(sw.duties.find((d) => d.id === g1.id).tasks[0].id, g2.tasks[1].id)
  assert.equal(sw.duties.find((d) => d.id === g2.id).tasks[1].id, g1.tasks[0].id)
})

test('이름 일괄 빼기 — 고른 부서만, 담임은 고를 때만', () => {
  const ids = new Set([dept('교무기획부').id])
  const c = clearAssignees(p2026, { deptIds: ids })
  assert.ok(cardsOf(c, '교무기획부').every((d) => !d.assigneeName))
  assert.ok(cardsOf(c, '3학년부').every((d) => d.assigneeName))
  assert.equal(c.homerooms[0].homeroomName, '하고운')
  const all = clearAssignees(p2026, { homerooms: true, subjectHeads: true })
  assert.ok(all.duties.every((d) => !d.assigneeName) && all.homerooms.every((h) => !h.homeroomName) && all.subjectHeads.every((s) => !s.name))
})
