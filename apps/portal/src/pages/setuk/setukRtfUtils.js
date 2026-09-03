// 생기부 세특 점검 도구 — 나이스 "DOC(실제 RTF)" 내보내기 파싱.
//
// 나이스 "학생부 항목별 조회"의 「XLS data」 내보내기는 사용자가 입력한 줄바꿈을 저장
// 시점에 통째로 없애 버린다(사용자 확인, 2026-09-03 — 실제 나이스 화면엔 줄바꿈이
// 있는데 XLS data로 받으면 사라짐). 「DOC」로 받으면 확장자와 달리 실제로는 RTF
// 문서인데, 여기서는 줄바꿈이 \par로, 페이지 나눔이 \page로 명확히 구분되어 남는다
// (setukUtils.js의 parseNeisSetukFile은 이 구분이 없는 XLS를 대상으로, 조사로 끝나는지
// 등 휴리스틱으로 "페이지 경계에서 잘린 것"을 추측해야 했다 — 여기서는 \page 토큰이
// 그 추측을 대신한다).
//
// RTF 문서 전체는 표(\trowd~\row, 그 안에 \cell로 나뉜 칸) 하나로 되어 있고, 실제
// 데이터 앞뒤로 매 페이지마다 워터마크·쪽번호·사용자명·학급명·날짜·학교명 같은 1칸짜리
// "장식" 행이 반복된다. 이 장식 행들은 실제 데이터 행(과목·학년·학기·번호·성명·특기사항
// 6칸)과 칸 수가 달라 구분할 필요조차 없다 — 6칸이 아니면 전부 건너뛴다.

function stripSpaces(s) {
  return String(s || '').replace(/\s/g, '')
}

// 우리가 텍스트로 취급할 필요 없는 destination 그룹 — 폰트표·색상표·스타일시트 등
// 문서 겉모습 정의라 내용을 다 걸러내야 한다(안 그러면 폰트 이름의 한글이 본문처럼
// 섞여 들어온다).
const SKIP_DESTINATIONS = new Set([
  'fonttbl', 'colortbl', 'stylesheet', 'info', 'generator', 'listtable',
  'listoverridetable', 'themedata', 'latentstyles', 'rsid', 'xmlnstbl',
  'pgptbl', 'panose', 'operator', 'company', 'category', 'comment',
])

/**
 * RTF 바이트 스트림을 토큰 목록으로 바꾼다. 서식 제어 단어는 대부분 버리고,
 * 텍스트에 실제로 영향을 주는 것만 남긴다: 글자(유니코드 이스케이프 복원 포함),
 * 문단(\par), 표 칸 경계(\cell), 표 행 경계(\row), 페이지 나눔(\page).
 *
 * 이 문서는 iText 4.2.0(자바 PDF/RTF 라이브러리)이 만든 것이라 인코딩이 규칙적이다 —
 * 한글은 전부 \uN(부호 있는 16비트 정수) 이스케이프이고, 그 뒤에 구버전 리더용
 * 대체문자(보통 물음표 1개, \uc로 개수 지정)가 따라온다. 이 대체문자는 건너뛴다.
 */
