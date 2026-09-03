// 생기부 세특 점검 도구 — 나이스 내보내기 파싱 + 규칙 기반 점검 엔진
//
// apps/portal/src/pages/tools/asaUtils.js의 loadRows()/findRowIdx() 패턴을 그대로 쓴다.
// (나이스 인쇄용 내보내기가 페이지마다 헤더·푸터를 반복하고 셀을 생략하는 문제를 이미
// 그 파일에서 풀어놓았다.)

// ── ExcelJS 공통 로딩 (asaUtils.js와 동일) ──────────────────────────────
async function loadRows(file) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await file.arrayBuffer())
  const ws = wb.worksheets[0]
  if (!ws) throw new Error('시트를 찾을 수 없습니다.')
  const rows = []
  ws.eachRow({ includeEmpty: true }, (row) => {
    rows.push(row.values.slice(1).map((v) => {
      if (v == null) return ''
      if (typeof v === 'object' && v.richText) return v.richText.map((t) => t.text).join('')
      return String(v).trim()
    }))
  })
  return rows
}

function stripSpaces(s) {
  return String(s || '').replace(/\s/g, '')
}

// 행에서 실제로 다른 값 몇 개가 쓰였는지 — 인쇄 폭 때문에 한 칸짜리 값(학급명 등)을
// 여러 물리 컬럼에 똑같이 반복해 적어 두는 내보내기가 있어서(아래 findHeaderColumns
// 참고), "이 행 전체가 사실상 값 하나뿐인가"를 판단할 때 쓴다.
function uniqueNonEmpty(row) {
  return [...new Set(row.map((v) => String(v || '').trim()).filter(Boolean))]
}

// 세특 문장은 규정상 항상 "~함." "~임." 처럼 마침표로 끝난다. 페이지 경계에서 진짜로
// 잘린 문장이라면 그 잘린 위치가 우연히 마침표 뒤일 확률은 극히 낮다 — 즉 직전 조각이
// 이미 마침표로 끝나 있다면 "문장이 다 끝난 뒤 페이지만 넘어간 것"이라, 원래 있었을
// "마침표 + 공백" 중 공백이 각 칸을 trim()하는 과정에서 유실된 것뿐이다(단어 중간
// 절단과 구분해서 공백을 넣어 줘야 함 — setukRtfUtils.js와 동일한 판단 기준).
function looksUnfinished(text) {
  const t = String(text || '').trimEnd()
  return t.length > 0 && !/[.!?…」』]$/.test(t)
}

const CLASS_LABEL_PATTERN = /\d+학년\s*\d+반/

/**
 * 헤더 행과 각 필드의 컬럼 위치를 찾는다. 컬럼 위치를 0~5로 하드코딩하지 않는 이유:
 * 나이스 내보내기 방식(XLS/XLS data)이나 화면 설정에 따라 맨 앞에 빈 컬럼이 붙거나,
 * 성명·세부능력및특기사항처럼 인쇄 폭이 넓은 칸이 여러 물리 컬럼에 같은 값을 반복해서
 * 적어 두는 경우가 실제로 있다(실측, 2026-09-03). 헤더 행에서 각 열 이름이 처음
 * 등장하는 위치만 잡으면 되고, 뒤에 반복되는 물리 컬럼은 무시해도 값이 동일하므로
 * 문제없다.
 */
function findHeaderColumns(rows) {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const subjectIdx = row.findIndex((c) => stripSpaces(c) === '과목')
    const numIdx = row.findIndex((c) => stripSpaces(c) === '번호')
    if (subjectIdx < 0 || numIdx < 0) continue
    const gradeIdx = row.findIndex((c) => stripSpaces(c) === '학년')
    const semesterIdx = row.findIndex((c) => stripSpaces(c) === '학기')
    const nameIdx = row.findIndex((c) => stripSpaces(c) === '성명')
    const textIdx = row.findIndex((c) => stripSpaces(c).includes('특기사항'))
    if (gradeIdx < 0 || semesterIdx < 0 || nameIdx < 0 || textIdx < 0) continue
    return { headerRowIdx: i, subjectIdx, gradeIdx, semesterIdx, numIdx, nameIdx, textIdx }
  }
  return null
}

