/**
 * requests 문서에 kind 채우기 (일회성).
 *
 * 안내(공지)를 requests에 합치면서 kind 필드가 생겼다. 화면 쿼리가 where('kind','==',...)로
 * 거르기 때문에, kind가 없는 옛 문서는 목록에서 조용히 사라진다. JS 쪽 isRequest()는
 * 없는 kind를 'request'로 보지만 Firestore 쿼리는 그렇게 못 한다.
 *
 * 실행
 *   NODE_PATH="$PWD/functions/node_modules" node tools/backfillRequestKind.cjs
 *   NODE_PATH="$PWD/functions/node_modules" node tools/backfillRequestKind.cjs --confirm
 */
const admin = require('firebase-admin')
const { getFirestore } = require('firebase-admin/firestore')

const SCHOOL_ID = process.env.SCHOOL_ID || 'seonyoo-hs'
const CONFIRM = process.argv.includes('--confirm')

admin.initializeApp({ projectId: 'seonyoo-system' })
const db = getFirestore()

async function main() {
  const snap = await db.collection('schools').doc(SCHOOL_ID).collection('requests').get()
  const missing = snap.docs.filter(d => !d.data().kind)

  console.log(`\nrequests 전체 ${snap.size}건, kind 없는 문서 ${missing.length}건`)
  missing.forEach(d => console.log(`  - ${d.data().title || '(제목 없음)'}`))

  if (missing.length === 0) return
  if (!CONFIRM) {
    console.log('\n미리보기입니다. 실제로 채우려면 --confirm 을 붙이세요.')
    return
  }

  const batch = db.batch()
  // 기존 문서는 전부 요청으로 만들어진 것이다 (안내는 이 필드가 생긴 뒤에야 만들 수 있다)
  missing.forEach(d => batch.update(d.ref, { kind: 'request' }))
  await batch.commit()

  console.log(`\n완료: ${missing.length}건에 kind='request'를 채웠습니다.`)
}

main().catch(e => { console.error('실패:', e.message); process.exit(1) })
