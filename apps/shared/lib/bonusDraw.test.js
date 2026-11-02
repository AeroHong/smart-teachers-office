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

test('일정 — 전체 길이는 약 5초, 갈수록 느려진다', () => {
  const sch = buildSpinSchedule(20, 7)
  const total = sch.reduce((a, s) => a + s.delay, 0)
  assert.ok(Math.abs(total - 5000) < 50, `total=${total}`)
  for (let i = 1; i < sch.length; i++) assert.ok(sch[i].delay >= sch[i - 1].delay)
})

test('일정 — 무작위로 움직이되 같은 칸에 연속으로 머물지 않는다', () => {
  for (const length of [2, 3, 25]) {
    const sch = buildSpinSchedule(length, 1, { startIndex: 0 })
    assert.notEqual(sch[0].index, 0)
    for (let i = 1; i < sch.length; i++) assert.notEqual(sch[i].index, sch[i - 1].index)
  }
  // 순서대로 도는 게 아니다 — 25명이면 다음 칸이 +1이 아닌 경우가 있어야 한다
  const sch = buildSpinSchedule(25, 10, { rng: (() => { let x = 7; return () => (x = (x * 9301 + 49297) % 233280) / 233280 })() })
  assert.ok(sch.some((s, i) => i > 0 && s.index !== (sch[i - 1].index + 1) % 25))
})

test('일정 — 한 명뿐이면 한 단계, 잘못된 입력은 빈 배열', () => {
  assert.deepEqual(buildSpinSchedule(1, 0), [{ index: 0, delay: 5000 }])
  assert.deepEqual(buildSpinSchedule(0, 0), [])
  assert.deepEqual(buildSpinSchedule(3, 5), [])
})
