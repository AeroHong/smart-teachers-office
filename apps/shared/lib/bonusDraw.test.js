/**
 * 출결 추가 뽑기 로직 검증.
 *   node --test apps/shared/lib/bonusDraw.test.js
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { bonusCandidates, pickIndex, buildSpinSchedule } from './bonusDraw.js'

test('후보 — 1~3등과 행운번호 당첨자를 뺀다', () => {
  const rank = { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 }
  assert.deepEqual(bonusCandidates(['a', 'b', 'c', 'd', 'e', 'f'], rank, 'e'), ['d', 'f'])
})

test('후보 — 행운번호 당첨자가 아직 없으면 메달 3명만 뺀다', () => {
  const rank = { a: 1, b: 2, c: 3, d: 4 }
  assert.deepEqual(bonusCandidates(['a', 'b', 'c', 'd'], rank, null), ['d'])
})

test('pickIndex — 범위 안, 빈 명단은 -1', () => {
  assert.equal(pickIndex(0), -1)
  assert.equal(pickIndex(5, () => 0), 0)
  assert.equal(pickIndex(5, () => 0.9999), 4)
  assert.equal(pickIndex(5, () => 1), 4)
})

test('일정 — 마지막 단계가 당첨자 자리에서 멈춘다', () => {
  for (const length of [2, 3, 7, 25, 40]) {
    for (let w = 0; w < length; w++) {
      const sch = buildSpinSchedule(length, w, { startIndex: (w * 3) % length })
      assert.equal(sch.at(-1).index, w, `length=${length} winner=${w}`)
    }
  }
})

test('일정 — 전체 길이는 약 5초, 갈수록 느려지고, 명단을 한 바퀴 이상 훑는다', () => {
  const sch = buildSpinSchedule(20, 7)
  const total = sch.reduce((a, s) => a + s.delay, 0)
  assert.ok(Math.abs(total - 5000) < 50, `total=${total}`)
  for (let i = 1; i < sch.length; i++) assert.ok(sch[i].delay >= sch[i - 1].delay)
  assert.ok(sch.length >= 20)
})

test('일정 — 한 명뿐이면 한 단계, 잘못된 입력은 빈 배열', () => {
  assert.deepEqual(buildSpinSchedule(1, 0), [{ index: 0, delay: 5000 }])
  assert.deepEqual(buildSpinSchedule(0, 0), [])
  assert.deepEqual(buildSpinSchedule(3, 5), [])
})
