/**
 * 규정집 hwpx 파서 검증.
 *   node --test apps/shared/lib/regulationParse.test.js
 *
 * 작은 합성 XML로 규칙을 하나씩 확인하고, 원본 규정집(codex-edu/docs/, 저장소에 올리지 않음)이 있으면
 * 실제 파일로 규정 31개·조문 499개가 나오는지도 본다(2026.6.24. 개정 포함본 기준).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import { cleanTitle, extractHwpxBlocks, parseRegulation, parseRegulationBook, splitRegulations, titleSimilarity } from './regulationParse.js'

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const P = (text) => `<hp:p id="0" paraPrIDRef="0" styleIDRef="0"><hp:run charPrIDRef="0"><hp:t>${esc(text)}</hp:t></hp:run><hp:linesegarray><hp:lineseg textpos="0"/></hp:linesegarray></hp:p>`
const TC = (text, col, row, colSpan = 1, rowSpan = 1) => `<hp:tc><hp:subList>${P(text)}</hp:subList><hp:cellAddr colAddr="${col}" rowAddr="${row}"/><hp:cellSpan colSpan="${colSpan}" rowSpan="${rowSpan}"/><hp:cellSz width="1" height="1"/></hp:tc>`
const TBL = (rows) => `<hp:p id="0"><hp:run charPrIDRef="0"><hp:tbl id="1">${rows.map((r) => `<hp:tr>${r}</hp:tr>`).join('')}</hp:tbl><hp:t/></hp:run></hp:p>`
const SEC = (...parts) => `<?xml version="1.0"?><hs:sec xmlns:hs="s" xmlns:hp="p">${parts.join('')}</hs:sec>`
let n = 0
const idGen = () => `n${++n}`

test('블록: 본문 문단·표(병합 포함)·머리말 제외·특수 공백', () => {
  const xml = SEC(
    `<hp:p><hp:run><hp:ctrl><hp:header><hp:subList>${P('머리말')}</hp:subList></hp:header></hp:ctrl><hp:t>제1조(목적)<hp:fwSpace/>이 규정은</hp:t></hp:run></hp:p>`,
    TBL([TC('영역', 0, 0, 2), TC('복장', 0, 1) + TC('교복 미착용 <1>', 1, 1)]),
    P('부 칙'),
  )
  const blocks = extractHwpxBlocks(xml)
  assert.deepEqual(blocks.map((b) => b.type), ['p', 'table', 'p'])
  assert.equal(blocks[0].text, '제1조(목적) 이 규정은')
  assert.equal(blocks[1].rows.length, 2)
  assert.equal(blocks[1].rows[0].cells[0].colSpan, 2)
  assert.equal(blocks[1].rows[1].cells[1].text, '교복 미착용 <1>')
})

test('조문 계층: 장 > 조 > 항 > 호 > 목, 같은 줄 첫 항, 가지번호, 부칙', () => {
  n = 0
  const blocks = [
    '제정 2005. 3. 7.', '개    정  2024.  4.  9.',
    '제1장 총칙', '제1조(목적) 이 규정은 목적을 정한다.', '제2조(정의) ① 첫 항이다.', '② 둘째 항이다.', '1. 첫 호', '가. 첫 목', '※ 참고 문단',
    '제2조의2(특례) 특례를 둔다.', '제2장 위원회', '제3조(구성) 위원회를 둔다.',
    '부 칙 (2024. 4. 9.)', '제1조(시행일) 이 규정은 공포한 날부터 시행한다.',
  ].map((text) => ({ type: 'p', text }))
  const { history, nodes } = parseRegulation(blocks, { idGen })
  assert.deepEqual(history, [{ kind: '제정', date: '2005-03-07' }, { kind: '개정', date: '2024-04-09' }])
  const by = (type, num) => nodes.find((x) => x.type === type && x.num === num)
  const ch1 = by('chapter', '1')
  const a2 = nodes.find((x) => x.type === 'article' && x.num === '2' && !x.branch)
  assert.equal(a2.parent, ch1.id)
  assert.equal(a2.title, '정의')
  const p1 = nodes.find((x) => x.type === 'paragraph' && x.parent === a2.id && x.num === '1')
  assert.equal(p1.text, '첫 항이다.')
  const p2 = nodes.find((x) => x.type === 'paragraph' && x.parent === a2.id && x.num === '2')
  const i1 = by('item', '1')
  assert.equal(i1.parent, p2.id)
  assert.equal(by('subitem', '가').parent, i1.id)
  assert.equal(nodes.find((x) => x.type === 'text').parent, by('subitem', '가').id)
  const branch = nodes.find((x) => x.branch === '2')
  assert.equal(branch.num, '2')
  assert.equal(branch.title, '특례')
  const add = nodes.find((x) => x.type === 'addendum')
  assert.equal(add.date, '2024. 4. 9.')
  const addArt = nodes.filter((x) => x.type === 'article' && x.parent === add.id)
  assert.equal(addArt.length, 1)
})

test('규정 경계: 목차 제목·부칙 뒤 새 제목·번호가 1로 돌아감', () => {
  const t = (text) => ({ type: 'p', text })
  const blocks = [
    t('규 정 집'), t('목 차'),
    t('1. 학    칙 ------------- 1'), t('2. 학교운영위원회 규정 ------------ 7'), t('참고1 상조회칙 ------------ 9'),
    t('학   칙'), t('제1장 총 칙'), t('제1조(목적) 목적.'), t('부칙'), t('1. 본 학칙은 2006년부터 시행한다.'),
    t('학교운영위원회 규정'), t('제    정  2005.  3.  7.'), t('제1조(목적) 목적.'), t('제2조(구성) 구성.'),
    t('부칙 (2005. 3. 7.)'), t('제1조(시행일) 시행한다.'),
    t('참고1 상조회칙'), t('□ 안내문'),
  ]
  const { toc, regulations } = splitRegulations(blocks)
  assert.equal(toc.length, 3)
  assert.deepEqual(regulations.map((r) => r.tocIndex), [0, 1, 2])
  // 부칙의 제1조는 새 규정이 아니다
  assert.equal(regulations[1].blocks.filter((b) => /^제1조/.test(b.text)).length, 2)
  assert.ok(regulations[1].blocks.some((b) => /제\s*정/.test(b.text)))
  assert.equal(cleanTitle(regulations[0].title), '학칙')
})

test('제목 닮음 — 목차 제목과 본문 제목이 조금 달라도 맞춘다', () => {
  assert.ok(titleSimilarity('학업성적 관리 규정', '2025학년도 선유고등학교 학업성적관리규정') >= 0.6)
  assert.ok(titleSimilarity('교환·체험학습 규정', '교환 ․ 체험학습 운영규정') >= 0.6)
  assert.ok(titleSimilarity('학칙', '학생회 회칙') < 0.6)
})

// ── 실제 규정집(있을 때만) ─────────────────────────────────────
const DOCS = join(import.meta.dirname, '../../../codex-edu/docs')
const bookFile = existsSync(DOCS) && readdirSync(DOCS).find((f) => f.startsWith('2026학년도 규정집') && f.endsWith('.hwpx'))

test('실제 규정집 2026(6.24. 개정 포함): 목차 30개 → 규정 31개, 조문 499개', { skip: !bookFile && '원본 규정집 없음' }, async () => {
  const zip = await JSZip.loadAsync(readFileSync(join(DOCS, bookFile)))
  const xml = await zip.file('Contents/section0.xml').async('string')
  const book = parseRegulationBook(xml, { idGen })
  assert.equal(book.toc.length, 30)
  assert.equal(book.regulations.length, 31) // 선택 교육과정 편성·운영 규정이 2015·2022 두 개
  assert.equal(book.regulations.reduce((s, r) => s + r.stats.articles, 0), 499)
  // 목차의 모든 항목이 규정 하나씩과 맞았다
  const matched = new Set(book.regulations.map((r) => r.tocIndex).filter((i) => i >= 0))
  assert.equal(matched.size, 30)
  assert.equal(book.regulations[0].title, '학칙')
  // 학생생활지도 규정 제63조 ③ — 2026.6.24. 개정(「내교하여」 삭제)이 반영된 문장
  const life = book.regulations.find((r) => r.title === '학생생활지도 규정')
  const a63 = life.nodes.find((x) => x.type === 'article' && x.num === '63')
  const p3 = life.nodes.find((x) => x.parent === a63.id && x.type === 'paragraph' && x.num === '3')
  assert.equal(p3.text, '부과된 누적 벌점이 15점 이상인 학생의 학부모는 안전인성교육부 교사와의 면담을 실시하여야 한다.')
  // 벌점 기준표(표2)는 제63조 밑의 표로
  assert.ok(life.nodes.some((x) => x.type === 'table' && x.rows.length > 30))
  // 규정 하나가 Firestore 문서 한 건(1MB)에 들어간다
  for (const r of book.regulations) assert.ok(JSON.stringify(r.nodes).length < 600_000, r.title)
})
