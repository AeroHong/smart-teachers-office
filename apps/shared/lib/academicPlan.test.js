/**
 * 학사일정 계산 엔진 검증.
 *   node --test apps/shared/lib/academicPlan.test.js
 *
 * 기준값은 2026학년도 학사일정 엑셀에 손으로 적혀 있던 수업일수다. 엔진이 다른 값을 내는 세 칸은
 * 일정을 하나하나 세어 보면 엑셀 쪽이 틀린 것이라 엔진 값으로 고정하고 이유를 적어 둔다.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  addDays, buildWeekRows, classifyDay, computeStats, describeDiff, diffEvents, eventDisplayTitle,
  makeContext, mondayIndex, rollEventsToNextYear, rowsForSemester, semesterRanges, shiftEvent,
} from './academicPlan.js'
import { plan2026 } from './academicPlan.fixture2026.js'

const stats = computeStats(plan2026)
const s = (g, no) => stats.grades[g][no]

test('날짜 — 요일·더하기', () => {
  assert.equal(mondayIndex('2026-03-02'), 0) // 월
  assert.equal(mondayIndex('2026-03-08'), 6) // 일
  assert.equal(addDays('2026-02-28', 1), '2026-03-01')
  assert.equal(addDays('2027-02-28', 1), '2027-03-01')
})

test('학기 범위 — 개학~방학식, 개학~종업식/졸업식', () => {
  assert.deepEqual(semesterRanges(plan2026, 1), {
    1: { start: '2026-03-03', end: '2026-07-16' },
    2: { start: '2026-08-14', end: '2027-01-08' },
  })
  assert.deepEqual(semesterRanges({ events: [] }, 1), { 1: null, 2: null })
})

test('1학기 — 엑셀과 같은 요일별 수업일·정기고사일 (전 학년)', () => {
  for (const g of [1, 2, 3]) {
    assert.deepEqual(s(g, 1).schoolDays, [18, 19, 18, 19, 19])
    assert.deepEqual(s(g, 1).exams, [2, 2, 2, 2, 2])
  }
})

test('1학기 전일행사 — 금요일은 2일(엑셀은 1로 잘못 셈)', () => {
  // 5/15(금) 예술창작한마당/소풍, 7/16(목→금요일 수업) 방학식. 엑셀 각주에도 둘 다 전일행사로 적혀 있다
  assert.deepEqual(s(1, 1).fullDays, [0, 1, 0, 1, 2])
  assert.deepEqual(s(1, 1).actual, [16, 16, 16, 16, 15])
})

test('1학기 실수업일 금요일 15 → 16회 미만 경고', () => {
  const w = stats.warnings.filter((x) => x.semester === 1)
  assert.deepEqual(w.map((x) => [x.grade, x.weekday, x.actual]), [[1, 4, 15], [2, 4, 15], [3, 4, 15]])
})

test('1학기 중간-기말 사이 — 실수업일 기준 (엑셀 목 7·금 8은 오기)', () => {
  // 목: 4/29~6/30 목요일 9일 + 5/13(수→목요일 수업) − 5/14 스포츠한마당 = 9
  // 금: 금요일 8일 − 5/15 예술창작한마당 = 7
  assert.deepEqual(s(1, 1).between, [7, 8, 7, 9, 7])
})

test('2학기 1·2학년 — 엑셀과 일치', () => {
  for (const g of [1, 2]) {
    assert.deepEqual(s(g, 2).schoolDays, [18, 20, 19, 20, 20])
    assert.deepEqual(s(g, 2).exams, [2, 3, 2, 2, 1])
    assert.deepEqual(s(g, 2).fullDays, [0, 0, 1, 1, 3])
  }
})

test('2학기 3학년 — 일부 학년 재량휴업(11/19)으로 목요일 21', () => {
  assert.deepEqual(s(3, 2).schoolDays, [18, 20, 19, 21, 20])
  // 체험교육활동(1,2)은 3학년에 해당 없음 — 엑셀은 1·2학년 값(금 3)을 그대로 옮겨 적었다
  assert.deepEqual(s(3, 2).fullDays, [0, 0, 0, 1, 2])
})

test('토요일 행사는 수업일에 들어가지 않는다', () => {
  const d = classifyDay(makeContext(plan2026), 1, '2026-05-09')
  assert.equal(d.schoolDay, false)
  assert.equal(d.semester, 1)
})

test('요일 교체 — 5/13(수)은 목요일로 센다', () => {
  assert.equal(classifyDay(makeContext(plan2026), 1, '2026-05-13').weekday, 3)
})

test('창체 시수 — 학년·학기별 합산', () => {
  assert.deepEqual(s(1, 1).activities, { 자율: 13, 동아리: 2 })
  assert.deepEqual(s(1, 2).activities, { 자율: 1, 동아리: 8 })
})

test('격자 — 월 경계 주는 두 줄, 주차는 개학 주가 1', () => {
  const rows = buildWeekRows(plan2026)
  const march = rows.filter((r) => r.month === 3)
  assert.equal(march[0].weekNo, null) // 3/1(일)만 있는 줄 — 개학 전 주
  assert.equal(march[1].weekNo, 1)
  assert.equal(march[1].schoolDays, 4) // 3/2 대체휴일
  const split = rows.filter((r) => r.monday === '2026-03-30')
  assert.deepEqual(split.map((r) => [r.month, r.weekNo, r.schoolDays]), [[3, 5, 2], [4, 5, 3]])
  assert.ok(rowsForSemester(rows, 1).every((r) => r.month >= 3 && r.month <= 7))
})

test('일정 이동·다음 학년도 복제', () => {
  const e = { id: 'x', date: '2026-04-22', endDate: '2026-04-24', title: '중간고사', kind: '정기고사' }
  assert.deepEqual(shiftEvent(e, '2026-04-23'), { ...e, date: '2026-04-23', endDate: '2026-04-25' })
  const rolled = rollEventsToNextYear([e, { id: 'h', date: '2026-05-01', kind: '공휴일' }], 2027)
  assert.deepEqual(rolled.map((x) => [x.date, mondayIndex(x.date)]), [['2027-04-21', 2]])
})

test('표시 제목 — 창체 시수·대상 학년 접미사', () => {
  assert.equal(eventDisplayTitle({ title: '체험교육활동', grades: [1, 2], activities: [{ type: '자율', hours: 6 }] }), '자율6h 체험교육활동(1,2)')
  assert.equal(eventDisplayTitle({ title: '방학식', grades: [], activities: [] }), '방학식')
})

test('일정 차이 — 추가·삭제·이동·수정', () => {
  const a = [{ id: '1', date: '2026-05-14', title: '스포츠한마당' }, { id: '2', date: '2026-06-01', title: '건강검진' }]
  const b = [{ id: '1', date: '2026-05-15', title: '스포츠한마당' }, { id: '3', date: '2026-06-02', title: '특강' }]
  assert.deepEqual(describeDiff(diffEvents(a, b)), [
    "6/2(화) '특강' 추가", "6/1(월) '건강검진' 삭제", "'스포츠한마당' 5/14(목) → 5/15(금) 이동",
  ])
})

test('동시 편집 병합 — 서로 다른 일정은 둘 다 반영, 같은 일정 충돌은 최신본 유지', async () => {
  const { mergePlanData } = await import('./academicPlan.js')
  const e = (id, date, title = id) => ({ id, date, title })
  const base = { events: [e('a', '2027-03-02'), e('b', '2027-04-01'), e('c', '2027-05-01')] }
  const mine = { events: [e('a', '2027-03-03'), e('b', '2027-04-02'), e('n', '2027-06-01')] } // a·b 이동, c 삭제, n 추가
  const latest = { events: [e('a', '2027-03-02'), e('b', '2027-04-09'), e('c', '2027-05-01'), e('x', '2027-07-01')] } // 남이 b 이동, x 추가
  const r = mergePlanData(base, mine, latest)
  const byId = Object.fromEntries(r.events.map((x) => [x.id, x.date]))
  assert.deepEqual(byId, { a: '2027-03-03', b: '2027-04-09', x: '2027-07-01', n: '2027-06-01' })
  assert.equal(r.conflicts.length, 1)
})
