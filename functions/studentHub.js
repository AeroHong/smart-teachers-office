/**
 * 스마트교무실 → StudentHub(학적·고사 관리 앱) 이동 시 재로그인 없이 넘겨주는 토큰.
 *
 * 왜 필요한가
 *   StudentHub는 같은 Firebase 프로젝트를 쓰지만 호스팅 사이트(도메인)가 다르다. Firebase
 *   Auth 세션은 출처(origin)별 저장소에 있어서, 링크만 걸면 넘어가자마자 다시 구글 로그인
 *   창이 뜬다. 교사 입장에서는 "같은 시스템인데 왜 또 로그인하나"가 된다.
 *
 *   그래서 이미 로그인한 쪽(portal/dashboard)이 이 함수로 본인 uid의 custom token을 받아
 *   URL 해시(#token=)로 넘기고, StudentHub가 signInWithCustomToken으로 같은 uid로 들어간다.
 *   해시는 서버로 전송되지 않고, 토큰은 발급 후 1시간 안에 한 번 쓰고 버린다.
 *
 * custom claims(schoolId·staff·admin·superAdmin)는 Auth 사용자 레코드에 붙어 있어 custom
 * token으로 로그인해도 그대로 따라온다 — 여기서 따로 넣지 않는다.
 *
 * 필요 권한: 함수 서비스 계정에 "서비스 계정 토큰 생성자"(iam.serviceAccounts.signBlob).
 */
const { getAuth } = require('firebase-admin/auth')
const { getFirestore } = require('firebase-admin/firestore')
const { onCall, HttpsError } = require('firebase-functions/v2/https')

const REGION = 'asia-northeast3'

/** 교직원만 넘긴다 — 학생·대기·거절 계정은 StudentHub에 들어갈 일이 없다. */
const STAFF_ROLES = ['teacher', 'admin', 'school_admin', 'principal']

exports.issueHubHandoffToken = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', '로그인이 필요합니다.')

  if (request.auth.token.superAdmin !== true) {
    const snap = await getFirestore().collection('users').doc(uid).get()
    if (!STAFF_ROLES.includes(snap.get('role'))) {
      throw new HttpsError('permission-denied', '교직원 계정만 이동할 수 있습니다.')
    }
  }

  const token = await getAuth().createCustomToken(uid)
  return { token }
})
