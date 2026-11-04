/**
 * 선택과목 분반 배정(smart-class-flow) 순수 로직.
 *
 * 용어
 * - 칸막이(block): 수강신청 파일 2행의 C·D 같은 선택 묶음. "C에서 4과목, D에서 1과목"처럼 고르는 범위일 뿐 시간과는 무관하다.
 * - 그룹(slot): A~E처럼 실제로 수업이 동시에 열리는 시간 묶음. 보통 학생 한 명의 선택 과목 수 = 그룹 수.
 *   그룹을 과목 수보다 더 열면(공강 그룹) 학생마다 남는 그룹이 공강이 된다 — freeMax로 그룹당 공강 인원 상한.
 * - 분반(section): 과목 s의 k번째 반. 분반마다 그룹 하나에 놓인다(slotBySection[k]).
 *
 * 프로젝트(Firestore 문서와 같은 모양 — 중첩 배열을 쓰지 않는다)
 * {
 *   title, year, grade, semester, termLabel, sourceFileName,
 *   slots: ['A','B','C','D','E'], rooms: [9, 9, 8, 8, 8] (그룹별 교실 수 = 그룹에 열 수 있는 최대 분반 수, null은 제한 없음), maxSize: 30,
 *   subjects: [{ name, block, sections, maxSize|null, sectionsManual, distinctSlots, slotBySection: [t|null], lockedSections: [bool], locked }],
 *   requests:   { [studentId]: [subjectIdx, ...] },         // 오름차순
 *   assignment: { [studentId]: [sectionIdx|null, ...] },    // requests와 같은 순서
 *   lockedStudents: [studentId], manualStudents: [studentId],
 *   excluded: [{ id, reason }],
 *   entryYear, folder, names: { [studentId]: 이름 }, studentInfo: { [studentId]: [원본 정보 열 값] }, infoCols: [col],
 *   solveLogs: [{ id, title, at, byName, summary, ok, settings, result, lines }],   // 배정 기록(최근 5회)
 *   headerRows: [{ cells: [...] }], headerMerges: [{ s:{r,c}, e:{r,c} }], subjectCols: [col, ...],
 * }
 */

export const SLOT_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export function slotLetters(n) {
  return SLOT_LETTERS.slice(0, n).split('')
}

const isPicked = (v) => {
  if (v === null || v === undefined) return false
  const s = String(v).trim()
  return s !== '' && s !== '0'
}

const cellText = (v) => (v === null || v === undefined ? '' : String(v).trim())

/** 엑셀 열 이름(0 → A, 26 → AA) */
export function colName(c) {
  let s = ''
  let n = c + 1
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26) }
  return s
}

// 머리 영역 이름표 — 과목명·칸막이·과목코드·학기·이름·학번 칸
const LABELS = {
  subject: /^(과목|과목명|교과목|교과목명)$/,
  block: /^(선택\s*그룹|그룹|칸막이|묶음|선택\s*군|교과\s*군|선택\s*묶음)$/,
  code: /(고유\s*번호|과목\s*코드|과목\s*번호|코드)$/,
  term: /^(학기|학년\s*-\s*학기)$/,
  name: /^(이름|성명|학생\s*명|학생\s*이름)$/,
  id: /^(학번|\d\s*학년)$/,
}
const isLabel = (t) => Object.values(LABELS).some((re) => re.test(t))
/** 학번 값: 4~6자리 숫자이고 0이 아님 */
const isIdVal = (v) => /^\d{4,6}$/.test(cellText(v)) && Number(cellText(v)) > 0
/** 신청 칸 값: 비었거나 짧은 표시(1·0·O·V 등). 학번·이름·코드는 아니다 */
const isPickVal = (v) => { const t = cellText(v); return t === '' || (t.length <= 2 && !/^\d{4,}$/.test(t)) }
const isCodeLike = (t) => /^[A-Za-z0-9-]{6,}$/.test(t) && /\d/.test(t) && !/^\d{4,6}$/.test(t)
const blankRow = (r) => !r || r.every((v) => !cellText(v))

/**
 * 수강신청 엑셀의 모양을 알아낸다 — 학생 행 시작, 학번 열(여러 개면 행마다 0 아닌 값), 이름 열,
 * 과목명·칸막이·과목코드 행, 과목 열. 양식이 학교·해마다 달라도 이름표(과목·선택그룹·고유번호·이름·n학년)와
 * 값 모양(학번 숫자, 0/1 칸)으로 찾는다. overrides로 사람이 고친 값을 우선한다
 * (idCol·nameCol·subjectRow·blockRow·codeRow·firstCol·lastCol, null = 없음).
 * @returns {{ dataStart, idCols, nameCol, subjectRow, blockRow, codeRow, subjectCols, infoCols, width, guessed: string[] }}
 */
export function detectEnrollmentLayout(rows, merges = [], overrides = {}) {
  const width = Math.max(0, ...rows.map((r) => (r ? r.length : 0)))
  const at = (r, c) => rows[r]?.[c]
  const has = (k) => overrides[k] !== undefined

  // 학생 행 시작: 학번 값이 있고, 바로 아래 행에도 학번이 있음(또는 그 아래가 모두 빈 행) — 머리의 숫자 한 칸과 구별
  const hasId = (r) => !!rows[r] && rows[r].some(isIdVal)
  let dataStart = -1
  for (let r = 0; r < rows.length; r++) {
    if (hasId(r) && (r + 1 >= rows.length || hasId(r + 1) || rows.slice(r + 1).every(blankRow))) { dataStart = r; break }
  }
  if (dataStart < 1) throw new Error('학번(숫자)으로 시작하는 학생 행을 찾지 못했습니다.')
  const dataRows = []
  for (let r = dataStart; r < rows.length; r++) if (!blankRow(rows[r])) dataRows.push(r)

  // 머리 이름표(병합 칸은 왼쪽 위 칸에만 값이 있다)
  const labels = []
  for (let r = 0; r < dataStart; r++) {
    for (let c = 0; c < width; c++) {
      const t = cellText(at(r, c))
      if (!t) continue
      for (const [kind, re] of Object.entries(LABELS)) if (re.test(t)) labels.push({ kind, r, c })
    }
  }
  const labelOf = (kind) => labels.find((l) => l.kind === kind)
  const guessed = []

  // 학번 열: 값이 학번·0·빈칸뿐이고, 학번 값이 30% 이상이거나 학번 이름표(학번·n학년)가 붙은 열
  let idCols
  if (has('idCol') && overrides.idCol !== null) idCols = [Number(overrides.idCol)]
  else {
    const labeled = new Set(labels.filter((l) => l.kind === 'id').map((l) => l.c))
    idCols = []
    for (let c = 0; c < width; c++) {
      const vals = dataRows.map((r) => at(r, c))
      if (!vals.every((v) => isIdVal(v) || cellText(v) === '' || cellText(v) === '0')) continue
      const n = vals.filter(isIdVal).length
      if ((n > 0 && n >= dataRows.length * 0.3) || labeled.has(c)) idCols.push(c)
    }
    if (!idCols.some((c) => dataRows.some((r) => isIdVal(at(r, c))))) throw new Error('학번 열을 찾지 못했습니다.')
  }

  // 이름 열: 이름표, 없으면 한글 2~5자가 대부분인 열
  let nameCol = null
  if (has('nameCol')) nameCol = overrides.nameCol === null ? null : Number(overrides.nameCol)
  else {
    const l = labelOf('name')
    if (l) nameCol = l.c
    else {
      for (let c = 0; c < width && nameCol === null; c++) {
        if (idCols.includes(c)) continue
        const vals = dataRows.map((r) => cellText(at(r, c))).filter(Boolean)
        if (vals.length >= dataRows.length * 0.7 && vals.filter((t) => /^[가-힣]{2,5}$/.test(t)).length >= vals.length * 0.8) nameCol = c
      }
      if (nameCol !== null) guessed.push('이름 열')
    }
  }

  const candidate = (c) => !idCols.includes(c) && c !== nameCol && dataRows.every((r) => isPickVal(at(r, c)))
  const candTexts = (r) => {
    const out = []
    for (let c = 0; c < width; c++) if (candidate(c) && cellText(at(r, c))) out.push(cellText(at(r, c)))
    return out
  }

  // 과목코드 행·과목명 행·칸막이 행
  let codeRow = has('codeRow') ? overrides.codeRow : (labelOf('code')?.r ?? null)
  let subjectRow = has('subjectRow') ? overrides.subjectRow : (labelOf('subject')?.r ?? null)
  if (subjectRow === null || subjectRow === undefined) {
    // 이름표가 없으면 학생 행 위로 올라가며, 과목코드 모양 행은 건너뛴 첫 글자 행
    subjectRow = null
    for (let r = dataStart - 1; r >= 0; r--) {
      const texts = candTexts(r)
      if (!texts.length) continue
      if (texts.filter(isCodeLike).length >= texts.length * 0.7) { if (codeRow === null && !has('codeRow')) codeRow = r; continue }
      subjectRow = r
      break
    }
    if (subjectRow === null) throw new Error('과목명 행을 찾지 못했습니다.')
  }
  let blockRow = has('blockRow') ? overrides.blockRow : (labelOf('block')?.r ?? null)
  if (!has('blockRow') && blockRow === null && subjectRow > 0) {
    const texts = candTexts(subjectRow - 1)
    // 학기(2-1)만 있는 행은 칸막이가 아니다
    if (texts.length && !texts.every((t) => /^\d-\d$/.test(t))) blockRow = subjectRow - 1
  }

  // 과목 열: 과목명 행에 이름표 아닌 글자 + 학생 값이 0/1 모양
  const subjectCols = []
  const from = overrides.firstCol ?? 0
  const to = overrides.lastCol ?? width - 1
  for (let c = from; c <= to; c++) {
    const t = cellText(at(subjectRow, c))
    if (t && !isLabel(t) && candidate(c)) subjectCols.push(c)
  }
  if (!subjectCols.length) throw new Error('과목 열을 찾지 못했습니다.')

  // 학생 정보 열(원본 양식으로 되돌릴 때 다시 채운다): 과목 열이 아니고 값이 있는 열
  const sub = new Set(subjectCols)
  const infoCols = []
  for (let c = 0; c < width; c++) if (!sub.has(c) && dataRows.some((r) => cellText(at(r, c)))) infoCols.push(c)

  return { dataStart, idCols, nameCol, subjectRow, blockRow, codeRow, subjectCols, infoCols, width, guessed }
}

