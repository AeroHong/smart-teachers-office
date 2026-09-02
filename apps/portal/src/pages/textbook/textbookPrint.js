// 검·인정도서 선정 — 서식1/2/3 인쇄용 HTML 빌더.
//
// apps/portal/src/pages/tools/asaChecklistPrint.js와 같은 패턴: HTML 문자열을 만들어 새 창에
// document.write()로 그린 뒤 자동으로 window.print()를 띄운다. 여러 건은 <section
// style="page-break-after:always">로 이어붙여 창 하나로 일괄 인쇄한다.

const PRINT_STYLES = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: '맑은 고딕', 'Malgun Gothic', sans-serif; font-size: 10pt; padding: 10mm 12mm; color: #111; }
  h1 { text-align: center; font-size: 15pt; font-weight: bold; margin-bottom: 14px; }
  .meta-row { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 10.5pt; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  td, th { border: 1px solid #333; padding: 5px 6px; vertical-align: middle; text-align: center; }
  th { background: #f0f0f0; font-weight: bold; }
  .left { text-align: left; }
  .opinion-box { border: 1px solid #333; min-height: 60px; padding: 8px; margin-bottom: 14px; white-space: pre-wrap; }
  .sign-row { display: flex; justify-content: flex-end; gap: 40px; margin-top: 18px; font-size: 10.5pt; }
  .sign-cell { text-align: center; min-width: 160px; }
  .sign-img { max-height: 44px; max-width: 120px; display: block; margin: 4px auto; }
  .sign-blank { height: 44px; border-bottom: 1px solid #888; margin: 4px 0; }
  @media print {
    @page { size: A4 landscape; margin: 10mm 12mm; }
    body { padding: 0; }
  }
`

function esc(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function fmtDate(ts) {
  if (!ts) return ''
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

function candidateLabel(c) {
  return c.price ? `${esc(c.publisher)}(${esc(c.price)})` : esc(c.publisher)
}

/** 서식1 — 위원 개인 평가표. score: scores/{uid} 문서 데이터(byCandidate, opinion, teacherName). */
export function buildScoreSheetHtml(adoption, score) {
  const candidates = adoption.candidates || []
  const rubric = adoption.rubric || []
  const maxSum = rubric.reduce((s, r) => s + (Number(r.maxScore) || 0), 0)

  const headerRow = `<tr><th class="left">평가영역</th>${candidates.map((c) => `<th>${candidateLabel(c)}</th>`).join('')}</tr>`
  const bodyRows = rubric.map((r) => `<tr><td class="left">${esc(r.name)} (${r.maxScore}점)</td>${
    candidates.map((c) => `<td>${score?.byCandidate?.[c.id]?.byCriterion?.[r.name] ?? ''}</td>`).join('')
  }</tr>`).join('')
  const totalRow = `<tr><th class="left">합계 (${maxSum}점)</th>${
    candidates.map((c) => `<th>${score?.byCandidate?.[c.id]?.total ?? ''}</th>`).join('')
  }</tr>`

  return `
<h1>【서식1】 검·인정도서 선정기준 평가표</h1>
<div class="meta-row">
  <span>과목: <strong>${esc(adoption.subjectName)}</strong></span>
  <span>위원: <strong>${esc(score?.teacherName || '')}</strong> (인)</span>
</div>
<table>${headerRow}${bodyRows}${totalRow}</table>
<div class="left" style="margin-bottom:4px;font-weight:bold">&lt;종합의견 및 추천의견&gt;</div>
<div class="opinion-box">${esc(score?.opinion || '')}</div>
`
}

/**
 * 서식2 — 평가 총괄표. scores: 그 건에 제출된(submittedAt 있는) 위원 점수 배열(익명, 순서만
 * 부여) — canManage(관리자/과목대표교사/교과부장)만 호출 가능한 데이터라 여기서도 그 앞단에서
 * 이미 걸러 넘겨받는다. deptHeadName: 실시간 조회한 교과부장 이름(확인자).
 */
export function buildSummaryHtml(adoption, scores, deptHeadName) {
  const candidates = adoption.candidates || []
  const submitted = (scores || []).filter((s) => s.submittedAt)
  const aggregate = adoption.aggregate || {}

  const memberHeaders = submitted.map((_, i) => `<th>위원${i + 1}</th>`).join('')
  const rows = candidates.map((c) => {
    const agg = aggregate[c.id] || {}
    const memberCells = submitted.map((s) => `<td>${s.byCandidate?.[c.id]?.total ?? ''}</td>`).join('')
    return `<tr>
      <td class="left">${esc(c.publisher)}${c.author ? `<br><span style="font-size:8.5pt;color:#555">${esc(c.author)}</span>` : ''}</td>
      <td>${esc(c.price || '')}</td>
      ${memberCells}
      <td>${agg.total ?? ''}</td>
      <td>${agg.average ?? ''}</td>
      <td>${agg.rank === 1 ? '1순위' : ''}</td>
    </tr>`
  }).join('')

  const signoff = adoption.summarySignoff || {}

  return `
<h1>【서식2】 검·인정도서 선정기준 평가 총괄표</h1>
<div class="meta-row"><span>과목: <strong>${esc(adoption.subjectName)}</strong></span></div>
<table>
  <tr><th class="left">출판사명</th><th>가격</th><th colspan="${submitted.length || 1}">위 원 별 점 수</th><th>총점</th><th>평균</th><th>비고</th></tr>
  <tr><th class="left"></th><th></th>${memberHeaders || '<th></th>'}<th></th><th></th><th></th></tr>
  ${rows}
</table>
<div class="sign-row">
  <div class="sign-cell">작성자(위원): ${esc(signoff.preparedByName || '')} (인)</div>
  <div class="sign-cell">확인자(교과부장): ${esc(deptHeadName || '')} (인)</div>
</div>
`
}

/** 서식3 — 추천 검·인정도서 및 추천 의견서. deptHeadName: 작성자(교과부장, 실시간 조회). */
export function buildRecommendationHtml(adoption, deptHeadName) {
  const candidateById = Object.fromEntries((adoption.candidates || []).map((c) => [c.id, c]))
  const rec = adoption.recommendation || { opinions: [] }
  const rows = rec.opinions.map((o) => {
    const c = candidateById[o.candidateId] || {}
    return `<tr>
      <td>${o.rank}</td>
      <td class="left">${esc(c.publisher)}${c.author ? ` (${esc(c.author)})` : ''}</td>
      <td>${esc(c.price || '')}</td>
      <td class="left">${esc(o.text || '')}</td>
    </tr>`
  }).join('')

  const confirmedCell = rec.confirmedAt
    ? `<img class="sign-img" src="${rec.confirmedSignature?.dataUrl || ''}"><div>${esc(rec.confirmedByName)} · ${fmtDate(rec.confirmedAt)}</div>`
    : `<div class="sign-blank"></div><div style="color:#999">(미확인)</div>`

  return `
<h1>【서식3】 추천 검·인정도서 및 추천 의견서</h1>
<div class="meta-row"><span>과목: <strong>${esc(adoption.subjectName)}</strong></span></div>
<table>
  <tr><th>순위</th><th class="left">출판사명</th><th>가격</th><th class="left">추천 의견</th></tr>
  ${rows}
</table>
<div class="sign-row">
  <div class="sign-cell">교과협의회 작성자(교과부장): ${esc(deptHeadName || '')} (인)</div>
  <div class="sign-cell">확인자(교감): ${confirmedCell}</div>
</div>
`
}

function wrapPrintDocument(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>${esc(title)}</title>
<style>${PRINT_STYLES}</style>
</head>
<body>
${bodyHtml}
<script>setTimeout(function(){ window.print(); }, 400);</script>
</body>
</html>`
}

// 반환값으로 팝업 차단 여부를 알려준다.
function openPrintWindow(html) {
  const w = window.open('', '_blank', 'width=1000,height=750')
  if (!w) return false
  w.document.write(html)
  w.document.close()
  return true
}

export function openScoreSheetPrint(adoption, score) {
  return openPrintWindow(wrapPrintDocument(`서식1_${adoption.subjectName}_${score?.teacherName || ''}`, buildScoreSheetHtml(adoption, score)))
}

export function openSummaryPrint(adoption, scores, deptHeadName) {
  return openPrintWindow(wrapPrintDocument(`서식2_${adoption.subjectName}`, buildSummaryHtml(adoption, scores, deptHeadName)))
}

export function openRecommendationPrint(adoption, deptHeadName) {
  return openPrintWindow(wrapPrintDocument(`서식3_${adoption.subjectName}`, buildRecommendationHtml(adoption, deptHeadName)))
}

/**
 * 여러 과목의 서식3을 창 하나에 페이지구분으로 이어붙여 일괄 인쇄한다.
 * @param {Array<{adoption: object, deptHeadName: string}>} items
 */
export function openBulkRecommendationPrint(items, title = '추천의견서_일괄출력') {
  if (!items?.length) return true
  const sections = items.map(({ adoption, deptHeadName }, idx) => {
    const isLast = idx === items.length - 1
    return `<section style="${isLast ? '' : 'page-break-after: always;'}">${buildRecommendationHtml(adoption, deptHeadName)}</section>`
  }).join('')
  return openPrintWindow(wrapPrintDocument(title, sections))
}
