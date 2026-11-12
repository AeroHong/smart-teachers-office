/**
 * 규정집의 세로 기준(위계) — 학칙 → 규정 → 세칙, 지침·안내, 자치 회칙, 그리고 상위 법령 근거 (Codex-Edu, 2026-11).
 *
 * 규정마다(목차 문서 regulations[]의 한 줄)
 *   level    'rule'(학칙) | 'regulation'(규정) | 'sub'(세칙·하위 규정) | 'guide'(지침·안내) | 'bylaw'(자치 회칙)
 *   parentId 상위 규정 id(학칙 아래 규정, 규정 아래 세칙). 학칙·지침·회칙은 보통 null
 *   basis    근거 [{ kind: 'reg', regId, nodeId?, label } | { kind: 'law', name, article?, url? }]
 *   status   'active' | 'repealed'(폐지 — 목차·검색에서 빠지고 「폐지된 규정」으로)
 * suggestHierarchy는 본문(제1조 등)의 근거 문구로 이 값을 짐작한다. 관리자가 「체계 설정」에서 고친다.
 */
import { normTitle, titleSimilarity } from './regulationParse.js'
import { indexNodes, ancestors, splitRefs, resolvePlain } from './regulationTree.js'

export const LEVELS = [
  { key: 'rule', label: '학칙', order: 1 },
  { key: 'regulation', label: '규정', order: 2 },
  { key: 'sub', label: '세칙·하위 규정', order: 3 },
  { key: 'guide', label: '지침·안내', order: 4 },
  { key: 'bylaw', label: '자치 회칙', order: 5 },
]
export const levelLabel = (k) => LEVELS.find((l) => l.key === k)?.label || '규정'

// ── 상위 법령 찾기 ──────────────────────────────────────────────