/**
 * 알아낸 모양(layout)대로 학생·과목을 뽑는다.
 * rows: XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) 결과, merges: ws['!merges']
 */
export function extractEnrollment(rows, merges, layout) {
  const { dataStart, idCols, nameCol, subjectRow, blockRow, codeRow, subjectCols, infoCols } = layout
  const warnings = []
  const header = rows[subjectRow] || []

  // 칸막이: 병합 범위 → 그 칸 값, 병합 안 된 칸 → 자기 값, 빈 칸 → 왼쪽 칸막이 이어받기
  const colBlock = {}
  if (blockRow !== null && blockRow !== undefined && blockRow >= 0) {
    for (const m of merges || []) {
      if (m.s.r === blockRow) {
        const name = cellText(rows[blockRow]?.[m.s.c])
        if (name && !isLabel(name)) for (let c = m.s.c; c <= m.e.c; c++) colBlock[c] = name
      }
    }
    for (const c of subjectCols) {
      const t = cellText(rows[blockRow]?.[c])
      if (!colBlock[c] && t && !isLabel(t)) colBlock[c] = t
    }
  }
  let last = null
  for (const c of subjectCols) {
    if (colBlock[c]) last = colBlock[c]
    else colBlock[c] = last
  }
  const subjects = subjectCols.map((c) => {
    const s = { name: cellText(header[c]), block: colBlock[c] || '전체', col: c }
    const code = codeRow !== null && codeRow !== undefined ? cellText(rows[codeRow]?.[c]) : ''
    if (code) s.code = code
    return s
  })
  const dupNames = subjects.map((s) => s.name).filter((n, i, a) => a.indexOf(n) !== i)
  if (dupNames.length) throw new Error(`과목명이 중복됩니다: ${[...new Set(dupNames)].join(', ')}`)

  const students = []
  const excluded = []
  const names = {}
  const info = {}
  const seen = new Set()
  for (let r = dataStart; r < rows.length; r++) {
    const row = rows[r]
    if (blankRow(row)) continue
    const idc = idCols.find((c) => isIdVal(row[c]))
    if (idc === undefined) {
      const n = nameCol !== null ? cellText(row[nameCol]) : ''
      if (n || subjectCols.some((c) => isPicked(row[c]))) warnings.push(`${r + 1}행${n ? `(${n})` : ''}: 학번이 없어 건너뛰었습니다.`)
      continue
    }
    const id = cellText(row[idc])
    if (seen.has(id)) { warnings.push(`학번 ${id}가 두 번 나옵니다 — 뒤의 행은 무시했습니다.`); continue }
    seen.add(id)
    if (nameCol !== null && cellText(row[nameCol])) names[id] = cellText(row[nameCol])
    if (infoCols.length) info[id] = infoCols.map((c) => (row[c] === undefined ? null : row[c]))
    const picks = []
    subjectCols.forEach((c, i) => { if (isPicked(row[c])) picks.push(i) })
    if (!picks.length) { excluded.push({ id, reason: '신청 과목 없음' }); continue }
    students.push({ id, subjects: picks })
  }

  // 선택 수 = 그룹 수. 가장 흔한 값을 쓰고, 다른 학생은 경고(적게 고른 학생은 그대로 배정 가능, 많이 고르면 불가)
  const freq = {}
  for (const s of students) freq[s.subjects.length] = (freq[s.subjects.length] || 0) + 1
  const slotCount = Number(Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] || 0)
  for (const s of students) {
    if (s.subjects.length !== slotCount) {
      warnings.push(`학번 ${s.id}: 선택 과목이 ${s.subjects.length}개입니다(대부분 ${slotCount}개).`)
    }
  }
  // 칸막이별 선택 수도 확인
  const blocks = [...new Set(subjects.map((s) => s.block))]
  for (const b of blocks) {
    const per = {}
    for (const s of students) {
      const n = s.subjects.filter((i) => subjects[i].block === b).length
      per[n] = (per[n] || 0) + 1
    }
    if (Object.keys(per).length > 1) {
      const desc = Object.entries(per).map(([n, c]) => `${n}과목 ${c}명`).join(', ')
      warnings.push(`칸막이 ${b}: 학생마다 고른 수가 다릅니다(${desc}).`)
    }
  }

  const headerText = rows.slice(0, dataStart).flat().map(cellText)
  const termLabel = headerText.find((t) => /^\d-\d$/.test(t)) || ''

  return {
    subjects,
    students,
    excluded,
    warnings,
    slotCount,
    termLabel,
    names,
    info,
    infoCols,
    layout,
    headerRows: rows.slice(0, dataStart).map((r) => ({ cells: (r || []).map((v) => (v === undefined ? null : v)) })),
    headerMerges: (merges || []).filter((m) => m.s.r < dataStart).map((m) => ({ s: { ...m.s }, e: { ...m.e } })),
    subjectCols,
  }
}

/** 수강신청 일괄등록 시트(2차원 배열)를 읽는다 — 모양 알아내기 + 뽑기. overrides는 detectEnrollmentLayout 참고 */
export function parseEnrollmentRows(rows, merges = [], overrides = {}) {
  return extractEnrollment(rows, merges, detectEnrollmentLayout(rows, merges, overrides))
}

/** 분반별 최대 인원으로 분반 수 계산(올림). 같은 과목 다른 그룹이면 그룹 수를 넘지 않는다. 예: 50명, 최대 35명 → 2분반 */
export function suggestSections(demand, maxSize, maxSections = Infinity) {
  if (!demand) return 0
  const m = Number(maxSize) > 0 ? Number(maxSize) : DEFAULT_MAX_SIZE
  return Math.min(Math.max(1, Math.ceil(demand / m)), maxSections)
}

export const DEFAULT_MAX_SIZE = 30

/** 그룹별 교실 수 배열(옛 문서의 숫자 하나도 받는다). null = 제한 없음 */
export function roomsOf(project) {
  const r = project.rooms
  if (Array.isArray(r)) return project.slots.map((_, t) => (r[t] === undefined || r[t] === '' ? null : r[t]))
  if (typeof r === 'number') return project.slots.map(() => r)
  return project.slots.map(() => null)
}

/** 불러온 문서를 지금 모양으로 맞춘다(목표 인원 → 최대 인원, 교실 수 숫자 → 그룹별 배열) */
export function normalizeProject(p) {
  return {
    ...p,
    maxSize: p.maxSize ?? p.defaultTarget ?? DEFAULT_MAX_SIZE,
    maxMode: p.maxMode || 'hard',
    minSize: p.minSize ?? null,
    minMode: p.minMode || 'soft',
    freeMax: p.freeMax ?? null,
    // 그룹별 교실 수 제한은 화면에서 뺐다(2026-11-03, 실제로 필요 없음) — 예전 값이 남아 해를 막지 않도록 비운다
    rooms: p.slots.map(() => null),
    excluded: p.excluded || [],
    lockedStudents: p.lockedStudents || [],
    manualStudents: p.manualStudents || [],
    separations: p.separations || [],
    names: p.names || {},
    solveLogs: p.solveLogs || [],
    subjects: p.subjects.map((s) => ({
      ...s,
      maxSize: s.maxSize ?? s.target ?? null,
      sectionsManual: !!s.sectionsManual,
    })),
  }
}

/** 분반 수를 최대 인원으로 다시 계산. 직접 고친 과목은 force일 때만, 고정 과목은 건드리지 않는다 */
export function recalcSections(project, { force = false, only = null } = {}) {
  const demand = demandOf(project)
  const T = project.slots.length
  let p = project
  project.subjects.forEach((subj, s) => {
    if (only !== null && only !== s) return
    if (subj.locked) return
    if (subj.sectionsManual && !force) return
    const n = suggestSections(demand[s], subj.maxSize || project.maxSize, subj.distinctSlots ? T : Infinity)
    p = resizeSections(p, s, n)
    if (subj.sectionsManual) p = updateSubject(p, s, { sectionsManual: false })
  })
  return p
}

