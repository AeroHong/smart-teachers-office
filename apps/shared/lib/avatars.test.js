/**
 * 이니셜 아바타 순수 함수.
 *   node --test apps/shared/lib/avatars.test.js
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { colorForName, initialFor } from './avatars.js'

test('이름 첫 글자를 돌려준다', () => {
  assert.equal(initialFor('김민수'), '김')
  assert.equal(initialFor('Smith'), 'S')
})

test('앞뒤 공백은 무시하고 첫 글자를 잡는다', () => {
  assert.equal(initialFor('  김민수  '), '김')
})

test('이름이 없으면 물음표 — 빈 원 대신 정보 없음이 드러나야 한다', () => {
  assert.equal(initialFor(''), '?')
  assert.equal(initialFor(null), '?')
  assert.equal(initialFor(undefined), '?')
  assert.equal(initialFor('   '), '?')
})

test('같은 이름은 항상 같은 색 — 새로고침마다 바뀌면 사람을 못 알아본다', () => {
  assert.equal(colorForName('김민수'), colorForName('김민수'))
  assert.equal(colorForName(''), colorForName(''))
})

test('색은 항상 정해진 팔레트 안의 값이다', () => {
  const PALETTE = [
    '#ef4444', '#f97316', '#eab308', '#22c55e',
    '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899',
  ]
  for (const name of ['김민수', '이영희', '박철수', '', 'A', 'ㅎㅎㅎ']) {
    assert.ok(PALETTE.includes(colorForName(name)), `${name}의 색이 팔레트 밖`)
  }
})

test('다른 이름은 대체로 다른 색이 나온다(완전히 균등할 필요는 없지만 전부 같은 색이면 안 된다)', () => {
  const names = ['김민수', '이영희', '박철수', '최지훈', '정수연', '한지민', '오세훈', '강나연']
  const colors = new Set(names.map(colorForName))
  assert.ok(colors.size > 1, '여덟 이름이 전부 같은 색으로 뭉쳤다')
})
