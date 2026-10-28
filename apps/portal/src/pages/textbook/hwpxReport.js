// 학교운영위원회 제출 자료를 한글(hwpx) 파일로 만든다(2026-10-02).
//
// hwpx = ZIP + XML(OWPML). 글꼴·문단·테두리 정의(header.xml)와 용지 설정은 한컴오피스 한글이
// 직접 저장한 파일에서 떼어 온 템플릿(lib/hwpx/template/)을 그대로 쓰고, 본문(section0.xml)의 제목·
// 요약·표만 여기서 만든다. 표는 하나로 만들고 머리행 반복(repeatHeader)을 켜 두면 쪽 나눔은
// 한글이 알아서 한다(표를 '글자처럼 취급'하면 쪽을 못 넘겨 잘리므로 treatAsChar=0). 줄 배치 정보(linesegarray)는 넣지 않는다 — 한글이 열 때 다시 계산한다.
//
// 템플릿 header.xml의 ID(참조용):
//   charPr  0=10pt  1=9pt  2=16pt 굵게  4=9pt  5=9pt 굵게  6=8pt  7=8pt 회색(#444)
//   paraPr  0=가운데  2=왼쪽
//   borderFill  3=실선 0.12mm  4=실선 + 회색 채움(#E4E4E4)
// 문단·셀·zip 묶기는 공용 작성기(lib/hwpx/hwpxWriter.js) — 템플릿도 그쪽으로 옮겼다(2026-10-28, 업무분장 결재 첨부와 공유).
import { BODY_WIDTH_MM, MM, buildHwpxBlob, cell, downloadBlob, para, run } from '../../lib/hwpx/hwpxWriter'
import sectionHead from '../../lib/hwpx/template/sectionHead.xml?raw'
import secPrRun from '../../lib/hwpx/template/secPrRun.xml?raw'

/** buildReportRows(TextbookCommitteeReport.jsx) 결과로 section0.xml을 만든다. */
export function buildReportSectionXml({ title, summary, rows }) {
  // 연번 9 · 교과군 23 · 과목 34 · 1~3순위 나머지 균등 · 비고 26 (mm). 교과군·과목명이 두 줄로
  // 꺾이지 않을 만큼 넓힌다(한글에서 열어 확인, 2026-10-02).
  const fixed = [9, 27, 31]
  const noteW = 26
  const rankW = (BODY_WIDTH_MM - fixed.reduce((a, b) => a + b, 0) - noteW) / 3
  const widths = [...fixed, rankW, rankW, rankW, noteW]
  const heads = ['연번', '교과군', '과목', '1순위', '2순위', '3순위', '비고']

  const headRow = `<hp:tr>${heads.map((h, i) => cell({ col: i, row: 0, widthMm: widths[i], header: true, paras: [para(0, run(5, h))] })).join('')}</hp:tr>`
  const bodyRows = rows.map((r, ri) => {
    const rowNo = ri + 1
    const rankParas = (k) => (k
      ? [para(2, run(5, k.publisher) + (k.tied ? run(7, ' (공동)') : '')), ...(k.author ? [para(2, run(7, k.author))] : [])]
      : [para(0, run(4, '-'))])
    const cells = [
      [para(0, run(4, String(rowNo)))],
      [para(0, run(6, r.group))],
      [para(2, run(5, r.subject))],
      rankParas(r.ranks[0]),
      rankParas(r.ranks[1]),
      rankParas(r.ranks[2]),
      [para(2, run(6, r.note || ''))],
    ]
    return `<hp:tr>${cells.map((ps, ci) => cell({ col: ci, row: rowNo, widthMm: widths[ci], header: false, paras: ps })).join('')}</hp:tr>`
  }).join('')

  const totalW = Math.round(BODY_WIDTH_MM * MM)
  const table = `<hp:tbl id="1000000001" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="TABLE" repeatHeader="1" rowCnt="${rows.length + 1}" colCnt="7" cellSpacing="0" borderFillIDRef="3" noAdjust="0">`
    + `<hp:sz width="${totalW}" widthRelTo="ABSOLUTE" height="${1700 * (rows.length + 1)}" heightRelTo="ABSOLUTE" protect="0"/>`
    + '<hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>'
    + '<hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:inMargin left="283" right="283" top="170" bottom="170"/>'
    + headRow + bodyRows + '</hp:tbl>'

  return sectionHead
    + `<hp:p id="0" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">${secPrRun}${run(2, title)}</hp:p>`
    + para(2, run(1, ''))
    + para(2, run(1, summary))
    + `<hp:p id="0" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="4">${table}<hp:t/></hp:run></hp:p>`
    + '</hs:sec>'
}

/** hwpx(zip) Blob */
export async function buildReportHwpxBlob({ title, summary, rows }) {
  return buildHwpxBlob(title, buildReportSectionXml({ title, summary, rows }))
}

export async function downloadReportHwpx({ title, summary, rows }) {
  downloadBlob(await buildReportHwpxBlob({ title, summary, rows }), `${title}.hwpx`)
}