/**
 * 파일명·학기 표시로 작업 정보를 미리 채운다.
 *   입학년도: 파일명의 "2026입학" / 학년·학기: "2-1" / 학년도 = 입학년도 + 학년 − 1
 *   예) 2025입학생 3-1 → 2027학년도 3학년 1학기, 2026입학생 2-1 → 2027학년도 2학년 1학기
 */
export function suggestWorkInfo(fileName = '', termLabel = '') {
  const m = String(fileName).match(/(20\d{2})\s*(학년도\s*)?입학/)
  const entryYear = m ? Number(m[1]) : null
  const [g, sem] = String(termLabel || '').split('-').map(Number)
  const grade = g || null
  const semester = sem || null
  const year = entryYear && grade ? entryYear + grade - 1 : null
  const info = { entryYear, grade, semester, year }
  return { ...info, title: defaultTitle(info), folder: defaultFolder(info) }
}

/** 학년도 = 입학년도 + 학년 − 1 (둘 중 하나라도 없으면 null) */
export function yearOf(entryYear, grade) {
  return Number(entryYear) && Number(grade) ? Number(entryYear) + Number(grade) - 1 : null
}

/** 입학년도 = 학년도 − 학년 + 1 */
export function entryYearOf(year, grade) {
  return Number(year) && Number(grade) ? Number(year) - Number(grade) + 1 : null
}

export function defaultTitle({ year, grade, semester }) {
  const t = [year && `${year}학년도`, grade && `${grade}학년`, semester && `${semester}학기`].filter(Boolean).join(' ')
  return t ? `${t} 선택과목 분반` : '선택과목 분반'
}

export function defaultFolder({ entryYear, year, grade }) {
  const e = entryYear || entryYearOf(year, grade)
  return e ? `${e}입학생` : '분류 없음'
}

/** 작업 묶음 이름(옛 문서는 학년도·학년으로 입학년도를 계산해 보인다) */
export function folderOf(p) {
  return p?.folder || defaultFolder({ entryYear: p?.entryYear, year: p?.year, grade: p?.grade })
}

export function createProject(parsed, {
  title = '', year = null, maxSize = DEFAULT_MAX_SIZE, sourceFileName = '',
  entryYear = null, grade = undefined, semester = undefined, folder = '',
} = {}) {
  const slots = slotLetters(parsed.slotCount)
  const requests = {}
  const assignment = {}
  for (const st of parsed.students) {
    requests[st.id] = [...st.subjects].sort((a, b) => a - b)
    assignment[st.id] = requests[st.id].map(() => null)
  }
  const demand = parsed.subjects.map((_, i) => parsed.students.filter((s) => s.subjects.includes(i)).length)
  const subjects = parsed.subjects.map((s, i) => {
    const sections = suggestSections(demand[i], maxSize, slots.length)
    const out = {
      name: s.name, block: s.block, sections, maxSize: null, sectionsManual: false, distinctSlots: true,
      slotBySection: Array(sections).fill(null), lockedSections: Array(sections).fill(false), locked: false,
    }
    if (s.code) out.code = s.code
    return out
  })
  const [g, sem] = (parsed.termLabel || '').split('-').map(Number)
  const gr = grade === undefined ? (g || null) : (Number(grade) || null)
  const se = semester === undefined ? (sem || null) : (Number(semester) || null)
  const ey = Number(entryYear) || entryYearOf(year, gr)
  return {
    title, year, grade: gr, semester: se, termLabel: parsed.termLabel, sourceFileName,
    entryYear: ey || null, folder: folder || defaultFolder({ entryYear: ey, year, grade: gr }),
    slots, rooms: slots.map(() => null),
    maxSize, maxMode: 'hard', minSize: null, minMode: 'soft', subjects, requests, assignment, separations: [],
    lockedStudents: [], manualStudents: [], excluded: parsed.excluded,
    names: parsed.names || {},
    studentInfo: parsed.info || {},
    infoCols: parsed.infoCols || [],
    solveLogs: [],
    warnings: parsed.warnings,
    headerRows: parsed.headerRows, headerMerges: parsed.headerMerges, subjectCols: parsed.subjectCols,
  }
}

// ── 1단계: 신청 데이터 고치기 ────────────────────────────────────────────


export function setStudentPicks(project, sid, picks) {
  const sorted = [...new Set(picks)].sort((a, b) => a - b)
  const requests = { ...project.requests }
  const assignment = { ...project.assignment }
  let excluded = (project.excluded || []).filter((x) => x.id !== sid)
  if (!sorted.length) {
    delete requests[sid]
    delete assignment[sid]
    excluded = [...excluded, { id: sid, reason: '신청 과목 없음' }]
  } else {
    const prevSubs = project.requests[sid] || []
    const prevA = project.assignment[sid] || []
    requests[sid] = sorted
    assignment[sid] = sorted.map((s) => {
      const j = prevSubs.indexOf(s)
      return j >= 0 ? prevA[j] ?? null : null
    })
  }
  return { ...project, requests, assignment, excluded }
}

export function toggleStudentPick(project, sid, s) {
  const cur = project.requests[sid] || []
  return setStudentPicks(project, sid, cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s])
}

export function addStudent(project, sid) {
  const id = String(sid).trim()
  if (!id || project.requests[id] || (project.excluded || []).some((x) => x.id === id)) return project
  return { ...project, excluded: [...(project.excluded || []), { id, reason: '신청 과목 없음' }] }
}

export function removeStudent(project, sid) {
  const requests = { ...project.requests }
  const assignment = { ...project.assignment }
  delete requests[sid]
  delete assignment[sid]
  return {
    ...project, requests, assignment,
    excluded: (project.excluded || []).filter((x) => x.id !== sid),
    lockedStudents: (project.lockedStudents || []).filter((x) => x !== sid),
    manualStudents: (project.manualStudents || []).filter((x) => x !== sid),
    separations: (project.separations || [])
      .map((r) => ({ ...r, students: r.students.filter((x) => x !== sid) }))
      .filter((r) => r.students.length >= 2),
  }
}

/** 전체 학번(배정 대상 + 제외) 정렬 */
export function allStudentIds(project) {
  return [...Object.keys(project.requests), ...(project.excluded || []).map((x) => x.id)].sort()
}

export function studentIds(project) {
  return Object.keys(project.requests).sort()
}

export function demandOf(project) {
  const d = project.subjects.map(() => 0)
  for (const subs of Object.values(project.requests)) for (const s of subs) d[s]++
  return d
}

/** sizes[s][k] = 분반 인원 */
export function sectionSizes(project) {
  const sizes = project.subjects.map((s) => Array(s.sections).fill(0))
  for (const [sid, subs] of Object.entries(project.requests)) {
    const a = project.assignment[sid] || []
    subs.forEach((s, j) => { const k = a[j]; if (k !== null && k !== undefined && sizes[s][k] !== undefined) sizes[s][k]++ })
  }
  return sizes
}

export function spreadOf(arr) {
  if (!arr.length) return 0
  return Math.max(...arr) - Math.min(...arr)
}

/** 분반 표시 기호: 그룹 글자. 같은 과목이 한 그룹에 여럿이면 A1, A2. 그룹 미정이면 '1반' */
export function sectionLabel(project, s, k) {
  const subj = project.subjects[s]
  const t = subj.slotBySection[k]
  if (t === null || t === undefined) return `${k + 1}반`
  const letter = project.slots[t]
  const same = subj.slotBySection.map((x, i) => (x === t ? i : -1)).filter((i) => i >= 0)
  return same.length > 1 ? `${letter}${same.indexOf(k) + 1}` : letter
}

/** 학생 한 명의 과목별 배정 */
export function studentSchedule(project, sid) {
  const subs = project.requests[sid] || []
  const a = project.assignment[sid] || []
  return subs.map((s, j) => {
    const k = a[j] ?? null
    const slot = k === null ? null : project.subjects[s].slotBySection[k] ?? null
    return { s, j, k, slot, label: k === null ? null : sectionLabel(project, s, k) }
  })
}

/** 전체 검사: 미배정·시간 충돌·교실 초과·같은 과목 같은 그룹 */
export function validateProject(project) {
  const unassigned = []
  const conflicts = []
  for (const sid of Object.keys(project.requests)) {
    const sch = studentSchedule(project, sid)
    if (sch.some((x) => x.k === null || x.slot === null)) { unassigned.push(sid); continue }
    const ts = sch.map((x) => x.slot)
    if (new Set(ts).size !== ts.length) conflicts.push(sid)
  }
  const used = project.slots.map(() => 0)
  project.subjects.forEach((subj) => subj.slotBySection.forEach((t) => { if (t !== null && t !== undefined) used[t]++ }))
  const rooms = roomsOf(project)
  const roomOverflow = used.map((n, t) => ({ slot: t, used: n, rooms: rooms[t] }))
    .filter((x) => x.rooms !== null && x.used > x.rooms)
  const sameSlot = []
  project.subjects.forEach((subj, s) => {
    if (!subj.distinctSlots) return
    const ts = subj.slotBySection.filter((t) => t !== null && t !== undefined)
    if (new Set(ts).size !== ts.length) sameSlot.push(s)
  })
  const sep = separationIssues(project)
  const free = freeCounts(project)
  const freeOver = isBlank(project.freeMax) || !hasFree(project)
    ? [] : free.map((n, t) => ({ slot: t, free: n, limit: Number(project.freeMax) })).filter((x) => x.free > x.limit)
  return {
    unassigned, conflicts, roomOverflow, sameSlot, slotUse: used, sizeIssues: sizeIssues(project), freeCounts: free, freeOver,
    separationViolations: sep.violations, separationUnsplittable: sep.unsplittable,
    ok: !unassigned.length && !conflicts.length && !roomOverflow.length && !sameSlot.length && !sep.violations.length,
  }
}

