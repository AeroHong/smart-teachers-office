/**
 * 댓글 검증.
 *   node --test apps/shared/lib/comments.test.js
 *
 * 댓글은 화면에서 막으면 그만인 것처럼 보이지만, 빈 댓글이 목록에 쌓이거나 남의 댓글이
 * 지워지는 일은 되돌릴 수 없다. 저장 직전 판정만은 화면 없이 확인해 둔다.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  COMMENT_ERRORS, MAX_COMMENT_LENGTH, canDeleteComment, commentLength,
  newCommentPayload, normalizeCommentBody, sortComments, validateComment,
} from './comments.js'

test('앞뒤 공백과 빈 줄은 내용이 아니라 정리된다', () => {
  assert.equal(normalizeCommentBody('  양식 어디 있나요?\n\n  '), '양식 어디 있나요?')
})

test('가운데 줄바꿈은 살린다 — 두 줄짜리 댓글이 한 줄로 뭉치면 안 된다', () => {
  assert.equal(normalizeCommentBody('1번은 했습니다\n2번은 내일 하겠습니다'), '1번은 했습니다\n2번은 내일 하겠습니다')
})

test('붙여넣기로 들어온 CRLF는 LF로 맞춘다 — 같은 내용의 길이가 달라지지 않게', () => {
  assert.equal(normalizeCommentBody('첫 줄\r\n둘째 줄'), '첫 줄\n둘째 줄')
  assert.equal(commentLength('첫 줄\r\n둘째 줄'), commentLength('첫 줄\n둘째 줄'))
})

test('문자열이 아닌 값도 빈 내용으로 떨어진다 — 예기치 않은 입력에 터지지 않게', () => {
  assert.equal(normalizeCommentBody(null), '')
  assert.equal(normalizeCommentBody(undefined), '')
  assert.equal(normalizeCommentBody(123), '')
})

test('빈 댓글과 공백만 있는 댓글은 보낼 수 없다', () => {
  for (const input of ['', '   ', '\n\n', '\t', null, undefined]) {
    const result = validateComment(input)
    assert.equal(result.ok, false, `${JSON.stringify(input)}은 막혀야 한다`)
    assert.equal(result.error, COMMENT_ERRORS.empty)
  }
})

test('상한과 같은 길이는 통과하고 한 글자 넘으면 막힌다 — 경계', () => {
  const exact = '가'.repeat(MAX_COMMENT_LENGTH)
  assert.equal(validateComment(exact).ok, true)

  const over = '가'.repeat(MAX_COMMENT_LENGTH + 1)
  const result = validateComment(over)
  assert.equal(result.ok, false)
  assert.equal(result.error, COMMENT_ERRORS.tooLong)
})

test('길이는 정리 후 기준으로 잰다 — 공백 때문에 상한에 걸리지 않게', () => {
  const padded = `   ${'가'.repeat(MAX_COMMENT_LENGTH)}   `
  assert.equal(validateComment(padded).ok, true)
})

test('이모지는 한 글자로 센다 — 서로게이트 쌍이 두 글자로 잡히면 상한이 절반이 된다', () => {
  assert.equal(commentLength('👍'), 1)
  assert.equal(commentLength('확인했습니다 👍'), 8)   // 여섯 글자 + 공백 + 이모지
})

test('통과한 댓글은 정리된 본문을 함께 돌려준다 — 저장할 값이 곧 검증된 값', () => {
  const result = validateComment('  확인했습니다  ')
  assert.equal(result.ok, true)
  assert.equal(result.body, '확인했습니다')
  assert.equal(result.error, '')
})

test('새 댓글은 정리된 본문과 작성자를 담는다', () => {
  const payload = newCommentPayload({
    body: '  성적 마감은 금요일까지인가요?  ',
    authorUid: 'u1',
    authorName: '김국어',
  })
  assert.equal(payload.body, '성적 마감은 금요일까지인가요?')
  assert.equal(payload.authorUid, 'u1')
  assert.equal(payload.authorName, '김국어')
  // createdAt은 호출부가 serverTimestamp로 채우므로 여기서 만들지 않는다
  assert.equal('createdAt' in payload, false)
})

test('이름이 없어도 payload는 만들어진다 — 이름 미설정 계정이 댓글을 못 다는 일은 없어야 한다', () => {
  assert.equal(newCommentPayload({ body: 'x', authorUid: 'u1' }).authorName, '')
})

test('빈 댓글로는 payload를 만들 수 없다 — 화면 검증이 뚫려도 저장되지 않게', () => {
  assert.throws(
    () => newCommentPayload({ body: '   ', authorUid: 'u1', authorName: '김국어' }),
    { message: COMMENT_ERRORS.empty },
  )
})

test('본문이 평문으로 저장된다 — 태그를 넣어도 해석 없이 글자 그대로 남는다', () => {
  // HTML을 걸러내지 않는 대신 화면에서 텍스트로만 그린다. 저장 값이 입력과 같아야
  // "정화했겠지" 하고 어딘가에서 dangerouslySetInnerHTML로 그리는 실수를 막을 수 있다.
  const raw = '<script>alert(1)</script>'
  assert.equal(newCommentPayload({ body: raw, authorUid: 'u1' }).body, raw)
})

const comment = { authorUid: 'u1', body: '확인했습니다' }

test('본인 댓글은 지울 수 있고 남의 댓글은 못 지운다', () => {
  assert.equal(canDeleteComment(comment, { uid: 'u1' }), true)
  assert.equal(canDeleteComment(comment, { uid: 'u2' }), false)
})

test('관리자는 남의 댓글도 지울 수 있다 — 부적절한 내용을 치울 사람이 필요하다', () => {
  assert.equal(canDeleteComment(comment, { uid: 'u2', isAdmin: true }), true)
})

test('로그인하지 않았거나 댓글이 없으면 삭제 권한도 없다', () => {
  assert.equal(canDeleteComment(comment, { uid: null }), false)
  assert.equal(canDeleteComment(comment, {}), false)
  assert.equal(canDeleteComment(null, { uid: 'u1', isAdmin: true }), false)
  assert.equal(canDeleteComment(comment), false)
})

test('댓글은 오래된 것부터 — 위에서 아래로 읽는 대화 순서', () => {
  const list = [
    { body: '셋째', createdAt: new Date('2026-07-31T10:00:00') },
    { body: '첫째', createdAt: new Date('2026-07-30T09:00:00') },
    { body: '둘째', createdAt: new Date('2026-07-30T15:00:00') },
  ]
  assert.deepEqual(sortComments(list).map(c => c.body), ['첫째', '둘째', '셋째'])
})

test('Firestore Timestamp 형태도 받는다', () => {
  const ts = (iso) => ({ toDate: () => new Date(iso) })
  const list = [
    { body: '나중', createdAt: ts('2026-07-31T10:00:00') },
    { body: '먼저', createdAt: ts('2026-07-30T10:00:00') },
  ]
  assert.deepEqual(sortComments(list).map(c => c.body), ['먼저', '나중'])
})

test('시각이 아직 없는 댓글은 맨 뒤 — 방금 쓴 댓글이 맨 위로 튀지 않게', () => {
  // serverTimestamp()는 서버 왕복 전까지 null로 보인다
  const list = [
    { body: '기존', createdAt: new Date('2026-07-30T09:00:00') },
    { body: '방금 쓴 것', createdAt: null },
  ]
  assert.deepEqual(sortComments(list).map(c => c.body), ['기존', '방금 쓴 것'])
})

test('빈 목록과 원본 보존', () => {
  assert.deepEqual(sortComments([]), [])
  assert.deepEqual(sortComments(), [])

  const original = [
    { body: 'b', createdAt: new Date('2026-07-31') },
    { body: 'a', createdAt: new Date('2026-07-30') },
  ]
  sortComments(original)
  assert.deepEqual(original.map(c => c.body), ['b', 'a'])  // 원본은 그대로
})
