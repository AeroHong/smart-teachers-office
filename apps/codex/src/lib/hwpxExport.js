/**
 * 한글(hwpx) 내려받기 — 규정 본문, 규정집 전체, 신구대조표.
 * 공용 작성기(apps/shared/lib/hwpx/hwpxWriter.js)를 쓴다. 신구대조표는 「현 행 | 개 정 안」 2열 표, 머리행 반복.
 * 바뀐 말 표시는 법제처 신구대조표처럼 밑줄이 기본이고, 학교 안건처럼 현행 쪽을 취소선으로 할 수도 있다.
 */
import { ALIGN, BODY_WIDTH_MM, CHAR, buildHwpxBlob, downloadBlob, para, run, sectionXml, table, tablePara } from '@shared/lib/hwpx/hwpxWriter'
import { articleHeading, circled, indexNodes, plainText, REF_TOKEN } from '@shared/lib/regulationTree'

const histText = (n) => ((n.hist || []).length ? ` ${n.hist.map((h) => `<${h.kind} ${h.date.replace(/-/g, '.')}.>`).join(' ')}` : '')
const dateText = (d) => (d ? `${String(d).replace(/-/g, '. ')}.` : '')

function tableXml(n) {
  const cols = Math.max(1, ...n.rows.map((r) => r.cells.reduce((s, c) => s + (c.colSpan || 1), 0)))
  const w = BODY_WIDTH_MM / cols
  return tablePara(table({
    widths: Array(cols).fill(w),
    headerRows: 1,
    rows: n.rows.map((r) => r.cells.map((c) => ({ text: c.text, colSpan: c.colSpan, rowSpan: c.rowSpan }))),
  }))
}

/** 노드 → 문단들 */
function nodeParas(nodes, refCtx) {
  const depth = new Map()
  const out = []
  for (const n of nodes) {
    const d = n.parent ? (depth.get(n.parent) ?? 0) + 1 : 0
    depth.set(n.id, d)
    const text = n.deleted ? '삭제' : plainText(n.text, refCtx)
    const note = histText(n) ? run(CHAR.note, histText(n)) : ''
    switch (n.type) {
      case 'chapter': case 'section':
        out.push(para(ALIGN.center, run(CHAR.bodyBold, `제${n.num}${n.type === 'chapter' ? '장' : '절'} ${n.title || ''}`)))
        break
      case 'addendum':
        out.push(para(ALIGN.center, run(CHAR.bodyBold, `부칙${n.date ? ` (${n.date})` : ''}`)))
        break
      case 'appendix':
        out.push(para(ALIGN.left, run(CHAR.bodyBold, n.title || '')))
        break
      case 'article':
        out.push(para(ALIGN.left, run(CHAR.bodyBold, articleHeading(n)) + (text ? run(CHAR.body, ` ${text}`) : '') + note))
        break
      case 'table':
        out.push(tableXml(n))
        break
      default: {
        const prefix = n.type === 'paragraph' ? `${circled(n.num)} ` : n.type === 'item' || n.type === 'subitem' ? `${n.num}. ` : n.type === 'line' ? `${n.num} ` : ''
        const level = n.type === 'paragraph' ? ALIGN.indent1 : n.type === 'item' ? ALIGN.indent2 : n.type === 'subitem' || n.type === 'line' ? ALIGN.indent3 : [ALIGN.left, ALIGN.indent1, ALIGN.indent2, ALIGN.indent3][Math.min(d, 3)]
        for (const [i, line] of `${prefix}${text}`.split('\n').entries()) out.push(para(level, run(CHAR.body, line) + (i === 0 ? note : '')))
      }
    }
  }
  return out
}

/** 다른 규정을 가리키는 고정 링크를 글자로 풀 수 있게 그 규정 노드를 모은다 */
async function refContext(regId, regTitle, nodes, { book, loadNodes } = {}) {
  const foreign = new Set()
  for (const n of nodes) for (const m of String(n.text || '').matchAll(REF_TOKEN)) if (m[1] !== regId) foreign.add(m[1])
  const maps = new Map([[regId, indexNodes(nodes).byId]])
  if (loadNodes) {
    await Promise.all([...foreign].map(async (id) => { const ns = await loadNodes(id).catch(() => null); if (ns) maps.set(id, indexNodes(ns).byId) }))
  }
  return {
    regId,
    regTitle: (id) => (id === regId ? regTitle : book?.regulations?.find((r) => r.id === id)?.title || ''),
    byIdOf: (id) => maps.get(id),
  }
}

function historyLine(history) {
  const h = (history || []).filter((x) => !/적재/.test(x.kind))
  return h.length ? [para(ALIGN.center, run(CHAR.note, h.map((x) => `${x.kind} ${dateText(x.date)}`).join('  ')))] : []
}

