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
import {
  MIN_AUTO_UPDATE_VERSION, STALE_MS, compareVersions, isStale, needsManualReinstall,
  parseLatestVersion, versionState,
} from './desktopClients.js'

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

test('latest.yml에서 최신 버전을 읽는다', () => {
  const yml = `version: 0.2.3
files:
  - url: 스마트교무실 Setup 0.2.3.exe
    size: 100440616
path: 스마트교무실 Setup 0.2.3.exe
`
  assert.equal(parseLatestVersion(yml), '0.2.3')
  assert.equal(parseLatestVersion(`version: '1.0.10'`), '1.0.10', '따옴표가 붙어도 읽는다')
  assert.equal(parseLatestVersion(`files:
  - url: x.exe`), null, '버전 줄이 없으면 null')
  assert.equal(parseLatestVersion(''), null)
  assert.equal(parseLatestVersion(null), null)
})

test('설치 현황 상태 — 최신 버전과 견줘 판정한다', () => {
  // 0.2.3을 배포한 뒤에도 0.2.2가 '최신'으로 보이던 것이 이 함수를 만든 이유다
  assert.equal(versionState('0.2.2', '0.2.3'), 'old')
  assert.equal(versionState('0.2.3', '0.2.3'), 'latest')
  assert.equal(versionState('0.2.4', '0.2.3'), 'latest', '서버보다 앞선 버전(테스트 빌드)도 최신으로 본다')
  assert.equal(versionState('0.1.5', '0.2.3'), 'manual', '자동 업데이트가 없던 버전이 먼저다')
  assert.equal(versionState('0.2.2', null), 'unknown', '최신을 모르면 최신이라고 하지 않는다')
  assert.equal(versionState('0.1.5', null), 'manual', '최신을 몰라도 수동 재설치 판정은 그대로')
  assert.equal(versionState('0.2.10', '0.2.9'), 'latest', '자릿수가 늘어나도 숫자로 비교한다')
})
