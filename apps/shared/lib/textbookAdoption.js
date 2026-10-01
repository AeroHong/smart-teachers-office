import {
  collection, doc, getDoc, getDocs, addDoc, setDoc, deleteDoc, onSnapshot,
  query, where, serverTimestamp, arrayUnion,
} from 'firebase/firestore'
import { db } from './firebase'
import { COL, USERS, schoolPath, sanitizeSubjectGroup } from './schema'

// 검·인정도서 선정.
//
// 관리자가 선정 건마다 항목을 추가·삭제·배점·평가기준 문구를 수정할 수 있어 이 값은
// "초기값"일 뿐이다. name·criteria·maxScore 모두 사용자가 첨부한 학교 실사용 예시
// "[서식1] 검인정도서 선정 기준평가표(예시).xlsx"(통합과학1/2·과학탐구실험1/2 시트,
// 내용 동일)를 그대로 옮긴 것이다(2026-09-16). criteria는 xlsx 셀의 "· " bullet
// 줄바꿈을 그대로 유지해 여러 줄로 보여준다.
export const DEFAULT_RUBRIC = [
  { name: '교육과정의 부합성', maxScore: 15, criteria: '· 교육과정의 성격 및 목표에 부합하는가?' },
  { name: '내용 수준의 적정성/정확성', maxScore: 15, criteria: '· 수준에 맞는 내용과 활동을 다루는가?\n· 개념 및 이론이 정확하고 검증되었는가?' },
  { name: '내용의 중립성/학습 동기 유발', maxScore: 15, criteria: '· 개방적이고 균형적인 관점과 사고를 할 수 있도록 하는가?\n· 학습자의 흥미와 호기심을 유발하는가?' },
  { name: '학습 내용 조직의 효과성/계열성', maxScore: 15, criteria: '· 학습 요소가 유용하게 구성되었는가?\n· 학년 간, 학교급 간의 연계 및 계열성을 고려하는가?' },
  { name: '교수학습 활동 자료의 충실성/유용성', maxScore: 15, criteria: '· 교과서 부록 자료는 충분하고 유용한가?\n· 학습자 참여를 증진시키는 다양한 학습 활동을 제시하는가?' },
  { name: '적절한 학습 평가 안내 및 제공', maxScore: 15, criteria: '· 학습 단계에 맞는 평가 방법(진단, 형성, 총괄 등) 및 유형(선택, 서답, 수행평가)을 안내하는가?\n· 단순한 지식 측정이 아닌 다양한 사고력을 측정하는가?' },
  { name: '가독성, 디자인 및 가격의 적정성', maxScore: 10, criteria: '· 표현과 표기가 정확하고 가독성이 좋은가?\n· 동일 교과목 도서의 가격을 비교했는가?' },
]

// 서식1 하단 "<종합의견 및 추천의견>"에 참고할 예시 문구 — 2027학년도 선정 매뉴얼 21p
// 【참고】심의 의견 예시를 그대로 옮겼다. 위원이 채점 화면에서 클릭하면 의견란에 덧붙일
// 수 있게 하는 용도라, 학교 사정에 맞게 문구를 고치는 기능은 두지 않았다(매뉴얼 원문
// 그대로 참고만 하고, 실제 의견은 위원이 자유 텍스트로 작성).
export const OPINION_EXAMPLES = [
  '교육과정의 성격에 맞고 교과목표를 충실히 달성할 수 있도록 구성',
  '도표와 통계자료 등이 신빙성 있는 최신의 자료로 구성',
  '문제해결 중심의 교수-학습이 가능하도록 구성',
  '창의력과 응용력이 신장될 수 있도록 구성',
  '내용과 용어가 학생의 발달수준에 적합함',
  '자기주도적 학습이 가능하도록 내용이 조직됨',
  '단위기준에 맞는 적정 분량의 내용을 가짐',
  '기본개념과 핵심적인 내용이 적절히 선정됨',
  '교과목표에 충실하게 내용이 구성',
  '학습목표가 잘 조직되어 있음',
  '단원, 차례, 목차 등이 잘 정리됨',
  '문장이 간결·명료함',
  '교수, 학습 체계가 위계적으로 조직됨',
  '내용이 특정분야에 치우치지 않고 조화로움',
  '교과용도서를 활용하기에 편리함',
  '학생 수준별 학습에 적합',
  '사진, 삽화가 우수함',
  '인쇄, 편집체계가 교과목 특성에 잘 맞음',
  '문장이 간결하고 내용이 이해하기 쉬움',
  '가격 경쟁력이 우수함',
  '전체적으로 우수함',
]

