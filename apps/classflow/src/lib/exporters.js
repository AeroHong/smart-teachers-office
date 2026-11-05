/**
 * 내보내기 3종(나이스 일괄등록·분반별 명단·그룹표 요약) + 작업 백업 JSON.
 * exceljs는 무거워서 내보낼 때만 불러온다.
 */
import {
  neisExportRows, rosterGroups, timetableSummary, sectionSizes, balanceSummary, meetingReport,
} from '@shared/lib/sectioning'
import { blockColor } from '../components/colors'
import { pickPersist } from './projectStore'

function download(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function saveWorkbook(wb, filename) {
  const buf = await wb.xlsx.writeBuffer()
  download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename)
}

const baseName = (p) => (p.title || '분반배정').replace(/[\\/:*?"<>|]/g, '_')
const thin = { style: 'thin', color: { argb: 'FFBFC7D1' } }
const border = { top: thin, left: thin, bottom: thin, right: thin }
const headFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2F7' } }
const asId = (sid) => (/^\d+$/.test(sid) ? Number(sid) : sid)
// 명단 칸: 이름을 알면 `학번 이름`, 모르면 학번(숫자)
const who = (project, sid) => (project.names?.[sid] ? `${sid} ${project.names[sid]}` : asId(sid))
const hasNames = (project) => Object.keys(project.names || {}).length > 0

/** 1. 나이스 일괄등록 — 원본 헤더(병합 포함) 그대로, 과목 칸에 분반 기호 */
export async function exportNeis(project) {
  const { default: ExcelJS } = await import('exceljs')
  const { rows, merges } = neisExportRows(project)
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('수강신청')
  rows.forEach((r) => ws.addRow(r))
  for (const m of merges) ws.mergeCells(m.s.r + 1, m.s.c + 1, m.e.r + 1, m.e.c + 1)
  ws.getColumn(1).width = 10
  await saveWorkbook(wb, `${baseName(project)}_나이스일괄등록.xlsx`)
}

/** 전체 분반별 명단 시트(분반이 열) — 분반별 명단·회의 자료가 같이 쓴다 */
function addRosterSheet(wb, project) {
  const groups = rosterGroups(project)
  const ws = wb.addWorksheet('분반별 명단')
  const head = ['과목', '분반', '그룹', '인원']
  head.forEach((h, i) => {
    const row = ws.getRow(i + 1)
    row.getCell(1).value = h
    row.getCell(1).font = { bold: true }
    groups.forEach((g, c) => {
      const v = [g.subject, g.label, g.slot === null ? '' : project.slots[g.slot], g.students.length][i]
      const cell = row.getCell(c + 2)
      cell.value = v
      cell.font = { bold: true }
      cell.alignment = { horizontal: 'center', wrapText: true }
      cell.fill = headFill
      cell.border = border
    })
  })
  const maxLen = Math.max(0, ...groups.map((g) => g.students.length))
  for (let r = 0; r < maxLen; r++) {
    const row = ws.getRow(head.length + 1 + r)
    row.getCell(1).value = r + 1
    groups.forEach((g, c) => {
      const sid = g.students[r]
      if (sid) { row.getCell(c + 2).value = who(project, sid); row.getCell(c + 2).border = border }
    })
  }
  ws.getColumn(1).width = 6
  groups.forEach((_, c) => { ws.getColumn(c + 2).width = hasNames(project) ? 14 : 11 })
  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: head.length }]
  return groups
}

/** 2. 분반별 명단 — 첫 시트는 전체(분반이 열), 이어서 과목별 시트 */
export async function exportRoster(project) {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  const groups = addRosterSheet(wb, project)

  // 과목별 시트(분반이 열)
  for (const subj of project.subjects) {
    const gs = groups.filter((g) => g.subject === subj.name)
    if (!gs.length) continue
    const sh = wb.addWorksheet(subj.name.replace(/[\\/?*[\]:]/g, '').slice(0, 31))
    sh.addRow(gs.map((g) => `${g.label} (${g.students.length}명)`)).font = { bold: true }
    const n = Math.max(...gs.map((g) => g.students.length))
    for (let r = 0; r < n; r++) sh.addRow(gs.map((g) => (g.students[r] ? who(project, g.students[r]) : null)))
    gs.forEach((_, c) => { sh.getColumn(c + 1).width = hasNames(project) ? 16 : 14 })
  }
  await saveWorkbook(wb, `${baseName(project)}_분반별명단.xlsx`)
}

