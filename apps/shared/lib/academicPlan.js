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
/**
 * 진도 없는 날 — 학력평가·모의고사처럼 나이스 출결상 시간표 수업은 인정되지만(실수업일에 그대로 셈) 진도를 못 나가는 날.
 * 시험 사이 일수(개학~중간·중간~기말)에서만 뺀다. 일정에 noProgress(true/false)를 직접 정하지 않았으면 제목으로 판단.
 */
export const NO_PROGRESS_RE = /학력평가|모의평가|모의고사/
export const isNoProgress = (ev) => (typeof ev?.noProgress === 'boolean' ? ev.noProgress : NO_PROGRESS_RE.test(ev?.title || ''))

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
  const noProgress = schoolDay && !exam && !fullDay && evs.some(isNoProgress)
  return { semester, holiday, closure, schoolDay, weekday, exam, fullDay, noProgress, vacation: semester === null }
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
  return {
    schoolDays: zero5(), exams: zero5(), fullDays: zero5(), actual: zero5(), noProgress: zero5(),
    beforeMid: zero5(), between: zero5(), activities: { 자율: 0, 동아리: 0 },
  }
}

function addInto(t, s) {
  for (const f of ['schoolDays', 'exams', 'fullDays', 'actual', 'noProgress', 'beforeMid', 'between']) for (let i = 0; i < 5; i++) t[f][i] += s[f][i]
  for (const a of ACTIVITY_TYPES) t.activities[a] += s.activities[a]
}

