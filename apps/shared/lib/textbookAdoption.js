import {
  collection, doc, getDoc, getDocs, addDoc, setDoc, deleteDoc, onSnapshot,
  query, where, serverTimestamp,
} from 'firebase/firestore'
import { db } from './firebase'
import { COL, schoolPath, sanitizeSubjectGroup } from './schema'

// 검·인정도서 선정.
//
// 참고했던 타교 배포 엑셀(검·인정도서 선정기준 평가.xlsm)의 배점 기준을 그대로 기본값으로 쓴다.
// 관리자가 선정 건마다 항목을 추가·삭제·배점 수정할 수 있어 이 값은 "초기값"일 뿐이다.
export const DEFAULT_RUBRIC = [
  { name: '교육과정', maxScore: 10 },
  { name: '학습내용 선정', maxScore: 20 },
  { name: '학습내용 조직', maxScore: 20 },
  { name: '교수·학습활동', maxScore: 20 },
  { name: '학습평가', maxScore: 10 },
  { name: '표현·표기 및 외형체제', maxScore: 10 },
  { name: '재정적 부분', maxScore: 10 },
]

export const STATUS_LABELS = { collecting: '채점중', closed: '마감' }

const adoptionsCol = (schoolId) => collection(db, ...schoolPath(schoolId, COL.TEXTBOOK_ADOPTIONS))
const adoptionDoc = (schoolId, adoptionId) => doc(db, ...schoolPath(schoolId, COL.TEXTBOOK_ADOPTIONS), adoptionId)
const scoresCol = (schoolId, adoptionId) => collection(adoptionDoc(schoolId, adoptionId), 'scores')
const scoreDoc = (schoolId, adoptionId, uid) => doc(adoptionDoc(schoolId, adoptionId), 'scores', uid)
const deptHeadsCol = (schoolId) => collection(db, ...schoolPath(schoolId, COL.TEXTBOOK_DEPT_HEADS))
const deptHeadDoc = (schoolId, subjectGroup) => doc(db, ...schoolPath(schoolId, COL.TEXTBOOK_DEPT_HEADS), sanitizeSubjectGroup(subjectGroup))
const principalSigDoc = (schoolId, uid) => doc(db, ...schoolPath(schoolId, COL.TEXTBOOK_PRINCIPAL_SIGNATURE), uid)

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
    committeeUids: data.committeeUids || [],
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
    committeeUids: data.committeeUids || [],
    externalMembers: data.externalMembers || [],
    externalMemberIds: (data.externalMembers || []).map((m) => m.id),
    subjectHeadUid: data.subjectHeadUid || '',
    updatedAt: serverTimestamp(),
  }, { merge: true })
}

export async function deleteAdoption(schoolId, adoptionId) {
  await deleteDoc(adoptionDoc(schoolId, adoptionId))
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
 * (재집계로 순위가 바뀌어도 이미 쓴 의견이 날아가지 않게). 교감 확인 정보도 보존한다 —
 * 재집계 한 번으로 이미 받은 확인이 날아가면 안 되므로.
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
    recommendation: {
      opinions,
      confirmedByUid: existingRecommendation?.confirmedByUid || null,
      confirmedByName: existingRecommendation?.confirmedByName || null,
      confirmedAt: existingRecommendation?.confirmedAt || null,
      confirmedSignature: existingRecommendation?.confirmedSignature || null,
    },
    updatedAt: serverTimestamp(),
  }, { merge: true })
}

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

/** 서식3(추천의견서) 확인 — 교감이 실제 계정으로 로그인해 그림 서명과 함께 확인한다. */
export async function confirmRecommendation(schoolId, adoptionId, existingRecommendation, { uid, name, dataUrl }) {
  await setDoc(adoptionDoc(schoolId, adoptionId), {
    recommendation: {
      ...existingRecommendation,
      confirmedByUid: uid,
      confirmedByName: name,
      confirmedAt: serverTimestamp(),
      confirmedSignature: { dataUrl },
    },
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

// ── 교감 서명 저장소 (서식3 확인용) ────────────────────────────────────────────
// apps/portal/src/pages/tools/AsaChecklistPrincipal.jsx의 asaPrincipalSignature와 같은
// 모양이지만, 모듈마다 서명 저장소를 따로 두는 기존 관례를 따라 별도 컬렉션을 쓴다.

export async function getPrincipalSignature(schoolId, uid) {
  const snap = await getDoc(principalSigDoc(schoolId, uid))
  return snap.exists() ? snap.data() : null
}

export async function savePrincipalSignature(schoolId, uid, dataUrl, name) {
  await setDoc(principalSigDoc(schoolId, uid), { dataUrl, name, savedAt: serverTimestamp() })
}
