/**
 * 개정 비교 — 바뀐 노드 찾기·작업 기록 요약·신구대조표 줄 만들기 (Codex-Edu, 2026-11).
 *
 * 노드 id가 고정이라 비교는 id로 맞춘다(번호가 밀려도 같은 조문으로 안다). 조 안에서는 낱말 단위로 비교해
 * 현행 쪽은 지워진 말(del), 개정안 쪽은 들어간 말(ins)을 표시한다. 바뀌지 않은 항·호는 「(생 략)」으로 접는다.
 *
 * 신구대조표 줄(row): { id, label, status: 'added'|'deleted'|'modified', old: Line[], new: Line[] }
 *   Line = { depth, segs: [{ t, mark?: 'del'|'ins' }] } | { omit: true } | { depth, note: '신 설'|'삭 제' }
 */
import { ancestors, articleHeading, indexNodes, nodeLine, nodePrefix, nodeRefLabel, plainText, unitOf } from './regulationTree.js'

const FIELDS = ['type', 'num', 'branch', 'title', 'text', 'date', 'deleted']

/**
 * 비교할 때 글을 어떻게 읽을지 — textOf(node, 'old'|'new'). 고정 링크({{ref:…}})를 그쪽 번호의 글자로 풀어
 * 넘기면, 「제9조」를 고정 링크로 바꾸기만 한 것은 바뀜으로 치지 않는다. 없으면 글 그대로.
 */
const withText = (n, side, textOf) => (textOf && n.text ? { ...n, text: textOf(n, side) } : n)

/**
 * 고정 링크를 각 쪽(현행·개정안) 번호로 푸는 textOf.
 * @param {{ regId, oldNodes, newNodes, regTitle?: (regId) => string, foreignById?: (regId) => Map|null }} a
 */
export function refTextOf({ regId, oldNodes, newNodes, regTitle = () => '', foreignById = () => null }) {
  const o = indexNodes(oldNodes).byId
  const n = indexNodes(newNodes).byId
  return (node, side) => {
    const own = side === 'old' ? o : n
    const art = unitOf(own, node.id)
    return plainText(node.text, { regId, regTitle, byIdOf: (r) => (r === regId ? own : foreignById(r)), fromArticleId: art?.type === 'article' ? art.id : null })
  }
}

export function nodeContentChanged(a, b, textOf) {
  if (textOf) { a = withText(a, 'old', textOf); b = withText(b, 'new', textOf) }
  for (const f of FIELDS) if ((a[f] ?? '') !== (b[f] ?? '')) return true
  if (a.type === 'table' && JSON.stringify(a.rows || []) !== JSON.stringify(b.rows || [])) return true
  return false
}

/** 두 노드 목록의 차이 — id 목록 */
export function diffNodes(oldNodes, newNodes, { textOf } = {}) {
  const oldBy = new Map(oldNodes.map((n) => [n.id, n]))
  const newBy = new Map(newNodes.map((n) => [n.id, n]))
  const added = []; const deleted = []; const modified = []; const moved = []
  for (const n of newNodes) {
    const o = oldBy.get(n.id)
    if (!o) { added.push(n.id); continue }
    if (n.deleted && !o.deleted) { deleted.push(n.id); continue }
    if (nodeContentChanged(o, n, textOf)) modified.push(n.id)
    if ((o.parent || '') !== (n.parent || '')) moved.push(n.id)
  }
  for (const o of oldNodes) if (!newBy.has(o.id)) deleted.push(o.id)
  // 같은 부모 안 순서가 바뀐 것 — 공통 노드끼리의 차례 비교
  const common = (list, other) => list.filter((n) => other.has(n.id)).map((n) => n.id)
  const oc = common(oldNodes, newBy); const nc = common(newNodes, oldBy)
  const pos = new Map(oc.map((id, i) => [id, i]))
  let maxSeen = -1
  for (const id of nc) {
    const p = pos.get(id)
    if (p < maxSeen && !moved.includes(id)) moved.push(id)
    maxSeen = Math.max(maxSeen, p)
  }
  return { added, deleted, modified, moved }
}