/**
 * 나이스 "학교생활기록부 세부능력 및 특기사항" 학급별 내보내기 파일을 파싱한다.
 *
 * 인쇄용 내보내기라 페이지마다 학급명·컬럼 헤더·쪽번호 행이 반복되고, 한 학생의 세특
 * 전체 글자수가 한 페이지 행 높이를 넘으면 단어 중간에서도 그대로 잘려 다음 페이지 첫
 * 데이터 행에 같은 번호·성명·과목으로 이어서 나온다. 이 조각들을 순서대로 이어붙여야
 * 원문이 복원된다(같은 과목 안에서 번호가 반복되면 "이어짐"으로 판정 — 과목이 바뀌면
 * 번호가 다시 1부터 시작하므로 안전).
 *
 * @param {File} file
 * @returns {Promise<{classLabel: string, records: Array<{studentNumber:number, studentName:string, subjectName:string, grade:number|null, semester:number|null, text:string}>}>}
 */
export async function parseNeisSetukFile(file) {
  const rows = await loadRows(file)

  const cols = findHeaderColumns(rows)
  if (!cols) {
    throw new Error('나이스 "세부능력 및 특기사항" 내보내기 형식이 아닙니다. (과목/번호 헤더를 찾을 수 없습니다)')
  }
  const { subjectIdx, gradeIdx, semesterIdx, numIdx, nameIdx, textIdx } = cols

  let classLabel = ''
  for (const r of rows) {
    const uniq = uniqueNonEmpty(r)
    if (uniq.length === 1 && CLASS_LABEL_PATTERN.test(uniq[0])) {
      classLabel = uniq[0]
      break
    }
  }

  const records = []
  let currentSubject = ''
  let currentGrade = null
  let currentSemester = null
  let open = null // 아직 다음 페이지에서 이어질 수 있는, 완결되지 않은 마지막 레코드
  // 페이지 경계(헤더/학급명/쪽번호 등 데이터 없는 행)를 막 지났는지 — 과목명이 단어
  // 중간에서 잘리는 현상은 정확히 이 경계에서만 일어난다(같은 페이지 안에서 과목이
  // 바뀌는 지점은 항상 완결된 이름으로 시작함). 페이지 안쪽에서 우연히 같은 학생
  // 번호로 다른 과목이 맞물리는 경우(문서 예시: "세계 문화와 영어"의 마지막 학생과
  // "한국사1"의 유일한 학생이 둘 다 29번인 경우)와 구분하려고 이 신호를 쓴다.
  let justCrossedPage = false
  const normalizeSubject = (s) => s.replace(/\s+/g, ' ').trim()

  const finalizeOpen = () => {
    if (open) records.push(open)
    open = null
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const subjectCell = row[subjectIdx], gradeCell = row[gradeIdx], semesterCell = row[semesterIdx]
    const numCell = row[numIdx], nameCell = row[nameIdx], textCell = row[textIdx]

    // 컬럼 헤더 행 / 학급명 행 → 스킵 (다음 데이터 블록으로)
    if (stripSpaces(subjectCell) === '과목' && stripSpaces(numCell) === '번호') { justCrossedPage = true; continue }
    const rowUniq = uniqueNonEmpty(row)
    if (rowUniq.length === 1 && CLASS_LABEL_PATTERN.test(rowUniq[0])) { justCrossedPage = true; continue }

    // 쪽번호 푸터 행 등 데이터가 없는 행: 번호/성명 칸이 둘 다 비어 있음
    if (!numCell && !nameCell) { justCrossedPage = true; continue }

    const num = Number(numCell)
    if (!numCell || !Number.isFinite(num) || !nameCell) continue // 그 외 인식 안 되는 행(푸터 등)은 건너뜀

    // 이어짐 판정 기본은 번호+성명 일치. 과목명이 다르면, 방금 페이지 경계를
    // 지나온 직후라면 무조건 잘린 조각으로 보고 이어붙이고(조사로 끝나지 않는
    // 경우도 있음 — 예: "지속가능한" + "세계"), 그게 아니면 기존처럼 조사/어미
    // ("와/과/의/을/를/은/는/이/가/에/로")로 끝날 때만 이어짐으로 본다.
    const sameStudent = !!open && open.studentNumber === num && open.studentName === nameCell
    const subjectMatches = !subjectCell || subjectCell === open?.subjectName || open?.subjectName?.includes(subjectCell)
    const subjectLooksSplit = !!subjectCell && !!open && !subjectMatches && looksUnfinished(open.text) &&
      (justCrossedPage || /[와과의을를은는이가에로]$/.test(open.subjectName))
    const isContinuation = sameStudent && (subjectMatches || subjectLooksSplit)
    justCrossedPage = false
    if (isContinuation) {
      if (subjectLooksSplit) {
        open.subjectName = normalizeSubject(`${open.subjectName} ${subjectCell}`)
      }
      if (open.grade == null && gradeCell) open.grade = Number(gradeCell) || null
      if (open.semester == null && semesterCell) open.semester = Number(semesterCell) || null
      if (textCell) open.text += looksUnfinished(open.text) ? textCell : ` ${textCell}`
    } else {
      finalizeOpen()
      // 학년/학기 칸은 그 과목이 파일에서 처음 등장할 때만 채워지고, 같은 과목이 새
      // 페이지 맨 위에서 다시 시작될 때(과목명은 페이지 헤더처럼 다시 나옴)는 비어
      // 있다. 비어 있다고 null로 덮어쓰면 그 뒤로 이어지는 같은 과목 학생들이 전부
      // 학년/학기 결측이 되어 버린다(실측, 2026-09-03) — 값이 있을 때만 갱신한다.
      if (subjectCell) {
        currentSubject = normalizeSubject(subjectCell)
        if (gradeCell) currentGrade = Number(gradeCell) || currentGrade
        if (semesterCell) currentSemester = Number(semesterCell) || currentSemester
      }
      open = {
        studentNumber: num,
        studentName: nameCell,
        subjectName: currentSubject,
        grade: currentGrade,
        semester: currentSemester,
        text: textCell || '',
      }
    }
  }
  finalizeOpen()

  if (!records.length) throw new Error('인식된 세특 데이터가 없습니다. 나이스 내보내기 파일이 맞는지 확인해주세요.')
  return { classLabel, records }
}

