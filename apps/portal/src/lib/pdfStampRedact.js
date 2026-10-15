// 나이스 출력물 PDF의 "출력자 스탬프"(예: 선유고등학교/2026.10.15 15:35/10.35.***.172/홍길동)를
// 페이지 콘텐츠에서 실제로 지운다. 흰 박스로 덮는 방식이 아니라 텍스트 연산 자체를 삭제하므로
// 복사·검색으로도 이름이 남지 않는다. 모든 처리는 브라우저 안에서 끝난다(서버 전송 없음).
import { PDFDocument, PDFName, PDFArray, PDFRef, PDFRawStream, PDFDict, decodePDFRawStream } from 'pdf-lib'

// 학교/YYYY.MM.DD HH:MM/IP(일부 *)/이름
const STAMP_PATTERN = /\d{4}\.\d{1,2}\.\d{1,2}\s*\d{1,2}:\d{2}\s*\/\s*[\d*]{1,3}\.[\d*]{1,3}\.[\d*]{1,3}\.[\d*]{1,3}/

// ToUnicode 를 해독할 수 없을 때의 보조 기준: 페이지 맨 아래쪽의 아주 작은 글씨
const FALLBACK_MAX_FONT_SIZE = 7
const FALLBACK_BOTTOM_MARGIN = 45

const toLatin1 = (bytes) => {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
  }
  return s
}
const fromLatin1 = (s) => {
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff
  return out
}

const isWhite = (c) => c === ' ' || c === '\n' || c === '\r' || c === '\t' || c === '\f' || c === '\0'
const isDelim = (c) => '()<>[]{}/%'.includes(c)

// 리터럴 문자열 (...) 파싱 → [바이트 문자열, 다음 위치]
function readLiteral(s, i) {
  let depth = 1
  let out = ''
  i++
  while (i < s.length) {
    const c = s[i]
    if (c === '\\') {
      const n = s[i + 1]
      const esc = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' }
      if (n in esc) { out += esc[n]; i += 2; continue }
      if (n === '\r') { i += s[i + 2] === '\n' ? 3 : 2; continue }
      if (n === '\n') { i += 2; continue }
      const oct = /^[0-7]{1,3}/.exec(s.slice(i + 1, i + 4))
      if (oct) { out += String.fromCharCode(parseInt(oct[0], 8) & 0xff); i += 1 + oct[0].length; continue }
      i++
      continue
    }
    if (c === '(') depth++
    else if (c === ')' && --depth === 0) return [out, i + 1]
    out += c
    i++
  }
  return [out, i]
}

function readHex(s, i) {
  const end = s.indexOf('>', i)
  let hex = s.slice(i + 1, end < 0 ? s.length : end).replace(/[^0-9a-fA-F]/g, '')
  if (hex.length % 2) hex += '0'
  let out = ''
  for (let k = 0; k < hex.length; k += 2) out += String.fromCharCode(parseInt(hex.slice(k, k + 2), 16))
  return [out, end < 0 ? s.length : end + 1]
}

