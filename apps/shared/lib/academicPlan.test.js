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
  isTrayEvent, makeContext, mondayIndex, placeTrayEvent, rollEventsToNextYear, rowsForSemester, semesterRanges, shiftEvent,
  unscheduleEvent, isNoProgress, eventsToCards, neisRowsToEvents, splitExamEvent, importPrevCards, mergeDeptColors, sameWeekdayNextYear, addConfirmation, currentConfirmation, isEventLocked, markFrameEvents, planStage, relockEvents,
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
  assert.equal(eventDisplayTitle({ title: '요일교체', kind: '요일교체', weekdaySwap: 3 }), '요일교체(목요일 수업)')
  assert.equal(eventDisplayTitle({ title: '목요일 시간표', kind: '요일교체', weekdaySwap: 3 }), '목요일 시간표')
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

test('보관함 카드 — 계산에서 빠지고, 놓으면 기간을 되살린다', () => {
  const span = { id: 's', date: '2026-03-09', endDate: '2026-03-13', title: '상담주간', kind: '일반', grades: [], activities: [] }
  const card = unscheduleEvent(span)
  assert.equal(card.date, '')
  assert.equal(card.endDate, undefined)
  assert.equal(card.spanDays, 5)
  assert.ok(isTrayEvent(card))
  const placed = placeTrayEvent(card, '2026-04-06')
  assert.equal(placed.endDate, '2026-04-10')
  assert.equal(placed.spanDays, undefined)
  assert.equal(placeTrayEvent({ id: 'x', date: '', title: 'a' }, '2026-04-06').endDate, undefined)

  const plan = { year: 2026, holidays: [], events: [
    { id: 'o', date: '2026-03-03', title: '개학', kind: '개학', grades: [], activities: [] },
    { id: 'b', date: '2026-07-16', title: '방학식', kind: '방학식', grades: [], activities: [] },
    { ...card, kind: '정기고사', examType: '중간', activities: [{ type: '자율', hours: 5, grades: [] }] },
  ] }
  const s = computeStats(plan).grades[1][1]
  assert.equal(s.exams.reduce((a, b) => a + b, 0), 0)
  assert.equal(s.activities.자율, 0)
  assert.deepEqual(describeDiff(diffEvents([span], [card])), ["'상담주간' 3/9(월) → 보관함 이동"])
  assert.deepEqual(rollEventsToNextYear([card], 2027), [card])
})

test('단계 — 주요 일정 확정 때 큰 일정·전일행사가 잠기고, 잠금 해제한 일정만 고칠 수 있다', () => {
  const events = [
    { id: 'o', date: '2026-03-03', kind: '개학', title: '개학' },
    { id: 'x', date: '2026-04-22', kind: '정기고사', title: '중간고사' },
    { id: 'f', date: '2026-05-14', kind: '일반', title: '스포츠한마당', fullDay: true },
    { id: 'n', date: '2026-04-08', kind: '일반', title: '교직원회의' },
    { id: 't', date: '', kind: '정기고사', title: '보관 카드' },
  ]
  assert.equal(planStage({}), 'frame')
  assert.equal(planStage({ stage: 'detail' }), 'detail')
  assert.equal(planStage({ stage: 'detail', status: 'confirmed' }), 'final')

  const framed = markFrameEvents(events)
  assert.deepEqual(framed.filter((e) => e.frame).map((e) => e.id), ['o', 'x', 'f'])
  assert.equal(framed.some((e) => isEventLocked(e, 'frame')), false)
  assert.deepEqual(framed.filter((e) => isEventLocked(e, 'detail')).map((e) => e.id), ['o', 'x', 'f'])
  assert.deepEqual(framed.filter((e) => isEventLocked(e, 'final')).map((e) => e.id), ['o', 'x', 'f', 'n'])

  const opened = framed.map((e) => (e.id === 'x' ? { ...e, unlocked: true } : e))
  assert.equal(isEventLocked(opened.find((e) => e.id === 'x'), 'detail'), false)
  const relocked = relockEvents(opened)
  assert.equal(isEventLocked(relocked.find((e) => e.id === 'x'), 'detail'), true)
  assert.equal(relocked.find((e) => e.id === 'x').frame, true)
})

test('확정 판 — 다시 확정하면 새 판, 이전 판은 변경됨', () => {
  let list = addConfirmation([], { stage: 'frame', versionNo: 3, at: 1, by: { uid: 'a' } })
  list = addConfirmation(list, { stage: 'frame', versionNo: 7, at: 2, by: { uid: 'a' } })
  list = addConfirmation(list, { stage: 'final', versionNo: 12, at: 3, by: { uid: 'a' } })
  assert.deepEqual(list.map((c) => [c.stage, c.no, Boolean(c.superseded)]), [['frame', 1, true], ['frame', 2, false], ['final', 1, false]])
  assert.equal(currentConfirmation(list, 'frame').versionNo, 7)
  assert.equal(currentConfirmation(list, 'final').no, 1)
})

