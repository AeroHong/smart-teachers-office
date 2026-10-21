/**
 * 컴시간알리미 공개 시간표에서 교사별 수업 시각을 받는다 — ExamCore 감독 배정이 수업 시간을 피하는 데 쓴다.
 *
 * 왜 서버에서 받나
 *   컴시간 공개 조회(comci.net:4082)는 브라우저에서 바로 부르면 CORS·http(혼합 콘텐츠)에 막힌다.
 *   그래서 함수가 대신 받아 필요한 것(교사 이름·요일·교시·학년·반, 교시 시작 시각)만 돌려준다.
 *
 * 공식 API가 아니다. 학생이 보는 공개 페이지(/st)가 쓰는 주소를 그대로 따라간다:
 *   1) /st 페이지 스크립트에서 학교 검색·자료 주소와 자료 키 이름(원자료·교사명·과목명)을 읽는다 — 이 값들은 가끔 바뀐다.
 *   2) 학교 검색: 검색어는 EUC-KR 퍼센트 인코딩.  3) 학교 자료: base64(접두+학교코드_0_주차).
 *   칸 값은 뒤 세 자리가 교사 번호, 그 앞이 과목 번호다(페이지의 splitData와 같다). 원자료(기본 시간표)를 쓴다.
 * 컴시간이 구조를 바꾸면 실패한다 — 그때는 오류 메시지로 알리고 화면에서 수동 제외를 쓴다.
 * 교사 이름은 공개 페이지가 앞 두 글자 + '*'로 가려서 준다(예: 최윤*). 이름 맞추기는 ExamCore에서 한다.
 */
const { getFirestore } = require('firebase-admin/firestore')
const { onCall, HttpsError } = require('firebase-functions/v2/https')

const REGION = 'asia-northeast3'
const BASE = 'http://comci.net:4082'
const STAFF_ROLES = ['teacher', 'admin', 'school_admin', 'principal', 'headmaster']

/** EUC-KR 퍼센트 인코딩 — Node TextEncoder는 UTF-8만 되므로 TextDecoder로 역표를 만든다(한 번) */
let eucKr = null
function encodeEucKr(text) {
  if (!eucKr) {
    eucKr = new Map()
    const dec = new TextDecoder('euc-kr')
    for (let a = 0x81; a <= 0xfe; a++) {
      for (let b = 0x41; b <= 0xfe; b++) {
        const ch = dec.decode(new Uint8Array([a, b]))
        if (ch.length === 1 && ch !== '�' && !eucKr.has(ch)) eucKr.set(ch, [a, b])
      }
    }
  }
  let out = ''
  for (const ch of text) {
    const code = ch.codePointAt(0)
    if (code < 0x80) out += encodeURIComponent(ch)
    else {
      const bytes = eucKr.get(ch)
      if (!bytes) throw new HttpsError('invalid-argument', `학교 이름에 쓸 수 없는 글자가 있습니다: ${ch}`)
      out += bytes.map((x) => `%${x.toString(16).toUpperCase()}`).join('')
    }
  }
  return out
}

async function getText(path) {
  const res = await fetch(BASE + path, { signal: AbortSignal.timeout(15000) })
  if (!res.ok) throw new Error(`컴시간 응답 ${res.status}`)
  const buf = new Uint8Array(await res.arrayBuffer())
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    return new TextDecoder('euc-kr').decode(buf)
  }
}

const jsonPart = (text) => JSON.parse(text.slice(0, text.lastIndexOf('}') + 1))

