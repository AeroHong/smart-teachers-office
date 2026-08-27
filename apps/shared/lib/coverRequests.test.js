/**
 * 보강신청 순수 로직 검증.
 *   node --test apps/shared/lib/coverRequests.test.js
 *
 * Firestore를 건드리는 함수(claimCover 등)는 여기서 다루지 않는다 — 날짜 파싱·집계·
 * 오픈 판정처럼 데이터만으로 결정되는 부분만 검증한다.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  coverStats, isCoverClosed, isCoverMine, isCoverOpenNow, monthKeyOf, parseCoverDate,
  parseOpenAt, validCoverRows, weekdayLabel,
} from './coverRequests.js'

test('parseCoverDate — 표준·비표준 형식을 모두 읽는다', () => {
  assert.deepEqual(parseCoverDate('2025-05-20'), new Date(2025, 4, 20))
  assert.deepEqual(parseCoverDate('2025. 5. 20.'), new Date(2025, 4, 20))
  assert.deepEqual(parseCoverDate('2025/5/20'), new Date(2025, 4, 20))
  assert.equal(parseCoverDate(''), null)
  assert.equal(parseCoverDate('알수없음'), null)
})

test('parseOpenAt — 빈 값·이상한 값은 null(=이미 공개로 본다)', () => {
  assert.equal(parseOpenAt(''), null)
  assert.equal(parseOpenAt(null), null)
  assert.equal(parseOpenAt('이상한값'), null)
})

test('isCoverOpenNow — openAt이 없으면 항상 공개', () => {
  assert.equal(isCoverOpenNow({ openAt: null }), true)
  assert.equal(isCoverOpenNow({}), true)
})

test('isCoverOpenNow — openAt이 미래면 아직 비공개', () => {
  const now = new Date('2026-06-01T00:00:00')
  assert.equal(isCoverOpenNow({ openAt: '2026-06-02 08:00' }, now), false)
  assert.equal(isCoverOpenNow({ openAt: '2026-05-31 08:00' }, now), true)
})

test('isCoverMine / isCoverClosed', () => {
  const cover = { status: '마감', coverTeacherEmail: 'a@b.com' }
  assert.equal(isCoverMine(cover, 'a@b.com'), true)
  assert.equal(isCoverMine(cover, 'x@y.com'), false)
  assert.equal(isCoverMine(cover, ''), false)
  assert.equal(isCoverClosed(cover), true)
  assert.equal(isCoverClosed({ status: '대기중' }), false)
})

test('validCoverRows — 필수 항목이 빠진 행은 걸러낸다', () => {
  const rows = [
    { date: '2025-05-20', className: '2-3', period: '3', absentTeacher: '홍길동', subject: '수학' },
    { date: '', className: '2-3', period: '3', absentTeacher: '홍길동', subject: '수학' },
    { date: '2025-05-21', className: '', period: '3', absentTeacher: '홍길동', subject: '수학' },
  ]
  assert.equal(validCoverRows(rows).length, 1)
})

test('weekdayLabel — 요일을 괄호로', () => {
  assert.equal(weekdayLabel('2026-08-27'), '(목)')
  assert.equal(weekdayLabel(''), '')
})

test('monthKeyOf — 표준 형식과 비표준 형식 둘 다 같은 월 키를 낸다', () => {
  assert.equal(monthKeyOf('2025-05-20'), '2025년 5월')
  assert.equal(monthKeyOf('2025. 5. 20.'), '2025년 5월')
  assert.equal(monthKeyOf(''), null)
})

test('coverStats — coverTeacherEmail 기준으로 월간·전체를 함께 센다', () => {
  const history = [
    { date: '2025-05-01', coverTeacher: '김국어', coverTeacherEmail: 'a@b.com' },
    { date: '2025-05-15', coverTeacher: '김국어', coverTeacherEmail: 'a@b.com' },
    { date: '2025-04-01', coverTeacher: '김국어', coverTeacherEmail: 'a@b.com' },
    { date: '2025-05-10', coverTeacher: '이수학', coverTeacherEmail: 'c@d.com' },
    // 신청자 없는 슬롯은 집계에서 빠진다
    { date: '2025-05-11', coverTeacher: null, coverTeacherEmail: null },
  ]
  const stats = coverStats(history, '2025년 5월')
  const kim = stats.find(s => s.email === 'a@b.com')
  const lee = stats.find(s => s.email === 'c@d.com')
  assert.equal(kim.totalCount, 3)
  assert.equal(kim.monthCount, 2)
  assert.equal(lee.totalCount, 1)
  assert.equal(lee.monthCount, 1)
  assert.equal(stats.length, 2)
})
