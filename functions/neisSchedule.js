const { SecretManagerServiceClient } = require('@google-cloud/secret-manager')
const { getFirestore } = require('firebase-admin/firestore')
const { onCall, HttpsError } = require('firebase-functions/v2/https')

/**
 * 나이스 학사일정 가져오기 — 학사일정 제작 도구(포털 /academic-plan)의 '새 초안 → 나이스에서 가져오기'.
 * 나이스 교육정보 개방 포털(open.neis.go.kr) 공개 API를 쓴다.
 *
 * neisSchedule({ schoolId, action: 'school', query? })
 *   → { saved, candidates } — 학교에 저장된 나이스 학교(schools/{sid}.neis), 없으면 학교 이름(또는 query)으로 찾은 후보
 * neisSchedule({ schoolId, action: 'events', year, atptCode, schoolCode, schoolName })
 *   → { rows: [{date, name, content, grades, off}], limited } — 그 학년도(3/1~다음 해 2월 말) 학사일정.
 *     고른 학교는 schools/{sid}.neis에 저장해 다음부터 다시 묻지 않는다.
 *
 * 인증키는 Secret Manager 'neis-api-key'. 없으면 키 없이 부르는데, 나이스는 그때 5건만 준다(limited: true).
 */

const REGION = 'asia-northeast3'
const NEIS = 'https://open.neis.go.kr/hub'
const KEY_SECRET = 'projects/seonyoo-system/secrets/neis-api-key/versions/latest'
const STAFF_ROLES = ['teacher', 'admin', 'school_admin', 'principal', 'headmaster']

const secretClient = new SecretManagerServiceClient()
let cachedKey = '' // 읽은 키만 기억 — 없을 때는 기억하지 않아 나중에 등록해도 다시 배포할 필요가 없다

async function getNeisKey() {
  if (cachedKey) return cachedKey
  try {
    const [version] = await secretClient.accessSecretVersion({ name: KEY_SECRET })
    cachedKey = version.payload.data.toString('utf8').trim()
  } catch (e) {
    console.warn('[neisSchedule] 인증키 없음 — 키 없이 부릅니다(5건 제한):', e.message)
  }
  return cachedKey
}

/** 나이스 API 한 쪽 — { total, rows }. 결과 없음(INFO-200)은 빈 목록 */
async function neisPage(service, params, key) {
  const qs = new URLSearchParams({ Type: 'json', ...params, ...(key ? { KEY: key } : {}) })
  const res = await fetch(`${NEIS}/${service}?${qs}`)
  if (!res.ok) throw new HttpsError('unavailable', `나이스 응답 오류(${res.status})`)
  const body = await res.json()
  const block = body[service]
  if (!block) {
    const code = body.RESULT?.CODE
    if (code === 'INFO-200') return { total: 0, rows: [] }
    throw new HttpsError('unavailable', `나이스 오류: ${body.RESULT?.MESSAGE || code || '알 수 없음'}`)
  }
  return { total: block[0].head[0].list_total_count, rows: block[1]?.row || [] }
}

async function loadCaller(db, request, schoolId) {
  if (!request.auth) throw new HttpsError('unauthenticated', '로그인이 필요합니다.')
  if (!schoolId) throw new HttpsError('invalid-argument', 'schoolId가 필요합니다.')
  const user = (await db.collection('users').doc(request.auth.uid).get()).data() || {}
  const superAdmin = request.auth.token.superAdmin === true
  return { staff: superAdmin || (user.schoolId === schoolId && STAFF_ROLES.includes(user.role)) }
}

const ymd = (s) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
const lastDayOfFeb = (y) => (new Date(Date.UTC(y, 2, 0)).getUTCDate())

exports.neisSchedule = onCall({ region: REGION, timeoutSeconds: 60 }, async (request) => {
  const { schoolId, action } = request.data || {}
  const db = getFirestore()
  const caller = await loadCaller(db, request, schoolId)
  if (!caller.staff) throw new HttpsError('permission-denied', '교직원만 사용할 수 있습니다.')
  const schoolRef = db.collection('schools').doc(schoolId)
  const key = await getNeisKey()

  if (action === 'school') {
    const school = (await schoolRef.get()).data() || {}
    const query = String(request.data.query || school.name || '').trim()
    if (!query) return { saved: school.neis || null, candidates: [] }
    const { rows } = await neisPage('schoolInfo', { pIndex: 1, pSize: 20, SCHUL_NM: query }, key)
    return {
      saved: school.neis || null,
      candidates: rows.map((r) => ({
        atptCode: r.ATPT_OFCDC_SC_CODE, schoolCode: r.SD_SCHUL_CODE, schoolName: r.SCHUL_NM,
        office: r.ATPT_OFCDC_SC_NM, address: (r.ORG_RDNMA || '').trim(),
      })),
    }
  }

  if (action === 'events') {
    const year = Number(request.data.year)
    const { atptCode, schoolCode, schoolName } = request.data
    if (!(year > 2000) || !atptCode || !schoolCode) throw new HttpsError('invalid-argument', '학년도와 나이스 학교가 필요합니다.')
    const range = {
      ATPT_OFCDC_SC_CODE: atptCode, SD_SCHUL_CODE: schoolCode,
      AA_FROM_YMD: `${year}0301`, AA_TO_YMD: `${year + 1}02${lastDayOfFeb(year + 1)}`,
    }
    const all = []
    for (let page = 1; page <= 10; page++) {
      const { total, rows } = await neisPage('SchoolSchedule', { ...range, pIndex: page, pSize: 1000 }, key)
      all.push(...rows)
      if (!key || all.length >= total || !rows.length) break
    }
    // 고른 학교를 기억 — 다음 학년도에 다시 고르지 않게
    await schoolRef.set({ neis: { atptCode, schoolCode, schoolName: schoolName || all[0]?.SCHUL_NM || '' } }, { merge: true })
    return {
      limited: !key,
      rows: all.map((r) => ({
        date: ymd(r.AA_YMD),
        name: (r.EVENT_NM || '').trim(),
        content: (r.EVENT_CNTNT || '').trim(),
        grades: [['ONE_GRADE_EVENT_YN', 1], ['TW_GRADE_EVENT_YN', 2], ['THREE_GRADE_EVENT_YN', 3]].filter(([f]) => r[f] === 'Y').map(([, g]) => g),
        off: r.SBTR_DD_SC_NM === '공휴일' || r.SBTR_DD_SC_NM === '휴업일' ? r.SBTR_DD_SC_NM : '',
      })),
    }
  }

  throw new HttpsError('invalid-argument', 'action은 school 또는 events여야 합니다.')
})
