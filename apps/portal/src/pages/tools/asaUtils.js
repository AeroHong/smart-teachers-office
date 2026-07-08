// 성취평가제 체크리스트 지원 도구 (ASA-support) — xlsx 파싱 + 집계 유틸

// ── 고정분할점수 카테고리 (추정분할점수 미제공 과목, 관리자가 과목별로 수동 지정) ──
// boundaries는 나이스 추정분할점수 파일과 동일한 표기(A/B, B/C, ...)를 사용해
// 두 데이터 소스(추정/고정)를 같은 모양으로 다룰 수 있게 한다.
export const FIXED_CATEGORIES = [
  {
    key: 'common',
    label: '보통교과 공통과목 (공통국어·공통수학·공통영어·통합사회·통합과학·한국사)',
    boundaries: [
      { label: 'A/B', value: 90 },
      { label: 'B/C', value: 80 },
      { label: 'C/D', value: 70 },
      { label: 'D/E', value: 60 },
      { label: 'E/미도달', value: 40 },
    ],
  },
  {
    key: 'scienceExperiment',
    label: '과학탐구실험',
    boundaries: [
      { label: 'A/B', value: 80 },
      { label: 'B/C', value: 60 },
      { label: 'C/미도달', value: 40 },
    ],
  },
  {
    key: 'elective',
    label: '보통교과 선택과목 (2학년 과목 전체)',
    boundaries: [
      { label: 'A/B', value: 90 },
      { label: 'B/C', value: 80 },
      { label: 'C/D', value: 70 },
      { label: 'D/E', value: 60 },
    ],
  },
  {
    key: 'peArt',
    label: '보통교과 체육·예술 교과(군)',
    boundaries: [
      { label: 'A/B', value: 80 },
      { label: 'B/C', value: 60 },
    ],
  },
]

export function getFixedCategory(key) {
  return FIXED_CATEGORIES.find((c) => c.key === key) || null
}

// ── ExcelJS 공통 로딩 ──────────────────────────────────────────────────
async function loadRows(file) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await file.arrayBuffer())
  const ws = wb.worksheets[0]
  if (!ws) throw new Error('시트를 찾을 수 없습니다.')
  const rows = []
  ws.eachRow({ includeEmpty: true }, (row) => {
    rows.push(row.values.slice(1).map((v) => (v == null ? '' : String(v).trim())))
  })
  return rows
}

function findRowIdx(rows, matchFn, fromIdx = 0) {
  for (let i = fromIdx; i < rows.length; i++) {
    if (matchFn(rows[i])) return i
  }
  return -1
}

// "2026학년도" 같은 연도 표기의 "6학년"과 혼동하지 않도록 "학년" 뒤에 "도"가
// 오지 않는 경우만 매칭 (실제 학년 표기는 항상 공백/문자열 끝으로 이어짐)
const GRADE_PATTERN = /(\d)학년(?!도)/

// ── 추정분할점수 파일 파싱 (관리자 업로드) ──────────────────────────────
const BOUNDARY_LABELS = ['A/B', 'B/C', 'C/D', 'D/E', 'E/미도달']

export async function parseCutoffFile(file) {
  const rows = await loadRows(file)

  const gradeRowIdx = findRowIdx(rows, (r) => r.some((c) => GRADE_PATTERN.test(c)))
  const gradeCell = gradeRowIdx >= 0 ? rows[gradeRowIdx].find((c) => GRADE_PATTERN.test(c)) : ''
  const grade = Number((gradeCell?.match(GRADE_PATTERN) || [])[1]) || null

  const boundaryRowIdx = findRowIdx(rows, (r) => r.includes('A/B'))
  if (boundaryRowIdx < 0) throw new Error('분할점수 헤더(A/B 등)를 찾을 수 없습니다. 파일 형식을 확인해주세요.')
  const boundaryCols = {}
  BOUNDARY_LABELS.forEach((label) => {
    const col = rows[boundaryRowIdx].indexOf(label)
    if (col >= 0) boundaryCols[label] = col
  })

  const headerRowIdx = findRowIdx(rows, (r) => r.includes('과목'))
  const subjectCol = headerRowIdx >= 0 ? rows[headerRowIdx].indexOf('과목') : -1
  const stageCol = headerRowIdx >= 0 ? rows[headerRowIdx].indexOf('고사/영역') : -1
  if (subjectCol < 0 || stageCol < 0) {
    throw new Error('과목/고사영역 헤더를 찾을 수 없습니다. 파일 형식을 확인해주세요.')
  }

  const results = []
  let currentSubject = ''
  for (let i = boundaryRowIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    if (row[subjectCol]) currentSubject = row[subjectCol]
    if (row[stageCol] === '학기말최종추정분할점수') {
      const boundaries = BOUNDARY_LABELS
        .filter((label) => boundaryCols[label] != null && row[boundaryCols[label]])
        .map((label) => ({ label, value: Number(row[boundaryCols[label]]) }))
        .filter((b) => Number.isFinite(b.value))
      if (currentSubject && boundaries.length) {
        results.push({ subjectName: currentSubject, grade, boundaries })
      }
    }
  }
  if (!results.length) throw new Error('학기말최종추정분할점수 데이터를 찾지 못했습니다. 파일 형식을 확인해주세요.')
  return results
}

