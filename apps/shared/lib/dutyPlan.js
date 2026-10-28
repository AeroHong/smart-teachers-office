/**
 * 업무분장 만들기(포털 /duty-plan) 순수 로직 — Firestore를 모른다.
 *   node --test apps/shared/lib/dutyPlan.test.js
 *
 * 편성안 한 문서(dutyPlans/{planId})가 들고 있는 "저장 묶음":
 *   departments  [{ id, name, category, order }]
 *   duties       [{ id, dutyKey, deptId, order, title, slotLabel, roleType, staffKind, tasks[], pairKey?, note?,
 *                   prevKeys?, assigneeUid, assigneeName }]
 *                 deptId '' = 보관함(뺀 줄). 한 줄 = 업무 한 자리(현행 업무분장표의 한 줄 — 성명·담임·업무)
 *   tasks        [{ id, key, text, note? }] — '주요 업무 내용' 한 항목 = 업무 내용 카드. 줄 사이로 옮겨 다닌다
 *   looseTasks   [{ id, key, text, note? }] — 어느 줄에도 없는 업무 내용 카드(보관함)
 *   homerooms    [{ grade, classNo(number|'특수'), homeroomUid, homeroomName, subHomeroomUid, subHomeroomName }]
 *   subjectHeads [{ group, uid, name, note }]
 *   headNotes    { 부서 id: 비고 } — 부장교사 명단의 비고 칸
 *   staffPool    [{ uid, name, subject, flag? }]   — 그 해 배치 대상 교직원(uid 없는 신규 전입 자리 포함)
 *
 * 업무 내용 카드의 key는 해를 넘어 이어지는 고유 키다 — dutyCatalog/{key}(업무 안내·인수인계 노트·역대 담당자)가
 * 이 키로 이어져, 카드를 다른 선생님 줄로 옮겨도 기록이 따라간다(사용자 결정 2026-10-28). 작년 확정본에서 복제하면
 * 카드 id는 새로, key는 그대로. 줄의 dutyKey는 희망원(업무 줄을 지망)이 쓴다.
 * 예전 저장본의 tasks는 문자열 배열이다 — 읽을 때 normalizeTasks가 줄 id·dutyKey로 정해진 id·key를 붙여 카드로 바꾼다.
 */

export const CATEGORIES = ['교무행정지원', '교육활동']
export const ROLE_TYPES = ['부장', '기획', '일반']
export const STAGES = [
  { key: 'draft', label: '1차 초안', desc: '관리자·편집자만 봅니다' },
  { key: 'review', label: '2차 공람', desc: '전 교직원이 읽고 의견을 남깁니다' },
  { key: 'confirmed', label: '3차 확정', desc: '인사자문위원회 결정 후 확정 — 전 교직원 공개' },
]
export const PLAN_KINDS = { cards: '업무분장안', assign: '인원 배치안' }

/** 단계 — 없으면 초안 */
export function planStage(plan) {
  return STAGES.some((s) => s.key === plan?.stage) ? plan.stage : 'draft'
}
/** 일반 교직원에게 보이는 단계(공람·확정) — 문서의 shared 필드와 같아야 한다(규칙이 shared를 본다) */
export function isSharedStage(stage) {
  return stage === 'review' || stage === 'confirmed'
}