// ── 점검 규칙 엔진 ────────────────────────────────────────────────────────
//
// 사용자가 정리해 준 "생기부 알고리즘 점검 기준"(student_record_algorithm_check_rules.md)을
// 그대로 구현한다. 핵심 원칙: 알고리즘이 높은 확률로 판별할 수 있는 것만 자동 탐지하고,
// 문맥 판단이 필요한 것(활동이 충분히 구체적인가 등)은 여기서 다루지 않는다(문서 §15).
//
// 목록형 규칙(특수기호·비교서열화·기재제한언급·문장종결·오타사전)은 전부 "규칙 그룹"으로
// 표현해 관리자가 화면에서 완전히 편집할 수 있게 한다 — 기본 제공 항목도 예외 없이
// 고칠 수 있어야 한다는 요청 때문에, "고정 기본값 + 학교 추가분"이 아니라 "학교가 저장한
// groups가 있으면 그게 곧 전체 상태"인 모델을 쓴다(loadDictionary 참고). 숨은 문자·괄호
// 짝·공백류처럼 정규식 하나로 표현되는 구조적 규칙은 목록이 아니라서 이 그룹 모델에
// 넣지 않고 코드에 고정한다.
//
// 규칙마다 authority(official_2026/school_policy/style)와 severity(ERROR/WARNING/INFO)를
// 붙여 "공식 기준"과 "학교/스타일 기준"을 화면에서 구분해 보여준다(문서 §17) — 그래야
// 사용자가 모든 경고를 법적 금지사항으로 오해하지 않는다.

export const AUTHORITY_LABELS = {
  official_2026: '공식 기준',
  school_policy: '학교 기준',
  style: '문장 스타일',
}

