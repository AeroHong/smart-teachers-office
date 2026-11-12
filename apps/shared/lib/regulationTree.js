/**
 * 규정 노드(평평한 목록) 다루기 — 트리·번호 표시·목차·번호 다시 매기기·조문 참조 (Codex-Edu, 2026-11).
 * 노드 모양은 regulationParse.js 머리말과 DB_STRUCTURE.md 「규정집」 참고.
 *
 * 조문 참조는 두 가지다.
 *  · 고정 링크 — 본문에 {{ref:규정id/노드id}}를 넣는다. 번호가 바뀌어도 지금 번호로 다시 그린다(편집기에서 넣음)
 *  · 글자 참조 — 원문 그대로의 「학칙」 제9조, 제63조제3항, 제2항 등. 화면에서 그 자리를 찾아 링크로 만든다
 */

export const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳㉑㉒㉓㉔㉕㉖㉗㉘㉙㉚㉛㉜㉝㉞㉟'
export const GANADA = '가나다라마바사아자차카타파하'

export const circled = (n) => CIRCLED[Number(n) - 1] || `(${n})`

/** 분류 — 사이드바 묶음. 가져올 때 제목으로 짐작하고 관리자가 고친다 */
export const CATEGORIES = [
  { key: 'school', label: '학칙·학교 운영' },
  { key: 'academic', label: '교육과정·학업' },
  { key: 'student', label: '학생 생활·자치' },
  { key: 'committee', label: '위원회' },
  { key: 'reference', label: '참고 자료' },
]

export function guessCategory(title, reference = false) {
  const t = String(title || '').replace(/\s/g, '')
  if (reference) return 'reference'
  if (/학생생활|학생회|학급|동아리|학생복지/.test(t)) return 'student'
  if (/학업|성적|교육과정|편입|이수|조기|추천입학|선택|체험학습|교환/.test(t)) return 'academic'
  if (/위원회/.test(t)) return 'committee'
  return 'school'
}

/** { byId, children(부모 id|'' → 자식 목록, 문서 순서) } */
export function indexNodes(nodes) {
  const byId = new Map()
  const children = new Map()
  for (const n of nodes) {
    byId.set(n.id, n)
    const k = n.parent || ''
    if (!children.has(k)) children.set(k, [])
    children.get(k).push(n)
  }
  return { byId, children }
}

/** 조상 목록(가까운 것부터) */
export function ancestors(byId, id) {
  const out = []
  let n = byId.get(id)
  while (n && n.parent) { n = byId.get(n.parent); if (n) out.push(n) }
  return out
}

/** 노드가 들어 있는 조(자기 자신 포함). 조 밖이면 맨 위 노드 */
export function unitOf(byId, id) {
  let n = byId.get(id)
  let top = n
  while (n) {
    if (n.type === 'article') return n
    top = n
    n = n.parent ? byId.get(n.parent) : null
    if (n && (n.type === 'chapter' || n.type === 'section' || n.type === 'addendum' || n.type === 'appendix')) return top
  }
  return top
}

export const articleNo = (n) => `제${n.num}조${n.branch ? `의${n.branch}` : ''}`
export const articleHeading = (n) => `${articleNo(n)}${n.title ? `(${n.title})` : ''}`

/** 노드 한 줄 — 번호 + 글. 표는 [표] */
export function nodeLine(n) {
  if (n.deleted) return `${nodePrefix(n)} 삭제`.trim()
  switch (n.type) {
    case 'chapter': return `제${n.num}장 ${n.title || ''}`.trim()
    case 'section': return `제${n.num}절 ${n.title || ''}`.trim()
    case 'article': return `${articleHeading(n)} ${n.text || ''}`.trim()
    case 'addendum': return `부칙${n.date ? ` (${n.date})` : ''}`
    case 'appendix': return n.title || '[첨부]'
    case 'table': return tableText(n)
    default: return `${nodePrefix(n)} ${n.text || ''}`.trim()
  }
}

