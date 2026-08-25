/**
 * 업무 글(requests)에 year·ownerUids를 백필한다.
 *
 * "작년 정기고사 때 뭘 했지"를 찾을 방법이 없던 것이 인수인계가 끊기는 실질적 원인이었다
 * (PLAN_workCentric.md §6.1). 이 필드가 있어야 총괄 뷰(부장이 자기 부서 업무 진행을 보는
 * 화면)도 학년도로 좁혀 볼 수 있다.
 *
 * ── 어떻게 채우나 ────────────────────────────────────────────
 *
 *   year        createdAt에서 유도(schema.js의 schoolYearFor). 그 글이 실제로 쓰인
 *               학년도이므로 지금 학년도를 일괄로 넣는 것보다 정확하다
 *   ownerUids   빈 배열로 둔다. workRequests.js의 ownerOf()가 "비어 있으면 createdBy"로
 *               읽으므로, 여기서 createdBy를 복사해 넣지 않아도 총괄 뷰에서 똑같이 잡힌다.
 *               빈 배열로 두는 편이 "담당을 사람이 정한 적 있는가"를 나중에 구분할 수 있어
 *               낫다(전부 채워버리면 그 구분이 사라진다)
 *
 * 여러 번 돌려도 안전하다(이미 값이 있는 문서는 건드리지 않는다) —
 * backfillChannelVisibility.js와 같은 패턴.
 *
 * ── 실행 ────────────────────────────────────────────────────
 *
 *   미리보기:  node functions/migrations/backfillRequestYearAndOwner.js
 *   적용:      node functions/migrations/backfillRequestYearAndOwner.js --apply
 *   특정 학교만: --school=seonyoo-hs
 */
const { initializeApp, applicationDefault } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')

const PROJECT_ID = 'seonyoo-system'
const BATCH_SIZE = 400

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const ONLY_SCHOOL = (args.find(a => a.startsWith('--school=')) || '').split('=')[1] || null

/** schema.js의 schoolYearFor와 반드시 같은 규칙이어야 한다 — CommonJS라 import할 수 없어 복제한다. */
function schoolYearFor(date) {
  const d = date?.toDate ? date.toDate() : new Date(date)
  const month = d.getMonth() + 1
  return month <= 2 ? d.getFullYear() - 1 : d.getFullYear()
}

async function main() {
  initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID })
  const db = getFirestore()

  console.log(`[백필] ${APPLY ? '실제 적용' : '미리보기(변경 없음)'} · 프로젝트 ${PROJECT_ID}`)

  const schools = ONLY_SCHOOL
    ? [ONLY_SCHOOL]
    : (await db.collection('schools').get()).docs.map(d => d.id)

  let grand = { checked: 0, filled: 0, noCreatedAt: 0 }
  for (const schoolId of schools) {
    const r = await backfillSchool(db, schoolId)
    grand.checked += r.checked
    grand.filled += r.filled
    grand.noCreatedAt += r.noCreatedAt
  }

  console.log(`\n[백필] 전체 ${grand.checked}건 확인, ${grand.filled}건 ${APPLY ? '갱신됨' : '갱신 예정'}`)
  if (grand.noCreatedAt > 0) {
    console.log(`[백필] ⚠ createdAt이 없어 year를 못 채운 문서 ${grand.noCreatedAt}건 — 수동 확인 필요`)
  }
  if (!APPLY && grand.filled > 0) {
    console.log('[백필] 실제로 적용하려면 --apply 를 붙여 다시 실행하세요.')
  }
}

async function backfillSchool(db, schoolId) {
  const snap = await db.collection('schools').doc(schoolId).collection('requests').get()
  const targets = snap.docs.filter(d => d.data().year === undefined || d.data().ownerUids === undefined)

  console.log(`  ${schoolId}/requests: ${snap.size}건 중 ${targets.length}건이 비어 있음`)

  let noCreatedAt = 0
  const patches = targets.map((d) => {
    const data = d.data()
    const patch = {}
    if (data.ownerUids === undefined) patch.ownerUids = []
    if (data.year === undefined) {
      if (!data.createdAt) {
        noCreatedAt += 1
        // createdAt조차 없는 문서는 손댈 근거가 없다 — 잘못 추측해 넣느니 건너뛰고 알린다.
        return null
      }
      patch.year = schoolYearFor(data.createdAt)
    }
    return { ref: d.ref, patch }
  }).filter(Boolean)

  if (!APPLY || patches.length === 0) {
    return { checked: snap.size, filled: patches.length, noCreatedAt }
  }

  for (let i = 0; i < patches.length; i += BATCH_SIZE) {
    const batch = db.batch()
    for (const { ref, patch } of patches.slice(i, i + BATCH_SIZE)) batch.update(ref, patch)
    await batch.commit()
    console.log(`    ${Math.min(i + BATCH_SIZE, patches.length)}/${patches.length} 갱신`)
  }

  return { checked: snap.size, filled: patches.length, noCreatedAt }
}

main().catch((e) => {
  console.error('\n[백필] 실패:', e.message)
  if (/could not load the default credentials|UNAUTHENTICATED|PERMISSION_DENIED/i.test(e.message)) {
    console.error('\ngcloud auth application-default login 을 먼저 실행하세요.')
  }
  process.exit(1)
})