test('수정 기록 — 잠금 해제·다시 잠금, 필드 이름은 한글', () => {
  const x = { id: 'x', date: '2026-04-22', title: '중간고사', kind: '정기고사', frame: true }
  assert.deepEqual(describeDiff(diffEvents([x], [{ ...x, unlocked: true }])), ["4/22(수) '중간고사' 잠금 해제"])
  assert.deepEqual(describeDiff(diffEvents([{ ...x, unlocked: true }], [{ ...x, title: '1학기 중간고사' }])),
    ["4/22(수) '1학기 중간고사' 다시 잠금", "4/22(수) '1학기 중간고사' 수정 (이름)"])
})

test('지난 학년도 일정을 카드로 — 공휴일·요일교체 빼고, 작년 날짜를 남긴다', () => {
  const cards = eventsToCards([
    { id: 'a', date: '2026-05-14', title: '스포츠한마당', kind: '일반', fullDay: true, frame: true },
    { id: 'b', date: '2026-03-09', endDate: '2026-03-13', title: '상담주간', kind: '일반' },
    { id: 'h', date: '2026-05-25', title: '대체공휴일', kind: '공휴일' },
    { id: 's', date: '2026-05-13', title: '목요일 수업', kind: '요일교체', weekdaySwap: 3 },
    { id: 't', date: '', title: '보관 카드', kind: '일반' },
  ])
  assert.deepEqual(cards.map((c) => c.id), ['a', 'b', 't'])
  assert.equal(cards[0].date, '')
  assert.equal(cards[0].prevDate, '2026-05-14')
  assert.equal(cards[0].frame, undefined)
  assert.equal(cards[1].spanDays, 5)
  assert.equal(sameWeekdayNextYear('2026-05-14'), '2027-05-13')
  assert.equal(mondayIndex(sameWeekdayNextYear('2026-05-14')), mondayIndex('2026-05-14'))
})

test('지난 학년도 불러오기 — 이미 있는 일정은 건너뛰고, 부서 색은 빈 부서만 채운다', () => {
  const prev = [
    { id: 'a', date: '2026-05-14', title: '스포츠한마당', kind: '일반' },
    { id: 'b', date: '2026-06-01', title: '건강검진', kind: '일반' },
  ]
  const cur = [{ id: 'a', date: '', title: '스포츠한마당', kind: '일반', prevDate: '2026-05-14' }]
  const r = importPrevCards(cur, prev)
  assert.deepEqual(r.cards.map((c) => [c.id, c.prevDate]), [['b', '2026-06-01']])
  assert.equal(r.skipped, 1)

  const m = mergeDeptColors({ 교무기획부: 'teal' }, { 교무기획부: 'pink', 과학정보부: 'lime' })
  assert.deepEqual(m.colors, { 교무기획부: 'teal', 과학정보부: 'lime' })
  assert.equal(m.added, 1)
  assert.deepEqual(mergeDeptColors(undefined, undefined), { colors: {}, added: 0 })
})

test('개학~중간고사 실수업일 — 2026 엑셀 원본 기준', async () => {
  const st = computeStats(plan2026)
  // 1학기: 3/3(시업식 전일행사) ~ 4/21, 2학기: 8/14 ~ 10/5 (8/17·10/5 대체공휴일, 9/24·25 추석 빠짐)
  for (const g of [1, 2, 3]) assert.deepEqual(st.grades[g][1].beforeMid, [7, 7, 7, 7, 7])
  for (const g of [1, 2, 3]) assert.deepEqual(st.grades[g][2].beforeMid, [6, 7, 6, 7, 6])
  assert.equal(st.grades[1].year.total.beforeMid, 67)
})

test('진도 없는 날 — 학력평가·모의고사는 실수업일엔 그대로, 시험 사이 일수에서만 뺀다', () => {
  const base = plan2026.events
  const mock = (extra) => ({ id: `m${Math.random()}`, date: '2026-03-24', title: '전국연합학력평가', kind: '일반', grades: [], fullDay: false, activities: [], ...extra })
  const before = computeStats(plan2026)
  const after = computeStats({ ...plan2026, events: [...base, mock()] })
  for (const g of [1, 2, 3]) {
    assert.deepEqual(after.grades[g][1].actual, before.grades[g][1].actual) // 나이스 출결상 수업일 그대로
    assert.equal(after.grades[g][1].beforeMid[1], before.grades[g][1].beforeMid[1] - 1) // 3/24(화)
    assert.equal(after.grades[g][1].noProgress[1], 1)
  }
  // 대상 학년만
  const only3 = computeStats({ ...plan2026, events: [...base, mock({ grades: [3] })] })
  assert.equal(only3.grades[1][1].beforeMid[1], before.grades[1][1].beforeMid[1])
  assert.equal(only3.grades[3][1].beforeMid[1], before.grades[3][1].beforeMid[1] - 1)
  // 직접 끄면 셈, 제목에 없어도 켜면 뺌
  assert.equal(isNoProgress({ title: '전국연합학력평가', noProgress: false }), false)
  assert.equal(isNoProgress({ title: '진로적성검사', noProgress: true }), true)
  assert.equal(isNoProgress({ title: '대학수능모의평가' }), true)
  const off = computeStats({ ...plan2026, events: [...base, mock({ noProgress: false })] })
  assert.deepEqual(off.grades[1][1].beforeMid, before.grades[1][1].beforeMid)
})

