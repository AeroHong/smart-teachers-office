/**
 * 사무실을 부서로 합친다 (일회성).
 *
 * 사무실과 부서를 따로 입력받았는데 선유고에서는 방 하나가 부서 하나였다.
 *   2층 교무실 = 교무기획부(6명) + 교감 + 행정직 2명
 *   2층 연구부 = 연구부(1명)
 * 같은 걸 두 번 적는 꼴인데다, 둘 중 한쪽만 채워진 사람은 그 그룹에서 조용히 사라졌다.
 * 실제로 김윤아 선생님은 부서만 있고 사무실이 없어 키오스크 명단에서 빠져 있었다.
 *
 * 학생 호출과 자리 배치가 사무실을 키로 쓰고 있었으므로 함께 옮긴다.
 *
 * 하는 일
 *  1. 부서가 비었고 사무실이 있는 사람에게 부서를 채운다 (교감·행정직 → 교무기획부)
 *  2. teacherAssignments.office 필드를 지운다
 *  3. officeLayouts 문서를 부서 키로 옮긴다 (2026__2층 교무실 → 2026__교무기획부)
 *
 * 원본은 tools/docs/ 아래 JSON으로 남긴다(개인정보라 .gitignore 대상).
 *
 * 실행 (Application Default Credentials 필요)
 *   NODE_PATH="$PWD/functions/node_modules" node tools/mergeOfficeIntoDepartment.cjs
 *   NODE_PATH="$PWD/functions/node_modules" node tools/mergeOfficeIntoDepartment.cjs --confirm
 */
const fs = require('fs')
const path = require('path')
const admin = require('firebase-admin')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')

const SCHOOL_ID = 'seonyoo-hs'
const YEAR = 2026
const CONFIRM = process.argv.includes('--confirm')

/**
 * 부서가 없는 사람을 어느 부서로 보낼지.
 * 교감·행정직은 조직도상 부서가 없지만 2층 교무실에 앉아 있어, 그 문 앞 키오스크에서
 * 호출되려면 부서가 있어야 한다.
 */
const OFFICE_TO_DEPARTMENT = {
  '2층 교무실': '교무기획부',
  '2층 연구부': '연구부',
}

function layoutId(year, name) {
  return `${year}__${name.replace(/\//g, '_')}`
}

admin.initializeApp({ projectId: 'seonyoo-system' })
const db = getFirestore()

async function main() {
  const assignSnap = await db
    .collection('schools').doc(SCHOOL_ID).collection('teacherAssignments')
    .where('year', '==', YEAR).get()

  const usersSnap = await db.collection('users').where('schoolId', '==', SCHOOL_ID).get()
  const nameBy = new Map(usersSnap.docs.map(d => [d.id, d.data().name || d.data().email]))

  const fills = []    // 부서를 채울 사람
  const clears = []   // office 필드만 지울 사람

  assignSnap.docs.forEach(d => {
    const v = d.data()
    const office = (v.office || '').trim()
    const dept = (v.department || '').trim()
    if (!office && !dept) return

    const mapped = OFFICE_TO_DEPARTMENT[office]
    if (!dept && mapped) {
      fills.push({ id: d.id, uid: v.uid, name: nameBy.get(v.uid) || v.uid, office, to: mapped })
    } else if (office) {
      clears.push({ id: d.id, name: nameBy.get(v.uid) || v.uid, office, dept })
    }
  })

  console.log(`\n배정 ${assignSnap.size}건\n`)
  console.log(`부서를 채울 사람 ${fills.length}명:`)
  fills.forEach(f => console.log(`   ${f.name.padEnd(6)}  사무실 "${f.office}"  →  부서 "${f.to}"`))
  console.log(`\n사무실 필드만 지울 사람 ${clears.length}명 (부서 이미 있음):`)
  clears.forEach(c => console.log(`   ${c.name.padEnd(6)}  "${c.office}" 삭제 (부서 "${c.dept}" 유지)`))

  // 사무실과 부서가 어긋난 사람이 있으면 자동으로 결정하지 않는다
  const conflicts = clears.filter(c => OFFICE_TO_DEPARTMENT[c.office] && OFFICE_TO_DEPARTMENT[c.office] !== c.dept)
  if (conflicts.length > 0) {
    console.log(`\n⚠ 사무실과 부서가 어긋난 ${conflicts.length}명 — 부서를 그대로 둡니다. 확인 필요:`)
    conflicts.forEach(c => console.log(`   ${c.name}  사무실 "${c.office}"(→${OFFICE_TO_DEPARTMENT[c.office]})  vs  부서 "${c.dept}"`))
  }

  const layoutSnap = await db
    .collection('schools').doc(SCHOOL_ID).collection('officeLayouts').get()
  const moves = []
  layoutSnap.docs.forEach(d => {
    const v = d.data()
    const office = (v.office || '').trim()
    if (!office) return
    const to = OFFICE_TO_DEPARTMENT[office]
    if (!to) { console.log(`\n⚠ 자리 배치 "${office}" — 대응 부서를 모릅니다. 건너뜁니다.`); return }
    moves.push({ from: d.id, to: layoutId(v.year || YEAR, to), office, department: to, data: v })
  })

  console.log(`\n자리 배치 문서 ${moves.length}건 이동:`)
  moves.forEach(m => console.log(`   ${m.from}  →  ${m.to}   (자리 ${Object.keys(m.data.seats || {}).length}개)`))

  if (!CONFIRM) {
    console.log('\n미리보기입니다. 실제로 적용하려면 --confirm 을 붙이세요.')
    return
  }

  const dir = path.join(__dirname, 'docs')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `office-merge-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}.json`)
  fs.writeFileSync(file, JSON.stringify({
    assignments: assignSnap.docs.map(d => ({ id: d.id, office: d.data().office ?? null, department: d.data().department ?? null })),
    layouts: layoutSnap.docs.map(d => ({ id: d.id, ...d.data() })),
  }, null, 2))
  console.log(`\n원본 저장: ${file}`)

  const batch = db.batch()
  const col = db.collection('schools').doc(SCHOOL_ID).collection('teacherAssignments')
  fills.forEach(f => batch.update(col.doc(f.id), { department: f.to, office: FieldValue.delete() }))
  clears.forEach(c => batch.update(col.doc(c.id), { office: FieldValue.delete() }))

  const layoutCol = db.collection('schools').doc(SCHOOL_ID).collection('officeLayouts')
  moves.forEach(m => {
    const { office, ...rest } = m.data
    batch.set(layoutCol.doc(m.to), { ...rest, department: m.department })
    if (m.from !== m.to) batch.delete(layoutCol.doc(m.from))
  })

  await batch.commit()
  console.log(`\n완료 — 부서 채움 ${fills.length}건, 사무실 삭제 ${fills.length + clears.length}건, 자리 배치 ${moves.length}건 이동.`)
  console.log(`되돌리려면 ${file} 의 내용을 참고해 수동 복구하세요.`)
}

main().catch(e => { console.error('실패:', e.message); process.exit(1) })
