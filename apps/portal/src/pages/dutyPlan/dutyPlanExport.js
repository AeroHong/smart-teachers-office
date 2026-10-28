// 업무분장 결재 첨부 — 원본(선유고 2026 업무분장 hwpx)과 같은 두 부분:
//   ① 'YYYY학년도 부서별 업무분장 (YYYY.3.1.)' — 구분 · 부서(번호) · 성명 · 담임 · 업무 · 주요 업무 내용, 끝줄 인원 요약
//   ② 'YYYY학년도 부장교사 및 담임교사 명단' — 부장교사 / 담임·부담임 / 교과부장
// 한글(hwpx)은 공용 작성기(lib/hwpx/hwpxWriter.js), 인쇄·PDF는 검·인정도서 서식 엔진(textbook/textbookPrint.js)을 쓴다.
// 표의 행·병합은 순수 함수(approvalRows 등, apps/shared/lib/dutyPlan.js)가 정하고, 여기서는 그리기만 한다.
import { approvalRows, headRoster, homeroomSlots, nameWithSubject, summarizeStaff, summaryLine } from '@shared/lib/dutyPlan'
import { ALIGN, CHAR, buildHwpxBlob, downloadBlob, para, run, sectionXml, table, tablePara } from '../../lib/hwpx/hwpxWriter'
import { downloadFormsPdf, printForms } from '../textbook/textbookPrint'

// 구분 8 · 부서 15 · 번호 13 · 성명 13 · 담임 9 · 업무 22 · 내용 100 = 180mm (원본 비율)
const WIDTHS = [8, 15, 13, 13, 9, 22, 100]

export const titlesOf = (year, dateLabel) => ({
  duties: `${year}학년도 부서별 업무분장${dateLabel ? ` (${dateLabel})` : ''}`,
  rosters: `${year}학년도 부장교사 및 담임교사 명단`,
})

/** 세로쓰기처럼 보이게 글자마다 줄을 바꾼다(원본 구분 칸) */
const vertical = (s) => [...String(s || '').replace(/\s/g, '')].join('\n')

function gradeTableRows(data, classCounts, specialClasses) {
  const slots = homeroomSlots(data, classCounts || {}, specialClasses || {})
  const byGrade = [1, 2, 3].map((g) => slots.filter((s) => s.grade === g))
  const n = Math.max(0, ...byGrade.map((l) => l.length))
  return Array.from({ length: n }, (_, i) => byGrade.map((list) => list[i] || null))
}

// ── 한글(hwpx) ───────────────────────────────────────────────────────

export function buildDutySectionXml({ data, year, dateLabel, admins = 0, classCounts, specialClasses }) {
  const t = titlesOf(year, dateLabel)
  const rows = approvalRows(data)
  const head = [
    { text: '구분' }, { text: '부서', colSpan: 2 }, { text: '성명' }, { text: '담임' }, { text: '업무' }, { text: '주 요 업 무 내 용' },
  ]
  const body = rows.map((r) => [
    ...(r.categorySpan ? [{ text: vertical(r.category), rowSpan: r.categorySpan, header: true }] : []),
    ...(r.deptSpan ? [{ text: r.dept, rowSpan: r.deptSpan, char: CHAR.cellBold }] : []),
    { text: r.slotLabel, char: CHAR.tiny },
    { text: r.name, char: CHAR.cellBold },
    { text: r.mark, char: CHAR.tiny },
    { text: r.title, char: CHAR.cell },
    { text: r.tasks, align: ALIGN.left, char: CHAR.tiny },
  ])
  const foot = [{ text: summaryLine(summarizeStaff(data), { admins }), colSpan: 7, align: ALIGN.left, char: CHAR.cell, header: false }]
  const dutyTable = table({ widths: WIDTHS, rows: [head, ...body, foot] })

  const heads = headRoster(data)
  const headTable = table({
    widths: [50, 45, 45, 40],
    rows: [[{ text: '부 서' }, { text: '부 장' }, { text: '과 목' }, { text: '비 고' }], ...heads.map((h) => [{ text: h.dept }, { text: h.name }, { text: h.subject }, { text: h.note }])],
  })
  const gradeRows = gradeTableRows(data, classCounts, specialClasses)
  const hrTable = table({
    widths: [10, 30, 20, 10, 30, 20, 10, 30, 20],
    headerRows: 2,
    rows: [
      [1, 2, 3].map((g) => ({ text: `${g}학년`, colSpan: 3 })),
      [1, 2, 3].flatMap(() => [{ text: '반' }, { text: '담임(과목)' }, { text: '부담임' }]),
      ...gradeRows.map((cols) => cols.flatMap((s) => {
        if (!s) return [{ text: '' }, { text: '' }, { text: '' }]
        if (s.classNo === '특수') return [{ text: '특수' }, { text: s.homeroomName || '', colSpan: 2 }]
        return [{ text: String(s.classNo) }, { text: nameWithSubject(data, s.homeroomUid, s.homeroomName) }, { text: nameWithSubject(data, s.subHomeroomUid, s.subHomeroomName) }]
      })),
    ],
  })
  const shTable = table({
    widths: [50, 50, 80],
    rows: [[{ text: '교 과' }, { text: '부 장' }, { text: '비고' }], ...(data.subjectHeads || []).map((s) => [{ text: s.group }, { text: s.name }, { text: s.note || '' }])],
  })

  const sub = (text) => para(ALIGN.left, run(CHAR.cellBold, text))
  const gap = para(ALIGN.left, '')
  return sectionXml(t.duties, [
    gap,
    tablePara(dutyTable),
    // 둘째 부분은 새 쪽에서
    para(ALIGN.center, run(CHAR.title, t.rosters), { pageBreak: true }),
    gap, sub('1. 부장교사 명단'), tablePara(headTable),
    gap, sub('2. 담임/부담임교사 명단'), tablePara(hrTable),
    gap, sub('3. 교과부장교사 명단'), tablePara(shTable),
  ])
}