function totals(s) {
  return {
    ...s,
    total: {
      schoolDays: sum(s.schoolDays), exams: sum(s.exams), fullDays: sum(s.fullDays),
      actual: sum(s.actual), noProgress: sum(s.noProgress), beforeMid: sum(s.beforeMid), between: sum(s.between),
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
      let firstMid = null
      let lastMid = null
      let firstFinal = null
      for (const k of days) {
        const d = classifyDay(ctx, g, k)
        if (!d.schoolDay) continue
        s.schoolDays[d.weekday]++
        if (d.exam) {
          s.exams[d.weekday]++
          if (d.exam === '중간') { if (!firstMid) firstMid = k; lastMid = k }
          if (d.exam === '기말' && !firstFinal) firstFinal = k
        } else if (d.fullDay) s.fullDays[d.weekday]++
        else if (d.noProgress) s.noProgress[d.weekday]++
      }
      for (let i = 0; i < 5; i++) s.actual[i] = s.schoolDays[i] - s.exams[i] - s.fullDays[i]
      // 시험 사이 진도 나가는 날(정기고사·전일행사·진도 없는 날 제외): 개학 ~ 첫 중간고사 전날, 마지막 중간고사 다음 날 ~ 첫 기말고사 전날
      const countActual = (from, to, into) => {
        if (from > to) return
        for (const k of dateRange(from, to)) {
          const d = classifyDay(ctx, g, k)
          if (d.schoolDay && !d.exam && !d.fullDay && !d.noProgress) into[d.weekday]++
        }
      }
      if (firstMid) countActual(rg.start, addDays(firstMid, -1), s.beforeMid)
      if (lastMid && firstFinal && lastMid < firstFinal) countActual(addDays(lastMid, 1), addDays(firstFinal, -1), s.between)
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
    .map((ev) => (isTrayEvent(ev) ? ev : shiftEvent(ev, addDays(ev.date, 364))))
    .filter((ev) => isTrayEvent(ev) || (ev.date >= start && ev.date <= end))
}

// ── 나이스 학사일정 가져오기 ────────────────────────────────────────────
// 서버(neisSchedule 함수)가 나이스 교육정보 개방 포털 SchoolSchedule 행을 { date, name, content, grades, off }로
// 줄여 보내면 여기서 일정으로 바꾼다. off = 수업공제일 구분('공휴일' | '휴업일' | '').

// 방학 기간·토요휴업일은 날마다 한 줄씩 들어 있지만 학기 범위(개학·방학식)로 이미 정해진다 — 버린다
const NEIS_SKIP_RE = /토요\s*휴업일|^(여름|겨울|학년말|봄)?\s*방학$/
// 하루를 통째로 쓰는 흔한 행사 — 실수업일에서 빠지게 전일행사로 둔다(가져온 뒤 확인)
const NEIS_FULL_DAY_RE = /수학여행|체험\s*(학습|교육|활동)|체육대회|스포츠|축제|수련회|대학수학능력시험/
const NEIS_SWAP_RE = /요일\s*(변동|교체|변경)\s*\(?\s*([월화수목금])/

/** 나이스 행 하나 → 일정 유형·제목 */
function neisKind(row) {
  const name = row.name.trim()
  if (row.off === '공휴일') return { kind: '공휴일' }
  const swap = name.match(NEIS_SWAP_RE)
  if (swap) return { kind: '요일교체', weekdaySwap: SCHOOL_WEEKDAYS.indexOf(swap[2]) }
  if (/입학식|개학식|시업식/.test(name)) return { kind: '개학' }
  if (/방학식/.test(name)) return { kind: '방학식', fullDay: true }
  if (/종업식/.test(name)) return { kind: '종업식', fullDay: true }
  if (/졸업식/.test(name)) return { kind: '졸업식', fullDay: true }
  if (/중간고사|1차\s*지필/.test(name)) return { kind: '정기고사', examType: '중간' }
  if (/기말고사|2차\s*지필/.test(name)) return { kind: '정기고사', examType: '기말' }
  if (row.off === '휴업일') return { kind: '재량휴업' }
  return { kind: '일반', fullDay: NEIS_FULL_DAY_RE.test(name) }
}

/**
 * 나이스 학사일정 행 → 일정 목록. 같은 이름·학년이 이어지는 날(주말·공휴일만 끼어도)은 기간 일정 하나로 합친다.
 * 2학기 개학이 없으면 여름방학 다음 수업일로 넣는다.
 * @param rows [{date:'YYYY-MM-DD', name, content?, grades:[1,2,3 중], off}]
 * @param makeId 일정 id를 만드는 함수
 */
export function neisRowsToEvents(rows = [], makeId = (i) => `neis${i}`) {
  const sorted = [...rows]
    .filter((r) => isDateKey(r.date) && r.name?.trim() && !NEIS_SKIP_RE.test(r.name.trim()))
    // 주말 휴업일(토요휴업일 등)은 버리고, 주말 행사는 표시만 되게 둔다
    .filter((r) => !(r.off === '휴업일' && mondayIndex(r.date) > 4))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  // 공휴일·휴업일 — 기간 일정을 합칠 때 사이에 끼어도 이어진 것으로 본다
  const offDays = new Set(rows.filter((r) => r.off === '공휴일' || r.off === '휴업일').map((r) => r.date))
  const isGap = (d) => mondayIndex(d) > 4 || offDays.has(d)
  const out = []
  const open = new Map() // 합치는 중인 일정: 제목|유형|학년 → 일정
  for (const r of sorted) {
    const k = neisKind(r)
    const grades = (r.grades || []).length && r.grades.length < 3 ? [...r.grades].sort() : []
    const title = r.name.trim()
    const key = `${title}|${k.kind}|${grades.join(',')}`
    const prev = open.get(key)
    // 이어지는 날인지 — 사이에 낀 날이 모두 토·일이면 이어진 것으로 본다
    const lastDay = prev ? prev.endDate || prev.date : null
    let joined = false
    // 정기고사는 합치지 않는다 — 시험일을 하루씩 앞뒤로 옮기며 편성하기 쉽게(splitExamEvent 참고)
    if (prev && !['공휴일', '요일교체', '정기고사'].includes(k.kind)) {
      let d = addDays(lastDay, 1)
      while (d < r.date && isGap(d)) d = addDays(d, 1)
      joined = d === r.date
    }
    if (joined) { prev.endDate = r.date; continue }
    if (prev && lastDay === r.date) continue // 같은 날 같은 일정이 두 줄
    const ev = { id: makeId(out.length), date: r.date, title, grades, fullDay: false, activities: [], ...k }
    if (r.content?.trim() && r.content.trim() !== title) ev.note = r.content.trim()
    out.push(ev)
    open.set(key, ev)
  }
  // 2학기 개학은 나이스에 따로 없는 학교가 많다 — 여름방학 다음 수업일을 개학으로 넣는다
  const summer = rows.filter((r) => /여름\s*방학/.test(r.name || '') && isDateKey(r.date)).map((r) => r.date).sort()
  if (summer.length) {
    let d = addDays(summer[summer.length - 1], 1)
    while (isGap(d)) d = addDays(d, 1)
    const has = out.some((e) => e.kind === '개학' && e.date > summer[0] && e.date <= addDays(d, 14))
    if (!has) {
      out.push({
        id: makeId(out.length), date: d, title: '2학기 개학', kind: '개학', grades: [], fullDay: false, activities: [],
        note: '나이스에 개학 일정이 없어 여름방학 다음 수업일로 넣었습니다',
      })
      out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    }
  }
  return out
}

// ── 단계(주요 일정 → 세부 → 확정) ─────────────────────────────────────────
// 1) 주요 일정(frame): 초안 여러 개로 큰 일정(수업일수를 정하는 일정)만 잡고 비교한다.
// 2) 세부(detail): 관리자가 주요 일정을 확정하면 그때의 큰 일정에 frame 표시가 붙어 잠긴다(화면 잠금 + 수정 기록 —
//    서버 규칙으로 막지는 않는다). 부장들은 일반 일정·시수를 채운다. 전일행사는 넣을 수 있되 실수업일 경고.
// 3) 확정(final): 모든 일정이 잠긴다.
// 확정 뒤 바꿔야 하면 관리자가 그 일정만 잠금 해제(unlocked) → 고친 뒤 재확정하면 새 판(no+1)이 되고 이전 판은 '변경됨'.

/** 주요 일정이 되는 유형 — 이 유형이거나 전일행사면 주요 일정 확정 때 잠긴다 */
export const FRAME_KINDS = ['개학', '방학식', '종업식', '졸업식', '정기고사', '재량휴업', '공휴일', '요일교체']
export const STAGES = ['frame', 'detail', 'final']
export const STAGE_LABEL = { frame: '주요 일정', detail: '세부 일정', final: '확정' }

export const isFrameCandidate = (ev) => !isTrayEvent(ev) && (FRAME_KINDS.includes(ev.kind) || Boolean(ev.fullDay))

/** 초안의 단계 — 예전 확정본(status confirmed)은 final */
export function planStage(plan) {
  if (plan?.status === 'confirmed') return 'final'
  return STAGES.includes(plan?.stage) ? plan.stage : 'frame'
}

/** 이 단계에서 화면에서 잠긴 일정인가 */
export function isEventLocked(ev, stage) {
  if (isTrayEvent(ev) || ev.unlocked) return false
  if (stage === 'final') return true
  if (stage === 'detail') return Boolean(ev.frame)
  return false
}

/** 주요 일정 확정 — 큰 일정에 frame 표시, 잠금 해제 표시는 지운다 */
export function markFrameEvents(events = []) {
  return events.map((ev) => {
    const { unlocked, ...rest } = ev // eslint-disable-line no-unused-vars
    if (isFrameCandidate(rest)) return { ...rest, frame: true }
    return rest
  })
}

/** 재확정 — 잠금 해제했던 일정을 다시 잠근다(frame 표시는 그대로) */
export function relockEvents(events = []) {
  return events.map((ev) => {
    if (!ev.unlocked) return ev
    const { unlocked, ...rest } = ev // eslint-disable-line no-unused-vars
    return rest
  })
}

/**
 * 확정 판 기록에 새 판을 더한다 — 같은 단계의 이전 판은 superseded(변경됨).
 * @returns [{no, stage, versionNo, at, by, superseded?}]
 */
export function addConfirmation(list = [], { stage, versionNo, at, by }) {
  const prev = list.map((c) => (c.stage === stage && !c.superseded ? { ...c, superseded: true } : c))
  const no = list.filter((c) => c.stage === stage).length + 1
  return [...prev, { no, stage, versionNo, at, by }]
}

/** 지금 유효한 판(단계별 마지막) */
export function currentConfirmation(list = [], stage) {
  return [...list].reverse().find((c) => c.stage === stage && !c.superseded) || null
}

// ── 일정 카드 보관함 ─────────────────────────────────────────────────
// 날짜가 없는 일정(date '')은 '보관함 카드'다. 계산·인쇄·캘린더 반영은 날짜 있는 일정만 보므로 그대로 빠진다.
// 기간 일정을 보관함으로 빼면 일수(spanDays)를 기억했다가 다시 놓을 때 그 기간으로 되살린다.

export const isTrayEvent = (ev) => !isDateKey(ev?.date)

/** 보관함 카드를 그 날짜에 놓는다 */
/**
 * 정기고사 기간 일정 → 날마다 하나씩(주말·공휴일은 건너뜀). 시험일을 하루씩 옮기며 편성하기 쉽게 한다.
 * 첫날은 원래 id를 그대로 쓴다. 정기고사가 아니거나 하루짜리면 [ev] 그대로.
 * @param plan 공휴일을 알기 위한 초안(holidays·공휴일 일정)
 */
export function splitExamEvent(ev, plan) {
  if (ev.kind !== '정기고사' || !isDateKey(ev.date) || !isDateKey(ev.endDate) || ev.endDate <= ev.date) return [ev]
  const off = holidayMap(plan)
  const { endDate, ...base } = ev
  const out = []
  for (let d = ev.date; d <= endDate; d = addDays(d, 1)) {
    if (mondayIndex(d) > 4 || off.has(d)) continue
    out.push({ ...base, id: out.length ? `${ev.id}_${d.replace(/-/g, '')}` : ev.id, date: d })
  }
  return out.length ? out : [{ ...base }]
}

export function placeTrayEvent(ev, date) {
  const { spanDays, ...rest } = ev
  const next = { ...rest, date }
  delete next.endDate
  if (Number(spanDays) > 1) next.endDate = addDays(date, Number(spanDays) - 1)
  return next
}

/**
 * 지난 학년도 일정을 새 학년도 보관함 카드로 — 날짜는 비우고 작년 날짜(prevDate)를 남긴다.
 * 날짜에 묶인 공휴일·요일 교체는 빼고, 잠금 표시(frame·unlocked)는 버린다.
 */
export function eventsToCards(events = []) {
  return events
    .filter((ev) => ev.kind !== '공휴일' && ev.kind !== '요일교체')
    .map((ev) => {
      const { frame, unlocked, ...rest } = ev // eslint-disable-line no-unused-vars
      return isTrayEvent(rest) ? rest : { ...unscheduleEvent(rest), prevDate: rest.date }
    })
}

/**
 * 이미 만든 초안에 지난 학년도 일정을 카드로 더한다 — 같은 id가 이미 있으면(전에 불러왔거나 같은 요일로 옮겨 시작) 건너뛴다.
 * @returns {{ cards, skipped }}
 */
export function importPrevCards(currentEvents = [], prevEvents = []) {
  const have = new Set(currentEvents.map((e) => e.id))
  const all = eventsToCards(prevEvents)
  const cards = all.filter((c) => !have.has(c.id))
  return { cards, skipped: all.length - cards.length }
}

/** 부서 색 가져오기 — 이미 색이 있는 부서는 그대로, 비어 있는 부서만 지난 학년도 색으로 */
export function mergeDeptColors(current = {}, prev = {}) {
  const out = { ...(current || {}) }
  let added = 0
  for (const [dept, key] of Object.entries(prev || {})) {
    if (!out[dept]) { out[dept] = key; added++ }
  }
  return { colors: out, added }
}

/** 작년 날짜와 같은 요일인 올해 날짜(52주 뒤) — 카드를 끌 때 표에 '작년 이맘때'로 표시 */
export const sameWeekdayNextYear = (prevDate) => (isDateKey(prevDate) ? addDays(prevDate, 364) : null)

/** 날짜 있는 일정을 보관함으로 뺀다 */
export function unscheduleEvent(ev) {
  const days = eventDates(ev).length
  const { endDate, ...rest } = ev // eslint-disable-line no-unused-vars
  const next = { ...rest, date: '' }
  if (days > 1) next.spanDays = days
  else delete next.spanDays
  return next
}

/** 일정 표시 제목: 창체 시수 + 제목 + 대상 학년. 구글 캘린더·인쇄가 같은 형식을 쓴다. */
/** 일정 이름 — 요일 교체는 어느 요일 시간표로 운영하는지 붙인다(이름에 이미 그 요일이 있으면 그대로) */
export function eventTitle(ev) {
  const title = ev.title || ''
  if (ev.kind !== '요일교체' || !Number.isInteger(ev.weekdaySwap)) return title
  const w = `${SCHOOL_WEEKDAYS[ev.weekdaySwap]}요일`
  return title.includes(w) ? title : `${title}(${w} 수업)`
}

export function eventDisplayTitle(ev) {
  const hours = (ev.activities || [])
    .filter((a) => Number(a.hours) > 0)
    .map((a) => `${a.type}${a.hours}h${a.grades?.length && a.grades.length < 3 ? `(${a.grades.join(',')})` : ''}`)
  const grade = ev.grades?.length && ev.grades.length < 3 ? `(${ev.grades.join(',')})` : ''
  return [...hours, `${eventTitle(ev)}${grade}`].filter((s) => s.trim()).join(' ')
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
    const fields = Object.keys(FIELD_LABEL)
      .filter((f) => JSON.stringify(p[f] ?? null) !== JSON.stringify(e[f] ?? null))
    if (fields.length) out.changed.push({ before: p, after: e, fields })
  }
  return out
}

/** 수정 기록에 쓰는 필드 이름 — 여기 있는 필드가 바뀌어야 '수정'으로 잡힌다 */
const FIELD_LABEL = {
  title: '이름', kind: '유형', grades: '대상 학년', dept: '관련 부서', fullDay: '전일행사', examType: '고사 구분',
  weekdaySwap: '요일 교체', activities: '시수', note: '메모', spanDays: '기간', noProgress: '진도 없음', frame: '주요 일정', unlocked: '잠금',
}

/** diffEvents 결과를 사람이 읽는 줄로 */
export function describeDiff(diff) {
  const at = (k) => (isDateKey(k) ? shortLabel(k) : '보관함')
  const lines = []
  for (const e of diff.added) lines.push(`${at(e.date)} '${e.title}' 추가`)
  for (const e of diff.removed) lines.push(`${at(e.date)} '${e.title}' 삭제`)
  for (const { before, after } of diff.moved) lines.push(`'${after.title}' ${at(before.date)} → ${at(after.date)} 이동`)
  for (const { before, after, fields } of diff.changed) {
    // 잠금 해제·다시 잠금은 따로 한 줄(관리자 조치라 눈에 띄게)
    if (fields.includes('unlocked')) lines.push(`${at(after.date)} '${after.title}' ${after.unlocked ? '잠금 해제' : '다시 잠금'}`)
    // 주요 일정 표시는 확정 요약 한 줄로 충분하고, 보관함을 오가며 바뀐 기간은 '이동' 줄에 들어 있다
    const rest = fields.filter((f) => f !== 'unlocked' && f !== 'frame' && !(f === 'spanDays' && before.date !== after.date))
    if (rest.length) lines.push(`${at(after.date)} '${after.title}' 수정 (${rest.map((f) => FIELD_LABEL[f]).join(', ')})`)
  }
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
