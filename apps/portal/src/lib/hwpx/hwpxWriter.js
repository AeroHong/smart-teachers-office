// 한글(hwpx) 파일 만들기 — 포털 공용(검·인정도서 학운위 자료, 업무분장 결재 첨부).
//
// hwpx = ZIP + XML(OWPML). 글꼴·문단·테두리 정의(header.xml)와 용지 설정은 한컴오피스 한글이
// 직접 저장한 파일에서 떼어 온 템플릿(template/)을 그대로 쓰고, 본문(section0.xml)의 문단·표만 여기서 만든다.
// 표는 머리행 반복(repeatHeader)을 켜 두면 쪽 나눔은 한글이 알아서 한다(표를 '글자처럼 취급'하면 쪽을 못 넘겨
// 잘리므로 treatAsChar=0). 줄 배치 정보(linesegarray)는 넣지 않는다 — 한글이 열 때 다시 계산한다.
// 여러 문서(예: 업무분장표 + 담임 명단)는 절을 늘리지 않고 쪽 나눔 문단(pageBreak)으로 잇는다 — content.hpf를 그대로 쓰려고.
//
// 템플릿 header.xml의 ID(참조용):
//   charPr  0=10pt  1=9pt  2=16pt 굵게  4=9pt  5=9pt 굵게  6=8pt  7=8pt 회색(#444)
//   paraPr  0=가운데  2=왼쪽
//   borderFill  3=실선 0.12mm  4=실선 + 회색 채움(#E4E4E4)
import JSZip from 'jszip'
import headerXml from './template/header.xml?raw'
import sectionHead from './template/sectionHead.xml?raw'
import secPrRun from './template/secPrRun.xml?raw'
import versionXml from './template/version.xml?raw'
import settingsXml from './template/settings.xml?raw'
import contentHpf from './template/content.hpf?raw'
import containerXml from './template/container.xml?raw'
import containerRdf from './template/container.rdf?raw'
import manifestXml from './template/manifest.xml?raw'

export const MM = 283.465 // 1mm = 283.465 HWPUNIT
export const BODY_WIDTH_MM = 180 // A4 210mm − 좌우 여백 15mm×2 (secPrRun.xml의 margin과 짝)
export const CHAR = { body: 0, small: 1, title: 2, cell: 4, cellBold: 5, tiny: 6, note: 7 }
export const ALIGN = { center: 0, left: 2 }

