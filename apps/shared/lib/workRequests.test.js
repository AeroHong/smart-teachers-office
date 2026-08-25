/**
 * 업무 요청 집계 검증.
 *   node --test apps/shared/lib/workRequests.test.js
 *
 * 완료 수와 마감 상태가 담당자의 판단(독촉할지, 누구에게 할지)을 좌우하므로 숫자가 틀리면 안 된다.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  completionStats, dueState, isDoneBy, isOwner, isRequest, newRequestPayload, ownerOf,
  pendingMembers, sortByUrgency,
} from './workRequests.js'

const request = {
  title: '고사 원안 제출',
  status: 'open',
  targetUids: ['u1', 'u2', 'u3', 'u4'],
  targetNames: ['김국어', '이수학', '박영어', '최과학'],
  completedUids: ['u1', 'u3'],
}

test('완료 집계는 대상과 교집합만 센다', () => {
  const stats = completionStats(request)
  assert.equal(stats.total, 4)
  assert.equal(stats.doneCount, 2)
  assert.equal(stats.percent, 50)
  assert.deepEqual(stats.pendingUids, ['u2', 'u4'])
})

test('대상에서 빠진 사람의 완료 기록은 완료 수를 부풀리지 않는다', () => {
  // 담당자가 대상을 다시 계산해 u9가 빠졌는데 완료 기록만 남은 상황
  const recalculated = { ...request, completedUids: ['u1', 'u3', 'u9'] }
  const stats = completionStats(recalculated)
  assert.equal(stats.doneCount, 2)
  assert.equal(stats.percent, 50)
})

test('대상이 0명이면 나눗셈이 깨지지 않는다', () => {
  const stats = completionStats({ targetUids: [], completedUids: [] })
  assert.equal(stats.percent, 0)
  assert.equal(stats.total, 0)
})

test('미완료자는 이름과 함께 나온다 — 독촉 대상 표시용', () => {
  assert.deepEqual(pendingMembers(request), [
    { uid: 'u2', name: '이수학' },
    { uid: 'u4', name: '최과학' },
  ])
})

test('완료 여부 판정', () => {
  assert.equal(isDoneBy(request, 'u1'), true)
  assert.equal(isDoneBy(request, 'u2'), false)
  assert.equal(isDoneBy({}, 'u1'), false)
})

const at = (iso) => new Date(iso)
const NOW = at('2026-06-17T10:00:00')

test('마감 상태 — 지남/오늘/임박/여유', () => {
  const on = (d) => dueState({ status: 'open', dueDate: at(d) }, NOW)
  assert.equal(on('2026-06-15T00:00:00').state, 'overdue')
  assert.equal(on('2026-06-15T00:00:00').label, '2일 지남')
  assert.equal(on('2026-06-17T23:59:00').state, 'today')
  assert.equal(on('2026-06-20T00:00:00').state, 'soon')     // D-3
  assert.equal(on('2026-06-25T00:00:00').state, 'normal')   // D-8
})

test('시각이 달라도 날짜 기준으로 센다', () => {
  // 마감이 오늘 새벽 1시여도 "오늘까지"지 "지남"이 아니다
  const early = dueState({ status: 'open', dueDate: at('2026-06-17T01:00:00') }, NOW)
  assert.equal(early.state, 'today')
})

test('마감된 요청과 마감일 없는 요청', () => {
  assert.equal(dueState({ status: 'closed', dueDate: at('2026-06-01') }, NOW).state, 'closed')
  assert.equal(dueState({ status: 'open', dueDate: null }, NOW).state, 'none')
})

test('Firestore Timestamp 형태도 받는다', () => {
  const ts = { toDate: () => at('2026-06-20T00:00:00') }
  assert.equal(dueState({ status: 'open', dueDate: ts }, NOW).state, 'soon')
})

test('급한 것이 위로 정렬된다', () => {
  const list = [
    { title: '여유', status: 'open', dueDate: at('2026-06-30') },
    { title: '마감됨', status: 'closed', dueDate: at('2026-06-01') },
    { title: '지남', status: 'open', dueDate: at('2026-06-10') },
    { title: '오늘', status: 'open', dueDate: at('2026-06-17') },
    { title: '마감없음', status: 'open', dueDate: null },
    { title: '임박', status: 'open', dueDate: at('2026-06-19') },
  ]
  assert.deepEqual(
    sortByUrgency(list, NOW).map(r => r.title),
    ['지남', '오늘', '임박', '여유', '마감없음', '마감됨'],
  )
})

test('새 요청은 완료자 없이 시작하고 대상 명단을 고정한다', () => {
  const payload = newRequestPayload({
    title: '  교수학습 평가계획 제출  ',
    targets: [{ uid: 'u1', name: '김국어' }, { uid: 'u2', name: '이수학' }],
    targetRuleText: '교과 국어',
    createdBy: 'u9',
    createdByName: '한담당',
  })
  assert.equal(payload.title, '교수학습 평가계획 제출')   // 앞뒤 공백 정리
  assert.deepEqual(payload.targetUids, ['u1', 'u2'])
  assert.deepEqual(payload.targetNames, ['김국어', '이수학'])
  assert.deepEqual(payload.completedUids, [])
  assert.equal(payload.status, 'open')
})

test('안내는 마감일과 완료 개념이 없다', () => {
  const payload = newRequestPayload({
    kind: 'notice',
    title: '단축수업 안내',
    dueDate: new Date('2026-06-20'),   // 넘겨도 무시된다
    pinned: true,
    targets: [{ uid: 'u1', name: '김국어' }],
  })
  assert.equal(payload.kind, 'notice')
  assert.equal(payload.dueDate, null)
  assert.equal(payload.pinned, true)
})

test('요청에는 고정(pinned) 개념이 없다', () => {
  const payload = newRequestPayload({ kind: 'request', title: 'x', pinned: true, targets: [] })
  assert.equal(payload.pinned, false)
})

test('알 수 없는 종류는 요청으로 떨어진다', () => {
  assert.equal(newRequestPayload({ kind: '이상한값', title: 'x', targets: [] }).kind, 'request')
})

test('학년도를 안 넘기면 지금 학년도를 채운다', async () => {
  const { year } = (await import('./schema.js')).currentYearSemester()
  const payload = newRequestPayload({ title: 'x', targets: [] })
  assert.equal(payload.year, year)
})

test('학년도를 넘기면 그대로 쓴다 — 백필 스크립트가 옛 글에 지난 학년도를 넣을 때 쓴다', () => {
  assert.equal(newRequestPayload({ title: 'x', targets: [], year: 2024 }).year, 2024)
})

test('담당(ownerUids)을 지정하지 않으면 만든 사람이 담당이다', () => {
  const payload = newRequestPayload({ title: 'x', targets: [], createdBy: 'u9' })
  assert.deepEqual(payload.ownerUids, [])   // 저장값 자체는 비워둔다 — "정한 적 없음"과 "정함"을 구분
  assert.deepEqual(ownerOf(payload), ['u9'])   // 그러나 담당을 물으면 만든 사람이 나온다
  assert.equal(isOwner(payload, 'u9'), true)
  assert.equal(isOwner(payload, 'u2'), false)
})

test('담당을 지정하면 만든 사람과 달라도 된다 — 대신 만들어주는 경우', () => {
  const payload = newRequestPayload({
    title: 'x', targets: [], createdBy: 'u9', ownerUids: ['u1', 'u2', 'u1'],
  })
  assert.deepEqual(payload.ownerUids, ['u1', 'u2'])   // 중복은 저장 시점에 정리
  assert.deepEqual(ownerOf(payload), ['u1', 'u2'])
  assert.equal(isOwner(payload, 'u9'), false, '지정된 담당이 있으면 만든 사람은 자동으로 담당이 아니다')
})

test('ownerOf/isOwner는 빈 값에도 깨지지 않는다', () => {
  assert.deepEqual(ownerOf(null), [])
  assert.deepEqual(ownerOf({}), [])
  assert.equal(isOwner(null, 'u1'), false)
  assert.equal(isOwner({ ownerUids: ['u1'] }, null), false)
})

test('kind가 없는 옛 문서는 요청으로 본다', () => {
  assert.equal(isRequest({ title: '옛 문서' }), true)
  assert.equal(isRequest({ kind: 'notice' }), false)
})