/** 작업 기록 한 묶음 — [{ action, nodeId, label }] */
export function changeSummary(oldNodes, newNodes, opts = {}) {
  const d = diffNodes(oldNodes, newNodes, opts)
  const oldIdx = indexNodes(oldNodes).byId
  const newIdx = indexNodes(newNodes).byId
  const lab = (id) => (newIdx.has(id) ? nodeRefLabel(newIdx, id) : nodeRefLabel(oldIdx, id))
  return [
    ...d.added.map((id) => ({ action: 'add', nodeId: id, label: lab(id) })),
    ...d.modified.map((id) => ({ action: 'modify', nodeId: id, label: lab(id) })),
    ...d.deleted.map((id) => ({ action: 'delete', nodeId: id, label: lab(id) })),
    ...d.moved.filter((id) => !d.modified.includes(id)).map((id) => ({ action: 'move', nodeId: id, label: lab(id) })),
  ]
}

// ── 낱말 비교 ───────────────────────────────────────────────────

const TOKEN = /\s+|[가-힣ㄱ-ㅎ]+|[A-Za-z0-9]+|[^\s가-힣ㄱ-ㅎA-Za-z0-9]/g

/** a → b 낱말 비교. 너무 길면 통째로 바꾼 것으로 본다 */
export function tokenDiff(a, b) {
  const A = String(a || '').match(TOKEN) || []
  const B = String(b || '').match(TOKEN) || []
  if (A.length * B.length > 400_000) {
    return { old: A.length ? [{ t: A.join(''), mark: 'del' }] : [], new: B.length ? [{ t: B.join(''), mark: 'ins' }] : [] }
  }
  // LCS 표
  const n = A.length; const m = B.length
  const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1])
  const oldS = []; const newS = []
  let i = 0; let j = 0
  while (i < n && j < m) {
    if (A[i] === B[j]) { oldS.push({ t: A[i] }); newS.push({ t: B[j] }); i++; j++ }
    else if (L[i + 1][j] >= L[i][j + 1]) oldS.push({ t: A[i++], mark: 'del' })
    else newS.push({ t: B[j++], mark: 'ins' })
  }
  while (i < n) oldS.push({ t: A[i++], mark: 'del' })
  while (j < m) newS.push({ t: B[j++], mark: 'ins' })
  return { old: mergeSegs(oldS), new: mergeSegs(newS) }
}

/** 같은 표시끼리 붙이고, 표시된 말 사이의 띄어쓰기는 함께 표시한다 */
function mergeSegs(segs) {
  const s = segs.map((x) => ({ ...x }))
  for (let k = 1; k < s.length - 1; k++) {
    if (!s[k].mark && /^\s+$/.test(s[k].t) && s[k - 1].mark && s[k - 1].mark === s[k + 1].mark) s[k].mark = s[k - 1].mark
  }
  const out = []
  for (const x of s) {
    const last = out[out.length - 1]
    if (last && (last.mark || null) === (x.mark || null)) last.t += x.t
    else out.push(x.mark ? { t: x.t, mark: x.mark } : { t: x.t })
  }
  return out
}

// ── 신구대조표 ──────────────────────────────────────────────────

/** 옛 목록과 새 목록을 문서 순서대로 합친다 — 지워진 노드는 옛 자리에 */
function mergeOrder(oldNodes, newNodes) {
  const oldPos = new Map(oldNodes.map((n, i) => [n.id, i]))
  const newIds = new Set(newNodes.map((n) => n.id))
  const out = []
  let p = 0
  const flushOld = (until) => {
    for (; p < until; p++) if (!newIds.has(oldNodes[p].id)) out.push(oldNodes[p].id)
  }
  for (const n of newNodes) {
    if (oldPos.has(n.id)) { flushOld(oldPos.get(n.id)); p = Math.max(p, oldPos.get(n.id) + 1) }
    out.push(n.id)
  }
  flushOld(oldNodes.length)
  return out
}

const plain = (t) => [{ t }]
const ins = (t) => [{ t, mark: 'ins' }]
const del = (t) => [{ t, mark: 'del' }]

/** 조 머리 줄 — 조 본문이 그대로면 「제5조(목적) (생 략)」 */
function headLine(n, keepText) {
  if (n.type !== 'article') return nodeLine(n)
  return n.text ? `${articleHeading(n)} ${keepText ? n.text : '(생 략)'}` : articleHeading(n)
}

/**
 * 신구대조표 줄. 바뀐 조(또는 조 밖의 덩어리)만 나온다.
 * @returns {object[]} row 목록(머리말 참고)
 */
