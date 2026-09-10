/**
 * 캔버스(업무 글) 본문을 PDF·DOCX 파일로 내보내기.
 *
 * PDF는 화면에 이미 그려진 본문 노드(날짜 칩 등 하이드레이션까지 끝난 것)를 그대로
 * 캡처해 여러 페이지로 잘라 붙인다(html2canvas + jsPDF) — 글자를 다시 고를 순 없지만,
 * 캔버스 편집기가 만드는 임의의 서식(콜아웃·표·토글 등)을 따로 다시 그릴 필요 없이
 * 항상 화면과 똑같은 모양이 나온다.
 *
 * DOCX는 반대로 실제 워드 문단·서식을 만든다 — 인쇄물에 붙이거나 고쳐 쓰는 문서라서
 * 이미지로 굳으면 안 된다. bodyHtml이 만들 수 있는 태그 집합(richText.js의
 * ALLOWED_TAGS)만큼만 다루고, 그 밖의 것(모르는 태그)은 안의 글자만 살려 평문으로
 * 떨어뜨린다 — 내보내기가 죽는 것보다 서식이 조금 빠지는 편이 낫다.
 */
import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'
import {
  Document, Packer, Paragraph, TextRun, ImageRun, ExternalHyperlink,
  Table, TableRow, TableCell, WidthType, BorderStyle, HeadingLevel, ShadingType,
} from 'docx'

const HEADING_LEVEL = {
  H1: HeadingLevel.HEADING_1, H2: HeadingLevel.HEADING_2, H3: HeadingLevel.HEADING_3, H4: HeadingLevel.HEADING_4,
}
// richTextStyles.js의 콜아웃 배색과 맞춘다(같은 태그가 화면·문서 양쪽에서 같은 색으로 보이게).
const CALLOUT_FILL = { red: 'FDECEA', orange: 'FFF3E0', yellow: 'FFFDE7', green: 'E8F5E9', blue: 'E3F2FD', purple: 'F3E5F5' }
const CALLOUT_BORDER = { red: 'E57373', orange: 'FFB74D', yellow: 'FDD835', green: '81C784', blue: '64B5F6', purple: 'BA68C8' }

function safeFileName(name) {
  return String(name || '캔버스').replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 80) || '캔버스'
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/* ── PDF ─────────────────────────────────────────────────────────────── */

/**
 * 캡처용 사본의 `<img>`는 완전히 새 엘리먼트라 src가 같아도 브라우저가 다시 네트워크
 * 요청 + 디코딩을 해야 한다 — `load` 이벤트만으로는 "캡처(그리기)할 준비까지 끝났다"가
 * 보장되지 않아, 캡처 시점에 이미지가 일부만(또는 흰 여백으로) 잡히는 사고가 있었다
 * (2026-09-10, 사용자 신고 — PDF 1페이지 끝에서 스크린샷이 잘리고 2페이지엔 그 아랫부분
 * 없이 바로 다음 문단으로 넘어감). 원본 화면(`bodyEl`)엔 이미 완전히 로드된 이미지가
 * 있으므로, 그 픽셀을 캔버스로 떠서 data URL로 만들어 복제본에 박아 넣는다 — 네트워크도
 * 디코딩 레이스도 없이 그 자리에서 바로 쓸 수 있다. 태그는 계속 `<img>`로 둬야
 * richTextStyles.js의 `& img` 선택자(테두리 둥글기 등)가 그대로 먹는다.
 */
async function rasterizeClonedImages(originalRoot, clonedRoot) {
  const originals = originalRoot ? Array.from(originalRoot.querySelectorAll('img')) : []
  const clones = Array.from(clonedRoot.querySelectorAll('img'))
  await Promise.all(clones.map((cloneImg, i) => {
    const origImg = originals[i]
    if (origImg && origImg.complete && origImg.naturalWidth) {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = origImg.naturalWidth
        canvas.height = origImg.naturalHeight
        canvas.getContext('2d').drawImage(origImg, 0, 0)
        cloneImg.src = canvas.toDataURL('image/png')
      } catch {
        // 픽셀을 못 뜨면(CORS 등) 그냥 다시 받게 둔다 — 아래 onload 대기가 처리.
      }
    }
    return cloneImg.complete ? Promise.resolve() : new Promise((resolve) => { cloneImg.onload = resolve; cloneImg.onerror = resolve })
  }))
}