/** 3. 그룹표 요약 — 그룹 × 분반, A4 가로 인쇄 설정 + 과목별 균형 시트 */
export async function exportTimetable(project) {
  const { default: ExcelJS } = await import('exceljs')
  const tt = timetableSummary(project)
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('그룹표', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1 },
  })
  ws.addRow([`${project.title || ''} 그룹표`]).font = { bold: true, size: 14 }
  ws.addRow([])
  const maxN = Math.max(0, ...tt.map((t) => t.sections.length))
  const header = ws.addRow(['그룹', '분반 수', '인원 합', ...Array.from({ length: maxN }, (_, i) => `분반 ${i + 1}`)])
  header.font = { bold: true }
  header.eachCell((c) => { c.fill = headFill; c.border = border })
  for (const t of tt) {
    const sum = t.sections.reduce((a, x) => a + x.size, 0)
    const row = ws.addRow([t.letter, t.sections.length, sum, ...t.sections.map((x) => `${x.subject} ${x.label}\n${x.size}명`)])
    row.height = 34
    row.eachCell((c) => { c.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' }; c.border = border })
  }
  ws.getColumn(1).width = 7
  ws.getColumn(2).width = 8
  ws.getColumn(3).width = 8
  for (let i = 0; i < maxN; i++) ws.getColumn(4 + i).width = 18

  const bs = wb.addWorksheet('과목별 균형')
  bs.addRow(['칸막이', '과목', '신청', '분반 수', '분반 인원', '분반 편차']).font = { bold: true }
  const sizes = sectionSizes(project)
  for (const b of balanceSummary(project)) {
    const subj = project.subjects[b.s]
    bs.addRow([subj.block, subj.name, sizes[b.s].reduce((a, x) => a + x, 0), subj.sections, b.sizes.join(' / '), b.spread])
  }
  const widths = [8, 26, 8, 8, 30, 10]
  widths.forEach((w, i) => { bs.getColumn(i + 1).width = w })
  await saveWorkbook(wb, `${baseName(project)}_그룹표.xlsx`)
}

const argb = (hex) => `FF${hex.replace('#', '').toUpperCase()}`
const fillOf = (hex) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: argb(hex) } })
const MODE = { hard: '꼭 지킴', soft: '가능하면', off: '참고만' }

/**
 * 4. 회의 자료 — ① 배정표(화면과 같은 그룹 × 과목 격자, A4 가로 1쪽) ② 과목별 요약 ③ 그룹별 요약 ④ 분반별 명단.
 * 분리 규칙은 개수만 싣는다.
 */