/** 규정 하나 */
export async function downloadRegulationHwpx({ title, version, history, regId, book, loadNodes }) {
  const ctx = await refContext(regId, title, version.nodes, { book, loadNodes })
  const paras = [...historyLine(history), para(ALIGN.left, ''), ...nodeParas(version.nodes, ctx)]
  const blob = await buildHwpxBlob(title, sectionXml(title, paras))
  downloadBlob(blob, `${title}${version.effectiveDate ? `(${version.effectiveDate} 시행)` : ''}.hwpx`)
}

/**
 * 규정집 전체 — 표지 제목, 목차, 규정마다 새 쪽.
 * @param {{ book, loadNodes: (regId) => Promise<object[]> , regs: {id,title,history?}[] }} a
 */
export async function downloadBookHwpx({ book, loadNodes, onProgress }) {
  const regs = [...book.regulations].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const paras = [
    para(ALIGN.center, run(CHAR.heading, book.effectiveDate ? `(${dateText(book.effectiveDate)} 현재)` : '')),
    para(ALIGN.center, ''),
    para(ALIGN.center, run(CHAR.heading, '목  차')),
    ...regs.map((r) => para(ALIGN.left, run(CHAR.body, `${r.no ? `${r.no}. ` : ''}${r.title}`))),
  ]
  let i = 0
  for (const r of regs) {
    onProgress?.(++i, regs.length)
    const nodes = await loadNodes(r.id)
    const ctx = await refContext(r.id, r.title, nodes, { book, loadNodes })
    paras.push(para(ALIGN.center, run(CHAR.title, r.title), { pageBreak: true }))
    paras.push(...nodeParas(nodes, ctx))
  }
  const blob = await buildHwpxBlob(book.title || '규정집', sectionXml(book.title || '규정집', paras))
  downloadBlob(blob, `${book.title || '규정집'}.hwpx`)
}

// ── 신구대조표 ──────────────────────────────────────────────────

/** 대조표 한 칸의 문단 — 줄 목록(regulationDiff Line) */
function sideParas(lines, side, { strikeOld }) {
  const out = []
  for (const l of lines) {
    if (l.omit) { out.push(para(ALIGN.center, run(CHAR.cell, '(생  략)'))); continue }
    if (l.note) { out.push(para(ALIGN.center, run(CHAR.cell, `<${l.note.replace(' ', '  ')}>`))); continue }
    const pad = '  '.repeat(Math.min(l.depth, 3))
    // 줄바꿈(표 행)이 있으면 문단을 나눈다
    let runs = pad ? run(CHAR.cell, pad) : ''
    const flush = () => { out.push(para(ALIGN.left, runs || run(CHAR.cell, ''))); runs = '' }
    for (const s of l.segs) {
      const ch = !s.mark ? CHAR.cell : side === 'old' ? (strikeOld ? CHAR.cellStrike : CHAR.cellUnder) : CHAR.cellBoldUnder
      const pieces = s.t.split('\n')
      pieces.forEach((piece, k) => {
        if (k > 0) flush()
        if (piece) runs += run(ch, piece)
      })
    }
    flush()
  }
  return out.length ? out : [para(ALIGN.left, '')]
}

/**
 * @param {{ title, regTitle, kind, reason, effectiveDate, staffMeetingDate, committeeDate, rows, strikeOld?: boolean }} a
 */
export async function downloadComparisonHwpx(a) {
  const heading = `「${a.regTitle}」 ${a.kind || '일부개정'}(안) 신구대조표`
  const info = [
    a.effectiveDate && `시행일: ${dateText(a.effectiveDate)}`,
    a.staffMeetingDate && `교직원회의 협의: ${dateText(a.staffMeetingDate)}`,
    a.committeeDate && `학교운영위원회 심의: ${dateText(a.committeeDate)}`,
  ].filter(Boolean)
  const paras = [
    ...info.map((t) => para(ALIGN.left, run(CHAR.small, t))),
    ...(a.reason ? [para(ALIGN.left, run(CHAR.bodyBold, '개정 이유')), ...a.reason.split('\n').map((t) => para(ALIGN.left, run(CHAR.body, t)))] : []),
    para(ALIGN.left, ''),
    tablePara(table({
      widths: [BODY_WIDTH_MM / 2, BODY_WIDTH_MM / 2],
      headerRows: 1,
      rows: [
        [{ text: '현    행', header: true }, { text: '개  정  안', header: true }],
        ...a.rows.map((r) => [
          { paras: sideParas(r.old, 'old', a), header: false, vertAlign: 'TOP' },
          { paras: sideParas(r.new, 'new', a), header: false, vertAlign: 'TOP' },
        ]),
      ],
    })),
    para(ALIGN.left, run(CHAR.note, a.strikeOld ? '※ 현행 쪽 취소선은 지워지는 부분, 개정안 쪽 밑줄은 새로 들어가는 부분' : '※ 밑줄은 바뀌는 부분')),
  ]
  const blob = await buildHwpxBlob(heading, sectionXml(heading, paras))
  downloadBlob(blob, `${a.regTitle} 신구대조표.hwpx`)
}
