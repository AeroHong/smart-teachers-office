const { google } = require('googleapis')
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
const { onSchedule } = require('firebase-functions/v2/scheduler')
const { onCall, HttpsError } = require('firebase-functions/v2/https')

/**
 * 학사일정 — 구글 공유 캘린더 → academicCalendar 단방향 동기화
 * (PLAN_channels.md·PLAN_dashboardElectron.md §"학사일정" 참고)
 *
 * schools/{schoolId} 문서의 academicCalendarSync 필드로 학교별 설정:
 *   academicCalendarSync: { enabled: boolean, calendarId: string }
 *
 * 대상 캘린더는 "공개 공유"라 workspaceSync.js처럼 도메인 위임 서비스계정으로
 * 흉내낼 필요가 없다 — Calendar API를 API 키만으로 호출한다(Secret Manager의
 * google-calendar-api-key). Calendar API만 호출하도록 제한된 키다.
 *
 * 동기화는 한 방향이다(구글 → 우리) — 양쪽에 쓰면 어느 쪽이 원본인지 흐려지고
 * 충돌 처리가 따라붙는다. 수동으로 등록한 일정(source:'manual' 또는 source
 * 필드가 아예 없는 옛 문서)은 절대 건드리지 않는다 — 이 함수는 항상
 * source=='googleCalendar' 문서만 조회·생성·수정·삭제한다.
 */

const SECRET_NAME = 'projects/seonyoo-system/secrets/google-calendar-api-key/versions/latest'
const secretClient = new SecretManagerServiceClient()
let cachedKey = null

async function getApiKey() {
  if (cachedKey) return cachedKey
  const [version] = await secretClient.accessSecretVersion({ name: SECRET_NAME })
  cachedKey = version.payload.data.toString('utf8').trim()
  return cachedKey
}

async function getCalendarClient() {
  const apiKey = await getApiKey()
  return google.calendar({ version: 'v3', auth: apiKey })
}

const DAY_MS = 24 * 60 * 60 * 1000

/** 구글 이벤트의 시작/종료를 우리 date/endDate(둘 다 '포함' 의미)로 바꾼다.
 *  종일 일정의 end.date는 배타적(다음날 0시)이라 하루 빼야 마지막 날이 맞는다. */
function toOurDates(ev) {
  const start = ev.start?.dateTime || ev.start?.date
  const end = ev.end?.dateTime || ev.end?.date
  if (!start) return null
  const date = new Date(start)
  let endDate = null
  if (end) {
    const raw = new Date(end)
    endDate = ev.start?.date && !ev.start?.dateTime ? new Date(raw.getTime() - DAY_MS) : raw
    if (endDate.getTime() <= date.getTime()) endDate = null   // 하루짜리는 endDate 없이
  }
  return { date, endDate }
}

/** 캘린더 하나의 이벤트를 전부 받는다(페이지네이션) — 반복 일정은 singleEvents로 펼친다. */
async function fetchEvents(calendar, calendarId) {
  const timeMin = new Date(Date.now() - 30 * DAY_MS).toISOString()
  const timeMax = new Date(Date.now() + 400 * DAY_MS).toISOString()
  let events = []
  let pageToken
  do {
    const res = await calendar.events.list({
      calendarId, timeMin, timeMax, singleEvents: true, orderBy: 'startTime',
      maxResults: 2500, pageToken,
    })
    events = events.concat(res.data.items || [])
    pageToken = res.data.nextPageToken
  } while (pageToken)
  return events.filter(ev => ev.status !== 'cancelled')
}

/** 구글 캘린더 이벤트 목록을 academicCalendar 컬렉션과 맞춘다(신규/변경 반영,
 *  사라진 것 삭제) — source 값으로 자기 몫만 건드린다. syncSchoolCalendar(개인
 *  구글 캘린더)와 syncHolidays(공휴일)가 calendarId·source·type만 다르고
 *  나머지 로직이 같아 여기로 뺐다. */
async function applyCalendarSync(col, rawEvents, { source, type }) {
  const existingSnap = await col.where('source', '==', source).get()
  const existingByGoogleId = new Map(
    existingSnap.docs.map(d => [d.data().googleEventId, d]),
  )

  let created = 0
  let updated = 0
  const seenIds = new Set()

  for (const ev of rawEvents) {
    const dates = toOurDates(ev)
    if (!dates) continue
    seenIds.add(ev.id)
    const title = ev.summary || '(제목 없음)'
    const existing = existingByGoogleId.get(ev.id)

    if (!existing) {
      await col.add({
        title, type, date: dates.date, endDate: dates.endDate,
        source, googleEventId: ev.id,
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      })
      created++
    } else {
      const data = existing.data()
      const sameDate = data.date?.toDate?.().getTime() === dates.date.getTime()
      const existingEnd = data.endDate?.toDate?.() || null
      const sameEnd = (existingEnd?.getTime() || null) === (dates.endDate?.getTime() || null)
      if (data.title !== title || !sameDate || !sameEnd) {
        await existing.ref.update({
          title, date: dates.date, endDate: dates.endDate,
          updatedAt: FieldValue.serverTimestamp(),
        })
        updated++
      }
    }
  }

  // 구글에서 지워진(또는 기간 창 밖으로 밀려난) 일정 정리 — 동기화분만 대상.
  let deleted = 0
  for (const [googleEventId, docSnap] of existingByGoogleId) {
    if (!seenIds.has(googleEventId)) {
      await docSnap.ref.delete()
      deleted++
    }
  }

  return { total: rawEvents.length, created, updated, deleted }
}

