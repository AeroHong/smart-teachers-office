const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore')
const { getAuth } = require('firebase-admin/auth')
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { onSchedule } = require('firebase-functions/v2/scheduler')

/**
 * 선생님 호출 시스템
 *
 * 키오스크 기기(사무실 앞 입력용 / 사무실 내부 현황판용)는 Firebase 익명 로그인 상태에서
 * 관리자가 발급한 6자리 페어링 코드를 1회 입력해 Custom Claims를 부여받는다:
 *   { kioskSchoolId, kioskOffice, kioskDeviceType }
 * 이후 firestore.rules가 이 클레임으로 접근 범위를 사무실 단위까지 좁힌다.
 * 페어링되지 않은 익명 계정은 아무것도 읽지 못한다.
 *
 * 학생 명단·교직원 명단 조회는 컬렉션을 통째로 열어주지 않고 콜러블로만 제공한다
 * (키오스크는 공용 기기이므로 명단 전체 열람·크롤링을 막기 위함).
 */

const REGION = 'asia-northeast3'
const PAIRING_CODE_TTL_MS = 10 * 60 * 1000   // 페어링 코드 유효시간 10분
const CALL_EXPIRE_MS = 5 * 60 * 1000         // pending 5분 경과 시 자동 만료
const RECALL_COOLDOWN_MS = 60 * 1000         // 같은 학생 1분 이내 재호출 차단
const STAFF_ROLES = ['teacher', 'admin', 'school_admin', 'principal']

// ── 공통 헬퍼 ────────────────────────────────────────────────────────────────
async function requireSchoolAdmin(db, request, schoolId) {
  if (!request.auth) throw new HttpsError('unauthenticated', '로그인이 필요합니다.')
  if (request.auth.token.superAdmin === true) return
  const userDoc = await db.collection('users').doc(request.auth.uid).get()
  const u = userDoc.data()
  if (!u || u.schoolId !== schoolId || !['admin', 'school_admin'].includes(u.role)) {
    throw new HttpsError('permission-denied', '학교 관리자만 실행할 수 있습니다.')
  }
}

// 페어링된 키오스크 기기만 통과 — 클레임에서 학교/사무실을 읽어 반환
function requireKiosk(request) {
  const t = request.auth?.token
  if (!t?.kioskSchoolId || !t?.kioskOffice) {
    throw new HttpsError('permission-denied', '등록되지 않은 기기입니다. 관리자에게 페어링 코드를 요청하세요.')
  }
  return { schoolId: t.kioskSchoolId, office: t.kioskOffice, deviceType: t.kioskDeviceType }
}

function currentSchoolYear() {
  const now = new Date()
  return now.getMonth() + 1 <= 2 ? now.getFullYear() - 1 : now.getFullYear()
}

// 해당 사무실 소속 교직원 목록 (연도별 배정 정보 + users 이름 조인)
async function loadOfficeTeachers(db, schoolId, office) {
  const assignSnap = await db
    .collection('schools').doc(schoolId).collection('teacherAssignments')
    .where('year', '==', currentSchoolYear())
    .where('office', '==', office)
    .get()

  const uids = assignSnap.docs.map(d => d.data().uid).filter(Boolean)
  if (uids.length === 0) return []

  // Firestore documentId in 쿼리는 30개 제한 → 청크 분할
  const teachers = []
  for (let i = 0; i < uids.length; i += 30) {
    const chunk = uids.slice(i, i + 30)
    const userDocs = await db.getAll(...chunk.map(uid => db.collection('users').doc(uid)))
    userDocs.forEach(d => {
      const u = d.data()
      if (u && STAFF_ROLES.includes(u.role)) {
        teachers.push({ uid: d.id, name: u.name || u.email || '' })
      }
    })
  }
  return teachers.sort((a, b) => a.name.localeCompare(b.name, 'ko'))
}

// ── 1. 페어링 코드 발급 (관리자) ──────────────────────────────────────────────
exports.generatePairingCode = onCall({ region: REGION }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', '로그인이 필요합니다.')
  const db = getFirestore()
  const { schoolId, office, deviceType } = request.data || {}

  if (!schoolId || !office) throw new HttpsError('invalid-argument', 'schoolId와 office가 필요합니다.')
  if (!['input', 'display'].includes(deviceType)) {
    throw new HttpsError('invalid-argument', 'deviceType은 input 또는 display여야 합니다.')
  }
  await requireSchoolAdmin(db, request, schoolId)

  // 6자리 코드 — 미사용/만료된 코드만 재사용
  let code = null
  for (let i = 0; i < 20; i++) {
    const candidate = String(Math.floor(100000 + Math.random() * 900000))
    const snap = await db.collection('kioskPairingCodes').doc(candidate).get()
    const expired = snap.exists && (snap.data().expiresAt?.toMillis?.() ?? 0) < Date.now()
    if (!snap.exists || expired) { code = candidate; break }
  }
  if (!code) throw new HttpsError('resource-exhausted', '코드 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.')

  const expiresAt = Timestamp.fromMillis(Date.now() + PAIRING_CODE_TTL_MS)
  await db.collection('kioskPairingCodes').doc(code).set({
    schoolId, office, deviceType,
    createdBy: request.auth.uid,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt,
    used: false,
  })

  return { code, expiresAt: expiresAt.toMillis() }
})

