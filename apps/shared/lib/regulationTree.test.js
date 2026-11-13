/**
 * 규정 노드 트리·참조·검색·신구대조 검증.
 *   node --test apps/shared/lib/regulationTree.test.js
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { collectRefs, guessCategory, indexNodes, nodePath, nodeRefLabel, refText, refToken, renumber, resolvePlain, splitRefs, tocOf } from './regulationTree.js'
import { buildSearchEntries, highlight, packIndex, queryTerms, replaceRegEntries, searchRegulations } from './regulationSearch.js'
import { changeSummary, comparisonRows, diffNodes, rowsToText, tokenDiff } from './regulationDiff.js'

// 학생생활지도 규정 일부(2026.6.24. 개정 전 모양)
const life = () => [
  { id: 'c7', parent: null, type: 'chapter', num: '7', title: '학생생활평점제 규정' },
  { id: 'a57', parent: 'c7', type: 'article', num: '57', title: '시행 및 결과 처리', text: '' },
  { id: 'a57p7', parent: 'a57', type: 'paragraph', num: '7', text: '담임교사는 벌점을 받은 학생을 수시로 상담, 지도한다.' },
  { id: 'a57p8', parent: 'a57', type: 'paragraph', num: '8', text: '20점 이상의 벌점을 받은 학생의 경우에는 담임교사가 학교생활기록부의 <행동발달상황> 란에 이 사실을 반영하여 기록하고' },
  { id: 'a57p9', parent: 'a57', type: 'paragraph', num: '9', text: '상을 받은 학생은 학교생활기록부의 <수상기록> 란에 기록한다.' },
  { id: 'a63', parent: 'c7', type: 'article', num: '63', title: '벌점의 활용', text: '' },
  { id: 'a63p1', parent: 'a63', type: 'paragraph', num: '1', text: '벌점의 누적으로 인해 징계를 받았다하더라도 벌점은 소멸되지 않는다.' },
  { id: 'a63p3', parent: 'a63', type: 'paragraph', num: '3', text: '부과된 누적 벌점이 15점 이상인 학생의 학부모는 내교하여 안전인성교육부 교사와의 면담을 실시하여야 한다.' },
  { id: 'a63p4', parent: 'a63', type: 'paragraph', num: '4', text: '제3항에 따른 면담 결과는 제57조제7항에 따라 담임교사에게 알린다.' },
  { id: 'add', parent: null, type: 'addendum', date: '2023. 12. 27.' },
  { id: 'add1', parent: 'add', type: 'article', num: '1', title: '', text: '이 규정은 2023년 12월 27일부터 시행한다' },
]

test('트리: 위치 이름·목차(부칙 안 조 제외)·분류 짐작', () => {
  const { byId } = indexNodes(life())
  assert.equal(nodeRefLabel(byId, 'a63p3'), '제63조제3항')
  assert.equal(nodePath(byId, 'a63p3'), '제63조 ③')
  assert.equal(nodePath(byId, 'add1'), '부칙 제1조')
  const toc = tocOf(life())
  assert.deepEqual(toc.map((t) => t.id), ['c7', 'a57', 'a63', 'add'])
  assert.equal(guessCategory('학생생활지도 규정'), 'student')
  assert.equal(guessCategory('학업성적 관리 규정'), 'academic')
  assert.equal(guessCategory('학교운영위원회 규정'), 'committee')
  assert.equal(guessCategory('상조회칙', true), 'reference')
})

test('번호 다시 매기기: 항을 지우면 뒤 항이 당겨지고, id는 그대로', () => {
  const nodes = life().filter((n) => n.id !== 'a57p8')
  const { nodes: out, changes } = renumber(nodes)
  assert.equal(out.find((n) => n.id === 'a57p9').num, '2') // 이 조각에서는 ⑦⑨ → ①②
  assert.ok(changes.some((c) => c.id === 'a57p9' && c.to === '②'))
  assert.equal(out.find((n) => n.id === 'a57').num, '1')
  assert.equal(out.find((n) => n.id === 'add1').num, '1') // 부칙 조는 따로
})

test('참조: 글자 참조 찾기·법령 참조 건너뛰기·고정 링크', () => {
  const segs = splitRefs('제3항에 따른 면담 결과는 제57조제7항에 따라 「초·중등교육법」 제31조 및 「학칙」 제9조를 따른다.')
  const plains = segs.filter((s) => s.plain).map((s) => s.plain)
  assert.deepEqual(plains, [
    { relative: true, paragraph: '3' },
    { reg: null, article: '57', paragraph: '7' },
    { reg: '학칙', article: '9' },
  ])
  const nodes = life()
  const { byId } = indexNodes(nodes)
  const findReg = (name) => (name === '학칙' ? { id: 'rHak', toc: [{ type: 'article', id: 'h9', num: '9' }] } : null)
  assert.deepEqual(resolvePlain(plains[1], { regId: 'rLife', byId, findReg }), { regId: 'rLife', nodeId: 'a57p7' })
  assert.deepEqual(resolvePlain(plains[0], { regId: 'rLife', byId, articleId: 'a63', findReg }), { regId: 'rLife', nodeId: 'a63p3' })
  assert.deepEqual(resolvePlain(plains[2], { regId: 'rLife', byId, findReg }), { regId: 'rHak', nodeId: 'h9' })
  // 고정 링크는 지금 번호로 다시 그린다
  const tok = splitRefs(`위반 시 ${refToken('rLife', 'a63p3')}에 따른다`)
  assert.deepEqual(tok[1].ref, { regId: 'rLife', nodeId: 'a63p3' })
  const renum = renumber(nodes.filter((n) => n.id !== 'a63p1')).nodes
  const ctx = { regId: 'rOther', regTitle: () => '학생생활지도 규정', byIdOf: () => indexNodes(renum).byId }
  assert.equal(refText(tok[1].ref, ctx), '「학생생활지도 규정」 제2조제1항')
  // 인용 모으기 — 자기 조 안(제63조 ④ → 제3항)은 빼고, 제57조제7항은 남는다
  const refs = collectRefs('rLife', nodes, findReg)
  assert.deepEqual(refs, [{ from: 'a63', to: { regId: 'rLife', nodeId: 'a57p7' } }])
})

test('검색: 조사 떼기·조문 지정·강조·색인 나누기', () => {
  assert.deepEqual(queryTerms('벌점 15점이면 학부모가 어떻게 되나요?'), ['벌점', '15점', '학부모'])
  const entries = buildSearchEntries('rLife', life())
  const regs = [{ id: 'rLife', title: '학생생활지도 규정', toc: tocOf(life()) }]
  const { results } = searchRegulations(entries, '누적 벌점 15점 학부모 면담', { regs })
  assert.equal(results[0].a, 'a63')
  assert.equal(results[0].hits[0].n, 'a63p3')
  assert.equal(results[0].hits[0].p, '제63조 ③')
  const pinned = searchRegulations(entries, '학생생활지도규정 제57조', { regs })
  assert.equal(pinned.results[0].a, 'a57')
  const hl = highlight('누적 벌점이 15점', ['벌점', '15점'])
  assert.deepEqual(hl.filter((h) => h.hit).map((h) => h.text), ['벌점', '15점'])
  assert.equal(packIndex(entries, 120).length > 1, true)
  assert.equal(replaceRegEntries(entries, 'rLife', []).length, 0)
})

test('낱말 비교: 「내교하여」 삭제', () => {
  const d = tokenDiff('학부모는 내교하여 안전인성교육부 교사와의', '학부모는 안전인성교육부 교사와의')
  assert.deepEqual(d.old.filter((s) => s.mark).map((s) => s.t.trim()), ['내교하여'])
  assert.equal(d.new.some((s) => s.mark), false)
})

test('신구대조표: 2026.6.24. 학운위 안건 — 제57조 ⑧ 삭제, 제63조 ③ 수정, 신설 조', () => {
  const before = life()
  const after = before
    .filter((n) => n.id !== 'a57p8')
    .map((n) => (n.id === 'a63p3' ? { ...n, text: '부과된 누적 벌점이 15점 이상인 학생의 학부모는 안전인성교육부 교사와의 면담을 실시하여야 한다.' } : n))
  after.splice(after.findIndex((n) => n.id === 'add'), 0, { id: 'a64', parent: 'c7', type: 'article', num: '64', title: '개인형 이동장치', text: '개인형 이동장치(PM) 탑승은 금지한다.' })
  const d = diffNodes(before, after)
  assert.deepEqual(d, { added: ['a64'], deleted: ['a57p8'], modified: ['a63p3'], moved: [] })
  const rows = comparisonRows(before, after)
  assert.deepEqual(rows.map((r) => [r.label, r.status]), [['제57조', 'modified'], ['제63조', 'modified'], ['제64조', 'added']])
  const text = rowsToText(rows)
  assert.match(text, /\[-⑧ 20점 이상의 벌점을/)
  assert.match(text, /⑧ \{\+<삭 제>\+\}/)
  assert.match(text, /\[-내교하여 -\]안전인성교육부/)
  assert.match(text, /<신 설>/)
  // 바뀌지 않은 항은 (생 략)으로 접힌다
  assert.equal(rows[1].new.filter((l) => l.omit).length, 2)
  // 작업 기록 요약
  const s = changeSummary(before, after)
  assert.deepEqual(s.map((x) => [x.action, x.label]), [['add', '제64조'], ['modify', '제63조제3항'], ['delete', '제57조제8항']])
})

test('신구대조표: 번호만 유지하고 지우기(「제57조 ⑧ 삭제」)', () => {
  const before = life()
  const after = before.map((n) => (n.id === 'a57p8' ? { ...n, deleted: true } : n))
  const rows = comparisonRows(before, after)
  assert.equal(rows.length, 1)
  assert.match(rowsToText(rows), /⑧ \{\+삭제\+\}/)
})

// ── 편집 ────────────────────────────────────────────────────────
import { convertPlainRefs, insertAfter, insertChild, markDeleted, moveNode, newBranchArticle, newNode, removeNode, subtreeEnd } from './regulationEdit.js'
import { refTextOf } from './regulationDiff.js'

test('편집: 자손째 넣기·지우기·옮기기·가지 조', () => {
  let k = 0
  const idGen = () => `x${++k}`
  const nodes = life()
  assert.equal(subtreeEnd(nodes, 1), 5) // 제57조 + 항 3개
  const p = newNode(nodes, 'paragraph', 'a57', { idGen })
  assert.equal(p.num, '10')
  const added = insertChild(nodes, 'a57', p)
  assert.equal(added[5].id, 'x1')
  const art = newNode(nodes, 'article', 'c7', { idGen })
  assert.equal(art.num, '64')
  assert.equal(insertAfter(nodes, 'a57', art)[5].id, 'x2') // 제57조 하위 다음
  assert.deepEqual(removeNode(nodes, 'a57').map((n) => n.id).slice(0, 2), ['c7', 'a63'])
  const moved = moveNode(nodes, 'a63', -1)
  assert.deepEqual(moved.filter((n) => n.type === 'article' && n.parent === 'c7').map((n) => n.id), ['a63', 'a57'])
  assert.equal(moved.findIndex((n) => n.id === 'a57p7') > moved.findIndex((n) => n.id === 'a63p4'), true)
  const br = newBranchArticle(nodes, 'a57', { idGen })
  const b = br.find((n) => n.branch)
  assert.deepEqual([b.num, b.branch, br.indexOf(b)], ['57', '2', 5]) // 제57조 하위 다음
  const del = markDeleted(nodes, 'a57')
  assert.equal(del.find((n) => n.id === 'a57').deleted, true)
  assert.equal(del.some((n) => n.parent === 'a57'), false)
})

test('편집: 글자 참조를 고정 링크로 바꾸면 번호가 밀려도 따라가고, 대조표에는 바뀜으로 안 나온다', () => {
  const nodes = life()
  const { nodes: linked, count } = convertPlainRefs(nodes, 'rLife', () => null)
  assert.equal(count, 2) // 제3항, 제57조제7항
  const p4 = linked.find((n) => n.id === 'a63p4')
  assert.match(p4.text, /\{\{ref:rLife\/a63p3\}\}에 따른 면담 결과는 \{\{ref:rLife\/a57p7\}\}/)
  // 고정 링크로 바꾸기만 한 것은 신구대조표에 안 나온다
  const textOf = refTextOf({ regId: 'rLife', oldNodes: nodes, newNodes: linked })
  assert.equal(comparisonRows(nodes, linked, { textOf }).length, 0)
  // 제63조 ①을 지우고 번호를 다시 매기면 ④의 「제3항」이 새 번호로 따라간다
  const after = renumber(linked.filter((n) => n.id !== 'a63p1')).nodes
  const tf = refTextOf({ regId: 'rLife', oldNodes: linked, newNodes: after })
  const rows = comparisonRows(linked, after, { textOf: tf })
  // (이 조각에서는 ③④가 ①②가 되므로 「제3항」 → 「제1항」, 제57조제7항 → 제1조제1항)
  assert.match(rowsToText(rows), /제\{\+1\+\}항에 따른 면담 결과는 제\{\+1\+\}조제\{\+1\+\}항/)
})

test('AI 청크: 조 단위로 묶고 출처를 앞에 붙인다', async () => {
  const { buildRegulationChunks } = await import('./regulationSearch.js')
  const chunks = buildRegulationChunks({ regId: 'rLife', regTitle: '학생생활지도 규정', nodes: life(), effectiveDate: '2026-06-24', versionId: 'v1' })
  const c63 = chunks.find((c) => c.a === 'a63')
  assert.equal(c63.id, 'rLife_a63')
  assert.match(c63.text, /^「학생생활지도 규정」 제63조\n제63조\(벌점의 활용\)\n벌점의 누적/)
  assert.equal(c63.text.split('\n').length, 5) // 머리 + 조 제목 + 항 3개
})

// ── 위계 ────────────────────────────────────────────────────────
import { childrenOf, dependentsOf, findLaws, hierarchyTree, lawIndex, suggestHierarchy } from './regulationHierarchy.js'

test('위계: 상위 법령 찾기 — 낫표·낫표 없는 법률·대통령령 규정·조례, 학교 규정·「방법」은 빼고', () => {
  const laws = findLaws('본교는 교육기본법 및 초‧중등교육법에 의하여 … 「조기진급 등에 관한 규정」(대통령령 제27751호)에 따라 … 「서울특별시립학교운영위원회 구성 및 운영 등에 관한 조례」 제21조 … 평가 방법은 「학칙」을 따른다', ['학칙'])
  assert.deepEqual(laws.map((l) => [l.name, l.article || null]), [
    ['조기진급 등에 관한 규정', null],
    ['서울특별시립학교운영위원회 구성 및 운영 등에 관한 조례', '21'],
    ['교육기본법', null],
    ['초‧중등교육법', null],
  ])
  assert.match(laws[2].url, /^https:\/\/www\.law\.go\.kr\/법령\//)
  assert.match(laws[1].url, /자치법규/)
})

test('위계: 제안 — 학칙이 맡긴 회칙, 세칙은 회칙 아래, 「…규정 제21조」 근거는 그 규정 아래', () => {
  const art = (id, num, text, parent = null) => ({ id, parent, type: 'article', num, title: '', text })
  const regs = [
    { id: 'rule', title: '학칙', nodes: [art('h1', '1', '본교는 초‧중등교육법에 의하여'), art('h32', '32', '학생회의 조직 및 운영에 관한 세부 사항은 학생회칙으로 정한다.')] },
    { id: 'sc', title: '학교운영위원회 규정', nodes: [art('s1', '1', '「초․중등교육법」 제31조에 따라'), art('s21', '21', '소위원회를 둘 수 있다.')] },
    { id: 'council', title: '학생회 회칙', nodes: [art('c1', '1', '본 회는 학생회라 칭한다'), art('c2', '2', '학생회 운영 세칙을 둔다')] },
    { id: 'detail', title: '학생회 운영 세칙', nodes: [art('d1', '1', '본 세칙은 학생회 운영에 관한 세부 사항')] },
    { id: 'lunch', title: '학교급식소위원회 규정', nodes: [art('l1', '1', '서울특별시립학교운영위원회 구성 및 운영 등에 관한 조례 제21조 및 선유고등학교운영위원회 규정 제 21조 제 1항에 따라')] },
    { id: 'mutual', title: '상조회칙', reference: true, nodes: [art('m1', '1', '본회는 상조회라 칭한다')] },
    { id: 'guide', title: '교원 휴가 및 복무규정', reference: true, nodes: [{ id: 'g1', parent: null, type: 'text', text: '□ 재직기간 별 연가 일수' }] },
  ]
  const s = suggestHierarchy(regs)
  assert.deepEqual([...s].map(([id, v]) => [id, v.level, v.parentId]), [
    ['rule', 'rule', null], ['sc', 'regulation', 'rule'], ['council', 'regulation', 'rule'], ['detail', 'sub', 'council'],
    ['lunch', 'sub', 'sc'], ['mutual', 'bylaw', null], ['guide', 'guide', null],
  ])
  assert.deepEqual(s.get('council').basis, [{ kind: 'reg', regId: 'rule', nodeId: 'h32', label: '학칙 제32조' }])
  assert.deepEqual(s.get('lunch').basis.find((b) => b.kind === 'reg'), { kind: 'reg', regId: 'sc', nodeId: 's21', label: '학교운영위원회 규정 제21조 제1항' })
  // 트리·하위·영향·법령 모음
  const book = regs.map((r, i) => ({ id: r.id, title: r.title, order: i, ...s.get(r.id) }))
  book.push({ id: 'dead', title: '급식비 징수 및 환불 규정', order: 9, level: 'regulation', parentId: 'rule', status: 'repealed', basis: [] })
  const tree = hierarchyTree(book)
  assert.equal(tree.roots[0].reg.id, 'rule')
  assert.deepEqual(tree.roots[0].children.map((c) => c.reg.id), ['sc', 'council'])
  assert.deepEqual(tree.roots[0].children[1].children.map((c) => c.reg.id), ['detail'])
  assert.deepEqual([tree.guides.length, tree.bylaws.length, tree.repealed.length], [1, 1, 1])
  assert.deepEqual(childrenOf(book, 'sc').map((r) => r.id), ['lunch'])
  assert.deepEqual(dependentsOf(book, 'rule', ['h32']).map((d) => d.regId), ['council'])
  assert.deepEqual(dependentsOf(book, 'rule', ['h1']), [])
  assert.equal(lawIndex(book).find((l) => l.name === '초‧중등교육법')?.refs.length, 2) // 가운뎃점 모양이 달라도 같은 법
})

test('목차: 조문 없는 안내형 문서는 머리 줄(□·1.)로', () => {
  const nodes = [
    { id: 't1', parent: null, type: 'text', text: '□ 재직기간 별 연가 일수 (국가공무원 복무규정 제15조)' },
    { id: 't2', parent: null, type: 'table', rows: [{ cells: [{ text: '재직기간' }] }] },
    { id: 't3', parent: null, type: 'item', num: '1', text: '목적' },
    { id: 't4', parent: 't3', type: 'text', text: '교원의 복무를 정한다.' },
  ]
  assert.deepEqual(tocOf(nodes).map((t) => [t.id, t.type, t.title]), [['t1', 'heading', '재직기간 별 연가 일수 (국가공무원 복무규정 제15조)'], ['t3', 'heading', '1. 목적']])
})

test('참조 미리보기: 조를 가리키면 조 전체, 항을 가리키면 조 머리 + 그 항, 넘치면 자른다', async () => {
  const { nodePreview } = await import('./regulationTree.js')
  const idx = indexNodes(life())
  const art = nodePreview(idx, 'a57')
  assert.equal(art.title, '제57조')
  assert.deepEqual(art.lines.map((l) => [l.depth, l.text.slice(0, 6)]), [[0, '제57조(시'], [1, '⑦ 담임교사'], [1, '⑧ 20점 '], [1, '⑨ 상을 받']])
  const para = nodePreview(idx, 'a63p3')
  assert.equal(para.title, '제63조제3항')
  assert.deepEqual(para.lines.map((l) => [l.depth, l.text.slice(0, 7), !!l.focus]), [[0, '제63조(벌점', false], [1, '③ 부과된 누', true]])
  const cut = nodePreview(idx, 'a57', { maxLines: 2 })
  assert.equal(cut.lines.length, 2)
  assert.equal(cut.more, true)
  assert.equal(nodePreview(idx, 'nope'), null)
})