test('나이스 학사일정 행 → 일정', () => {
  const all = [1, 2, 3]
  const rows = [
    { date: '2026-03-01', name: '3·1절', grades: all, off: '공휴일' },
    { date: '2026-03-03', name: '입학식', grades: [1], off: '' },
    { date: '2026-03-03', name: '시업식', grades: [2, 3], off: '' },
    { date: '2026-03-07', name: '토요휴업일', grades: all, off: '휴업일' },
    // 금·월은 주말을 사이에 두고 이어진다 → 한 일정
    { date: '2026-03-13', name: '학생 상담주간', grades: all, off: '' },
    { date: '2026-03-16', name: '학생 상담주간', grades: all, off: '' },
    { date: '2026-03-17', name: '학생 상담주간', grades: all, off: '' },
    { date: '2026-04-27', name: '1학기 중간고사', grades: all, off: '' },
    { date: '2026-04-28', name: '1학기 중간고사', grades: all, off: '' },
    { date: '2026-05-04', name: '재량휴업일', grades: all, off: '휴업일' },
    { date: '2026-05-08', name: '요일 변동(월)', grades: all, off: '' },
    { date: '2026-05-20', name: '수학여행', grades: [2], off: '' },
    { date: '2026-07-16', name: '방학식', grades: all, off: '' },
    { date: '2026-07-20', name: '여름방학', grades: all, off: '휴업일' },
  ]
  const evs = neisRowsToEvents(rows)
  const by = (t) => evs.find((e) => e.title === t)
  // 여름방학 뒤 개학이 없으면 다음 수업일(7/21)을 2학기 개학으로 넣는다
  assert.equal(evs.length, 11)
  assert.deepEqual([by('2학기 개학').kind, by('2학기 개학').date], ['개학', '2026-07-21'])
  assert.equal(by('3·1절').kind, '공휴일')
  assert.deepEqual([by('입학식').kind, by('입학식').grades, by('시업식').grades], ['개학', [1], [2, 3]])
  assert.deepEqual([by('학생 상담주간').date, by('학생 상담주간').endDate], ['2026-03-13', '2026-03-17'])
  // 정기고사는 날마다 따로
  assert.deepEqual(evs.filter((e) => e.title === '1학기 중간고사').map((e) => [e.kind, e.examType, e.date, e.endDate]),
    [['정기고사', '중간', '2026-04-27', undefined], ['정기고사', '중간', '2026-04-28', undefined]])
  assert.equal(by('재량휴업일').kind, '재량휴업')
  assert.deepEqual([by('요일 변동(월)').kind, by('요일 변동(월)').weekdaySwap], ['요일교체', 0])
  assert.deepEqual([by('수학여행').fullDay, by('수학여행').grades], [true, [2]])
  assert.equal(by('방학식').fullDay, true)
  assert.equal(by('토요휴업일'), undefined)
  assert.equal(by('여름방학'), undefined)
})

test('정기고사 기간 → 날마다 하나씩(주말·공휴일 건너뜀)', () => {
  const plan = { holidays: [{ date: '2026-10-09', name: '한글날' }], events: [] }
  const exam = { id: 'm', kind: '정기고사', examType: '중간', title: '중간고사', date: '2026-10-07', endDate: '2026-10-13', grades: [] }
  const parts = splitExamEvent(exam, plan)
  assert.deepEqual(parts.map((e) => e.date), ['2026-10-07', '2026-10-08', '2026-10-12', '2026-10-13'])
  assert.equal(parts[0].id, 'm')
  assert.equal(new Set(parts.map((e) => e.id)).size, 4)
  assert.ok(parts.every((e) => !e.endDate && e.examType === '중간'))
  assert.deepEqual(splitExamEvent({ ...exam, endDate: undefined }, plan), [{ ...exam, endDate: undefined }])
  assert.deepEqual(splitExamEvent({ ...exam, kind: '일반' }, plan).length, 1)
  // 나이스 가져오기도 시험은 합치지 않는다
  const rows = ['2026-04-24', '2026-04-27'].map((date) => ({ date, name: '중간고사', grades: [1, 2, 3], off: '' }))
  assert.equal(neisRowsToEvents(rows).length, 2)
})
