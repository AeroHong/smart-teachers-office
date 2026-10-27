/**
 * 학사일정 제작 도구 — 순수 계산 엔진. Firestore를 import하지 않아 `node --test`로 그대로 검증한다.
 * 화면·인쇄·초안 비교가 모두 이 파일의 함수 하나로 수업일수를 센다(손으로 세다 틀리는 일을 없애려는 것이
 * 이 도구의 목적이라, 계산은 여기 한 곳에만 둔다).
 *
 * 날짜는 전부 'YYYY-MM-DD' 문자열. 요일 계산은 UTC로 해서 시간대에 흔들리지 않는다.
 *
 * 초안(plan) 모양 — schools/{sid}/academicPlans/{planId}
 *   year       number            학년도(3월 시작). 격자는 year-03-01 ~ (year+1)-02 말일
 *   holidays   [{date, name}]    공휴일(구글 한국 공휴일 캘린더에서 가져옴)
 *   events     [event]
 *
 * event
 *   id, date, endDate?(포함), title
 *   kind       EVENT_KINDS 중 하나
 *   grades     [1,2,3]           대상 학년. 비거나 없으면 전 학년
 *   dept?      관련 부서
 *   fullDay    boolean           전일행사(실수업일에서 뺀다)
 *   examType?  '중간' | '기말'   kind가 정기고사일 때
 *   weekdaySwap? 0~4             kind가 요일교체일 때 — 그날을 월(0)~금(4) 수업으로 센다
 *   activities [{type:'자율'|'동아리', hours, grades?}]   창의적 체험활동 시수(합산만)
 *   note?
 *
 * 정의 (학년 g마다)
 *   학기 범위   1학기 = 첫 개학 ~ 방학식, 2학기 = 그 다음 개학 ~ 종업식/졸업식(g 대상인 것)
 *   수업일      학기 범위 안의 월~금 중 공휴일·g 대상 재량휴업일이 아닌 날. 토·일은 행사가 있어도 미포함
 *   요일        요일교체 일정이 있으면 그 요일로 센다
 *   정기고사일  g 대상 정기고사가 있는 수업일 (하루에 여러 건이어도 1일)
 *   전일행사일  g 대상 fullDay 일정이 있는 수업일 (정기고사일과 겹치면 정기고사로만 센다)
 *   실수업일    수업일 − 정기고사일 − 전일행사일
 *   중간-기말   g의 마지막 중간고사일 다음날 ~ 첫 기말고사일 전날의 실수업일(전일행사일 제외 — 진도를 나갈 수 있는 날)
 */

export const EVENT_KINDS = ['일반', '개학', '방학식', '종업식', '졸업식', '정기고사', '재량휴업', '공휴일', '요일교체']
export const SCHOOL_WEEKDAYS = ['월', '화', '수', '목', '금']
export const WEEK_LABELS = ['월', '화', '수', '목', '금', '토', '일']
export const GRADES = [1, 2, 3]
export const ACTIVITY_TYPES = ['자율', '동아리']
/** 학기별 요일 실수업일이 이보다 적으면 경고한다(엑셀의 '=16*5'). */
export const MIN_WEEKDAY_DAYS = 16

// ── 날짜 ────────────────────────────────────────────────────────────