export function comparisonRows(oldNodes, newNodes, { textOf } = {}) {
  const oldIdx = indexNodes(oldNodes).byId
  const newIdx = indexNodes(newNodes).byId
  const d = diffNodes(oldNodes, newNodes, { textOf })
  const status = new Map()
  const lineOld = (n) => nodeLine(withText(n, 'old', textOf))
  const lineNew = (n) => nodeLine(withText(n, 'new', textOf))
  for (const id of d.added) status.set(id, 'added')
  for (const id of d.deleted) status.set(id, newIdx.has(id) ? 'keepDeleted' : 'deleted')
  for (const id of d.modified) if (!status.has(id)) status.set(id, 'modified')

  const order = mergeOrder(oldNodes, newNodes)
  const unitKey = (id) => (newIdx.has(id) ? unitOf(newIdx, id) : unitOf(oldIdx, id))?.id || id
  const units = new Map()
  for (const id of order) {
    const k = unitKey(id)
    if (!units.has(k)) units.set(k, [])
    units.get(k).push(id)
  }

  const depthIn = (id, unitId) => {
    const idx = newIdx.has(id) ? newIdx : oldIdx
    let dpt = 0
    for (const a of ancestors(idx, id)) { if (a.id === unitId) break; dpt++ }
    return id === unitId ? 0 : dpt + 1
  }

  const rows = []
  for (const [unitId, ids] of units) {
    if (!ids.some((id) => status.has(id))) continue
    const headStatus = status.get(unitId)
    const headNode = newIdx.get(unitId) || oldIdx.get(unitId)
    const label = nodeRefLabel(newIdx.has(unitId) ? newIdx : oldIdx, unitId)
    const row = { id: unitId, label, status: headStatus === 'added' ? 'added' : headStatus === 'deleted' ? 'deleted' : 'modified', old: [], new: [] }

    if (headStatus === 'added') {
      row.old.push({ depth: 0, note: '신 설' })
      for (const id of ids) if (newIdx.has(id)) row.new.push({ depth: depthIn(id, unitId), segs: ins(lineNew(newIdx.get(id))) })
      rows.push(row); continue
    }
    if (headStatus === 'deleted') {
      for (const id of ids) if (oldIdx.has(id)) row.old.push({ depth: depthIn(id, unitId), segs: del(lineOld(oldIdx.get(id))) })
      row.new.push({ depth: 0, note: '삭 제' })
      rows.push(row); continue
    }

    const omit = (side) => { const last = row[side][row[side].length - 1]; if (!last?.omit) row[side].push({ omit: true }) }
    for (const id of ids) {
      const st = status.get(id)
      const o = oldIdx.get(id); const n = newIdx.get(id)
      const depth = depthIn(id, unitId)
      if (!st) {
        if (id === unitId) {
          // 머리 줄은 늘 보인다(조 번호만 바뀌었어도 여기서 잡힌다 — modified로)
          row.old.push({ depth, segs: plain(headLine(withText(o, 'old', textOf), false)) })
          row.new.push({ depth, segs: plain(headLine(withText(n, 'new', textOf), false)) })
        } else { omit('old'); omit('new') }
        continue
      }
      if (st === 'modified') {
        const td = tokenDiff(lineOld(o), lineNew(n))
        row.old.push({ depth, segs: td.old })
        row.new.push({ depth, segs: td.new })
      } else if (st === 'added') {
        row.new.push({ depth, segs: ins(lineNew(n)) })
      } else if (st === 'deleted') {
        row.old.push({ depth, segs: del(lineOld(o)) })
        row.new.push({ depth, segs: [{ t: `${nodePrefix(o)} ` }, { t: '<삭 제>', mark: 'ins' }] })
      } else if (st === 'keepDeleted') {
        row.old.push({ depth, segs: del(lineOld(o)) })
        row.new.push({ depth, segs: [{ t: `${nodePrefix(n)} ` }, { t: '삭제', mark: 'ins' }] })
      }
    }
    // 맨 끝의 (생 략)만 남은 쪽 정리는 하지 않는다 — 법제처 대조표도 끝을 (생 략)으로 닫는다
    if (headNode) rows.push(row)
  }
  return rows
}

/** 신구대조표 줄을 글로(복사·도우미·테스트) — 지운 말은 [-…-], 넣은 말은 {+…+} */
export function rowsToText(rows) {
  const line = (l) => (l.omit ? '(생 략)' : l.note ? `<${l.note}>` : '  '.repeat(l.depth) + l.segs.map((s) => (s.mark === 'del' ? `[-${s.t}-]` : s.mark === 'ins' ? `{+${s.t}+}` : s.t)).join(''))
  return rows.map((r) => `■ ${r.label}\n[현행]\n${r.old.map(line).join('\n')}\n[개정안]\n${r.new.map(line).join('\n')}`).join('\n\n')
}