export const SEVERITY_LABELS = { ERROR: '금지 표현', WARNING: '주의 표현', INFO: '참고 표현' }

// 그룹 종류: literal(문자열 그대로 탐지) / pair(오타→올바른 표현) / sentence_end(문장 "끝"에서만 탐지)
// §5 문장부호·특수기호 — 실제로는 쉼표·마침표 외 문장부호는 거의 쓰이지 않고, 물음표·
// 느낌표도 특수기호와 같은 성격으로 취급해 하나로 묶는다(쉼표·마침표 자체는 정상적으로
// 항상 쓰이는 문장부호라 이 목록에 넣지 않는다 — 중복/앞뒤 공백 이상만 별도로 검사).
const SPECIAL_SYMBOLS_GROUP = {
  id: 'special_symbols', title: '특수기호(문장부호 포함)', type: 'literal',
  authority: 'school_policy', severity: 'WARNING', enabled: true,
  items: ['?', '!', '...', '…', '★', '☆', '♡', '•', '·', '→', '⇒', '※', '◆', '▶', '✓', '✔', '△', '○', '◎'],
}
// §4 비교·서열화 표현. "가장" 단독은 금지하지 않는다("가장 큰 오차" 같은 정상 서술과
// 구분이 안 되므로) — 반드시 구체적인 구(句) 전체나 순위 패턴만 본다.
const COMPARISON_GROUP = {
  id: 'comparison', title: '비교·서열화 표현', type: 'literal',
  authority: 'official_2026', severity: 'ERROR', enabled: true,
  items: ['가장 뛰어난', '가장 우수한', '반에서 유일하게', '학급에서 유일하게', '다른 학생보다', '타 학생보다', '누구보다', '최고의', '최상위'],
}
const COMPARISON_REGEXES = [
  /\d+\s*등/g, /전교\s*\d+\s*등/g, /학급\s*\d+\s*등/g, /반\s*\d+\s*등/g, /상위\s*\d+(?:\.\d+)?\s*%/g,
]
// §7 세특 공식 규정과 연결되는 문자열 — 등장 자체가 위반을 확정하지 않으므로(정규
// 교육과정 성취기준에 따른 소논문 작성 등 예외가 있음) WARNING으로만 표시한다.
const RESTRICTED_MENTIONS_GROUP = {
  id: 'restricted_mentions', title: '기재 제한 관련 언급', type: 'literal',
  authority: 'official_2026', severity: 'WARNING', enabled: true,
  items: ['K-MOOC', 'MOOC', 'KOCW', '방과후학교', '연구보고서', '소논문', '대회', '수상', '수상실적', '금상', '은상', '동상', '대상', '최우수상', '우수상'],
}
// §3 문장 종결 주의 표현 — 문장 "끝"에서만 탐지한다. 문자열 전체에서 찾으면
// "이해를 바탕으로 재설계함"처럼 무관한 문장까지 걸린다(문서에 명시된 오탐 사례).
// 문맥을 봐야 진짜 문제인지 판단 가능한 항목이라 오탐이 가장 많다(실측 상 전체 검출량의
// 대부분을 차지) — 기본값은 꺼둔다. 문맥 판단은 향후 AI 분석 업그레이드에서 다룰 영역.
const SENTENCE_END_GROUP = {
  id: 'sentence_end', title: '문장 종결 주의 표현', type: 'sentence_end',
  authority: 'style', severity: 'WARNING', enabled: false,
  items: ['이해함', '인식함', '깨달음', '알게 됨', '느낌', '다짐함', '향상시킴', '발전시킴', '기회가 됨', '계기가 됨', '발표함', '탐색함', '조사함', '참여함'],
}
// §6 확정적 오타 사전 — 문맥과 무관하게 오타로 확정할 수 있는 것만 담는다.
// "낫다/낮다", "데로/대로" 등 문맥에 따라 달라지는 표현과 "왠지/더욱이/오랫동안/웬만"처럼
// 그 자체로 정상인 표현은 절대 넣지 않는다(문서 §6 "자동 수정에서 제외할 표현").
const CONFUSION_PAIRS_GROUP = {
  id: 'confusion_pairs', title: '오타/맞춤법 혼동', type: 'pair',
  authority: 'official_2026', severity: 'ERROR', enabled: true,
  items: [
    { wrong: '역활', right: '역할' }, { wrong: '됬', right: '됐' }, { wrong: '어의없', right: '어이없' },
    { wrong: '왠만', right: '웬만' }, { wrong: '웬지', right: '왠지' }, { wrong: '몇일', right: '며칠' },
    { wrong: '금새', right: '금세' }, { wrong: '희안', right: '희한' }, { wrong: '깨끗히', right: '깨끗이' },
    { wrong: '일일히', right: '일일이' }, { wrong: '통채로', right: '통째로' },
  ],
}
// §12 학교 자체 추가 규칙 — 처음엔 비어 있고, 관리자가 자유롭게 채운다.
const CUSTOM_GROUP = {
  id: 'custom', title: '학교 자체 추가 규칙', type: 'literal',
  authority: 'school_policy', severity: 'WARNING', enabled: true, items: [],
}