function tokenizeRtf(rtf) {
  const n = rtf.length
  const tokens = []
  let i = 0
  const skipStack = [false]
  const ucStack = [1]

  // iText가 만드는 이 문서는 \trftsWidth·\clwWidth처럼 낙타표기(camelCase) 제어단어를
  // 쓴다 — 표준 RTF 제어단어는 대개 소문자뿐이라 처음엔 소문자만 허용했다가, 대문자
  // 앞에서 멈춰버려 "Width3Width15281..." 같은 나머지 절반이 그대로 본문 글자로
  // 새어 들어오는 문제가 있었다(실측, 2026-09-03). 대소문자 모두 허용해야 한다.
  const isAlpha = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')
  const isDigit = (c) => c >= '0' && c <= '9'

  while (i < n) {
    const ch = rtf[i]
    if (ch === '{') { skipStack.push(skipStack[skipStack.length - 1]); ucStack.push(ucStack[ucStack.length - 1]); i++; continue }
    if (ch === '}') { skipStack.pop(); ucStack.pop(); i++; continue }
    if (ch === '\r' || ch === '\n') { i++; continue } // 원본 줄바꿈은 가독성용일 뿐 의미 없음

    if (ch === '\\') {
      i++
      const c2 = rtf[i]
      if (c2 === "'") {
        // \'hh — 현재 코드페이지의 1바이트 문자. 이 파일은 한글을 전부 \u로 쓰지만
        // 혹시 모를 대비.
        const hex = rtf.slice(i + 1, i + 3)
        i += 3
        if (!skipStack[skipStack.length - 1]) tokens.push({ t: 'char', v: String.fromCharCode(parseInt(hex, 16) || 0) })
        continue
      }
      if (isAlpha(c2)) {
        let j = i
        while (j < n && isAlpha(rtf[j])) j++
        const word = rtf.slice(i, j)
        let numStr = ''
        if (rtf[j] === '-') { numStr += '-'; j++ }
        while (j < n && isDigit(rtf[j])) { numStr += rtf[j]; j++ }
        const num = numStr ? parseInt(numStr, 10) : null
        if (rtf[j] === ' ') j++
        i = j

        if (word === 'u' && num !== null) {
          const cp = num < 0 ? num + 65536 : num
          if (!skipStack[skipStack.length - 1]) tokens.push({ t: 'char', v: String.fromCodePoint(cp) })
          let skip = ucStack[ucStack.length - 1]
          while (skip > 0 && i < n) {
            if (rtf[i] === '{' || rtf[i] === '}') break
            if (rtf[i] === '\\') {
              i++
              if (isAlpha(rtf[i])) { while (i < n && isAlpha(rtf[i])) i++; while (i < n && isDigit(rtf[i])) i++; if (rtf[i] === ' ') i++ }
              else i++
            } else {
              i++
            }
            skip--
          }
          continue
        }
        if (word === 'uc') { ucStack[ucStack.length - 1] = num ?? 1; continue }
        if (SKIP_DESTINATIONS.has(word)) { skipStack[skipStack.length - 1] = true; continue }
        if (word === 'par') { if (!skipStack[skipStack.length - 1]) tokens.push({ t: 'par' }); continue }
        if (word === 'page') { if (!skipStack[skipStack.length - 1]) tokens.push({ t: 'page' }); continue }
        if (word === 'row') { if (!skipStack[skipStack.length - 1]) tokens.push({ t: 'row' }); continue }
        if (word === 'cell') { if (!skipStack[skipStack.length - 1]) tokens.push({ t: 'cell' }); continue }
        if (word === 'tab') { if (!skipStack[skipStack.length - 1]) tokens.push({ t: 'char', v: '\t' }); continue }
        continue // 그 외 제어단어(서식)는 무시
      }
      if (c2 === '\\' || c2 === '{' || c2 === '}') {
        if (!skipStack[skipStack.length - 1]) tokens.push({ t: 'char', v: c2 })
        i += 2
        continue
      }
      if (c2 === '*') { i += 2; continue } // \* — 다음 destination이 "확장 기능"이라는 표시, 내용은 아님
      i += 2
      continue
    }

    if (!skipStack[skipStack.length - 1]) tokens.push({ t: 'char', v: ch })
    i++
  }
  return tokens
}

/**
 * 토큰을 표의 "행" 단위로 묶는다. 각 행은 칸(cell) 문자열 배열이고, pageIndex는
 * 그 행까지 지나온 \page 누적 개수다(행마다 리셋되지 않음).
 *
 * 처음엔 "직전 행 이후 \page를 지났는지"를 행마다 불리언(crossedPage)으로 표시했는데,
 * 실제 데이터 행 사이엔 워터마크·쪽번호·사용자명·학급명·날짜·학교명 같은 1칸짜리
 * 장식 행이 8~9개나 끼어 있어서, \page 바로 다음 장식 행 하나가 그 표식을 "소비"해
 * 버리고 정작 그 뒤에 나오는 진짜 6칸 데이터 행에는 표식이 남지 않는 문제가 있었다
 * (실측, 2026-09-03 — "기후변화와 지속가능한" + 페이지 나눔 + "세계" 과목명 분할이
 * 병합되지 않던 원인). 그래서 리셋 없는 누적 카운터로 바꾸고, "마지막으로 실제 데이터
 * 행을 처리했을 때의 pageIndex"와 비교하는 방식으로 소비 시점을 호출부에서 직접
 * 결정하게 했다 — 장식 행이 몇 개가 끼든 상관없이 진짜 데이터 행에 도달할 때까지
 * 표식이 살아남는다.
 */
function tokensToRows(tokens) {
  const rows = []
  let cells = []
  let cur = ''
  let pageIndex = 0
  for (const tok of tokens) {
    if (tok.t === 'char') cur += tok.v
    else if (tok.t === 'par') cur += '\n'
    else if (tok.t === 'cell') { cells.push(cur.trim()); cur = '' }
    else if (tok.t === 'row') {
      if (cells.length) rows.push({ cells, pageIndex })
      cells = []
      cur = ''
    } else if (tok.t === 'page') {
      pageIndex++
    }
  }
  if (cells.length) rows.push({ cells, pageIndex })
  return rows
}

const CLASS_LABEL_PATTERN = /\d+학년\s*\d+반/

/**
 * @param {File} file 나이스 "학생부 항목별 조회"의 DOC(실제 RTF) 내보내기
 * @returns {Promise<{classLabel: string, records: Array<{studentNumber:number, studentName:string, subjectName:string, grade:number|null, semester:number|null, text:string}>}>}
 */