// 「…법」 등 낫표 안 이름 + 뒤의 제n조
const RE_BRACKET_LAW = /[「『｢]([^」』｣]{2,60})[」』｣](?:\s*[(（][^)）]*[)）])?\s*(?:제\s*(\d+)\s*조(?:\s*의\s*(\d+))?)?/g
// 낫표 없이 쓴 법률 이름(「교육기본법 및 초‧중등교육법에 의하여」) — 4글자 이상, '법'으로 끝나고 뒤에 조사·구분이 오는 것
const RE_PLAIN_LAW = /([가-힣][가-힣·‧․ㆍ]{1,30}(?:기본법|교육법|진흥법|보호법|관리법|복무법|병역법|도서관법|[가-힣]{2,}법))(?=\s*(?:제\s*\d|및|과|와|에|의|,|·|\s|\(|$))(?:\s*제\s*(\d+)\s*조)?/g
const NOT_LAW = /(방법|용법|불법|편법|합법|위법|문법|어법|수법|화법|기법|필법|요법|비법|해법|사법시험)$/

const isExternal = (name) => /(법|법률|령|시행령|시행규칙|조례|규칙|지침|고시|훈령|예규|기본방향)$/.test(name.replace(/\s/g, ''))

/** 법령정보센터 주소 — 법률·시행령은 /법령/, 조례는 /자치법규/. 교육청 지침 등은 null */
export function lawUrl(name, article) {
  const n = String(name || '').replace(/\s/g, '').replace(/[‧․ㆍ]/g, '·')
  const art = article ? `/제${article}조` : ''
  if (/조례$/.test(n)) return `https://www.law.go.kr/자치법규/${encodeURIComponent(n)}`
  if (/(법|법률|시행령|시행규칙|령)$/.test(n) && !/지침|방향/.test(n)) return `https://www.law.go.kr/법령/${encodeURIComponent(n)}${art}`
  return null
}

/** 글에서 상위 법령 근거 — [{ kind:'law', name, article?, url }] (같은 이름은 한 번) */
export function findLaws(text, regTitles = []) {
  const s = String(text || '')
  const out = []
  const push = (name, article) => {
    const nm = name.trim().replace(/\s+/g, ' ')
    if (!nm || NOT_LAW.test(nm.replace(/\s/g, ''))) return
    // 학교 안 규정 이름이면 법령이 아니다
    if (regTitles.some((t) => titleSimilarity(t, nm) >= 0.8)) return
    const key = normTitle(nm)
    const prev = out.find((x) => normTitle(x.name) === key)
    if (prev) { if (!prev.article && article) { prev.article = article; prev.url = lawUrl(nm, article) } return }
    out.push({ kind: 'law', name: nm, ...(article ? { article } : {}), url: lawUrl(nm, article) })
  }
  for (const m of s.matchAll(RE_BRACKET_LAW)) {
    // 「조기진급 등에 관한 규정」(대통령령 …)처럼 이름이 「규정」이어도 괄호에 법령 종류가 있으면 상위 법령
    const decree = /[(（][^)）]*(대통령령|총리령|교육부령|부령|훈령|고시|예규)/.test(m[0])
    if (decree) { const nm = m[1].trim(); if (!out.some((x) => normTitle(x.name) === normTitle(nm))) out.push({ kind: 'law', name: nm, ...(m[2] ? { article: m[2] } : {}), url: `https://www.law.go.kr/법령/${encodeURIComponent(nm.replace(/\s/g, ''))}${m[2] ? `/제${m[2]}조` : ''}` }); continue }
    if (isExternal(m[1])) push(m[1], m[2])
  }
  const unbracketed = s.replace(RE_BRACKET_LAW, ' ')
  for (const m of unbracketed.matchAll(RE_PLAIN_LAW)) push(m[1], m[2])
  return out
}

// ── 규정끼리 ────────────────────────────────────────────────────

/** 제목에서 핵심 이름 — 「학생회 회칙」 → 「학생회」, 「학교운영위원회 규정」 → 「학교운영위원회」 */
export function coreName(title) {
  return normTitle(title).replace(/^\(\d{4}교육과정\)/, '').replace(/(운영)?(규정|회칙|세칙|학칙|방침|지침|규칙|내규)$/, '').replace(/에관한$/, '')
}

/** 규정의 앞부분(목적·근거) 글 — 제1~2조와 그 하위, 조문이 없으면 앞 문단 몇 개 */
export function leadText(nodes) {
  const { byId } = indexNodes(nodes)
  const inAdd = (n) => ancestors(byId, n.id).some((a) => a.type === 'addendum')
  const arts = nodes.filter((n) => n.type === 'article' && !inAdd(n)).slice(0, 2)
  if (!arts.length) return nodes.filter((n) => n.text).slice(0, 4).map((n) => n.text).join('\n')
  const ids = new Set(arts.map((a) => a.id))
  return nodes.filter((n) => ids.has(n.id) || (n.parent && ids.has(n.parent)) || ancestors(byId, n.id).some((a) => ids.has(a.id)))
    .map((n) => `${n.title ? `(${n.title}) ` : ''}${n.text || ''}`).join('\n')
}

/**
 * 위계 짐작.
 * @param {{ id, title, reference?, nodes }[]} regs 목차 순서
 * @returns {Map<id, { level, parentId, basis }>}
 */
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// 제목으로 본 단계 — 학칙 1, 규정·회칙 2, 세칙 3. 상위는 같거나 높은 단계만
const rank = (title) => { const t = normTitle(title); return /^학칙$/.test(t) ? 1 : /세칙$/.test(t) ? 3 : 2 }

export function suggestHierarchy(regs) {
  const titles = regs.map((r) => r.title)
  const rule = regs.find((r) => /^학\s*칙$/.test(normTitle(r.title)))
  const out = new Map()
  const tocOf = (r) => r.nodes.filter((n) => n.type === 'article').map((n) => ({ type: 'article', id: n.id, num: n.num, branch: n.branch }))
  const findReg = (name) => {
    let best = null; let score = 0
    for (const r of regs) { const s = titleSimilarity(name, r.title); if (s > score) { score = s; best = r } }
    return score >= 0.75 ? { id: best.id, toc: tocOf(best) } : null
  }

  for (const r of regs) {
    const lead = leadText(r.nodes)
    const compact = normTitle(lead)
    const t = normTitle(r.title)
    const basis = []

    // 1) 다른 규정을 이름으로 부른 곳 — 「…규정 제21조 제1항」(낫표 없어도)
    let parentId = null
    // 이름만 나온 것(「학교운영위원회의 심의를 거쳐」)은 근거가 아니다 — 뒤에 제n조나 「~에 따라」가 붙을 때만
    const flat = lead.replace(/\s/g, '')
    for (const o of regs) {
      if (o.id === r.id || o === rule) continue
      const core = coreName(o.title)
      if (core.length < 3) continue
      // 이름이 여러 번 나오면(「…시립학교운영위원회 조례」와 「…학교운영위원회 규정 제21조」) 근거 표현이 붙은 자리를 찾는다
      let m = null; let found = false
      for (let idx = flat.indexOf(core); idx >= 0; idx = flat.indexOf(core, idx + 1)) {
        const after = flat.slice(idx + core.length, idx + core.length + 24)
        if (/^(?:등에관한)?조례/.test(after)) continue
        m = after.match(/^(?:운영)?(?:규정|회칙|세칙)제?(\d+)조(?:제(\d+)항)?/) || after.match(/^제(\d+)조(?:제(\d+)항)?/)
        if (m || /^(?:운영)?(?:규정|회칙|세칙)?(?:에따라|에따른|에의하여|에의한|에의거|에근거|의위임)/.test(after)) { found = true; break }
      }
      if (!found) continue
      const to = m ? resolvePlain({ reg: o.title, article: m[1], ...(m[2] ? { paragraph: m[2] } : {}) }, { regId: r.id, byId: null, findReg: () => ({ id: o.id, toc: tocOf(o) }) }) : null
      basis.push({ kind: 'reg', regId: o.id, ...(to ? { nodeId: to.nodeId } : {}), label: `${o.title}${m ? ` 제${m[1]}조${m[2] ? ` 제${m[2]}항` : ''}` : ''}` })
      if (!parentId && rank(o.title) <= rank(r.title)) parentId = o.id
    }
    // 2) 글자 참조 「학칙」 제n조
    const { byId } = indexNodes(r.nodes)
    for (const seg of splitRefs(lead)) {
      if (!seg.plain?.reg) continue
      const to = resolvePlain(seg.plain, { regId: r.id, byId, findReg })
      if (to && to.regId !== r.id && !basis.some((b) => b.regId === to.regId)) {
        basis.push({ kind: 'reg', regId: to.regId, nodeId: to.nodeId, label: seg.text })
        if (!parentId && to.regId !== rule?.id) parentId = to.regId
      }
    }
    // 3) 상위 법령
    basis.push(...findLaws(lead, titles))

    // 위계
    let level = 'regulation'
    if (r === rule) level = 'rule'
    else if (/(상조회|학부모회)/.test(t) || (r.reference && /회칙$/.test(t))) level = 'bylaw'
    else if (r.reference && !/(위원회|급식비)/.test(t)) level = 'guide'
    else if (/세칙$/.test(t) || parentId) level = 'sub'
    if (level === 'rule' || level === 'guide' || level === 'bylaw') parentId = level === 'bylaw' || level === 'guide' ? null : parentId
    if (level === 'regulation' && rule) parentId = rule.id
    if (level === 'sub' && !parentId) {
      // 세칙인데 부른 이름이 없으면 핵심 이름이 겹치는 규정(학생회 운영 세칙 → 학생회 회칙)
      const near = regs.find((o) => o.id !== r.id && o !== rule && coreName(o.title).length >= 2 && t.startsWith(coreName(o.title)))
      parentId = near?.id || rule?.id || null
    }
    out.set(r.id, { level, parentId: parentId || null, basis })
  }
  // 학칙이 「…회칙으로 정한다」 「…세칙」으로 맡긴 것 — 학칙 본문에서 다른 규정 핵심 이름을 찾아 근거 조문으로 붙인다
  if (rule) {
    const { byId } = indexNodes(rule.nodes)
    for (const n of rule.nodes) {
      if (!n.text) continue
      const c = n.text.replace(/\s/g, '')
      for (const o of regs) {
        if (o === rule || /세칙$/.test(normTitle(o.title))) continue // 세칙은 회칙·규정을 거친다
        const core = coreName(o.title)
        if (core.length < 3) continue
        // 「학생회칙으로 정한다」 「…세칙으로 정한다」 「…규정에 의한다」 — 이름 바로 뒤 위임 표현
        const re = new RegExp(`${escapeRe(core)}(?:회칙|칙|세칙|운영세칙|규정|운영규정)?(?:으로|에서|에)(?:정한다|정하는|정할|따른다|의한다|의하여)`)
        if (!re.test(c)) continue
        const s = out.get(o.id)
        if (s.basis.some((b) => b.regId === rule.id)) continue
        let art = byId.get(n.id)
        while (art && art.type !== 'article') art = art.parent ? byId.get(art.parent) : null
        s.basis.unshift({ kind: 'reg', regId: rule.id, nodeId: n.id, label: `학칙${art ? ` 제${art.num}조` : ''}` })
        if (s.level === 'regulation' || s.level === 'sub') s.parentId = s.parentId && s.parentId !== rule.id ? s.parentId : rule.id
      }
    }
  }
  return out
}

/**
 * 체계 트리 — [{ reg, children: [...] }] (학칙 아래 규정, 규정 아래 세칙), 그리고 지침·회칙·폐지 묶음.
 * @param {object[]} regulations 목차 문서 regulations
 */
export function hierarchyTree(regulations = []) {
  const sorted = [...regulations].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const active = sorted.filter((r) => r.status !== 'repealed')
  const byId = new Map(active.map((r) => [r.id, { reg: r, children: [] }]))
  const roots = []
  for (const r of active) {
    if (r.level === 'guide' || r.level === 'bylaw') continue
    const node = byId.get(r.id)
    const parent = r.parentId && r.parentId !== r.id ? byId.get(r.parentId) : null
    if (parent && parent.reg.level !== 'guide' && parent.reg.level !== 'bylaw') parent.children.push(node)
    else roots.push(node)
  }
  // 학칙이 맨 위
  roots.sort((a, b) => (a.reg.level === 'rule' ? -1 : 0) - (b.reg.level === 'rule' ? -1 : 0))
  return {
    roots,
    guides: active.filter((r) => r.level === 'guide'),
    bylaws: active.filter((r) => r.level === 'bylaw'),
    repealed: sorted.filter((r) => r.status === 'repealed'),
  }
}

/** 규정의 하위 규정들 */
export const childrenOf = (regulations, regId) => (regulations || []).filter((r) => r.parentId === regId && r.status !== 'repealed')

/** 이 노드들을 근거로 삼는 다른 규정 — 개정안 편집기의 「하위 규정 영향」 경고 */
export function dependentsOf(regulations, regId, nodeIds) {
  const ids = new Set(nodeIds)
  const out = []
  for (const r of regulations || []) {
    for (const b of r.basis || []) {
      if (b.kind === 'reg' && b.regId === regId && (!b.nodeId || ids.has(b.nodeId))) out.push({ regId: r.id, title: r.title, label: b.label, nodeId: b.nodeId || null })
    }
  }
  return out
}

/** 상위 법령 모음 — 「상위 법령 점검」 화면: [{ name, url, refs: [{ regId, title, article }] }] */
export function lawIndex(regulations = []) {
  const m = new Map()
  for (const r of regulations) {
    if (r.status === 'repealed') continue
    for (const b of r.basis || []) {
      if (b.kind !== 'law') continue
      const k = normTitle(b.name)
      if (!m.has(k)) m.set(k, { key: k, name: b.name, url: lawUrl(b.name), refs: [] })
      m.get(k).refs.push({ regId: r.id, title: r.title, article: b.article || null })
    }
  }
  return [...m.values()].sort((a, b) => b.refs.length - a.refs.length || a.name.localeCompare(b.name, 'ko'))
}