/** /st 스크립트에서 주소와 자료 키 이름 */
function readPage(html) {
  const pick = (re, what) => {
    const m = html.match(re)
    if (!m) throw new Error(`컴시간 페이지 구조가 바뀌었습니다(${what})`)
    return m
  }
  const search = pick(/url:'\.\/(\d+)\?(\d+)l'\+sc/, '검색 주소')
  return {
    base: search[1],
    search: search[2],
    prefix: pick(/sc_data\('(\d+_)',sc,1,'0'\)/, '자료 접두')[1],
    original: pick(/원자료=Q자료\(자료\.(자료\d+)\[/, '원자료 키')[1],
    teachers: pick(/성명=Q성명\(자료\.(자료\d+)\[/, '교사명 키')[1],
    subjects: pick(/과목명=Q과목명\(자료\.(자료\d+)\[/, '과목명 키')[1],
  }
}

/**
 * 학교 자료 → 교사별 수업. 학급 시간표(원자료[학년][반][요일][교시])를 뒤집는다.
 * @returns {{ periods: {period:number,start:string}[], teachers: {name:string, lessons:number[][]}[] }}
 *   lessons 원소: [요일(1=월), 교시, 학년, 반]
 */
function parseSchool(d, keys) {
  const table = d[keys.original]
  const names = d[keys.teachers]
  const subjects = d[keys.subjects]
  if (!Array.isArray(table) || !Array.isArray(names)) throw new Error('컴시간 자료 구조가 바뀌었습니다(시간표·교사명)')
  const sep = Number(d.분리) || 1000
  const lessons = new Map()
  for (let g = 1; g < table.length; g++) {
    const classes = table[g] || []
    const real = (d.학급수?.[g] ?? classes.length - 1) - (d.가상학급수?.[g] ?? 0)
    for (let c = 1; c <= real && c < classes.length; c++) {
      const days = classes[c] || []
      for (let day = 1; day <= 5 && day < days.length; day++) {
        const periods = days[day] || []
        for (let p = 1; p < periods.length; p++) {
          const v = Number(String(periods[p] ?? 0).replace(/^>/, '')) || 0
          if (v <= 0) continue
          const teacher = sep === 100 ? Math.floor(v / 100) : v % 1000
          const subject = sep === 100 ? v % 100 : Math.floor(v / 1000) % sep
          if (!teacher || !names[teacher]) continue
          if (!lessons.has(teacher)) lessons.set(teacher, [])
          lessons.get(teacher).push([day, p, g, c, subject])
        }
      }
    }
  }
  const periods = (d.일과시간 || []).map((s) => /^(\d+)\((\d{1,2}:\d{2})\)/.exec(String(s))).filter(Boolean)
    .map((m) => ({ period: Number(m[1]), start: m[2].padStart(5, '0') }))
  const teachers = [...lessons].sort((a, b) => a[0] - b[0]).map(([t, list]) => ({
    name: String(names[t]),
    lessons: list.map(([day, p, g, c]) => [day, p, g, c]),
    subjects: [...new Set(list.map((x) => subjects?.[x[4]]).filter(Boolean))],
  }))
  return { periods, teachers }
}

/** 학교 이름으로 찾거나 학교 코드로 바로 — 학교가 하나로 정해져야 자료를 받는다 */
async function fetchTimetable({ schoolName, schoolCode }) {
  const keys = readPage(await getText('/st'))
  let code = Number(schoolCode) || 0
  let name = ''
  if (!code) {
    const q = String(schoolName || '').trim()
    if (q.length < 2) throw new HttpsError('invalid-argument', '학교 이름을 두 글자 이상 적어 주세요.')
    const res = jsonPart(await getText(`/${keys.base}?${keys.search}l${encodeEucKr(q)}`))
    const list = Object.values(res)[0] || []
    if (list.length !== 1) {
      return { candidates: list.map((x) => ({ region: x[1], name: x[2], code: x[3] })) }
    }
    code = list[0][3]
    name = list[0][2]
  }
  const q = Buffer.from(`${keys.prefix}${code}_0_1`).toString('base64')
  const d = jsonPart(await getText(`/${keys.base}?${q}`))
  const { periods, teachers } = parseSchool(d, keys)
  if (!teachers.length) throw new Error('컴시간에서 교사 시간표를 찾지 못했습니다.')
  return { schoolCode: code, schoolName: name, year: d.학년도, updatedAt: d[Object.keys(d).find((k) => /^\d{4}-\d{2}-\d{2} /.test(String(d[k])))] || '', periods, teachers }
}

exports.fetchComciganTimetable = onCall({ region: REGION, timeoutSeconds: 60 }, async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', '로그인이 필요합니다.')
  if (request.auth.token.superAdmin !== true) {
    const snap = await getFirestore().collection('users').doc(uid).get()
    if (!STAFF_ROLES.includes(snap.get('role'))) throw new HttpsError('permission-denied', '교직원만 쓸 수 있습니다.')
  }
  try {
    return await fetchTimetable(request.data || {})
  } catch (e) {
    if (e instanceof HttpsError) throw e
    throw new HttpsError('unavailable', `컴시간 시간표를 받지 못했습니다: ${e.message}`)
  }
})

// 로컬 확인용(node -e)
exports._test = { encodeEucKr, readPage, parseSchool, fetchTimetable }