/** 학생 sid의 과목 s를 옮길 수 있는 분반 목록과 막히는 이유 */
export function moveOptions(project, sid, s) {
  const sch = studentSchedule(project, sid)
  const me = sch.find((x) => x.s === s)
  if (!me) return []
  const sizes = sectionSizes(project)[s]
  const subj = project.subjects[s]
  const partners = separationPartners(project, sid)
  return subj.slotBySection.map((t, k) => {
    const clash = t === null ? null : sch.find((x) => x.s !== s && x.slot === t)
    const together = [...partners].find((pid) => sectionOf(project, pid, s) === k)
    let reason = null
    let swap = null
    if (t === null) reason = '그룹 미정'
    else if (together) reason = `분리 대상 ${together}과(와) 같은 분반`
    else if (clash) {
      reason = `${project.subjects[clash.s].name}과(와) 같은 그룹`
      // 겹치는 과목을 내가 비우는 그룹으로 옮길 수 있으면 맞바꾸기
      if (me.slot !== null && !project.subjects[clash.s].locked) {
        const k2 = project.subjects[clash.s].slotBySection.findIndex((x) => x === me.slot)
        if (k2 >= 0) swap = { s: clash.s, k: k2, label: sectionLabel(project, clash.s, k2), name: project.subjects[clash.s].name }
      }
    }
    return {
      k, slot: t, label: sectionLabel(project, s, k), size: sizes[k],
      current: me.k === k, ok: !reason, reason, swap,
    }
  })
}

const withoutId = (arr, id) => (arr || []).filter((x) => x !== id)

/** 학생 sid의 과목 s를 분반 k로 (수동 변경 표시) */
export function setStudentSection(project, sid, s, k) {
  const subs = project.requests[sid]
  const j = subs.indexOf(s)
  if (j < 0) return project
  const a = [...(project.assignment[sid] || subs.map(() => null))]
  a[j] = k
  return {
    ...project,
    assignment: { ...project.assignment, [sid]: a },
    manualStudents: [...withoutId(project.manualStudents, sid), sid],
  }
}

export function toggleStudentLock(project, sid) {
  const locked = (project.lockedStudents || []).includes(sid)
  return { ...project, lockedStudents: locked ? withoutId(project.lockedStudents, sid) : [...(project.lockedStudents || []), sid] }
}

export function updateSubject(project, s, patch) {
  const subjects = project.subjects.map((x, i) => (i === s ? { ...x, ...patch } : x))
  return { ...project, subjects }
}

/** 분반 수 변경 — 늘어난 분반은 그룹 미정, 사라진 분반의 학생은 미배정 */
export function resizeSections(project, s, n) {
  const subj = project.subjects[s]
  const count = Math.max(0, Math.floor(Number(n) || 0))
  if (count === subj.sections) return project
  const slotBySection = Array.from({ length: count }, (_, k) => subj.slotBySection[k] ?? null)
  const lockedSections = Array.from({ length: count }, (_, k) => subj.lockedSections[k] ?? false)
  const assignment = { ...project.assignment }
  for (const [sid, subs] of Object.entries(project.requests)) {
    const j = subs.indexOf(s)
    if (j < 0) continue
    const k = assignment[sid]?.[j]
    if (k !== null && k !== undefined && k >= count) {
      const a = [...assignment[sid]]; a[j] = null; assignment[sid] = a
    }
  }
  return { ...updateSubject(project, s, { sections: count, slotBySection, lockedSections }), assignment }
}

/** 분반 k의 그룹 변경(드래그) */
export function moveSectionSlot(project, s, k, t) {
  const subj = project.subjects[s]
  const slotBySection = [...subj.slotBySection]
  slotBySection[k] = t
  return updateSubject(project, s, { slotBySection })
}

export function toggleSectionLock(project, s, k) {
  const subj = project.subjects[s]
  const lockedSections = [...subj.lockedSections]
  lockedSections[k] = !lockedSections[k]
  return updateSubject(project, s, { lockedSections })
}

/**
 * 솔버 입력. keepPrevious면 현재 배정(그룹)을 기준으로 바뀌는 학생을 줄인다.
 * 고정: 분반 그룹 고정(lockedSections, 과목 고정이면 전부), 학생 고정(lockedStudents) + 과목 고정 과목의 학생 분반.
 */
export function toSolverInput(project, { keepPrevious = false, timeLimit = 30, withHint = true } = {}) {
  const names = project.subjects.map((s) => s.name)
  const subjects = project.subjects.map((subj) => {
    const sectionSlots = {}
    subj.slotBySection.forEach((t, k) => {
      if (t !== null && t !== undefined && (subj.locked || subj.lockedSections[k])) sectionSlots[k] = t
    })
    return {
      name: subj.name, block: subj.block, sections: subj.sections, distinctSlots: subj.distinctSlots, sectionSlots,
      maxSize: subj.maxSize || project.maxSize || null, minSize: subj.minSize || project.minSize || null,
    }
  })
  const students = Object.entries(project.requests).map(([id, subs]) => ({ id, subjects: subs.map((s) => names[s]) }))
  const lockedStudentSet = new Set(project.lockedStudents || [])
  const lockedAssignments = {}
  const previous = {}
  for (const [sid, subs] of Object.entries(project.requests)) {
    const a = project.assignment[sid] || []
    subs.forEach((s, j) => {
      const k = a[j]
      if (k === null || k === undefined) return
      const subj = project.subjects[s]
      if (lockedStudentSet.has(sid) || subj.locked) {
        lockedAssignments[sid] = { ...(lockedAssignments[sid] || {}), [names[s]]: k }
      }
      const t = subj.slotBySection[k]
      if (keepPrevious && t !== null && t !== undefined) previous[sid] = { ...(previous[sid] || {}), [names[s]]: t }
    })
  }
  // 힌트: 그룹이 모두 정해진 지금 배정을 솔버의 출발점으로(그보다 좋은 해부터 찾게)
  let hint = null
  const placed = project.subjects.every((subj) => subj.slotBySection.every((t) => t !== null && t !== undefined))
  const assignedAll = Object.entries(project.requests).every(([sid, subs]) => (project.assignment[sid] || []).length === subs.length &&
    project.assignment[sid].every((k) => k !== null && k !== undefined))
  if (withHint && placed) {
    hint = { sections: Object.fromEntries(project.subjects.map((subj) => [subj.name, [...subj.slotBySection]])), assignments: {} }
    if (assignedAll) {
      for (const [sid, subs] of Object.entries(project.requests)) {
        hint.assignments[sid] = Object.fromEntries(subs.map((s, j) => [names[s], project.assignment[sid][j]]))
      }
    }
  }
  return {
    slots: project.slots, rooms: roomsOf(project), subjects, students,
    lockedAssignments, previous: keepPrevious ? previous : null, timeLimit, hint,
    maxMode: project.maxMode || 'off', minMode: project.minMode || 'off',
    freeMax: hasFree(project) && !isBlank(project.freeMax) ? Number(project.freeMax) : null,
    separations: (project.separations || []).map((r) => r.students).filter((x) => x.length >= 2),
  }
}

/** 균형 점수 {worst: 분반 편차 최대, sum: 편차 합계} — 작을수록 좋다 */
export function balanceScore(project) {
  const sz = sectionSizes(project).filter((x) => x.length > 1).map(spreadOf)
  // 꼭 지킴 조건(최대·최소 인원, 분리 규칙)을 어긴 수와 가능하면 조건을 넘은 인원도 함께 본다
  let hard = separationIssues(project).violations.length
  let soft = 0
  for (const x of sizeIssues(project)) {
    const amount = Math.abs(x.size - x.limit)
    if (x.hard) hard += amount; else soft += amount
  }
  return { hard, soft, worst: Math.max(0, ...sz), sum: sz.reduce((a, b) => a + b, 0) }
}

/** a가 b보다 좋으면 음수 — 꼭 지킴 위반 → 가능하면 초과 → 편차 최대 → 편차 합계 순 */
export function compareScore(a, b) {
  return (a.hard || 0) - (b.hard || 0) || (a.soft || 0) - (b.soft || 0) || a.worst - b.worst || a.sum - b.sum
}

/** 솔버 결과 반영 */
export function applySolverResult(project, result) {
  const idx = Object.fromEntries(project.subjects.map((s, i) => [s.name, i]))
  const subjects = project.subjects.map((subj) => ({ ...subj, slotBySection: [...subj.slotBySection] }))
  for (const sec of result.sections || []) {
    const s = idx[sec.subject]
    if (s !== undefined && sec.index < subjects[s].sections) subjects[s].slotBySection[sec.index] = sec.slot
  }
  const assignment = {}
  for (const [sid, subs] of Object.entries(project.requests)) {
    const got = result.assignments?.[sid] || {}
    assignment[sid] = subs.map((s) => {
      const k = got[project.subjects[s].name]
      return k === undefined ? null : k
    })
  }
  return { ...project, subjects, assignment, manualStudents: [] }
}

