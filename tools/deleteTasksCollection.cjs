/**
 * tasks 컬렉션 삭제 (일회성).
 *
 * tasks는 업무 요청(requests)으로 통합되면서 화면과 보안 규칙에서 제거됐다. 문서만 남아
 * 접근 경로 없이 떠 있어 정리한다. 담당자를 여럿 지정해도 status가 하나뿐이라
 * "누가 안 했나"를 물을 수 없던 구조가 대체된 것이라, 되살릴 계획은 없다.
 *
 * 실행 (Application Default Credentials 필요 — gcloud auth application-default login)
 *   NODE_PATH="$PWD/functions/node_modules" node tools/deleteTasksCollection.cjs
 *   NODE_PATH="$PWD/functions/node_modules" node tools/deleteTasksCollection.cjs --confirm
 *
 * firebase-admin이 루트가 아니라 functions/에만 설치돼 있어 NODE_PATH를 지정한다.
 * 인자 없이 실행하면 지워질 문서 목록만 보여주고 아무것도 건드리지 않는다.
 *
 * 2026-07-31 seonyoo-hs에서 2건(테스트 데이터) 삭제 완료.
 */
const admin = require('firebase-admin')
const { getFirestore } = require('firebase-admin/firestore')

const SCHOOL_ID = process.env.SCHOOL_ID || 'seonyoo-hs'
const CONFIRM = process.argv.includes('--confirm')
const BATCH_SIZE = 400   // Firestore 배치 상한(500)보다 여유를 둔다

admin.initializeApp({ projectId: 'seonyoo-system' })
const db = getFirestore()

async function main() {
  const col = db.collection('schools').doc(SCHOOL_ID).collection('tasks')
  const snap = await col.get()

  console.log(`\n대상: schools/${SCHOOL_ID}/tasks`)
  console.log(`문서 수: ${snap.size}\n`)

  if (snap.size === 0) {
    console.log('지울 문서가 없습니다.')
    return
  }

  // 무엇을 지우는지 눈으로 확인할 수 있게 목록을 보여준다
  snap.docs.slice(0, 20).forEach(d => {
    const t = d.data()
    console.log(`  - ${t.title || '(제목 없음)'}  [${t.status || '?'}] ${t.createdByName || ''}`)
  })
  if (snap.size > 20) console.log(`  … 외 ${snap.size - 20}건`)

  if (!CONFIRM) {
    console.log('\n미리보기입니다. 실제로 지우려면 --confirm 을 붙여 다시 실행하세요.')
    return
  }

  let deleted = 0
  for (let i = 0; i < snap.docs.length; i += BATCH_SIZE) {
    const batch = db.batch()
    snap.docs.slice(i, i + BATCH_SIZE).forEach(d => batch.delete(d.ref))
    await batch.commit()
    deleted += Math.min(BATCH_SIZE, snap.docs.length - i)
    console.log(`  삭제 ${deleted}/${snap.size}`)
  }

  console.log(`\n완료: ${deleted}건 삭제했습니다.`)
}

main().catch(e => {
  console.error('실패:', e.message)
  process.exit(1)
})
