import {
  collection, doc, getDoc, getDocs, addDoc, setDoc, deleteDoc, onSnapshot,
  query, where, serverTimestamp,
} from 'firebase/firestore'
import { db } from './firebase'
import { COL, schoolPath } from './schema'

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
    cycleYear: data.cycleYear,
    candidates: data.candidates,
    rubric: data.rubric,
    committeeUids: data.committeeUids || [],
    subjectHeadUid: data.subjectHeadUid || '',
    status: 'collecting',
    aggregate: null,
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
    cycleYear: data.cycleYear,
    candidates: data.candidates,
    rubric: data.rubric,
    committeeUids: data.committeeUids || [],
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

export async function saveScore(schoolId, adoptionId, uid, teacherName, byCandidate, submit) {
  await setDoc(scoreDoc(schoolId, adoptionId, uid), {
    teacherUid: uid,
    teacherName: teacherName || '',
    byCandidate,
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
      preparedByUid: existingRecommendation?.preparedByUid || null,
      preparedByName: existingRecommendation?.preparedByName || null,
      confirmedByUid: existingRecommendation?.confirmedByUid || null,
      confirmedByName: existingRecommendation?.confirmedByName || null,
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

export async function getAdoptionOnce(schoolId, adoptionId) {
  const snap = await getDoc(adoptionDoc(schoolId, adoptionId))
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}

/** 관리자 목록·전체 현황 화면이 공통으로 쓰는 "선정 건 + 제출 현황" 조회. */
export async function loadAdoptionsWithProgress(schoolId) {
  const adoptions = await loadAdoptions(schoolId)
  return Promise.all(adoptions.map(async (a) => {
    try {
      const scores = await loadAllScores(schoolId, a.id)
      return { ...a, submittedCount: scores.filter((s) => s.submittedAt).length }
    } catch {
      return { ...a, submittedCount: null }
    }
  }))
}

/** 후보 교과서 행 id 생성 — 관리자 화면(단건/일괄 등록)이 공유한다. */
export function newCandidateId() {
  return (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`)
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