export async function exportMeeting(project) {
  const { default: ExcelJS } = await import('exceljs')
  const r = meetingReport(project)
  const st = r.status
  const blocks = r.blocks.map((b) => b.block)
  const wb = new ExcelJS.Workbook()

  // ① 배정표
  const ws = wb.addWorksheet('배정표', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } },
  })
  const W = 1 + r.cols.length
  ws.addRow([`${r.title}`]).font = { bold: true, size: 14 }
  ws.addRow([`${r.term} · ${r.date} 기준`]).font = { color: { argb: 'FF5B6B7C' } }
  ws.addRow([[
    `학생 ${st.students}명`, `분반 ${st.sections}개 · 그룹 ${st.groups}`,
    `분반 최대 ${st.maxSize ?? '-'}명(${MODE[st.maxMode] || '-'})${st.minSize ? ` · 최소 ${st.minSize}명` : ''}`,
    r.showFree && `공강 ${st.totalFree}개${st.freeMax !== null ? ` · 그룹당 최대 ${st.freeMax}명` : ''}`,
    `미배정 ${st.unassigned}명`, st.conflicts && `충돌 ${st.conflicts}명`, `분반 편차 최대 ${st.worstSpread}명`,
    st.separationRules && `분리 규칙 ${st.separationRules}개${st.separationViolations ? `(위반 ${st.separationViolations})` : ''}`,
  ].filter(Boolean).join(' · ')])
  ws.addRow([])
  const top = ws.rowCount + 1
  // 칸막이 줄(병합)
  const r1 = ws.getRow(top)
  r1.getCell(1).value = '그룹'
  let c0 = 2
  for (const b of r.blocks) {
    const col = blockColor(b.block, blocks)
    r1.getCell(c0).value = `칸막이 ${b.block}`
    r1.getCell(c0).fill = fillOf(col.bg)
    r1.getCell(c0).font = { bold: true, color: { argb: argb(col.fg) } }
    if (b.span > 1) ws.mergeCells(top, c0, top, c0 + b.span - 1)
    c0 += b.span
  }
  ws.mergeCells(top, 1, top + 2, 1)
  const r2 = ws.getRow(top + 1)
  const r3 = ws.getRow(top + 2)
  r.cols.forEach((c, i) => {
    const col = blockColor(c.block, blocks)
    r2.getCell(i + 2).value = c.name
    r2.getCell(i + 2).font = { bold: true, color: { argb: argb(col.fg) } }
    r3.getCell(i + 2).value = `신청 ${c.demand} · ${c.sections}반\n평균 ${c.avg ?? '-'}${c.sections > 1 ? ` · 편차 ${c.spread}` : ''}`
    r3.getCell(i + 2).font = { size: 9 }
  })
  r2.height = 30
  r3.height = 26
  const body = [...r.groups.map((g) => ({
    head: [g.letter, `분반 ${g.sections}개`, g.sections ? `${g.min}~${g.max}명` : '', g.free !== null ? `공강 ${g.free}명` : ''].filter(Boolean).join('\n'),
    cells: g.cells,
  })), ...(r.unplaced ? [{ head: '그룹 미정', cells: r.unplaced }] : [])]
  for (const b of body) {
    const row = ws.addRow([b.head, ...b.cells.map((items) => items.map((x) => `${x.label} ${x.size}명`).join('\n'))])
    row.height = Math.max(40, 14 * Math.max(3, ...b.cells.map((x) => x.length)))
    row.getCell(1).font = { bold: true }
    row.getCell(1).fill = fillOf('#f3f6f9')
    b.cells.forEach((items, i) => { if (items.length) row.getCell(i + 2).fill = fillOf(blockColor(r.cols[i].block, blocks).bg) })
  }
  for (let rr = top; rr <= ws.rowCount; rr++) {
    for (let cc = 1; cc <= W; cc++) {
      const cell = ws.getRow(rr).getCell(cc)
      cell.border = border
      cell.alignment = { wrapText: true, vertical: rr < top + 3 ? 'middle' : 'top', horizontal: 'center' }
      if (rr < top + 3 && !cell.fill) cell.fill = headFill
    }
  }
  ws.getColumn(1).width = 11
  for (let i = 0; i < r.cols.length; i++) ws.getColumn(i + 2).width = r.cols.length > 14 ? 10 : 12
  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: top + 2 }]

  // ② 과목별 요약
  const ss = wb.addWorksheet('과목별 요약')
  const sh = ss.addRow(['칸막이', '과목', '신청', '분반 수', '최대 인원', '평균', '분반별 인원', '편차'])
  sh.font = { bold: true }
  sh.eachCell((c) => { c.fill = headFill; c.border = border })
  for (const c of r.cols) {
    const row = ss.addRow([c.block, c.name, c.demand, c.sections, c.maxSize, c.avg, c.labels.map((l, k) => `${l} ${c.sizes[k]}`).join(' / '), c.sections > 1 ? c.spread : null])
    row.eachCell({ includeEmpty: true }, (cell) => { cell.border = border })
  }
  ;[8, 24, 8, 8, 9, 8, 40, 8].forEach((w, i) => { ss.getColumn(i + 1).width = w })

  // ③ 그룹별 요약
  const gs = wb.addWorksheet('그룹별 요약')
  const gh = gs.addRow(['그룹', '분반 수', '수업 인원 합', '분반 인원', ...(r.showFree ? ['공강'] : []), '분반'])
  gh.font = { bold: true }
  gh.eachCell((c) => { c.fill = headFill; c.border = border })
  for (const g of r.groups) {
    const list = g.cells.flatMap((items, i) => items.map((x) => `${r.cols[i].name} ${x.label} ${x.size}`)).join(', ')
    const row = gs.addRow([g.letter, g.sections, g.students, g.sections ? `${g.min}~${g.max}` : '', ...(r.showFree ? [g.free] : []), list])
    row.eachCell({ includeEmpty: true }, (cell) => { cell.border = border; cell.alignment = { wrapText: true, vertical: 'top' } })
  }
  ;[7, 8, 12, 10, ...(r.showFree ? [7] : []), 90].forEach((w, i) => { gs.getColumn(i + 1).width = w })

  // ④ 분반별 명단
  addRosterSheet(wb, project)
  await saveWorkbook(wb, `${baseName(project)}_회의자료.xlsx`)
}

/** 작업 백업(JSON) — 보관하거나 다른 계정으로 옮길 때 */
export function exportBackup(project) {
  const payload = { kind: 'classflow-project', version: 1, project: pickPersist(project) }
  const blob = new Blob([JSON.stringify(payload, null, 1)], { type: 'application/json' })
  download(blob, `${baseName(project)}_백업.json`)
}

export function parseBackup(text) {
  const j = JSON.parse(text)
  if (j?.kind !== 'classflow-project' || !j.project?.requests) throw new Error('분반 배정 백업 파일이 아닙니다.')
  return j.project
}