export function nodePrefix(n) {
  switch (n.type) {
    case 'chapter': return `제${n.num}장`
    case 'section': return `제${n.num}절`
    case 'article': return articleNo(n)
    case 'paragraph': return circled(n.num)
    case 'item': return `${n.num}.`
    case 'subitem': return `${n.num}.`
    case 'line': return n.num || ''
    default: return ''
  }
}

export function tableText(n) {
  return (n.rows || []).map((r) => r.cells.map((c) => c.text).join(' | ')).join('\n')
}

/**
 * 참조 이름 — 「제63조제3항제1호」. 조 밖이면 부칙·장 이름.
 * @param {Map} byId
 */
export function nodeRefLabel(byId, id) {
  const chain = [byId.get(id), ...ancestors(byId, id)].filter(Boolean)
  let s = ''
  for (const n of chain) {
    if (n.type === 'article') { s = articleNo(n) + s; break }
    if (n.type === 'paragraph') s = `제${n.num}항` + s
    else if (n.type === 'item') s = `제${n.num}호` + s
    else if (n.type === 'subitem') s = `${n.num}목` + s
    else if (n.type === 'chapter') { s = `제${n.num}장` + s; break }
    else if (n.type === 'addendum') { s = '부칙' + (s ? ` ${s}` : ''); break }
    else if (n.type === 'appendix') { s = n.title || '첨부'; break }
  }
  return s || nodeLine(chain[0] || {}).slice(0, 20)
}

/** 짧은 위치 이름(검색 결과·도우미) — 「제63조 ③」 */
export function nodePath(byId, id) {
  const n = byId.get(id)
  if (!n) return ''
  const art = unitOf(byId, id)
  const inAdd = ancestors(byId, id).some((a) => a.type === 'addendum')
  if (inAdd && art?.type !== 'article') return n.type === 'item' ? `부칙 ${n.num}.` : '부칙'
  const head = art?.type === 'article' ? `${inAdd ? '부칙 ' : ''}${articleNo(art)}` : nodeLine(art || n).slice(0, 24)
  if (n === art || !art) return head
  if (n.type === 'paragraph') return `${head} ${circled(n.num)}`
  const para = ancestors(byId, id).find((a) => a.type === 'paragraph')
  if (n.type === 'item') return `${head}${para ? ` ${circled(para.num)}` : ''} ${n.num}호`
  return head
}

/** 목차(사이드바) — 장·절·조와 부칙. 부칙 안 조는 뺀다 */
export function tocOf(nodes) {
  const { byId } = indexNodes(nodes)
  const out = []
  for (const n of nodes) {
    if (n.type === 'chapter' || n.type === 'section' || n.type === 'addendum' || n.type === 'appendix') {
      out.push({ id: n.id, type: n.type, num: n.num || '', title: n.type === 'addendum' ? `부칙${n.date ? ` (${n.date})` : ''}` : (n.title || '') })
    } else if (n.type === 'article' && !ancestors(byId, n.id).some((a) => a.type === 'addendum' || a.type === 'appendix')) {
      out.push({ id: n.id, type: 'article', num: n.num, ...(n.branch ? { branch: n.branch } : {}), title: n.title || '', ...(n.deleted ? { deleted: true } : {}) })
    }
  }
  return out
}

/**
 * 번호 다시 매기기(개정안 편집기) — 조(부칙 밖, 가지번호 제외)·항·호·목을 차례대로.
 * 가지번호 조(제n조의m)는 앞 조 번호를 따라간다. 노드 id는 그대로라 링크는 깨지지 않는다.
 * @returns {{ nodes: object[], changes: {id, from, to}[] }}
 */
