// 교수학습 평가 운영 계획서(hwpx) 파서.
//
// C:\Claude code\hwpx-parser\lib.js 를 이식한 뒤 실제 제출 파일로 검증하며 개선했다.
// adm-zip은 Buffer 생성자를 지원하므로 Storage에서 내려받은 Buffer를 파일시스템 경유 없이
// 바로 쓴다.
//
// ratioTable 판별에 "정기시험"+"수행평가" 두 키워드만 쓰면, 진도표(교수학습 운영 계획)의
// "평가방법" 헤더 설명문("...형성평가, 총괄평가, 정기시험, 수행평가...")에 걸려 반영비율표가
// 아닌 진도표를 집어와 examRatio 전체가 null이 되는 실제 버그가 있었다(선유고 물리학 샘플에서
// 재현·확인). 반영비율표에만 있는 "반영비율" 키워드를 함께 요구해 해결했다.
//
// parseRatio() 자체는 "구분|중간(3열)|기말(3열)|수행(3열)" 10열 고정 레이아웃 대신, "서·논술형/
// 그 외 유형/소계" 3열 반복 패턴의 등장 횟수로 그룹 수를 세고 "중간고사"/"기말고사" 텍스트
// 유무로 그룹을 식별한다 — 정기시험이 없거나(체육 등 수행평가 100%) 중간/기말 중 하나만 있는
// 과목도 대응하기 위함.
//
// performanceItems(수행평가 세부 계획표)는 더 이상 추출하지 않는다 — 업무상 필요 없다는
// 피드백에 따라 제거. performanceAreas(영역 요약)만 유지한다.
//
// additionalStudyOverview("[2] 추가학습 개요" 표: 학점수/추가학습 시수/예방지도 인정시수/
// 이수 인정 기준 시수)만 추출한다 — 원본 문서에 실제로 "추가학습 개요"라는 제목이 붙어 있는
// 표다(선유고 물리학 샘플에서 확인, 값 3/9/6/6). "[3] 추가학습 예방 지도 계획"의 차시별
// 보충계획표와 "[5] 추가학습 계획"의 방학중 운영표는 세부 운영계획이라 업무상 필요 없다는
// 피드백에 따라 계속 추출하지 않는다 — 최소 성취수준 보장지도 개요는 대응하는 표가 없어
// 교사가 EvalPlanForm에서 자유 텍스트로 직접 작성한다.

const AdmZip = require('adm-zip')
const { XMLParser } = require('fast-xml-parser')

// ── 진입점 ────────────────────────────────────────────────────────────────────

function extractFromHwpx(buffer, fileName = 'upload.hwpx') {
  const tables = loadTables(buffer)

  const metaTable    = tables.find(t => anyRowContains(t, '학교명'))
  // "정기시험"+"수행평가"만으로 판별하면 진도표(교수학습 운영 계획)의 "평가방법" 헤더
  // 설명문("...형성평가, 총괄평가, 정기시험, 수행평가...")에 걸려 엉뚱한 표를 집어온다
  // (실제 물리학 샘플에서 발생 확인됨 — 반영비율 전체가 null로 나오는 버그의 원인이었음).
  // 반영비율표에만 있는 "반영비율" 키워드를 함께 요구해 진도표를 배제한다.
  const ratioTable   = tables.find(t => anyRowContains(t, '정기시험') && anyRowContains(t, '수행평가')
                                     && anyRowContains(t, '반영비율'))
  const perfSummary  = tables.find(t => anyRowContains(t, '영역') && anyRowContains(t, '합계')
                                     && !anyRowContains(t, '시행시기'))
  const gradeTable   = tables.find(t => anyRowContains(t, '석차등급'))

  const overviewTable = tables.find(t => anyRowContains(t, '학점 이수 인정 기준 시수'))

  return {
    meta:                     parseMeta(metaTable, fileName),
    examRatio:                parseRatio(ratioTable),
    performanceAreas:         parsePerfAreas(perfSummary),
    gradeMethod:              parseGradeMethod(gradeTable),
    additionalStudyOverview:  parseAdditionalStudyOverview(overviewTable),
  }
}

module.exports = { extractFromHwpx }

// ── 표별 파서 ─────────────────────────────────────────────────────────────────

