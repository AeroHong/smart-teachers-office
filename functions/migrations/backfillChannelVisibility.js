/**
 * 채널 공개 범위 백필 — 비공개 채널(P1)을 켜기 전에 반드시 먼저 돌린다.
 *
 * ── 왜 필요한가 ──────────────────────────────────────────────
 *
 * Firestore에서 `where('visibility','==','school')`은 **그 필드가 아예 없는 문서를 돌려주지
 * 않는다.** 규칙 쪽은 `.get(field, default)`로 옛 문서를 흡수할 수 있지만 쿼리는 그럴 수
 * 없다. 그래서 필드를 채우지 않은 채 새 클라이언트를 배포하면 기존 글이 목록에서 통째로
 * 사라진다 — 지워진 것처럼 보이지만 실은 안 잡히는 것이라 원인을 찾기도 어렵다.
 *
 * 순서: **이 스크립트 → firestore.rules 배포 → 클라이언트 배포**
 * (PLAN_channels_datamodel.md §9)
 *
 * 이 작업 자체는 필드를 더하기만 하므로 옛 규칙·옛 클라이언트와 아무 충돌이 없다.
 * 아무도 아직 이 필드를 읽지 않기 때문에 먼저 돌려두어도 안전하다.
 *
 * ── 형제 파일과 다른 점 ──────────────────────────────────────
 *
 * 같은 폴더의 migrateStudents*.js는 onCall 함수라 배포한 뒤 curl로 부른다. 이건 그냥
 * 로컬 CLI다. 한 번 돌리고 끝나는 일에 프로덕션 함수 표면을 늘릴 이유가 없고, 학생
 * 마이그레이션과 달리 Workspace 같은 외부 자격 증명이 필요 없다.
 *
 * ── 실행 ────────────────────────────────────────────────────
 *
 *   1) 처음 한 번만:  gcloud auth application-default login
 *   2) 미리보기:      node functions/migrations/backfillChannelVisibility.js
 *   3) 실제 적용:     node functions/migrations/backfillChannelVisibility.js --apply
 *
 *   특정 학교만:      --school=seonyoo-hs
 *
 * 여러 번 돌려도 안전하다(이미 값이 있는 문서는 건드리지 않는다).
 */
const { initializeApp, applicationDefault } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')

const PROJECT_ID = 'seonyoo-system'

// Firestore 배치 상한은 500이다. 여유를 두고 자른다.
const BATCH_SIZE = 400

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const ONLY_SCHOOL = (args.find(a => a.startsWith('--school=')) || '').split('=')[1] || null

/** 채널이 없던 시절의 값 — 지금까지 만들어진 채널은 전부 공개·일반 채널이었다. */
const CHANNEL_DEFAULTS = { type: 'channel', visibility: 'public', postPolicy: 'members' }

/**
 * 지금까지의 글은 전부 학교 전체 공개였다(비공개 채널이 없었으므로).
 *
 * visibleUids를 빈 배열로라도 넣어두는 이유: 규칙이 `uid in resource.data.visibleUids`를
 * 평가할 때 필드가 아예 없으면 평가가 터진다. `||` 단축 평가 덕에 공개 글에서는 보통
 * 거기까지 가지 않지만, 필드가 있으면 그 미묘함에 기대지 않아도 된다. 빈 배열이라
 * 저장 비용도 없다 — 값이 실제로 채워지는 것은 비공개 채널의 글뿐이다.
 */
const REQUEST_DEFAULTS = { visibility: 'school', visibleUids: [] }

async function main() {
  initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID })
  const db = getFirestore()

  console.log(`[백필] ${APPLY ? '실제 적용' : '미리보기(변경 없음)'} · 프로젝트 ${PROJECT_ID}`)

  const schools = ONLY_SCHOOL
    ? [ONLY_SCHOOL]
    : (await db.collection('schools').get()).docs.map(d => d.id)
  console.log(`[백필] 대상 학교 ${schools.length}곳: ${schools.join(', ')}`)

  let grand = { checked: 0, filled: 0 }
  for (const schoolId of schools) {
    const a = await backfill(db, schoolId, 'channels', CHANNEL_DEFAULTS)
    const b = await backfill(db, schoolId, 'requests', REQUEST_DEFAULTS)
    grand.checked += a.checked + b.checked
    grand.filled += a.filled + b.filled
  }

  console.log(`\n[백필] 전체 ${grand.checked}건 확인, ${grand.filled}건 ${APPLY ? '갱신됨' : '갱신 예정'}`)
  if (!APPLY && grand.filled > 0) {
    console.log('[백필] 실제로 적용하려면 --apply 를 붙여 다시 실행하세요.')
  }
}

/**
 * 빠진 필드만 채운다.
 *
 * 이미 값이 있는 문서를 건드리지 않는 것이 중요하다. 사람이 비공개로 바꿔둔 채널을
 * 이 스크립트가 다시 공개로 되돌리면, 되돌렸다는 사실이 아무 화면에도 안 나타난다.
 */
async function backfill(db, schoolId, collection, defaults) {
  const snap = await db.collection('schools').doc(schoolId).collection(collection).get()
  const fields = Object.keys(defaults)

  const targets = snap.docs.filter(d => {
    const data = d.data()
    return fields.some(f => data[f] === undefined)
  })

  console.log(`  ${schoolId}/${collection}: ${snap.size}건 중 ${targets.length}건이 비어 있음`)

  if (!APPLY || targets.length === 0) {
    return { checked: snap.size, filled: targets.length }
  }

  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const batch = db.batch()
    for (const d of targets.slice(i, i + BATCH_SIZE)) {
      const data = d.data()
      // 있는 값은 그대로 두고 빠진 것만 넣는다
      const patch = {}
      for (const f of fields) if (data[f] === undefined) patch[f] = defaults[f]
      batch.update(d.ref, patch)
    }
    await batch.commit()
    console.log(`    ${Math.min(i + BATCH_SIZE, targets.length)}/${targets.length} 갱신`)
  }

  return { checked: snap.size, filled: targets.length }
}

main().catch((e) => {
  console.error('\n[백필] 실패:', e.message)
  if (/could not load the default credentials|UNAUTHENTICATED|PERMISSION_DENIED/i.test(e.message)) {
    console.error('\n자격 증명이 없습니다. 먼저 아래를 한 번 실행하세요:')
    console.error('  gcloud auth application-default login')
  }
  process.exit(1)
})
