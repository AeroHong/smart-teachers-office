/**
 * 데스크톱 설치 현황 판정 검증.
 *   node --test apps/shared/lib/desktopClients.test.js
 *
 * "수동 재설치 필요" 판정이 틀리면 실제로는 자동 업데이트를 못 받는 사람을 최신으로
 * 착각해 안내에서 빠뜨리게 된다. 화면을 눈으로 봐서는 안 잡히는 종류의 오류다.
 * 특히 문자열 비교(`'0.1.10' < '0.1.7'`)로 새면 자릿수가 늘어나는 순간 조용히 뒤집힌다.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { MIN_AUTO_UPDATE_VERSION, STALE_MS, compareVersions, isStale, needsManualReinstall } from './desktopClients.js'

test('버전 비교는 자리별 숫자로 한다', () => {
  assert.ok(compareVersions('0.1.7', '0.1.6') > 0)
  assert.ok(compareVersions('0.1.6', '0.1.7') < 0)
  assert.equal(compareVersions('0.1.7', '0.1.7'), 0)
})

test('두 자리 이상으로 올라가도 뒤집히지 않는다 (문자열 비교였다면 실패)', () => {
  assert.ok(compareVersions('0.1.10', '0.1.7') > 0)
  assert.ok(compareVersions('0.2.0', '0.1.99') > 0)
  assert.ok(compareVersions('1.0.0', '0.9.9') > 0)
})

test('자릿수가 다른 표기도 견딘다', () => {
  assert.equal(compareVersions('1.0', '1.0.0'), 0)
  assert.ok(compareVersions('1.0.1', '1.0') > 0)
})

test('0.1.7 미만은 수동 재설치 대상', () => {
  assert.equal(needsManualReinstall('0.1.5'), true)
  assert.equal(needsManualReinstall('0.1.6'), true)
  assert.equal(needsManualReinstall('0.1.0'), true)
})

test('0.1.7 이상은 자동 업데이트를 받는다', () => {
  assert.equal(needsManualReinstall(MIN_AUTO_UPDATE_VERSION), false)
  assert.equal(needsManualReinstall('0.1.8'), false)
  assert.equal(needsManualReinstall('0.2.0'), false)
})

test('버전을 모르면 안내 대상으로 본다 — 빠뜨리는 쪽보다 낫다', () => {
  assert.equal(needsManualReinstall('unknown'), true)
  assert.equal(needsManualReinstall(''), true)
  assert.equal(needsManualReinstall(null), true)
  assert.equal(needsManualReinstall(undefined), true)
})

test('마지막 보고가 오래되면 조용한 것으로 본다', () => {
  const now = Date.now()
  assert.equal(isStale({ lastSeenAt: now - 60 * 1000 }, now), false)
  assert.equal(isStale({ lastSeenAt: now - STALE_MS - 1 }, now), true)
})

test('Firestore Timestamp(toMillis)도 그대로 읽는다', () => {
  const now = Date.now()
  const ts = ms => ({ toMillis: () => ms })
  assert.equal(isStale({ lastSeenAt: ts(now - 1000) }, now), false)
  assert.equal(isStale({ lastSeenAt: ts(now - STALE_MS - 1) }, now), true)
})

test('보고 기록이 없으면 조용한 것으로 본다', () => {
  assert.equal(isStale(null), true)
  assert.equal(isStale({}), true)
  assert.equal(isStale({ lastSeenAt: 0 }), true)
})
