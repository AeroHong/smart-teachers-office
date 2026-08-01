/**
 * users.name 앞에 붙은 직책 접두어를 떼고 이름만 남긴다 (일회성).
 *
 * 나이스에서 넘어온 이름이 "교사강혜련"처럼 직책+이름으로 붙어 있다. 문제가 셋이다.
 *
 *  1. 직책이 바뀌어도 이름은 안 따라간다. 강혜련 선생님은 연구부장인데 아직 '교사'다.
 *  2. 가나다 정렬이 이름이 아니라 직책 순으로 된다. 47명이 '교사…'로 시작해 ㄱ 구간에
 *     전부 뭉치므로, 명단에서 사람을 찾을 때 눈으로 훑어야 한다.
 *  3. 직책은 teacherAssignments.positionLabel에 이미 구조화돼 있다. 같은 정보를 두 군데
 *     두면서 한쪽만 낡는다.
 *
 * 원본은 tools/docs/ 아래에 JSON으로 남긴다(개인정보라 .gitignore 대상). 되돌리려면
 * --rollback <파일> 로 그대로 복구된다.
 *
 * 실행 (Application Default Credentials 필요 — gcloud auth application-default login)
 *   NODE_PATH="$PWD/functions/node_modules" node tools/stripNamePrefix.cjs             # 미리보기
 *   NODE_PATH="$PWD/functions/node_modules" node tools/stripNamePrefix.cjs --confirm   # 적용
 *   NODE_PATH="$PWD/functions/node_modules" node tools/stripNamePrefix.cjs --rollback tools/docs/names-....json
 */
const fs = require('fs')
const path = require('path')
const admin = require('firebase-admin')
const { getFirestore } = require('firebase-admin/firestore')

const SCHOOL_ID = 'seonyoo-hs'
const STAFF_ROLES = ['teacher', 'admin', 'school_admin', 'principal']
const CONFIRM = process.argv.includes('--confirm')
const ROLLBACK = process.argv[process.argv.indexOf('--rollback') + 1]
const IS_ROLLBACK = process.argv.includes('--rollback')

/**
 * 자르는 규칙은 apps/shared/lib/personName.js 한 곳에만 둔다.
 *
 * AuthContext가 로그인마다 같은 규칙으로 걸러야 접두어가 되살아나지 않는데, 규칙을
 * 여기 따로 베껴두면 둘이 어긋나는 순간 이 스크립트로 정리한 이름이 다음 로그인에
 * 원래대로 돌아간다. ESM이라 동적 import로 가져온다.
 */
let stripTitlePrefix

/** 사람이 아닌 계정 — 이름을 건드리지 않는다. */
const NOT_A_PERSON = ['도메인 관리자선유고', '공유드라이브관리']

function strip(raw) {
  const name = (raw || '').trim()
  if (!name) return { name: raw, bare: raw, note: '이름 없음' }
  if (NOT_A_PERSON.includes(name)) return { name, bare: name, note: '사람 아님 — 건너뜀' }

  const bare = stripTitlePrefix(name)
  if (bare === name) return { name, bare: name, note: '접두어 없음 또는 이름 같지 않아 건너뜀' }
  return { name, bare, note: null }
}

admin.initializeApp({ projectId: 'seonyoo-system' })
const db = getFirestore()

async function rollback() {
  const saved = JSON.parse(fs.readFileSync(ROLLBACK, 'utf8'))
  console.log(`\n${ROLLBACK}\n원본 ${saved.length}건으로 되돌립니다.\n`)
  if (!CONFIRM) {
    saved.slice(0, 10).forEach(r => console.log(`   ${r.uid}  → "${r.name}"`))
    console.log('\n미리보기입니다. 실제로 되돌리려면 --confirm 을 붙이세요.')
    return
  }
  let batch = db.batch()
  saved.forEach((r, i) => {
    batch.update(db.collection('users').doc(r.uid), { name: r.name })
    if ((i + 1) % 400 === 0) { batch.commit(); batch = db.batch() }
  })
  await batch.commit()
  console.log(`완료: ${saved.length}건 복구.`)
}

async function main() {
  if (IS_ROLLBACK) return rollback()

  const snap = await db.collection('users')
    .where('schoolId', '==', SCHOOL_ID).where('role', 'in', STAFF_ROLES).get()

  const rows = snap.docs.map(d => ({ uid: d.id, ...strip(d.data().name) }))
  const changing = rows.filter(r => r.name !== r.bare)
  const skipped = rows.filter(r => r.note)

  console.log(`\n교직원 ${rows.length}명 · 바꿀 이름 ${changing.length}건\n`)
  changing.forEach(r => console.log(`   "${r.name}"  →  "${r.bare}"`))

  if (skipped.length > 0) {
    console.log(`\n건드리지 않음 ${skipped.length}건:`)
    skipped.forEach(r => console.log(`   "${r.name}"  — ${r.note}`))
  }

  // 이름만 남기면 동명이인이 생기는지. 생긴다면 명단에서 두 사람을 구분할 수 없다
  const cnt = {}
  rows.forEach(r => { cnt[r.bare] = (cnt[r.bare] || 0) + 1 })
  const dup = Object.entries(cnt).filter(([, v]) => v > 1)
  if (dup.length > 0) {
    console.log(`\n⚠ 동명이인 ${dup.length}건 — 명단에서 구분이 안 됩니다:`)
    dup.forEach(([k, v]) => console.log(`   ${k} × ${v}`))
  } else {
    console.log('\n동명이인 없음')
  }

  if (!CONFIRM) {
    console.log('\n미리보기입니다. 실제로 적용하려면 --confirm 을 붙이세요.')
    return
  }

  const dir = path.join(__dirname, 'docs')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `names-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}.json`)
  fs.writeFileSync(file, JSON.stringify(changing.map(r => ({ uid: r.uid, name: r.name })), null, 2))
  console.log(`\n원본 저장: ${file}`)

  const batch = db.batch()
  changing.forEach(r => batch.update(db.collection('users').doc(r.uid), { name: r.bare }))
  await batch.commit()

  console.log(`완료: ${changing.length}건.`)
  console.log(`되돌리려면 --rollback ${file} --confirm`)
}

import('../apps/shared/lib/personName.js')
  .then(m => { stripTitlePrefix = m.stripTitlePrefix })
  .then(main)
  .catch(e => { console.error('실패:', e.message); process.exit(1) })
