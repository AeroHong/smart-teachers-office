/**
 * 검·인정도서 선정 건에서 과목 대표교사(subjectHeadUid)를 위원(committeeUids)에 넣는다.
 *
 * 2026-10-01부터 "과목 대표교사는 반드시 위원을 겸한다"는 정책으로 바뀌었고,
 * firestore.rules의 textbookHeadIsCommittee()가 이를 모든 쓰기에 강제한다. 그래서 규칙을
 * 배포하기 **전에** 이 백필을 먼저 적용해야 한다 — 안 그러면 대표교사가 위원이 아닌 기존
 * 문서는 어떤 수정(마감·추천의견 저장 등)도 거부된다.
 *
 * 여러 번 돌려도 안전하다(이미 위원인 문서는 건드리지 않는다).
 *
 *   미리보기:  node functions/migrations/backfillTextbookHeadAsCommittee.js
 *   적용:      node functions/migrations/backfillTextbookHeadAsCommittee.js --apply
 *   특정 학교만: --school=seonyoo-hs
 */
const { initializeApp, applicationDefault } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')

const PROJECT_ID = 'seonyoo-system'

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const ONLY_SCHOOL = (args.find(a => a.startsWith('--school=')) || '').split('=')[1] || null

initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID })
const db = getFirestore()

async function main() {
  console.log(APPLY ? '[적용 모드]' : '[미리보기 — 실제로 쓰려면 --apply]')
  const schools = ONLY_SCHOOL
    ? [ONLY_SCHOOL]
    : (await db.collection('schools').get()).docs.map(d => d.id)

  let total = 0
  for (const schoolId of schools) {
    const snap = await db.collection('schools').doc(schoolId).collection('textbookAdoptions').get()
    const targets = snap.docs.filter((d) => {
      const { subjectHeadUid, committeeUids } = d.data()
      return subjectHeadUid && !(committeeUids || []).includes(subjectHeadUid)
    })
    if (!targets.length) continue
    console.log(`\n${schoolId}: ${targets.length}건 / 전체 ${snap.size}건`)
    for (const d of targets) {
      console.log(`  - ${d.data().subjectName} (${d.id}) 대표교사 ${d.data().subjectHeadUid} → 위원 추가`)
      if (APPLY) await d.ref.update({ committeeUids: FieldValue.arrayUnion(d.data().subjectHeadUid) })
    }
    total += targets.length
  }
  console.log(`\n대상 ${total}건${APPLY ? ' 적용 완료' : ''}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
