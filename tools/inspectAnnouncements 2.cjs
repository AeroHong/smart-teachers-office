/**
 * 공지·학사일정 문서 확인 (읽기 전용).
 *   NODE_PATH="$PWD/functions/node_modules" node tools/inspectAnnouncements.cjs
 */
const admin = require('firebase-admin')
const { getFirestore } = require('firebase-admin/firestore')

const SCHOOL_ID = process.env.SCHOOL_ID || 'seonyoo-hs'
admin.initializeApp({ projectId: 'seonyoo-system' })
const db = getFirestore()

async function main() {
  for (const name of ['announcements', 'academicCalendar', 'requests']) {
    const snap = await db.collection('schools').doc(SCHOOL_ID).collection(name).get()
    console.log(`\n${name}: ${snap.size}건`)
    snap.docs.slice(0, 10).forEach(d => {
      const v = d.data()
      console.log(`  - ${v.title || '(제목 없음)'}  ${v.authorName || v.createdByName || ''}`)
    })
  }
}

main().catch(e => { console.error(e.message); process.exit(1) })