// 서식3(추천의견서) 순위별 맺음 문장 예시 — 위 OPINION_EXAMPLES(도서의 장점)로 근거를 쓰고,
// 순위에 맞는 결론 문장으로 마무리하도록 돕는다. 1순위는 "가장 적합", 2·3순위는 "상위
// 순위 도서에 이어 차선"이라는 관계가 드러나게 썼다.
export const RECOMMENDATION_CLOSINGS = {
  1: [
    '평가 결과 총점이 가장 높아 1순위로 추천함',
    '교과 목표 달성과 학생 수준에 가장 적합한 도서로 판단되어 1순위로 추천함',
    '교육과정 반영도와 교수·학습 활용도가 가장 우수하여 1순위로 추천함',
    '평가위원 다수가 가장 우수하다고 평가하여 1순위로 추천함',
  ],
  2: [
    '1순위 도서에 비해 일부 항목이 다소 부족하나 전반적으로 우수하여 2순위로 추천함',
    '1순위 도서와 큰 차이 없이 우수하여 2순위로 추천함',
    '1순위 도서 채택이 어려울 경우 대체 도서로 적합하여 2순위로 추천함',
  ],
  3: [
    '상위 순위 도서에 비해 일부 항목이 다소 부족하나 교육과정 운영에 무리가 없어 3순위로 추천함',
    '상위 순위 도서 채택이 어려울 경우 대체 도서로 활용 가능하여 3순위로 추천함',
    '전반적으로 무난한 구성으로 3순위로 추천함',
  ],
}

export const STATUS_LABELS = { collecting: '채점중', closed: '마감' }

const adoptionsCol = (schoolId) => collection(db, ...schoolPath(schoolId, COL.TEXTBOOK_ADOPTIONS))
const adoptionDoc = (schoolId, adoptionId) => doc(db, ...schoolPath(schoolId, COL.TEXTBOOK_ADOPTIONS), adoptionId)
const scoresCol = (schoolId, adoptionId) => collection(adoptionDoc(schoolId, adoptionId), 'scores')
const scoreDoc = (schoolId, adoptionId, uid) => doc(adoptionDoc(schoolId, adoptionId), 'scores', uid)
const deptHeadsCol = (schoolId) => collection(db, ...schoolPath(schoolId, COL.TEXTBOOK_DEPT_HEADS))
const deptHeadDoc = (schoolId, subjectGroup) => doc(db, ...schoolPath(schoolId, COL.TEXTBOOK_DEPT_HEADS), sanitizeSubjectGroup(subjectGroup))

/**
 * 과목 대표교사는 반드시 그 과목의 위원이기도 하다(2026-10-01 정책 — 대표교사가 채점 없이
 * 진행만 관리하던 V1.1 방식을 폐기). 위원 명단을 저장하는 모든 경로가 이 함수를 거쳐
 * 대표교사를 빠뜨리지 않게 한다. firestore.rules도 같은 불변식을 강제한다.
 */
export function withHeadInCommittee(committeeUids, subjectHeadUid) {
  const uids = committeeUids || []
  return subjectHeadUid && !uids.includes(subjectHeadUid) ? [...uids, subjectHeadUid] : uids
}

export function rubricMax(rubric) {
  return (rubric || []).reduce((sum, r) => sum + (Number(r.maxScore) || 0), 0)
}

