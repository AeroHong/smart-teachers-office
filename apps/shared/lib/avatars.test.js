/**
 * 이름표 아바타 순수 함수.
 *   node --test apps/shared/lib/avatars.test.js
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { colorForName, givenNameFor } from './avatars.js'

test('성을 뺀 나머지를 돌려준다 — 성 하나만 쓰면 겹치는 사람이 많다', () => {
  assert.equal(givenNameFor('홍창기'), '창기')
  assert.equal(givenNameFor('김민수'), '민수')
  assert.equal(givenNameFor('Smith'), 'mith')
})

test('앞뒤 공백은 무시하고 성을 뺀다', () => {
  assert.equal(givenNameFor('  홍창기  '), '창기')
})

test('한 글자짜리 이름(외자·닉네임)은 그 글자를 그대로 쓴다', () => {
  assert.equal(givenNameFor('A'), 'A')
  assert.equal(givenNameFor('강'), '강')
})

test('이름이 없으면 물음표 — 빈 상자 대신 정보 없음이 드러나야 한다', () => {
  assert.equal(givenNameFor(''), '?')
  assert.equal(givenNameFor(null), '?')
  assert.equal(givenNameFor(undefined), '?')
  assert.equal(givenNameFor('   '), '?')
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