// 콘텐츠 스트림에서 BT~ET 텍스트 블록을 찾아 각 블록의 위치·글꼴·문자열을 돌려준다.
function scanTextBlocks(s) {
  const blocks = []
  let operands = []
  let block = null
  let i = 0
  while (i < s.length) {
    const c = s[i]
    if (isWhite(c)) { i++; continue }
    if (c === '%') { while (i < s.length && s[i] !== '\n' && s[i] !== '\r') i++; continue }
    if (c === '(') { const [str, j] = readLiteral(s, i); operands.push({ str }); i = j; continue }
    if (c === '<') {
      if (s[i + 1] === '<') { i += 2; continue }
      const [str, j] = readHex(s, i); operands.push({ str }); i = j; continue
    }
    if (c === '>' || c === '[' || c === ']' || c === '{' || c === '}') { i++; continue }
    if (c === '/') {
      let j = i + 1
      while (j < s.length && !isWhite(s[j]) && !isDelim(s[j])) j++
      operands.push({ name: s.slice(i + 1, j) }); i = j; continue
    }
    if (/[0-9+\-.]/.test(c)) {
      let j = i + 1
      while (j < s.length && /[0-9.]/.test(s[j])) j++
      operands.push({ num: parseFloat(s.slice(i, j)) }); i = j; continue
    }
    // 연산자
    const start = i
    let j = i
    while (j < s.length && !isWhite(s[j]) && !isDelim(s[j])) j++
    if (j === i) j++
    const op = s.slice(i, j)
    i = j
    const nums = operands.filter((o) => 'num' in o).map((o) => o.num)
    if (op === 'BT') {
      block = { start, font: null, size: 0, y: null, pieces: [] }
    } else if (block) {
      if (op === 'Tf') {
        const nm = operands.find((o) => 'name' in o)
        block.font = nm ? nm.name : block.font
        block.size = nums[nums.length - 1] ?? block.size
      } else if (op === 'Tm' && nums.length >= 6) {
        block.y = nums[5]
        block.scale = Math.hypot(nums[2], nums[3]) || 1
      } else if ((op === 'Td' || op === 'TD') && nums.length >= 2) {
        block.y = (block.y ?? 0) + nums[1]
      } else if (op === 'Tj' || op === 'TJ' || op === "'" || op === '"') {
        for (const o of operands) if ('str' in o) block.pieces.push({ font: block.font, str: o.str })
      } else if (op === 'ET') {
        blocks.push({ ...block, end: i })
        block = null
      }
    }
    if (op === 'BI') {
      // 인라인 이미지 데이터는 건너뛴다
      const m = /\sEI(?=[\s]|$)/g
      m.lastIndex = i
      const hit = m.exec(s)
      i = hit ? hit.index + hit[0].length : s.length
    }
    operands = []
  }
  return blocks
}

// ToUnicode CMap → { codeLen, map }
function parseToUnicode(text) {
  const map = new Map()
  const hexToStr = (h) => {
    let out = ''
    for (let k = 0; k + 4 <= h.length; k += 4) out += String.fromCharCode(parseInt(h.slice(k, k + 4), 16))
    return out
  }
  let codeLen = 2
  const cs = /begincodespacerange\s*<([0-9a-fA-F]+)>/.exec(text)
  if (cs) codeLen = Math.max(1, cs[1].length / 2)
  for (const sec of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const m of sec[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g)) {
      map.set(parseInt(m[1], 16), hexToStr(m[2]))
    }
  }
  for (const sec of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const m of sec[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<[0-9a-fA-F]*>|\[[^\]]*\])/g)) {
      const lo = parseInt(m[1], 16)
      const hi = parseInt(m[2], 16)
      if (m[3].startsWith('[')) {
        const items = [...m[3].matchAll(/<([0-9a-fA-F]*)>/g)].map((x) => x[1])
        items.forEach((h, k) => map.set(lo + k, hexToStr(h)))
      } else {
        const base = m[3].slice(1, -1)
        const head = base.slice(0, -4)
        const tail = parseInt(base.slice(-4) || '0', 16)
        for (let code = lo; code <= hi && code - lo < 65536; code++) {
          map.set(code, hexToStr(head) + String.fromCharCode(tail + code - lo))
        }
      }
    }
  }
  return { codeLen, map }
}

function decodeStream(obj) {
  if (obj instanceof PDFRawStream) return decodePDFRawStream(obj).decode()
  if (obj && typeof obj.getContents === 'function') return obj.getContents()
  return null
}

// 페이지 리소스의 글꼴 이름 → 해독기
function buildFontDecoders(doc, page) {
  const decoders = {}
  const resources = page.node.Resources()
  const fontDict = resources && resources.lookup(PDFName.of('Font'), PDFDict)
  if (!fontDict) return decoders
  for (const [key, ref] of fontDict.entries()) {
    try {
      const font = doc.context.lookup(ref, PDFDict)
      const tu = font.lookup(PDFName.of('ToUnicode'))
      const bytes = tu && decodeStream(tu)
      if (bytes) decoders[key.asString().slice(1)] = parseToUnicode(toLatin1(bytes))
    } catch {
      // 해독 불가 글꼴은 건너뛴다(보조 기준으로 처리)
    }
  }
  return decoders
}