/**
 * 총점 하나를 배점 비율대로 항목별 점수로 나눈다(최대잔여법).
 *
 * 원본 엑셀 매크로(점수분배)는 반올림 오차를 무작위 항목에 배정해 같은 총점을 넣어도
 * 매번 다른 세부 배분이 나왔다. 여기서는 결정론적으로 배분해 같은 입력이면 항상 같은
 * 결과가 나오게 한다.
 */
export function distributeScore(total, rubric) {
  const maxSum = rubricMax(rubric)
  if (!maxSum || !rubric?.length) return {}
  const clamped = Math.max(0, Math.min(Math.round(Number(total) || 0), maxSum))
  const raw = rubric.map((r) => (clamped * (Number(r.maxScore) || 0)) / maxSum)
  const scores = raw.map(Math.floor)
  let remainder = clamped - scores.reduce((a, b) => a + b, 0)
  const fracOrder = raw
    .map((v, i) => ({ i, frac: v - scores[i] }))
    .sort((a, b) => b.frac - a.frac)
  let guard = 0
  while (remainder > 0 && guard < fracOrder.length * 3) {
    const target = fracOrder[guard % fracOrder.length].i
    if (scores[target] < rubric[target].maxScore) {
      scores[target] += 1
      remainder -= 1
    }
    guard += 1
  }
  return Object.fromEntries(rubric.map((r, i) => [r.name, scores[i]]))
}

/** byCriterion 값들의 합. */
export function sumCriteria(byCriterion) {
  return Object.values(byCriterion || {}).reduce((sum, v) => sum + (Number(v) || 0), 0)
}

/**
 * 제출 완료(submittedAt 있는) 위원 점수만 후보별로 합산해 총점·평균·순위를 계산한다.
 * 원본의 평가일람표 S(총점)/T(평균)/U(순위) 열에 대응.
 */
export function computeAggregate(scoreDocs, candidates) {
  const submitted = (scoreDocs || []).filter((s) => s.submittedAt)
  const totals = {}
  candidates.forEach((c) => { totals[c.id] = 0 })
  submitted.forEach((s) => {
    candidates.forEach((c) => {
      totals[c.id] += Number(s.byCandidate?.[c.id]?.total) || 0
    })
  })
  const count = submitted.length || 1
  const ranked = candidates
    .map((c) => ({ id: c.id, total: totals[c.id], average: totals[c.id] / count }))
    .sort((a, b) => b.total - a.total)
  const aggregate = {}
  ranked.forEach((r, i) => {
    aggregate[r.id] = { total: r.total, average: Number(r.average.toFixed(2)), rank: i + 1 }
  })
  return aggregate
}

export async function loadAdoptions(schoolId) {
  const snap = await getDocs(adoptionsCol(schoolId))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export function subscribeAdoption(schoolId, adoptionId, cb, onError) {
  return onSnapshot(
    adoptionDoc(schoolId, adoptionId),
    (snap) => cb(snap.exists() ? { id: snap.id, ...snap.data() } : null),
    onError,
  )
}

/** 로그인한 교사가 평가위원으로 지정된 선정 건 목록(실시간). */
export function subscribeMyAdoptions(schoolId, uid, cb, onError) {
  const q = query(adoptionsCol(schoolId), where('committeeUids', 'array-contains', uid))
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError)
}

/**
 * 로그인한 교사가 교과주임으로 지정된 선정 건 목록(실시간).
 *
 * 교과주임은 채점을 하지 않고 진행상황만 관리하는 사람일 수도 있어 committeeUids에 없을 수
 * 있다 — 그래서 committeeUids와는 별도 쿼리로 둔다(Firestore가 "배열 포함 OR 필드 일치"를
 * 한 쿼리로 못 하므로). 화면에서 subscribeMyAdoptions 결과와 합쳐서 쓴다.
 */
export function subscribeMySubjectHeadAdoptions(schoolId, uid, cb, onError) {
  const q = query(adoptionsCol(schoolId), where('subjectHeadUid', '==', uid))
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError)
}