/**
 * elements(각각 실제 내용을 담은 노드 — 문단·이미지·표·콜아웃 등)를 훑어 "더 쪼개지 않고
 * 한 덩어리로 다룰 조각"의 목록을 만든다. 한 조각이 한 페이지보다 크면(예: 아주 큰 표)
 * 그 자식으로 한 단계 내려가 다시 시도한다 — 표는 tr, 목록은 li 단위로 저절로 쪼개진다.
 * 그래도 넘치는 잎(예: 거대한 이미지 하나)은 그대로 하나의(페이지보다 큰) 조각으로 남겨,
 * 페이지를 나눌 때 그 조각만 예외적으로 픽셀 절단한다.
 *
 * elements에는 반드시 "본문 감싸개(body 자체)"가 아니라 그 자식들을 낱개로 넘겨야 한다 —
 * 감싸개를 통째로 넘기면, 본문 전체 높이가 우연히 한 페이지보다 살짝 작을 때 그 전체가
 * 하나의 안 쪼개지는 조각이 돼버려 제목만 있는 페이지 뒤로 본문 전체가 한꺼번에
 * 밀려나는 사고가 났었다(2026-09-10, 실측 — 1페이지 제목만, 2페이지에 본문 전부).
 */
function collectAtoms(elements, containerTop, maxHeightPx) {
  const atoms = []
  const walk = (el) => {
    const rect = el.getBoundingClientRect()
    const height = rect.bottom - rect.top
    if (height <= maxHeightPx || el.children.length === 0) {
      atoms.push({ top: rect.top - containerTop, bottom: rect.bottom - containerTop })
      return
    }
    Array.from(el.children).forEach(walk)
  }
  elements.forEach(walk)
  return atoms
}

/**
 * [0, totalHeightPx) 구간을 pageHeightPx 간격의 페이지로 나누되, 그 경계가 atoms 목록의
 * 조각 중간을 지나지 않게 앞으로 당긴다. 조각 자체가 한 페이지보다 크면(atoms에는 있지만
 * 페이지 시작점에서부터도 못 담기면) 그 조각 안에서만 어쩔 수 없이 그대로 자른다.
 */
function computePageSegments(atoms, pageHeightPx, totalHeightPx) {
  const segments = []
  let pageStart = 0
  let i = 0
  while (pageStart < totalHeightPx) {
    let pageEnd = Math.min(pageStart + pageHeightPx, totalHeightPx)
    while (i < atoms.length && atoms[i].bottom <= pageEnd) i += 1
    if (i < atoms.length && atoms[i].top > pageStart && atoms[i].top < pageEnd) {
      pageEnd = atoms[i].top // 이 조각은 통째로 다음 페이지로 — i는 그대로 둬 다음 라운드에 담는다.
    }
    // else: 조각 자체가 이 페이지(pageStart부터)보다 커서 못 담는다 — pageEnd(강제 절단선)를 그대로 쓴다.
    segments.push([pageStart, pageEnd])
    pageStart = pageEnd
  }
  return segments
}

/**
 * @param {{title:string, meta?:string, bodyEl?:HTMLElement, coverImageUrl?:string}} params
 *   bodyEl은 이미 화면에 그려진 본문 노드(PostDetail의 bodyRef.current)를 그대로 받는다 —
 *   복제해 쓰므로 화면 쪽 상태(반응 팝오버 등)는 건드리지 않는다.
 */
