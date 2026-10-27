const { google } = require('googleapis')
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { getCalendarClient, HOLIDAY_CALENDAR_ID, syncSchoolCalendar } = require('./academicCalendarSync')

/**
 * 학사일정 제작 도구(포털 /academic-plan) 서버 쪽.
 *
 * fetchKoreanHolidays — 구글 대한민국 공휴일 캘린더에서 기간 안의 공휴일을 돌려준다(초안의 holidays에 저장).
 *   기존 학사일정 동기화와 같은 API 키를 쓴다. 기념일(어버이날 등 쉬지 않는 날)은 뺀다.
 *
 * publishAcademicPlan — 확정된 초안을 학교 학사일정 구글 캘린더(schools/{sid}.academicCalendarSync.calendarId)에 쓴다.
 *   · 이 도구가 넣은 일정만 다룬다: extendedProperties.private { source: 'academicPlan', planYear, planEventId }
 *     로 표시하고, 같은 학년도의 표시된 일정만 추가·수정·삭제한다. 손으로 넣은 일정은 건드리지 않는다.
 *   · 쓰기는 도메인 위임 서비스 계정(workspace-sync-key, emailSend.js와 같은 방식)으로, 캘린더에 쓰기 권한이 있는
 *     교직원 계정을 흉내 낸다 — academicCalendarSync.writerEmail, 없으면 실행한 관리자 본인.
 *     Workspace 관리 콘솔의 도메인 위임에 https://www.googleapis.com/auth/calendar 스코프가 승인돼 있어야 한다.
 *   · 끝나면 기존 구글 → academicCalendar 동기화를 바로 돌려 업무 메신저 학사일정에도 반영한다.
 */

const REGION = 'asia-northeast3'
const SA_SECRET = 'projects/seonyoo-system/secrets/workspace-sync-key/versions/latest'
const CALENDAR_SCOPES = ['https://www.googleapis.com/auth/calendar']
const STAFF_ROLES = ['teacher', 'admin', 'school_admin', 'principal', 'headmaster']

const secretClient = new SecretManagerServiceClient()
let cachedSaKey = null

async function getServiceAccountKey() {
  if (cachedSaKey) return cachedSaKey
  const [version] = await secretClient.accessSecretVersion({ name: SA_SECRET })
  cachedSaKey = JSON.parse(version.payload.data.toString('utf8'))
  return cachedSaKey
}

async function getWritableCalendar(subject) {
  const key = await getServiceAccountKey()
  const auth = new google.auth.JWT({ email: key.client_email, key: key.private_key, scopes: CALENDAR_SCOPES, subject })
  await auth.authorize()
  return google.calendar({ version: 'v3', auth })
}

// ── 날짜 ('YYYY-MM-DD') ──────────────────────────────────────────────
const isDateKey = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return t.toISOString().slice(0, 10)
}

// ⚠ apps/shared/lib/academicPlan.js의 eventDisplayTitle()과 같은 결과를 내야 한다(Functions는 ESM 공용
// 모듈을 import하지 못해 손으로 옮겼다 — 제목 형식을 고치면 두 곳을 함께 고칠 것).
function eventDisplayTitle(ev) {
  const hours = (ev.activities || [])
    .filter((a) => Number(a.hours) > 0)
    .map((a) => `${a.type}${a.hours}h${a.grades?.length && a.grades.length < 3 ? `(${a.grades.join(',')})` : ''}`)
  const grade = ev.grades?.length && ev.grades.length < 3 ? `(${ev.grades.join(',')})` : ''
  return [...hours, `${ev.title || ''}${grade}`].filter((s) => s.trim()).join(' ')
}

async function loadCaller(db, request, schoolId) {
  if (!request.auth) throw new HttpsError('unauthenticated', '로그인이 필요합니다.')
  if (!schoolId) throw new HttpsError('invalid-argument', 'schoolId가 필요합니다.')
  const user = (await db.collection('users').doc(request.auth.uid).get()).data() || {}
  const superAdmin = request.auth.token.superAdmin === true
  const sameSchool = user.schoolId === schoolId
  return {
    superAdmin,
    staff: superAdmin || (sameSchool && STAFF_ROLES.includes(user.role)),
    admin: superAdmin || (sameSchool && ['admin', 'school_admin'].includes(user.role)),
  }
}

/** 기간 안의 대한민국 공휴일 [{date, name}] — fetchKoreanHolidays와 일회성 가져오기 스크립트가 같이 쓴다 */
async function listKoreanHolidays(from, to) {
  const calendar = await getCalendarClient()
  const res = await calendar.events.list({
    calendarId: HOLIDAY_CALENDAR_ID,
    timeMin: `${from}T00:00:00+09:00`,
    timeMax: `${addDays(to, 1)}T00:00:00+09:00`,
    singleEvents: true, orderBy: 'startTime', maxResults: 500,
  })
  const map = new Map()
  for (const ev of res.data.items || []) {
    if (ev.status === 'cancelled' || !ev.start?.date) continue
    // 구글 공휴일 캘린더는 쉬지 않는 기념일도 함께 준다(설명이 'Observance'/'기념일') — 휴일만 남긴다
    if (/observance|기념일/i.test(ev.description || '')) continue
    const end = ev.end?.date ? addDays(ev.end.date, -1) : ev.start.date
    for (let k = ev.start.date; k <= end; k = addDays(k, 1)) {
      if (k >= from && k <= to && !map.has(k)) map.set(k, ev.summary || '공휴일')
    }
  }
  return [...map.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, name]) => ({ date, name }))
}
exports.listKoreanHolidays = listKoreanHolidays

