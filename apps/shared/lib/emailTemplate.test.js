/**
 * 이메일 브랜딩 템플릿 검증.
 *
 * functions/emailSend.js가 이 파일을 그대로 손으로 복제해 쓰므로(별도 npm 패키지라
 * import 불가), 적어도 이쪽의 출력 규칙(이스케이프·구조)이 맞는지는 여기서 잡는다.
 *
 *   node --test apps/shared/lib/emailTemplate.test.js
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildEmailHtml } from './emailTemplate.js'

test('학교명과 본문이 포함된다', () => {
  const html = buildEmailHtml('선유고등학교', '<p>안녕하세요</p>')
  assert.match(html, /선유고등학교/)
  assert.match(html, /<p>안녕하세요<\/p>/)
  assert.match(html, /본 메일은 선유고등학교에서 발송되었습니다\./)
})

test('발신 교사 이름은 본문에 중복 표기하지 않는다 — Gmail 보낸사람 표시로 이미 나온다', () => {
  const html = buildEmailHtml('선유고등학교', '<p>내용</p>')
  assert.doesNotMatch(html, /드림/)
})

test('학교명에 포함된 HTML 특수문자를 이스케이프한다 — bodyHtml은 이미 걸러진 서식이라 그대로 둔다', () => {
  const html = buildEmailHtml('<b>학교</b>', '<p>내용</p>')
  assert.doesNotMatch(html, /<b>학교<\/b>/)
  assert.match(html, /&lt;b&gt;학교&lt;\/b&gt;/)
  assert.match(html, /<p>내용<\/p>/)
})

test('이메일 클라이언트 호환을 위해 table 기반 레이아웃만 쓴다 — flex/grid 없음', () => {
  const html = buildEmailHtml('학교', '<p>내용</p>')
  assert.match(html, /<table/)
  assert.doesNotMatch(html, /display:\s*flex/)
  assert.doesNotMatch(html, /display:\s*grid/)
})
