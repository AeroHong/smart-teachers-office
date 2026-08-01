/**
 * 기존 계정에 소속·직군 클레임 채우기 (일회성).
 *
 * syncUserClaims 트리거는 users 문서가 바뀔 때만 돈다. 이미 가입해 있는 계정은 문서를
 * 건드릴 일이 없어 클레임이 영영 비어 있으므로 한 번 돌려서 채운다.
 *
 * 기존 클레임(superAdmin·kiosk*)은 병합해서 보존한다 — setCustomUserClaims는 통째로
 * 갈아치우기 때문에 그냥 쓰면 슈퍼관리자 권한이 조용히 사라진다.
 *
 * 실행 (Application Default Credentials 필요 — gcloud auth application-default login)
 *   NODE_PATH="$PWD/functions/node_modules" node tools/backfillUserClaims.cjs
 *   NODE_PATH="$PWD/functions/node_modules" node tools/backfillUserClaims.cjs --confirm
 *
 * 클레임을 바꿔도 이미 발급된 토큰에는 반영되지 않는다. 각 사용자가 토큰을 새로 받아야
 * 하며(앱이 로그인 직후 자동으로 처리한다), 그러지 않으면 최대 1시간까지 옛 값으로 동작한다.
 */
const admin = require('firebase-admin')
const { getAuth } = require('firebase-admin/auth')
const { getFirestore } = require('firebase-admin/firestore')

const CONFIRM = process.argv.includes('--confirm')
const STAFF_ROLES = ['teacher', 'admin', 'school_admin', 'principal']
const ADMIN_ROLES = ['admin', 'school_admin']

admin.initializeApp({ projectId: 'seonyoo-system' })
const db = getFirestore()

function claimsFromUser(data) {
  return {
    schoolId: data?.schoolId || null,
    staff: STAFF_ROLES.includes(data?.role) || false,
    admin: ADMIN_ROLES.includes(data?.role) || false,
  }
}

function isUpToDate(existing, next) {
  return existing?.schoolId === next.schoolId
    && !!existing?.staff === next.staff
    && !!existing?.admin === next.admin
}

async function main() {
  const snap = await db.collection('users').get()
  console.log(`\nusers 문서 ${snap.size}건 확인\n`)

  const plan = []
  let missingAuth = 0

  for (const doc of snap.docs) {
    const next = claimsFromUser(doc.data())
    try {
      const user = await getAuth().getUser(doc.id)
      const existing = user.customClaims || {}
      if (!isUpToDate(existing, next)) {
        plan.push({ uid: doc.id, email: user.email, existing, next })
      }
    } catch {
      // Auth 계정 없이 Firestore 문서만 있는 경우(사전 등록 등)
      missingAuth += 1
    }
  }

  console.log(`갱신 필요: ${plan.length}건`)
  console.log(`Auth 계정 없음(건너뜀): ${missingAuth}건\n`)

  const byGroup = {}
  plan.forEach(p => {
    const key = `${p.next.schoolId || '(소속없음)'} · ${p.next.admin ? '관리자' : p.next.staff ? '교직원' : '기타'}`
    byGroup[key] = (byGroup[key] || 0) + 1
  })
  Object.entries(byGroup).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`   ${String(v).padStart(4)}명  ${k}`))

  // 기존 클레임이 사라지지 않는지 눈으로 확인할 수 있게 몇 건 보여준다
  const withExtra = plan.filter(p => Object.keys(p.existing).some(k => !['schoolId', 'staff', 'admin'].includes(k)))
  if (withExtra.length > 0) {
    console.log(`\n기존 특수 클레임 보유(병합 대상) ${withExtra.length}건:`)
    withExtra.slice(0, 5).forEach(p => console.log(`   ${p.email} — ${JSON.stringify(p.existing)}`))
  }

  if (!CONFIRM) {
    console.log('\n미리보기입니다. 실제로 적용하려면 --confirm 을 붙이세요.')
    return
  }

  let done = 0
  for (const p of plan) {
    await getAuth().setCustomUserClaims(p.uid, { ...p.existing, ...p.next })
    done += 1
    if (done % 50 === 0) console.log(`   ${done}/${plan.length}`)
  }
  console.log(`\n완료: ${done}건에 클레임을 채웠습니다.`)
  console.log('각 사용자는 다음 접속 때 토큰이 갱신됩니다(앱이 자동 처리).')
}

main().catch(e => { console.error('실패:', e.message); process.exit(1) })
