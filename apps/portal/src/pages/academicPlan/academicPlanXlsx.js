// 학사일정 엑셀 내보내기 — 예전 학사일정 엑셀과 같은 모양.
//   1학기·2학기 시트: 월 · 주 · 월~일 주 단위 격자(칸 안에 날짜 + 일정, 월 경계 주는 달마다 한 줄)
//   수업일수 시트: 학년 × 요일 표(수업·실수업·정기고사·전일행사·중간-기말, 자율·동아리)
//   일정 목록 시트: 일정 한 줄씩(구글 캘린더 업로드 시트처럼) — 보관함 카드는 날짜 빈칸
import {
  GRADES, SCHOOL_WEEKDAYS, WEEK_LABELS, buildWeekRows, classifyDay, computeStats, eventDisplayTitle, isNoProgress,
  indexEventsByDate, isTrayEvent, makeContext, rowsForSemester,
} from '@shared/lib/academicPlan'

const thin = { style: 'thin', color: { argb: 'FF94A3B8' } }
const box = { top: thin, left: thin, bottom: thin, right: thin }
const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })
const HEAD = fill('FFE2E8F0')
const md = (k) => `${Number(k.slice(5, 7))}.${Number(k.slice(8, 10))}.`

/** 그날 칸 글자 — 기간 일정은 첫날(과 주의 첫 칸)에만 「이름(~m.d.)」 */
function dayText(k, evs, holiday, rowFirst) {
  const lines = [holiday ? `${Number(k.slice(8))} ${holiday}` : String(Number(k.slice(8)))]
  for (const ev of evs) {
    const span = ev.endDate && ev.endDate > ev.date
    if (span && k !== ev.date && !rowFirst) continue
    lines.push(span ? `${eventDisplayTitle(ev)}(~${md(ev.endDate)})` : eventDisplayTitle(ev))
  }
  return lines.join('\n')
}

function addGridSheet(wb, plan, sem, title) {
  const ws = wb.addWorksheet(`${sem}학기`, { pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 1 } })
  ws.columns = [{ width: 6 }, { width: 5 }, ...WEEK_LABELS.map((_, i) => ({ width: i < 5 ? 22 : 13 }))]
  ws.mergeCells(1, 1, 1, 9)
  const t = ws.getCell(1, 1)
  t.value = title
  t.font = { bold: true, size: 14 }
  t.alignment = { horizontal: 'center' }
  const head = ws.addRow(['월', '주', ...WEEK_LABELS])
  head.eachCell((c, i) => {
    c.fill = HEAD
    c.border = box
    c.font = { bold: true, color: { argb: i === 9 ? 'FFDC2626' : i === 8 ? 'FF2563EB' : 'FF1E293B' } }
    c.alignment = { horizontal: 'center' }
  })

  const ctx = makeContext(plan)
  const byDate = indexEventsByDate(plan.events || [])
  const rows = rowsForSemester(buildWeekRows(plan), sem)
  let monthStart = null
  rows.forEach((r, i) => {
    const keys = r.days.filter(Boolean)
    const row = ws.addRow([`${r.month}월`, r.weekNo ?? '', ...r.days.map((k) => {
      if (!k) return ''
      const holiday = classifyDay(ctx, 1, k).holiday
      return dayText(k, byDate.get(k) || [], holiday, k === keys[0])
    })])
    let maxLines = 1
    row.eachCell({ includeEmpty: true }, (c, col) => {
      c.border = box
      c.alignment = { vertical: col <= 2 ? 'middle' : 'top', horizontal: col <= 2 ? 'center' : 'left', wrapText: true }
      const k = col >= 3 ? r.days[col - 3] : null
      if (col <= 2) { c.fill = HEAD; c.font = { bold: true }; return }
      if (!k) { c.fill = fill('FFF1F5F9'); return }
      const ds = GRADES.map((g) => classifyDay(ctx, g, k))
      if (ds[0].holiday || ds.every((d) => d.closure)) c.fill = fill('FFFFF1F2')
      else if (ds.every((d) => d.vacation)) c.fill = fill('FFECEFF3')
      if (ds[0].holiday || col === 9) c.font = { color: { argb: 'FFDC2626' } }
      maxLines = Math.max(maxLines, String(c.value).split('\n').length)
    })
    row.height = Math.max(18, 14 * maxLines)
    // 월 칸은 달마다 세로로 합친다
    const prev = rows[i - 1]
    if (!prev || prev.month !== r.month) monthStart = row.number
    const next = rows[i + 1]
    if ((!next || next.month !== r.month) && row.number > monthStart) ws.mergeCells(monthStart, 1, row.number, 1)
  })
  return ws
}

