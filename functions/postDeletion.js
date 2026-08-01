/**
 * 업무 글 완전 삭제.
 *
 * 클라이언트에서 지우면 남는 것이 생긴다.
 *
 *  1. 댓글은 글쓴이라도 남의 것을 지울 수 없다(firestore.rules). "자기 글에 달린 불편한
 *     질문을 지울 수 있으면 안 된다"는 규칙인데, 그 탓에 글을 지워도 남의 댓글은 남는다.
 *     화면에서 닿을 수 없는 문서지만 데이터는 계속 쌓인다.
 *  2. 본문에 넣었다 지운 이미지는 클라이언트가 목록으로 들고 있지 않아 저장소에 남는다.
 *     글쓰다 취소한 경우는 PostNew가 치우지만, 넣었다 빼고 저장한 경우는 아무도 안 치운다.
 *
 * Admin SDK는 규칙을 지나치므로 둘 다 걷어낼 수 있다. 대신 "누가 지울 수 있는가"를
 * 여기서 직접 확인해야 한다 — 규칙이 막아주지 않는다.
 *
 * 저장소는 파일 목록을 받지 않고 경로 앞자리로 지운다. 클라이언트가 아는 목록으로 지우면
 * 딱 1번 문제(아무도 모르는 파일)를 그대로 남긴다.
 */
const { getFirestore } = require('firebase-admin/firestore')
const { getStorage } = require('firebase-admin/storage')
const { onCall, HttpsError } = require('firebase-functions/v2/https')

const REGION = 'asia-northeast3'
const ADMIN_ROLES = ['admin', 'school_admin']

/**
 * 글을 지울 수 있는 사람인지 본다 — 글쓴이 본인, 학교 관리자, 슈퍼 관리자.
 * firestore.rules의 requests delete 조건과 같은 판정이어야 한다.
 */
async function requireCanDelete(db, request, schoolId, requestId) {
  if (!request.auth) throw new HttpsError('unauthenticated', '로그인이 필요합니다.')
  if (request.auth.token.superAdmin === true) return

  const [userSnap, postSnap] = await Promise.all([
    db.collection('users').doc(request.auth.uid).get(),
    db.collection('schools').doc(schoolId).collection('requests').doc(requestId).get(),
  ])

  const user = userSnap.data()
  if (!user || user.schoolId !== schoolId) {
    throw new HttpsError('permission-denied', '이 학교의 글이 아닙니다.')
  }
  if (!postSnap.exists) {
    throw new HttpsError('not-found', '이미 삭제된 글입니다.')
  }

  const isAdmin = ADMIN_ROLES.includes(user.role)
  const isAuthor = postSnap.data().createdBy === request.auth.uid
  if (!isAdmin && !isAuthor) {
    throw new HttpsError('permission-denied', '글쓴이와 관리자만 지울 수 있습니다.')
  }
}

/**
 * 글과 딸린 것 전부 삭제 — 하위 컬렉션(완료 기록·댓글)과 첨부 파일까지.
 *
 * 저장소를 먼저 지운다. 문서를 먼저 지우면 그 뒤 저장소 삭제가 실패했을 때 어느 글의
 * 파일이었는지 알 방법이 사라진다. 반대로 저장소가 먼저 지워지고 문서가 남으면
 * 다시 눌러 지울 수 있다.
 */
exports.deletePostDeep = onCall({ region: REGION }, async (request) => {
  const db = getFirestore()
  const { schoolId, requestId } = request.data || {}
  if (!schoolId || !requestId) {
    throw new HttpsError('invalid-argument', 'schoolId와 requestId가 필요합니다.')
  }

  await requireCanDelete(db, request, schoolId, requestId)

  let deletedFiles = 0
  try {
    const prefix = `schools/${schoolId}/requests/${requestId}/`
    const [files] = await getStorage().bucket().getFiles({ prefix })
    await Promise.all(files.map(f => f.delete()))
    deletedFiles = files.length
  } catch (e) {
    // 파일이 남아도 글은 지워야 한다. 글이 안 지워지는 쪽이 사용자에게 더 나쁘다.
    console.error('첨부 파일 삭제 실패:', requestId, e.message)
  }

  const ref = db.collection('schools').doc(schoolId).collection('requests').doc(requestId)
  await db.recursiveDelete(ref)

  return { deletedFiles }
})
