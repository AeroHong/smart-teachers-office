/**
 * 채널 로직 검증.
 *   node --test apps/shared/lib/channels.test.js
 *
 * 채널 목록의 뱃지가 틀리면 "챙길 게 없다"고 믿고 지나치게 된다. 마감 판정과 집계는
 * 화면을 눈으로 봐서는 안 잡히므로 여기서 잡는다.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CHANNEL_NAME_MAX, channelStats, isMember, newChannelPayload, sortChannels, validateChannelName,
} from './channels.js'

const NOW = new Date('2026-08-02T10:00:00')

const post = (over = {}) => ({
  kind: 'request', targetUids: ['a', 'b'], completedUids: [], dueDate: null, ...over,
})

test('새 채널은 참여자 uid를 펼쳐 담는다 — array-contains로 내 채널을 뽑아야 한다', () => {
  const p = newChannelPayload({
    name: '성적-마감',
    members: [{ uid: 'u1' }, { uid: 'u2' }],
    createdBy: 'u1',
  })
  assert.deepEqual(p.memberUids, ['u1', 'u2'])
  assert.equal(p.archived, false)
})

test('이름과 설명은 길이를 자른다', () => {
  const p = newChannelPayload({ name: '가'.repeat(50), description: '나'.repeat(300), createdBy: 'u1' })
  assert.equal(p.name.length, CHANNEL_NAME_MAX)
  assert.equal(p.description.length, 120)
})

test('앞뒤 공백은 이름에 남지 않는다', () => {
  assert.equal(newChannelPayload({ name: '  성적-마감  ', createdBy: 'u1' }).name, '성적-마감')
})


// ── 집계 ────────────────────────────────────────────────
test('대상 전원이 완료한 글은 진행 중으로 세지 않는다', () => {
  const s = channelStats([
    post({ completedUids: ['a', 'b'] }),   // 끝남
    post({ completedUids: ['a'] }),        // 진행 중
  ], NOW)
  assert.equal(s.total, 2)
  assert.equal(s.openCount, 1)
})

test('안내는 진행 중으로 세지 않는다 — 완료 개념이 없다', () => {
  const s = channelStats([post({ kind: 'notice' }), post()], NOW)
  assert.equal(s.total, 2)
  assert.equal(s.openCount, 1)
})

test('마감이 지났고 아직 안 끝난 글을 센다', () => {
  const s = channelStats([
    post({ dueDate: new Date('2026-07-30') }),                        // 지남
    post({ dueDate: new Date('2026-08-10') }),                        // 남음
    post({ dueDate: new Date('2026-07-01'), completedUids: ['a', 'b'] }), // 지났지만 끝남
  ], NOW)
  assert.equal(s.overdueCount, 1)
  assert.equal(s.openCount, 2)
})

test('마감일 당일은 아직 지나지 않은 것', () => {
  const s = channelStats([post({ dueDate: new Date('2026-08-02T23:00:00') })], NOW)
  assert.equal(s.overdueCount, 0)
})

test('Firestore Timestamp 형태의 마감일도 받는다', () => {
  const ts = { toDate: () => new Date('2026-07-20') }
  assert.equal(channelStats([post({ dueDate: ts })], NOW).overdueCount, 1)
})

test('대상이 0명인 글을 끝난 것으로 치지 않는다 — every는 빈 배열에 참이다', () => {
  assert.equal(channelStats([post({ targetUids: [] })], NOW).openCount, 1)
})

test('글이 없는 채널', () => {
  assert.deepEqual(channelStats([], NOW), { total: 0, openCount: 0, overdueCount: 0 })
})


// ── 정렬 ────────────────────────────────────────────────
test('마감 지난 것이 있는 채널이 맨 위로', () => {
  const list = [
    { name: '나채널', stats: { overdueCount: 0, openCount: 5 } },
    { name: '가채널', stats: { overdueCount: 1, openCount: 1 } },
    { name: '다채널', stats: { overdueCount: 0, openCount: 0 } },
  ]
  assert.deepEqual(sortChannels(list).map(c => c.name), ['가채널', '나채널', '다채널'])
})

test('같은 급이면 가나다순 — 자리가 흔들리면 못 찾는다', () => {
  const list = [
    { name: '연구부', stats: { overdueCount: 0, openCount: 2 } },
    { name: '교무기획부', stats: { overdueCount: 0, openCount: 2 } },
  ]
  assert.deepEqual(sortChannels(list).map(c => c.name), ['교무기획부', '연구부'])
})

test('정렬이 원본을 건드리지 않는다', () => {
  const list = [{ name: '나', stats: {} }, { name: '가', stats: {} }]
  sortChannels(list)
  assert.equal(list[0].name, '나')
})

test('stats가 없어도 깨지지 않는다', () => {
  assert.doesNotThrow(() => sortChannels([{ name: '가' }, { name: '나' }]))
})


// ── 이름 검증 ────────────────────────────────────────────
test('빈 이름은 막는다', () => {
  assert.ok(validateChannelName(''))
  assert.ok(validateChannelName('   '))
})

test('같은 이름은 막는다 — 대소문자·공백 차이는 같은 것으로 본다', () => {
  assert.ok(validateChannelName('성적-마감', ['성적-마감']))
  assert.ok(validateChannelName(' 성적-마감 ', ['성적-마감']))
  assert.ok(validateChannelName('NEIS', ['neis']))
})

test('다른 이름은 통과', () => {
  assert.equal(validateChannelName('성적-마감', ['연수-신청']), null)
})


// ── 참여 판정 ────────────────────────────────────────────
test('만든 사람은 조건에서 빠져도 계속 본다', () => {
  // 조건을 좁히다가 자기가 빠지면 자기 채널에 못 들어간다
  const ch = { createdBy: 'u1', memberUids: ['u2', 'u3'] }
  assert.equal(isMember(ch, 'u1'), true)
  assert.equal(isMember(ch, 'u2'), true)
  assert.equal(isMember(ch, 'u9'), false)
})

test('빈 값을 넣어도 깨지지 않는다', () => {
  assert.equal(isMember(null, 'u1'), false)
  assert.equal(isMember({ memberUids: ['u1'] }, null), false)
  assert.equal(isMember({}, 'u1'), false)
})
