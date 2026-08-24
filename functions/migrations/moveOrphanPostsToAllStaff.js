/**
 * 전교직원 채널을 만들고, 채널 없는 글을 전부 그리로 옮긴다.
 *
 * ── 왜 필요한가 ──────────────────────────────────────────────
 *
 * 채널이 생기기 전의 글에는 `channelId`가 없다. 그 예외를 남겨두면 "채널 없는 글"을 위한
 * 갈래가 화면마다 하나씩 더 필요해진다 — 홈에서 한 번, 검색에서 한 번, 알림에서 한 번.
 * 전교직원 채널 하나를 두고 그리로 모으면 **모든 글이 채널을 갖는다**는 규칙 하나만 남는다.
 *
 * 홈 화면을 채널 목록으로 바꾸는 작업(P3-3)의 선행 조건이기도 하다. 지금 홈의 '전체 공지'가
 * 갈 곳이 없으면 홈을 채널로 대체할 수 없다.
 *
 * ── 요청까지 옮기는 이유 ────────────────────────────────────
 *
 * 몇 사람에게만 보낸 요청을 '전교직원' 채널에 넣는 것이 어색해 보일 수 있다. 그래도 옮기는
 * 이유는 **예외를 없애는 것이 목적**이기 때문이다. 안내만 옮기면 "채널 없는 요청"이 남아
 * 갈래가 그대로 둘이다.
 *
 * 대상은 하나도 바뀌지 않는다(`targetUids` 그대로). 채널은 "이 글이 어디에 사는가"이고
 * 대상은 "누가 해야 하는가"라 서로 다른 축이다. 홈의 '안 한 일'도 채널이 아니라 대상으로
 * 뽑으므로 옮겨도 그대로 보인다.
 *
 * 채널 머리의 캔버스 탭에는 **살아 있는 글만** 뜨고(isLivePost) 넘치면 접히므로, 옛 글이
 * 한꺼번에 들어와도 탭이 터지지 않는다.
 *
 * ── 열람 범위는 건드리지 않는다 ─────────────────────────────
 *
 * 전교직원 채널은 공개 채널이고, 옮기는 글은 이미 `visibility: 'school'`이다
 * (backfillChannelVisibility.js가 채웠다). `postVisibilityFor(공개 채널)`의 결과와 정확히
 * 같으므로 손댈 것이 없다. **비공개 채널의 글은 애초에 channelId가 있어서 대상이 아니다.**
 *
 * ── 실행 ────────────────────────────────────────────────────
 *
 *   1) 처음 한 번만:  gcloud auth application-default login
 *   2) 미리보기:      node functions/migrations/moveOrphanPostsToAllStaff.js
 *   3) 실제 적용:     node functions/migrations/moveOrphanPostsToAllStaff.js --apply
 *
 *   특정 학교만:      --school=seonyoo-hs
 *
 * 여러 번 돌려도 안전하다. 채널은 고정 ID라 두 개 생기지 않고, 글은 channelId가 없는 것만
 * 건드린다.
 */
const { initializeApp, applicationDefault } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')

const PROJECT_ID = 'seonyoo-system'

// apps/shared/lib/schema.js 의 ALL_STAFF_CHANNEL_ID 와 반드시 같아야 한다.
// Cloud Functions는 별도 npm 패키지라 그 모듈을 import할 수 없어 손으로 복제해 둔다
// (officeLayoutId가 같은 이유로 복제돼 있다).
const ALL_STAFF_CHANNEL_ID = 'all-staff'

// 채널 참여자로 넣을 역할. useSchoolMembers.js의 STAFF_ROLES와 같다.
const STAFF_ROLES = ['teacher', 'admin', 'school_admin', 'principal']

const BATCH_SIZE = 400

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const ONLY_SCHOOL = (args.find(a => a.startsWith('--school=')) || '').split('=')[1] || null

