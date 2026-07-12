import { PROCESS_CHECKLIST_GROUPS, RESULT_GATE_QUESTIONS, RESULT_CHECKLIST_GROUPS } from './asaChecklistData'
import { cleanTeacherName as cleanName } from '../../utils/nameUtils'

/**
 * 붙임1 과정 체크리스트 인쇄 HTML 생성 및 새 창 열기
 * @param {object} submission      - Firestore submission document data
 * @param {object} subject         - Firestore subject document data
 * @param {object} teacherNameMap  - { email: name } 맵 (선택)
 */
export function openProcessChecklistPrint(submission, subject, teacherNameMap = {}) {
  const schoolName = submission?.schoolName || ''
  const subjectName = subject?.name || submission?.subjectName || ''
  const grade = subject?.grade ?? ''
  const semester = subject?.semester ?? ''
  const checkDate = submission?.checkDate || ''
  const answers = submission?.answers || {}
  const signatures = submission?.signatures || {}
  const teacherEmails = subject?.teacherEmails || []

  // 교사 서명 셀 HTML
  const teacherSigHtml = teacherEmails.map((email) => {
    const sig = signatures[email]
    const rawName = teacherNameMap[email] || sig?.teacherName || email
    const name = cleanName(rawName)
    const imgHtml = sig?.dataUrl
      ? `<img src="${sig.dataUrl}" style="max-height:48px;max-width:120px;display:block;margin:0 auto 2px">`
      : '<div style="height:48px;border-bottom:1px solid #888;margin-bottom:2px"></div>'
    return `<span style="display:inline-block;text-align:center;margin-right:24px;min-width:110px">
      ${imgHtml}
      <span style="font-size:8pt">${name} (서명)</span>
    </span>`
  }).join('')

  // 교감 서명 HTML
  const principalSig = submission?.principalSignature
  const principalHtml = principalSig?.dataUrl
    ? `<img src="${principalSig.dataUrl}" style="max-height:48px;max-width:120px;display:block;margin:0 auto 2px"><div style="font-size:8pt;text-align:center">교감 (서명)</div>`
    : '<div style="height:48px;border-bottom:1px solid #888;margin-bottom:2px"></div><div style="font-size:8pt;text-align:center">(서명)</div>'

  // 체크리스트 행 HTML
  let rows = ''
  for (const group of PROCESS_CHECKLIST_GROUPS) {
    const qs = group.questions
    rows += qs.map((q, idx) => {
      const ans = answers[q.id] || {}
      const isYes = ans.value === '예'
      const isNo = ans.value === '아니오'
      const checkedEvidence = ans.evidenceChecks || []
      const evidenceHtml = q.evidence.length > 0
        ? q.evidence.map((ev) => {
            const checked = checkedEvidence.includes(ev)
            return `<span style="display:block;white-space:nowrap">${checked ? '☑' : '□'} ${ev}</span>`
          }).join('')
        : '&nbsp;'

      const groupCell = idx === 0
        ? `<td rowspan="${qs.length}" style="text-align:center;font-weight:bold;vertical-align:middle;width:58px;word-break:keep-all;font-size:8.5pt;background:#f5f5f5">${group.groupName}</td>`
        : ''

      return `<tr>
        ${groupCell}
        <td style="padding:3px 6px;font-size:8.5pt">${q.id.replace('p', '')}. ${q.text}</td>
        <td style="text-align:center;width:32px;font-size:12pt">${isYes ? '✔' : ''}</td>
        <td style="text-align:center;width:42px;font-size:12pt">${isNo ? '✔' : ''}</td>
        <td style="font-size:7.5pt;padding:3px 5px;white-space:nowrap">${evidenceHtml}</td>
      </tr>`
    }).join('')
  }

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>붙임1 성취평가제 운영 과정 점검 체크리스트</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: '맑은 고딕', 'Malgun Gothic', sans-serif; font-size: 9pt; padding: 8mm 10mm; }
  .doc-label { text-align: center; font-size: 9pt; margin-bottom: 4px; }
  h1 { text-align: center; font-size: 13pt; font-weight: bold; margin-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; }
  td, th { border: 1px solid #000; padding: 4px 6px; vertical-align: middle; }
  .label-cell { background: #e8e8e8; font-weight: bold; text-align: center; white-space: nowrap; width: 90px; }
  .check-th { background: #e8e8e8; font-weight: bold; text-align: center; }
  .check-table { margin-top: 6px; }
  @media print {
    @page { size: A4 portrait; margin: 8mm 10mm; }
    body { padding: 0; }
  }
</style>
</head>
<body>
<p class="doc-label">&lt;붙임1&gt;</p>
<h1>단위학교(과목별) 성취평가 운영 과정 점검 체크리스트</h1>

<table style="margin-bottom:5px">
  <colgroup>
    <col style="width:90px"><col><col style="width:90px"><col>
  </colgroup>
  <tr>
    <td class="label-cell">학교명</td>
    <td>${schoolName}</td>
    <td class="label-cell">점검 과목</td>
    <td>${subjectName}${grade ? ` (${grade}학년 ${semester}학기)` : ''}</td>
  </tr>
  <tr>
    <td class="label-cell">공동 출제 교사</td>
    <td colspan="3" style="padding:6px 8px">${teacherSigHtml || '&nbsp;'}</td>
  </tr>
  <tr>
    <td class="label-cell">점검일자</td>
    <td>${checkDate}</td>
    <td class="label-cell">확인자 (교감)</td>
    <td style="text-align:center;padding:6px">${principalHtml}</td>
  </tr>
</table>

<table class="check-table">
  <colgroup>
    <col style="width:58px"><col><col style="width:32px"><col style="width:42px"><col style="width:195px">
  </colgroup>
  <thead>
    <tr>
      <th class="check-th">점검 단계</th>
      <th class="check-th">점검 내용</th>
      <th class="check-th">예</th>
      <th class="check-th">아니오</th>
      <th class="check-th" style="font-size:7.5pt">점검내용 준수 여부 파악 시 아래 항목의 자료를 확인하였을 경우 ✔표시</th>
    </tr>
  </thead>
  <tbody>
    ${rows}
  </tbody>
</table>

<script>setTimeout(function(){ window.print(); }, 400);</script>
</body>
</html>`

  const w = window.open('', '_blank', 'width=900,height=700')
  if (w) {
    w.document.write(html)
    w.document.close()
  }
}

/**
 * 붙임2 결과 체크리스트 인쇄 HTML 생성 및 새 창 열기
 * @param {object} submission      - Firestore submission document data
 * @param {object} subject         - Firestore subject document data
 * @param {object} teacherNameMap  - { email: name } 맵 (선택)
 */
export function openResultChecklistPrint(submission, subject, teacherNameMap = {}) {
  const schoolName = submission?.schoolName || ''
  const subjectName = subject?.name || submission?.subjectName || ''
  const grade = subject?.grade ?? ''
  const semester = subject?.semester ?? ''
  const checkDate = submission?.checkDate || ''
  const answers = submission?.answers || {}
  const signatures = submission?.signatures || {}
  const teacherEmails = subject?.teacherEmails || []
  const opinion = submission?.opinion || ''

  const gateTriggered =
    answers.rg1?.value === '예' || answers.rg2?.value === '예'

  // 교사 서명 셀 HTML
  const teacherSigHtml = teacherEmails.map((email) => {
    const sig = signatures[email]
    const rawName = teacherNameMap[email] || sig?.teacherName || email
    const name = cleanName(rawName)
    const imgHtml = sig?.dataUrl
      ? `<img src="${sig.dataUrl}" style="max-height:48px;max-width:120px;display:block;margin:0 auto 2px">`
      : '<div style="height:48px;border-bottom:1px solid #888;margin-bottom:2px"></div>'
    return `<span style="display:inline-block;text-align:center;margin-right:24px;min-width:110px">
      ${imgHtml}
      <span style="font-size:8pt">${name} (서명)</span>
    </span>`
  }).join('')

  // 교감 서명 HTML
  const principalSig = submission?.principalSignature
  const principalHtml = principalSig?.dataUrl
    ? `<img src="${principalSig.dataUrl}" style="max-height:48px;max-width:120px;display:block;margin:0 auto 2px"><div style="font-size:8pt;text-align:center">교감 (서명)</div>`
    : '<div style="height:48px;border-bottom:1px solid #888;margin-bottom:2px"></div><div style="font-size:8pt;text-align:center">(서명)</div>'

  // 1단계 게이트 질문 행 HTML
  let gateRows = ''
  RESULT_GATE_QUESTIONS.forEach((q, idx) => {
    const ans = answers[q.id] || {}
    const isYes = ans.value === '예'
    const isNo = ans.value === '아니오'
    gateRows += `<tr>
      <td style="text-align:center;width:32px;font-size:8.5pt">${idx + 1}</td>
      <td style="padding:3px 6px;font-size:8.5pt">${q.text}</td>
      <td style="text-align:center;width:32px;font-size:12pt">${isYes ? '✔' : ''}</td>
      <td style="text-align:center;width:42px;font-size:12pt">${isNo ? '✔' : ''}</td>
    </tr>`
  })

  // 2단계 세부 항목 테이블 (게이트 트리거 시에만)
  let subSection = ''
  if (gateTriggered) {
    let subRows = ''
    for (const group of RESULT_CHECKLIST_GROUPS) {
      const qs = group.questions
      subRows += qs.map((q, idx) => {
        const ans = answers[q.id] || {}
        const isYes = ans.value === '예'
        const isNo = ans.value === '아니오'
        const groupCell = idx === 0
          ? `<td rowspan="${qs.length}" style="text-align:center;font-weight:bold;vertical-align:middle;width:70px;word-break:keep-all;font-size:8.5pt;background:#f5f5f5">${group.groupName}</td>`
          : ''
        return `<tr>
          ${groupCell}
          <td style="padding:3px 6px;font-size:8.5pt">${q.id.replace('r', '')}. ${q.text}</td>
          <td style="text-align:center;width:32px;font-size:12pt">${isYes ? '✔' : ''}</td>
          <td style="text-align:center;width:42px;font-size:12pt">${isNo ? '✔' : ''}</td>
        </tr>`
      }).join('')
    }

    subSection = `
      <p style="margin:8px 0 4px;font-size:8.5pt;font-weight:bold">2단계: 세부 점검 항목</p>
      <p style="margin:0 0 4px;font-size:7.5pt;color:#555">※ 성취수준 A의 분포에 이상이 확인되어 세부 점검이 필요합니다.</p>
      <table class="check-table">
        <colgroup>
          <col style="width:70px"><col><col style="width:32px"><col style="width:42px">
        </colgroup>
        <thead>
          <tr>
            <th class="check-th">점검 단계</th>
            <th class="check-th">점검 내용</th>
            <th class="check-th">예</th>
            <th class="check-th">아니오</th>
          </tr>
        </thead>
        <tbody>
          ${subRows}
        </tbody>
      </table>`
  }

  // 종합 분석 의견
  const opinionSection = `
    <p style="margin:10px 0 4px;font-size:8.5pt;font-weight:bold">종합 분석 의견</p>
    <div style="border:1px solid #000;min-height:60px;padding:6px 8px;font-size:8.5pt;white-space:pre-wrap">${opinion || '&nbsp;'}</div>`

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>붙임2 성취평가제 운영 결과 점검 체크리스트</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: '맑은 고딕', 'Malgun Gothic', sans-serif; font-size: 9pt; padding: 8mm 10mm; }
  .doc-label { text-align: center; font-size: 9pt; margin-bottom: 4px; }
  h1 { text-align: center; font-size: 13pt; font-weight: bold; margin-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; }
  td, th { border: 1px solid #000; padding: 4px 6px; vertical-align: middle; }
  .label-cell { background: #e8e8e8; font-weight: bold; text-align: center; white-space: nowrap; width: 90px; }
  .check-th { background: #e8e8e8; font-weight: bold; text-align: center; }
  .check-table { margin-top: 6px; }
  @media print {
    @page { size: A4 portrait; margin: 8mm 10mm; }
    body { padding: 0; }
  }
</style>
</head>
<body>
<p class="doc-label">&lt;붙임2&gt;</p>
<h1>단위학교(과목별) 성취평가 운영 결과 점검 체크리스트</h1>

<table style="margin-bottom:5px">
  <colgroup>
    <col style="width:90px"><col><col style="width:90px"><col>
  </colgroup>
  <tr>
    <td class="label-cell">학교명</td>
    <td>${schoolName}</td>
    <td class="label-cell">점검 과목</td>
    <td>${subjectName}${grade ? ` (${grade}학년 ${semester}학기)` : ''}</td>
  </tr>
  <tr>
    <td class="label-cell">공동 출제 교사</td>
    <td colspan="3" style="padding:6px 8px">${teacherSigHtml || '&nbsp;'}</td>
  </tr>
  <tr>
    <td class="label-cell">점검일자</td>
    <td>${checkDate}</td>
    <td class="label-cell">확인자 (교감)</td>
    <td style="text-align:center;padding:6px">${principalHtml}</td>
  </tr>
</table>

<p style="margin:8px 0 4px;font-size:8.5pt;font-weight:bold">1단계: 성취수준 A 분포 확인</p>
<table class="check-table">
  <colgroup>
    <col style="width:32px"><col><col style="width:32px"><col style="width:42px">
  </colgroup>
  <thead>
    <tr>
      <th class="check-th">No</th>
      <th class="check-th">점검 내용</th>
      <th class="check-th">예</th>
      <th class="check-th">아니오</th>
    </tr>
  </thead>
  <tbody>
    ${gateRows}
  </tbody>
</table>

${subSection}
${opinionSection}

<script>setTimeout(function(){ window.print(); }, 400);</script>
</body>
</html>`

  const w = window.open('', '_blank', 'width=900,height=700')
  if (w) {
    w.document.write(html)
    w.document.close()
  }
}