export async function exportCanvasAsPdf({ title, meta, bodyEl, coverImageUrl }) {
  const container = document.createElement('div')
  container.style.cssText = 'position:fixed; left:-10000px; top:0; width:794px; background:#fff; padding:40px; box-sizing:border-box;'
  document.body.appendChild(container)
  try {
    let cover = null
    if (coverImageUrl) {
      cover = document.createElement('img')
      cover.crossOrigin = 'anonymous'
      cover.src = coverImageUrl
      cover.style.cssText = 'width:100%; height:220px; object-fit:cover; border-radius:8px; display:block; margin-bottom:16px;'
      container.appendChild(cover)
    }
    const h1 = document.createElement('h1')
    h1.textContent = title || '(제목 없음)'
    h1.style.cssText = 'font-size:22px; font-weight:800; margin:0 0 4px; font-family:"Malgun Gothic",sans-serif;'
    container.appendChild(h1)
    let metaEl = null
    if (meta) {
      metaEl = document.createElement('div')
      metaEl.textContent = meta
      metaEl.style.cssText = 'font-size:13px; color:#666; margin-bottom:20px; font-family:"Malgun Gothic",sans-serif;'
      container.appendChild(metaEl)
    }
    let body = null
    if (bodyEl) {
      body = bodyEl.cloneNode(true)
      body.style.fontSize = '15px'
      body.style.lineHeight = '1.75'
      body.style.fontFamily = '"Malgun Gothic",sans-serif'
      container.appendChild(body)
      await rasterizeClonedImages(bodyEl, body)
    }
    // 표지 이미지처럼 원본이 따로 없는 나머지 이미지는 기존대로 로딩을 기다린다.
    await Promise.all(Array.from(container.querySelectorAll('img')).map((img) => (
      img.complete ? Promise.resolve() : new Promise((resolve) => { img.onload = resolve; img.onerror = resolve })
    )))

    const pageWidthMm = 210
    const pageHeightMm = 297
    const containerRect = container.getBoundingClientRect()
    const pageHeightPx = pageHeightMm * (containerRect.width / pageWidthMm)
    // body(감싸개) 자체가 아니라 그 자식들을 낱개 조각 후보로 넘긴다 — collectAtoms
    // 위 주석 참고(감싸개를 통째로 넘기면 하나의 안 쪼개지는 조각이 돼버리는 사고가 났다).
    const seeds = [cover, h1, metaEl, ...(body ? Array.from(body.children) : [])].filter(Boolean)
    const atoms = collectAtoms(seeds, containerRect.top, pageHeightPx)

    const canvas = await html2canvas(container, { useCORS: true, scale: 2, backgroundColor: '#ffffff' })
    const scaleFactor = canvas.width / containerRect.width
    const totalHeightPx = containerRect.height
    const segments = computePageSegments(atoms, pageHeightPx, totalHeightPx)

    const pdf = new jsPDF('p', 'mm', 'a4')
    const pxToMm = pageWidthMm / canvas.width
    segments.forEach(([start, end], i) => {
      const sliceCanvasTop = Math.round(start * scaleFactor)
      const sliceCanvasHeight = Math.max(1, Math.round((end - start) * scaleFactor))
      const slice = document.createElement('canvas')
      slice.width = canvas.width
      slice.height = sliceCanvasHeight
      slice.getContext('2d').drawImage(
        canvas, 0, sliceCanvasTop, canvas.width, sliceCanvasHeight, 0, 0, canvas.width, sliceCanvasHeight,
      )
      if (i > 0) pdf.addPage()
      pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pageWidthMm, sliceCanvasHeight * pxToMm)
    })
    pdf.save(`${safeFileName(title)}.pdf`)
  } finally {
    container.remove()
  }
}

/* ── DOCX ────────────────────────────────────────────────────────────── */