/** 과목별 균형 요약 */
export function balanceSummary(project) {
  const sizes = sectionSizes(project)
  return project.subjects.map((subj, s) => ({
    s, name: subj.name, sizes: sizes[s], spread: spreadOf(sizes[s]),
    ideal: sizes[s].length > 1 && sizes[s].reduce((a, b) => a + b, 0) % sizes[s].length ? 1 : 0,
  }))
}

// ── 내보내기 ──────────────────────────────────────────────────────────────

/** 나이스 일괄등록 양식: 원본 헤더 그대로 + 과목 칸에 분반 기호 */
export function neisExportRows(project) {
  const header = (project.headerRows || []).map((r) => [...(r.cells || [])])
  const cols = project.subjectCols || project.subjects.map((_, i) => i + 1)
  const width = Math.max(1 + project.subjects.length, ...cols.map((c) => c + 1), ...header.map((r) => r.length))
  const rows = header.map((r) => Array.from({ length: width }, (_, c) => r[c] ?? null))
  // 원본의 학생 정보 열(학번·이름·고유번호 등)을 그대로 되살린다. 옛 작업은 1열에 학번만
  const infoCols = project.infoCols || []
  const baseRow = (sid) => {
    const row = Array(width).fill(null)
    const info = project.studentInfo?.[sid]
    if (info && infoCols.length) infoCols.forEach((c, i) => { if (c < width) row[c] = info[i] ?? null })
    else row[0] = /^\d+$/.test(sid) ? Number(sid) : sid
    return row
  }
  for (const sid of studentIds(project)) {
    const row = baseRow(sid)
    for (const x of studentSchedule(project, sid)) row[cols[x.s]] = x.label
    rows.push(row)
  }
  for (const ex of project.excluded || []) rows.push(baseRow(ex.id))
  return { rows, merges: project.headerMerges || [] }
}

/** 분반별 명단 */
export function rosterGroups(project) {
  const groups = []
  project.subjects.forEach((subj, s) => {
    for (let k = 0; k < subj.sections; k++) {
      groups.push({ s, k, subject: subj.name, block: subj.block, label: sectionLabel(project, s, k), slot: subj.slotBySection[k], students: [] })
    }
  })
  const byKey = new Map(groups.map((g) => [`${g.s}:${g.k}`, g]))
  for (const sid of studentIds(project)) {
    for (const x of studentSchedule(project, sid)) if (x.k !== null) byKey.get(`${x.s}:${x.k}`)?.students.push(sid)
  }
  return groups
}

/** 그룹표 요약: 그룹별 분반 목록 */
export function timetableSummary(project) {
  const sizes = sectionSizes(project)
  return project.slots.map((letter, t) => ({
    slot: t, letter,
    sections: project.subjects.flatMap((subj, s) => subj.slotBySection
      .map((x, k) => (x === t ? { s, k, subject: subj.name, block: subj.block, label: sectionLabel(project, s, k), size: sizes[s][k] } : null))
      .filter(Boolean)),
  }))
}

// ── 브라우저 빠른 판정·재배정(2단계 분해) ─────────────────────────────────
// 1단계(그룹 배치)가 정해지면 학생 배정은 "과목마다 서로 다른 그룹의 분반 하나씩"을 고르는 문제라
// 학생(조합) 단위로 바로 판정할 수 있다. 서버 솔버 없이 끌어 옮기는 순간 결과를 보여 주는 데 쓴다.

/** 과목 목록 subs에 대해 서로 다른 그룹으로 분반을 고르는 모든 경우(분반 번호 배열) */
export function scheduleOptions(project, subs, limit = 5000) {
  const out = []
  const chosen = []
  const used = new Set()
  const order = subs.map((s, j) => ({ s, j })).sort((a, b) => project.subjects[a.s].sections - project.subjects[b.s].sections)
  const rec = (i) => {
    if (out.length >= limit) return
    if (i === order.length) {
      const ks = Array(subs.length)
      order.forEach((o, n) => { ks[o.j] = chosen[n] })
      out.push(ks)
      return
    }
    const { s } = order[i]
    const slots = project.subjects[s].slotBySection
    for (let k = 0; k < slots.length; k++) {
      const t = slots[k]
      if (t === null || t === undefined || used.has(t)) continue
      used.add(t); chosen.push(k)
      rec(i + 1)
      used.delete(t); chosen.pop()
    }
  }
  rec(0)
  return out
}

/** 지금 그룹 배치로 배정할 수 없는 학생(조합별). 그룹 미정 분반은 없는 것으로 본다 */
export function placementCheck(project) {
  const byCombo = new Map()
  for (const [sid, subs] of Object.entries(project.requests)) {
    const key = subs.join(',')
    if (!byCombo.has(key)) byCombo.set(key, { subs, sids: [] })
    byCombo.get(key).sids.push(sid)
  }
  const blocked = []
  for (const { subs, sids } of byCombo.values()) {
    if (!scheduleOptions(project, subs, 1).length) blocked.push({ subjects: subs, sids })
  }
  return { blocked, count: blocked.reduce((a, b) => a + b.sids.length, 0) }
}

/** 분반 (s,k)를 그룹 t로 옮기면 배정 불가 학생이 몇 명이 되는지 — 끌기 중 미리 보기 */
export function placementCheckIfMoved(project, s, k, t) {
  return placementCheck(moveSectionSlot(project, s, k, t)).count
}

/**
 * 그룹 배치는 그대로 두고 학생만 다시 나눈다(브라우저, 1초 미만).
 * - 지금 배정이 유효한 학생은 균형이 좋아질 때만 옮긴다(바뀌는 학생 최소)
 * - 고정 학생·고정 과목 학생은 건드리지 않는다
 * - 균형 기준: 과목 안 분반 인원의 제곱합(작을수록 고르게)
 */
export function quickAssign(project, { passes = 40 } = {}) {
  const sizes = project.subjects.map((s) => Array(s.sections).fill(0))
  const lockedSet = new Set(project.lockedStudents || [])
  const optionCache = new Map()
  const entries = Object.entries(project.requests)
  const state = []
  const unassigned = []

  for (const [sid, subs] of entries) {
    const cur = project.assignment[sid] || subs.map(() => null)
    const frozen = lockedSet.has(sid) || subs.some((s) => project.subjects[s].locked)
    const key = subs.join(',')
    if (!optionCache.has(key)) optionCache.set(key, scheduleOptions(project, subs))
    const opts = optionCache.get(key)
    const valid = cur.every((k) => k !== null && k !== undefined) &&
      opts.some((o) => o.every((k, j) => k === cur[j]))
    if (frozen || !opts.length) {
      if (!opts.length && !frozen) unassigned.push(sid)
      state.push({ sid, subs, ks: frozen ? cur : subs.map(() => null), opts: [], frozen: true })
    } else {
      state.push({ sid, subs, ks: valid ? cur : null, opts, frozen: false })
    }
  }
  // 분리 규칙 학생이 있는 분반 — 같은 규칙 상대와 겹치면 큰 벌점
  const partnersOf = new Map()
  for (const r of project.separations || []) {
    for (const a of r.students) for (const b of r.students) if (a !== b) {
      if (!partnersOf.has(a)) partnersOf.set(a, new Set())
      partnersOf.get(a).add(b)
    }
  }
  const occ = new Map() // `${s}:${k}` → Set(규칙 학생)
  const add = (st, d) => st.ks && st.subs.forEach((s, j) => {
    const k = st.ks[j]
    if (k === null || k === undefined || sizes[s][k] === undefined) return
    sizes[s][k] += d
    if (partnersOf.has(st.sid)) {
      const key = `${s}:${k}`
      if (!occ.has(key)) occ.set(key, new Set())
      if (d > 0) occ.get(key).add(st.sid); else occ.get(key).delete(st.sid)
    }
  })
  state.forEach((st) => add(st, 1))

  const SEP_PENALTY = 1e6
  // 분반 최대 인원: 이 학생이 들어가면 넘는 분반은 큰 벌점(꼭 지킴) / 작은 벌점(가능하면)
  const maxOf = project.subjects.map((subj) => (project.maxMode && project.maxMode !== 'off' ? (subj.maxSize || project.maxSize || null) : null))
  const overPenalty = project.maxMode === 'hard' ? 1e5 : 1e3
  const costOf = (st, ks) => st.subs.reduce((a, s, j) => {
    let c = a + sizes[s][ks[j]]
    if (maxOf[s] && sizes[s][ks[j]] + 1 > maxOf[s]) c += overPenalty
    const ps = partnersOf.get(st.sid)
    if (ps) for (const other of occ.get(`${s}:${ks[j]}`) || []) if (ps.has(other)) c += SEP_PENALTY
    return c
  }, 0)
  // 처음 넣을 학생: 고를 수 있는 경우가 적은 학생부터
  state.filter((st) => !st.frozen && !st.ks).sort((a, b) => a.opts.length - b.opts.length).forEach((st) => {
    let best = null
    let bestC = Infinity
    for (const o of st.opts) { const c = costOf(st, o); if (c < bestC) { bestC = c; best = o } }
    st.ks = best
    add(st, 1)
  })
  // 개선: 한 학생씩 더 고른 분반으로(제곱합이 줄어들 때만)
  for (let pass = 0; pass < passes; pass++) {
    let moved = 0
    for (const st of state) {
      if (st.frozen || st.opts.length < 2) continue
      add(st, -1)
      const curC = costOf(st, st.ks)
      let best = st.ks
      let bestC = curC
      for (const o of st.opts) { const c = costOf(st, o); if (c < bestC - 1e-9) { bestC = c; best = o } }
      if (best !== st.ks) { st.ks = best; moved++ }
      add(st, 1)
    }
    if (!moved) break
  }

  const assignment = { ...project.assignment }
  let changed = 0
  for (const st of state) {
    if (st.frozen && !st.ks) continue
    const before = project.assignment[st.sid] || []
    const after = st.ks || st.subs.map(() => null)
    if (after.some((k, j) => k !== before[j])) changed++
    assignment[st.sid] = after
  }
  const manual = new Set(project.manualStudents || [])
  return {
    project: { ...project, assignment, manualStudents: [...manual] },
    changed,
    unassigned,
  }
}

