/**
 * 이름 접두어 제거 검증.
 *
 * 선유고 실제 표시이름을 그대로 쓴다. 잘못 자르면 명단에서 사람을 못 알아보고,
 * 안 자르면 정렬이 직책순으로 뭉치는데 둘 다 화면을 봐서는 늦게 발견된다.
 *
 *   node --test apps/shared/lib/personName.test.js
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { stripTitlePrefix } from './personName.js'

test('교사·교장·교감 접두어를 뗀다', () => {
  assert.equal(stripTitlePrefix('교사강혜련'), '강혜련')
  assert.equal(stripTitlePrefix('교장윤석주'), '윤석주')
  assert.equal(stripTitlePrefix('교감정병희'), '정병희')
})

test('부장은 이름이 무엇이든 뗀다', () => {
  assert.equal(stripTitlePrefix('교무부장홍창기'), '홍창기')
  assert.equal(stripTitlePrefix('연구부장강혜련'), '강혜련')
  assert.equal(stripTitlePrefix('진로상담복지부장최기준'), '최기준')
  assert.equal(stripTitlePrefix('3학년부장임상훈'), '임상훈')
})

test('강사 앞에 과목이 붙어도 뗀다', () => {
  assert.equal(stripTitlePrefix('강사김가은'), '김가은')
  assert.equal(stripTitlePrefix('심리학강사한명철'), '한명철')
  assert.equal(stripTitlePrefix('일사강사김한조'), '김한조')
})

test('행정직도 뗀다', () => {
  assert.equal(stripTitlePrefix('행정박밀양'), '박밀양')
  assert.equal(stripTitlePrefix('행정신유라'), '신유라')
  assert.equal(stripTitlePrefix('행정김윤경'), '김윤경')
})

test("'수석교사'가 '교사'로 잘리지 않는다 — 긴 접두어가 먼저다", () => {
  assert.equal(stripTitlePrefix('수석교사김성회'), '김성회')
})

test('사람 이름이 아닌 계정은 건드리지 않는다', () => {
  // 잘못 자르느니 접두어가 남는 편이 낫다. 누구인지는 알아볼 수 있어야 한다
  assert.equal(stripTitlePrefix('공유드라이브관리'), '공유드라이브관리')
  assert.equal(stripTitlePrefix('도메인 관리자선유고'), '도메인 관리자선유고')
})

test('접두어가 없으면 그대로 둔다', () => {
  assert.equal(stripTitlePrefix('홍창기'), '홍창기')
  assert.equal(stripTitlePrefix('강혜련'), '강혜련')
})

test('이미 정리된 이름을 다시 넣어도 안 깎인다 — 로그인마다 통과한다', () => {
  ['윤석주', '정병희', '김가은', '박밀양', '한명철'].forEach(n => {
    assert.equal(stripTitlePrefix(n), n, n)
  })
})

test('빈 값·공백을 견딘다', () => {
  assert.equal(stripTitlePrefix(''), '')
  assert.equal(stripTitlePrefix(null), '')
  assert.equal(stripTitlePrefix(undefined), '')
  assert.equal(stripTitlePrefix('  교사강혜련  '), '강혜련')
})