export const DEFAULT_RULE_GROUPS = [
  SPECIAL_SYMBOLS_GROUP, COMPARISON_GROUP, RESTRICTED_MENTIONS_GROUP, SENTENCE_END_GROUP, CONFUSION_PAIRS_GROUP, CUSTOM_GROUP,
]

const GROUP_MESSAGES = {
  special_symbols: '문장부호·특수기호 사용이 적절한지 확인하세요.',
  comparison: '다른 학생과 비교·서열화하는 표현은 사용하지 않습니다.',
  restricted_mentions: '기재 제한 항목과 관련될 수 있는 표현입니다. 실제 기재 가능 여부를 확인하세요.',
  custom: '학교에서 추가한 주의 표현입니다.',
}

/**
 * 학교가 저장해 둔 사전(setukDictionary/default 문서)과 기본 제공 규칙을 합친다.
 * 학교가 어떤 그룹이든 한 번 저장하면 그 그룹은 "저장된 내용 그대로"가 최종 상태이
 * 된다(기본값 위에 부분적으로 얹는 게 아니라 완전히 대체) — 기본 제공 항목도 관리자가
 * 자유롭게 고치거나 지울 수 있어야 하기 때문이다. 코드가 나중에 새 그룹을 추가해도
 * 학교가 그 그룹을 아직 안 건드렸다면 기본값이 그대로 보인다.
 */
export function loadDictionary(custom) {
  const customById = Object.fromEntries((custom?.groups || []).map((g) => [g.id, g]))
  const groups = DEFAULT_RULE_GROUPS.map((g) => (customById[g.id] ? { ...g, ...customById[g.id] } : g))
  ;(custom?.groups || []).forEach((g) => { if (!DEFAULT_RULE_GROUPS.some((d) => d.id === g.id)) groups.push(g) })
  return { groups }
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function findAll(text, needle) {
  const idxs = []
  let from = 0
  while (true) {
    const idx = text.indexOf(needle, from)
    if (idx < 0) break
    idxs.push(idx)
    from = idx + needle.length
  }
  return idxs
}

function findAllRegex(text, regex) {
  const results = []
  const re = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : `${regex.flags}g`)
  let m
  while ((m = re.exec(text))) {
    results.push({ index: m.index, matched: m[0] })
    if (m[0].length === 0) re.lastIndex += 1 // 빈 매칭 무한루프 방지
  }
  return results
}

function contextAround(text, index, len, pad = 18) {
  const start = Math.max(0, index - pad)
  const end = Math.min(text.length, index + len + pad)
  let before = text.slice(start, index)
  let after = text.slice(index + len, end)
  if (start > 0) before = '…' + before.replace(/^\S*\s/, '')
  if (end < text.length) after = after.replace(/\s\S*$/, '') + '…'
  return { before, after }
}