async function main() {
  initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID })
  const db = getFirestore()

  console.log(`[전교직원 채널] ${APPLY ? '실제 적용' : '미리보기(변경 없음)'} · 프로젝트 ${PROJECT_ID}`)

  const schools = ONLY_SCHOOL
    ? [ONLY_SCHOOL]
    : (await db.collection('schools').get()).docs.map(d => d.id)
  console.log(`[전교직원 채널] 대상 학교 ${schools.length}곳: ${schools.join(', ')}`)

  let moved = 0
  for (const schoolId of schools) {
    moved += await migrate(db, schoolId)
  }

  console.log(`\n[전교직원 채널] 글 ${moved}건 ${APPLY ? '옮김' : '옮길 예정'}`)
  if (!APPLY) console.log('[전교직원 채널] 실제로 적용하려면 --apply 를 붙여 다시 실행하세요.')
}

async function migrate(db, schoolId) {
  const school = db.collection('schools').doc(schoolId)
  const channelRef = school.collection('channels').doc(ALL_STAFF_CHANNEL_ID)

  // 교직원 명단 — users는 최상위 컬렉션이라 schoolId로 거른다
  const usersSnap = await db.collection('users')
    .where('schoolId', '==', schoolId)
    .where('role', 'in', STAFF_ROLES)
    .get()
  const memberUids = usersSnap.docs.map(d => d.id)

  const existing = await channelRef.get()
  if (existing.exists) {
    console.log(`  ${schoolId}: 채널이 이미 있음 (참여 ${(existing.data().memberUids || []).length}명)`)
  } else {
    console.log(`  ${schoolId}: 채널 생성 예정 (참여 ${memberUids.length}명)`)
    if (APPLY) await channelRef.set(channelDoc(memberUids))
  }

  // channelId가 없는 글. Firestore에는 "필드가 없다"를 거르는 쿼리가 없어서 전부 읽고
  // 클라이언트에서 나눈다 — 한 학교의 글은 많아야 수천 건이라 감당된다.
  const postsSnap = await school.collection('requests').get()
  const orphans = postsSnap.docs.filter((d) => {
    const channelId = d.data().channelId
    return channelId === undefined || channelId === null || channelId === ''
  })

  console.log(`  ${schoolId}/requests: ${postsSnap.size}건 중 채널 없는 글 ${orphans.length}건`)
  if (!APPLY || orphans.length === 0) return orphans.length

  for (let i = 0; i < orphans.length; i += BATCH_SIZE) {
    const batch = db.batch()
    for (const d of orphans.slice(i, i + BATCH_SIZE)) {
      // visibility/visibleUids는 손대지 않는다 — 이미 공개 채널의 글과 같은 값이다.
      batch.update(d.ref, { channelId: ALL_STAFF_CHANNEL_ID })
    }
    await batch.commit()
    console.log(`    ${Math.min(i + BATCH_SIZE, orphans.length)}/${orphans.length} 옮김`)
  }

  return orphans.length
}

/**
 * 전교직원 채널 문서.
 *
 * `memberRule`을 **빈 조건**으로 둔다. targeting.js에서 조건도 개별 지정도 없으면 전체
 * 교직원이라, 나중에 사람이 늘거나 줄면 '참여자 갱신'이 그 차이를 짚어준다. uid만 박아두면
 * 인사이동 뒤에 새로 온 선생님에게 학교 공지가 통째로 안 보이고, 화면은 어제와 똑같아서
 * 아무도 눈치채지 못한다.
 *
 * `createdBy`를 사람으로 두지 않는다. 이 채널은 누구의 것도 아니고 관리자가 관리한다 —
 * canManageChannel이 관리자를 이미 통과시키므로 이름·설명·참여자 갱신은 관리자가 할 수 있고,
 * 개인이 남의 학교 공지 채널을 지우거나 보관할 수는 없다.
 */
function channelDoc(memberUids) {
  return {
    name: '전체 공지',
    description: '학교 전체에 알리는 글이 모입니다.',
    type: 'channel',
    visibility: 'public',
    postPolicy: 'members',
    memberRule: { conditions: [], includeUids: [], excludeUids: [] },
    memberRuleText: '전체 교직원',
    memberUids,
    leftUids: [],
    archived: false,
    createdBy: 'system',
    createdByName: '시스템',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }
}

main().catch((e) => {
  console.error('\n[전교직원 채널] 실패:', e.message)
  if (/could not load the default credentials|UNAUTHENTICATED|PERMISSION_DENIED/i.test(e.message)) {
    console.error('\n자격 증명이 없습니다. 먼저 아래를 한 번 실행하세요:')
    console.error('  gcloud auth application-default login')
  }
  process.exit(1)
})