/** 배정 초기화 — 과목 설정(분반 수·최대 인원·분리)과 신청 데이터는 두고, 그룹 배치·학생 배정·고정을 모두 지운다 */
export function resetAssignment(project) {
  const assignment = Object.fromEntries(Object.entries(project.requests).map(([sid, subs]) => [sid, subs.map(() => null)]))
  return {
    ...project,
    subjects: project.subjects.map((s) => ({
      ...s, locked: false, slotBySection: Array(s.sections).fill(null), lockedSections: Array(s.sections).fill(false),
    })),
    assignment,
    lockedStudents: [],
    manualStudents: [],
    lastSolve: null,
  }
}

/**
 * 분반 최대·최소 인원을 벗어난 분반. 최소 인원은 분반을 나눈 과목(2분반 이상)에만 적용한다.
 * 반환: [{ s, k, size, kind: 'over'|'under', limit, hard }]
 */
export function sizeIssues(project) {
  const sizes = sectionSizes(project)
  const out = []
  project.subjects.forEach((subj, s) => {
    const mx = subj.maxSize || project.maxSize
    const mn = subj.minSize || project.minSize
    sizes[s].forEach((size, k) => {
      if (subj.slotBySection[k] === null || subj.slotBySection[k] === undefined) return
      if (mx && project.maxMode !== 'off' && size > mx) out.push({ s, k, size, kind: 'over', limit: mx, hard: project.maxMode === 'hard' })
      if (mn && project.minMode !== 'off' && subj.sections >= 2 && size < mn) out.push({ s, k, size, kind: 'under', limit: mn, hard: project.minMode === 'hard' })
    })
  })
  return out
}

// ── 분리 규칙: 서로 같은 분반에 들어가면 안 되는 학생들 ───────────────────────

/** 학생 sid가 과목 s에서 든 분반(없으면 null) */
export function sectionOf(project, sid, s) {
  const j = (project.requests[sid] || []).indexOf(s)
  if (j < 0) return null
  return project.assignment[sid]?.[j] ?? null
}

/** sid와 분리해야 하는 학생들 */
export function separationPartners(project, sid) {
  const out = new Set()
  for (const r of project.separations || []) if (r.students.includes(sid)) r.students.forEach((x) => x !== sid && out.add(x))
  return out
}

/**
 * 분리 규칙 점검.
 * violations: 같은 과목·같은 분반에 규칙 학생 둘 이상 [{ ruleId, s, k, students }]
 * unsplittable: 규칙 학생 둘 이상이 듣지만 1분반이라 나눌 수 없는 과목 [{ ruleId, s, students }]
 */
export function separationIssues(project) {
  const violations = []
  const unsplittable = []
  for (const r of project.separations || []) {
    const bySubject = new Map()
    for (const sid of r.students) for (const s of project.requests[sid] || []) {
      if (!bySubject.has(s)) bySubject.set(s, [])
      bySubject.get(s).push(sid)
    }
    for (const [s, sids] of bySubject) {
      if (sids.length < 2) continue
      if (project.subjects[s].sections < 2) { unsplittable.push({ ruleId: r.id, s, students: sids }); continue }
      const byK = new Map()
      for (const sid of sids) {
        const k = sectionOf(project, sid, s)
        if (k === null) continue
        if (!byK.has(k)) byK.set(k, [])
        byK.get(k).push(sid)
      }
      for (const [k, together] of byK) if (together.length >= 2) violations.push({ ruleId: r.id, s, k, students: together })
    }
  }
  return { violations, unsplittable }
}