// 공백류(중복 공백, 문단 앞뒤 공백 등)는 matched가 눈에 안 보이는 문자라 화면에 아무것도
// 없는 것처럼 보인다 — 가운데점/화살표 기호로 바꿔 눈에 확실히 드러나게 한다.
function visualizeSpaces(s) {
  return s.replace(/ /g, '␣').replace(/\t/g, '⇥')
}

function pushMatch(items, { category, authority, severity, ruleId }, text, index, matchedLen, message, displayOverride) {
  const raw = text.slice(index, index + matchedLen)
  const { before, after } = contextAround(text, index, matchedLen)
  // length는 표시용 matched(displayOverride로 바뀔 수 있음)와 별개로, 전체 원문에서 실제
  // 강조해야 할 구간의 길이다 — 팝업에서 전체 문장을 하이라이트할 때 index와 함께 쓴다.
  items.push({ ruleId, category, authority, severity, matched: displayOverride ?? raw, index, length: matchedLen, message, before, after })
}

// §9 숨은 문자 — 복사·붙여넣기로 섞여 들어오는 보이지 않는 문자. 존재 자체가 결함이라
// 항상 ERROR로 취급한다. U+200B(제로폭 공백), U+FEFF(BOM), U+00A0(줄바꿈 없는 공백),
// 그 외 개행/탭이 아닌 제어문자(U+0000-08, 0B, 0C, 0E-1F).
const HIDDEN_CHAR_PATTERN = /[\u200B\uFEFF\u00A0\u0000-\u0008\u000B\u000C\u000E-\u001F]/g

// §9 괄호·인용부호 대응 — 단순 개수 비교가 아니라 스택으로 짝을 맞춘다.
const BRACKET_PAIRS = { '(': ')', '[': ']', '{': '}', '“': '”', '‘': '’', '「': '」', '『': '』' }
const BRACKET_OPEN = new Set(Object.keys(BRACKET_PAIRS))
const BRACKET_CLOSE = new Map(Object.entries(BRACKET_PAIRS).map(([o, c]) => [c, o]))

function checkBrackets(text) {
  const stack = []
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (BRACKET_OPEN.has(ch)) stack.push({ ch, i })
    else if (BRACKET_CLOSE.has(ch)) {
      if (stack.length && stack[stack.length - 1].ch === BRACKET_CLOSE.get(ch)) stack.pop()
      else return { index: i, matched: ch } // 짝 없는 닫는 기호
    }
  }
  if (stack.length) return { index: stack[0].i, matched: stack[0].ch } // 안 닫힌 여는 기호
  return null
}

function runLiteralGroup(items, text, group) {
  if (!group?.enabled) return
  group.items.forEach((phrase) => {
    findAll(text, phrase).forEach((idx) => {
      pushMatch(items, { category: group.title, authority: group.authority, severity: group.severity, ruleId: `${group.id}_${phrase}` },
        text, idx, phrase.length, GROUP_MESSAGES[group.id] || '확인이 필요한 표현입니다.')
    })
  })
}

function runPairGroup(items, text, group) {
  if (!group?.enabled) return
  group.items.forEach(({ wrong, right }) => {
    findAll(text, wrong).forEach((idx) => {
      pushMatch(items, { category: group.title, authority: group.authority, severity: group.severity, ruleId: `${group.id}_${wrong}` },
        text, idx, wrong.length, `"${right}"의 오타가 아닌지 확인하세요.`)
    })
  })
}

function runSentenceEndGroup(items, text, sentences, group) {
  if (!group?.enabled || !group.items.length) return
  const re = new RegExp(`(${group.items.map(escapeRegExp).join('|')})[.!?]?\\s*$`)
  sentences.forEach((s) => {
    const m = re.exec(s.text)
    if (m) {
      pushMatch(items, { category: group.title, authority: group.authority, severity: group.severity, ruleId: group.id },
        text, s.start + m.index, m[1].length, '근거 없이 뭉뚱그린 종결 표현은 아닌지 확인해보세요.')
    }
  })
}

