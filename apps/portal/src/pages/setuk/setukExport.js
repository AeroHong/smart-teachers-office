// 세특 점검 결과 엑셀 다운로드 — "학생 개개인별 요약"(전체 시트, 학번순)과
// "교과별로 구분"(과목별 시트)을 함께 담은 워크북 하나를 만든다.
import { assignedTeacherNames } from '@shared/lib/setukCheck'
import { AUTHORITY_LABELS } from './setukUtils'

const COLUMNS = [
  { header: '번호', key: 'studentNumber', width: 8 },
  { header: '이름', key: 'studentName', width: 10 },
  { header: '과목', key: 'subjectName', width: 18 },
  { header: '구분', key: 'authorityLabel', width: 10 },
  { header: '유형', key: 'category', width: 16 },
  { header: '수정 요청 내용', key: 'context', width: 64 },
  { header: '제안', key: 'message', width: 30 },
  { header: '처리 여부', key: 'statusLabel', width: 10 },
  { header: '담당 교사', key: 'teacherName', width: 10 },
  { header: '메모', key: 'note', width: 26 },
]

function toRow(it, check) {
  return {
    studentNumber: it.studentNumber,
    studentName: it.studentName,
    subjectName: it.subjectName,
    authorityLabel: AUTHORITY_LABELS[it.authority] || it.authority,
    category: it.category,
    context: `${it.before || ''}[${it.matched}]${it.after || ''}`,
    message: it.message || '',
    statusLabel: it.resolved ? (it.resolution === 'no_issue' ? '이상없음' : '처리완료') : '미처리',
    teacherName: assignedTeacherNames(check.subjectAssignments?.[it.subjectName]).join(', '),
    note: it.note || '',
  }
}

function styleHeader(ws) {
  ws.getRow(1).font = { bold: true }
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }
}

function safeSheetName(name, used) {
  let base = String(name || '시트').replace(/[\\/?*[\]:]/g, '_').slice(0, 31)
  let candidate = base
  let n = 2
  while (used.has(candidate)) {
    candidate = `${base.slice(0, 28)}(${n})`
    n += 1
  }
  used.add(candidate)
  return candidate
}

export async function exportCheckResults(check, items) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  const usedNames = new Set()

  const allSheet = wb.addWorksheet(safeSheetName('전체(학번순)', usedNames))
  allSheet.columns = COLUMNS
  allSheet.addRows(
    [...items]
      .sort((a, b) => a.studentNumber - b.studentNumber || a.subjectName.localeCompare(b.subjectName, 'ko'))
      .map((it) => toRow(it, check)),
  )
  styleHeader(allSheet)

  const bySubject = {}
  items.forEach((it) => { (bySubject[it.subjectName] ||= []).push(it) })
  Object.entries(bySubject)
    .sort(([a], [b]) => a.localeCompare(b, 'ko'))
    .forEach(([subjectName, list]) => {
      const ws = wb.addWorksheet(safeSheetName(subjectName, usedNames))
      ws.columns = COLUMNS
      ws.addRows(list.sort((a, b) => a.studentNumber - b.studentNumber).map((it) => toRow(it, check)))
      styleHeader(ws)
    })

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${check.classLabel}_세특점검결과.xlsx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
