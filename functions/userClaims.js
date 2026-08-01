/**
 * 소속·직군을 인증 토큰에 심는다 (Custom Claims).
 *
 * 왜 필요한가
 *   Storage 보안 규칙에서 users 문서를 읽어 소속 학교를 확인하려 했으나, 규칙 안의
 *   firestore.get()이 이 프로젝트에서 동작하지 않아 업로드가 전부 거부됐다(storage/unauthorized).
 *   IAM(firebaserules.firestoreServiceAgent)까지 부여했는데도 같아 원인을 특정하지 못했다.
 *
 *   토큰에 값을 심어두면 규칙이 외부를 읽지 않고 request.auth.token만 보면 된다.
 *   교차 서비스 의존이 사라지고, 업로드마다 발생하던 Firestore 읽기 비용도 없어진다.
 *   이 프로젝트는 이미 superAdmin·키오스크에 같은 방식을 쓰고 있다.
 *
 * 주의 — setCustomUserClaims는 기존 클레임을 통째로 갈아치운다.
 *   그대로 쓰면 슈퍼관리자나 키오스크 기기의 클레임이 조용히 사라진다. 항상 기존 값을
 *   읽어 병합한다.
 *
 * 클레임이 갱신돼도 이미 발급된 토큰에는 반영되지 않는다. 클라이언트가 토큰을 새로
 * 받아야 하며(getIdToken(true)), 그러지 않으면 최대 1시간까지 옛 값으로 동작한다.
 */
const { getAuth } = require('firebase-admin/auth')
const { getFirestore } = require('firebase-admin/firestore')
const { onDocumentWritten } = require('firebase-functions/v2/firestore')
const { onCall, HttpsError } = require('firebase-functions/v2/https')

const REGION = 'asia-northeast3'

/** 교직원으로 볼 역할. 학생·대기·거절 계정은 파일을 올릴 수 없다. */
const STAFF_ROLES = ['teacher', 'admin', 'school_admin', 'principal']
const ADMIN_ROLES = ['admin', 'school_admin']

/**
 * users 문서에서 토큰에 심을 값만 뽑는다.
 *
 * role 문자열을 그대로 넣지 않고 boolean 두 개로 줄인 이유는, 역할 이름이 바뀌면
 * 규칙과 토큰이 서로 다른 시점에 갱신되며 어긋나기 때문이다. 규칙이 실제로 묻는 것은
 * "교직원인가"와 "관리자인가" 둘뿐이다.
 */
function claimsFromUser(data) {
  return {
    schoolId: data?.schoolId || null,
    staff: STAFF_ROLES.includes(data?.role) || false,
    admin: ADMIN_ROLES.includes(data?.role) || false,
  }
}

/** 이미 최신이면 굳이 다시 쓰지 않는다 — 클레임을 갱신하면 토큰 재발급이 필요해진다. */
function isUpToDate(existing, next) {
  return existing?.schoolId === next.schoolId
    && !!existing?.staff === next.staff
    && !!existing?.admin === next.admin
}

async function applyClaims(uid, data) {
  const next = claimsFromUser(data)
  const user = await getAuth().getUser(uid)
  const existing = user.customClaims || {}
  if (isUpToDate(existing, next)) return { updated: false, claims: existing }

  // 기존 클레임(superAdmin·kiosk*)을 지우지 않도록 병합한다
  const merged = { ...existing, ...next }
  await getAuth().setCustomUserClaims(uid, merged)
  return { updated: true, claims: merged }
}

/**
 * users 문서가 바뀔 때마다 토큰 클레임을 맞춘다.
 * 소속 학교나 역할이 바뀌는 순간(가입 승인, 전출입, 권한 변경)이 곧 갱신 시점이다.
 */
exports.syncUserClaims = onDocumentWritten(
  { document: 'users/{uid}', region: REGION },
  async (event) => {
    const uid = event.params.uid
    const after = event.data?.after
    if (!after?.exists) return   // 삭제된 계정은 Auth 쪽도 곧 사라진다

    try {
      await applyClaims(uid, after.data())
    } catch (e) {
      // 계정이 Auth에 없는 경우(문서만 먼저 만들어진 상태)가 있어 실패를 삼킨다.
      // 실제 로그인 시 refreshMyClaims가 다시 맞춘다.
      console.error(`[syncUserClaims] ${uid} 실패:`, e.message)
    }
  },
)

/**
 * 내 클레임을 지금 즉시 맞춘다.
 *
 * 트리거는 문서가 바뀔 때만 돈다. 이미 가입해 있는 계정은 문서를 건드릴 일이 없으므로
 * 클레임이 영영 비어 있게 된다. 클라이언트가 로그인 직후 클레임이 없으면 이 함수를 부르고
 * 토큰을 새로 받는다.
 */
exports.refreshMyClaims = onCall({ region: REGION }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', '로그인이 필요합니다.')

  const snap = await getFirestore().collection('users').doc(request.auth.uid).get()
  if (!snap.exists) throw new HttpsError('not-found', '계정 정보를 찾을 수 없습니다.')

  const { claims } = await applyClaims(request.auth.uid, snap.data())
  return { schoolId: claims.schoolId, staff: !!claims.staff, admin: !!claims.admin }
})

exports.claimsFromUser = claimsFromUser