// ── 2. 기기 페어링 (익명 계정이 코드로 클레임 획득) ────────────────────────────
exports.claimKioskDevice = onCall({ region: REGION }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', '기기 인증 세션이 없습니다.')
  const db = getFirestore()
  const code = String(request.data?.code || '').trim()
  if (!/^\d{6}$/.test(code)) throw new HttpsError('invalid-argument', '6자리 코드를 입력하세요.')

  const ref = db.collection('kioskPairingCodes').doc(code)
  const snap = await ref.get()
  if (!snap.exists) throw new HttpsError('not-found', '존재하지 않는 코드입니다.')

  const data = snap.data()
  if (data.used) throw new HttpsError('failed-precondition', '이미 사용된 코드입니다.')
  if ((data.expiresAt?.toMillis?.() ?? 0) < Date.now()) {
    throw new HttpsError('deadline-exceeded', '만료된 코드입니다. 관리자에게 새 코드를 요청하세요.')
  }

  await getAuth().setCustomUserClaims(request.auth.uid, {
    kioskSchoolId: data.schoolId,
    kioskOffice: data.office,
    kioskDeviceType: data.deviceType,
  })
  await ref.update({ used: true, usedByUid: request.auth.uid, usedAt: FieldValue.serverTimestamp() })

  return { schoolId: data.schoolId, office: data.office, deviceType: data.deviceType }
})

// ── 3. 이 키오스크 사무실의 교직원 목록 ────────────────────────────────────────
exports.getKioskTeachers = onCall({ region: REGION }, async (request) => {
  const { schoolId, office } = requireKiosk(request)
  const db = getFirestore()
  return { office, teachers: await loadOfficeTeachers(db, schoolId, office) }
})

// ── 4. 학번으로 학생 이름 확인 (본인 확인용, 이름만 반환) ───────────────────────
exports.lookupStudentName = onCall({ region: REGION }, async (request) => {
  const { schoolId } = requireKiosk(request)
  const db = getFirestore()
  const studentId = String(request.data?.studentId || '').trim()
  if (!studentId) throw new HttpsError('invalid-argument', '학번을 입력하세요.')

  const snap = await db.collection('schools').doc(schoolId).collection('students').doc(studentId).get()
  if (!snap.exists) return { found: false }

  const s = snap.data()
  return { found: true, name: s.name || '', grade: s.grade ?? null, classNo: s.class ?? null, number: s.number ?? null }
})

// ── 5. 호출 생성 ──────────────────────────────────────────────────────────────
exports.submitCallRequest = onCall({ region: REGION }, async (request) => {
  const { schoolId, office } = requireKiosk(request)
  const db = getFirestore()
  const teacherUid = String(request.data?.teacherUid || '').trim()
  const studentId = String(request.data?.studentId || '').trim()
  if (!teacherUid || !studentId) throw new HttpsError('invalid-argument', '교사와 학번을 선택하세요.')

  // 학생 실재 확인 — 없는 학번으로는 호출 불가
  const studentSnap = await db.collection('schools').doc(schoolId).collection('students').doc(studentId).get()
  if (!studentSnap.exists) throw new HttpsError('not-found', '학번을 찾을 수 없습니다.')
  const student = studentSnap.data()

  // 호출 대상 교사가 실제로 이 사무실 소속인지 확인 (다른 사무실 교사 호출 방지)
  const teachers = await loadOfficeTeachers(db, schoolId, office)
  const teacher = teachers.find(t => t.uid === teacherUid)
  if (!teacher) throw new HttpsError('failed-precondition', '이 사무실에 배정된 교사가 아닙니다.')

  // 재호출 제한 — 같은 학생이 1분 이내 재호출 차단
  const cooldownStart = Timestamp.fromMillis(Date.now() - RECALL_COOLDOWN_MS)
  const recentSnap = await db
    .collection('schools').doc(schoolId).collection('callRequests')
    .where('studentId', '==', studentId)
    .where('createdAt', '>', cooldownStart)
    .limit(1)
    .get()
  if (!recentSnap.empty) {
    throw new HttpsError('resource-exhausted', '방금 호출했습니다. 1분 후에 다시 시도해 주세요.')
  }

  const docRef = await db.collection('schools').doc(schoolId).collection('callRequests').add({
    office,
    teacherUid,
    teacherName: teacher.name,          // 호출 시점 스냅샷
    studentId,
    studentName: student.name || '',    // 호출 시점 스냅샷
    grade: student.grade ?? null,
    classNo: student.class ?? null,
    number: student.number ?? null,
    status: 'pending',
    createdAt: FieldValue.serverTimestamp(),
  })

  return { requestId: docRef.id, teacherName: teacher.name, studentName: student.name || '' }
})

// ── 6. 5분 미확인 호출 자동 만료 ───────────────────────────────────────────────
exports.expireCallRequests = onSchedule(
  { schedule: 'every 1 minutes', region: REGION },
  async () => {
    const db = getFirestore()
    const cutoff = Timestamp.fromMillis(Date.now() - CALL_EXPIRE_MS)
    const schoolsSnap = await db.collection('schools').get()

    for (const schoolDoc of schoolsSnap.docs) {
      const staleSnap = await db
        .collection('schools').doc(schoolDoc.id).collection('callRequests')
        .where('status', '==', 'pending')
        .where('createdAt', '<', cutoff)
        .get()
      if (staleSnap.empty) continue

      const batch = db.batch()
      staleSnap.docs.forEach(d => batch.update(d.ref, { status: 'expired', expiredAt: FieldValue.serverTimestamp() }))
      await batch.commit()
      console.log(`[${schoolDoc.id}] 호출 자동 만료 ${staleSnap.size}건`)
    }
  }
)
