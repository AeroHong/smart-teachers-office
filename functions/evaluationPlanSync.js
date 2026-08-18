// 평가 운영 계획 확정 시 교직원 관리(기본배정·과목배정)에 자동 반영한다.
//
// teacherAssignments/teacherSubjects는 firestore.rules상 isSchoolAdmin()만 write 가능하다
// (일반 교사는 자기 계정이라도 직접 못 쓴다) — 그래서 클라이언트가 아니라 이 서버 트리거가
// Admin SDK로 규칙을 우회해 반영한다. functions/userClaims.js의 syncUserClaims(onDocumentWritten
// on users/{uid})와 동일한 컨벤션.
//
// 매칭된(teacherMatches[].status === 'matched') 교사 전원에게 반영한다 — 제출자 한 명이 아니라
// hwpx에 공동 지도교사로 적힌 이름 전부가 대상이다. 매칭 실패자는 관리자가 EvalPlanDetail에서
// 수동 배정하면 문서가 다시 update되어 이 트리거가 재실행된다.

const { onDocumentWritten } = require('firebase-functions/v2/firestore')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')

const SEMESTER_FIELD = { 1: 'semester1Subjects', 2: 'semester2Subjects' }

// 같은 과목명+학년 항목이 있으면 갱신, 없으면 추가 (semesterNSubjects 배열 upsert)
function upsertSubjectEntry(arr, entry) {
  const idx = arr.findIndex((s) => s.subjectName === entry.subjectName && s.grade === entry.grade)
  if (idx >= 0) {
    const next = [...arr]
    next[idx] = { ...next[idx], ...entry }
    return next
  }
  return [...arr, entry]
}

exports.syncEvaluationPlanToStaff = onDocumentWritten(
  { document: 'schools/{schoolId}/evaluationPlans/{planId}', region: 'asia-northeast3' },
  async (event) => {
    const after = event.data?.after?.data()
    if (!after || after.status !== 'confirmed') return

    const { schoolId } = event.params
    const db = getFirestore()

    const matched = (after.teacherMatches || []).filter((m) => m.status === 'matched' && m.uid)
    if (!matched.length) return

    const year = after.year
    const grades = after.grades?.length ? after.grades : [null]
    const semesterField = SEMESTER_FIELD[after.semester]

    for (const m of matched) {
      const uid = m.uid
      const assignmentRef = db.doc(`schools/${schoolId}/teacherAssignments/${year}_${uid}`)
      const subjectsRef = db.doc(`schools/${schoolId}/teacherSubjects/${year}_${uid}`)

      // 기본배정 — 담당교과(교과군)
      if (after.subjectGroup) {
        await assignmentRef.set(
          { uid, year, subject: after.subjectGroup, updatedAt: FieldValue.serverTimestamp() },
          { merge: true },
        )
      }

      // 과목배정 — 학기 과목
      if (semesterField && after.subject) {
        const subjectsSnap = await subjectsRef.get()
        let nextArr = subjectsSnap.exists ? (subjectsSnap.data()[semesterField] || []) : []
        grades.forEach((grade) => {
          nextArr = upsertSubjectEntry(nextArr, {
            subjectId: '',
            subjectCode: '',
            subjectName: after.subject,
            grade,
            studentRange: '',
            hoursPerWeek: after.weeklyHours ?? 0,
          })
        })
        await subjectsRef.set(
          { year, teacherUid: uid, teacherName: m.name || '', [semesterField]: nextArr, updatedAt: FieldValue.serverTimestamp() },
          { merge: true },
        )
      }
    }
  },
)
