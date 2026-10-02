// 검·인정도서 선정 — 위원 제출 현황을 선정 건 문서에 요약해 둔다.
//
// 위원 점수(scores)는 공정성 원칙상 본인·대표교사·교과부장·관리자만 읽는다(매뉴얼의
// "개인별 평가 결과 공개 금지"). 그래서 일반 위원 화면은 "모두 제출했는지"를 스스로 알 수
// 없다. 이 트리거가 점수는 빼고 **누가 제출했는지(uid·외부 위원 id)만** 부모 문서의
// submittedUids에 적어, 내 선정 건 카드가 "내 채점 완료"·"전원 제출(마감 대기)"을 보여줄 수
// 있게 한다. 점수가 지워져도(위원 교체·담당 해제) 같은 경로로 다시 계산된다.
//
// submittedUids는 firestore.rules의 "전원 제출 전 마감 금지"(textbookAllSubmitted) 근거이기도 하다.
const { onDocumentWritten } = require('firebase-functions/v2/firestore')
const { getFirestore } = require('firebase-admin/firestore')

// "제출 완료" = 제출 확정 + 현재 후보 전부의 점수가 있음. 진행 중 후보가 추가되면 이미 제출한
// 위원은 새 후보 점수가 없어 재채점 전까지 미제출로 본다(2026-10-02). 클라이언트
// apps/shared/lib/textbookAdoption.js의 isCompleteSubmission과 같은 기준(CommonJS라 복제).
function isCompleteSubmission(score, candidates) {
  return !!score?.submittedAt && (candidates || []).every((c) => score.byCandidate?.[c.id])
}

async function recomputeSubmitted(db, schoolId, adoptionId) {
  const adoptionRef = db.doc(`schools/${schoolId}/textbookAdoptions/${adoptionId}`)
  const snap = await adoptionRef.get()
  if (!snap.exists) return
  const candidates = snap.data().candidates || []
  const scores = await adoptionRef.collection('scores').get()
  const submittedUids = scores.docs.filter((d) => isCompleteSubmission(d.data(), candidates)).map((d) => d.id).sort()
  const prev = (snap.data().submittedUids || []).slice().sort()
  if (prev.length === submittedUids.length && prev.every((v, i) => v === submittedUids[i])) return
  await adoptionRef.update({ submittedUids })
}

exports.recomputeSubmitted = recomputeSubmitted

exports.syncTextbookSubmitted = onDocumentWritten(
  { document: 'schools/{schoolId}/textbookAdoptions/{adoptionId}/scores/{scoreId}', region: 'asia-northeast3' },
  async (event) => {
    const { schoolId, adoptionId } = event.params
    await recomputeSubmitted(getFirestore(), schoolId, adoptionId)
  },
)

// 후보 목록이 바뀌면(추가·삭제) 제출 명단을 다시 계산한다. 후보 id 목록이 같으면 아무것도
// 하지 않고, recomputeSubmitted도 결과가 같으면 쓰지 않으므로 이 트리거가 자기 쓰기로 반복되지 않는다.
const candidateKey = (data) => (data?.candidates || []).map((c) => c.id).sort().join('|')

exports.syncTextbookSubmittedOnCandidates = onDocumentWritten(
  { document: 'schools/{schoolId}/textbookAdoptions/{adoptionId}', region: 'asia-northeast3' },
  async (event) => {
    const before = event.data?.before?.exists ? event.data.before.data() : null
    const after = event.data?.after?.exists ? event.data.after.data() : null
    if (!after || !before) return
    if (candidateKey(before) === candidateKey(after)) return
    const { schoolId, adoptionId } = event.params
    await recomputeSubmitted(getFirestore(), schoolId, adoptionId)
  },
)
