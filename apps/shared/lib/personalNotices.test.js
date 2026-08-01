/**
 * 쪽지 로직 검증.
 *   node --test apps/shared/lib/personalNotices.test.js
 *
 * 보낸함 묶음이 틀리면 "5명에게 보냈는데 아무도 안 읽었다"를 못 본다. 문서를 사람 수만큼
 * 만들기 때문에 묶는 계산이 어긋나면 같은 쪽지가 여러 줄로 흩어지거나 읽음 수가 부풀고,
 * 둘 다 화면을 눈으로 봐서는 잡히지 않는다.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  NOTICE_TITLE_MAX, describeSentGroup, groupSentNotices, newNoticePayload, replyTitle, validateNotice,
} from './personalNotices.js'

const sent = (over = {}) => ({
  id: 'n1', batchId: 'b1', title: '연수 신청 안내',
  recipientUid: 'u1', recipientName: '김국어', readAt: null, ...over,
})

test('받는 사람마다 문서를 따로 만든다 — 한 문서에 담으면 남의 쪽지가 보인다', () => {
  const p = newNoticePayload({
    batchId: 'b1', senderUid: 's1', senderName: '홍창기',
    recipient: { uid: 'u1', name: '김국어' }, recipientCount: 3,
    title: '연수 신청', bodyHtml: '<p>안내드립니다</p>', content: '안내드립니다',
  })
  assert.equal(p.recipientUid, 'u1')
  assert.equal(p.recipientName, '김국어')
  assert.equal(p.batchId, 'b1')
  assert.equal(p.readAt, null)
})

test('받는 사람 명단이 아니라 인원수만 남긴다 — 쪽지가 수신자 명부가 되면 안 된다', () => {
  const p = newNoticePayload({
    batchId: 'b1', senderUid: 's1', recipient: { uid: 'u1', name: '김국어' }, recipientCount: 5,
    title: '제목', content: '내용',
  })
  assert.equal(p.recipientCount, 5)
  assert.equal(p.recipientUids, undefined)
  assert.equal(p.recipientNames, undefined)
})

test('서식과 평문을 함께 담는다 — 목록은 평문이 있어야 잘라 쓸 수 있다', () => {
  const p = newNoticePayload({
    batchId: 'b1', senderUid: 's1', recipient: { uid: 'u1', name: '김국어' },
    title: '제목', bodyHtml: '<p><b>굵게</b></p>', content: '굵게',
  })
  assert.equal(p.bodyHtml, '<p><b>굵게</b></p>')
  assert.equal(p.content, '굵게')
})

test('제목은 앞뒤 공백을 없애고 길이를 자른다', () => {
  const p = newNoticePayload({
    batchId: 'b1', senderUid: 's1', recipient: { uid: 'u1', name: '김' },
    title: '  ' + '가'.repeat(200) + '  ',
  })
  assert.equal(p.title.length, NOTICE_TITLE_MAX)
})


// ── 답장 제목 ────────────────────────────────────────────
test("답장 제목에 'Re: '가 쌓이지 않는다", () => {
  assert.equal(replyTitle('연수 안내'), 'Re: 연수 안내')
  assert.equal(replyTitle('Re: 연수 안내'), 'Re: 연수 안내')
  assert.equal(replyTitle(''), 'Re: ')
  assert.equal(replyTitle(), 'Re: ')
})


// ── 보낸함 묶음 ──────────────────────────────────────────
test('같이 보낸 쪽지는 한 줄로 묶인다', () => {
  const groups = groupSentNotices([
    sent({ id: 'n1', recipientUid: 'u1', recipientName: '김국어' }),
    sent({ id: 'n2', recipientUid: 'u2', recipientName: '이수학' }),
    sent({ id: 'n3', recipientUid: 'u3', recipientName: '박영어' }),
  ])
  assert.equal(groups.length, 1)
  assert.equal(groups[0].total, 3)
})

test('읽은 사람만 센다', () => {
  const groups = groupSentNotices([
    sent({ id: 'n1', readAt: new Date() }),
    sent({ id: 'n2', recipientUid: 'u2', readAt: null }),
    sent({ id: 'n3', recipientUid: 'u3', readAt: new Date() }),
  ])
  assert.equal(groups[0].readCount, 2)
  assert.equal(groups[0].total, 3)
})

test('다른 묶음은 섞이지 않는다', () => {
  const groups = groupSentNotices([
    sent({ id: 'n1', batchId: 'b1' }),
    sent({ id: 'n2', batchId: 'b2', title: '다른 쪽지' }),
  ])
  assert.equal(groups.length, 2)
  assert.deepEqual(groups.map(g => g.title), ['연수 신청 안내', '다른 쪽지'])
})

test('batchId가 없는 옛 쪽지는 각자 한 줄로 남는다', () => {
  const groups = groupSentNotices([
    { id: 'old1', title: '옛 쪽지', recipientUid: 'u1', recipientName: '김국어', readAt: null },
    { id: 'old2', title: '옛 쪽지2', recipientUid: 'u2', recipientName: '이수학', readAt: null },
  ])
  assert.equal(groups.length, 2)
  assert.equal(groups[0].total, 1)
})

test('받는 사람은 가나다순 — 자리가 흔들리면 누가 안 읽었는지 찾기 어렵다', () => {
  const groups = groupSentNotices([
    sent({ id: 'n1', recipientUid: 'u1', recipientName: '최과학' }),
    sent({ id: 'n2', recipientUid: 'u2', recipientName: '김국어' }),
    sent({ id: 'n3', recipientUid: 'u3', recipientName: '이수학' }),
  ])
  assert.deepEqual(groups[0].recipients.map(r => r.name), ['김국어', '이수학', '최과학'])
})

test('빈 목록', () => {
  assert.deepEqual(groupSentNotices([]), [])
  assert.deepEqual(groupSentNotices(), [])
})


// ── 묶음 요약 ────────────────────────────────────────────
test('한 명에게 보낸 것은 이름과 읽음 여부를 보여준다', () => {
  const [g] = groupSentNotices([sent({ recipientName: '김국어', readAt: null })])
  assert.equal(describeSentGroup(g), '김국어 · 안읽음')
})

test('여럿에게 보낸 것은 인원과 읽은 수를 보여준다', () => {
  const [g] = groupSentNotices([
    sent({ id: 'n1', readAt: new Date() }),
    sent({ id: 'n2', recipientUid: 'u2' }),
    sent({ id: 'n3', recipientUid: 'u3' }),
  ])
  assert.equal(describeSentGroup(g), '3명 · 1명 읽음')
})

test('빈 값을 넣어도 깨지지 않는다', () => {
  assert.equal(describeSentGroup(null), '')
  assert.equal(describeSentGroup({ total: 0, recipients: [] }), '')
})


// ── 보내기 전 검사 ────────────────────────────────────────
test('받는 사람이 없으면 막는다', () => {
  assert.ok(validateNotice({ recipients: [], title: '제목', bodyText: '내용' }))
})

test('제목이나 내용이 비면 막는다 — 보낸 뒤에는 되돌릴 수 없다', () => {
  assert.ok(validateNotice({ recipients: [{ uid: 'u1' }], title: '  ', bodyText: '내용' }))
  assert.ok(validateNotice({ recipients: [{ uid: 'u1' }], title: '제목', bodyText: '   ' }))
})

test('다 채우면 통과', () => {
  assert.equal(validateNotice({ recipients: [{ uid: 'u1' }], title: '제목', bodyText: '내용' }), null)
})

test('인자를 안 넘겨도 깨지지 않는다', () => {
  assert.ok(validateNotice({}))
})
