/**
 * 개정안 편집 — 노드 목록 고치기(순수 함수). 화면은 apps/codex/src/pages/AmendmentEditor.jsx.
 * 노드는 문서 순서의 평평한 목록이라, 「하위 전체」(자손)를 한 덩어리로 옮기고 지운다.
 */
import { GANADA, indexNodes, refToken, resolvePlain, splitRefs, unitOf } from './regulationTree.js'
import { makeNodeId } from './regulationParse.js'

/** 노드와 그 자손의 끝 위치(다음 형제가 시작하는 자리) */
export function subtreeEnd(nodes, index) {
  const ids = new Set([nodes[index].id])
  let i = index + 1
  while (i < nodes.length && ids.has(nodes[i].parent)) { ids.add(nodes[i].id); i++ }
  return i
}

const at = (nodes, id) => nodes.findIndex((n) => n.id === id)

export function updateNode(nodes, id, patch) {
  return nodes.map((n) => (n.id === id ? { ...n, ...patch } : n))
}

/** 같은 단계로 바로 뒤에(자손 다음) 넣는다 */
export function insertAfter(nodes, id, node) {
  const i = at(nodes, id)
  if (i < 0) return [...nodes, node]
  const end = subtreeEnd(nodes, i)
  return [...nodes.slice(0, end), { ...node, parent: nodes[i].parent ?? null }, ...nodes.slice(end)]
}

/** 하위 맨 끝에 넣는다(parentId가 null이면 문서 맨 끝) */
export function insertChild(nodes, parentId, node) {
  if (!parentId) return [...nodes, { ...node, parent: null }]
  const i = at(nodes, parentId)
  const end = subtreeEnd(nodes, i)
  return [...nodes.slice(0, end), { ...node, parent: parentId }, ...nodes.slice(end)]
}

/** 자손까지 통째로 지운다 */
export function removeNode(nodes, id) {
  const i = at(nodes, id)
  if (i < 0) return nodes
  return [...nodes.slice(0, i), ...nodes.slice(subtreeEnd(nodes, i))]
}

/**
 * 번호는 두고 「삭제」로 표시(법령의 「제5조 삭제」) — 하위는 지운다. on=false면 되살린다(지운 하위는 돌아오지 않는다).
 */
export function markDeleted(nodes, id, on = true) {
  const i = at(nodes, id)
  if (i < 0) return nodes
  if (!on) return updateNode(nodes, id, { deleted: false })
  const end = subtreeEnd(nodes, i)
  return [...nodes.slice(0, i), { ...nodes[i], deleted: true }, ...nodes.slice(end)]
}

/** 같은 부모 안에서 한 칸 위(-1)·아래(+1)로 — 자손과 함께 */
export function moveNode(nodes, id, dir) {
  const i = at(nodes, id)
  if (i < 0) return nodes
  const parent = nodes[i].parent ?? null
  const siblings = []
  for (let k = 0; k < nodes.length; k++) if ((nodes[k].parent ?? null) === parent) siblings.push(k)
  const pos = siblings.indexOf(i)
  const other = siblings[pos + dir]
  if (other === undefined) return nodes
  const [a, b] = dir < 0 ? [other, i] : [i, other]
  const aEnd = subtreeEnd(nodes, a); const bEnd = subtreeEnd(nodes, b)
  return [...nodes.slice(0, a), ...nodes.slice(b, bEnd), ...nodes.slice(aEnd, b), ...nodes.slice(a, aEnd), ...nodes.slice(bEnd)]
}

/** 하위에 넣을 수 있는 종류 */
export function childTypes(parentType) {
  switch (parentType) {
    case null: case undefined: return ['chapter', 'article', 'addendum', 'appendix', 'text', 'table']
    case 'chapter': return ['section', 'article', 'text']
    case 'section': return ['article', 'text']
    case 'article': return ['paragraph', 'item', 'text', 'table']
    case 'paragraph': return ['item', 'text', 'table']
    case 'item': return ['subitem', 'text', 'table']
    case 'subitem': return ['line', 'text']
    case 'addendum': return ['article', 'item', 'text']
    case 'appendix': return ['text', 'table', 'item']
    default: return ['text']
  }
}

