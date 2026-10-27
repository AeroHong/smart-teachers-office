// 학사일정 — 학기별 A4 세로 한 장 인쇄·PDF.
// 종이·자동 맞춤(FIT_SCRIPT)·인쇄 창·PDF 변환은 검·인정도서 서식과 같은 것(textbookPrint.js)을 쓰고,
// 여기서는 학기 한 장의 HTML만 만든다. 내용이 길면 FIT_SCRIPT가 한 장에 맞춰 축소한다.
import {
  GRADES, SCHOOL_WEEKDAYS, WEEK_LABELS, buildWeekRows, classifyDay, computeStats, eventDisplayTitle,
  indexEventsByDate, makeContext, rowsForSemester, shortLabel,
} from '@shared/lib/academicPlan'
import { downloadFormsPdf, printForms } from '../textbook/textbookPrint'

function esc(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const STYLE = `<style>
  .ap h1 { font-size: 15pt; margin-bottom: 3mm; padding-bottom: 2mm; }
  .ap .cal { border: 1.2px solid #000; table-layout: fixed; }
  .ap .cal th, .ap .cal td { border: 0.6px solid #777; font-size: 7.4pt; line-height: 1.3; }
  .ap .cal thead th { background: #e4e4e4; padding: 2px; }
  .ap .cal td { vertical-align: top; padding: 1px 2px; height: 11mm; text-align: left; }
  .ap .cal td.c { text-align: center; vertical-align: middle; font-weight: 700; }
  .ap .cal td.off { background: #ededed; }
  .ap .cal td.hol { background: #f6dede; }
  .ap .d { font-weight: 800; }
  .ap .d.red { color: #c00; }
  .ap .hn { font-size: 6.6pt; color: #c00; }
  .ap .ev { display: block; }
  .ap .ev.full { font-weight: 800; }
  .ap .stat { margin-top: 3mm; border: 1.2px solid #000; }
  .ap .stat th, .ap .stat td { border: 0.6px solid #777; font-size: 7.6pt; padding: 1.5px 2px; text-align: center; }
  .ap .stat thead th, .ap .stat tbody th { background: #ececec; }
  .ap .stat td.low { font-weight: 800; text-decoration: underline; }
  .ap .notes { margin-top: 2mm; font-size: 7.4pt; line-height: 1.5; }
</style>`

const STAT_ROWS = [
  ['schoolDays', '수업일수'], ['actual', '실수업일수'], ['exams', '정기고사일수'], ['fullDays', '전일행사일수'], ['beforeMid', '개학-중간 사이'], ['between', '중간-기말 사이'],
]

function semesterSheet(plan, schoolName, sem, stats) {
  const ctx = makeContext(plan)
  const byDate = indexEventsByDate(plan.events || [])
  const rows = rowsForSemester(buildWeekRows(plan), sem)
  const months = {}
  rows.forEach((r, i) => {
    months[r.month] ??= { first: i, count: 0, total: 0 }
    months[r.month].count++
    months[r.month].total += r.schoolDays
  })

  const body = rows.map((r, i) => {
    const m = months[r.month]
    const cells = r.days.map((k, di) => {
      if (!k) return '<td class="off"></td>'
      const ds = GRADES.map((g) => classifyDay(ctx, g, k))
      const hol = ds[0].holiday
      const off = ds.every((d) => d.vacation)
      const evs = (byDate.get(k) || []).filter((e) => e.kind !== '공휴일' || e.title !== hol)
      const cls = hol || ds.every((d) => d.closure) ? 'hol' : off ? 'off' : ''
      return `<td class="${cls}"><span class="d${hol || di === 6 ? ' red' : ''}">${Number(k.slice(8))}</span>${hol ? ` <span class="hn">${esc(hol)}</span>` : ''}${
        evs.map((e) => `<span class="ev${e.fullDay ? ' full' : ''}">${esc(eventDisplayTitle(e))}</span>`).join('')}</td>`
    }).join('')
    return `<tr>${m.first === i ? `<td class="c" rowspan="${m.count}">${r.month}월</td>` : ''}<td class="c">${r.weekNo ?? ''}</td>${cells}<td class="c">${r.weekNo || r.schoolDays ? r.schoolDays : ''}</td>${m.first === i ? `<td class="c" rowspan="${m.count}">${m.total}</td>` : ''}</tr>`
  }).join('')

  const statHead = `<tr><th rowspan="2">구분</th>${GRADES.map((g) => `<th colspan="6">${g}학년</th>`).join('')}</tr>
    <tr>${GRADES.map(() => [...SCHOOL_WEEKDAYS, '계'].map((w) => `<th>${w}</th>`).join('')).join('')}</tr>`
  const statBody = STAT_ROWS.map(([key, label]) => `<tr><th>${label}</th>${GRADES.map((g) => {
    const s = stats.grades[g][sem]
    return s[key].map((v) => `<td class="${key === 'actual' && v < 16 && s.total.schoolDays ? 'low' : ''}">${v}</td>`).join('') + `<td><b>${s.total[key]}</b></td>`
  }).join('')}</tr>`).join('')
    + `<tr><th>자율/동아리</th>${GRADES.map((g) => {
      const a = stats.grades[g][sem].activities
      return `<td colspan="6">자율 ${a.자율}h · 동아리 ${a.동아리}h</td>`
    }).join('')}</tr>`

  const fullDayNames = [...new Set((plan.events || []).filter((e) => e.fullDay && GRADES.some((g) => {
    const r = stats.grades[g].ranges[sem]
    return r?.end && e.date >= r.start && e.date <= r.end
  })).map((e) => eventDisplayTitle({ ...e, activities: [] })))]
  const range = stats.grades[1].ranges[sem]

  return `<div class="sheet portrait ap">
  <h1>${esc(plan.year)}학년도 ${sem}학기 학사일정</h1>
  <div style="display:flex;justify-content:space-between;font-size:8pt;margin-bottom:2mm">
    <span>${esc(schoolName || '')}${range?.end ? ` · ${shortLabel(range.start)} ~ ${shortLabel(range.end)}` : ''}</span>
    <span>${esc(plan.name || '')}${plan.status === 'confirmed' ? ' (확정)' : ' (초안)'}</span>
  </div>
  <table class="cal">
    <colgroup><col style="width:8mm"><col style="width:6mm">${WEEK_LABELS.map((_, i) => `<col${i >= 5 ? ' style="width:16mm"' : ''}>`).join('')}<col style="width:9mm"><col style="width:9mm"></colgroup>
    <thead><tr><th>월</th><th>주</th>${WEEK_LABELS.map((w) => `<th>${w}</th>`).join('')}<th>주합계</th><th>월합계</th></tr></thead>
    <tbody>${body}</tbody>
  </table>
  <table class="stat"><thead>${statHead}</thead><tbody>${statBody}</tbody></table>
  <div class="notes">
    * 실수업일수: 수업일수 − (정기고사일수 + 전일행사일수) · 밑줄: 요일별 실수업일 16회 미만<br>
    * 개학-중간·중간-기말 사이: 실수업일 중 학력평가·모의고사 등 진도 없는 날을 뺀 날(출결상 수업일로는 인정)<br>
    ${fullDayNames.length ? `* 전일행사: ${esc(fullDayNames.join(', '))}` : ''}
  </div>
</div>`
}

export function buildPlanSheetsHtml(plan, schoolName, semesters = [1, 2]) {
  const stats = computeStats(plan)
  return STYLE + semesters.map((s) => semesterSheet(plan, schoolName, s, stats)).join('')
}

const titleOf = (plan, semesters) => `${plan.year}학년도 학사일정${semesters.length === 1 ? ` ${semesters[0]}학기` : ''}_${plan.name || ''}`

export function printPlan(plan, schoolName, semesters) {
  return printForms(titleOf(plan, semesters), buildPlanSheetsHtml(plan, schoolName, semesters))
}

export function downloadPlanPdf(plan, schoolName, semesters) {
  return downloadFormsPdf(titleOf(plan, semesters), buildPlanSheetsHtml(plan, schoolName, semesters))
}