export function renumber(nodes) {
  const { byId, children } = indexNodes(nodes)
  const next = nodes.map((n) => ({ ...n }))
  const nextById = new Map(next.map((n) => [n.id, n]))
  const changes = []
  const set = (n, num) => {
    const t = nextById.get(n.id)
    if (String(t.num) !== String(num)) { changes.push({ id: n.id, from: nodePrefix(t), to: nodePrefix({ ...t, num: String(num) }) }); t.num = String(num) }
  }
  // 조 — 부칙·첨부 밖
  let art = 0
  for (const n of nodes) {
    if (n.type !== 'article') continue
    if (ancestors(byId, n.id).some((a) => a.type === 'addendum' || a.type === 'appendix')) continue
    if (n.branch) { set(n, art || 1); continue }
    art++
    set(n, art)
  }
  // 항·호·목 — 같은 부모 안에서 차례대로
  for (const [, list] of children) {
    let p = 0; let it = 0; let sub = 0
    for (const n of list) {
      if (n.type === 'paragraph') set(n, ++p)
      else if (n.type === 'item') set(n, ++it)
      else if (n.type === 'subitem') { const t = nextById.get(n.id); const v = GANADA[sub++] || t.num; if (t.num !== v) { changes.push({ id: n.id, from: `${t.num}.`, to: `${v}.` }); t.num = v } }
    }
  }
  return { nodes: next, changes }
}

// ── 조문 참조 ──────────────────────────────────────────────────

export const REF_TOKEN = /\{\{ref:([\w-]+)\/([\w-]+)\}\}/g
export const refToken = (regId, nodeId) => `{{ref:${regId}/${nodeId}}}`

// 「학칙」 제9조의2제3항제1호 / 같은 규정 제9조 / 같은 조 제2항
const RE_PLAIN = /(?:[「『]([^」』]{2,40})[」』]\s*)?제\s*(\d+)\s*조(?:\s*의\s*(\d+))?(?:\s*제\s*(\d+)\s*항)?(?:\s*제\s*(\d+)\s*호)?|제\s*(\d+)\s*항(?:\s*제\s*(\d+)\s*호)?/g

/**
 * 글 → 조각 [{ text } | { text, ref:{regId,nodeId} } | { text, plain:{reg?, article, branch?, paragraph?, item?, relative?} }]
 * 법령 이름(「…법」·「…시행령」)이 붙은 참조는 학교 규정이 아니라 글자로 둔다.
 */
export function splitRefs(text) {
  const s = String(text || '')
  const out = []
  let last = 0
  const all = []
  for (const m of s.matchAll(REF_TOKEN)) all.push({ i: m.index, len: m[0].length, ref: { regId: m[1], nodeId: m[2] } })
  for (const m of s.matchAll(RE_PLAIN)) {
    if (all.some((a) => m.index < a.i + a.len && a.i < m.index + m[0].length)) continue
    const reg = m[1] || null
    if (reg && /(법|령|규칙|조례|고시|훈령|지침)$/.test(reg) && !/(학칙|규정|회칙|세칙)/.test(reg)) continue
    // 앞 글자가 「…법」 바로 뒤면(「초·중등교육법」 제31조) 그 법의 조문 — 건너뛴다
    const before = s.slice(Math.max(0, m.index - 2), m.index)
    if (!reg && /[」』]\s?$/.test(before)) continue
    const plain = m[2]
      ? { reg, article: m[2], ...(m[3] ? { branch: m[3] } : {}), ...(m[4] ? { paragraph: m[4] } : {}), ...(m[5] ? { item: m[5] } : {}) }
      : { relative: true, paragraph: m[6], ...(m[7] ? { item: m[7] } : {}) }
    all.push({ i: m.index, len: m[0].length, plain })
  }
  all.sort((a, b) => a.i - b.i)
  for (const a of all) {
    if (a.i > last) out.push({ text: s.slice(last, a.i) })
    out.push({ text: s.slice(a.i, a.i + a.len), ...(a.ref ? { ref: a.ref } : { plain: a.plain }) })
    last = a.i + a.len
  }
  if (last < s.length) out.push({ text: s.slice(last) })
  return out
}

/**
 * 고정 링크를 지금 번호의 글자로 — 다른 규정이면 「규정명」을 붙이고, 같은 조 안이면 조 번호를 뺀다(「제3항」).
 * @param {{ regId, regTitle: (regId) => string, byIdOf: (regId) => Map|null, fromArticleId?: string }} ctx
 */