async function fetchImagePart(src) {
  try {
    const res = await fetch(src)
    if (!res.ok) return null
    const contentType = res.headers.get('content-type') || ''
    const type = contentType.includes('png') ? 'png'
      : contentType.includes('gif') ? 'gif'
        : contentType.includes('bmp') ? 'bmp'
          : 'jpg'
    const data = new Uint8Array(await res.arrayBuffer())
    const dims = await new Promise((resolve) => {
      const url = URL.createObjectURL(new Blob([data]))
      const img = new Image()
      img.onload = () => { resolve({ width: img.naturalWidth || 400, height: img.naturalHeight || 300 }); URL.revokeObjectURL(url) }
      img.onerror = () => { resolve({ width: 400, height: 300 }); URL.revokeObjectURL(url) }
      img.src = url
    })
    const MAX_W = 600
    const scale = dims.width > MAX_W ? MAX_W / dims.width : 1
    return { data, type, width: Math.round(dims.width * scale) || 1, height: Math.round(dims.height * scale) || 1 }
  } catch {
    return null
  }
}

function cssColorToHex(value) {
  const v = String(value || '').trim()
  if (/^#[0-9a-f]{3,6}$/i.test(v)) return v.replace('#', '')
  const m = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)/i.exec(v)
  if (!m) return undefined
  return [1, 2, 3].map(i => Number(m[i]).toString(16).padStart(2, '0')).join('')
}

const BASE_INLINE_STYLE = { bold: false, italics: false, underline: false, strike: false, color: undefined, size: undefined, font: undefined }

