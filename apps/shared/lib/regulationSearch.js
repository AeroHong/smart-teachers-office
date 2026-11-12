/**
 * 규정집 검색 — 색인 만들기·나누기·찾기 (Codex-Edu, 2026-11).
 *
 * 색인은 노드마다 한 줄 { r(규정 id), n(노드 id), a(조 id — 결과를 조 단위로 묶는 열쇠), p(위치 「제63조 ③」), t(글), h?(장·절 제목줄) }.
 * 개정을 확정할 때 그 규정 줄만 바꿔 regulationSearch 문서(묶음 몇 개)로 다시 쓴다. 화면은 이걸 한 번 읽어 캐시하고
 * 브라우저 안에서 찾는다 — 검색할 때마다 Firestore를 읽지 않는다. 도우미(챗봇) 1단계와 AI 답변의 근거 찾기도 같은 함수.
 */
import { indexNodes, nodePath, plainText, tableText, unitOf, articleHeading } from './regulationTree.js'

const titleOrEmpty = (n) => n.title || ''

/** 규정 하나 → 색인 줄 */
export function buildSearchEntries(regId, nodes, refCtx) {
  const { byId } = indexNodes(nodes)
  const out = []
  for (const n of nodes) {
    if (n.deleted) continue
    let t
    if (n.type === 'table') t = tableText(n)
    else if (n.type === 'article') t = `${articleHeading(n)} ${plainText(n.text, refCtx)}`.trim()
    else if (n.type === 'chapter' || n.type === 'section') t = `제${n.num}${n.type === 'chapter' ? '장' : '절'} ${titleOrEmpty(n)}`
    else if (n.type === 'appendix') t = titleOrEmpty(n)
    else if (n.type === 'addendum') continue
    else t = plainText(n.text, refCtx)
    if (!t || !t.trim()) continue
    const unit = unitOf(byId, n.id)
    const head = n.type === 'chapter' || n.type === 'section' || n.type === 'appendix'
    out.push({ r: regId, n: n.id, a: unit?.id || n.id, p: nodePath(byId, n.id), t: t.replace(/\s+/g, ' ').trim(), ...(head ? { h: 1 } : {}) })
  }
  return out
}

/** UTF-8 바이트 수 — Firestore 문서 한도(1MiB)는 바이트로 센다(한글 한 글자 3바이트) */
export function utf8Bytes(s) {
  let n = 0
  for (const ch of String(s)) { const c = ch.codePointAt(0); n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4 }
  return n
}

/** 색인 줄을 Firestore 문서 크기 안으로 나눈다(바이트 기준, 1MiB 한도에 여유를 둔 80만 바이트) */
export function packIndex(entries, maxBytes = 800_000) {
  const parts = [[]]
  let size = 0
  for (const e of entries) {
    const s = utf8Bytes(e.t) + utf8Bytes(e.p) + 80
    if (size + s > maxBytes && parts[parts.length - 1].length) { parts.push([]); size = 0 }
    parts[parts.length - 1].push(e)
    size += s
  }
  return parts
}

/** 색인에서 한 규정의 줄만 바꾼다 */
export function replaceRegEntries(entries, regId, fresh) {
  return [...entries.filter((e) => e.r !== regId), ...fresh]
}

// ── 찾기 ────────────────────────────────────────────────────────

const compact = (s) => String(s || '').replace(/\s+/g, '').toLowerCase()

// 물음에서 뺄 말 — 「벌점 20점이면 어떻게 되나요?」 → 벌점, 20점
const STOP = new Set(['어떻게', '어떤', '무엇', '뭐', '뭔가요', '되나요', '하나요', '있나요', '인가요', '알려줘', '알려주세요', '궁금', '궁금해요', '관련', '규정', '내용', '경우', '때', '수', '있는', '하는', '대한', '관한', '좀', '그', '이', '저', '은', '는', '이면', '면', '찾아줘', '어디', '몇'])
const JOSA = /(으로써|으로서|에서는|에게는|이라면|이라고|이면은|에서|에게|으로|이랑|하고|이면|라면|부터|까지|마다|보다|처럼|은요|는요|이요|은|는|이|가|을|를|에|의|도|만|로|와|과|면|요)$/