function parseMeta(table, fileName) {
  const base = { sourceFile: fileName, parsedAt: new Date().toISOString() }
  if (!table) return base
  const headerIdx = table.findIndex(r => rowContains(r, '학교명'))
  const dataRow   = table[headerIdx + 1] ?? []
  return {
    ...base,
    school:      str(dataRow[0]),
    grade:       str(dataRow[1]),
    semester:    str(dataRow[2]),
    subject:     str(dataRow[3]),
    weeklyHours: str(dataRow[4]),
    classes:     str(dataRow[5]),
    // "홍창기 (인)"처럼 도장·서명 표시가 붙어 있으면 별도 이름으로 잘못 분리되므로 먼저 제거.
    teachers:    str(dataRow[6])
      .replace(/[（(]\s*(인|서명)\s*[)）]/g, '')
      .split(/[,，\s]+/)
      .map(s => s.trim())
      .filter(Boolean),
  }
}

// 정기시험·수행평가 반영비율표.
//
// 표준 레이아웃(가장 흔한 형태, "대수" 샘플 기준):
//   행0: 구분 | 정기시험            | 수행평가
//   행1:      | 중간고사 | 기말고사
//   행2: (레이블) | 서·논술형 | 그 외 유형 | 소계  (그룹마다 반복)
//   행3: 학기말 반영비율 | ...9개 % 값
//   행4: 만점            | ...9개 점수 값
//
// 정기시험이 없거나(수행 100%) 중간/기말 중 하나만 있는 과목은 그룹이 1~2개뿐이라 열 개수가
// 다르다. 고정 인덱스 대신 "소계" 등장 횟수로 그룹 수를 세고, "중간고사"/"기말고사" 텍스트
// 유무로 그룹 정체를 판별한다.
function parseRatio(table) {
  if (!table) return null
  const ratioRow = table.find(r => str(r[0]).includes('반영비율'))
  const scoreRow = table.find(r => str(r[0]).includes('만점'))
  if (!ratioRow) return null

  const pct   = v => { const n = parseInt(str(v).replace('%', ''), 10); return Number.isFinite(n) ? n : null }
  const score = v => { const n = parseInt(str(v).replace('점', ''), 10); return Number.isFinite(n) ? n : null }

  // 최하위 헤더 행("서·논술형"/"소계" 반복)에서 그룹 수를 셈. 못 찾으면 데이터 열 개수로 추정.
  const subHeaderRow = table.find(r => r.filter(c => str(c).trim() === '소계').length >= 1)
  const dataLen = ratioRow.length - 1 // 첫 칸은 "학기말 반영비율" 같은 레이블
  const groupCount = subHeaderRow
    ? Math.max(1, subHeaderRow.filter(c => str(c).trim() === '소계').length)
    : Math.max(1, Math.round(dataLen / 3))

  const hasMidterm = anyRowContains(table, '중간고사')
  const hasFinal    = anyRowContains(table, '기말고사')

  let groupKeys
  if (groupCount >= 3) {
    groupKeys = ['midterm', 'final', 'performance']
  } else if (groupCount === 2) {
    // 정기시험 그룹이 하나뿐인 경우. 텍스트로 중간/기말 중 무엇인지 판별하되, 판별이 안 되면
    // "기말고사만 운영"이 더 흔한 패턴(예: 2외국어)이라 final을 기본값으로 둔다.
    groupKeys = (hasMidterm && !hasFinal) ? ['midterm', 'performance'] : ['final', 'performance']
  } else {
    groupKeys = ['performance']
  }

  const result = { midterm: null, final: null, performance: null }
  groupKeys.forEach((key, gi) => {
    const base = 1 + gi * 3
    if (key === 'performance') {
      result[key] = {
        essayType: { label: '서·논술형', ratio: pct(ratioRow[base]), maxScore: score(scoreRow?.[base]) },
        otherType: { label: '그 외 유형', ratio: pct(ratioRow[base + 1]), maxScore: score(scoreRow?.[base + 1]) },
        total:     { ratio: pct(ratioRow[base + 2]), maxScore: score(scoreRow?.[base + 2]) },
      }
    } else {
      result[key] = {
        essayType:     { label: '서·논술형', ratio: pct(ratioRow[base]), maxScore: score(scoreRow?.[base]) },
        objectiveType: { label: '그 외 유형(객관식 등)', ratio: pct(ratioRow[base + 1]), maxScore: score(scoreRow?.[base + 1]) },
        total:         { ratio: pct(ratioRow[base + 2]), maxScore: score(scoreRow?.[base + 2]) },
      }
    }
  })
  return result
}

