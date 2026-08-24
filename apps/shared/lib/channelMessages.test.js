/**
 * 채널 메시지 로직 검증.
 *   node --test apps/shared/lib/channelMessages.test.js
 *
 * 여기서 잡으려는 것 둘.
 *  1) 안읽음 판정 — 틀리면 점이 안 사라지거나(계속 신경 쓰이게) 영영 안 뜬다(놓친다).
 *     시각 값이 Firestore Timestamp·Date·숫자로 섞여 들어오는데 화면으로는 구분이 안 된다.
 *  2) DM 문서 ID — 양쪽이 다른 ID를 계산하면 같은 상대와 대화가 둘로 갈라진다.
 *     갈라진 뒤에는 어느 쪽에 답했는지 알 수 없어 되돌리기도 어렵다.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MESSAGE_BODY_MAX, dmChannelId, dmPartnerUid, hasUnread, newMessagePayload, validateMessage,
} from './channelMessages.js'

const ts = (ms) => ({ toMillis: () => ms })

// ── 작성 ──────────────────────────────────────────────────────

test('메시지는 앞뒤 공백을 떼고 상한에서 자른다', () => {
  assert.equal(newMessagePayload({ authorUid: 'u1', body: '  안녕하세요  ' }).body, '안녕하세요')
  assert.equal(
    newMessagePayload({ authorUid: 'u1', body: 'x'.repeat(MESSAGE_BODY_MAX + 500) }).body.length,
    MESSAGE_BODY_MAX,
  )
})

test('가리키는 업무 글이 없으면 null로 둔다 — undefined는 Firestore가 거부한다', () => {
  assert.equal(newMessagePayload({ authorUid: 'u1', body: '안녕' }).refRequestId, null)
  assert.equal(
    newMessagePayload({ authorUid: 'u1', body: '안녕', refRequestId: 'r1' }).refRequestId,
    'r1',
  )
})

test('빈 메시지는 막는다 — 목록에 누를 수 없는 줄이 남는다', () => {
  assert.ok(validateMessage(''))
  assert.ok(validateMessage('   '))
  assert.ok(validateMessage(null))
  assert.equal(validateMessage('안녕하세요'), null)
})

test('상한을 넘으면 잘라 저장하지 않고 미리 막는다 — "내가 쓴 게 왜 없어졌지"가 된다', () => {
  assert.ok(validateMessage('x'.repeat(MESSAGE_BODY_MAX + 1)))
  assert.equal(validateMessage('x'.repeat(MESSAGE_BODY_MAX)), null)
})

// ── 안읽음 ────────────────────────────────────────────────────

test('메시지가 없는 채널은 안읽음이 아니다', () => {
  assert.equal(hasUnread({ id: 'c1' }, {}), false)
  assert.equal(hasUnread({ id: 'c1', lastMessageAt: null }, { c1: ts(100) }), false)
})

test('한 번도 안 들어가 본 채널에 메시지가 있으면 안읽음이다', () => {
  assert.equal(hasUnread({ id: 'c1', lastMessageAt: ts(100) }, {}), true)
})

test('마지막 메시지가 내가 본 시점보다 나중이면 안읽음', () => {
  const ch = { id: 'c1', lastMessageAt: ts(200) }
  assert.equal(hasUnread(ch, { c1: ts(100) }), true)
  assert.equal(hasUnread(ch, { c1: ts(200) }), false, '같은 시각은 이미 본 것')
  assert.equal(hasUnread(ch, { c1: ts(300) }), false)
})

test('다른 채널의 읽음 기록에 영향받지 않는다', () => {
  assert.equal(hasUnread({ id: 'c1', lastMessageAt: ts(200) }, { c2: ts(999) }), true)
})

test('시각이 Timestamp·Date·숫자로 섞여 들어와도 같게 판정한다', () => {
  // Firestore는 서버 시각을 Timestamp로 주지만, 방금 쓴 값은 로컬에서 Date일 수 있다
  const cases = [ts(200), new Date(200), 200]
  for (const last of cases) {
    for (const seen of cases) {
      assert.equal(hasUnread({ id: 'c1', lastMessageAt: last }, { c1: seen }), false)
    }
  }
})

test('빈 값을 넣어도 깨지지 않는다', () => {
  assert.equal(hasUnread(null, {}), false)
  assert.equal(hasUnread({ id: 'c1', lastMessageAt: ts(1) }, null), true)
  assert.equal(hasUnread({ id: 'c1', lastMessageAt: 'X' }, {}), false)
})

// ── DM ────────────────────────────────────────────────────────

test('DM 문서 ID는 순서와 무관하게 같다 — 갈라지면 어느 쪽에 답했는지 알 수 없다', () => {
  assert.equal(dmChannelId('bbb', 'aaa'), dmChannelId('aaa', 'bbb'))
  assert.equal(dmChannelId('aaa', 'bbb'), 'dm_aaa_bbb')
})

test('DM 상대 찾기', () => {
  const dm = { memberUids: ['u1', 'u2'] }
  assert.equal(dmPartnerUid(dm, 'u1'), 'u2')
  assert.equal(dmPartnerUid(dm, 'u2'), 'u1')
})

test('나 자신과의 DM은 나를 돌려준다 — 메모장처럼 쓰는 자리', () => {
  assert.equal(dmPartnerUid({ memberUids: ['u1'] }, 'u1'), 'u1')
  assert.equal(dmPartnerUid({ memberUids: [] }, 'u1'), 'u1')
})
