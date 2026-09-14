import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore'
import { db } from './firebase'
import { COL, schoolPath } from './schema'

// 시도교육청 공식 "인정도서 목록" 엑셀(예: 서울시교육청 창의미래교육과 배포본)을 가져와
// 과목별 후보(출판사·저자·가격)를 미리 채워 선정 건을 만드는 기능.
//
// 이 엑셀은 매년 배포되며 시트 구성·이름이 해마다 달라질 수 있다(올해는 6개 시트: 2022개정
// 신간본/기간본/고시외, 2015개정 기간본/고시외, 2025년 한시적 승인). 그래서 시트 이름을
// 하드코딩하지 않고, 시트마다 "학교급"+"출판사"+"가격" 헤더가 모두 있는 행을 찾아 그 시트만
// 인정도서 목록으로 인식한다. "인정시도"는 서울뿐 아니라 전국 17개 시도가 섞여 있는데,
// 같은 과목의 후보가 시트마다(예: 신간본 시트엔 A출판사, 기간본 시트엔 B출판사) 나뉘어
// 있어서 지역으로 거르면 후보가 누락된다 — 그래서 필터링하지 않고 전국 목록을 그대로 쓴다.
const HEADER_SCAN_ROWS = 6

const norm = (s) => String(s ?? '').replace(/[\s\r\n]/g, '')

function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, HEADER_SCAN_ROWS); i++) {
    const cells = (rows[i] || []).map(norm)
    if (cells.some((c) => c.includes('학교급')) && cells.some((c) => c.includes('출판사')) && cells.some((c) => c.includes('가격'))) {
      return i
    }
  }
  return -1
}

// 과목명 그룹핑 키 — 원본 데이터가 시도마다 따로 다시 입력한 값이라 같은 과목인데도
// 띄어쓰기가 시트마다 다르게 들어간 경우가 있다(실제 사례, 2026-09-16: "윤리문제 탐구"가
// 맞는 표기인데 한 시트엔 "윤리 문제 탐구"로 들어가 있어 서로 다른 과목으로 갈라짐 —
// 후보가 반씩 나뉘어 등록되는 사고로 이어졌다). 공백을 전부 지운 값으로 묶어 같은 과목으로
// 합친다.
function subjectKey(name) {
  return name.replace(/\s+/g, '')
}

/**
 * 엑셀 파일을 읽어 { 과목명: [{publisher, author, price}] } 형태로 만든다.
 *
 * 과목 하나(예: "경제")의 후보가 시트마다 나뉘어 있을 수 있어 subjects는 전체 시트를 합친
 * 최종 후보 목록이다. 반면 화면에서 "시트별로 훑어보며 여러 과목을 한 번에 고르는" 용도로는
 * 시트별 과목 목록이 따로 필요해서, sheetReports[].subjectNames에 시트별 과목명(정렬됨)을
 * 같이 담는다 — 과목 하나가 여러 시트의 subjectNames에 중복으로 나타날 수 있다(정상).
 */
export async function parseTextbookCatalogXlsx(file) {
  const XLSX = await import('xlsx')
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array' })

  const bySubject = new Map() // subjectKey -> Map(candidateKey -> candidate)
  // 같은 subjectKey로 묶인 표기 중 대표로 쓸 이름 — 공백이 가장 적은 쪽을 고른다(잘못
  // 끼워넣은 공백이 없을 가능성이 높은 쪽).
  const canonicalName = new Map() // subjectKey -> { name, spaces }
  const sheetReports = []

  wb.SheetNames.forEach((sheetName) => {
    // raw:false — 가격 등을 원본 엑셀 화면과 같은 표시 문자열("17,000")로 얻는다.
    // 기본값(raw:true)이면 숫자로 변환돼 쉼표 서식이 사라진다.
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '', raw: false })
    const headerIdx = findHeaderRow(rows)
    if (headerIdx < 0) {
      sheetReports.push({ sheetName, used: false, rows: 0, subjectNames: [] })
      return
    }

    const headers = (rows[headerIdx] || []).map(norm)
    const find = (kw) => headers.findIndex((h) => h.includes(kw))
    const cSchool = find('학교급')
    const cSubject = find('교과목명') >= 0 ? find('교과목명') : find('도서명')
    const cPublisher = find('출판사')
    const cAuthor = find('저자')
    const cPrice = find('가격')
    if (cSubject < 0 || cPublisher < 0) {
      sheetReports.push({ sheetName, used: false, rows: 0, subjectNames: [] })
      return
    }

    let used = 0
    const sheetKeys = new Set()
    rows.slice(headerIdx + 1).forEach((r) => {
      const school = String(r[cSchool] ?? '')
      if (!school.includes('고등')) return
      const rawName = String(r[cSubject] ?? '').trim()
      const publisher = String(r[cPublisher] ?? '').trim()
      if (!rawName || !publisher) return

      const author = cAuthor >= 0 ? String(r[cAuthor] ?? '').trim() : ''
      const price = cPrice >= 0 ? String(r[cPrice] ?? '').trim() : ''

      const key = subjectKey(rawName)
      const spaces = (rawName.match(/\s/g) || []).length
      if (!canonicalName.has(key) || spaces < canonicalName.get(key).spaces) {
        canonicalName.set(key, { name: rawName, spaces })
      }

      if (!bySubject.has(key)) bySubject.set(key, new Map())
      const candidates = bySubject.get(key)
      const cKey = `${publisher}|${author}|${price}`
      if (!candidates.has(cKey)) candidates.set(cKey, { publisher, author, price })
      sheetKeys.add(key)
      used += 1
    })
    // subjectNames는 아래에서 canonicalName이 전체 시트를 다 훑은 뒤에야 확정되므로,
    // 일단 키만 담아두고 마지막에 이름으로 바꾼다.
    sheetReports.push({ sheetName, used: true, rows: used, _keys: sheetKeys })
  })

  const subjects = {}
  let candidateCount = 0
  ;[...bySubject.entries()].forEach(([key, candidates]) => {
    const name = canonicalName.get(key)?.name || key
    const list = [...candidates.values()].sort((a, b) => a.publisher.localeCompare(b.publisher, 'ko'))
    subjects[name] = list
    candidateCount += list.length
  })

  sheetReports.forEach((r) => {
    r.subjectNames = [...(r._keys || [])]
      .map((k) => canonicalName.get(k)?.name || k)
      .sort((a, b) => a.localeCompare(b, 'ko'))
    delete r._keys
  })

  return {
    subjects,
    subjectCount: Object.keys(subjects).length,
    candidateCount,
    sheetReports,
  }
}

const catalogDoc = (schoolId) => doc(db, ...schoolPath(schoolId, COL.TEXTBOOK_CATALOG), 'current')

export function subscribeTextbookCatalog(schoolId, cb, onError) {
  return onSnapshot(catalogDoc(schoolId), (snap) => cb(snap.exists() ? snap.data() : null), onError)
}

export async function getTextbookCatalogOnce(schoolId) {
  const snap = await getDoc(catalogDoc(schoolId))
  return snap.exists() ? snap.data() : null
}

export async function saveTextbookCatalog(schoolId, { subjects, subjectCount, candidateCount, sheetReports, sourceFileName }, uid, uidName) {
  await setDoc(catalogDoc(schoolId), {
    subjects,
    subjectCount,
    candidateCount,
    sheetReports,
    sourceFileName,
    importedBy: uid,
    importedByName: uidName || '',
    importedAt: serverTimestamp(),
  })
}
