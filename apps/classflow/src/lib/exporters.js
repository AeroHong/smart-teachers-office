/**
 * 내보내기 3종(나이스 일괄등록·분반별 명단·그룹표 요약) + 작업 백업 JSON.
 * exceljs는 무거워서 내보낼 때만 불러온다.
 */
import {
  neisExportRows, rosterGroups, timetableSummary, sectionSizes, balanceSummary,
} from '@shared/lib/sectioning'
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

/** 2. 분반별 명단 — 첫 시트는 전체(분반이 열), 이어서 과목별 시트 */
export async function exportRoster(project) {
  const { default: ExcelJS } = await import('exceljs')
  const groups = rosterGroups(project)
  const wb = new ExcelJS.Workbook()
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
      if (sid) { row.getCell(c + 2).value = asId(sid); row.getCell(c + 2).border = border }
    })
  }
  ws.getColumn(1).width = 6
  groups.forEach((_, c) => { ws.getColumn(c + 2).width = 11 })
  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: head.length }]

  // 과목별 시트(분반이 열)
  for (const subj of project.subjects) {
    const gs = groups.filter((g) => g.subject === subj.name)
    if (!gs.length) continue
    const sh = wb.addWorksheet(subj.name.replace(/[\\/?*[\]:]/g, '').slice(0, 31))
    sh.addRow(gs.map((g) => `${g.label} (${g.students.length}명)`)).font = { bold: true }
    const n = Math.max(...gs.map((g) => g.students.length))
    for (let r = 0; r < n; r++) sh.addRow(gs.map((g) => (g.students[r] ? asId(g.students[r]) : null)))
    gs.forEach((_, c) => { sh.getColumn(c + 1).width = 14 })
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