// ── 성적 일람표(환산점수) 파일 파싱 (교과 담당 교사 업로드) ──────────────
// 파일 하나에 여러 학급(강의실) 블록이 빈 행 하나를 사이에 두고 연속으로
// 반복될 수 있어("2학년 1강의실" → "2학년 2강의실" → ...), 제목 행을 기준으로
// 블록 단위로 나눠 각각 파싱한다. 반환값은 학급별 결과 배열.
const CLASS_NUMBER_PATTERN = /^\d+\/\d+$/
// "자퇴"만 학기말 성적 반영 대상에서 완전히 빠지는 경우이므로 평가 대상 인원에서 제외한다.
// "미인정결" 등 결시 사유는 추후 점수가 채워져 학기말 성적에 반영되는 학생이므로 제외하지 않는다.
const EXCLUDE_MARKERS = new Set(['자퇴'])

export async function parseGradeSummaryFile(file) {
  const rows = await loadRows(file)

  const titleRowIdxs = []
  rows.forEach((r, i) => { if (r.some((c) => /성적\s*일람표/.test(c))) titleRowIdxs.push(i) })
  if (!titleRowIdxs.length) throw new Error('성적 일람표 제목을 찾을 수 없습니다. 파일 형식을 확인해주세요.')

  const blocks = []
  for (let b = 0; b < titleRowIdxs.length; b++) {
    const start = titleRowIdxs[b]
    const end = b + 1 < titleRowIdxs.length ? titleRowIdxs[b + 1] : rows.length

    const titleCell = rows[start].find((c) => /성적\s*일람표/.test(c)) || ''
    const subjectMatch = titleCell.match(/^(.+?\(\d+\))\s*과목/)
    if (!subjectMatch) {
      throw new Error('과목명을 인식하지 못했습니다. ("OOO(단위수)과목 ... 성적 일람표" 형식이 아닙니다.)')
    }
    const subjectName = subjectMatch[1]

    let teacherName = ''
    let classLabel = ''
    let grade = null
    for (let i = start; i < end; i++) {
      if (rows[i].some((c) => /교과담당교사/.test(c))) {
        const teacherCell = rows[i].find((c) => /교과담당교사/.test(c)) || ''
        teacherName = (teacherCell.match(/교과담당교사\s*\(([^)]*)\)/) || [])[1] || ''
        const classCell = rows[i].find((c) => GRADE_PATTERN.test(c)) || ''
        classLabel = classCell
        grade = Number((classCell.match(GRADE_PATTERN) || [])[1]) || null
        break
      }
    }

    const students = []
    for (let i = start; i < end; i++) {
      const row = rows[i]
      const clsIdx = row.findIndex((c) => CLASS_NUMBER_PATTERN.test(c))
      if (clsIdx < 0) continue
      const classNumber = row[clsIdx]
      const nameIdx = row.findIndex((c, idx) => idx > clsIdx && /^[가-힣]{2,5}$/.test(c))
      const name = nameIdx >= 0 ? row[nameIdx] : ''
      const scoreArea = nameIdx >= 0 ? row.slice(nameIdx + 1) : row.slice(clsIdx + 1)
      // "자퇴"/"미인정결" 등 결시 사유가 하나라도 있으면 학기말 성적 반영에서 빠지는
      // 학생이므로 평가 대상 인원에서 제외 (일부 항목만 정상 점수가 있어도 마찬가지)
      const withdrawn = scoreArea.some((c) => EXCLUDE_MARKERS.has(c))
      let totalRaw = ''
      for (let j = scoreArea.length - 1; j >= 0; j--) {
        if (scoreArea[j]) { totalRaw = scoreArea[j]; break }
      }
      const total = Number(totalRaw)
      students.push({ classNumber, name, total, withdrawn: withdrawn || !Number.isFinite(total) })
    }
    if (!students.length) continue

    blocks.push({ subjectName, grade, classLabel, teacherName, students })
  }

  if (!blocks.length) throw new Error('인식된 학급 데이터가 없습니다.')
  return blocks
}

// ── 집계 계산 (원본 학생별 환산점수는 반환값에 포함하지 않음 — 저장 금지 원칙) ──
export function computeAggregate(students, boundaries) {
  const valid = students.filter((s) => !s.withdrawn && Number.isFinite(s.total))
  const withdrawnCount = students.length - valid.length
  const totalCount = valid.length

  const ab = boundaries.find((b) => b.label === 'A/B')?.value ?? null
  const gradeACount = ab != null ? valid.filter((s) => s.total >= ab).length : null
  const gradeARatio = ab != null && totalCount > 0 ? gradeACount / totalCount : null
  const subjectAverage = totalCount > 0
    ? valid.reduce((sum, s) => sum + s.total, 0) / totalCount
    : null
  const averageVsAB = ab != null && subjectAverage != null
    ? (subjectAverage > ab ? 'above' : subjectAverage < ab ? 'below' : 'equal')
    : null

  // 최하위 경계(예: D/E 또는 C/미도달) 미만 학생 — 1학년 과목에 한해 화면에 노출
  const lowestBoundary = boundaries[boundaries.length - 1] ?? null
  const belowLowest = lowestBoundary
    ? valid
      .filter((s) => s.total < lowestBoundary.value)
      .map((s) => ({ classNumber: s.classNumber, name: s.name }))
    : []

  return {
    totalCount,
    withdrawnCount,
    gradeACount,
    gradeARatio,
    subjectAverage,
    abCutoff: ab,
    averageVsAB,
    lowestBoundary,
    belowLowest,
  }
}