export async function createAdoption(schoolId, data, uid) {
  const ref = await addDoc(adoptionsCol(schoolId), {
    subjectName: data.subjectName.trim(),
    subjectGroup: data.subjectGroup ? sanitizeSubjectGroup(data.subjectGroup) : '',
    cycleYear: data.cycleYear,
    candidates: data.candidates,
    rubric: data.rubric,
    committeeUids: withHeadInCommittee(data.committeeUids, data.subjectHeadUid),
    externalMembers: data.externalMembers || [],
    externalMemberIds: (data.externalMembers || []).map((m) => m.id),
    subjectHeadUid: data.subjectHeadUid || '',
    status: 'collecting',
    aggregate: null,
    summarySignoff: null,
    recommendation: null,
    createdBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateAdoptionSetup(schoolId, adoptionId, data) {
  await setDoc(adoptionDoc(schoolId, adoptionId), {
    subjectName: data.subjectName.trim(),
    subjectGroup: data.subjectGroup ? sanitizeSubjectGroup(data.subjectGroup) : '',
    cycleYear: data.cycleYear,
    candidates: data.candidates,
    rubric: data.rubric,
    committeeUids: withHeadInCommittee(data.committeeUids, data.subjectHeadUid),
    externalMembers: data.externalMembers || [],
    externalMemberIds: (data.externalMembers || []).map((m) => m.id),
    subjectHeadUid: data.subjectHeadUid || '',
    updatedAt: serverTimestamp(),
  }, { merge: true })
}

export async function deleteAdoption(schoolId, adoptionId) {
  await deleteDoc(adoptionDoc(schoolId, adoptionId))
}

/**
 * 위원 명단을 바꾼다("과목 대표교사가 직접 위원을 고른다" 기능, 2026-09-14 정책).
 * 채점 시작 전(아무도 제출 안 함)엔 자유롭게 바꾸고, 이미 제출한 위원을 빼는 경우엔 그
 * 사람 점수를 폐기하기로 했다 — computeAggregate가 committeeUids가 아니라 scores
 * 서브컬렉션 문서를 그대로 합산하므로, uid만 committeeUids에서 빼고 점수 문서를 남겨두면
 * 나중에 마감할 때 그 점수가 계속 집계에 들어가 버린다. 그래서 명단에서 빠지는 사람의
 * 점수 문서를 함께 지운다(제출 여부와 무관하게 — 초안만 있던 경우도 정리).
 */
export async function updateCommittee(schoolId, adoptionId, nextCommitteeUids, removedUids, subjectHeadUid) {
  const removed = (removedUids || []).filter((uid) => uid !== subjectHeadUid)
  await Promise.all(removed.map((uid) => deleteDoc(scoreDoc(schoolId, adoptionId, uid))))
  await setDoc(adoptionDoc(schoolId, adoptionId), {
    committeeUids: withHeadInCommittee(nextCommitteeUids, subjectHeadUid),
    updatedAt: serverTimestamp(),
  }, { merge: true })
}

/**
 * 평가영역·평가기준·배점(rubric)만 바꾼다("과목 대표교사가 직접 배점 기준을 고친다" 기능,
 * 2026-09-16). 위원 교체와 달리 이미 제출된 점수는 항목명 기준으로 저장돼 있어 rubric이
 * 바뀌면 깔끔하게 되살릴 방법이 없다 — 그래서 "폐기하고 진행" 예외 없이, 아무도 채점을
 * 제출하지 않았을 때만 과목 대표교사·교과부장이 고칠 수 있게 화면(TextbookDetail.jsx)에서
 * 막는다(관리자는 기존처럼 언제든 AdminTextbookSubjects에서 수정 가능 — 여기 규칙은
 * 그대로 둔다).
 */
export async function updateRubric(schoolId, adoptionId, rubric) {
  await setDoc(adoptionDoc(schoolId, adoptionId), { rubric, updatedAt: serverTimestamp() }, { merge: true })
}

/**
 * 아직 대표교사가 비어 있는 선정 건 목록(실시간) — "자원하기" 화면에서 쓴다.
 * 관리자가 43개 과목을 한 건씩 지정하는 부담을 줄이기 위해, 교사가 스스로 담당 과목을
 * 골라 맡을 수 있게 하는 self-claim 기능(2026-09-16)의 목록 조회부.
 */
export function subscribeUnassignedSubjectHeadAdoptions(schoolId, cb, onError) {
  const q = query(adoptionsCol(schoolId), where('subjectHeadUid', '==', ''))
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError)
}

/**
 * 대표교사가 비어 있는 선정 건을 아무 교사나 자원해서 맡는다(self-claim). firestore.rules가
 * subjectHeadUid==''인 문서에 한해 request.auth.uid로만 채워 넣도록 강제하므로, 동시에 두
 * 사람이 자원하면 늦게 시도한 쪽은 permission-denied로 실패한다(먼저 쓴 사람이 가져가는
 * 낙관적 동시성 — 보강 신청과 동일한 방식). 대표교사는 위원을 겸하므로 위원 명단에도
 * 함께 넣는다(rules가 "자기 uid 하나 추가"까지만 허용).
 */
export async function claimSubjectHead(schoolId, adoptionId, uid) {
  await setDoc(adoptionDoc(schoolId, adoptionId), {
    subjectHeadUid: uid, committeeUids: arrayUnion(uid), updatedAt: serverTimestamp(),
  }, { merge: true })
}

/**
 * 대표교사가 담당을 해제하면 그 과목을 처음 상태로 되돌린다(2026-10-01 정책): 대표교사와
 * 함께 위원 전원(내부·외부)도 해제하고, 위원들이 남긴 점수(임시저장·제출 모두)를 지운다 —
 * 위원 교체 시 빠지는 사람의 점수를 폐기하는 updateCommittee와 같은 원칙. 새 대표교사가
 * 맡으면 위원을 새로 꾸린다.
 *
 * 점수 삭제는 rules상 "그 건의 대표교사"만 할 수 있으므로 반드시 subjectHeadUid를 비우기
 * **전에** 한다. 마감된 건은 서식이 이미 나갔을 수 있어 해제하지 않는다(다시 채점 열기 먼저).
 */
export async function releaseSubjectHead(schoolId, adoptionId) {
  const snap = await getDoc(adoptionDoc(schoolId, adoptionId))
  if (snap.data()?.status === 'closed') throw new Error('마감된 과목은 해제할 수 없습니다. 상세 화면에서 "다시 채점 열기" 후 해제하세요.')
  const scores = await getDocs(scoresCol(schoolId, adoptionId))
  await Promise.all(scores.docs.map((d) => deleteDoc(d.ref)))
  await setDoc(adoptionDoc(schoolId, adoptionId), {
    subjectHeadUid: '',
    committeeUids: [],
    externalMembers: [],
    externalMemberIds: [],
    summarySignoff: null,
    updatedAt: serverTimestamp(),
  }, { merge: true })
}

/**
 * 여러 선정 건에 같은 교과군을 한 번에 지정한다("선정 건 관리" 화면의 일괄 작업용).
 * updateAdoptionSetup은 다른 필드까지 함께 다시 써야 해서, 교과군 하나만 바꿀 땐 그
 * 필드만 merge로 건드리는 이 함수가 더 안전하다(다른 필드를 실수로 덮어쓸 일이 없음).
 * 한 건이 실패해도 나머지는 계속 진행하고, 실패한 건의 id만 모아 반환한다.
 */
export async function bulkSetSubjectGroup(schoolId, adoptionIds, subjectGroup) {
  const sanitized = subjectGroup ? sanitizeSubjectGroup(subjectGroup) : ''
  const failed = []
  await Promise.all(adoptionIds.map(async (id) => {
    try {
      await setDoc(adoptionDoc(schoolId, id), { subjectGroup: sanitized, updatedAt: serverTimestamp() }, { merge: true })
    } catch (e) {
      failed.push({ id, error: e.message })
    }
  }))
  return { updated: adoptionIds.length - failed.length, failed }
}

/**
 * 여러 선정 건에 같은 배점기준(평가영역·평가기준·배점)을 한 번에 적용한다("선정 건 관리"
 * 화면의 일괄 작업용, 2026-09-16 — 과목이 많을 때 하나씩 열어서 고치는 부담을 줄인다).
 * 관리자 전용 화면에서만 노출되므로 updateRubric처럼 제출 여부를 확인하지 않고 그대로
 * 덮어쓴다(관리자는 원래 언제든 rubric을 바꿀 수 있다 — updateRubric 주석 참고).
 */
export async function bulkSetRubric(schoolId, adoptionIds, rubric) {
  const failed = []
  await Promise.all(adoptionIds.map(async (id) => {
    try {
      await setDoc(adoptionDoc(schoolId, id), { rubric, updatedAt: serverTimestamp() }, { merge: true })
    } catch (e) {
      failed.push({ id, error: e.message })
    }
  }))
  return { updated: adoptionIds.length - failed.length, failed }
}

export function subscribeMyScore(schoolId, adoptionId, uid, cb, onError) {
  return onSnapshot(
    scoreDoc(schoolId, adoptionId, uid),
    (snap) => cb(snap.exists() ? snap.data() : null),
    onError,
  )
}

export async function saveScore(schoolId, adoptionId, uid, teacherName, byCandidate, submit, opinion) {
  await setDoc(scoreDoc(schoolId, adoptionId, uid), {
    teacherUid: uid,
    teacherName: teacherName || '',
    byCandidate,
    opinion: opinion || '',
    submittedAt: submit ? serverTimestamp() : null,
    updatedAt: serverTimestamp(),
  }, { merge: true })
}

/**
 * 외부 위원(시스템 계정 없음)의 점수를 과목 대표교사·교과부장·관리자가 대리 입력한다.
 * 오프라인(수기·구두)으로 받은 점수를 옮겨 적는 용도 — external:true, enteredBy*로 누가
 * 대신 입력했는지 남긴다. 문서 구조는 saveScore와 동일해서 서식1/2 인쇄·집계는 그대로 쓴다.
 */
export async function saveExternalScore(schoolId, adoptionId, externalId, name, byCandidate, submit, opinion, proxyUid, proxyName) {
  await setDoc(scoreDoc(schoolId, adoptionId, externalId), {
    teacherUid: externalId,
    teacherName: name || '',
    external: true,
    enteredByUid: proxyUid,
    enteredByName: proxyName || '',
    byCandidate,
    opinion: opinion || '',
    submittedAt: submit ? serverTimestamp() : null,
    updatedAt: serverTimestamp(),
  }, { merge: true })
}

/** 관리자·교과주임만 호출 가능(rules) — 마감 집계용으로 전체 위원 점수를 읽는다. */
export async function loadAllScores(schoolId, adoptionId) {
  const snap = await getDocs(scoresCol(schoolId, adoptionId))
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }))
}