/** 물음 → 찾을 말 목록 */
export function queryTerms(q) {
  const raw = String(q || '').replace(/[?？!.,·「」『』()"'~]/g, ' ').split(/\s+/).filter(Boolean)
  const out = []
  for (let w of raw) {
    if (STOP.has(w)) continue
    if (w.length >= 3 && !/^제\d/.test(w)) w = w.replace(JOSA, '')
    else if (w.length === 2 && /[은는이가을를에의도면]$/.test(w) && !/\d/.test(w)) w = w.slice(0, 1)
    if (!w || STOP.has(w) || (w.length < 2 && !/\d/.test(w))) continue
    out.push(compact(w))
  }
  return [...new Set(out)]
}

/** 「학업성적관리규정 제5조」·「학칙 9조」 같은 조문 지정 */
export function parseArticleQuery(q) {
  const m = String(q || '').match(/^(.*?)\s*제?\s*(\d+)\s*조(?:\s*의\s*(\d+))?/)
  if (!m) return null
  return { reg: m[1].replace(/[「」『』\s]/g, '') || null, article: m[2], branch: m[3] || null }
}

/**
 * @param {object[]} entries 색인 줄
 * @param {string} q
 * @param {{ regs: {id, title, toc?}[], limit?: number, regId?: string }} opts regId를 주면 그 규정 안에서만
 * @returns {{ terms: string[], results: { r, a, score, title, hits: {n, p, t}[] }[] }}
 */
export function searchRegulations(entries, q, { regs = [], limit = 30, regId = null } = {}) {
  const terms = queryTerms(q)
  const titleOf = new Map(regs.map((r) => [r.id, r.title]))
  const byUnit = new Map()
  const add = (e, score) => {
    let u = byUnit.get(e.a)
    if (!u) { u = { r: e.r, a: e.a, score: 0, best: 0, hits: [] }; byUnit.set(e.a, u) }
    u.hits.push({ n: e.n, p: e.p, t: e.t, s: score })
    u.best = Math.max(u.best, score)
    u.score = u.best + 0.25 * (u.hits.length - 1)
  }

  // 조문 지정 — 규정 이름이 닮고 조 번호가 같으면 맨 위
  const aq = parseArticleQuery(q)
  const pinned = new Set()
  if (aq) {
    for (const r of regs) {
      if (regId && r.id !== regId) continue
      if (aq.reg && !compact(r.title).includes(compact(aq.reg).replace(/규정$/, '')) && !compact(aq.reg).includes(compact(r.title))) continue
      const art = (r.toc || []).find((t) => t.type === 'article' && String(t.num) === aq.article && String(t.branch || '') === String(aq.branch || ''))
      if (art) pinned.add(art.id)
    }
  }

  if (!terms.length && !pinned.size) return { terms, results: [] }
  const regTitleHit = new Map(regs.map((r) => [r.id, terms.filter((t) => compact(r.title).includes(t)).length]))
  for (const e of entries) {
    if (regId && e.r !== regId) continue
    const text = compact(e.t)
    let matched = 0; let score = 0
    for (const t of terms) {
      if (text.includes(t)) { matched++; score += Math.min(t.length, 6) }
    }
    const regHit = regTitleHit.get(e.r) || 0
    if (pinned.has(e.a)) { add(e, 1000 + score); continue }
    if (!matched) continue
    // 제목줄(조 제목) 맞으면 더, 모든 말이 다 맞으면 두 배, 규정 이름에 말이 들어 있으면 조금 더
    if (e.n === e.a && !e.h) score += 2
    // 장·절 제목줄은 결과로 덜 쓸모 있다 — 그 장의 조문이 먼저 나오게
    if (e.h) score *= 0.5
    if (matched === terms.length) score *= 2
    score += regHit * 2
    add(e, score)
  }
  const results = [...byUnit.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((u) => ({ r: u.r, a: u.a, score: u.score, title: titleOf.get(u.r) || '', hits: u.hits.sort((x, y) => y.s - x.s).slice(0, 4).map(({ n, p, t }) => ({ n, p, t })) }))
  return { terms, results }
}

/** 글에서 찾은 말 위치 — 화면 강조용 [{ text, hit }] (띄어쓰기가 달라도 맞춘다) */
export function highlight(text, terms) {
  const s = String(text || '')
  if (!terms?.length) return [{ text: s, hit: false }]
  // 글자 → 띄어쓰기 뺀 위치 대응
  const map = []
  let c = ''
  for (let i = 0; i < s.length; i++) if (!/\s/.test(s[i])) { map.push(i); c += s[i].toLowerCase() }
  const marks = new Array(s.length).fill(false)
  for (const t of terms) {
    let from = 0
    while (t && (from = c.indexOf(t, from)) >= 0) {
      // 맞은 글자와, 그 사이에 낀 띄어쓰기까지 칠한다
      for (let x = map[from]; x <= map[from + t.length - 1]; x++) marks[x] = true
      from += t.length
    }
  }
  const out = []
  for (let i = 0; i < s.length; i++) {
    const last = out[out.length - 1]
    if (last && last.hit === marks[i]) last.text += s[i]
    else out.push({ text: s[i], hit: marks[i] })
  }
  return out
}
