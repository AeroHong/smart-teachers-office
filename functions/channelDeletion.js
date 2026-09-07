/**
 * 채널 완전 삭제 — 채널과 그 안의 캔버스(업무 글)·메시지·첨부 파일까지.
 *
 * "보관"은 목록에서 접을 뿐 데이터를 그대로 남기지만(Channels.jsx의 setChannelArchived),
 * 이건 정말 지운다. 채널 문서만 지우면 두 가지가 남는다.
 *
 *  1. 그 채널의 캔버스(requests)는 channelId로 최상위 컬렉션에 따로 있어, 채널이
 *     사라져도 채널 없는 유령 문서로 계속 남는다.
 *  2. 채널 메시지에 붙은 첨부 파일은 저장 경로가 schools/{schoolId}/messages/{messageId}/
 *     라(ChannelMessages.jsx의 uploadAttachment(folder:'messages')) 채널 문서를
 *     recursiveDelete해도 저장소까지는 안 지워진다.
 *
 * 그래서 캔버스부터 postDeletion.js의 완전 삭제를 그대로 재사용해 하나씩 지우고,
 * 메시지 첨부를 지운 뒤, 마지막으로 채널 문서(+ 메시지·반응 하위 컬렉션)를
 * recursiveDelete한다.
 *
 * DM과 전체 공지 채널은 지울 수 없다 — DM은 firestore.rules도 이미 막고 있고, 전체
 * 공지는 ALL_STAFF_CHANNEL_ID로 여러 화면이 "일단 여기로" 기본값처럼 참조하고 있어
 * 사라지면 홈 리다이렉트 등 여러 화면이 함께 깨진다.
 */
const { getFirestore } = require('firebase-admin/firestore')
const { getStorage } = require('firebase-admin/storage')
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { deletePostFilesAndDoc } = require('./postDeletion')

const REGION = 'asia-northeast3'
const ADMIN_ROLES = ['admin', 'school_admin']
const ALL_STAFF_CHANNEL_ID = 'all-staff'

/**
 * 채널을 지울 수 있는 사람인지 본다 — 만든 사람 본인, 학교 관리자, 슈퍼 관리자
 * (firestore.rules의 channels delete 조건과 같은 판정이어야 한다).
 */
async function requireCanDeleteChannel(db, request, schoolId, channelId) {
  if (!request.auth) throw new HttpsError('unauthenticated', '로그인이 필요합니다.')
  if (request.auth.token.superAdmin === true) return

  const [userSnap, channelSnap] = await Promise.all([
    db.collection('users').doc(request.auth.uid).get(),
    db.collection('schools').doc(schoolId).collection('channels').doc(channelId).get(),
  ])

  const user = userSnap.data()
  if (!user || user.schoolId !== schoolId) {
    throw new HttpsError('permission-denied', '이 학교의 채널이 아닙니다.')
  }
  if (!channelSnap.exists) {
    throw new HttpsError('not-found', '이미 삭제된 채널입니다.')
  }

  const channel = channelSnap.data()
  if (channelId === ALL_STAFF_CHANNEL_ID) {
    throw new HttpsError('failed-precondition', '전체 공지 채널은 지울 수 없습니다.')
  }
  if ((channel.type || 'channel') === 'dm') {
    throw new HttpsError('failed-precondition', 'DM은 지울 수 없습니다.')
  }

  const isAdmin = ADMIN_ROLES.includes(user.role)
  const isCreator = channel.createdBy === request.auth.uid
  if (!isAdmin && !isCreator) {
    throw new HttpsError('permission-denied', '만든 사람과 관리자만 지울 수 있습니다.')
  }
}

exports.deleteChannelDeep = onCall({ region: REGION, timeoutSeconds: 120 }, async (request) => {
  const db = getFirestore()
  const { schoolId, channelId } = request.data || {}
  if (!schoolId || !channelId) {
    throw new HttpsError('invalid-argument', 'schoolId와 channelId가 필요합니다.')
  }

  await requireCanDeleteChannel(db, request, schoolId, channelId)

  // 1) 이 채널의 캔버스(업무 글)부터 하나씩 완전 삭제 — 첨부·댓글·완료 기록까지.
  const postsSnap = await db.collection('schools').doc(schoolId)
    .collection('requests').where('channelId', '==', channelId).get()
  let deletedFiles = 0
  for (const postDoc of postsSnap.docs) {
    const result = await deletePostFilesAndDoc(db, schoolId, postDoc.id)
    deletedFiles += result.deletedFiles
  }

  // 2) 채널 메시지에 붙은 첨부 파일 — 메시지마다 개별 삭제한다(위 파일 설명 참고).
  const messagesSnap = await db.collection('schools').doc(schoolId)
    .collection('channels').doc(channelId).collection('messages').get()
  const bucket = getStorage().bucket()
  await Promise.all(messagesSnap.docs.map(async (msgDoc) => {
    const path = msgDoc.data().attachment?.path
    if (!path) return
    try {
      await bucket.file(path).delete()
      deletedFiles += 1
    } catch (e) {
      console.error('메시지 첨부 삭제 실패:', msgDoc.id, e.message)
    }
  }))

  // 3) 채널 문서 자체 — 메시지·반응 하위 컬렉션까지 recursiveDelete가 함께 지운다.
  await db.recursiveDelete(db.collection('schools').doc(schoolId).collection('channels').doc(channelId))

  return { deletedPosts: postsSnap.size, deletedMessages: messagesSnap.size, deletedFiles }
})