/**
 * 텍스트 하나를 점검해 발견된 항목 배열을 반환한다. studentName을 주면 본문에 학생
 * 본인 이름이 다시 등장하는지도 함께 확인한다(생기부는 주어를 반복 명시하지 않는 게 원칙).
 *
 * 파이프라인은 문서 §13 순서를 따른다: 숨은 문자 → 괄호 구조 → 문장 분리+종결 패턴 →
 * 기재 제한 언급 → 학교 추가 규칙 → 오타 사전 → 특수기호 → 비교·서열화 →
 * 공백 → 외국어 표기 → 반복 표현.
 *
 * @param {string} text
 * @param {{groups: Array<object>}} dictionary loadDictionary()의 반환값
 * @param {string} [studentName]
 * @returns {Array<{ruleId, category, authority, severity, matched, index, message, before, after}>}
 */
export function checkText(text, dictionary, studentName) {
  const items = []
  if (!text) return items

  const byId = Object.fromEntries((dictionary.groups || []).map((g) => [g.id, g]))

  // 숨은 문자
  findAllRegex(text, HIDDEN_CHAR_PATTERN).forEach(({ index, matched }) => {
    pushMatch(items, { category: '구조/숨은 문자', authority: 'school_policy', severity: 'ERROR', ruleId: 'hidden_char' },
      text, index, matched.length || 1, '복사·붙여넣기 과정에서 섞인 보이지 않는 문자로 보입니다.', '(보이지 않는 문자)')
  })

  // 괄호·인용부호 짝
  const bracketIssue = checkBrackets(text)
  if (bracketIssue) {
    pushMatch(items, { category: '구조/괄호', authority: 'school_policy', severity: 'ERROR', ruleId: 'bracket_mismatch' },
      text, bracketIssue.index, 1, '괄호·인용부호의 짝이 맞지 않습니다.')
  }

  // 문단 시작/끝 공백 — 눈에 안 보이니 기호로 드러낸다. 줄바꿈(엔터)은 공백류 문자이긴
  // 하지만 이 규칙이 잡으려는 "불필요한 공백"과는 다른 문제라 여기서 제외한다.
  const leadSpace = /^[^\S\n]+/.exec(text)
  if (leadSpace) {
    pushMatch(items, { category: '띄어쓰기', authority: 'style', severity: 'WARNING', ruleId: 'leading_space' },
      text, 0, leadSpace[0].length, '문단 시작에 불필요한 공백이 있습니다.', visualizeSpaces(leadSpace[0]))
  }
  const trailSpace = /[^\S\n]+$/.exec(text)
  if (trailSpace) {
    pushMatch(items, { category: '띄어쓰기', authority: 'style', severity: 'WARNING', ruleId: 'trailing_space' },
      text, text.length - trailSpace[0].length, trailSpace[0].length, '문단 끝에 불필요한 공백이 있습니다.', visualizeSpaces(trailSpace[0]))
  }

  // §3 문장 종결 주의 표현 — 문장 단위로 분리해 "끝"에서만 검사
  const sentences = []
  {
    let start = 0
    const boundary = /[.!?]\s*/g
    let m
    while ((m = boundary.exec(text))) {
      sentences.push({ text: text.slice(start, m.index + m[0].length), start })
      start = m.index + m[0].length
    }
    if (start < text.length) sentences.push({ text: text.slice(start), start })
  }
  runSentenceEndGroup(items, text, sentences, byId.sentence_end)

  // §7 기재 제한 관련 언급, §12 학교 추가 규칙, §6 오타 사전
  runLiteralGroup(items, text, byId.restricted_mentions)
  runLiteralGroup(items, text, byId.custom)
  runPairGroup(items, text, byId.confusion_pairs)

  // §5 특수기호(쉼표·마침표 제외 — 그 둘은 정상적으로 항상 쓰이는 문장부호)
  runLiteralGroup(items, text, byId.special_symbols)
  findAllRegex(text, /,{2,}/g).forEach(({ index, matched }) => {
    pushMatch(items, { category: '띄어쓰기', authority: 'style', severity: 'WARNING', ruleId: 'punct_repeat_comma' },
      text, index, matched.length, '쉼표가 중복되었습니다.')
  })

  // §4 비교·서열화 표현(목록 + 순위 패턴 — 그룹이 꺼져 있으면 순위 패턴도 같이 건너뜀)
  runLiteralGroup(items, text, byId.comparison)
  if (byId.comparison?.enabled) {
    COMPARISON_REGEXES.forEach((re) => {
      findAllRegex(text, re).forEach(({ index, matched }) => {
        pushMatch(items, { category: byId.comparison.title, authority: byId.comparison.authority, severity: byId.comparison.severity, ruleId: 'comparison_rank' },
          text, index, matched.length, '서열·순위를 드러내는 표현은 사용하지 않습니다.')
      })
    })
  }

  // §9 연속 공백 / 마침표 앞뒤 공백 이상
  findAllRegex(text, /[ \t]{2,}/g).forEach(({ index, matched }) => {
    pushMatch(items, { category: '띄어쓰기', authority: 'style', severity: 'WARNING', ruleId: 'double_space' },
      text, index, matched.length, '공백이 중복되었습니다.', visualizeSpaces(matched))
  })
  findAllRegex(text, /[.]([가-힣])/g).forEach(({ index }) => {
    pushMatch(items, { category: '띄어쓰기', authority: 'style', severity: 'WARNING', ruleId: 'no_space_after_period' },
      text, index, 1, '마침표 뒤 띄어쓰기 누락(문장 경계 확인).')
  })
  findAllRegex(text, /[^\S\n]+[.!?]/g).forEach(({ index, matched }) => {
    pushMatch(items, { category: '띄어쓰기', authority: 'style', severity: 'WARNING', ruleId: 'space_before_period' },
      text, index, matched.length, '마침표 앞에 불필요한 공백이 있습니다.', visualizeSpaces(matched))
  })

  // 형식 — 존댓말체 종결(생기부는 "~함/~임" 평서체 원칙)
  findAllRegex(text, /(습니다|했어요|이에요|해요)[.]/g).forEach(({ index, matched }) => {
    pushMatch(items, { category: '문장 종결', authority: 'style', severity: 'WARNING', ruleId: 'polite_ending' },
      text, index, matched.length, '평서체(~함/~임) 종결 원칙에 맞는지 확인하세요.')
  })

  // 형식 — 학생 본인 이름 재언급
  if (studentName && studentName.length >= 2) {
    findAll(text, studentName).forEach((idx) => {
      pushMatch(items, { category: '형식', authority: 'school_policy', severity: 'WARNING', ruleId: 'self_name_repeat' },
        text, idx, studentName.length, '본문에 학생 이름을 반복 명시하지 않는 것이 원칙입니다.')
    })
  }

  // §8 외국어 표기(영문 2자 이상) — 확정할 수 없어 INFO로만 표시
  findAllRegex(text, /[A-Za-z]{2,}/g).forEach(({ index, matched }) => {
    pushMatch(items, { category: '외국어 표기', authority: 'style', severity: 'INFO', ruleId: 'foreign_text' },
      text, index, matched.length, '영문 표기입니다. 고유명사·약어 등 불가피한 경우가 아닌지 확인하세요.')
  })

  // §10 반복 표현 — 동일 "~함." 종결이 3회 이상 반복되면 참고용으로만 표시. 처음 나온
  // 곳 한 군데만이 아니라 반복된 자리 전부를 표시해야 담임/교사가 어디를 고칠지 바로 안다.
  const endingOccurrences = new Map()
  findAllRegex(text, /([가-힣]{2,4}함)[.]/g).forEach(({ index, matched }) => {
    const word = matched.slice(0, -1)
    if (!endingOccurrences.has(word)) endingOccurrences.set(word, [])
    endingOccurrences.get(word).push(index)
  })
  endingOccurrences.forEach((indices, word) => {
    if (indices.length >= 3) {
      indices.forEach((idx) => {
        pushMatch(items, { category: '반복 표현', authority: 'style', severity: 'INFO', ruleId: 'repeated_ending' },
          text, idx, word.length, `"${word}" 종결이 ${indices.length}회 반복되었습니다.`)
      })
    }
  })

  return items
}
