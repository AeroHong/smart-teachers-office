// 검·인정도서 선정 — 서식1/2/3 출력물(인쇄·PDF·미리보기) HTML 빌더.
//
// 서식마다 "A4 한 장"을 뜻하는 <div class="sheet">를 만들고, 같은 HTML을 세 곳에서 쓴다.
//   - 인쇄: 새 창에 그려 window.print() (여러 장은 sheet를 이어붙여 창 하나로)
//   - PDF: 화면 밖 iframe에 그려 sheet마다 html2canvas로 떠서 jsPDF 한 페이지씩
//   - 미리보기: TextbookFormsPanel이 iframe srcDoc으로 그대로 보여줌
// 그래서 인쇄물·PDF·화면 미리보기가 항상 같은 모양이다.
//
// 디자인 원칙(2026-10-01): 흑백·회색조만 쓴다(흑백 복사·인쇄에서도 그대로 보이게). 양식
// 내용(항목·열 구성·문구)은 교육부 매뉴얼 서식 그대로 두고 조판만 다듬었다. 서명은 모두
// 출력물에 직접 받으므로 서명란은 빈 칸 + (인)으로만 둔다.
import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'

const FORM_STYLES = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: #fff; }
  body {
    font-family: 'Malgun Gothic', '맑은 고딕', 'Apple SD Gothic Neo', sans-serif;
    color: #000; font-size: 10pt; line-height: 1.45; word-break: keep-all;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  /* 한 장 = 정확히 A4 한 면. 내용이 넘치면 FIT_SCRIPT가 .fit을 축소해 한 장에 맞춘다
     (후보 교과서가 많아 서식1이 2쪽으로 넘어가던 문제, 2026-10-02). */
  .sheet { background: #fff; padding: 13mm 15mm 12mm; position: relative; overflow: hidden; }
  .sheet.landscape { width: 297mm; height: 210mm; page: landscape; }
  .sheet.portrait { width: 210mm; height: 297mm; page: portrait; }
  .sheet > .fit { transform-origin: top left; }

  .form-no { font-size: 9pt; font-weight: 700; letter-spacing: 0.04em; margin-bottom: 3mm; }
  .form-no span { display: inline-block; border: 1px solid #000; padding: 1px 7px; }
  h1 {
    text-align: center; font-size: 17pt; font-weight: 800; letter-spacing: 0.06em;
    padding-bottom: 3mm; margin-bottom: 4.5mm; border-bottom: 3px double #000;
  }

  table { width: 100%; border-collapse: collapse; }
  .grid { border: 1.5px solid #000; }
  .grid th, .grid td { border: 0.75px solid #6b6b6b; padding: 5px 7px; vertical-align: middle; text-align: center; }
  .grid thead th { background: #e4e4e4; font-weight: 700; border-bottom: 1.2px solid #000; }
  .grid tbody th { background: #f3f3f3; font-weight: 700; }
  .grid tr.total th, .grid tr.total td { background: #e4e4e4; font-weight: 800; border-top: 1.2px solid #000; }
  .grid .left { text-align: left; }
  .num { font-variant-numeric: tabular-nums; }
  .sub { display: block; font-size: 8pt; font-weight: 400; color: #444; margin-top: 1px; }
  .criteria { font-size: 8.3pt; color: #222; line-height: 1.4; }

  .info { border: 1.5px solid #000; margin-bottom: 5mm; }
  .info th, .info td { border: 0.75px solid #6b6b6b; padding: 6px 9px; text-align: left; }
  .info th { background: #e4e4e4; width: 24mm; text-align: center; font-weight: 700; }
  .info td { font-weight: 600; }

  .label { font-weight: 700; margin: 5mm 0 2mm; padding-left: 7px; border-left: 3px solid #000; }
  .opinion-box { border: 1.5px solid #000; min-height: 26mm; padding: 9px 11px; white-space: pre-wrap; }

  .sign { display: flex; justify-content: flex-end; margin-top: 7mm; }
  .sign table { width: auto; border: 1.5px solid #000; }
  .sign th, .sign td { border: 0.75px solid #6b6b6b; text-align: center; }
  .sign th { background: #e4e4e4; font-weight: 700; font-size: 9pt; padding: 4px 10px; min-width: 42mm; }
  .sign td { height: 15mm; padding: 0 10px; font-size: 10.5pt; font-weight: 600; }
  .sign .seal { color: #8a8a8a; font-weight: 400; margin-left: 10px; }
  /* 서식1은 표가 길어 종합의견과 서명란을 한 줄에 나란히 둬서 가로 A4 한 장에 맞춘다 */
  .opinion-row { display: flex; gap: 6mm; align-items: flex-end; }
  .opinion-row .opinion-col { flex: 1; }
  .opinion-row .opinion-box { min-height: 22mm; }
  .opinion-row .sign { margin-top: 0; }

  @page landscape { size: A4 landscape; margin: 0; }
  @page portrait { size: A4 portrait; margin: 0; }
  @page { margin: 0; }
  @media print {
    .sheet { break-after: page; }
    .sheet:last-child { break-after: auto; }
  }
  @media screen {
    body.preview { background: #d4d4d4; padding: 16px; }
    body.preview .sheet { margin: 0 auto 16px; box-shadow: 0 1px 4px rgba(0,0,0,0.25); }
  }
`

function esc(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function fmtPrice(price) {
  if (!price) return ''
  const s = String(price).trim().replace(/원$/, '')
  const n = Number(s.replace(/,/g, ''))
  return `${Number.isFinite(n) && s !== '' ? n.toLocaleString('ko-KR') : s}원`
}

function signTable(signers) {
  return `
<div class="sign"><table>
  <tr>${signers.map((s) => `<th>${esc(s.role)}</th>`).join('')}</tr>
  <tr>${signers.map((s) => `<td>${esc(s.name || '')}<span class="seal">(인)</span></td>`).join('')}</tr>
</table></div>`
}

/** 서식1 — 위원 개인 평가표. score: scores/{uid} 문서 데이터(byCandidate, opinion, teacherName). */
export function buildScoreSheetHtml(adoption, score) {
  const candidates = adoption.candidates || []
  const rubric = adoption.rubric || []
  const maxSum = rubric.reduce((s, r) => s + (Number(r.maxScore) || 0), 0)

  // 표 폭 267mm(가로 A4 − 여백) 중 평가영역 30 + 배점 13을 빼고, 평가기준 칸을 최소 70mm
  // 남긴 나머지를 후보 수로 나눈다(최대 28mm). 후보가 아주 많으면 칸이 좁아지고, 그래도
  // 넘치는 높이는 FIT_SCRIPT가 한 장에 맞춰 줄인다.
  const candWidth = Math.min(28, (267 - 30 - 13 - 70) / Math.max(candidates.length, 1))
  const head = `<tr>
    <th style="width:30mm">평가영역</th><th>평가기준</th><th style="width:13mm">배점</th>
    ${candidates.map((c) => `<th style="width:${candWidth.toFixed(1)}mm">${esc(c.publisher)}${c.price ? `<span class="sub num">${esc(fmtPrice(c.price))}</span>` : ''}</th>`).join('')}
  </tr>`
  const body = rubric.map((r) => `<tr>
    <th>${esc(r.name)}</th>
    <td class="left criteria">${esc(r.criteria || '').replace(/\n/g, '<br>')}</td>
    <td class="num">${r.maxScore}</td>
    ${candidates.map((c) => `<td class="num">${score?.byCandidate?.[c.id]?.byCriterion?.[r.name] ?? ''}</td>`).join('')}
  </tr>`).join('')
  const total = `<tr class="total">
    <th colspan="2">합 계</th><td class="num">${maxSum}</td>
    ${candidates.map((c) => `<td class="num">${score?.byCandidate?.[c.id]?.total ?? ''}</td>`).join('')}
  </tr>`

  return `
<div class="sheet landscape">
  <div class="form-no"><span>서식 1</span></div>
  <h1>검·인정도서 선정기준 평가표</h1>
  <table class="info"><tr>
    <th>과 목</th><td>${esc(adoption.subjectName)}</td>
    <th>평가위원</th><td>${esc(score?.teacherName || '')}</td>
  </tr></table>
  <table class="grid"><thead>${head}</thead><tbody>${body}${total}</tbody></table>
  <div class="opinion-row">
    <div class="opinion-col">
      <div class="label">종합의견 및 추천의견</div>
      <div class="opinion-box">${esc(score?.opinion || '')}</div>
    </div>
    ${signTable([{ role: '평가위원', name: score?.teacherName }])}
  </div>
</div>`
}

/**
 * 서식2 — 평가 총괄표. scores: 그 건의 위원 점수 배열(제출분만 쓰고 익명 번호만 부여) —
 * canManage(관리자/과목대표교사/교과부장)만 받을 수 있는 데이터다. deptHeadName: 확인자(교과부장).
 */
export function buildSummaryHtml(adoption, scores, deptHeadName, members) {
  const candidates = adoption.candidates || []
  const aggregate = adoption.aggregate || {}
  const scoreById = Object.fromEntries((scores || []).map((s) => [s.uid, s]))
  // 위원 전원을 이름으로 세운다(2026-10-01 — 예전엔 제출자만 "위원1·2"로 익명 표기해, 미제출
  // 위원이 있으면 누가 빠졌는지 알 수 없었다). members가 없으면 점수 문서로 대신한다.
  const cols = (members?.length ? members : (scores || []).map((s) => ({ key: s.uid, name: s.teacherName || '' })))
    .map((m) => ({ ...m, score: scoreById[m.key]?.submittedAt ? scoreById[m.key] : null }))
  const submittedCount = cols.filter((c) => c.score).length
  const memberCount = Math.max(cols.length, 1)

  const head = `
  <tr>
    <th rowspan="2">출판사명</th><th rowspan="2" style="width:22mm">가격</th>
    <th colspan="${memberCount}">위원별 점수</th>
    <th rowspan="2" style="width:18mm">총점</th><th rowspan="2" style="width:18mm">평균</th><th rowspan="2" style="width:18mm">비고</th>
  </tr>
  <tr>${cols.length ? cols.map((m) => `<th style="width:20mm">${esc(m.name)}</th>`).join('') : '<th></th>'}</tr>`
  const body = candidates.map((c) => {
    const agg = aggregate[c.id] || {}
    const cells = cols.length
      ? cols.map((m) => (m.score
        ? `<td class="num">${m.score.byCandidate?.[c.id]?.total ?? ''}</td>`
        : '<td style="color:#888;font-size:8pt">미제출</td>')).join('')
      : '<td></td>'
    return `<tr>
      <th class="left">${esc(c.publisher)}${c.author ? `<span class="sub">${esc(c.author)}</span>` : ''}</th>
      <td class="num">${esc(fmtPrice(c.price))}</td>
      ${cells}
      <td class="num"><strong>${agg.total ?? ''}</strong></td>
      <td class="num">${agg.average ?? ''}</td>
      <td>${agg.rank === 1 ? '<strong>1순위</strong>' : ''}</td>
    </tr>`
  }).join('')

  const signoff = adoption.summarySignoff || {}
  return `
<div class="sheet landscape">
  <div class="form-no"><span>서식 2</span></div>
  <h1>검·인정도서 선정기준 평가 총괄표</h1>
  <table class="info"><tr><th>과 목</th><td>${esc(adoption.subjectName)}</td></tr></table>
  <table class="grid"><thead>${head}</thead><tbody>${body}</tbody></table>
  ${submittedCount < cols.length ? `<div style="margin-top:2mm;font-size:8.5pt;color:#333">※ 총점·평균은 제출한 위원 ${submittedCount}명(전체 ${cols.length}명)의 점수로 산출했습니다.</div>` : ''}
  ${signTable([
    { role: '작성자 (위원)', name: signoff.preparedByName },
    { role: '확인자 (교과부장)', name: deptHeadName },
  ])}
</div>`
}

/**
 * 서식3 — 추천 검·인정도서 및 추천 의견서. deptHeadName: 작성자(교과부장),
 * principalName: 확인자(교감) — 시스템에 등록된 교감 이름을 표시만 한다(서명은 출력물에 직접).
 */
export function buildRecommendationHtml(adoption, deptHeadName, principalName) {
  const candidateById = Object.fromEntries((adoption.candidates || []).map((c) => [c.id, c]))
  const rec = adoption.recommendation || { opinions: [] }
  const body = (rec.opinions || []).map((o) => {
    const c = candidateById[o.candidateId] || {}
    return `<tr>
      <th class="num">${o.rank}</th>
      <td class="left"><strong>${esc(c.publisher)}</strong>${c.author ? `<span class="sub">${esc(c.author)}</span>` : ''}</td>
      <td class="num">${esc(fmtPrice(c.price))}</td>
      <td class="left" style="white-space:pre-wrap;height:34mm;vertical-align:top">${esc(o.text || '')}</td>
    </tr>`
  }).join('')

  return `
<div class="sheet portrait">
  <div class="form-no"><span>서식 3</span></div>
  <h1>추천 검·인정도서 및 추천 의견서</h1>
  <table class="info"><tr><th>과 목</th><td>${esc(adoption.subjectName)}</td></tr></table>
  <table class="grid">
    <thead><tr><th style="width:13mm">순위</th><th style="width:40mm">출판사명</th><th style="width:22mm">가격</th><th>추천 의견</th></tr></thead>
    <tbody>${body}</tbody>
  </table>
  ${signTable([
    { role: '교과협의회 작성자 (교과부장)', name: deptHeadName },
    { role: '확인자 (교감)', name: principalName },
  ])}
</div>`
}

/**
 * 학교운영위원회 제출 자료 — 과목별 1~3순위 선정 결과표(2026-10-02).
 * rows: [{ group, subject, ranks: [{ publisher, author, price, rank, tied } | null] ×3, note }]
 * 한 장에 REPORT_ROWS_PER_PAGE행씩 나눠 가로 A4 여러 장으로 만들고 머리글을 장마다 되풀이한다
 * (FIT_SCRIPT가 장마다 넘치면 줄이므로 행이 길어도 한 장을 넘지 않는다).
 */
const REPORT_ROWS_PER_PAGE = 18 // 세로 A4 한 장 기준(2026-10-02 세로형으로 변경)

export function buildCommitteeReportHtml({ title, summary, rows }) {
  const pages = []
  for (let i = 0; i < Math.max(rows.length, 1); i += REPORT_ROWS_PER_PAGE) pages.push(rows.slice(i, i + REPORT_ROWS_PER_PAGE))
  // 순위 칸은 출판사(굵게)와 저자만 — 가격은 학운위 자료에서 뺀다(2026-10-02 사용자 요청).
  const rankCell = (r) => (r
    ? `<td class="left" style="font-size:9pt"><strong>${esc(r.publisher)}</strong>${r.tied ? ' <span style="font-size:7.5pt">(공동)</span>' : ''}${r.author ? `<span class="sub">${esc(r.author)}</span>` : ''}</td>`
    : '<td style="color:#888">-</td>')
  return pages.map((pageRows, pi) => `
<div class="sheet portrait">
  ${pi === 0 ? `<h1>${esc(title)}</h1>
  <div style="font-size:9.5pt;margin-bottom:3mm">${esc(summary)}</div>` : `<div style="font-size:9pt;font-weight:700;margin-bottom:3mm">${esc(title)} (계속)</div>`}
  <table class="grid">
    <thead><tr>
      <th style="width:9mm">연번</th><th style="width:19mm">교과군</th><th style="width:28mm">과목</th>
      <th>1순위</th><th>2순위</th><th>3순위</th><th style="width:26mm">비고</th>
    </tr></thead>
    <tbody>${pageRows.map((row, ri) => `<tr>
      <td class="num">${pi * REPORT_ROWS_PER_PAGE + ri + 1}</td>
      <td style="font-size:8.5pt">${esc(row.group)}</td>
      <th class="left" style="font-size:9pt">${esc(row.subject)}</th>
      ${[0, 1, 2].map((k) => rankCell(row.ranks[k])).join('')}
      <td class="left" style="font-size:8pt">${esc(row.note || '')}</td>
    </tr>`).join('')}</tbody>
  </table>
  <div style="text-align:center;font-size:8.5pt;margin-top:3mm">- ${pi + 1} / ${pages.length} -</div>
</div>`).join('')
}

// 각 .sheet의 내용을 .fit으로 감싸고, 한 장(패딩 안쪽) 높이를 넘으면 축소해 맞춘다. 축소하면
// 폭도 줄어 오른쪽이 비므로, 줄인 만큼 폭을 넓혀 다시 재는 것을 몇 번 반복한다(넓히면 줄바꿈이
// 줄어 높이도 조금 준다). transform은 레이아웃에 영향이 없어 .sheet의 overflow:hidden으로
// 보이는 크기만 한 장이 된다. 인쇄 창·PDF용 iframe·미리보기 모두 이 스크립트를 쓴다.
const FIT_SCRIPT = `
window.fitSheets = function () {
  document.querySelectorAll('.sheet').forEach(function (sheet) {
    var inner = sheet.querySelector(':scope > .fit');
    if (!inner) {
      inner = document.createElement('div');
      inner.className = 'fit';
      while (sheet.firstChild) inner.appendChild(sheet.firstChild);
      sheet.appendChild(inner);
    }
    inner.style.transform = '';
    inner.style.width = '';
    var cs = getComputedStyle(sheet);
    var availH = sheet.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    var availW = sheet.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    if (inner.scrollHeight <= availH + 0.5) return;
    // 한 장에 들어가는 가장 큰 배율을 이분 탐색으로 찾는다(배율 s면 폭을 availW/s로 넓혀 잰다).
    var fits = function (s) {
      inner.style.width = (availW / s) + 'px';
      return inner.scrollHeight * s <= availH;
    };
    var lo = 0.3, hi = 1;
    for (var i = 0; i < 14; i++) {
      var mid = (lo + hi) / 2;
      if (fits(mid)) lo = mid; else hi = mid;
    }
    fits(lo);
    inner.style.transform = 'scale(' + lo + ')';
  });
};
window.fitSheets();
window.addEventListener('load', window.fitSheets);
`

/** sheet HTML들을 완전한 문서로 감싼다. mode: 'print'(자동 인쇄) | 'preview'(회색 배경 위 종이) | 'plain' */
export function wrapFormsDocument(title, sheetsHtml, mode = 'plain') {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>${esc(title)}</title>
<style>${FORM_STYLES}</style>
</head>
<body class="${mode === 'preview' ? 'preview' : ''}">
${sheetsHtml}
<script>${FIT_SCRIPT}</script>
${mode === 'print' ? '<script>window.onload = function(){ window.fitSheets(); setTimeout(function(){ window.print(); }, 300); };</script>' : ''}
</body>
</html>`
}

// 반환값으로 팝업 차단 여부를 알려준다.
export function printForms(title, sheetsHtml) {
  const w = window.open('', '_blank', 'width=1100,height=800')
  if (!w) return false
  w.document.write(wrapFormsDocument(title, sheetsHtml, 'print'))
  w.document.close()
  return true
}

function safeFileName(name) {
  return String(name || '서식').replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 100) || '서식'
}

/**
 * sheet마다 PDF 한 페이지(가로/세로는 sheet 클래스 그대로). 화면 밖 iframe에 그려서
 * 포털 화면의 CSS가 섞이지 않게 하고, 폰트 로딩이 끝난 뒤 캡처한다. 한 장보다 길게
 * 넘친 sheet는 잘리지 않도록 페이지 안에 맞춰 축소한다.
 */
export async function downloadFormsPdf(fileName, sheetsHtml) {
  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'position:fixed;left:-10000px;top:0;width:1200px;height:1600px;border:0;visibility:hidden'
  document.body.appendChild(iframe)
  try {
    await new Promise((resolve) => {
      iframe.onload = resolve
      iframe.srcdoc = wrapFormsDocument(fileName, sheetsHtml, 'plain')
    })
    const doc = iframe.contentDocument
    if (doc.fonts?.ready) await doc.fonts.ready
    iframe.contentWindow.fitSheets?.()
    const sheets = Array.from(doc.querySelectorAll('.sheet'))
    let pdf = null
    for (const sheet of sheets) {
      const landscape = sheet.classList.contains('landscape')
      const orientation = landscape ? 'landscape' : 'portrait'
      const [pw, ph] = landscape ? [297, 210] : [210, 297]
      const canvas = await html2canvas(sheet, { scale: 3, backgroundColor: '#ffffff', useCORS: true, logging: false })
      if (!pdf) pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4', compress: true })
      else pdf.addPage('a4', orientation)
      const ratio = canvas.height / canvas.width
      let w = pw
      let h = pw * ratio
      if (h > ph) { h = ph; w = ph / ratio }
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', (pw - w) / 2, 0, w, h, undefined, 'FAST')
    }
    if (pdf) pdf.save(`${safeFileName(fileName)}.pdf`)
  } finally {
    iframe.remove()
  }
}

// ── 기존 호출부 호환용 단축 함수 ─────────────────────────────────────────────

export function openScoreSheetPrint(adoption, score) {
  return printForms(`서식1_${adoption.subjectName}_${score?.teacherName || ''}`, buildScoreSheetHtml(adoption, score))
}

export function downloadScoreSheetPdf(adoption, score) {
  return downloadFormsPdf(`서식1_${adoption.subjectName}_${score?.teacherName || ''}`, buildScoreSheetHtml(adoption, score))
}

/**
 * 여러 과목의 서식3을 창 하나로 일괄 인쇄한다.
 * @param {Array<{adoption: object, deptHeadName: string}>} items
 */
export function openBulkRecommendationPrint(items, title = '추천의견서_일괄출력', principalName = '') {
  if (!items?.length) return true
  return printForms(title, items.map(({ adoption, deptHeadName }) => buildRecommendationHtml(adoption, deptHeadName, principalName)).join(''))
}