/** 인라인 태그(문단 안 글자 조각)를 TextRun/ExternalHyperlink 배열로 모은다. */
function collectRuns(node, style, runs) {
  if (node.nodeType === Node.TEXT_NODE) {
    if (node.textContent) {
      runs.push(new TextRun({
        text: node.textContent, bold: style.bold, italics: style.italics, strike: style.strike,
        underline: style.underline ? {} : undefined, color: style.color, size: style.size, font: style.font,
      }))
    }
    return
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return
  const tag = node.tagName
  if (tag === 'BR') { runs.push(new TextRun({ text: '', break: 1 })); return }
  if (tag === 'A') {
    const href = node.getAttribute('href')
    const inner = []
    node.childNodes.forEach(child => collectRuns(child, { ...style, color: '0563C1', underline: true }, inner))
    if (href && inner.length) runs.push(new ExternalHyperlink({ link: href, children: inner }))
    else runs.push(...inner)
    return
  }
  let next = style
  if (tag === 'B' || tag === 'STRONG') next = { ...style, bold: true }
  else if (tag === 'I' || tag === 'EM') next = { ...style, italics: true }
  else if (tag === 'U') next = { ...style, underline: true }
  else if (tag === 'S' || tag === 'STRIKE') next = { ...style, strike: true }
  else if (tag === 'SMALL') next = { ...style, size: 16 }
  else if (tag === 'CODE') next = { ...style, font: 'Consolas' }
  else if (tag === 'FONT') {
    const hex = cssColorToHex(node.getAttribute('color'))
    if (hex) next = { ...style, color: hex }
  } else if (tag === 'SPAN') {
    const m = /color\s*:\s*([^;]+)/i.exec(node.getAttribute('style') || '')
    const hex = m ? cssColorToHex(m[1]) : undefined
    if (hex) next = { ...style, color: hex }
  }
  node.childNodes.forEach(child => collectRuns(child, next, runs))
}

/** 콜아웃·인용문처럼 문단에 테두리를 줄 때 쓰는 공통 옵션. */
function boxParagraphOptions(color, fill) {
  return {
    indent: { left: 360 },
    border: { left: { style: BorderStyle.SINGLE, size: 18, color } },
    shading: fill ? { type: ShadingType.CLEAR, color: 'auto', fill } : undefined,
    spacing: { before: 40, after: 40 },
  }
}

/** 블록 하나(p, div, h1-4, summary 등)를 문단 하나로 — 안의 내용을 전부 인라인으로 모은다. */
function blockToParagraph(el, extraOptions = {}) {
  const runs = []
  el.childNodes.forEach(child => collectRuns(child, BASE_INLINE_STYLE, runs))
  const options = { children: runs.length ? runs : [new TextRun({ text: '' })], ...extraOptions }
  if (HEADING_LEVEL[el.tagName]) options.heading = HEADING_LEVEL[el.tagName]
  return new Paragraph(options)
}

/**
 * 콜아웃·인용문 안의 자식들을 같은 테두리 옵션을 입힌 문단들로. Word엔 "그룹 테두리"가
 * 없어, 인접한 문단마다 같은 테두리·배경을 반복해 하나의 상자처럼 보이게 한다.
 */
async function boxedChildren(node, opts) {
  const kids = node.children.length ? Array.from(node.children) : [node]
  const out = []
  for (const child of kids) {
    if (['TABLE', 'UL', 'OL', 'HR', 'IMG', 'ASIDE', 'DETAILS'].includes(child.tagName)) {
      // eslint-disable-next-line no-await-in-loop
      out.push(...await walkBlock(child))
      continue
    }
    out.push(blockToParagraph(child, opts))
  }
  return out.length ? out : [new Paragraph({ children: [new TextRun({ text: '' })], ...opts })]
}

async function tableCellBlocks(el) {
  const out = []
  for (const child of Array.from(el.childNodes)) {
    // eslint-disable-next-line no-await-in-loop
    out.push(...await walkBlock(child))
  }
  return out.filter(b => b instanceof Paragraph || b instanceof Table).length
    ? out
    : [new Paragraph({ children: [new TextRun({ text: '' })] })]
}

async function buildTable(el) {
  const rows = Array.from(el.querySelectorAll(':scope > thead > tr, :scope > tbody > tr, :scope > tr'))
  const docRows = []
  for (const tr of rows) {
    const cells = Array.from(tr.children).filter(c => c.tagName === 'TD' || c.tagName === 'TH')
    const docCells = []
    for (const cell of cells) {
      // eslint-disable-next-line no-await-in-loop
      const blocks = await tableCellBlocks(cell)
      docCells.push(new TableCell({
        width: { size: Math.round(100 / (cells.length || 1)), type: WidthType.PERCENTAGE },
        shading: cell.tagName === 'TH' ? { type: ShadingType.CLEAR, color: 'auto', fill: 'F0F0F0' } : undefined,
        children: blocks,
      }))
    }
    if (docCells.length) docRows.push(new TableRow({ children: docCells }))
  }
  if (!docRows.length) return null
  return new Table({ rows: docRows, width: { size: 100, type: WidthType.PERCENTAGE } })
}

/** 목록(ul/ol)을 글머리 기호를 직접 붙인 문단들로. 체크리스트(data-todo)는 □/☑로. */
async function buildList(node, tag, depth) {
  const out = []
  let i = 0
  for (const li of Array.from(node.children).filter(c => c.tagName === 'LI')) {
    i += 1
    const isTodo = li.hasAttribute('data-todo')
    const checked = li.getAttribute('data-checked') === 'true'
    const prefix = isTodo ? (checked ? '☑ ' : '☐ ') : (tag === 'OL' ? `${i}. ` : '• ')
    const runs = [new TextRun({ text: prefix })]
    Array.from(li.childNodes)
      .filter(c => !(c.nodeType === Node.ELEMENT_NODE && (c.tagName === 'UL' || c.tagName === 'OL')))
      .forEach(child => collectRuns(child, { ...BASE_INLINE_STYLE, strike: isTodo && checked }, runs))
    out.push(new Paragraph({ children: runs, indent: { left: 360 + depth * 360 } }))
    for (const nested of Array.from(li.children).filter(c => c.tagName === 'UL' || c.tagName === 'OL')) {
      // eslint-disable-next-line no-await-in-loop
      out.push(...await buildList(nested, nested.tagName, depth + 1))
    }
  }
  return out
}

const BLOCK_TAGS = ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'UL', 'OL', 'TABLE', 'BLOCKQUOTE', 'ASIDE', 'HR', 'DETAILS', 'PRE']