let seq = 0
/** 브라우저·노드 공통 짧은 id */
export function newId(prefix = 'd') {
  seq = (seq + 1) % 1e6
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}${seq.toString(36)}`
}

// ── 표기 ─────────────────────────────────────────────────────────────

/** 업무명으로 직급 — '부장' / '…기획…' / 일반 (targeting.js deriveRank와 같은 순서: 부장이 기획보다 먼저) */
export function roleTypeOf(title) {
  const t = (title || '').replace(/\s/g, '')
  if (t === '부장' || t.endsWith('부장')) return '부장'
  if (t.includes('기획')) return '기획'
  return '일반'
}

/** 번호 칸(1·2…/특수/교육실무사(교무)…)으로 직군 — 숫자·특수는 교사, 나머지는 칸에 적힌 그대로 */
export function staffKindOf(slotLabel) {
  const s = String(slotLabel ?? '').trim()
  if (!s || /^\d+$/.test(s) || s === '특수') return '교사'
  return s
}

/** 담임 칸 표기 '비'/'1담'/''(교직원) ↔ 학년 */
export function parseHomeroomMark(mark) {
  const m = String(mark || '').match(/([1-3])\s*담/)
  return m ? Number(m[1]) : null
}
export function homeroomMark(grade, staffKind = '교사') {
  if (grade) return `${grade}담`
  return staffKind === '교사' ? '비' : ''
}

/** 주요 업무 내용 문자열 → 항목 배열. 괄호 안의 쉼표는 자르지 않는다("고사실 배치 및 관리(좌석배치, 무시험…)") */
export function splitTasks(text) {
  const out = []
  let depth = 0
  let cur = ''
  for (const ch of String(text || '')) {
    if (ch === '(' || ch === '（') depth++
    if ((ch === ')' || ch === '）') && depth > 0) depth--
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue }
    cur += ch
  }
  out.push(cur)
  return out.map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean)
}
export const taskText = (t) => (typeof t === 'string' ? t : t?.text || '')
export function joinTasks(tasks) {
  return (tasks || []).map(taskText).filter(Boolean).join(', ')
}

/**
 * 업무 내용 카드로 맞춘다 — 문자열(예전 저장본·hwpx 가져오기)이면 줄 id·dutyKey와 순번으로 id·key를 정한다.
 * 같은 입력이면 늘 같은 값이라, 저장하기 전 여러 번 읽어도 카드가 흔들리지 않는다.
 */
export function normalizeTasks(duty) {
  return (duty.tasks || []).map((t, i) => (typeof t === 'string'
    ? { id: `${duty.id}~${i}`, key: `${duty.dutyKey || duty.id}~${i}`, text: t }
    : { ...t, id: t.id || `${duty.id}~${i}`, key: t.key || `${duty.dutyKey || duty.id}~${i}` }))
}
/** 새 업무 내용 카드 */
export const newTask = (text = '') => ({ id: newId('t'), key: newId('w'), text })

/** '하고운(국어)' → { name, subject } */
export function parseNameSubject(text) {
  const t = String(text || '').replace(/\s+/g, '')
  const m = t.match(/^([^()]+)\(([^()]*)\)$/)
  return m ? { name: m[1], subject: m[2] } : { name: t, subject: '' }
}

// ── 정렬·조회 ────────────────────────────────────────────────────────

const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0)

/** 구분 → 부서 → 카드 순으로 묶는다. 보관함 카드는 tray로 */
export function groupPlan(data) {
  const depts = [...(data.departments || [])].sort((a, b) =>
    (CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category)) || byOrder(a, b))
  const cards = new Map(depts.map((d) => [d.id, []]))
  const tray = []
  for (const duty of data.duties || []) {
    if (duty.deptId && cards.has(duty.deptId)) cards.get(duty.deptId).push(duty)
    else tray.push(duty)
  }
  for (const list of cards.values()) list.sort(byOrder)
  tray.sort(byOrder)
  const categories = CATEGORIES.map((c) => ({
    category: c,
    departments: depts.filter((d) => (d.category || CATEGORIES[0]) === c).map((d) => ({ ...d, duties: cards.get(d.id) })),
  })).filter((c) => c.departments.length)
  return { categories, tray }
}

/**
 * 두 쪽 보기 — 부서를 표 순서대로 둘로 나눈다. 줄 수(빈 부서는 1줄)가 가장 고르게 되는 부서 경계에서 끊는다.
 * @returns {[Set<string>, Set<string>]} 1쪽·2쪽의 부서 id
 */
export function splitDepartments(data) {
  const depts = groupPlan(data).categories.flatMap((c) => c.departments)
  const sizes = depts.map((d) => Math.max(1, d.duties.length))
  const total = sizes.reduce((a, b) => a + b, 0)
  let best = 0
  let bestGap = Infinity
  let acc = 0
  for (let i = 0; i <= depts.length; i++) {
    const gap = Math.abs(total - 2 * acc)
    if (gap < bestGap) { bestGap = gap; best = i }
    acc += sizes[i] || 0
  }
  return [new Set(depts.slice(0, best).map((d) => d.id)), new Set(depts.slice(best).map((d) => d.id))]
}

/** 부서 일부만 담은 묶음(표 한 쪽) — 구분·부서 병합을 그 쪽 안에서 다시 센다 */
export function pickDepartments(data, ids) {
  return { ...data, departments: (data.departments || []).filter((d) => ids.has(d.id)) }
}

/** 카드의 담당자 표시 이름 */
export function assigneeLabel(duty, nameOf = () => '') {
  return (duty.assigneeUid && nameOf(duty.assigneeUid)) || duty.assigneeName || ''
}

/** 이 사람(uid)의 카드 */
export function dutiesOf(data, uid) {
  return (data.duties || []).filter((d) => d.assigneeUid && d.assigneeUid === uid && d.deptId)
}

/** 검색 — 업무명·세부 업무·담당자·부서 */
export function matchDuty(duty, q, { deptName = '', name = '' } = {}) {
  const s = String(q || '').replace(/\s/g, '').toLowerCase()
  if (!s) return true
  return [duty.title, joinTasks(duty.tasks), name, duty.assigneeName, deptName, duty.note]
    .some((v) => String(v || '').replace(/\s/g, '').toLowerCase().includes(s))
}

/** 검색어가 이 카드에 걸리는지(카드만 강조할 때) */
export function matchTask(task, q) {
  const s = String(q || '').replace(/\s/g, '').toLowerCase()
  return Boolean(s) && `${taskText(task)}${task.note || ''}`.replace(/\s/g, '').toLowerCase().includes(s)
}

// ── 편집 (모두 새 data를 돌려준다) ──────────────────────────────────

const renumber = (list) => list.map((x, i) => ({ ...x, order: i }))

/**
 * 카드를 부서(deptId, ''=보관함)의 index 자리로 옮긴다. 같은 부서 안 순서 바꾸기도 이것으로.
 */
export function moveDuty(data, dutyId, deptId, index = Infinity) {
  const duty = (data.duties || []).find((d) => d.id === dutyId)
  if (!duty) return data
  const others = (data.duties || []).filter((d) => d.id !== dutyId)
  const target = others.filter((d) => (d.deptId || '') === (deptId || '')).sort(byOrder)
  const at = Math.max(0, Math.min(index, target.length))
  target.splice(at, 0, { ...duty, deptId: deptId || '' })
  const renumbered = new Map(renumber(target).map((d) => [d.id, d]))
  const rest = others.filter((d) => !renumbered.has(d.id))
  return { ...data, duties: [...rest, ...renumbered.values()] }
}

export function addDuty(data, deptId, fields = {}) {
  const count = (data.duties || []).filter((d) => (d.deptId || '') === (deptId || '')).length
  const duty = {
    id: newId('d'), dutyKey: newId('k'), deptId: deptId || '', order: count,
    title: '', slotLabel: '', roleType: '일반', staffKind: '교사', tasks: [], note: '',
    assigneeUid: null, assigneeName: '', ...fields,
  }
  return { data: { ...data, duties: [...(data.duties || []), duty] }, duty }
}

export function updateDuty(data, dutyId, patch) {
  return { ...data, duties: (data.duties || []).map((d) => (d.id === dutyId ? { ...d, ...patch } : d)) }
}

/**
 * 업무 나누기 — 같은 부서·업무명으로 빈 줄을 바로 뒤에 만든다. 업무 내용 카드는 끌어서 옮긴다(카드 기록이 따라간다).
 * 새 줄은 새 dutyKey를 갖고 원래 줄 키를 prevKeys로 기억한다(희망원에서 원래 업무를 지망한 사람을 이어 보려고). 담당자는 비운다.
 */
export function duplicateDuty(data, dutyId) {
  const src = (data.duties || []).find((d) => d.id === dutyId)
  if (!src) return { data, duty: null }
  const copy = {
    ...src, id: newId('d'), dutyKey: newId('k'), title: `${src.title} (나눔)`, tasks: [],
    prevKeys: [...new Set([src.dutyKey, ...(src.prevKeys || [])].filter(Boolean))],
    assigneeUid: null, assigneeName: '',
  }
  const siblings = (data.duties || []).filter((d) => (d.deptId || '') === (src.deptId || '')).sort(byOrder)
  const at = siblings.findIndex((d) => d.id === dutyId) + 1
  siblings.splice(at, 0, copy)
  const re = new Map(renumber(siblings).map((d) => [d.id, d]))
  const rest = (data.duties || []).filter((d) => !re.has(d.id))
  return { data: { ...data, duties: [...rest, ...re.values()] }, duty: re.get(copy.id) }
}

// ── 업무 내용 카드 ───────────────────────────────────────────────────

/** 카드가 있는 곳 — { dutyId('' = 보관함), index, task } */
export function findTask(data, taskId) {
  for (const d of data.duties || []) {
    const i = (d.tasks || []).findIndex((t) => t.id === taskId)
    if (i >= 0) return { dutyId: d.id, index: i, task: d.tasks[i] }
  }
  const i = (data.looseTasks || []).findIndex((t) => t.id === taskId)
  return i >= 0 ? { dutyId: '', index: i, task: data.looseTasks[i] } : null
}

const withTasks = (data, dutyId, fn) => (dutyId
  ? { ...data, duties: (data.duties || []).map((d) => (d.id === dutyId ? { ...d, tasks: fn([...(d.tasks || [])]) } : d)) }
  : { ...data, looseTasks: fn([...(data.looseTasks || [])]) })

/** 카드를 줄(dutyId, ''=보관함)의 index 자리로 옮긴다. 같은 줄 안 순서 바꾸기도 이것으로 */
export function moveTask(data, taskId, toDutyId, index = Infinity) {
  const at = findTask(data, taskId)
  if (!at) return data
  let out = withTasks(data, at.dutyId, (list) => list.filter((t) => t.id !== taskId))
  // 같은 줄 안에서 뒤로 옮기면 빠진 자리만큼 당겨진다
  const idx = at.dutyId === (toDutyId || '') && index > at.index ? index - 1 : index
  out = withTasks(out, toDutyId || '', (list) => { list.splice(Math.max(0, Math.min(idx, list.length)), 0, at.task); return list })
  return out
}

/**
 * 여러 카드를 한꺼번에 옮긴다 — ids 순서(표에 보이는 순서로 넘긴다)대로 to 줄의 index 자리에 이어 놓는다.
 * index는 옮기기 전 to 줄 기준이다(빠지는 카드가 앞에 있으면 그만큼 당긴다).
 */
export function moveTasks(data, ids, toDutyId, index = Infinity) {
  const list = ids.map((id) => findTask(data, id)).filter(Boolean)
  if (!list.length) return data
  const to = toDutyId || ''
  const before = list.filter((x) => x.dutyId === to && x.index < index).length
  let out = data
  for (const x of list) out = withTasks(out, x.dutyId, (l) => l.filter((t) => t.id !== x.task.id))
  const at = index === Infinity ? Infinity : index - before
  return withTasks(out, to, (l) => { l.splice(Math.max(0, Math.min(at, l.length)), 0, ...list.map((x) => x.task)); return l })
}

/** 두 카드 자리 맞바꾸기(같은 줄이든 다른 줄이든) */
export function swapTasks(data, aId, bId) {
  const a = findTask(data, aId)
  const b = findTask(data, bId)
  if (!a || !b || aId === bId) return data
  const put = (d, at, task) => withTasks(d, at.dutyId, (l) => l.map((t, i) => (i === at.index ? task : t)))
  return put(put(data, a, b.task), b, a.task)
}

/** 줄 끝(또는 index 자리)에 새 카드 */
export function addTask(data, dutyId, text, index = Infinity) {
  const task = newTask(text)
  return { data: withTasks(data, dutyId || '', (list) => { list.splice(Math.max(0, Math.min(index, list.length)), 0, task); return list }), task }
}

export function updateTask(data, taskId, patch) {
  const at = findTask(data, taskId)
  if (!at) return data
  return withTasks(data, at.dutyId, (list) => list.map((t) => (t.id === taskId ? { ...t, ...patch } : t)))
}

export function removeTask(data, taskId) {
  const at = findTask(data, taskId)
  if (!at) return data
  return withTasks(data, at.dutyId, (list) => list.filter((t) => t.id !== taskId))
}

/** 줄 삭제 — 그 줄의 업무 내용 카드는 보관함으로 옮긴다(내용을 잃지 않게) */
export function removeDutyKeepTasks(data, dutyId) {
  const duty = (data.duties || []).find((d) => d.id === dutyId)
  if (!duty) return data
  return {
    ...data,
    duties: (data.duties || []).filter((d) => d.id !== dutyId),
    looseTasks: [...(data.looseTasks || []), ...(duty.tasks || [])],
  }
}

/** 카드 삭제(보관함에서 지우기) */
export function removeDuty(data, dutyId) {
  return { ...data, duties: (data.duties || []).filter((d) => d.id !== dutyId) }
}

export function addDepartment(data, { name, category = CATEGORIES[0] }) {
  const order = (data.departments || []).filter((d) => d.category === category).length
  const dept = { id: newId('p'), name, category, order }
  return { data: { ...data, departments: [...(data.departments || []), dept] }, dept }
}

export function updateDepartment(data, deptId, patch) {
  return { ...data, departments: (data.departments || []).map((d) => (d.id === deptId ? { ...d, ...patch } : d)) }
}

/** 부서 삭제 — 그 부서 카드는 보관함으로 */
export function removeDepartment(data, deptId) {
  const tray = (data.duties || []).filter((d) => !d.deptId).length
  let n = tray
  return {
    ...data,
    departments: (data.departments || []).filter((d) => d.id !== deptId),
    duties: (data.duties || []).map((d) => (d.deptId === deptId ? { ...d, deptId: '', order: n++ } : d)),
  }
}

/** 같은 구분 안에서 부서 순서 옮기기(dir -1 위로/왼쪽, +1 아래로/오른쪽) */
export function shiftDepartment(data, deptId, dir) {
  const dept = (data.departments || []).find((d) => d.id === deptId)
  if (!dept) return data
  const same = (data.departments || []).filter((d) => d.category === dept.category).sort(byOrder)
  const i = same.findIndex((d) => d.id === deptId)
  const j = i + dir
  if (j < 0 || j >= same.length) return data
  ;[same[i], same[j]] = [same[j], same[i]]
  const re = new Map(renumber(same).map((d) => [d.id, d]))
  return { ...data, departments: (data.departments || []).map((d) => re.get(d.id) || d) }
}

// ── 인원 요약 · 점검 ───────────────────────────────────────────────

/** 학년부(이름이 'N학년부')인지 */
export const isGradeDept = (dept) => /^[1-3]\s*학년/.test(dept?.name || '')

/**
 * 원본 표 끝줄과 같은 인원 요약 — "학년부 : 21 + 3(특수) = 24명 ■ 일반 부서 : 21 + 3(사서, 보건, 영양) = 24명".
 * 원본은 담임을 소속 부서와 상관없이 학년부로 센다(교무기획부 고사2 하승철도 2학년 담임이면 학년부).
 * 교직원(실무사·상담사 등, staffKind≠교사)은 세지 않고, 한 사람이 카드 여러 개여도 한 명.
 */
export function summarizeStaff(data) {
  const deptIds = new Set((data.departments || []).map((d) => d.id))
  const key = (uid, name) => uid || (name ? `name:${name}` : '')
  const homeroom = new Set()
  const special = new Set()
  for (const h of data.homerooms || []) {
    const k = key(h.homeroomUid, h.homeroomName)
    if (!k) continue
    if (h.classNo === '특수') special.add(k)
    else homeroom.add(k)
  }
  const teachers = new Map()
  for (const d of data.duties || []) {
    if (!d.deptId || !deptIds.has(d.deptId) || d.staffKind !== '교사') continue
    const k = key(d.assigneeUid, d.assigneeName)
    if (!k) continue
    if (d.slotLabel === '특수') special.add(k)
    if (!teachers.has(k)) teachers.set(k, [])
    teachers.get(k).push(d)
  }
  for (const k of homeroom) special.delete(k)
  const general = [...teachers.keys()].filter((k) => !homeroom.has(k) && !special.has(k))
  const nonSubject = general.filter((k) => teachers.get(k).some((d) => NON_SUBJECT.test(d.title || '')))
  const gradeCount = homeroom.size + special.size
  return {
    homeroom: homeroom.size,
    special: special.size,
    grade: gradeCount,
    general: general.length,
    generalNonSubject: nonSubject.length,
    teachers: gradeCount + general.length,
    duties: (data.duties || []).filter((d) => d.deptId && deptIds.has(d.deptId)).length,
  }
}
/** 비교과 교사(원본 끝줄 괄호 안) — 업무명으로 */
const NON_SUBJECT = /사서|보건|영양/

/** 끝줄 문구 */
export function summaryLine(sum, { admins = 0 } = {}) {
  const total = sum.teachers + admins
  return `◯ 전체 교원 ${total}명${admins ? `(교장, 교감 ${admins}명 포함)` : ''}`
    + `   ■ 학년부 : ${sum.homeroom}${sum.special ? ` + ${sum.special}(특수)` : ''} = ${sum.grade}명`
    + `    ■ 일반 부서 : ${sum.general - sum.generalNonSubject}${sum.generalNonSubject ? ` + ${sum.generalNonSubject}(사서, 보건, 영양)` : ''} = ${sum.general}명`
}

/**
 * 점검 — 화면 경고 목록. level 'warn'(확인 필요) | 'info'
 * @param {object} data 저장 묶음
 * @param {{ nameOf?: (uid)=>string }} [o]
 */
export function validatePlan(data, { nameOf = () => '' } = {}) {
  const out = []
  const deptById = new Map((data.departments || []).map((d) => [d.id, d]))
  const placed = (data.duties || []).filter((d) => d.deptId && deptById.has(d.deptId))
  for (const dept of data.departments || []) {
    const list = placed.filter((d) => d.deptId === dept.id)
    if (!list.length) out.push({ level: 'info', text: `${dept.name}: 업무 카드가 없습니다.` })
    else if (!list.some((d) => d.roleType === '부장')) out.push({ level: 'warn', text: `${dept.name}: 부장 카드가 없습니다.` })
  }
  for (const d of placed) if (!(d.title || '').trim()) out.push({ level: 'warn', text: `${deptById.get(d.deptId).name}: 업무명이 빈 카드가 있습니다.` })

  // 사람 기준 — 배치를 시작한 편성안에서만 의미가 있다
  const who = (d) => d.assigneeUid || (d.assigneeName ? `name:${d.assigneeName}` : '')
  const byPerson = new Map()
  for (const d of placed) {
    const k = who(d)
    if (!k) continue
    if (!byPerson.has(k)) byPerson.set(k, [])
    byPerson.get(k).push(d)
  }
  const label = (k, d) => (k.startsWith('name:') ? d.assigneeName : (nameOf(k) || d.assigneeName || '이름 없음'))
  for (const [k, list] of byPerson) {
    const depts = [...new Set(list.map((d) => d.deptId))]
    if (depts.length > 1) out.push({ level: 'warn', text: `${label(k, list[0])}: 부서 ${depts.length}곳(${depts.map((id) => deptById.get(id).name).join('·')})에 배치됐습니다.` })
  }
  if (byPerson.size) {
    const empty = placed.filter((d) => !who(d)).length
    if (empty) out.push({ level: 'info', text: `담당자를 정하지 않은 카드 ${empty}개` })
    const pool = (data.staffPool || []).filter((p) => p.flag !== '전출예정' && p.flag !== '휴직')
    const missing = pool.filter((p) => !byPerson.has(p.uid || `name:${p.name}`))
    if (missing.length) out.push({ level: 'warn', text: `업무가 없는 교직원 ${missing.length}명: ${missing.map((p) => p.name).join(', ')}` })
  }
  return out
}

// ── 담임 ─────────────────────────────────────────────────────────────

/** 학년×반 격자 칸 목록(없는 칸은 빈 칸으로) */
export function homeroomSlots(data, classCounts = {}, specialClasses = {}) {
  const have = new Map((data.homerooms || []).map((h) => [`${h.grade}-${h.classNo}`, h]))
  const out = []
  for (const g of [1, 2, 3]) {
    const n = Number(classCounts[g] ?? 0)
    for (let c = 1; c <= n; c++) out.push(have.get(`${g}-${c}`) || { grade: g, classNo: c })
    if (specialClasses[g]) out.push(have.get(`${g}-특수`) || { grade: g, classNo: '특수' })
  }
  // 학급 수를 줄여 격자 밖으로 밀린 칸도 버리지 않는다
  for (const h of data.homerooms || []) if (!out.includes(h)) out.push(h)
  return out
}

/** 담임 칸 하나 고치기 — role 'homeroom' | 'sub' */
export function setHomeroom(data, grade, classNo, role, person) {
  const key = `${grade}-${classNo}`
  const list = [...(data.homerooms || [])]
  const i = list.findIndex((h) => `${h.grade}-${h.classNo}` === key)
  const cur = i >= 0 ? list[i] : { grade, classNo }
  const f = role === 'sub' ? 'subHomeroom' : 'homeroom'
  const next = { ...cur, [`${f}Uid`]: person?.uid || null, [`${f}Name`]: person?.name || '' }
  if (i >= 0) list[i] = next
  else list.push(next)
  return { ...data, homerooms: list }
}

/** 그 사람의 담임 학년(담임·특수 담임) */
export function homeroomGradeOf(data, person) {
  // uid가 둘 다 있으면 uid로, 한쪽이라도 이름 자리면 이름으로
  const h = (data.homerooms || []).find((x) =>
    (person.uid && x.homeroomUid === person.uid) ||
    (person.name && x.homeroomName === person.name && (!person.uid || !x.homeroomUid)))
  return h ? h.grade : null
}

// ── 인원 배치 ───────────────────────────────────────────────────────

/** 카드 담당자 정하기(person null이면 비움). 이름은 표시값으로 함께 저장한다 */
export function assignDuty(data, dutyId, person) {
  return updateDuty(data, dutyId, { assigneeUid: person?.uid || null, assigneeName: person?.name || '' })
}

/**
 * 이름 카드 옮기기 — from 줄의 담당자를 to 줄로. to에 이미 사람이 있으면 맞바꾸고, copy면 from은 그대로 둔다
 * (한 사람이 두 줄을 맡을 때).
 */
export function moveAssignee(data, fromId, toId, { copy = false } = {}) {
  if (!fromId || !toId || fromId === toId) return data
  const from = (data.duties || []).find((d) => d.id === fromId)
  const to = (data.duties || []).find((d) => d.id === toId)
  if (!from || !to || !from.assigneeName) return data
  const person = { uid: from.assigneeUid || null, name: from.assigneeName }
  const other = to.assigneeName ? { uid: to.assigneeUid || null, name: to.assigneeName } : null
  let out = assignDuty(data, toId, person)
  if (!copy) out = assignDuty(out, fromId, other)
  return out
}

/**
 * 이름 일괄 빼기 — 고른 부서 줄의 성명을 비운다. 담임·부담임·교과부장도 함께 비울 수 있다. 줄·카드는 그대로.
 * @param {{ deptIds?: Set<string>|null (null = 전체, 보관함 줄 포함), homerooms?: boolean, subjectHeads?: boolean }} o
 */
export function clearAssignees(data, { deptIds = null, homerooms = false, subjectHeads = false } = {}) {
  const hit = (d) => (deptIds ? deptIds.has(d.deptId) : true)
  return {
    ...data,
    duties: (data.duties || []).map((d) => (hit(d) ? { ...d, assigneeUid: null, assigneeName: '' } : d)),
    homerooms: homerooms ? (data.homerooms || []).map((h) => ({ ...h, homeroomUid: null, homeroomName: '', subHomeroomUid: null, subHomeroomName: '' })) : data.homerooms,
    subjectHeads: subjectHeads ? (data.subjectHeads || []).map((sh) => ({ ...sh, uid: null, name: '' })) : data.subjectHeads,
  }
}

/** 계정(uid)과 이어지지 않은 이름 — 줄·담임·교과부장에 이름만 있는 자리(hwpx에서 못 맞춘 이름) */
export function unlinkedNames(data) {
  const names = new Set()
  for (const d of data.duties || []) if (d.assigneeName && !d.assigneeUid) names.add(d.assigneeName)
  for (const h of data.homerooms || []) {
    if (h.homeroomName && !h.homeroomUid) names.add(h.homeroomName)
    if (h.subHomeroomName && !h.subHomeroomUid) names.add(h.subHomeroomName)
  }
  for (const sh of data.subjectHeads || []) if (sh.name && !sh.uid) names.add(sh.name)
  return [...names].sort((a, b) => a.localeCompare(b, 'ko'))
}

/** 교과부장 한 줄 고치기/추가(group 기준). person null이면 비움 */
export function setSubjectHead(data, group, patch) {
  const list = [...(data.subjectHeads || [])]
  const i = list.findIndex((s) => s.group === group)
  if (i >= 0) list[i] = { ...list[i], ...patch }
  else list.push({ group, uid: null, name: '', note: '', ...patch })
  return { ...data, subjectHeads: list }
}
export function removeSubjectHead(data, group) {
  return { ...data, subjectHeads: (data.subjectHeads || []).filter((s) => s.group !== group) }
}

const personKey = (p) => p.uid || `name:${p.name}`

/**
 * 배치 대상 명단에 사람을 더한다(이미 있으면 과목만 채운다). 이름 자리(uid 없음)를 나중에 계정과 이으면
 * 같은 이름의 카드·담임·교과부장 자리에도 uid를 붙인다(linkPerson).
 */
export function mergeStaffPool(data, people) {
  const list = [...(data.staffPool || [])]
  for (const p of people) {
    const i = list.findIndex((x) => (p.uid && x.uid === p.uid) || (!x.uid && !p.uid && x.name === p.name))
    if (i >= 0) list[i] = { ...list[i], name: list[i].name || p.name, subject: list[i].subject || p.subject || '' }
    else list.push({ uid: p.uid || null, name: p.name, subject: p.subject || '' })
  }
  return { ...data, staffPool: list }
}
export function updatePoolPerson(data, key, patch) {
  return { ...data, staffPool: (data.staffPool || []).map((p) => (personKey(p) === key ? { ...p, ...patch } : p)) }
}
export function removePoolPerson(data, key) {
  return { ...data, staffPool: (data.staffPool || []).filter((p) => personKey(p) !== key) }
}
/**
 * 이름 자리 → 계정 잇기: 명단·줄·담임·교과부장의 같은 이름(uid 없는 자리)에 uid를 붙이고, 이름도 계정 이름으로 바꾼다
 * (hwpx 표기와 계정 이름이 다를 수 있다).
 */
export function linkPerson(data, name, uid, newName = name) {
  const hit = (u, n) => !u && n === name
  return {
    ...data,
    staffPool: (data.staffPool || []).map((p) => (hit(p.uid, p.name) ? { ...p, uid, name: newName } : p)),
    duties: (data.duties || []).map((d) => (hit(d.assigneeUid, d.assigneeName) ? { ...d, assigneeUid: uid, assigneeName: newName } : d)),
    homerooms: (data.homerooms || []).map((h) => ({
      ...h,
      ...(hit(h.homeroomUid, h.homeroomName) ? { homeroomUid: uid, homeroomName: newName } : {}),
      ...(hit(h.subHomeroomUid, h.subHomeroomName) ? { subHomeroomUid: uid, subHomeroomName: newName } : {}),
    })),
    subjectHeads: (data.subjectHeads || []).map((sh) => (hit(sh.uid, sh.name) ? { ...sh, uid, name: newName } : sh)),
  }
}

/** 사람별 배치 현황 — 명단 순서대로 { key, person, duties[], homeroom, sub } */
export function staffLoad(data) {
  const deptIds = new Set((data.departments || []).map((d) => d.id))
  const match = (p, uid, name) => (p.uid ? uid === p.uid : !uid && name === p.name)
  return (data.staffPool || []).map((p) => ({
    key: personKey(p),
    person: p,
    duties: (data.duties || []).filter((d) => d.deptId && deptIds.has(d.deptId) && match(p, d.assigneeUid, d.assigneeName)),
    homeroom: (data.homerooms || []).find((h) => match(p, h.homeroomUid, h.homeroomName)) || null,
    sub: (data.homerooms || []).find((h) => match(p, h.subHomeroomUid, h.subHomeroomName)) || null,
  }))
}

// ── 희망원 ───────────────────────────────────────────────────────────

export const WISH_RANKS = 3

/** 카드 하나를 지망한 사람들 — dutyKey(나눠 만든 카드면 원래 키도)로 찾는다. [{ uid, name, rank }] 지망 순 */
export function wishersOf(duty, wishes) {
  const keys = new Set([duty.dutyKey, ...(duty.prevKeys || [])].filter(Boolean))
  const out = []
  for (const w of wishes || []) {
    const c = (w.choices || []).find((x) => keys.has(x.dutyKey))
    if (c) out.push({ uid: w.uid, name: w.name || '', rank: c.rank })
  }
  return out.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, 'ko'))
}

/** 희망원 집계 — 카드별 지망자 수와 미제출자 */
export function wishSummary(data, wishes, staff = []) {
  const deptIds = new Set((data.departments || []).map((d) => d.id))
  const cards = (data.duties || []).filter((d) => d.deptId && deptIds.has(d.deptId))
  const byCard = cards.map((d) => ({ duty: d, wishers: wishersOf(d, wishes) }))
  const submitted = new Set((wishes || []).map((w) => w.uid))
  return {
    byCard,
    submitted: submitted.size,
    missing: staff.filter((s) => !submitted.has(s.uid)),
  }
}

// ── 비교 · 기록 ──────────────────────────────────────────────────────

const sameJson = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

const DUTY_FIELD_LABEL = {
  title: '업무명', slotLabel: '번호', roleType: '직급', staffKind: '직군', tasks: '주요 업무 내용', note: '메모',
  pairKey: '정·부 짝', prevKeys: '이전 업무', assigneeUid: '담당자', assigneeName: '담당자',
}

/**
 * 두 저장 묶음의 차이를 사람이 읽는 줄로(수정 기록 요약).
 */
export function describeDataDiff(before = {}, after = {}) {
  const lines = []
  const deptName = (data, id) => (data.departments || []).find((d) => d.id === id)?.name || '보관함'
  const a = new Map((before.departments || []).map((d) => [d.id, d]))
  const b = new Map((after.departments || []).map((d) => [d.id, d]))
  for (const [id, d] of b) if (!a.has(id)) lines.push(`부서 '${d.name}' 추가`)
  for (const [id, d] of a) if (!b.has(id)) lines.push(`부서 '${d.name}' 삭제`)
  for (const [id, d] of b) {
    const p = a.get(id)
    if (p && p.name !== d.name) lines.push(`부서 '${p.name}' → '${d.name}' 이름 변경`)
    else if (p && (p.category !== d.category || p.order !== d.order)) lines.push(`부서 '${d.name}' 위치 변경`)
  }
  const da = new Map((before.duties || []).map((d) => [d.id, d]))
  const db = new Map((after.duties || []).map((d) => [d.id, d]))
  const t = (d) => d.title || '(업무명 없음)'
  for (const [id, d] of db) if (!da.has(id)) lines.push(`${deptName(after, d.deptId)} '${t(d)}' 카드 추가`)
  for (const [id, d] of da) if (!db.has(id)) lines.push(`${deptName(before, d.deptId)} '${t(d)}' 카드 삭제`)
  for (const [id, d] of db) {
    const p = da.get(id)
    if (!p) continue
    if ((p.deptId || '') !== (d.deptId || '')) lines.push(`'${t(d)}' ${deptName(before, p.deptId)} → ${deptName(after, d.deptId)} 이동`)
    const fields = [...new Set(Object.keys(DUTY_FIELD_LABEL).filter((f) => !sameJson(p[f], d[f])).map((f) => DUTY_FIELD_LABEL[f]))]
    if (fields.length) lines.push(`'${t(d)}' 수정 (${fields.join(', ')})`)
  }
  if (!sameJson(before.looseTasks, after.looseTasks)) lines.push(`보관함 업무 내용 카드 ${(before.looseTasks || []).length} → ${(after.looseTasks || []).length}장`)
  if (!sameJson(before.homerooms, after.homerooms)) lines.push('담임·부담임 배치 변경')
  if (!sameJson(before.subjectHeads, after.subjectHeads)) lines.push('교과부장 변경')
  if (!sameJson(before.headNotes || {}, after.headNotes || {})) lines.push('부장교사 명단 비고 변경')
  if (!sameJson(before.staffPool, after.staffPool)) lines.push('배치 대상 교직원 변경')
  return lines
}

/**
 * 동시 편집 병합 — 내가 연 뒤 다른 사람이 먼저 저장했으면 최신본(latest) 위에 내 변경(base → mine)을
 * 항목 하나 단위로 다시 얹는다(academicPlan.js mergePlanData와 같은 원칙). 같은 항목을 둘 다 다르게
 * 고쳤으면 최신본을 남기고 conflicts로 알린다.
 */
export function mergeDutyPlan(base, mine, latest) {
  const conflicts = []
  const mergeList = (key, idOf, nameOf) => {
    const b = new Map((base[key] || []).map((x) => [idOf(x), x]))
    const m = new Map((mine[key] || []).map((x) => [idOf(x), x]))
    const out = new Map((latest[key] || []).map((x) => [idOf(x), x]))
    for (const [id, me] of m) {
      const be = b.get(id)
      const le = out.get(id)
      if (!be) { if (!le) out.set(id, me); continue }
      if (sameJson(be, me)) continue
      if (!le) { conflicts.push(`'${nameOf(me)}' — 다른 사람이 삭제해 내 수정은 반영하지 않았습니다.`); continue }
      if (sameJson(be, le) || sameJson(le, me)) out.set(id, me)
      else conflicts.push(`'${nameOf(me)}' — 다른 사람도 고쳐서 최신본을 남겼습니다.`)
    }
    for (const [id, be] of b) {
      if (m.has(id)) continue
      const le = out.get(id)
      if (!le) continue
      if (sameJson(be, le)) out.delete(id)
      else conflicts.push(`'${nameOf(be)}' — 다른 사람이 고쳐서 삭제하지 않았습니다.`)
    }
    return [...out.values()]
  }
  return {
    departments: mergeList('departments', (x) => x.id, (x) => x.name),
    duties: mergeList('duties', (x) => x.id, (x) => x.title || '업무 줄'),
    looseTasks: mergeList('looseTasks', (x) => x.id, (x) => x.text || '업무 내용 카드'),
    homerooms: mergeList('homerooms', (x) => `${x.grade}-${x.classNo}`, (x) => `${x.grade}학년 ${x.classNo}반 담임`),
    subjectHeads: mergeList('subjectHeads', (x) => x.group, (x) => `${x.group} 교과부장`),
    staffPool: mergeList('staffPool', (x) => x.uid || `name:${x.name}`, (x) => x.name),
    headNotes: { ...(latest.headNotes || {}), ...Object.fromEntries(Object.entries(mine.headNotes || {}).filter(([k, v]) => (base.headNotes || {})[k] !== v)) },
    conflicts,
  }
}

/** 저장 묶음만 뽑기(문서 → data) */
export function planData(plan) {
  return {
    departments: plan?.departments || [],
    duties: (plan?.duties || []).map((d) => ({ ...d, tasks: normalizeTasks(d) })),
    looseTasks: plan?.looseTasks || [],
    homerooms: plan?.homerooms || [],
    subjectHeads: plan?.subjectHeads || [],
    staffPool: plan?.staffPool || [],
    headNotes: plan?.headNotes || {},
  }
}

/**
 * 다음 학년도(또는 같은 해 다음 편성안)로 복제 — 카드 id는 새로, dutyKey는 그대로.
 * @param {{ keepAssignees?: boolean }} o keepAssignees false면 담당자·담임·교과부장을 비운다(업무분장안)
 */
export function clonePlanData(data, { keepAssignees = true } = {}) {
  const deptIds = new Map((data.departments || []).map((d) => [d.id, newId('p')]))
  const departments = (data.departments || []).map((d) => ({ ...d, id: deptIds.get(d.id) }))
  const cloneTask = (t) => ({ ...t, id: newId('t') })
  const duties = (data.duties || []).map((d) => ({
    ...d,
    id: newId('d'),
    deptId: d.deptId ? (deptIds.get(d.deptId) || '') : '',
    tasks: normalizeTasks(d).map(cloneTask),
    ...(keepAssignees ? {} : { assigneeUid: null, assigneeName: '' }),
  }))
  return {
    departments,
    duties,
    looseTasks: (data.looseTasks || []).map(cloneTask),
    homerooms: keepAssignees ? (data.homerooms || []) : [],
    subjectHeads: keepAssignees ? (data.subjectHeads || []) : (data.subjectHeads || []).map((s) => ({ ...s, uid: null, name: '' })),
    staffPool: data.staffPool || [],
    headNotes: Object.fromEntries(Object.entries(data.headNotes || {}).map(([k, v]) => [deptIds.get(k) || k, v])),
  }
}

/**
 * 비교 — 사람 기준 이동표(A안 → B안). 한 사람이 어느 부서·업무에서 어디로 갔는지.
 * @returns {{ key, name, before: string[], after: string[] }[]} 바뀐 사람만
 */
export function diffAssignments(a, b, nameOf = () => '') {
  const view = (data) => {
    const deptName = new Map((data.departments || []).map((d) => [d.id, d.name]))
    const m = new Map()
    for (const d of data.duties || []) {
      if (!d.deptId) continue
      const k = d.assigneeUid || (d.assigneeName ? `name:${d.assigneeName}` : '')
      if (!k) continue
      if (!m.has(k)) m.set(k, { name: nameOf(d.assigneeUid) || d.assigneeName, items: [] })
      m.get(k).items.push(`${deptName.get(d.deptId) || ''} ${d.title}`.trim())
    }
    return m
  }
  const va = view(a)
  const vb = view(b)
  const keys = new Set([...va.keys(), ...vb.keys()])
  const out = []
  for (const k of keys) {
    const before = (va.get(k)?.items || []).sort()
    const after = (vb.get(k)?.items || []).sort()
    if (sameJson(before, after)) continue
    out.push({ key: k, name: va.get(k)?.name || vb.get(k)?.name || '', before, after })
  }
  return out.sort((x, y) => x.name.localeCompare(y.name, 'ko'))
}

// ── 확정 반영(teacherAssignments) ───────────────────────────────────

/**
 * 확정된 편성안을 교직원 배정(teacherAssignments/{year}_{uid})에 반영할 때 바뀌는 칸.
 * uid가 있는 사람만 — uid 없는 이름 자리는 반영할 수 없어 skipped로 알린다.
 * 사람마다 첫 카드(부장 카드 우선)의 부서를 소속 부서로 본다. 직함은 부장을 맡으면 '{부서}부장'으로, 부장 직함이던
 * 사람이 부장 카드가 없으면 비운다 — 그 밖의 직함(수석교사 등)은 건드리지 않는다.
 * @param {object} data 저장 묶음
 * @param {Map<string, object>|object} current uid → 현재 teacherAssignments 문서(없으면 빈 객체)
 * @returns {{ changes: { uid, name, fields: { [field]: { from, to } } }[], skipped: string[] }}
 */
export function assignmentChanges(data, current, nameOf = () => '') {
  const cur = current instanceof Map ? current : new Map(Object.entries(current || {}))
  const deptById = new Map((data.departments || []).map((d) => [d.id, d]))
  const per = new Map()
  const skipped = new Set()
  const ensure = (uid) => {
    if (!per.has(uid)) per.set(uid, { duties: [], homeroom: null, sub: null })
    return per.get(uid)
  }
  for (const d of data.duties || []) {
    if (!d.deptId || !deptById.has(d.deptId)) continue
    if (d.assigneeUid) ensure(d.assigneeUid).duties.push(d)
    else if (d.assigneeName) skipped.add(d.assigneeName)
  }
  for (const h of data.homerooms || []) {
    if (h.homeroomUid) ensure(h.homeroomUid).homeroom = h
    else if (h.homeroomName) skipped.add(h.homeroomName)
    if (h.subHomeroomUid) ensure(h.subHomeroomUid).sub = h
    else if (h.subHomeroomName) skipped.add(h.subHomeroomName)
  }
  const changes = []
  for (const [uid, p] of per) {
    const sorted = [...p.duties].sort((a, b) => (a.roleType === '부장' ? -1 : 0) - (b.roleType === '부장' ? -1 : 0))
    const main = sorted[0]
    const dept = main ? deptById.get(main.deptId) : null
    const special = p.homeroom?.classNo === '특수'
    const to = {
      ...(dept ? { department: dept.name } : {}),
      ...(main ? { duty: sorted.map((d) => d.title).filter(Boolean).join(', ') } : {}),
      isHomeroom: !!p.homeroom && !special,
      homeroomGrade: p.homeroom && !special ? p.homeroom.grade : null,
      homeroomClassNo: p.homeroom && !special ? Number(p.homeroom.classNo) : null,
      isSubHomeroom: !!p.sub,
      subHomeroomGrade: p.sub ? p.sub.grade : null,
      subHomeroomClassNo: p.sub ? Number(p.sub.classNo) : null,
    }
    const now = cur.get(uid) || {}
    if (main?.roleType === '부장') to.positionLabel = `${dept.name.replace(/부$/, '')}부장`
    else if (/부장/.test(now.positionLabel || '')) to.positionLabel = ''
    const fields = {}
    for (const [f, v] of Object.entries(to)) {
      const was = now[f] ?? (typeof v === 'boolean' ? false : (v === null ? null : ''))
      if (!sameJson(was, v)) fields[f] = { from: now[f] ?? null, to: v }
    }
    if (Object.keys(fields).length) changes.push({ uid, name: nameOf(uid) || main?.assigneeName || '', fields })
  }
  return { changes: changes.sort((a, b) => a.name.localeCompare(b.name, 'ko')), skipped: [...skipped] }
}

// ── 결재 첨부(부서별 업무분장표 · 부장/담임/교과부장 명단) ───────────────

/**
 * 원본 hwpx 첫째 절과 같은 표의 행 — 구분·부서 칸은 첫 행에만 rowSpan을 단다. 보관함 카드는 빠진다.
 * @returns {{ category, categorySpan, dept, deptSpan, slotLabel, name, mark, title, tasks: string }[]}
 */
export function approvalRows(data) {
  const out = []
  for (const { category, departments } of groupPlan(data).categories) {
    const start = out.length
    for (const dept of departments) {
      const deptStart = out.length
      // 같은 부서 안에서 교사 번호(1·2…)는 순서대로 다시 매긴다 — 카드를 옮기면 원래 번호가 어긋나므로
      let no = 0
      for (const d of dept.duties) {
        const numbered = /^\d+$/.test(String(d.slotLabel || '').trim()) || !String(d.slotLabel || '').trim()
        const slotLabel = numbered && d.staffKind === '교사' ? String(++no) : d.slotLabel
        out.push({
          id: d.id, category, categorySpan: 0, dept: dept.name, deptSpan: 0, slotLabel,
          name: d.assigneeName || '', mark: d.assigneeName ? homeroomMark(homeroomGradeOf(data, { uid: d.assigneeUid, name: d.assigneeName }), d.staffKind) : '',
          title: d.title || '', tasks: joinTasks(d.tasks),
        })
      }
      if (out.length > deptStart) out[deptStart].deptSpan = out.length - deptStart
      else out.push({ category, categorySpan: 0, dept: dept.name, deptSpan: 1, slotLabel: '', name: '', mark: '', title: '', tasks: '' })
    }
    if (out.length > start) out[start].categorySpan = out.length - start
  }
  return out
}

/**
 * 작년 대비 변경 요약(결재 첨부용) — 업무를 dutyKey로 이어 본다(나눈 카드는 prevKeys로).
 * @returns {{ added, removed, moved, renamed, handover, split }} 각 항목 { title, dept, before?, after?, from?, to? }
 */
export function yearOverYear(prev, next) {
  const view = (data) => {
    const deptName = new Map((data.departments || []).map((d) => [d.id, d.name]))
    return (data.duties || []).filter((d) => d.deptId && deptName.has(d.deptId)).map((d) => ({ ...d, dept: deptName.get(d.deptId) }))
  }
  const a = view(prev || {})
  const b = view(next || {})
  const aByKey = new Map(a.map((d) => [d.dutyKey, d]))
  const bKeys = new Set(b.map((d) => d.dutyKey))
  const continued = new Set(b.flatMap((d) => [d.dutyKey, ...(d.prevKeys || [])]))
  const out = { added: [], removed: [], moved: [], renamed: [], handover: [], split: [] }
  for (const d of b) {
    const p = aByKey.get(d.dutyKey)
    if (!p) {
      const from = (d.prevKeys || []).map((k) => aByKey.get(k)).filter(Boolean)
      if (from.length) out.split.push({ title: d.title, dept: d.dept, from: from.map((x) => `${x.dept} ${x.title}`).join(', ') })
      else out.added.push({ title: d.title, dept: d.dept })
      continue
    }
    if (p.dept !== d.dept) out.moved.push({ title: d.title, from: p.dept, to: d.dept })
    if (p.title !== d.title) out.renamed.push({ dept: d.dept, from: p.title, to: d.title })
    const who = (x) => x.assigneeName || ''
    if (who(p) !== who(d)) out.handover.push({ title: d.title, dept: d.dept, before: who(p), after: who(d) })
  }
  for (const p of a) if (!bKeys.has(p.dutyKey) && !continued.has(p.dutyKey)) out.removed.push({ title: p.title, dept: p.dept })
  return out
}

/** 부장교사 명단 — 부서마다 부장 카드의 담당자와 과목(staffPool) */
export function headRoster(data) {
  return groupPlan(data).categories.flatMap((c) => c.departments).map((dept) => {
    const head = dept.duties.find((d) => d.roleType === '부장')
    return { deptId: dept.id, dept: dept.name, name: head?.assigneeName || '', subject: head ? subjectOf(data, head.assigneeUid, head.assigneeName) : '', note: (data.headNotes || {})[dept.id] || '' }
  })
}

/** 배치 대상 명단(staffPool)의 과목 */
export function subjectOf(data, uid, name) {
  const p = (data.staffPool || []).find((x) => (uid && x.uid === uid) || (name && x.name === name))
  return p?.subject || ''
}

/** '이름(과목)' — 과목을 모르거나 특수면 이름만 */
export function nameWithSubject(data, uid, name) {
  if (!name) return ''
  const s = subjectOf(data, uid, name)
  return s && s !== '특수' ? `${name}(${s})` : name
}

// ── 한글(hwpx) 업무분장표 가져오기 ───────────────────────────────────

/**
 * hwpx 표(셀 주소·병합을 가진 행 목록)를 저장 묶음으로 해석한다.
 * 기대하는 양식(선유고 2026 업무분장, section0/section1):
 *   부서별 업무분장 — 구분 · 부서 · 번호 · 성명 · 담임 · 업무 · 주요 업무 내용 (구분·부서는 세로 병합)
 *   담임/부담임 명단 — 학년마다 [반, 담임(과목), 부담임] 세 칸, 특수반은 담임이 두 칸 병합
 *   교과부장 명단 — 교과 · 부장 · 비고
 * @param {{ rows: { col:number, rowSpan:number, colSpan:number, text:string }[][] }[]} tables 문서 순서대로
 * @returns {{ departments, duties, homerooms, subjectHeads, staffPool, title, warnings: string[] }}
 */
export function interpretDutyTables(tables, { title = '' } = {}) {
  const departments = []
  const duties = []
  const homerooms = []
  const subjectHeads = []
  const warnings = []
  const subjects = new Map() // 이름 → 과목(담임 명단에서)
  const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim()
  const tight = (s) => String(s || '').replace(/\s+/g, '')

  for (const table of tables) {
    const head = (table.rows[0] || []).map((c) => tight(c.text))
    // ① 부서별 업무분장
    if (head.includes('부서') && head.includes('성명') && head.some((h) => h.includes('업무'))) {
      let category = CATEGORIES[0]
      let dept = null
      for (const row of table.rows.slice(1)) {
        if (row.length === 1 && row[0].colSpan > 3) continue // 끝줄 인원 요약
        const at = (col) => row.find((c) => c.col === col)
        if (at(0)) category = tight(at(0).text) || category
        if (at(1)) {
          const name = tight(at(1).text)
          dept = departments.find((d) => d.name === name && d.category === category)
          if (!dept) {
            dept = { id: newId('p'), name, category, order: departments.filter((d) => d.category === category).length }
            departments.push(dept)
          }
        }
        if (!dept || !at(3)) continue
        const slotLabel = clean(at(2)?.text)
        const name = tight(at(3).text)
        const dutyTitle = clean(at(5)?.text)
        const staffKind = staffKindOf(slotLabel)
        duties.push({
          id: newId('d'), dutyKey: newId('k'), deptId: dept.id,
          order: duties.filter((d) => d.deptId === dept.id).length,
          title: dutyTitle, slotLabel, roleType: roleTypeOf(dutyTitle), staffKind,
          tasks: splitTasks(at(6)?.text).map((text) => newTask(text)), note: '',
          assigneeUid: null, assigneeName: name,
          homeroomMark: tight(at(4)?.text),
        })
      }
      continue
    }
    // ② 담임/부담임 — 첫 행이 '1학년 | 2학년 | 3학년'
    if (head.some((h) => /^[1-3]학년$/.test(h)) && !head.includes('부서')) {
      const gradeCols = (table.rows[0] || []).map((c) => ({ col: c.col, grade: Number(tight(c.text)[0]) })).filter((g) => g.grade)
      for (const row of table.rows.slice(2)) {
        for (const { col, grade } of gradeCols) {
          const cls = row.find((c) => c.col === col)
          if (!cls) continue
          const classText = tight(cls.text)
          const classNo = classText === '특수' ? '특수' : Number(classText)
          if (!classNo) continue
          const hr = parseNameSubject(row.find((c) => c.col === col + 1)?.text)
          const subCell = row.find((c) => c.col === col + 2)
          const sub = parseNameSubject(subCell?.text)
          if (hr.subject) subjects.set(hr.name, hr.subject)
          else if (classNo === '특수' && hr.name) subjects.set(hr.name, '특수')
          if (sub.subject) subjects.set(sub.name, sub.subject)
          homerooms.push({
            grade, classNo,
            homeroomUid: null, homeroomName: hr.name,
            subHomeroomUid: null, subHomeroomName: classNo === '특수' ? '' : sub.name,
          })
        }
      }
      continue
    }
    // ③ 교과부장
    if (head[0] === '교과' && head[1] === '부장') {
      for (const row of table.rows.slice(1)) {
        const group = clean(row[0]?.text)
        if (!group) continue
        subjectHeads.push({ group, uid: null, name: tight(row[1]?.text), note: clean(row[2]?.text) })
      }
      continue
    }
    // 부장교사 명단(부서·부장·과목)은 업무분장표에서 만들 수 있어 과목만 챙긴다
    if (head[0] === '부서' && head[1] === '부장') {
      for (const row of table.rows.slice(1)) {
        const name = tight(row[1]?.text)
        const subject = clean(row[2]?.text)
        if (name && subject && !subjects.has(name)) subjects.set(name, subject)
      }
    }
  }

  // 담임 칸 표기('1담')가 담임 명단과 어긋나면 알린다
  const hrGrade = new Map(homerooms.map((h) => [h.homeroomName, h.grade]))
  for (const d of duties) {
    const g = parseHomeroomMark(d.homeroomMark)
    const listed = hrGrade.get(d.assigneeName) ?? null
    if (homerooms.length && d.staffKind === '교사' && g !== listed) {
      warnings.push(`${d.assigneeName}: 업무분장표 담임 칸 '${d.homeroomMark}'이 담임 명단과 다릅니다.`)
    }
    delete d.homeroomMark
  }
  if (!departments.length) warnings.push('부서별 업무분장 표를 찾지 못했습니다.')

  const names = [...new Set([
    ...duties.map((d) => d.assigneeName),
    ...homerooms.flatMap((h) => [h.homeroomName, h.subHomeroomName]),
    ...subjectHeads.map((s) => s.name),
  ].filter(Boolean))]
  const staffPool = names.map((name) => ({ uid: null, name, subject: subjects.get(name) || '' }))
  return { departments, duties, looseTasks: [], homerooms, subjectHeads, staffPool, title, warnings }
}

/**
 * 이름 매칭 결과(name → uid)를 저장 묶음에 입힌다. 매칭 안 된 이름은 이름 자리로 남는다.
 */
export function applyNameMatches(data, uidByName) {
  const get = (name) => (name && uidByName.get(name)) || null
  return {
    ...data,
    duties: (data.duties || []).map((d) => ({ ...d, assigneeUid: d.assigneeUid || get(d.assigneeName) })),
    homerooms: (data.homerooms || []).map((h) => ({
      ...h,
      homeroomUid: h.homeroomUid || get(h.homeroomName),
      subHomeroomUid: h.subHomeroomUid || get(h.subHomeroomName),
    })),
    subjectHeads: (data.subjectHeads || []).map((s) => ({ ...s, uid: s.uid || get(s.name) })),
    staffPool: (data.staffPool || []).map((p) => ({ ...p, uid: p.uid || get(p.name) })),
  }
}
