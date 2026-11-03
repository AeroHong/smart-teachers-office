/**
 * 선택과목 분반 배정(smart-class-flow) 순수 로직.
 *
 * 용어
 * - 칸막이(block): 수강신청 파일 2행의 C·D 같은 선택 묶음. "C에서 4과목, D에서 1과목"처럼 고르는 범위일 뿐 시간과는 무관하다.
 * - 그룹(slot): A~E처럼 실제로 수업이 동시에 열리는 시간 묶음. 학생 한 명의 선택 과목 수 = 그룹 수.
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

/**
 * 수강신청 일괄등록 시트(2차원 배열)를 읽는다.
 * rows: XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) 결과, merges: ws['!merges']
 */
export function parseEnrollmentRows(rows, merges = []) {
  const warnings = []
  const dataStart = rows.findIndex((r) => r && /^\d{4,}$/.test(cellText(r[0])))
  if (dataStart < 1) throw new Error('학번(숫자)으로 시작하는 학생 행을 찾지 못했습니다.')
  const headerRow = dataStart - 1
  const header = rows[headerRow] || []

  const subjectCols = []
  for (let c = 1; c < header.length; c++) if (cellText(header[c])) subjectCols.push(c)
  if (!subjectCols.length) throw new Error('과목명 행을 찾지 못했습니다.')

  // 칸막이: 과목명 바로 위 행. 병합 범위 → 그 칸 값, 병합 안 된 칸 → 자기 값, 빈 칸 → 왼쪽 칸막이 이어받기
  const colBlock = {}
  const blockRow = headerRow - 1
  if (blockRow >= 0) {
    for (const m of merges || []) {
      if (m.s.r <= blockRow && m.e.r >= blockRow && m.s.r === blockRow) {
        const name = cellText(rows[blockRow]?.[m.s.c])
        if (name) for (let c = m.s.c; c <= m.e.c; c++) colBlock[c] = name
      }
    }
    for (const c of subjectCols) {
      if (!colBlock[c] && cellText(rows[blockRow]?.[c])) colBlock[c] = cellText(rows[blockRow][c])
    }
  }
  let last = null
  for (const c of subjectCols) {
    if (colBlock[c]) last = colBlock[c]
    else colBlock[c] = last
  }
  const subjects = subjectCols.map((c) => ({ name: cellText(header[c]), block: colBlock[c] || '전체', col: c }))
  const dupNames = subjects.map((s) => s.name).filter((n, i, a) => a.indexOf(n) !== i)
  if (dupNames.length) throw new Error(`과목명이 중복됩니다: ${[...new Set(dupNames)].join(', ')}`)

  const students = []
  const excluded = []
  const seen = new Set()
  for (let r = dataStart; r < rows.length; r++) {
    const row = rows[r]
    const id = cellText(row?.[0])
    if (!id) continue
    if (seen.has(id)) { warnings.push(`학번 ${id}가 두 번 나옵니다 — 뒤의 행은 무시했습니다.`); continue }
    seen.add(id)
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
    headerRows: rows.slice(0, dataStart).map((r) => ({ cells: (r || []).map((v) => (v === undefined ? null : v)) })),
    headerMerges: (merges || []).filter((m) => m.s.r < dataStart).map((m) => ({ s: { ...m.s }, e: { ...m.e } })),
    subjectCols,
  }
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
    // 그룹별 교실 수 제한은 화면에서 뺐다(2026-11-03, 실제로 필요 없음) — 예전 값이 남아 해를 막지 않도록 비운다
    rooms: p.slots.map(() => null),
    excluded: p.excluded || [],
    lockedStudents: p.lockedStudents || [],
    manualStudents: p.manualStudents || [],
    separations: p.separations || [],
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

export function createProject(parsed, { title = '', year = null, maxSize = DEFAULT_MAX_SIZE, sourceFileName = '' } = {}) {
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
    return {
      name: s.name, block: s.block, sections, maxSize: null, sectionsManual: false, distinctSlots: true,
      slotBySection: Array(sections).fill(null), lockedSections: Array(sections).fill(false), locked: false,
    }
  })
  const [g, sem] = (parsed.termLabel || '').split('-').map(Number)
  return {
    title, year, grade: g || null, semester: sem || null, termLabel: parsed.termLabel, sourceFileName,
    slots, rooms: slots.map(() => null),
    maxSize, maxMode: 'hard', minSize: null, minMode: 'soft', subjects, requests, assignment, separations: [],
    lockedStudents: [], manualStudents: [], excluded: parsed.excluded,
    warnings: parsed.warnings,
    headerRows: parsed.headerRows, headerMerges: parsed.headerMerges, subjectCols: parsed.subjectCols,
  }
}

// ── 1단계: 신청 데이터 고치기 ────────────────────────────────────────────

/** 학생 sid의 신청 과목을 picks로. 남는 과목의 배정은 유지, 새 과목은 미배정, 비면 제외 명단으로 */
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
  return {
    unassigned, conflicts, roomOverflow, sameSlot, slotUse: used, sizeIssues: sizeIssues(project),
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
      name: subj.name, sections: subj.sections, distinctSlots: subj.distinctSlots, sectionSlots,
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
  for (const sid of studentIds(project)) {
    const row = Array(width).fill(null)
    row[0] = /^\d+$/.test(sid) ? Number(sid) : sid
    for (const x of studentSchedule(project, sid)) row[cols[x.s]] = x.label
    rows.push(row)
  }
  for (const ex of project.excluded || []) {
    const row = Array(width).fill(null)
    row[0] = /^\d+$/.test(ex.id) ? Number(ex.id) : ex.id
    rows.push(row)
  }
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