exports.fetchKoreanHolidays = onCall({ region: REGION }, async (request) => {
  const { from, to, schoolId } = request.data || {}
  if (!request.auth) throw new HttpsError('unauthenticated', '로그인이 필요합니다.')
  if (!isDateKey(from) || !isDateKey(to) || from > to) throw new HttpsError('invalid-argument', '기간(from, to)이 올바르지 않습니다.')
  if (schoolId) {
    const caller = await loadCaller(getFirestore(), request, schoolId)
    if (!caller.staff) throw new HttpsError('permission-denied', '교직원만 사용할 수 있습니다.')
  }
  return { holidays: await listKoreanHolidays(from, to) }
})

exports.publishAcademicPlan = onCall({ region: REGION, timeoutSeconds: 300 }, async (request) => {
  const { schoolId, planId } = request.data || {}
  const db = getFirestore()
  const caller = await loadCaller(db, request, schoolId)
  if (!caller.admin) throw new HttpsError('permission-denied', '학교 관리자만 구글 캘린더에 반영할 수 있습니다.')
  if (!planId) throw new HttpsError('invalid-argument', 'planId가 필요합니다.')

  const schoolRef = db.collection('schools').doc(schoolId)
  const [schoolSnap, planSnap] = await Promise.all([schoolRef.get(), schoolRef.collection('academicPlans').doc(planId).get()])
  if (!planSnap.exists) throw new HttpsError('not-found', '학사일정 초안을 찾을 수 없습니다.')
  const plan = planSnap.data()
  if (plan.status !== 'confirmed') throw new HttpsError('failed-precondition', '확정된 학사일정만 반영할 수 있습니다.')
  const cfg = schoolSnap.data()?.academicCalendarSync || {}
  if (!cfg.calendarId) throw new HttpsError('failed-precondition', '관리자 > 학사일정에서 학교 구글 캘린더를 먼저 연결하세요.')
  const subject = cfg.writerEmail || request.auth.token.email
  if (!subject) throw new HttpsError('failed-precondition', '캘린더에 쓸 계정을 알 수 없습니다.')

  let calendar
  try {
    calendar = await getWritableCalendar(subject)
  } catch (e) {
    throw new HttpsError('failed-precondition',
      `구글 캘린더 쓰기 권한을 얻지 못했습니다(${subject}). Workspace 관리 콘솔의 도메인 위임에 캘린더 스코프가 승인됐는지 확인하세요. — ${e.message}`)
  }

  const year = String(plan.year)
  const existing = []
  let pageToken
  do {
    const res = await calendar.events.list({
      calendarId: cfg.calendarId, privateExtendedProperty: [`source=academicPlan`, `planYear=${year}`],
      maxResults: 2500, pageToken, showDeleted: false,
    })
    existing.push(...(res.data.items || []))
    pageToken = res.data.nextPageToken
  } while (pageToken)
  const byPlanEventId = new Map(existing.map((e) => [e.extendedProperties?.private?.planEventId, e]))

  let created = 0
  let updated = 0
  let deleted = 0
  const keep = new Set()
  for (const ev of plan.events || []) {
    if (!isDateKey(ev.date)) continue
    keep.add(ev.id)
    const end = isDateKey(ev.endDate) && ev.endDate > ev.date ? ev.endDate : ev.date
    const description = [ev.dept && `관련 부서: ${ev.dept}`, ev.fullDay && '전일행사', ev.note].filter(Boolean).join('\n')
    const body = {
      summary: eventDisplayTitle(ev),
      description,
      start: { date: ev.date },
      end: { date: addDays(end, 1) }, // 종일 일정의 끝은 배타적
      extendedProperties: { private: { source: 'academicPlan', planYear: year, planEventId: ev.id } },
    }
    const cur = byPlanEventId.get(ev.id)
    if (!cur) {
      await calendar.events.insert({ calendarId: cfg.calendarId, requestBody: body })
      created++
    } else if (cur.summary !== body.summary || (cur.description || '') !== description ||
      cur.start?.date !== body.start.date || cur.end?.date !== body.end.date) {
      await calendar.events.patch({ calendarId: cfg.calendarId, eventId: cur.id, requestBody: body })
      updated++
    }
  }
  for (const [pid, cur] of byPlanEventId) {
    if (keep.has(pid)) continue
    await calendar.events.delete({ calendarId: cfg.calendarId, eventId: cur.id })
    deleted++
  }

  await planSnap.ref.update({ publishedAt: FieldValue.serverTimestamp(), publishedBy: { uid: request.auth.uid } })

  // 업무 메신저 학사일정(academicCalendar)에도 바로 — 매일 새벽 동기화를 기다리지 않는다
  let syncResult = null
  try {
    syncResult = await syncSchoolCalendar(db, schoolId, schoolSnap.data())
  } catch (e) {
    console.error(`[${schoolId}] 반영 후 동기화 실패:`, e.message)
  }
  return { created, updated, deleted, syncResult }
})
