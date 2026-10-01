// 검·인정도서 선정 — 위원 제출 현황을 선정 건 문서에 요약해 둔다.
//
// 위원 점수(scores)는 공정성 원칙상 본인·대표교사·교과부장·관리자만 읽는다(매뉴얼의
// "개인별 평가 결과 공개 금지"). 그래서 일반 위원 화면은 "모두 제출했는지"를 스스로 알 수
// 없다. 이 트리거가 점수는 빼고 **누가 제출했는지(uid·외부 위원 id)만** 부모 문서의
// submittedUids에 적어, 내 선정 건 카드가 "내 채점 완료"·"전원 제출(마감 대기)"을 보여줄 수
// 있게 한다. 점수가 지워져도(위원 교체·담당 해제) 같은 경로로 다시 계산된다.
const { onDocumentWritten } = require('firebase-functions/v2/firestore')
const { getFirestore } = require('firebase-admin/firestore')

async function recomputeSubmitted(db, schoolId, adoptionId) {
  const adoptionRef = db.doc(`schools/${schoolId}/textbookAdoptions/${adoptionId}`)
  const scores = await adoptionRef.collection('scores').get()
  const submittedUids = scores.docs.filter((d) => d.data().submittedAt).map((d) => d.id).sort()
  const snap = await adoptionRef.get()
  if (!snap.exists) return
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