export async function parseNeisSetukRtfFile(file) {
  const rtf = await file.text()
  if (!rtf.startsWith('{\\rtf')) {
    throw new Error('RTF(DOC) 형식이 아닙니다. 나이스에서 「DOC」로 다시 받아주세요.')
  }

  const rows = tokensToRows(tokenizeRtf(rtf))

  let classLabel = ''
  for (const { cells } of rows) {
    if (cells.length === 1 && CLASS_LABEL_PATTERN.test(cells[0])) { classLabel = cells[0]; break }
  }

  const records = []
  let currentSubject = ''
  let currentGrade = null
  let currentSemester = null
  let open = null
  let lastDataPageIndex = 0 // open을 마지막으로 만들거나 이어붙인 시점의 pageIndex
  const normalizeSubject = (s) => s.replace(/\s+/g, ' ').trim()
  const finalizeOpen = () => { if (open) records.push(open); open = null }
  // 세특 문장은 규정상 항상 "~함." "~임." 처럼 마침표로 끝난다. 페이지 경계에서 진짜로
  // 잘린 행이라면 그 잘린 위치가 우연히 마침표 뒤일 확률은 극히 낮으므로, 직전에 열어
  // 둔 레코드의 텍스트가 이미 마침표로 끝나 있다면 "정상적으로 끝난 행" — 과목명이
  // 우연히 다르면서 학번·이름만 같은 것은 진짜 분할이 아니라 그 학번의 다음 과목이
  // 우연히 이어진 것이다(실측, 2026-09-03 — 세계 문화와 영어(29번 마지막 학생) 바로
  // 뒤 페이지에 한국사1(29번이 첫 학생)이 와서 "세계 문화와 영어 한국사1"로 잘못
  // 합쳐짐).
  const looksUnfinished = (text) => {
    const t = String(text || '').trimEnd()
    return t.length > 0 && !/[.!?…」』]$/.test(t)
  }

  for (const { cells, pageIndex } of rows) {
    if (cells.length !== 6) continue // 워터폼·쪽번호·사용자명·학급명·날짜·학교명·구분(교과군) 등 장식 행
    const [subjectCell, gradeCell, semesterCell, numCell, nameCell, textCell] = cells
    if (stripSpaces(subjectCell) === '과목' && stripSpaces(numCell) === '번호') continue // 표 헤더 행

    const num = Number(numCell)
    if (!numCell || !Number.isFinite(num) || !nameCell) continue // "조회된 데이터가 없습니다" 등

    // 이 데이터 행에 도달하기까지(직전 데이터 행 이후로) \page를 하나라도 지났는지 —
    // 그 사이에 장식 행이 몇 개 끼어 있어도 pageIndex는 리셋되지 않으므로 정확하다.
    const crossedPage = !!open && pageIndex > lastDataPageIndex
    const sameStudent = !!open && open.studentNumber === num && open.studentName === nameCell
    const subjectMatches = !subjectCell || subjectCell === open?.subjectName || open?.subjectName?.includes(subjectCell)
    // XLS 파싱과 달리 페이지 나눔이 확실하므로, "페이지를 막 넘겼다"는 이 표식 하나로
    // 충분하다 — 조사로 끝나는지 같은 휴리스틱이 필요 없다.
    const subjectLooksSplit = !!subjectCell && !!open && !subjectMatches && crossedPage && looksUnfinished(open.text)
    const isContinuation = sameStudent && (subjectMatches || subjectLooksSplit)

    if (isContinuation) {
      if (subjectLooksSplit) open.subjectName = normalizeSubject(`${open.subjectName} ${subjectCell}`)
      if (open.grade == null && gradeCell) open.grade = Number(gradeCell) || null
      if (open.semester == null && semesterCell) open.semester = Number(semesterCell) || null
      if (textCell) {
        // 페이지 경계에서 문장이 이미 마침표로 끝난 뒤 잘렸다면(단어 중간이 아니라
        // 문장 경계에서 잘린 것) 그 자리엔 원래 "마침표 + 공백 + 다음 문장" 형태의
        // 공백이 있었을 텐데, 각 칸을 trim()하는 과정에서 그 공백만 유실된다 — 이걸
        // 그대로 이어 붙이면 "완성함.작품을"처럼 오히려 우리가 잡으려는 "마침표 뒤
        // 띄어쓰기 누락" 오탐을 직접 만들어내 버린다(실측, 2026-09-03). 단어 중간
        // 절단(예: "대안"+"을"="대안을")은 공백을 넣으면 안 되므로, looksUnfinished로
        // 두 경우를 구분한다.
        open.text += looksUnfinished(open.text) ? textCell : ` ${textCell}`
      }
      lastDataPageIndex = pageIndex
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
      open = { studentNumber: num, studentName: nameCell, subjectName: currentSubject, grade: currentGrade, semester: currentSemester, text: textCell || '' }
      lastDataPageIndex = pageIndex
    }
  }
  finalizeOpen()

  if (!records.length) throw new Error('인식된 세특 데이터가 없습니다. 나이스 DOC 내보내기 파일이 맞는지 확인해주세요.')
  return { classLabel, records }
}