/** 관리자·교과주임 전용 실시간 제출 현황(rules가 그 외 계정은 자기 문서만 보이게 막는다). */
export function subscribeScores(schoolId, adoptionId, cb, onError) {
  return onSnapshot(scoresCol(schoolId, adoptionId), (snap) => cb(snap.docs.map((d) => ({ uid: d.id, ...d.data() }))), onError)
}

/**
 * 채점 마감 + 집계. 기존에 입력해둔 추천의견 텍스트는 후보 ID로 매칭해 보존한다
 * (재집계로 순위가 바뀌어도 이미 쓴 의견이 날아가지 않게).
 *
 * 추천의견서(서식3)의 "작성자"는 이제 이 문서에 저장하지 않는다 — 그 건 subjectGroup의
 * 교과부장을 항상 실시간으로 조회해서 보여준다(교과부장이 바뀌면 자동으로 새 이름이
 * 나오게). getDeptHead()/subscribeDeptHead() 참고.
 */
export async function closeAndAggregate(schoolId, adoptionId, candidates, existingRecommendation) {
  const scores = await loadAllScores(schoolId, adoptionId)
  const aggregate = computeAggregate(scores, candidates)
  const top3 = Object.entries(aggregate)
    .sort((a, b) => a[1].rank - b[1].rank)
    .slice(0, 3)
  const prevText = Object.fromEntries((existingRecommendation?.opinions || []).map((o) => [o.candidateId, o.text]))
  const opinions = top3.map(([id], i) => ({ rank: i + 1, candidateId: id, text: prevText[id] || '' }))
  await setDoc(adoptionDoc(schoolId, adoptionId), {
    status: 'closed',
    aggregate,
    recommendation: { opinions },
    updatedAt: serverTimestamp(),
  }, { merge: true })
}

