/**
 * 학교 규정집 한글(hwpx) → 규정·조문 구조 (Codex-Edu, 2026-11).
 *
 * 흐름: section0.xml → extractHwpxBlocks(문단·표 블록) → splitRegulations(규정 경계) → parseRegulation(조문 노드)
 * DOMParser 없이 태그를 직접 훑는다 — 브라우저(가져오기 화면)와 node 테스트(실제 규정집 파일)가 같은 코드를 쓰게.
 *
 * 노드는 평평한 목록(문서 순서) + parent로 둔다. Firestore는 배열 안 배열을 못 담고, 개정 비교(diff)·AI 청크도
 * 평평한 목록이 다루기 쉽다. 노드 id는 번호와 무관한 고정값이라 조 번호가 바뀌어도 링크·연혁이 따라간다.
 *
 * 노드: { id, parent, type, num?, branch?, title?, text?, rows?, date? }
 *   type — chapter(장) section(절) article(조) paragraph(항 ①) item(호 1.) subitem(목 가.) line(그 밖의 하위 줄 1) 가))
 *          text(번호 없는 문단·※) table(표) addendum(부칙) appendix(별지·서식 등 규정 끝 첨부)
 *   표: rows = [{ cells: [{ text, colSpan, rowSpan }] }] — 배열 안 배열을 피한 모양
 */

// ── 1. hwpx 본문 → 블록 ─────────────────────────────────────────

const ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }
function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)))
    return ENTITIES[e] ?? m
  })
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`))
  return m ? m[1] : null
}

// 이 안의 문단은 본문이 아니다(머리말·꼬리말·쪽번호 등)
const SKIP_CONTAINERS = new Set(['header', 'footer', 'pageNum', 'pageHiding'])

/**
 * section0.xml → 블록 목록. 본문 문단은 { type:'p', text }, 본문 표는 { type:'table', rows }.
 * 글상자(drawText) 안 글은 { type:'p', text, box:true }로, 각주는 그 문단 text 뒤에 〔각주: …〕로 붙인다.
 * 표 안의 표는 바깥 셀 글자로 합친다.
 * @param {string} xml
 */
export function extractHwpxBlocks(xml) {
  const blocks = []
  // 문맥 스택 — 'root' | 'cell' | 'box' | 'note' | 'caption' | 'skip'
  const ctx = [{ kind: 'root' }]
  const paras = [] // 열린 문단 스택: { text, tables:[], boxes:[], notes:[] }
  const tables = [] // 열린 표 스택: { rows: [], para }
  let inT = 0
  let inScript = 0
  const cur = () => ctx[ctx.length - 1]
  const para = () => paras[paras.length - 1]
  const skipping = () => ctx.some((c) => c.kind === 'skip')

  const re = /<(\/?)([a-zA-Z]+):([a-zA-Z]+)([^>]*?)(\/?)>|([^<]+)/g
  let m
  while ((m = re.exec(xml))) {
    const [, close, , name, rest, selfClose, text] = m
    if (text !== undefined) {
      if (inT && para() && !skipping()) para().text += decode(text)
      else if (inScript && para() && !skipping()) para().text += `〔수식 ${decode(text).trim()}〕`
      continue
    }
    const tag = m[0]
    if (selfClose) {
      if (!para() || skipping()) continue
      if (inT && (name === 'fwSpace' || name === 'nbSpace' || name === 'tab')) para().text += ' '
      else if (inT && name === 'lineBreak') para().text += '\n'
      else if (name === 'cellAddr' && cur().kind === 'cell') { cur().col = Number(attr(tag, 'colAddr') || 0); cur().row = Number(attr(tag, 'rowAddr') || 0) }
      else if (name === 'cellSpan' && cur().kind === 'cell') { cur().colSpan = Number(attr(tag, 'colSpan') || 1); cur().rowSpan = Number(attr(tag, 'rowSpan') || 1) }
      continue
    }
    if (!close) {
      switch (name) {
        case 'p': paras.push({ text: '', tables: [], boxes: [], notes: [] }); break
        case 't': inT++; break
        case 'script': inScript++; break
        case 'tbl': tables.push({ rows: [], para: para() }); break
        case 'tr': tables[tables.length - 1]?.rows.push({ cells: [] }); break
        case 'tc': ctx.push({ kind: 'cell', paras: [], col: 0, row: 0, colSpan: 1, rowSpan: 1 }); break
        case 'drawText': ctx.push({ kind: 'box', paras: [] }); break
        case 'footNote': case 'endNote': ctx.push({ kind: 'note', paras: [] }); break
        case 'caption': ctx.push({ kind: 'caption', paras: [] }); break
        default:
          if (SKIP_CONTAINERS.has(name)) ctx.push({ kind: 'skip' })
      }
      continue
    }
    // 닫는 태그
    switch (name) {
      case 't': inT--; break
      case 'script': inScript--; break
      case 'p': {
        const p = paras.pop()
        if (!p) break
        const where = cur()
        const t = p.text.replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').trim()
        const withNotes = p.notes.length ? `${t} ${p.notes.map((n) => `〔각주: ${n}〕`).join(' ')}`.trim() : t
        if (where.kind === 'root') {
          if (withNotes) blocks.push({ type: 'p', text: withNotes })
          for (const b of p.boxes) if (b) blocks.push({ type: 'p', text: b, box: true })
          for (const tb of p.tables) blocks.push({ type: 'table', rows: tb.rows })
        } else if (where.kind !== 'skip') {
          // 셀·글상자·각주 안 문단 — 안쪽 표는 글자로 합친다
          const inner = p.tables.map((tb) => tb.rows.map((r) => r.cells.map((c) => c.text).join(' | ')).join('\n'))
          const all = [withNotes, ...p.boxes, ...inner].filter(Boolean).join('\n')
          where.paras.push(all)
        }
        break
      }
      case 'tc': {
        const c = ctx.pop()
        const tb = tables[tables.length - 1]
        const row = tb?.rows[tb.rows.length - 1]
        if (row) row.cells.push({ text: c.paras.join('\n').trim(), colSpan: c.colSpan, rowSpan: c.rowSpan, col: c.col, row: c.row })
        break
      }
      case 'tbl': {
        const tb = tables.pop()
        if (tb) tb.rows = tb.rows.filter((r) => r.cells.length)
        if (tb?.para) tb.para.tables.push(tb)
        break
      }
      case 'drawText': {
        const c = ctx.pop()
        const t = c.paras.filter(Boolean).join('\n')
        if (para()) para().boxes.push(t)
        break
      }
      case 'footNote': case 'endNote': {
        const c = ctx.pop()
        if (para()) para().notes.push(c.paras.filter(Boolean).join(' '))
        break
      }
      case 'caption': ctx.pop(); break
      default:
        if (SKIP_CONTAINERS.has(name) && cur().kind === 'skip') ctx.pop()
    }
  }
  return blocks
}

// ── 2. 규정 경계 ───────────────────────────────────────────────

/** 비교용 정규화 — 공백·가운뎃점 종류·「」 등을 지운다 */
export function normTitle(s) {
  return String(s || '').replace(/^참고\s*\d+\s*/, '').replace(/[\s·‧ㆍ•∙․･・「」『』【】\[\]()（）]/g, '').replace(/^선유고등학교/, '')
}

const RE_TOC = /^(?:(\d+)\s*\.|참고\s*(\d+))\s*(.+?)\s*[-─―‐]{3,}\s*\d+\s*$/
const RE_CHAPTER = /^제\s*(\d+)\s*장(?:\s+|$)(.*)$/
const RE_SECTION = /^제\s*(\d+)\s*절(?:\s+|$)(.*)$/
const RE_ARTICLE = /^제\s*(\d+)\s*조(?:\s*의\s*(\d+))?\s*(?:[(（]([^)）]{1,40})[)）])?\s*(.*)$/s
const RE_ADDENDUM = /^[【[<〈]?\s*부\s*칙\s*[】\]>〉]?\s*(?:[(（]\s*([^)）]*)[)）])?\s*$/
const RE_HISTORY = /^(제\s*정|개\s*정|전부\s*개정|일부\s*개정|폐\s*지)\s*[:：]?\s*(\d{4})\s*[.년]\s*(\d{1,2})\s*[.월]\s*(\d{1,2})\s*[.일]?\s*$/

const RE_REG_WORD = /(규정|회칙|세칙|학\s*칙|방침|지침|규칙|요강|내규)$/
const RE_REF_HEAD = /^참고\s*\d+\s+\S/

function isTitleLike(t) {
  if (!t || t.length > 60 || t.includes('\n')) return false
  // 「(2022 교육과정) 선택 교육과정 편성·운영 규정」처럼 괄호로 시작해도 규정 이름으로 끝나면 제목
  if (/^[(（][^)）]{1,20}[)）]\s*\S/.test(t) && RE_REG_WORD.test(t)) return true
  if (/^(제\s*\d+\s*[장절조]|[①-⑳]|\d+\s*[.)]|[가-하]\s*[.)]|※|-|○|□|■|◦|•|\(|<|\[|【)/.test(t)) return false
  if (/[.。:：]$/.test(t)) return false
  if (RE_HISTORY.test(t) || RE_ADDENDUM.test(t)) return false
  return true
}

/** 두 제목이 얼마나 닮았는지(글자 2개씩 묶음의 겹침) 0~1 */
export function titleSimilarity(a, b) {
  const A = normTitle(a); const B = normTitle(b)
  if (!A || !B) return 0
  if (A === B) return 1
  if (A.includes(B) || B.includes(A)) return 0.9
  const grams = (s) => { const g = new Set(); for (let i = 0; i < s.length - 1; i++) g.add(s.slice(i, i + 2)); return g }
  const ga = grams(A); const gb = grams(B)
  let n = 0
  for (const g of ga) if (gb.has(g)) n++
  return (2 * n) / (ga.size + gb.size || 1)
}

/**
 * 블록 → 표지·목차 + 규정별 블록 묶음.
 * 규정 시작: (a) 목차 제목과 같은 짧은 제목 줄, (b) 부칙·첨부 다음에 오거나 번호가 1로 돌아간 「제1장」·「제1조」 —
 * 이때 제목은 바로 위 1~2줄의 제목 같은 줄(없으면 목차의 다음 제목).
 * @returns {{ cover: string[], toc: {no:string, title:string, reference:boolean}[], regulations: {title:string, detectedTitle:string, tocIndex:number, blocks:object[]}[] }}
 */
export function splitRegulations(blocks) {
  const toc = []
  let i = 0
  const cover = []
  // 표지·목차 — 첫 목차 줄 앞은 표지, 목차 줄이 끝나는 곳까지가 목차
  let lastToc = -1
  for (let k = 0; k < Math.min(blocks.length, 200); k++) {
    const b = blocks[k]
    if (b.type !== 'p') continue
    const mm = b.text.match(RE_TOC)
    if (mm) { toc.push({ no: mm[1] ? mm[1] : `참고${mm[2]}`, title: mm[3].trim(), reference: !!mm[2] }); lastToc = k }
  }
  if (lastToc >= 0) {
    for (let k = 0; k < blocks.length && k <= lastToc; k++) if (blocks[k].type === 'p' && !RE_TOC.test(blocks[k].text)) cover.push(blocks[k].text)
    i = lastToc + 1
    // 목차 뒤 꼬리 줄(「참 고 자 료」 등 목차 머리)은 표지 쪽으로
  }

  const regs = []
  let cur = null
  let state = 'none' // 'body' | 'addendum' | 'after'
  let seenChapter = 0
  let seenArticle = 0
  let nextToc = 0

  const pendingTitle = (start) => {
    // start 앞 1~2줄에서 제목을 찾는다(제정·개정 이력 줄은 건너뛴다)
    const lines = []
    for (let k = start - 1; k >= 0 && lines.length < 6; k--) {
      const b = blocks[k]
      if (b.type !== 'p') break
      if (RE_HISTORY.test(b.text) || /^제\s*[·ㆍ]?\s*개정\s*정보$/.test(b.text) || /^전문/.test(b.text)) { lines.push({ k, skip: true }); continue }
      if (!isTitleLike(b.text)) break
      lines.push({ k, text: b.text })
    }
    const titles = lines.filter((l) => !l.skip)
    if (!titles.length) return null
    const take = titles.slice(0, 2).reverse()
    // 두 줄 제목("귀국자 편입학을 위한" + "교과목별 이수인정평가위원회 세부규정")은 붙인다 — 단 위 줄도 짧을 때만
    const text = take.length === 2 && take[0].text.length <= 30 && take[0].k === take[1].k - 1 ? `${take[0].text} ${take[1].text}` : take[take.length - 1].text
    const from = take.length === 2 && text.startsWith(take[0].text) ? take[0].k : take[take.length - 1].k
    return { text, from: Math.min(from, ...lines.map((l) => l.k)) }
  }

  const matchToc = (title) => {
    // 목차에서 앞으로 3칸 안의 가장 닮은 제목
    let best = -1; let score = 0
    for (let t = nextToc; t < Math.min(toc.length, nextToc + 4); t++) {
      const s = titleSimilarity(title, toc[t].title)
      if (s > score) { score = s; best = t }
    }
    return score >= 0.45 ? best : -1
  }

  const startReg = (title, from) => {
    // 제목 줄이 앞 규정의 블록으로 들어가 있었으면 떼어 낸다
    if (cur) {
      const cut = cur.blocks.length - (i - from)
      if (cut >= 0 && cut < cur.blocks.length) cur.blocks.length = cut
    }
    const ti = title ? matchToc(title) : -1
    const tocIndex = ti >= 0 ? ti : (nextToc < toc.length && !title ? nextToc : -1)
    if (tocIndex >= 0) nextToc = tocIndex + 1
    cur = {
      title: tocIndex >= 0 ? toc[tocIndex].title : (title || `규정 ${regs.length + 1}`),
      detectedTitle: title || '',
      tocIndex,
      blocks: [],
    }
    // 제목 아래 이력 줄 등은 규정 블록에 넣어 parseRegulation이 읽게 한다
    for (let k = from; k < i; k++) if (blocks[k].type !== 'p' || blocks[k].text !== title) {
      if (title && title.includes(blocks[k].text) && isTitleLike(blocks[k].text)) continue
      cur.blocks.push(blocks[k])
    }
    regs.push(cur)
    state = 'body'; seenChapter = 0; seenArticle = 0
  }

  for (; i < blocks.length; i++) {
    const b = blocks[i]
    if (b.type === 'p' && !b.box) {
      const t = b.text
      // (a) 목차 제목과 거의 같은 제목 줄 — 다음 블록이 이력·장·조일 때만(본문 속 「학생생활규정」 같은 말과 구분)
      if (isTitleLike(t) && toc.length && nextToc < toc.length) {
        const look = blocks.slice(i + 1, i + 8).filter((x) => x.type === 'p')
        const startsBody = look.slice(0, 4).some((x) => RE_CHAPTER.test(x.text) || RE_ARTICLE.test(x.text) || RE_HISTORY.test(x.text))
        const ti = matchToc(t)
        // 「참고3 상조회칙」처럼 참고 번호가 붙은 제목은 조문이 없어도(표·안내문뿐이어도) 새 규정
        const refHead = RE_REF_HEAD.test(t)
        if ((startsBody || refHead) && ti >= 0 && titleSimilarity(t, toc[ti].title) >= 0.6 && !(cur && cur.tocIndex === ti)) {
          startReg(t, i) // 제목 줄 자체는 규정 블록에 넣지 않는다
          continue
        }
      }
      const ch = t.match(RE_CHAPTER)
      const ar = !ch && t.match(RE_ARTICLE)
      if (ch || ar) {
        const n = Number((ch || ar)[1])
        const reset = n === 1 && (
          !cur || state === 'after' ||
          (ch && seenChapter >= 1 && state !== 'addendum') ||
          (ar && !ch && state === 'body' && seenArticle >= 1 && seenChapter === 0)
        )
        // 부칙 안의 제1조는 부칙 조문 — 단 바로 위에 새 제목 줄이 있으면 새 규정
        const titleAbove = pendingTitle(i)
        const inAddendumNewTitle = state === 'addendum' && n === 1 && titleAbove && !RE_ADDENDUM.test(blocks[i - 1]?.text || '')
        if (reset || inAddendumNewTitle) {
          startReg(titleAbove?.text || null, titleAbove ? titleAbove.from : i)
        }
        if (ch) seenChapter = Math.max(seenChapter, n)
        if (ar && state !== 'addendum') seenArticle = Math.max(seenArticle, n)
      } else if (RE_ADDENDUM.test(t) && cur) {
        state = 'addendum'
      }
    }
    if (!cur) continue
    cur.blocks.push(b)
  }
  return { cover, toc, regulations: regs }
}

// ── 3. 규정 하나 → 노드 ─────────────────────────────────────────

const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳㉑㉒㉓㉔㉕㉖㉗㉘㉙㉚㉛㉜㉝㉞㉟'
const RE_PARA = new RegExp(`^([${CIRCLED}])\\s*(.*)$`, 's')
const RE_ITEM = /^(\d{1,2})\s*\.\s+(.*)$/s
const RE_SUBITEM = /^([가-하])\s*\.\s*(.*)$/s
const RE_LINE = /^(\d{1,2}\)|[가-하]\)|\(\d{1,2}\)|\([가-하]\)|[ⅰ-ⅹ]\.|[a-z]\.|[○◦•▪□■-])\s*(.*)$/s
const RE_APPENDIX = /^[[<〈【]?\s*(별지|별표|서식|붙임|첨부|양식)\s*(?:제?\s*(\d+)\s*호?)?/

let seq = 0
/** 기본 id — 시각 + 순번 + 난수. 테스트는 idGen을 넘겨 결정적으로 만든다 */
export function makeNodeId() {
  seq = (seq + 1) % 1679616
  return `n${Date.now().toString(36).slice(-5)}${seq.toString(36).padStart(4, '0')}${Math.random().toString(36).slice(2, 5)}`
}

/**
 * 규정 블록 → { history, nodes, warnings }.
 * 계층: 장 > 절 > 조 > 항 > 호 > 목 > 줄. 번호 없는 문단은 지금 가장 깊은 자리 밑에 text로 붙는다.
 * @param {object[]} blocks splitRegulations의 regulation.blocks
 * @param {{ idGen?: () => string }} [opts]
 */
export function parseRegulation(blocks, { idGen = makeNodeId } = {}) {
  const nodes = []
  const history = []
  const warnings = []
  // 열린 자리: 각 단계의 마지막 노드
  const open = { chapter: null, section: null, article: null, paragraph: null, item: null, subitem: null, line: null, addendum: null, appendix: null }
  const reset = (...keys) => { for (const k of keys) open[k] = null }
  const add = (node) => { const n = { id: idGen(), ...node }; nodes.push(n); return n }
  const container = () => open.appendix || open.addendum || open.section || open.chapter
  let bodyStarted = false
  let lastArticleNum = 0

  for (let bi = 0; bi < blocks.length; bi++) {
    const b = blocks[bi]
    if (b.type === 'table') {
      const parentNode = open.line || open.subitem || open.item || open.paragraph || open.article || open.appendix || open.addendum || container()
      add({ parent: parentNode?.id || null, type: 'table', rows: b.rows.map((r) => ({ cells: r.cells.map((c) => ({ text: c.text, colSpan: c.colSpan, rowSpan: c.rowSpan })) })) })
      bodyStarted = true
      continue
    }
    const t = b.text
    if (!t) continue

    // 머리 이력(제정·개정) — 본문 시작 전만
    const h = !bodyStarted && t.match(RE_HISTORY)
    if (h) {
      const kind = h[1].replace(/\s/g, '')
      history.push({ kind, date: `${h[2]}-${h[3].padStart(2, '0')}-${h[4].padStart(2, '0')}` })
      continue
    }

    let m
    if ((m = t.match(RE_ADDENDUM))) {
      reset('chapter', 'section', 'article', 'paragraph', 'item', 'subitem', 'line', 'appendix')
      open.addendum = add({ parent: null, type: 'addendum', date: m[1]?.trim() || '' })
      bodyStarted = true
      continue
    }
    if (bodyStarted && (open.addendum || open.appendix) && (m = t.match(RE_APPENDIX)) && t.length < 80) {
      reset('chapter', 'section', 'article', 'paragraph', 'item', 'subitem', 'line', 'addendum')
      open.appendix = add({ parent: null, type: 'appendix', title: t })
      continue
    }
    if (!open.addendum && !open.appendix && (m = t.match(RE_CHAPTER))) {
      reset('section', 'article', 'paragraph', 'item', 'subitem', 'line')
      open.chapter = add({ parent: null, type: 'chapter', num: m[1], title: m[2].trim() })
      bodyStarted = true
      continue
    }
    if (!open.addendum && !open.appendix && (m = t.match(RE_SECTION))) {
      reset('article', 'paragraph', 'item', 'subitem', 'line')
      open.section = add({ parent: open.chapter?.id || null, type: 'section', num: m[1], title: m[2].trim() })
      bodyStarted = true
      continue
    }
    if (!open.appendix && (m = t.match(RE_ARTICLE))) {
      reset('paragraph', 'item', 'subitem', 'line')
      const num = Number(m[1])
      if (!open.addendum && lastArticleNum && num !== lastArticleNum + 1 && !m[2] && num !== lastArticleNum) {
        warnings.push(`제${lastArticleNum}조 다음이 제${num}조입니다`)
      }
      if (!open.addendum) lastArticleNum = num
      const art = add({ parent: (open.addendum || container())?.id || null, type: 'article', num: m[1], ...(m[2] ? { branch: m[2] } : {}), title: (m[3] || '').trim(), text: '' })
      open.article = art
      bodyStarted = true
      // 「제10조(고사) ① 정기고사는…」 — 같은 줄의 첫 항
      const rest = (m[4] || '').trim()
      const p = rest.match(RE_PARA)
      if (p) open.paragraph = add({ parent: art.id, type: 'paragraph', num: String(CIRCLED.indexOf(p[1]) + 1), text: p[2].trim() })
      else art.text = rest
      continue
    }
    if (open.article && (m = t.match(RE_PARA))) {
      reset('item', 'subitem', 'line')
      open.paragraph = add({ parent: open.article.id, type: 'paragraph', num: String(CIRCLED.indexOf(m[1]) + 1), text: m[2].trim() })
      continue
    }
    if ((m = t.match(RE_ITEM))) {
      reset('subitem', 'line')
      const parent = open.paragraph || open.article || open.appendix || open.addendum || container()
      open.item = add({ parent: parent?.id || null, type: 'item', num: m[1], text: m[2].trim() })
      bodyStarted = true
      continue
    }
    if (open.item && (m = t.match(RE_SUBITEM))) {
      reset('line')
      open.subitem = add({ parent: open.item.id, type: 'subitem', num: m[1], text: m[2].trim() })
      continue
    }
    if ((open.subitem || open.item) && (m = t.match(RE_LINE))) {
      const parent = open.subitem || open.item
      open.line = add({ parent: parent.id, type: 'line', num: m[1], text: m[2].trim() })
      continue
    }
    // 번호 없는 문단 — 지금 가장 깊은 자리 밑에
    const parent = open.line || open.subitem || open.item || open.paragraph || open.article || open.appendix || open.addendum || container()
    add({ parent: parent?.id || null, type: 'text', text: t, ...(b.box ? { box: true } : {}) })
    if (!bodyStarted && nodes.length > 0) bodyStarted = /^(전문|제|[①-⑳])/.test(t) ? true : bodyStarted
  }
  return { history, nodes, warnings }
}

// ── 4. 한 번에 ──────────────────────────────────────────────────

/** 「학    칙」처럼 글자마다 띄운 제목은 붙이고, 여러 칸 공백은 한 칸으로 */
export function cleanTitle(t) {
  const s = String(t || '').replace(/\s+/g, ' ').trim()
  const parts = s.split(' ')
  return parts.length > 1 && parts.every((p) => p.length === 1) ? parts.join('') : s
}

/**
 * 규정집 section0.xml → { cover, toc, regulations: [{ title, detectedTitle, tocIndex, reference, history, nodes, warnings, stats }] }
 * @param {string|string[]} sectionXml section 여러 개면 배열
 */
export function parseRegulationBook(sectionXml, opts = {}) {
  const xmls = Array.isArray(sectionXml) ? sectionXml : [sectionXml]
  const blocks = xmls.flatMap(extractHwpxBlocks)
  const { cover, toc, regulations } = splitRegulations(blocks)
  return {
    cover,
    toc: toc.map((t) => ({ ...t, title: cleanTitle(t.title) })),
    regulations: regulations.map((r) => {
      const parsed = parseRegulation(r.blocks, opts)
      const count = (type) => parsed.nodes.filter((n) => n.type === type).length
      return {
        title: cleanTitle(r.title),
        detectedTitle: r.detectedTitle,
        tocIndex: r.tocIndex,
        reference: r.tocIndex >= 0 ? toc[r.tocIndex].reference : false,
        ...parsed,
        stats: { chapters: count('chapter'), articles: count('article'), tables: count('table'), nodes: parsed.nodes.length },
      }
    }),
  }
}