export const TYPE_LABEL = { chapter: '장', section: '절', article: '조', paragraph: '항', item: '호', subitem: '목', line: '세목', text: '문단', table: '표', addendum: '부칙', appendix: '첨부' }

/** 새 노드 — 번호는 같은 부모 안 마지막 번호 + 1로 짐작(나중에 「번호 다시 매기기」) */
export function newNode(nodes, type, parentId, { idGen = makeNodeId } = {}) {
  const siblings = nodes.filter((n) => (n.parent ?? null) === (parentId ?? null) && n.type === type)
  const last = siblings[siblings.length - 1]
  let num = ''
  if (type === 'article' && !parentId) {
    const arts = nodes.filter((n) => n.type === 'article' && !n.branch)
    num = String((Number(arts[arts.length - 1]?.num) || 0) + 1)
  } else if (type === 'article') {
    const arts = nodes.filter((n) => n.type === 'article' && !n.branch && (n.parent ?? null) === parentId)
    const all = nodes.filter((n) => n.type === 'article' && !n.branch)
    num = String((Number((arts[arts.length - 1] || all[all.length - 1])?.num) || 0) + 1)
  } else if (type === 'subitem') num = GANADA[siblings.length] || '가'
  else if (['chapter', 'section', 'paragraph', 'item'].includes(type)) num = String((Number(last?.num) || 0) + 1)
  else if (type === 'line') num = `${siblings.length + 1})`
  const base = { id: idGen(), parent: parentId ?? null, type }
  if (type === 'table') return { ...base, rows: [{ cells: [{ text: '' }, { text: '' }] }, { cells: [{ text: '' }, { text: '' }] }] }
  if (type === 'addendum') return { ...base, date: '' }
  if (type === 'appendix') return { ...base, title: '[별지]' }
  if (type === 'chapter' || type === 'section') return { ...base, num, title: '' }
  if (type === 'article') return { ...base, num, title: '', text: '' }
  return { ...base, ...(num ? { num } : {}), text: '' }
}

/** 「제n조의m」 가지 조 — 바로 뒤에 넣는다 */
export function newBranchArticle(nodes, afterId, { idGen = makeNodeId } = {}) {
  const i = at(nodes, afterId)
  const base = nodes[i]
  const same = nodes.filter((n) => n.type === 'article' && n.num === base.num && n.branch)
  const branch = String(Math.max(1, ...same.map((n) => Number(n.branch) + 1), 2))
  return insertAfter(nodes, afterId, { id: idGen(), parent: base.parent ?? null, type: 'article', num: base.num, branch, title: '', text: '' })
}

/**
 * 글자 참조(「제9조」)를 고정 링크로 — 번호를 다시 매기기 전에 해 두면 참조가 따라간다.
 * 같은 규정 참조와, 다른 규정은 조 단위까지만 바꾼다.
 * @returns {{ nodes, count }}
 */
export function convertPlainRefs(nodes, regId, findReg) {
  const { byId } = indexNodes(nodes)
  let count = 0
  const out = nodes.map((n) => {
    if (!n.text || n.type === 'table') return n
    const art = unitOf(byId, n.id)
    const segs = splitRefs(n.text)
    if (!segs.some((s) => s.plain)) return n
    let changed = false
    const text = segs.map((s) => {
      if (!s.plain) return s.text
      const to = resolvePlain(s.plain, { regId, byId, articleId: art?.type === 'article' ? art.id : null, findReg })
      if (!to) return s.text
      changed = true; count++
      return refToken(to.regId, to.nodeId)
    }).join('')
    return changed ? { ...n, text } : n
  })
  return { nodes: out, count }
}