export function refText(ref, { regId, regTitle, byIdOf, fromArticleId }) {
  const byId = byIdOf(ref.regId)
  if (!byId || !byId.get(ref.nodeId)) return '(없어진 조문)'
  const label = nodeRefLabel(byId, ref.nodeId)
  if (ref.regId !== regId) return `「${regTitle(ref.regId)}」 ${label}`
  if (fromArticleId && ref.nodeId !== fromArticleId && unitOf(byId, ref.nodeId)?.id === fromArticleId) return label.replace(/^제\d+조(의\d+)?/, '')
  return label
}

/** 저장·검색용 — 고정 링크를 글자로 풀어 쓴 글 */
export function plainText(text, ctx) {
  return String(text || '').replace(REF_TOKEN, (_, r, n) => (ctx ? refText({ regId: r, nodeId: n }, ctx) : ''))
}

/**
 * 글자 참조 → 노드 { regId, nodeId }.
 * 같은 규정이면 노드 목록으로 항·호까지, 다른 규정이면 목차(toc)로 조까지 찾는다.
 * @param {object} plain splitRefs의 plain
 * @param {{ regId, byId, articleId?, findReg: (name) => {id, toc}|null }} ctx
 */
export function resolvePlain(plain, ctx) {
  if (plain.relative) {
    if (!ctx.articleId || !ctx.byId) return null
    return descend(ctx.byId, ctx.regId, ctx.articleId, plain)
  }
  if (plain.reg) {
    const reg = ctx.findReg(plain.reg)
    if (!reg) return null
    if (reg.id === ctx.regId && ctx.byId) return findArticle(ctx.byId, ctx.regId, plain)
    const art = (reg.toc || []).find((t) => t.type === 'article' && String(t.num) === String(plain.article) && String(t.branch || '') === String(plain.branch || ''))
    return art ? { regId: reg.id, nodeId: art.id } : null
  }
  return ctx.byId ? findArticle(ctx.byId, ctx.regId, plain) : null
}

function findArticle(byId, regId, plain) {
  for (const n of byId.values()) {
    if (n.type !== 'article' || String(n.num) !== String(plain.article) || String(n.branch || '') !== String(plain.branch || '')) continue
    if (ancestors(byId, n.id).some((a) => a.type === 'addendum')) continue
    return descend(byId, regId, n.id, plain)
  }
  return null
}

function descend(byId, regId, articleId, plain) {
  let target = articleId
  if (plain.paragraph) {
    const p = [...byId.values()].find((x) => x.parent === articleId && x.type === 'paragraph' && String(x.num) === String(plain.paragraph))
    if (p) {
      target = p.id
      if (plain.item) {
        const it = [...byId.values()].find((x) => x.parent === p.id && x.type === 'item' && String(x.num) === String(plain.item))
        if (it) target = it.id
      }
    }
  } else if (plain.item) {
    const it = [...byId.values()].find((x) => x.parent === articleId && x.type === 'item' && String(x.num) === String(plain.item))
    if (it) target = it.id
  }
  return { regId, nodeId: target }
}

/**
 * 규정 안의 참조 모두 — 고정 링크 + 찾을 수 있는 글자 참조. 「이 조를 인용하는 곳」 계산에 쓴다.
 * @returns {{ from: string(조 id), to: {regId, nodeId} }[]}
 */
export function collectRefs(regId, nodes, findReg) {
  const { byId } = indexNodes(nodes)
  const out = []
  for (const n of nodes) {
    const text = n.type === 'table' ? tableText(n) : n.text
    if (!text) continue
    const art = unitOf(byId, n.id)
    for (const seg of splitRefs(text)) {
      let to = null
      if (seg.ref) to = seg.ref
      else if (seg.plain && !seg.plain.relative) to = resolvePlain(seg.plain, { regId, byId, articleId: art?.type === 'article' ? art.id : null, findReg })
      if (!to) continue
      // 자기 조 안을 가리키는 참조는 인용으로 치지 않는다
      if (to.regId === regId && art && (to.nodeId === art.id || unitOf(byId, to.nodeId)?.id === art.id)) continue
      out.push({ from: art?.id || n.id, to })
    }
  }
  return out
}