/** 채점을 다시 연다. 추천의견 등 나머지 내용은 그대로 둔다(다시 마감하면 의견은 후보 ID로 보존). */
export async function reopenAdoption(schoolId, adoptionId) {
  await setDoc(adoptionDoc(schoolId, adoptionId), { status: 'collecting', updatedAt: serverTimestamp() }, { merge: true })
}

export async function saveRecommendation(schoolId, adoptionId, recommendation) {
  await setDoc(adoptionDoc(schoolId, adoptionId), { recommendation, updatedAt: serverTimestamp() }, { merge: true })
}

/** 서식2(평가 총괄표) 작성자 — 그 건 위원 중 1명. 확인자(교과부장)는 저장하지 않고 실시간 조회. */
export async function saveSummarySignoff(schoolId, adoptionId, { preparedByUid, preparedByName }) {
  await setDoc(adoptionDoc(schoolId, adoptionId), {
    summarySignoff: { preparedByUid, preparedByName: preparedByName || '' },
    updatedAt: serverTimestamp(),
  }, { merge: true })
}

export async function getAdoptionOnce(schoolId, adoptionId) {
  const snap = await getDoc(adoptionDoc(schoolId, adoptionId))
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}

/**
 * 선정 건 배열에 제출 현황(submittedCount)을 붙인다. rules상 scores를 못 읽는 건(다른
 * 교과부장 소관 등)은 조용히 null로 둔다 — 화면에서 걸러내고 보여줄 목록만 넘기면 된다.
 */