/** 블록 하나를 docx 요소(문단 또는 표) 배열로. 재귀적으로 자식 블록도 처리한다. */
async function walkBlock(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent.trim()
    return text ? [new Paragraph({ children: [new TextRun({ text })] })] : []
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return []
  const tag = node.tagName

  if (tag === 'IMG') {
    const part = await fetchImagePart(node.getAttribute('src'))
    if (!part) return []
    return [new Paragraph({
      children: [new ImageRun({ data: part.data, type: part.type, transformation: { width: part.width, height: part.height } })],
    })]
  }
  if (tag === 'HR') {
    return [new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CCCCCC' } }, spacing: { before: 100, after: 100 } })]
  }
  if (tag === 'TABLE') {
    const table = await buildTable(node)
    return table ? [table, new Paragraph({ children: [] })] : []
  }
  if (tag === 'UL' || tag === 'OL') {
    return buildList(node, tag, 0)
  }
  if (tag === 'BLOCKQUOTE') {
    return boxedChildren(node, boxParagraphOptions('999999'))
  }
  if (tag === 'ASIDE') {
    const color = node.getAttribute('data-callout-color')
    return boxedChildren(node, boxParagraphOptions(CALLOUT_BORDER[color] || '1976D2', CALLOUT_FILL[color] || 'F0F4FF'))
  }
  if (tag === 'DETAILS') {
    const out = []
    const summary = node.querySelector(':scope > summary')
    if (summary) out.push(blockToParagraph(summary, { spacing: { before: 80 } }))
    for (const child of Array.from(node.children).filter(c => c.tagName !== 'SUMMARY')) {
      // eslint-disable-next-line no-await-in-loop
      out.push(...await walkBlock(child))
    }
    return out
  }
  if (tag === 'PRE') {
    return node.textContent.split('\n').map(line => (
      new Paragraph({ children: [new TextRun({ text: line || ' ', font: 'Consolas', size: 20 })] })
    ))
  }
  if (['P', 'H1', 'H2', 'H3', 'H4', 'SUMMARY'].includes(tag)) {
    return [blockToParagraph(node, { spacing: { after: 80 } })]
  }
  // DIV·SPAN 등 그 외 컨테이너 — 블록 자식이 있으면 그대로 재귀, 없으면 한 문단으로 뭉친다.
  const hasBlockChild = Array.from(node.children).some(c => BLOCK_TAGS.includes(c.tagName))
  if (hasBlockChild) {
    const out = []
    for (const child of Array.from(node.childNodes)) {
      // eslint-disable-next-line no-await-in-loop
      out.push(...await walkBlock(child))
    }
    return out
  }
  if (!node.textContent.trim()) return []
  return [blockToParagraph(node)]
}

/**
 * @param {{title:string, meta?:string, bodyEl?:HTMLElement}} params bodyEl은 이미 화면에
 *   그려진(날짜 칩 하이드레이션 끝난) 본문 노드 — PostDetail의 bodyRef.current.
 */
export async function exportCanvasAsDocx({ title, meta, bodyEl }) {
  const children = [new Paragraph({ text: title || '(제목 없음)', heading: HeadingLevel.TITLE })]
  if (meta) {
    children.push(new Paragraph({ children: [new TextRun({ text: meta, color: '666666', size: 20 })], spacing: { after: 200 } }))
  }
  if (bodyEl) {
    for (const child of Array.from(bodyEl.childNodes)) {
      // eslint-disable-next-line no-await-in-loop
      children.push(...await walkBlock(child))
    }
  }

  const doc = new Document({
    styles: { default: { document: { run: { font: '맑은 고딕', size: 22 } } } },
    sections: [{ children }],
  })
  const blob = await Packer.toBlob(doc)
  triggerDownload(blob, `${safeFileName(title)}.docx`)
}