export function x(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export const run = (charPr, text) => `<hp:run charPrIDRef="${charPr}"><hp:t>${x(text)}</hp:t></hp:run>`
export const para = (paraPr, runs, { pageBreak = false } = {}) =>
  `<hp:p id="0" paraPrIDRef="${paraPr}" styleIDRef="0" pageBreak="${pageBreak ? 1 : 0}" columnBreak="0" merged="0">${runs || '<hp:run charPrIDRef="4"/>'}</hp:p>`

/** 셀 하나. col/row는 표 격자 위치, span만큼 너비(widthMm)를 합쳐 넘긴다 */
export function cell({ col, row, colSpan = 1, rowSpan = 1, widthMm, header = false, paras, vertAlign = 'CENTER' }) {
  return `<hp:tc name="" header="${header ? 1 : 0}" hasMargin="1" protect="0" editable="0" dirty="0" borderFillIDRef="${header ? 4 : 3}">`
    + `<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="${vertAlign}" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">`
    + (paras.length ? paras.join('') : para(ALIGN.center, ''))
    + '</hp:subList>'
    + `<hp:cellAddr colAddr="${col}" rowAddr="${row}"/><hp:cellSpan colSpan="${colSpan}" rowSpan="${rowSpan}"/>`
    + `<hp:cellSz width="${Math.round(widthMm * MM)}" height="1700"/>`
    + '<hp:cellMargin left="283" right="283" top="170" bottom="170"/></hp:tc>'
}

let tableSeq = 0

/**
 * 표 — rows는 행마다 셀 목록 { text?, paras?, colSpan?, rowSpan?, header?, align?, char? }.
 * 병합으로 가려진 칸은 셀을 넣지 않는다(HTML 표와 같다). 열 주소(colAddr)는 여기서 병합을 따져 매긴다.
 * @param {{ widths: number[] (mm), rows: object[][], headerRows?: number }} t
 */
export function table({ widths, rows, headerRows = 1 }) {
  const cols = widths.length
  const taken = [] // taken[r][c] — 위쪽 셀의 rowSpan이 차지한 칸
  const body = rows.map((cells, r) => {
    taken[r] = taken[r] || []
    let c = 0
    const xml = cells.map((cd) => {
      while (taken[r][c]) c++
      const colSpan = cd.colSpan || 1
      const rowSpan = cd.rowSpan || 1
      for (let dr = 0; dr < rowSpan; dr++) {
        taken[r + dr] = taken[r + dr] || []
        for (let dc = 0; dc < colSpan; dc++) taken[r + dr][c + dc] = true
      }
      const header = cd.header ?? r < headerRows
      const paras = cd.paras || String(cd.text ?? '').split('\n').map((line) =>
        para(cd.align ?? ALIGN.center, line ? run(cd.char ?? (header ? CHAR.cellBold : CHAR.cell), line) : ''))
      const out = cell({ col: c, row: r, colSpan, rowSpan, header, paras, widthMm: widths.slice(c, c + colSpan).reduce((a, b) => a + b, 0) })
      c += colSpan
      return out
    }).join('')
    return `<hp:tr>${xml}</hp:tr>`
  }).join('')
  const totalW = Math.round(widths.reduce((a, b) => a + b, 0) * MM)
  tableSeq = (tableSeq + 1) % 1000
  return `<hp:tbl id="${1000000001 + tableSeq}" zOrder="${tableSeq}" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="TABLE" repeatHeader="1" rowCnt="${rows.length}" colCnt="${cols}" cellSpacing="0" borderFillIDRef="3" noAdjust="0">`
    + `<hp:sz width="${totalW}" widthRelTo="ABSOLUTE" height="${1700 * rows.length}" heightRelTo="ABSOLUTE" protect="0"/>`
    + '<hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>'
    + '<hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:inMargin left="283" right="283" top="170" bottom="170"/>'
    + body + '</hp:tbl>'
}

/** 표를 담는 문단 */
export const tablePara = (tableXml) => `<hp:p id="0" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="4">${tableXml}<hp:t/></hp:run></hp:p>`

/**
 * section0.xml — 첫 문단에 용지 설정(secPrRun)과 제목을 함께 둔다(한글이 저장한 파일과 같은 모양).
 * @param {string} title 첫 줄 제목(16pt 굵게, 가운데)
 * @param {string[]} paras 그 뒤 문단들(para·tablePara 결과)
 */
export function sectionXml(title, paras) {
  return sectionHead
    + `<hp:p id="0" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">${secPrRun}${run(CHAR.title, title)}</hp:p>`
    + paras.join('')
    + '</hs:sec>'
}

/** hwpx(zip) Blob. mimetype은 맨 앞·무압축이어야 한글이 형식을 알아본다. */
export async function buildHwpxBlob(title, section0) {
  const zip = new JSZip()
  const add = zip.file.bind(zip)
  // 한글이 저장한 파일처럼 폴더 항목 없이 파일만 넣는다
  zip.file = (name, data, opts = {}) => add(name, data, { createFolders: false, ...opts })
  zip.file('mimetype', 'application/hwp+zip', { compression: 'STORE' })
  zip.file('version.xml', versionXml, { compression: 'STORE' })
  zip.file('Contents/header.xml', headerXml)
  zip.file('Contents/section0.xml', section0)
  zip.file('settings.xml', settingsXml)
  zip.file('META-INF/container.rdf', containerRdf)
  zip.file('Contents/content.hpf', contentHpf.replace('{{TITLE}}', x(title)).replace(/\{\{DATE\}\}/g, new Date().toISOString().replace(/\.\d+Z$/, 'Z')))
  zip.file('META-INF/container.xml', containerXml)
  zip.file('META-INF/manifest.xml', manifestXml)
  return zip.generateAsync({ type: 'blob', mimeType: 'application/hwp+zip', compression: 'DEFLATE' })
}

export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName.replace(/[\\/:*?"<>|]/g, '_')
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