function decodePieces(pieces, decoders) {
  let text = ''
  let decodable = true
  for (const { font, str } of pieces) {
    const dec = decoders[font]
    if (!dec) { decodable = false; continue }
    for (let k = 0; k + dec.codeLen <= str.length; k += dec.codeLen) {
      let code = 0
      for (let b = 0; b < dec.codeLen; b++) code = code * 256 + str.charCodeAt(k + b)
      text += dec.map.get(code) ?? ''
    }
  }
  return { text, decodable }
}

function contentStreamRefs(page) {
  const contents = page.node.get(PDFName.of('Contents'))
  if (contents instanceof PDFRef) {
    const obj = page.doc.context.lookup(contents)
    if (obj instanceof PDFArray) return obj.asArray().filter((r) => r instanceof PDFRef)
    return [contents]
  }
  if (contents instanceof PDFArray) return contents.asArray().filter((r) => r instanceof PDFRef)
  return []
}

/**
 * PDF 한 개에서 나이스 출력자 스탬프를 제거한다.
 * @param {ArrayBuffer|Uint8Array} input
 * @returns {Promise<{ bytes: Uint8Array, pageCount: number, removed: { page: number, text: string }[] }>}
 */
export async function redactNeisStamp(input) {
  const src = await PDFDocument.load(input, { updateMetadata: false })
  const removed = []
  const removedFonts = new Set()
  const usedFonts = new Set()

  src.getPages().forEach((page, pageIndex) => {
    const decoders = buildFontDecoders(src, page)
    const bottom = page.getMediaBox().y
    for (const ref of contentStreamRefs(page)) {
      const stream = src.context.lookup(ref)
      const bytes = decodeStream(stream)
      if (!bytes) continue
      const s = toLatin1(bytes)
      const blocks = scanTextBlocks(s)
      const targets = blocks.filter((b) => {
        const { text, decodable } = decodePieces(b.pieces, decoders)
        b.text = text
        if (decodable) return STAMP_PATTERN.test(text.replace(/\s+/g, ' '))
        const size = b.size * (b.scale || 1)
        return size > 0 && size <= FALLBACK_MAX_FONT_SIZE && b.y != null && b.y - bottom < FALLBACK_BOTTOM_MARGIN
      })
      for (const b of blocks) {
        const fonts = b.pieces.map((p) => p.font).concat(b.font || [])
        fonts.forEach((f) => (targets.includes(b) ? removedFonts : usedFonts).add(f))
      }
      if (!targets.length) continue
      let out = ''
      let cursor = 0
      for (const b of targets) {
        out += s.slice(cursor, b.start)
        cursor = b.end
        removed.push({ page: pageIndex + 1, text: b.text || '(해독 불가 – 하단 작은 글씨)' })
      }
      out += s.slice(cursor)
      src.context.assign(ref, src.context.flateStream(fromLatin1(out)))
    }
  })

  // 스탬프에만 쓰이던 글꼴은 리소스에서 빼서, 아래 복사 단계에서 따라오지 않게 한다.
  const orphanFonts = [...removedFonts].filter((f) => f && !usedFonts.has(f))
  if (orphanFonts.length) {
    for (const page of src.getPages()) {
      const fontDict = page.node.Resources()?.lookup(PDFName.of('Font'), PDFDict)
      orphanFonts.forEach((f) => fontDict?.delete(PDFName.of(f)))
    }
  }

  // 새 문서로 페이지를 옮겨 담아, 더 이상 쓰이지 않는 스탬프 전용 글꼴 등 잔여 객체를 함께 떨군다.
  const out = await PDFDocument.create({ updateMetadata: false })
  const pages = await out.copyPages(src, src.getPageIndices())
  pages.forEach((p) => out.addPage(p))
  const bytes = await out.save()
  return { bytes, pageCount: pages.length, removed }
}