function utc(key) {
  const [y, m, d] = String(key).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function keyOf(date) {
  return date.toISOString().slice(0, 10)
}

export function isDateKey(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && keyOf(utc(s)) === s
}

export function addDays(key, n) {
  const d = utc(key)
  d.setUTCDate(d.getUTCDate() + n)
  return keyOf(d)
}

/** 0 = 일요일 … 6 = 토요일 (Date.getDay와 같다) */
export function dayOfWeek(key) {
  return utc(key).getUTCDay()
}

/** 월=0 … 일=6 */
export function mondayIndex(key) {
  return (dayOfWeek(key) + 6) % 7
}

export function daysBetween(a, b) {
  return Math.round((utc(b) - utc(a)) / 86400000)
}

/** a부터 b까지(둘 다 포함) 날짜 목록 */
export function dateRange(a, b) {
  const out = []
  if (!a || !b || a > b) return out
  for (let k = a; k <= b; k = addDays(k, 1)) out.push(k)
  return out
}

export function monthOf(key) {
  return Number(key.slice(5, 7))
}

/** 'M/D(요일)' */
export function shortLabel(key) {
  return `${monthOf(key)}/${Number(key.slice(8, 10))}(${WEEK_LABELS[mondayIndex(key)]})`
}

/** 학년도 격자 범위: year-03-01 ~ (year+1)-02 말일 */
export function yearRange(year) {
  const start = `${year}-03-01`
  const end = addDays(`${year + 1}-03-01`, -1)
  return { start, end }
}

// ── 일정 ────────────────────────────────────────────────────────────

export function eventDates(ev) {
  if (!isDateKey(ev?.date)) return []
  const end = isDateKey(ev.endDate) && ev.endDate > ev.date ? ev.endDate : ev.date
  return dateRange(ev.date, end)
}

export function appliesTo(ev, grade) {
  return !Array.isArray(ev?.grades) || ev.grades.length === 0 || ev.grades.includes(grade)
}

/** 날짜 → 그날 걸친 일정 목록 */
export function indexEventsByDate(events = []) {
  const map = new Map()
  for (const ev of events) {
    for (const k of eventDates(ev)) {
      if (!map.has(k)) map.set(k, [])
      map.get(k).push(ev)
    }
  }
  return map
}

export function holidayMap(plan) {
  const map = new Map()
  for (const h of plan?.holidays || []) if (isDateKey(h.date)) map.set(h.date, h.name || '공휴일')
  for (const ev of plan?.events || []) {
    if (ev.kind !== '공휴일') continue
    for (const k of eventDates(ev)) map.set(k, ev.title || '공휴일')
  }
  return map
}

// ── 학기 범위 ────────────────────────────────────────────────────────

function sortedDates(events, kinds, grade) {
  return events
    .filter((ev) => kinds.includes(ev.kind) && appliesTo(ev, grade) && isDateKey(ev.date))
    .map((ev) => ev.date)
    .sort()
}

/**
 * 학년 g의 학기 범위. 일정이 덜 들어와 끝이 없으면 end는 null(그 학기는 아직 셀 수 없음).
 * @returns {{1: {start,end}|null, 2: {start,end}|null}}
 */
export function semesterRanges(plan, grade) {
  const events = plan?.events || []
  const starts = sortedDates(events, ['개학'], grade)
  const breaks = sortedDates(events, ['방학식'], grade)
  const finals = sortedDates(events, ['종업식', '졸업식'], grade)
  const out = { 1: null, 2: null }
  if (!starts.length) return out
  const s1 = starts[0]
  const e1 = breaks.find((d) => d >= s1) || null
  out[1] = { start: s1, end: e1 }
  if (!e1) return out
  const s2 = starts.find((d) => d > e1) || null
  if (!s2) return out
  out[2] = { start: s2, end: finals.find((d) => d >= s2) || null }
  return out
}

// ── 하루 판정 ───────────────────────────────────────────────────────

/**
 * 학년 g 기준 그날의 성격.
 * @returns {{semester, holiday, closure, schoolDay, weekday, exam, fullDay, vacation}}
 *   weekday: 수업일로 셀 요일 0~4(요일교체 반영), 수업일이 아니면 null
 */
export function classifyDay(ctx, grade, key) {
  const { ranges, holidays, byDate } = ctx
  const r = ranges[grade]
  let semester = null
  for (const no of [1, 2]) {
    const rg = r[no]
    if (rg && rg.end && key >= rg.start && key <= rg.end) semester = no
  }
  const evs = (byDate.get(key) || []).filter((ev) => appliesTo(ev, grade))
  const holiday = holidays.get(key) || null
  const closure = evs.some((ev) => ev.kind === '재량휴업')
  const dow = mondayIndex(key)
  const schoolDay = semester !== null && dow < 5 && !holiday && !closure
  const swap = evs.find((ev) => ev.kind === '요일교체' && Number.isInteger(ev.weekdaySwap))
  const weekday = schoolDay ? (swap ? swap.weekdaySwap : dow) : null
  const examEv = evs.find((ev) => ev.kind === '정기고사')
  const exam = schoolDay && examEv ? (examEv.examType || '정기') : null
  const fullDay = schoolDay && !exam && evs.some((ev) => ev.fullDay)
  return { semester, holiday, closure, schoolDay, weekday, exam, fullDay, vacation: semester === null }
}

export function makeContext(plan) {
  const ranges = {}
  for (const g of GRADES) ranges[g] = semesterRanges(plan, g)
  return { plan, ranges, holidays: holidayMap(plan), byDate: indexEventsByDate(plan?.events || []) }
}

// ── 집계 ────────────────────────────────────────────────────────────

const zero5 = () => [0, 0, 0, 0, 0]
const sum = (a) => a.reduce((s, x) => s + x, 0)

function emptySemesterStats() {
  return { schoolDays: zero5(), exams: zero5(), fullDays: zero5(), actual: zero5(), between: zero5(), activities: { 자율: 0, 동아리: 0 } }
}

function addInto(t, s) {
  for (const f of ['schoolDays', 'exams', 'fullDays', 'actual', 'between']) for (let i = 0; i < 5; i++) t[f][i] += s[f][i]
  for (const a of ACTIVITY_TYPES) t.activities[a] += s.activities[a]
}

function totals(s) {
  return {
    ...s,
    total: {
      schoolDays: sum(s.schoolDays), exams: sum(s.exams), fullDays: sum(s.fullDays),
      actual: sum(s.actual), between: sum(s.between),
      activities: s.activities.자율 + s.activities.동아리,
    },
  }
}

/**
 * 학년별·학기별·요일별 통계.
 * @returns {{ grades: {[g]: {1, 2, year, ranges}}, warnings: [{grade, semester, weekday, actual}] }}
 */
export function computeStats(plan) {
  const ctx = makeContext(plan)
  const result = { grades: {}, warnings: [] }
  for (const g of GRADES) {
    const sem = { 1: emptySemesterStats(), 2: emptySemesterStats() }
    for (const no of [1, 2]) {
      const rg = ctx.ranges[g][no]
      if (!rg || !rg.end) continue
      const s = sem[no]
      const days = dateRange(rg.start, rg.end)
      let lastMid = null
      let firstFinal = null
      for (const k of days) {
        const d = classifyDay(ctx, g, k)
        if (!d.schoolDay) continue
        s.schoolDays[d.weekday]++
        if (d.exam) {
          s.exams[d.weekday]++
          if (d.exam === '중간') lastMid = k
          if (d.exam === '기말' && !firstFinal) firstFinal = k
        } else if (d.fullDay) s.fullDays[d.weekday]++
      }
      for (let i = 0; i < 5; i++) s.actual[i] = s.schoolDays[i] - s.exams[i] - s.fullDays[i]
      if (lastMid && firstFinal && lastMid < firstFinal) {
        for (const k of dateRange(addDays(lastMid, 1), addDays(firstFinal, -1))) {
          const d = classifyDay(ctx, g, k)
          if (d.schoolDay && !d.exam && !d.fullDay) s.between[d.weekday]++
        }
      }
      for (const ev of plan?.events || []) {
        if (!isDateKey(ev.date) || ev.date < rg.start || ev.date > rg.end) continue
        for (const a of ev.activities || []) {
          if (!ACTIVITY_TYPES.includes(a.type)) continue
          const target = Array.isArray(a.grades) && a.grades.length ? a.grades : (ev.grades?.length ? ev.grades : GRADES)
          if (target.includes(g)) s.activities[a.type] += Number(a.hours) || 0
        }
      }
      for (let i = 0; i < 5; i++) {
        if (s.actual[i] < MIN_WEEKDAY_DAYS) result.warnings.push({ grade: g, semester: no, weekday: i, actual: s.actual[i] })
      }
    }
    const year = emptySemesterStats()
    addInto(year, sem[1])
    addInto(year, sem[2])
    result.grades[g] = { 1: totals(sem[1]), 2: totals(sem[2]), year: totals(year), ranges: ctx.ranges[g] }
  }
  return result
}

// ── 격자 ────────────────────────────────────────────────────────────

/**
 * 엑셀과 같은 주 단위 격자. 월~일 7칸, 주가 월말·월초에 걸치면 달마다 한 줄씩 나눈다.
 * weekNo는 학기마다 개학 주를 1로 센다(학기 밖 주는 null).
 * schoolDays는 한 학년이라도 수업일인 날의 수(엑셀 '주합계').
 * @returns [{month, weekNo, semester, days: [key|null ×7], schoolDays}]
 */
export function buildWeekRows(plan) {
  const { start, end } = yearRange(plan.year)
  const ctx = makeContext(plan)
  const rows = []
  let monday = addDays(start, -mondayIndex(start))
  const semStartMonday = {}
  for (const no of [1, 2]) {
    const firsts = GRADES.map((g) => ctx.ranges[g][no]?.start).filter(Boolean).sort()
    if (firsts.length) semStartMonday[no] = addDays(firsts[0], -mondayIndex(firsts[0]))
  }
  for (; monday <= end; monday = addDays(monday, 7)) {
    const week = dateRange(monday, addDays(monday, 6))
    const months = [...new Set(week.filter((k) => k >= start && k <= end).map(monthOf))]
    for (const m of months) {
      const days = week.map((k) => (k >= start && k <= end && monthOf(k) === m ? k : null))
      let schoolDays = 0
      let semester = null
      for (const k of days) {
        if (!k) continue
        const ds = GRADES.map((g) => classifyDay(ctx, g, k))
        if (ds.some((d) => d.schoolDay)) schoolDays++
        const s = ds.find((d) => d.semester)?.semester
        if (s) semester = s
      }
      let weekNo = null
      if (semester && semStartMonday[semester]) weekNo = daysBetween(semStartMonday[semester], monday) / 7 + 1
      rows.push({ month: m, monday, weekNo, semester, days, schoolDays })
    }
  }
  return rows
}

/** 학기 화면·인쇄용으로 행을 고른다: 1학기 = 3~7월, 2학기 = 8월~2월 */
export function rowsForSemester(rows, no) {
  if (!no) return rows
  return rows.filter((r) => (no === 1 ? r.month >= 3 && r.month <= 7 : r.month >= 8 || r.month <= 2))
}

// ── 편집 보조 ───────────────────────────────────────────────────────

/** 일정을 n일 옮긴다(기간 일정은 기간을 유지). */
export function shiftEvent(ev, toDate) {
  const n = daysBetween(ev.date, toDate)
  const next = { ...ev, date: toDate }
  if (isDateKey(ev.endDate)) next.endDate = addDays(ev.endDate, n)
  return next
}

/**
 * 지난 학년도 일정을 다음 학년도로: 같은 요일로 옮긴다(364일 = 52주).
 * 공휴일·요일교체처럼 날짜에 묶인 것은 빼고, 학년도 범위를 벗어나면 버린다.
 */
export function rollEventsToNextYear(events, nextYear) {
  const { start, end } = yearRange(nextYear)
  return (events || [])
    .filter((ev) => ev.kind !== '공휴일' && ev.kind !== '요일교체')
    .map((ev) => shiftEvent(ev, addDays(ev.date, 364)))
    .filter((ev) => ev.date >= start && ev.date <= end)
}

/** 일정 표시 제목: 창체 시수 + 제목 + 대상 학년. 구글 캘린더·인쇄가 같은 형식을 쓴다. */
export function eventDisplayTitle(ev) {
  const hours = (ev.activities || [])
    .filter((a) => Number(a.hours) > 0)
    .map((a) => `${a.type}${a.hours}h${a.grades?.length && a.grades.length < 3 ? `(${a.grades.join(',')})` : ''}`)
  const grade = ev.grades?.length && ev.grades.length < 3 ? `(${ev.grades.join(',')})` : ''
  return [...hours, `${ev.title || ''}${grade}`].filter((s) => s.trim()).join(' ')
}

/**
 * 두 일정 목록의 차이(일정 id 기준) — 초안 비교와 수정 기록 요약이 같이 쓴다.
 * @returns {{added, removed, moved:[{before, after}], changed:[{before, after, fields}]}}
 */
export function diffEvents(before = [], after = []) {
  const a = new Map(before.map((e) => [e.id, e]))
  const b = new Map(after.map((e) => [e.id, e]))
  const out = { added: [], removed: [], moved: [], changed: [] }
  for (const [id, e] of b) if (!a.has(id)) out.added.push(e)
  for (const [id, e] of a) if (!b.has(id)) out.removed.push(e)
  for (const [id, e] of b) {
    const p = a.get(id)
    if (!p) continue
    if (p.date !== e.date || (p.endDate || null) !== (e.endDate || null)) out.moved.push({ before: p, after: e })
    const fields = ['title', 'kind', 'grades', 'dept', 'fullDay', 'examType', 'weekdaySwap', 'activities', 'note']
      .filter((f) => JSON.stringify(p[f] ?? null) !== JSON.stringify(e[f] ?? null))
    if (fields.length) out.changed.push({ before: p, after: e, fields })
  }
  return out
}

/** diffEvents 결과를 사람이 읽는 줄로 */
export function describeDiff(diff) {
  const lines = []
  for (const e of diff.added) lines.push(`${shortLabel(e.date)} '${e.title}' 추가`)
  for (const e of diff.removed) lines.push(`${shortLabel(e.date)} '${e.title}' 삭제`)
  for (const { before, after } of diff.moved) lines.push(`'${after.title}' ${shortLabel(before.date)} → ${shortLabel(after.date)} 이동`)
  for (const { after, fields } of diff.changed) lines.push(`${shortLabel(after.date)} '${after.title}' 수정 (${fields.join(', ')})`)
  return lines
}

// ── 동시 편집 병합 ──────────────────────────────────────────────────

const sameJson = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/**
 * 내가 연 뒤 다른 사람이 먼저 저장했을 때: 최신본(latest) 위에 내 변경(base → mine)을 일정 하나 단위로 다시 얹는다.
 * 같은 일정을 둘 다 다르게 고쳤으면 최신본을 남기고 conflicts로 알린다(ExamCore mergeDraft와 같은 원칙).
 * @returns {{ events, holidays, conflicts: string[] }}
 */
export function mergePlanData(base, mine, latest) {
  const b = new Map((base.events || []).map((e) => [e.id, e]))
  const m = new Map((mine.events || []).map((e) => [e.id, e]))
  const out = new Map((latest.events || []).map((e) => [e.id, e]))
  const conflicts = []
  for (const [id, me] of m) {
    const be = b.get(id)
    const le = out.get(id)
    if (!be) { if (!le) out.set(id, me); continue } // 내가 추가
    if (sameJson(be, me)) continue // 나는 안 건드림
    if (!le) { conflicts.push(`'${me.title}' — 다른 사람이 삭제해 내 수정은 반영하지 않았습니다.`); continue }
    if (sameJson(be, le) || sameJson(le, me)) out.set(id, me)
    else conflicts.push(`'${me.title}' — 다른 사람도 고쳐서 최신본을 남겼습니다.`)
  }
  for (const [id, be] of b) {
    if (m.has(id)) continue // 내가 삭제한 것만
    const le = out.get(id)
    if (!le) continue
    if (sameJson(be, le)) out.delete(id)
    else conflicts.push(`'${be.title}' — 다른 사람이 고쳐서 삭제하지 않았습니다.`)
  }
  const holidays = sameJson(base.holidays, mine.holidays) ? latest.holidays || [] : mine.holidays || []
  return { events: [...out.values()], holidays, conflicts }
}