const newRuleId = () => `sep_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

export function addSeparation(project, students, memo = '') {
  const ids = [...new Set(students.map((x) => String(x).trim()).filter(Boolean))]
  if (ids.length < 2) return project
  return { ...project, separations: [...(project.separations || []), { id: newRuleId(), students: ids, memo: memo.trim() }] }
}

export function updateSeparation(project, id, patch) {
  return {
    ...project,
    separations: (project.separations || [])
      .map((r) => (r.id === id ? { ...r, ...patch, students: [...new Set(patch.students || r.students)] } : r))
      .filter((r) => r.students.length >= 2),
  }
}

export function removeSeparation(project, id) {
  return { ...project, separations: (project.separations || []).filter((r) => r.id !== id) }
}

/**
 * 과목별 미배정 — 신청했는데 분반이 없거나(그룹 미정 분반 포함) 사라진 분반에 들어 있는 학생.
 * 반환: [{ s, name, count, students: [학번] }] (미배정이 있는 과목만, 많은 순)
 */
export function unassignedBySubject(project) {
  const by = new Map()
  for (const [sid, subs] of Object.entries(project.requests)) {
    const a = project.assignment[sid] || []
    subs.forEach((s, j) => {
      const k = a[j]
      const subj = project.subjects[s]
      const slot = k === null || k === undefined || k >= subj.sections ? null : subj.slotBySection[k]
      if (slot === null || slot === undefined) {
        if (!by.has(s)) by.set(s, [])
        by.get(s).push(sid)
      }
    })
  }
  return [...by.entries()]
    .map(([s, students]) => ({ s, name: project.subjects[s].name, count: students.length, students }))
    .sort((x, y) => y.count - x.count || x.s - y.s)
}

// ── 공동 작업: 저장할 때 3방향 합치기 ─────────────────────────────────────

const sameVal = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
/** base(내가 연 본)·mine(내 것)·latest(최신 저장본) — 내가 바꾼 곳만 내 값, 둘 다 다르게 바꿨으면 최신본 */
function pick3(b, m, t, onConflict) {
  if (sameVal(m, b)) return t
  if (sameVal(t, b) || sameVal(m, t)) return m
  onConflict()
  return t
}

const SETTING_LABELS = {
  title: '작업명', year: '학년도', grade: '학년', semester: '학기', entryYear: '입학년도', folder: '묶음',
  termLabel: '학기 표시', sourceFileName: '파일명', slots: '그룹', rooms: '교실 수', maxSize: '분반 최대 인원',
  maxMode: '최대 인원 방식', minSize: '분반 최소 인원', minMode: '최소 인원 방식', freeMax: '공강 최대 인원', lastSolve: '마지막 배정 결과',
  warnings: '불러올 때 경고', headerRows: '원본 머리', headerMerges: '원본 머리 병합', subjectCols: '원본 과목 열',
  infoCols: '원본 학생 정보 열', studentInfo: '원본 학생 정보',
}
// 분반 수·그룹 배치·분반 고정은 함께 움직인다
const SECTION_UNIT = ['sections', 'slotBySection', 'lockedSections']
const SUBJECT_FIELD_LABELS = { maxSize: '최대 인원', minSize: '최소 인원', sectionsManual: '분반 수 직접 지정', distinctSlots: '같은 그룹 금지', locked: '과목 고정', block: '칸막이', name: '과목명', code: '과목 코드' }

function setMerge(b = [], m = [], t = []) {
  const bs = new Set(b)
  const ms = new Set(m)
  const added = m.filter((x) => !bs.has(x))
  const removed = new Set(b.filter((x) => !ms.has(x)))
  return [...new Set([...t.filter((x) => !removed.has(x)), ...added])]
}

/**
 * 저장할 때 다른 사람이 먼저 저장했으면 최신본 위에 내 변경을 합친다(ExamCore mergeDraft와 같은 방식).
 *  · 설정 값은 항목 단위, 과목은 과목·항목 단위(분반 수·그룹 배치·고정은 한 덩어리)
 *  · 학생은 신청·배정·제외·이름을 한 덩어리로(배정 순서가 신청 순서에 매여 있으므로)
 *  · 고정 학생·직접 배정 학생은 추가·삭제 단위, 분리 규칙은 규칙 단위, 배정 기록은 둘 다 남긴다
 * @returns {{ project, conflicts: string[] }}
 */
export function mergeProject(base, mine, latest, labelOf = (sid) => sid) {
  const conflicts = []
  const out = { ...latest }

  for (const k of Object.keys(SETTING_LABELS)) {
    if (!(k in base) && !(k in mine) && !(k in latest)) continue
    out[k] = pick3(base[k], mine[k], latest[k], () => conflicts.push(`${SETTING_LABELS[k]} — 둘 다 고쳐서 최신본 값을 남겼습니다.`))
  }

  // 과목
  const names = (p) => (p.subjects || []).map((s) => s.name).join('|')
  if (names(base) === names(mine) && names(base) === names(latest)) {
    out.subjects = latest.subjects.map((t, i) => {
      const b = base.subjects[i]
      const m = mine.subjects[i]
      if (sameVal(m, b)) return t
      if (sameVal(t, b)) return m
      const o = { ...t }
      const unit = (x) => SECTION_UNIT.map((f) => x[f])
      const u = pick3(unit(b), unit(m), unit(t), () => conflicts.push(`${t.name} 분반 수·그룹 배치 — 둘 다 고쳐서 최신본을 남겼습니다.`))
      SECTION_UNIT.forEach((f, j) => { o[f] = u[j] })
      for (const f of new Set([...Object.keys(b), ...Object.keys(m), ...Object.keys(t)])) {
        if (SECTION_UNIT.includes(f)) continue
        o[f] = pick3(b[f], m[f], t[f], () => conflicts.push(`${t.name} ${SUBJECT_FIELD_LABELS[f] || f} — 둘 다 고쳐서 최신본을 남겼습니다.`))
      }
      return o
    })
  } else if (names(mine) !== names(base) && names(latest) === names(base)) {
    out.subjects = mine.subjects
  } else {
    out.subjects = latest.subjects
    if (names(mine) !== names(base)) conflicts.push('과목 구성 — 둘 다 바꿔서 최신본을 남겼습니다.')
  }

  // 학생: 신청·배정·제외·이름 한 덩어리
  const unitOf = (p, sid) => {
    const ex = (p.excluded || []).find((x) => x.id === sid)
    return {
      r: p.requests?.[sid] ?? null,
      a: p.assignment?.[sid] ?? null,
      ex: ex ? ex.reason : null,
      n: p.names?.[sid] ?? null,
    }
  }
  const ids = new Set()
  for (const p of [base, mine, latest]) {
    Object.keys(p.requests || {}).forEach((x) => ids.add(x))
    ;(p.excluded || []).forEach((x) => ids.add(x.id))
    Object.keys(p.names || {}).forEach((x) => ids.add(x))
  }
  const requests = {}
  const assignment = {}
  const excluded = []
  const nameMap = {}
  for (const sid of ids) {
    const u = pick3(unitOf(base, sid), unitOf(mine, sid), unitOf(latest, sid),
      () => conflicts.push(`${labelOf(sid)} 신청·배정 — 둘 다 고쳐서 최신본을 남겼습니다.`))
    if (u.r) { requests[sid] = u.r; assignment[sid] = u.a || u.r.map(() => null) }
    if (u.ex !== null) excluded.push({ id: sid, reason: u.ex })
    if (u.n !== null) nameMap[sid] = u.n
  }
  // 제외 명단은 최신본 순서를 살린다
  const exOrder = new Map((latest.excluded || []).map((x, i) => [x.id, i]))
  excluded.sort((x, y) => (exOrder.get(x.id) ?? 1e9) - (exOrder.get(y.id) ?? 1e9))
  out.requests = requests
  out.assignment = assignment
  out.excluded = excluded
  out.names = nameMap

  out.lockedStudents = setMerge(base.lockedStudents, mine.lockedStudents, latest.lockedStudents)
  out.manualStudents = setMerge(base.manualStudents, mine.manualStudents, latest.manualStudents)

  // 분리 규칙: 규칙 id 단위
  const byId = (arr) => new Map((arr || []).map((r) => [r.id, r]))
  const bs = byId(base.separations)
  const ms = byId(mine.separations)
  const ts = byId(latest.separations)
  const sepIds = [...new Set([...ts.keys(), ...ms.keys(), ...bs.keys()])]
  out.separations = sepIds
    .map((id) => pick3(bs.get(id), ms.get(id), ts.get(id), () => conflicts.push('분리 규칙 — 둘 다 고쳐서 최신본을 남겼습니다.')))
    .filter(Boolean)

  // 배정 기록: 둘 다 남긴다(최근 SOLVE_LOG_KEEP회)
  const logs = new Map()
  for (const l of [...(latest.solveLogs || []), ...(mine.solveLogs || [])]) logs.set(l.id, l)
  out.solveLogs = [...logs.values()].sort((a, b) => String(a.at).localeCompare(String(b.at))).slice(-SOLVE_LOG_KEEP)

  return { project: out, conflicts: [...new Set(conflicts)] }
}

// ── 배정 기록(로그) ──────────────────────────────────────────────────────

export const SOLVE_LOG_KEEP = 5
export const SOLVE_LOG_LINES = 600
const MODE_TEXT = { hard: '꼭 지킴', soft: '가능하면', off: '참고만' }

/** 실행할 때의 설정 요약 */
export function solveSettings(project) {
  const lockedSections = project.subjects.reduce((a, x) => a + (x.locked ? x.sections : (x.lockedSections || []).filter(Boolean).length), 0)
  return {
    students: Object.keys(project.requests).length,
    subjects: project.subjects.length,
    sections: project.subjects.reduce((a, x) => a + x.sections, 0),
    slots: project.slots.join(''),
    maxSize: project.maxSize ?? null,
    maxMode: project.maxMode || 'hard',
    minSize: project.minSize ?? null,
    minMode: project.minMode || 'soft',
    freeMax: hasFree(project) ? project.freeMax ?? null : null,
    separations: (project.separations || []).length,
    lockedSections,
    lockedStudents: (project.lockedStudents || []).length,
  }
}

/** 실행 결과 요약 — 미배정·편차·과목별 분반 인원 */
export function solveResultSummary(project) {
  const v = validateProject(project)
  const sc = balanceScore(project)
  const sizes = sectionSizes(project)
  return {
    ok: v.ok,
    unassigned: v.unassigned.length,
    conflicts: v.conflicts.length,
    worst: sc.worst,
    sum: sc.sum,
    subjects: project.subjects.map((subj, s) => ({
      name: subj.name,
      block: subj.block,
      sections: sizes[s].map((n, k) => ({ label: sectionLabel(project, s, k), n })),
    })),
  }
}

/**
 * 콘솔 상태(SolveConsole) → 저장할 기록 하나.
 * before: 실행할 때의 작업(설정), after: 실행 뒤 작업(결과, 해가 없거나 실패면 null)
 */
export function makeSolveLog(before, c, { byName = '', after = null } = {}) {
  return {
    id: `log_${Number(c.startedAt).toString(36)}`,
    title: c.title || '배정 실행',
    at: new Date(c.startedAt).toISOString(),
    byName,
    summary: c.done?.summary || '',
    ok: !!c.done?.ok,
    settings: solveSettings(before),
    result: after ? solveResultSummary(after) : null,
    lines: (c.logs || []).slice(-SOLVE_LOG_LINES).map(({ t, type, text }) => ({ t: Math.round(t || 0), type: type || 'local', text: String(text ?? '') })),
  }
}

export function pushSolveLog(project, log) {
  return { ...project, solveLogs: [...(project.solveLogs || []).filter((x) => x.id !== log.id), log].slice(-SOLVE_LOG_KEEP) }
}

const pad2 = (n) => String(n).padStart(2, '0')
function fmtAt(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso || '')
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}
function fmtT(ms) {
  const s = Math.max(0, ms / 1000)
  return `${pad2(Math.floor(s / 60))}:${(s % 60).toFixed(1).padStart(4, '0')}`
}
const LINE_MARK = { local: '›', info: '▸', raw: ' ', solution: '★', warn: '!', done: '✔', error: '✖' }

/** 회의 자료·증빙용 글. raw=false면 솔버 원본 진행 줄은 뺀다 */
export function formatSolveLog(project, log, { raw = false } = {}) {
  const st = log.settings || {}
  const term = [project.year && `${project.year}학년도`, project.grade && `${project.grade}학년`, project.semester && `${project.semester}학기`].filter(Boolean).join(' ')
  const out = []
  out.push(`[선택과목 분반 배정 기록] ${project.title || ''}`.trim())
  if (term) out.push(`대상: ${term}${project.sourceFileName ? ` · 원본 ${project.sourceFileName}` : ''}`)
  out.push(`실행: ${log.title} · ${fmtAt(log.at)}${log.byName ? ` · ${log.byName}` : ''}`)
  out.push(`설정: 학생 ${st.students ?? '-'}명 · 과목 ${st.subjects ?? '-'}개 · 분반 ${st.sections ?? '-'}개 · 그룹 ${st.slots || '-'}`
    + ` · 분반 최대 ${st.maxSize ?? '-'}명(${MODE_TEXT[st.maxMode] || st.maxMode || '-'})`
    + (st.minSize ? ` · 최소 ${st.minSize}명(${MODE_TEXT[st.minMode] || st.minMode})` : '')
    + (st.freeMax !== null && st.freeMax !== undefined ? ` · 그룹당 공강 최대 ${st.freeMax}명` : '')
    + (st.separations ? ` · 분리 규칙 ${st.separations}개` : '')
    + (st.lockedSections || st.lockedStudents ? ` · 고정 분반 ${st.lockedSections || 0}개·학생 ${st.lockedStudents || 0}명` : ''))
  out.push('')
  out.push('── 진행 ──')
  for (const l of log.lines || []) {
    if (!raw && l.type === 'raw') continue
    out.push(`${fmtT(l.t)} ${LINE_MARK[l.type] || '›'} ${l.text}`)
  }
  out.push('')
  out.push(`── 결과 ── ${log.summary || (log.ok ? '완료' : '해 없음 또는 실패')}`)
  const r = log.result
  if (r) {
    out.push(`미배정 ${r.unassigned}명 · 시간 충돌 ${r.conflicts}명 · 분반 편차 최대 ${r.worst}명 · 편차 합계 ${r.sum}`)
    for (const s of r.subjects || []) {
      out.push(`  [${s.block}] ${s.name}: ${(s.sections || []).map((x) => `${x.label} ${x.n}명`).join(', ') || '분반 없음'}`)
    }
  }
  return out.join('\n')
}

// ── 공강 그룹: 그룹 수 > 학생당 과목 수 ──────────────────────────────────

export const MAX_GROUPS = 8

const isBlank = (v) => v === null || v === undefined || v === ''

/** 학생 한 명의 가장 많은 선택 과목 수(그룹 수의 하한) */
export function maxPicks(project) {
  return Math.max(0, ...Object.values(project.requests).map((x) => x.length))
}

/** 공강이 생기는 작업인가(그룹이 남는 학생이 있음) */
export function hasFree(project) {
  const T = project.slots.length
  return Object.values(project.requests).some((x) => x.length < T)
}

/** 학생마다 공강 수의 합 = Σ(그룹 수 − 과목 수) */
export function totalFree(project) {
  const T = project.slots.length
  return Object.values(project.requests).reduce((a, x) => a + Math.max(0, T - x.length), 0)
}

/** 그룹별 공강 학생 수 — 그 그룹에 들어간 분반이 없는 학생(미배정 과목이 있으면 그 학생의 빈 그룹도 공강으로 센다) */
export function freeCounts(project) {
  const N = Object.keys(project.requests).length
  const busy = project.slots.map(() => 0)
  for (const sid of Object.keys(project.requests)) {
    const ts = new Set(studentSchedule(project, sid).map((x) => x.slot).filter((t) => t !== null && t !== undefined))
    for (const t of ts) if (busy[t] !== undefined) busy[t]++
  }
  return busy.map((b) => N - b)
}

/**
 * 그룹 수 바꾸기. n은 학생 최대 과목 수 ~ MAX_GROUPS.
 * 줄이면 없어지는 그룹의 분반은 그룹 미정(고정 해제), 그 분반 학생은 미배정. 서로 다른 그룹 과목의 분반 수는 n 이하로.
 */
export function setGroupCount(project, n) {
  const count = Math.min(MAX_GROUPS, Math.max(maxPicks(project), 1, Math.floor(Number(n) || 0)))
  if (count === project.slots.length) return project
  const goneSet = new Set()
  project.subjects.forEach((subj, s) => subj.slotBySection.forEach((t, k) => {
    if (t !== null && t !== undefined && t >= count) goneSet.add(`${s}:${k}`)
  }))
  let p = {
    ...project,
    slots: slotLetters(count),
    rooms: slotLetters(count).map(() => null),
    subjects: project.subjects.map((subj, s) => {
      if (!subj.slotBySection.some((_, k) => goneSet.has(`${s}:${k}`))) return subj
      return {
        ...subj,
        locked: false,
        slotBySection: subj.slotBySection.map((t, k) => (goneSet.has(`${s}:${k}`) ? null : t)),
        lockedSections: subj.lockedSections.map((x, k) => (goneSet.has(`${s}:${k}`) ? false : x)),
      }
    }),
  }
  // 그룹이 사라진 분반의 학생은 미배정
  if (goneSet.size) {
    const assignment = { ...p.assignment }
    for (const [sid, subs] of Object.entries(p.requests)) {
      const a = assignment[sid] || []
      if (subs.some((s, j) => goneSet.has(`${s}:${a[j]}`))) {
        assignment[sid] = subs.map((s, j) => (goneSet.has(`${s}:${a[j]}`) ? null : a[j] ?? null))
      }
    }
    p = { ...p, assignment }
  }
  p.subjects.forEach((subj, s) => { if (subj.distinctSlots && subj.sections > count) p = resizeSections(p, s, count) })
  return p
}

// ── 분리 규칙 가져오기(다른 학기 작업에서) ────────────────────────────────

/**
 * 다른 작업의 분리 규칙을 지금 작업 학생에 맞춘다. 학번이 같으면 그대로, 없으면 이름이 지금 명단에 한 명뿐일 때 그 학생.
 * @param rules 원본 규칙 [{ id, students, memo }], sourceNames 원본 { 학번: 이름 }, target 지금 작업
 * @returns [{ rule, students: [{ from, name, to, how: 'id'|'name'|'missing'|'ambiguous' }], ids: [새 학번], ok, duplicate }]
 */
export function matchSeparations(rules, sourceNames = {}, target) {
  const known = new Set(Object.keys(target.requests))
  const byName = new Map()
  for (const sid of known) {
    const nm = String(target.names?.[sid] || '').trim()
    if (!nm) continue
    if (!byName.has(nm)) byName.set(nm, [])
    byName.get(nm).push(sid)
  }
  const existing = new Set((target.separations || []).map((r) => [...r.students].sort().join(',')))
  return (rules || []).map((rule) => {
    const students = (rule.students || []).map((from) => {
      const name = String(sourceNames[from] || '').trim()
      if (known.has(from)) return { from, name: name || target.names?.[from] || '', to: from, how: 'id' }
      const cands = name ? byName.get(name) || [] : []
      if (cands.length === 1) return { from, name, to: cands[0], how: 'name' }
      return { from, name, to: null, how: cands.length > 1 ? 'ambiguous' : 'missing' }
    })
    const ids = [...new Set(students.map((x) => x.to).filter(Boolean))]
    const duplicate = ids.length >= 2 && existing.has([...ids].sort().join(','))
    return { rule, students, ids, ok: ids.length >= 2 && !duplicate, duplicate }
  })
}

// ── 회의 자료 ────────────────────────────────────────────────────────────

/**
 * 회의 자료(인쇄·엑셀) 한 벌 — 배정표 격자와 과목·그룹 요약. 분리 규칙은 개수만(학생 이름은 싣지 않는다).
 */
export function meetingReport(project) {
  const v = validateProject(project)
  const sizes = sectionSizes(project)
  const demand = demandOf(project)
  const blocks = [...new Set(project.subjects.map((s) => s.block))]
  const cols = blocks.flatMap((b) => project.subjects.map((subj, s) => ({ subj, s })).filter((x) => x.subj.block === b))
    .map(({ subj, s }) => ({
      s, name: subj.name, block: subj.block, demand: demand[s], sections: subj.sections,
      maxSize: subj.maxSize || project.maxSize || null,
      avg: subj.sections ? Math.round((demand[s] / subj.sections) * 10) / 10 : null,
      spread: spreadOf(sizes[s]), sizes: sizes[s], locked: !!subj.locked,
      labels: subj.slotBySection.map((_, k) => sectionLabel(project, s, k)),
    }))
  const showFree = hasFree(project)
  const free = freeCounts(project)
  const cellOf = (s, pred) => project.subjects[s].slotBySection
    .map((x, k) => (pred(x) ? { k, label: sectionLabel(project, s, k), size: sizes[s][k] } : null)).filter(Boolean)
  const groups = project.slots.map((letter, t) => {
    const cells = cols.map((c) => cellOf(c.s, (x) => x === t))
    const all = cells.flat().map((x) => x.size)
    return {
      t, letter, cells, sections: all.length, students: all.reduce((a, b) => a + b, 0),
      min: all.length ? Math.min(...all) : 0, max: all.length ? Math.max(...all) : 0, free: showFree ? free[t] : null,
    }
  })
  const unplaced = cols.map((c) => cellOf(c.s, (x) => x === null || x === undefined))
  return {
    title: project.title || '선택과목 분반',
    term: [project.year && `${project.year}학년도`, project.grade && `${project.grade}학년`, project.semester && `${project.semester}학기`].filter(Boolean).join(' '),
    date: new Date().toLocaleDateString('ko-KR'),
    blocks: blocks.map((b) => ({ block: b, span: cols.filter((c) => c.block === b).length })),
    cols,
    groups,
    unplaced: unplaced.some((x) => x.length) ? unplaced : null,
    showFree,
    status: {
      students: Object.keys(project.requests).length,
      excluded: (project.excluded || []).length,
      subjects: project.subjects.length,
      sections: project.subjects.reduce((a, x) => a + x.sections, 0),
      groups: project.slots.join(''),
      unassigned: v.unassigned.length,
      conflicts: v.conflicts.length,
      separationRules: (project.separations || []).length,
      separationViolations: v.separationViolations.length,
      sizeIssues: v.sizeIssues.length,
      freeOver: v.freeOver.length,
      worstSpread: Math.max(0, ...sizes.filter((x) => x.length > 1).map(spreadOf)),
      maxSize: project.maxSize ?? null, maxMode: project.maxMode || 'hard',
      minSize: project.minSize ?? null, minMode: project.minMode || 'soft',
      freeMax: showFree ? project.freeMax ?? null : null,
      totalFree: showFree ? totalFree(project) : 0,
    },
  }
}