export async function attachProgress(schoolId, adoptions) {
  return Promise.all(adoptions.map(async (a) => {
    try {
      const scores = await loadAllScores(schoolId, a.id)
      return { ...a, submittedCount: scores.filter((s) => s.submittedAt).length }
    } catch {
      return { ...a, submittedCount: null }
    }
  }))
}

/** 관리자 목록·전체 현황 화면이 공통으로 쓰는 "선정 건 + 제출 현황" 조회(전체). */
export async function loadAdoptionsWithProgress(schoolId) {
  const adoptions = await loadAdoptions(schoolId)
  return attachProgress(schoolId, adoptions)
}

/** 후보 교과서 행 id 생성 — 관리자 화면(단건/일괄 등록)이 공유한다. */
export function newCandidateId() {
  return (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`)
}

/**
 * 외부 위원 id 생성 — 'ext_' 접두사로 실제 Firebase uid와 겹치지 않게 한다(rules의
 * externalMemberIds 멤버십 체크, scores 문서ID로 그대로 쓰임).
 */
export function newExternalMemberId() {
  return `ext_${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`}`
}

/**
 * 여러 과목을 한 번에 등록한다(엑셀/붙여넣기 일괄 등록용).
 *
 * 위원단·교과주임은 과목마다 다른 게 보통이라 행마다 따로 받는다(committeeUids/
 * subjectHeadUid) — 배치 전체에 공통으로 강제하지 않는다. 배점기준·선정연도만 배치
 * 전체가 공통으로 쓴다. 한 건이 실패해도 나머지는 계속 진행하고, 실패한 과목명만
 * 모아 반환한다.
 *
 * @param {string} schoolId
 * @param {Array<{subjectName: string, candidates: Array, committeeUids?: string[], subjectHeadUid?: string}>} rows
 * @param {{cycleYear: number, rubric?: Array}} common
 * @param {string} uid
 * @returns {Promise<{created: number, failed: Array<{subjectName: string, error: string}>}>}
 */
export async function bulkCreateAdoptions(schoolId, rows, common, uid) {
  const failed = []
  let created = 0
  for (const row of rows) {
    try {
      await createAdoption(schoolId, {
        subjectName: row.subjectName,
        cycleYear: common.cycleYear,
        candidates: row.candidates,
        rubric: common.rubric || DEFAULT_RUBRIC,
        committeeUids: row.committeeUids || [],
        subjectHeadUid: row.subjectHeadUid || '',
      }, uid)
      created += 1
    } catch (e) {
      failed.push({ subjectName: row.subjectName, error: e.message })
    }
  }
  return { created, failed }
}

// ── 교과부장(교과 대표교사) — 교과군당 1명, 학교 전체 registry ──────────────────
//
// 과목 대표교사(subjectHeadUid, 선정 건마다 지정)와는 다른 역할이다. 교과부장은 교과군
// 전체(예: 사회과)를 관장하며 서식2 확인자·서식3 작성자가 된다. 문서 ID를 sanitize된
// 교과군명으로 써서 "그 교과군의 교과부장이 누구인지"를 규칙에서 get() 한 번으로 판정할 수
// 있게 한다(isTextbookDeptHead, firestore.rules).

export function subscribeDeptHeads(schoolId, cb, onError) {
  return onSnapshot(deptHeadsCol(schoolId), (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError)
}

export async function saveDeptHead(schoolId, subjectGroup, staff, addedByUid, addedByName) {
  await setDoc(deptHeadDoc(schoolId, subjectGroup), {
    subjectGroup: sanitizeSubjectGroup(subjectGroup),
    uid: staff.uid,
    name: staff.name || '',
    email: staff.email || '',
    addedBy: addedByUid,
    addedByName: addedByName || '',
    addedAt: serverTimestamp(),
  })
}

export async function removeDeptHead(schoolId, subjectGroup) {
  await deleteDoc(deptHeadDoc(schoolId, subjectGroup))
}

export async function getDeptHead(schoolId, subjectGroup) {
  if (!subjectGroup) return null
  const snap = await getDoc(deptHeadDoc(schoolId, subjectGroup))
  return snap.exists() ? snap.data() : null
}

/** 선정 건 상세화면에서 교과부장 이름을 실시간으로 보여줄 때 쓴다(교과부장이 바뀌면 즉시 반영). */
export function subscribeDeptHead(schoolId, subjectGroup, cb, onError) {
  if (!subjectGroup) { cb(null); return () => {} }
  return onSnapshot(deptHeadDoc(schoolId, subjectGroup), (snap) => cb(snap.exists() ? snap.data() : null), onError)
}

/** 로그인한 교사가 교과부장으로 지정된 교과군 목록(보통 0~1개, 이론상 여러 개도 가능). */
export function subscribeMyDeptHeadGroups(schoolId, uid, cb, onError) {
  const q = query(deptHeadsCol(schoolId), where('uid', '==', uid))
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => d.data().subjectGroup)), onError)
}

// ── 교감(서식3 확인자) ──────────────────────────────────────────────────────
// 교감 확인·서명 기능은 폐기했다(2026-10-01 — 서명은 모두 출력물에 직접 받는다). 서식3에는
// 시스템에 교감(role 'principal')으로 등록된 사람의 이름만 표시한다.

export async function loadPrincipalName(schoolId) {
  const snap = await getDocs(query(collection(db, USERS), where('schoolId', '==', schoolId), where('role', '==', 'principal')))
  return snap.docs.map((d) => d.data().name || d.data().email).filter(Boolean).join(', ')
}