// 수행평가 영역 요약표 (가로형: 영역명이 열 헤더)
// 예) | 영역 | 서술평가1 | 서술평가2 | 학습과정평가 | 합계 |
//     | 비율 |   10%    |   10%    |    10%      |  40% |
function parsePerfAreas(table) {
  if (!table) return []

  const nameRow  = table.find(r => str(r[0]).includes('영역'))
  const ratioRow = table.find(r => str(r[0]).includes('비율') || str(r[0]).includes('%'))
  const scoreRow = table.find(r => str(r[0]).includes('만점'))

  if (!nameRow) return []

  const areas = []
  for (let i = 1; i < nameRow.length - 1; i++) {
    const name = str(nameRow[i]).trim()
    if (!name) continue
    const ratio    = ratioRow ? (parseInt(str(ratioRow[i]).replace('%', ''), 10) || null) : null
    const maxScore = scoreRow ? (parseInt(str(scoreRow[i]).replace('점', ''), 10) || null) : null
    areas.push({ name, ratio, maxScore })
  }
  return areas
}

function parseGradeMethod(table) {
  if (!table) return null
  const markRow = table.find(r => r.some(c => str(c) === '○'))
  if (!markRow) return null
  const mark = i => str(markRow[i]) === '○'
  return {
    rankGrade:         { label: '석차등급(1~5등급)',   enabled: mark(0) },
    achievementLevel5: { label: '성취도 5단계(A~E)',   enabled: mark(1) },
    cutScoreEstimated: { label: '성취 분할 점수(추정)', enabled: mark(2) },
    cutScoreFixed:     { label: '성취 분할 점수(고정)', enabled: mark(3) },
    achievementLevel3: { label: '성취도 3단계(A~C)',   enabled: mark(4) },
    passFailOnly:      { label: '이수여부(P/F)',        enabled: mark(5) },
  }
}

// "[2] 추가학습 개요" 표: "과목명|학점수|추가학습 시수|추가학습 시수로 인정하는 예방지도 시수|
// 학점 이수 인정 기준 시수". 과목명은 meta.subject와 중복이라 빼고 숫자 4개만 가져온다.
function parseAdditionalStudyOverview(table) {
  if (!table) return null
  const row = table[1] ?? []
  return {
    credits:                   str(row[1]),
    extraStudyHours:           str(row[2]),
    preventionHoursRecognized: str(row[3]),
    creditRecognitionHours:    str(row[4]),
  }
}

// ── 유틸 ─────────────────────────────────────────────────────────────────────

function loadTables(buffer) {
  const zip = new AdmZip(buffer)
  const entry = zip.getEntries().find(e => e.entryName.match(/Contents\/section\d+\.xml/i))
  if (!entry) throw new Error('SECTION_XML_NOT_FOUND')

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    isArray: name => ['hp:p','hp:run','hp:t','hp:tbl','hp:tr','hp:tc'].includes(name),
    // fast-xml-parser는 기본적으로 <hp:t>3</hp:t>처럼 순수 숫자 텍스트를 문자열이 아니라
    // JS number로 자동 변환한다(parseTagValue 기본값 true). extractTables()의 텍스트 추출은
    // 문자열만 처리하므로, 숫자만 든 셀(예: "[2] 추가학습 개요" 표의 학점수/시수 값)이 조용히
    // 빈 문자열로 사라지는 버그가 있었다(선유고 물리학 샘플에서 재현·확인). 태그 값을 항상
    // 문자열로 유지해 근본적으로 막는다.
    parseTagValue: false,
  })
  const parsed = parser.parse(zip.readAsText(entry, 'utf8'))
  return extractTables(parsed)
}

function extractTables(obj) {
  const tables = []
  findNodes(obj, 'hp:tbl', tbl => {
    const rows = []
    toArray(tbl['hp:tr']).forEach(tr => {
      const cells = toArray(tr['hp:tc']).map(tc => {
        const parts = []
        findNodes(tc, 'hp:t', t => {
          const text = typeof t === 'string' ? t : (t['#text'] ?? '')
          if (text.trim()) parts.push(text.trim())
        })
        return parts.join(' ')
      })
      if (cells.length) rows.push(cells)
    })
    if (rows.length) tables.push(rows)
  })
  return tables
}

function rowContains(row, kw)    { return row?.some(c => str(c).includes(kw)) }
function anyRowContains(tbl, kw) { return tbl.some(r => rowContains(r, kw)) }
function str(v) { return typeof v === 'string' ? v : String(v ?? '') }

function findNodes(obj, tag, cb) {
  if (!obj || typeof obj !== 'object') return
  if (obj[tag] !== undefined) toArray(obj[tag]).forEach(cb)
  Object.values(obj).forEach(v => { if (typeof v === 'object') findNodes(v, tag, cb) })
}
function toArray(v) { return v == null ? [] : Array.isArray(v) ? v : [v] }