function addStatsSheet(wb, plan) {
  const ws = wb.addWorksheet('수업일수')
  const stats = computeStats(plan)
  ws.columns = [{ width: 16 }, ...GRADES.flatMap(() => Array(6).fill({ width: 6 }))]
  const ITEMS = [
    ['schoolDays', '수업일수'], ['actual', '실수업일수'], ['exams', '정기고사일수'], ['fullDays', '전일행사일수'], ['noProgress', '진도 없는 날'], ['beforeMid', '개학-중간 사이'], ['between', '중간-기말 사이'],
  ]
  for (const sem of [1, 2, 'year']) {
    const title = ws.addRow([sem === 'year' ? '연간 합계' : `${sem}학기`])
    title.getCell(1).font = { bold: true, size: 12 }
    const h1 = ws.addRow(['구분', ...GRADES.flatMap((g) => {
      const a = stats.grades[g][sem].activities
      return [`${g}학년 (자율 ${a.자율}h · 동아리 ${a.동아리}h)`, '', '', '', '', '']
    })])
    GRADES.forEach((_, gi) => ws.mergeCells(h1.number, 2 + gi * 6, h1.number, 7 + gi * 6))
    const h2 = ws.addRow(['', ...GRADES.flatMap(() => [...SCHOOL_WEEKDAYS, '계'])])
    ws.mergeCells(h1.number, 1, h2.number, 1)
    for (const r of [h1, h2]) r.eachCell({ includeEmpty: true }, (c) => { c.fill = HEAD; c.border = box; c.font = { bold: true }; c.alignment = { horizontal: 'center', vertical: 'middle' } })
    for (const [key, label] of ITEMS) {
      const row = ws.addRow([label, ...GRADES.flatMap((g) => {
        const s = stats.grades[g][sem]
        return [...s[key], s.total[key]]
      })])
      row.eachCell({ includeEmpty: true }, (c, col) => {
        c.border = box
        c.alignment = { horizontal: col === 1 ? 'left' : 'center' }
        if (col === 1 || (col - 1) % 6 === 0) c.font = { bold: true }
        if (key === 'actual' && sem !== 'year' && col > 1 && (col - 1) % 6 !== 0 && Number(c.value) < 16) {
          c.fill = fill('FFFEE2E2')
          c.font = { bold: true, color: { argb: 'FFB91C1C' } }
        }
      })
    }
    ws.addRow([])
  }
  ws.addRow(['실수업일수 = 수업일수 − (정기고사일수 + 전일행사일수). 진도 없는 날 = 학력평가·모의고사 등(출결상 수업일로는 인정).'])
  ws.addRow(['개학-중간 사이 = 개학 ~ 첫 중간고사 전날, 중간-기말 사이 = 마지막 중간고사 다음 날 ~ 첫 기말고사 전날의 실수업일에서 진도 없는 날을 뺀 날.'])
}

function addListSheet(wb, plan) {
  const ws = wb.addWorksheet('일정 목록')
  ws.columns = [
    { header: '시작일', key: 'date', width: 12 }, { header: '종료일', key: 'endDate', width: 12 },
    { header: '요일', key: 'dow', width: 6 }, { header: '일정', key: 'title', width: 36 },
    { header: '표시 제목', key: 'display', width: 44 }, { header: '유형', key: 'kind', width: 10 },
    { header: '대상 학년', key: 'grades', width: 10 }, { header: '관련 부서', key: 'dept', width: 16 },
    { header: '전일행사', key: 'fullDay', width: 9 }, { header: '진도 없음', key: 'noProgress', width: 9 }, { header: '자율(h)', key: 'auto', width: 8 },
    { header: '동아리(h)', key: 'club', width: 9 }, { header: '메모', key: 'note', width: 30 },
  ]
  const sorted = [...(plan.events || [])].sort((a, b) => {
    const ta = isTrayEvent(a) ? '9' : a.date
    const tb = isTrayEvent(b) ? '9' : b.date
    return ta < tb ? -1 : ta > tb ? 1 : 0
  })
  const hours = (ev, type) => (ev.activities || []).filter((a) => a.type === type).reduce((n, a) => n + (Number(a.hours) || 0), 0) || ''
  for (const ev of sorted) {
    const tray = isTrayEvent(ev)
    ws.addRow({
      date: tray ? '(보관함)' : ev.date,
      endDate: tray ? (ev.spanDays > 1 ? `${ev.spanDays}일간` : '') : ev.endDate || '',
      dow: tray ? '' : WEEK_LABELS[(new Date(`${ev.date}T00:00:00Z`).getUTCDay() + 6) % 7],
      title: ev.title || '',
      display: eventDisplayTitle(ev),
      kind: ev.kind === '정기고사' ? `${ev.examType || ''}고사` : ev.kind,
      grades: ev.grades?.length && ev.grades.length < 3 ? ev.grades.join(',') : '전체',
      dept: ev.dept || '',
      fullDay: ev.fullDay ? 'O' : '',
      noProgress: ev.kind === '일반' && !ev.fullDay && isNoProgress(ev) ? 'O' : '',
      auto: hours(ev, '자율'),
      club: hours(ev, '동아리'),
      note: ev.note || '',
    })
  }
  ws.getRow(1).eachCell((c) => { c.fill = HEAD; c.font = { bold: true }; c.border = box })
  ws.views = [{ state: 'frozen', ySplit: 1 }]
}

/** 학사일정 엑셀 내려받기 */
export async function downloadPlanXlsx(plan, schoolName) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  for (const sem of [1, 2]) addGridSheet(wb, plan, sem, `${plan.year}학년도 ${sem}학기 학사일정${schoolName ? ` — ${schoolName}` : ''}`)
  addStatsSheet(wb, plan)
  addListSheet(wb, plan)

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${plan.year}학년도 학사일정 (${plan.name || '초안'}).xlsx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