async function syncSchoolCalendar(db, schoolId, schoolData) {
  const cfg = schoolData.academicCalendarSync
  if (!cfg?.enabled || !cfg.calendarId) return null

  const calendar = await getCalendarClient()
  const rawEvents = await fetchEvents(calendar, cfg.calendarId)
  const col = db.collection('schools').doc(schoolId).collection('academicCalendar')
  return applyCalendarSync(col, rawEvents, { source: 'googleCalendar', type: '행사' })
}

// 구글이 제공하는 대한민국 공휴일 공개 캘린더 — API 키만으로 조회 가능(별도 공유 불필요).
// 학교별 설정(academicCalendarSync.enabled)과 무관하게 모든 학교에 똑같이 적용된다
// (사용자 요청, 2026-09-09 — "대한민국의 공휴일 정보를 받아 표시").
const HOLIDAY_CALENDAR_ID = 'ko.south_korea#holiday@group.v.calendar.google.com'

async function syncHolidays(db, schoolId) {
  const calendar = await getCalendarClient()
  const rawEvents = await fetchEvents(calendar, HOLIDAY_CALENDAR_ID)
  const col = db.collection('schools').doc(schoolId).collection('academicCalendar')
  return applyCalendarSync(col, rawEvents, { source: 'holiday', type: '공휴일' })
}

// ── 매일 새벽 4시(KST) 자동 동기화 — workspaceSync(3시)와 안 겹치게 ──────────
exports.syncAcademicCalendar = onSchedule(
  { schedule: 'every day 04:00', timeZone: 'Asia/Seoul', region: 'asia-northeast3', timeoutSeconds: 300 },
  async () => {
    const db = getFirestore()
    const schoolsSnap = await db.collection('schools').get()

    for (const schoolDoc of schoolsSnap.docs) {
      try {
        const holidayResult = await syncHolidays(db, schoolDoc.id)
        console.log(`[${schoolDoc.id}] 공휴일 동기화 완료:`, JSON.stringify(holidayResult))
      } catch (e) {
        console.error(`[${schoolDoc.id}] 공휴일 동기화 실패:`, e.message)
      }
      try {
        const result = await syncSchoolCalendar(db, schoolDoc.id, schoolDoc.data())
        if (result) console.log(`[${schoolDoc.id}] 학사일정 동기화 완료:`, JSON.stringify(result))
      } catch (e) {
        console.error(`[${schoolDoc.id}] 학사일정 동기화 실패:`, e.message)
      }
    }
  }
)

// ── 관리자가 즉시 수동 실행(설정 확인 후 바로 테스트) ────────────────────
exports.runAcademicCalendarSyncNow = onCall(
  { region: 'asia-northeast3', timeoutSeconds: 300 },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', '로그인이 필요합니다.')

    const { schoolId } = request.data || {}
    if (!schoolId) throw new HttpsError('invalid-argument', 'schoolId가 필요합니다.')

    const db = getFirestore()
    const userDoc = await db.collection('users').doc(request.auth.uid).get()
    const userData = userDoc.data()
    const isSuperAdmin = request.auth.token.superAdmin === true
    const isSchoolAdmin = userData?.schoolId === schoolId &&
      ['admin', 'school_admin'].includes(userData?.role)

    if (!isSuperAdmin && !isSchoolAdmin) {
      throw new HttpsError('permission-denied', '이 학교의 관리자만 동기화를 실행할 수 있습니다.')
    }

    const schoolDoc = await db.collection('schools').doc(schoolId).get()
    if (!schoolDoc.exists) throw new HttpsError('not-found', '학교를 찾을 수 없습니다.')

    try {
      // 공휴일은 학교별 설정과 무관하게 항상 동기화한다 — 개인 구글 캘린더
      // 연동을 아직 안 켠 학교도 "지금 동기화" 버튼으로 즉시 받아볼 수 있다.
      const holidayResult = await syncHolidays(db, schoolId)
      const cfg = schoolDoc.data().academicCalendarSync
      const result = cfg?.enabled ? await syncSchoolCalendar(db, schoolId, schoolDoc.data()) : null
      return { success: true, result, holidayResult }
    } catch (e) {
      console.error(`[${schoolId}] 수동 동기화 실패:`, e)
      throw new HttpsError('internal', e.message || '동기화 중 오류가 발생했습니다.')
    }
  }
)
