const { getAuth } = require('firebase-admin/auth')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
const { onCall, HttpsError } = require('firebase-functions/v2/https')

/**
 * 사전 등록(preApproved) 구성원을 로그인 없이 활성화한다.
 *
 * 왜 필요한가
 *   users 문서 ID는 Firebase Auth UID라, 본인이 한 번 로그인해야 문서가 생긴다.
 *   그 전까지는 보강·연수·담당 배정 등 users를 읽는 도구에 이름이 나오지 않는다.
 *   강사 선생님들은 접속할 일이 드물어 "로그인 후 활성화" 단계에서 계속 막혀 있었다.
 *
 * 방법
 *   관리자 권한으로 그 이메일의 Auth 계정을 먼저 만들고(이미 있으면 재사용) 그 UID로
 *   users 문서를 만든다. 나중에 본인이 구글로 로그인하면 Firebase가 같은 이메일의
 *   계정에 연결하므로 같은 UID로 들어오고, AuthContext는 기존 문서 경로를 그대로 탄다.
 */

const REGION = 'asia-northeast3'
const STAFF_TYPES = ['교사', '강사', '교직원']

function emailToDocId(email) {
  return email.toLowerCase().replace(/\./g, '_').replace(/@/g, '__at__')
}

async function getOrCreateAuthUser(email, name) {
  try {
    return await getAuth().getUserByEmail(email)
  } catch (e) {
    if (e.code !== 'auth/user-not-found') throw e
    return getAuth().createUser({ email, emailVerified: true, displayName: name || undefined })
  }
}

exports.activatePreApprovedStaff = onCall({ region: REGION }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', '로그인이 필요합니다.')

  const { schoolId, email: rawEmail, staffType } = request.data || {}
  const email = (rawEmail || '').trim().toLowerCase()
  if (!schoolId || !email) throw new HttpsError('invalid-argument', 'schoolId와 email이 필요합니다.')
  if (staffType && !STAFF_TYPES.includes(staffType)) {
    throw new HttpsError('invalid-argument', `알 수 없는 구분입니다: ${staffType}`)
  }

  const db = getFirestore()
  const callerSnap = await db.collection('users').doc(request.auth.uid).get()
  const caller = callerSnap.data()
  const isSuperAdmin = request.auth.token.superAdmin === true
  const isSchoolAdmin = caller?.schoolId === schoolId && ['admin', 'school_admin'].includes(caller?.role)
  if (!isSuperAdmin && !isSchoolAdmin) {
    throw new HttpsError('permission-denied', '이 학교의 관리자만 활성화할 수 있습니다.')
  }

  // 사전 등록 명단에 있는 사람만 — 임의 이메일로 계정을 찍어내지 못하게 한다
  const preRef = db.collection('schools').doc(schoolId).collection('preApproved').doc(emailToDocId(email))
  const preSnap = await preRef.get()
  if (!preSnap.exists) throw new HttpsError('not-found', '사전 등록 명단에 없는 이메일입니다.')
  const pre = preSnap.data()
  const resolvedType = staffType || pre.staffType || '교사'

  const authUser = await getOrCreateAuthUser(email, pre.name)
  const userRef = db.collection('users').doc(authUser.uid)
  const userSnap = await userRef.get()

  if (userSnap.exists) {
    const existing = userSnap.data()
    const inThisSchool = existing.schoolId === schoolId
    const activeRole = ['teacher', 'admin', 'school_admin', 'principal'].includes(existing.role)
    // 다른 학교 소속으로 활성 중인 계정은 건드리지 않는다
    if (!inThisSchool && activeRole && !existing.schoolId?.startsWith('guest_')) {
      throw new HttpsError('failed-precondition', '이미 다른 학교 소속으로 사용 중인 계정입니다.')
    }
    if (inThisSchool && activeRole) {
      await userRef.update({ staffType: resolvedType })
    } else {
      // 대기·거절·게스트 상태였던 문서는 사전 등록 내용대로 다시 세운다
      await userRef.set({
        name: existing.name || pre.name || '',
        email,
        role: pre.role || 'teacher',
        schoolId,
        staffType: resolvedType,
        activatedBy: request.auth.uid,
        activatedAt: FieldValue.serverTimestamp(),
      }, { merge: true })
    }
  } else {
    await userRef.set({
      name: pre.name || '',
      email,
      role: pre.role || 'teacher',
      schoolId,
      staffType: resolvedType,
      photoURL: null,
      photoSource: null,
      createdAt: FieldValue.serverTimestamp(),
      activatedBy: request.auth.uid,
      activatedAt: FieldValue.serverTimestamp(),
    })
  }

  if (pre.staffType !== resolvedType) await preRef.update({ staffType: resolvedType })

  return { uid: authUser.uid, staffType: resolvedType }
})
