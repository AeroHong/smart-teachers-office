/**
 * 배포 갱신 감지 검증.
 *   node --test apps/shared/lib/appVersion.test.js
 *
 * 여기서 잡으려는 것은 "헛띄움"이다. 아무 일도 없는데 새로고침 띠가 한 번 뜨면 그
 * 다음부터는 진짜 배포가 있어도 아무도 안 누른다. 네트워크가 끊기거나 학교 망이 응답을
 * 가로채 이상한 문서를 돌려주는 경우가 실제로 있으므로(빌드 도구 다운로드가 가로채진
 * 전례가 있다) 그때 조용히 넘어가는지를 본다.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { isOutdated, signatureFrom, signatureFromHtml } from './appVersion.js'

const html = (...srcs) => `<!doctype html><html><head>${
  srcs.map(s => `<script type="module" crossorigin src="${s}"></script>`).join('')
}</head><body><div id="root"></div></body></html>`

test('index.html에서 번들 이름을 뽑는다', () => {
  assert.equal(signatureFromHtml(html('/assets/index-c1Ui3EDA.js')), 'index-c1Ui3EDA.js')
})

test('내용이 바뀌어 해시가 달라지면 다른 서명이 된다', () => {
  const before = signatureFromHtml(html('/assets/index-AAAA1111.js'))
  const after = signatureFromHtml(html('/assets/index-BBBB2222.js'))
  assert.notEqual(before, after)
  assert.equal(isOutdated(before, after), true)
})

test('같은 배포면 갱신으로 보지 않는다', () => {
  const s = signatureFromHtml(html('/assets/index-c1Ui3EDA.js'))
  assert.equal(isOutdated(s, s), false)
})

test('조각이 여럿이어도 전부 모은다 — 진입 번들만 보면 나머지 변경을 놓친다', () => {
  const s = signatureFromHtml(html('/assets/index-AAAA.js', '/assets/vendor-BBBB.js'))
  assert.equal(s, 'index-AAAA.js|vendor-BBBB.js')

  // 조각 하나만 바뀌어도 잡아야 한다
  const changed = signatureFromHtml(html('/assets/index-AAAA.js', '/assets/vendor-CCCC.js'))
  assert.equal(isOutdated(s, changed), true)
})

test('문서에 적힌 순서가 달라져도 같은 배포로 본다', () => {
  const a = signatureFromHtml(html('/assets/index-AAAA.js', '/assets/vendor-BBBB.js'))
  const b = signatureFromHtml(html('/assets/vendor-BBBB.js', '/assets/index-AAAA.js'))
  assert.equal(a, b)
  assert.equal(isOutdated(a, b), false)
})

test('캐시 무력화용 쿼리가 붙어도 같은 파일로 본다', () => {
  assert.equal(
    signatureFrom(['/assets/index-AAAA.js?_=1700000000']),
    signatureFrom(['/assets/index-AAAA.js']),
  )
})

test('assets 밖의 스크립트는 무시한다 — 폰트·분석 스크립트가 서명을 흔들면 안 된다', () => {
  const s = signatureFromHtml(
    `<script src="https://cdn.example.com/analytics.js"></script>${html('/assets/index-AAAA.js')}`,
  )
  assert.equal(s, 'index-AAAA.js')
})

test('개발 서버처럼 해시 번들이 없으면 빈 서명 — 판정 자체를 하지 않게 된다', () => {
  const dev = signatureFromHtml('<script type="module" src="/src/main.jsx"></script>')
  assert.equal(dev, '')
  assert.equal(isOutdated(dev, 'index-AAAA.js'), false)
  assert.equal(isOutdated('index-AAAA.js', dev), false)
})

test('응답을 못 읽었을 때는 갱신이 아니라고 답한다 — 헛띄움을 막는 마지막 방어선', () => {
  for (const bad of ['', null, undefined]) {
    assert.equal(isOutdated('index-AAAA.js', bad), false)
    assert.equal(isOutdated(bad, 'index-AAAA.js'), false)
  }
  assert.equal(signatureFromHtml(null), '')
  assert.equal(signatureFromHtml('<html>로그인 페이지로 가로채진 응답</html>'), '')
})
