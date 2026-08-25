/**
 * 학년도 계산 검증.
 *   node --test apps/shared/lib/schema.test.js
 *
 * 3월 경계(2·3월)와 12월 31일 자정 근처에서 틀리기 쉽다. 여기서 틀리면 "작년 정기고사"를
 * 찾을 때 1~2월에 쓴 글이 다음 학년도로 잘못 묶여 빠진다 — 화면을 봐서는 원인을 알 수 없다.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { currentYearSemester, schoolYearFor, semesterFor } from './schema.js'

test('3월은 그해 학년도 1학기의 시작이다', () => {
  assert.equal(schoolYearFor(new Date('2026-03-01T00:00:00')), 2026)
})

test('2월은 아직 전년도 학년도다', () => {
  assert.equal(schoolYearFor(new Date('2026-02-28T23:59:59')), 2025)
})

test('1월도 전년도 학년도다', () => {
  assert.equal(schoolYearFor(new Date('2027-01-15T00:00:00')), 2026)
})

test('연말(12월)은 그해 학년도 2학기다', () => {
  assert.equal(schoolYearFor(new Date('2026-12-31T23:59:59')), 2026)
})

test('Firestore Timestamp(.toDate 있는 값)도 그대로 받는다', () => {
  const ts = { toDate: () => new Date('2026-01-10') }
  assert.equal(schoolYearFor(ts), 2025)
})

test('숫자(ms)나 문자열 날짜도 받는다 — Date 생성자에 그대로 넘기는 값들', () => {
  assert.equal(schoolYearFor('2026-05-01'), 2026)
  assert.equal(schoolYearFor(new Date('2026-05-01').getTime()), 2026)
})

test('학기 경계 — 2월 말과 3월 초, 8월 말과 9월 초', () => {
  assert.equal(semesterFor(new Date('2026-02-28T12:00:00')), 2)
  assert.equal(semesterFor(new Date('2026-03-01T12:00:00')), 1)
  assert.equal(semesterFor(new Date('2026-08-31T12:00:00')), 1)
  assert.equal(semesterFor(new Date('2026-09-01T12:00:00')), 2)
})

test('currentYearSemester는 지금 이 순간에도 형태가 깨지지 않는다', () => {
  const { year, semester } = currentYearSemester()
  assert.ok(Number.isInteger(year) && year > 2000)
  assert.ok(semester === 1 || semester === 2)
})