export async function downloadDutyHwpx(o) {
  const t = titlesOf(o.year, o.dateLabel)
  const blob = await buildHwpxBlob(t.duties, buildDutySectionXml(o))
  downloadBlob(blob, `${o.year}학년도 업무분장, 부장교사, 담임부담임교사, 교과부장교사 명단.hwpx`)
}

// ── 인쇄 · PDF (A4 세로) ─────────────────────────────────────────────

function esc(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const STYLE = `<style>
  .dp h1 { font-size: 15pt; margin-bottom: 4mm; text-align: center; }
  .dp h2 { font-size: 10.5pt; margin: 4mm 0 1.5mm; }
  .dp table { border-collapse: collapse; width: 100%; table-layout: fixed; border: 1.2px solid #000; }
  .dp th, .dp td { border: 0.6px solid #555; font-size: 8pt; line-height: 1.35; padding: 1.2mm 1mm; text-align: center; vertical-align: middle; }
  .dp th { background: #e4e4e4; font-weight: 800; }
  .dp td.l { text-align: left; font-size: 7.4pt; }
  .dp td.b { font-weight: 700; }
  .dp td.cat { background: #e4e4e4; font-weight: 800; writing-mode: vertical-rl; letter-spacing: 2px; }
  .dp td.foot { text-align: left; font-size: 8pt; }
</style>`

/** 한 장에 들어갈 만큼(부서를 쪼개지 않고) 끊는다 — FIT_SCRIPT가 넘치면 축소하지만 너무 줄지 않게 */
function chunkByDept(rows, max = 30) {
  const chunks = []
  let cur = []
  let i = 0
  while (i < rows.length) {
    const n = rows[i].deptSpan || 1
    const dept = rows.slice(i, i + n)
    if (cur.length && cur.length + dept.length > max) { chunks.push(cur); cur = [] }
    cur.push(...dept)
    i += n
  }
  if (cur.length) chunks.push(cur)
  return chunks
}

export function buildDutySheetsHtml({ data, year, dateLabel, admins = 0, classCounts, specialClasses, diff = null }) {
  const t = titlesOf(year, dateLabel)
  const all = approvalRows(data)
  const chunks = chunkByDept(all)
  const colgroup = `<colgroup>${WIDTHS.map((w) => `<col style="width:${(w / 180) * 100}%">`).join('')}</colgroup>`
  const head = '<thead><tr><th>구분</th><th colspan="2">부서</th><th>성명</th><th>담임</th><th>업무</th><th>주 요 업 무 내 용</th></tr></thead>'
  const dutySheets = chunks.map((rows, ci) => {
    // 쪽마다 구분 칸 병합을 다시 센다
    const catLeft = new Map()
    rows.forEach((r) => catLeft.set(r.category, (catLeft.get(r.category) || 0) + 1))
    const seen = new Set()
    const body = rows.map((r) => {
      const cat = seen.has(r.category) ? '' : `<td class="cat" rowspan="${catLeft.get(r.category)}">${esc(r.category)}</td>`
      seen.add(r.category)
      return `<tr>${cat}${r.deptSpan ? `<td class="b" rowspan="${r.deptSpan}">${esc(r.dept)}</td>` : ''}<td>${esc(r.slotLabel)}</td><td class="b">${esc(r.name)}</td><td>${esc(r.mark)}</td><td>${esc(r.title)}</td><td class="l">${esc(r.tasks)}</td></tr>`
    }).join('')
    const foot = ci === chunks.length - 1 ? `<tr><td class="foot" colspan="7">${esc(summaryLine(summarizeStaff(data), { admins }))}</td></tr>` : ''
    return `<div class="sheet portrait dp">${ci === 0 ? `<h1>${esc(t.duties)}</h1>` : ''}<table>${colgroup}${head}<tbody>${body}${foot}</tbody></table></div>`
  })

  const heads = headRoster(data)
  const gradeRows = gradeTableRows(data, classCounts, specialClasses)
  const hr = gradeRows.map((cols) => `<tr>${cols.map((s) => {
    if (!s) return '<td></td><td></td><td></td>'
    if (s.classNo === '특수') return `<td>특수</td><td colspan="2">${esc(s.homeroomName || '')}</td>`
    return `<td>${s.classNo}</td><td class="b">${esc(nameWithSubject(data, s.homeroomUid, s.homeroomName))}</td><td>${esc(nameWithSubject(data, s.subHomeroomUid, s.subHomeroomName))}</td>`
  }).join('')}</tr>`).join('')
  const roster = `<div class="sheet portrait dp"><h1>${esc(t.rosters)}</h1>
    <h2>1. 부장교사 명단</h2>
    <table><thead><tr><th>부 서</th><th>부 장</th><th>과 목</th><th>비 고</th></tr></thead><tbody>${heads.map((h) => `<tr><td>${esc(h.dept)}</td><td class="b">${esc(h.name)}</td><td>${esc(h.subject)}</td><td>${esc(h.note)}</td></tr>`).join('')}</tbody></table>
    <h2>2. 담임/부담임교사 명단</h2>
    <table><thead><tr><th colspan="3">1학년</th><th colspan="3">2학년</th><th colspan="3">3학년</th></tr><tr>${'<th>반</th><th>담임(과목)</th><th>부담임</th>'.repeat(3)}</tr></thead><tbody>${hr}</tbody></table>
    <h2>3. 교과부장교사 명단</h2>
    <table><thead><tr><th>교 과</th><th>부 장</th><th>비고</th></tr></thead><tbody>${(data.subjectHeads || []).map((s) => `<tr><td>${esc(s.group)}</td><td class="b">${esc(s.name)}</td><td>${esc(s.note || '')}</td></tr>`).join('')}</tbody></table>
  </div>`
  return STYLE + dutySheets.join('') + roster + (diff ? diffSheet(year, diff) : '')
}

/** 작년 대비 변경 요약 한 장(yearOverYear 결과) */
function diffSheet(year, d) {
  const list = (title, items, fmt) => (items.length
    ? `<h2>${esc(title)} (${items.length})</h2><table><tbody>${items.map((x) => `<tr>${fmt(x).map((c, i) => `<td class="${i === fmt(x).length - 1 ? 'l' : ''}">${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
    : '')
  const body = [
    list('신설 업무', d.added, (x) => [x.dept, x.title]),
    list('나눠 만든 업무', d.split, (x) => [x.dept, x.title, `← ${x.from}`]),
    list('없앤 업무', d.removed, (x) => [x.dept, x.title]),
    list('부서를 옮긴 업무', d.moved, (x) => [x.title, `${x.from} → ${x.to}`]),
    list('이름을 바꾼 업무', d.renamed, (x) => [x.dept, `${x.from} → ${x.to}`]),
    list('담당자가 바뀐 업무', d.handover, (x) => [x.dept, x.title, `${x.before || '—'} → ${x.after || '—'}`]),
  ].join('')
  return `<div class="sheet portrait dp"><h1>${esc(`${year}학년도 업무분장 — ${d.prevYear}학년도 대비 변경 사항`)}</h1>${body || '<p>바뀐 것이 없습니다.</p>'}</div>`
}

export const printDuty = (o) => printForms(titlesOf(o.year, o.dateLabel).duties, buildDutySheetsHtml(o))
export const downloadDutyPdf = (o) => downloadFormsPdf(`${o.year}학년도 업무분장`, buildDutySheetsHtml(o))
