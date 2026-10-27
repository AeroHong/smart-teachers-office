/**
 * 학사일정 초안 저장·버전 — ExamCore saveExamDraft(ExamCore/src/exam/db/repo.js)와 같은 방식.
 *   초안 문서(events·holidays·revision·versionCount) + versions/{v}(요약) + versionData/{v}(전체)를 한 transaction으로.
 * 내가 연 뒤 다른 사람이 먼저 저장했으면(revision이 다르면) 최신본 위에 내 변경을 일정 단위로 합쳐(mergePlanData) 저장한다.
 * 규칙(firestore.rules academicPlans)은 revision이 정확히 1 오르지 않는 저장과 버전 단독 쓰기를 거부한다.
 */
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, runTransaction,
  serverTimestamp, setDoc, updateDoc, where, writeBatch,
} from 'firebase/firestore'
import { db } from '@shared/lib/firebase'
import { COL, schoolPath } from '@shared/lib/schema'
import { describeDiff, diffEvents, mergePlanData } from '@shared/lib/academicPlan'

/** Firestore는 undefined 필드를 거부한다 — JSON으로 한 번 걸러 쓴다 */
const plain = (x) => JSON.parse(JSON.stringify(x))
const plansCol = (schoolId) => collection(db, ...schoolPath(schoolId, COL.ACADEMIC_PLANS))
const planRef = (schoolId, planId) => doc(plansCol(schoolId), planId)
const yearRef = (schoolId, year) => doc(db, ...schoolPath(schoolId, COL.ACADEMIC_PLAN_YEARS), String(year))
const sub = (schoolId, planId, name) => collection(db, ...schoolPath(schoolId, COL.ACADEMIC_PLANS, planId, name))
const withId = (d) => ({ id: d.id, ...d.data() })

export function subscribeYear(schoolId, year, cb, onError) {
  return onSnapshot(yearRef(schoolId, year), (s) => cb(s.exists() ? s.data() : null), onError)
}

export function subscribePlans(schoolId, year, cb, onError) {
  return onSnapshot(query(plansCol(schoolId), where('year', '==', year)),
    (s) => cb(s.docs.map(withId).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'))), onError)
}

export function subscribePlan(schoolId, planId, cb, onError) {
  return onSnapshot(planRef(schoolId, planId), (s) => cb(s.exists() ? withId(s) : null), onError)
}

/** 학년도 설정 — 관리자만(규칙). 편집자 명단·확정 초안 */
export async function saveYear(schoolId, year, data) {
  await setDoc(yearRef(schoolId, year), { ...plain(data), updatedAt: serverTimestamp() }, { merge: true })
}

/**
 * 지난 학년도 — 학사일정(확정본, 없으면 가장 최근에 고친 초안)과 부서 색.
 * @returns {Promise<{ plan: object|null, deptColors: object }>}
 */
export async function loadPrevYear(schoolId, year) {
  const [plansSnap, yearSnap] = await Promise.all([
    getDocs(query(plansCol(schoolId), where('year', '==', year - 1))),
    getDoc(yearRef(schoolId, year - 1)),
  ])
  const list = plansSnap.docs.map(withId)
  const latest = [...list].sort((a, b) => (b.updatedAt?.toMillis?.() || 0) - (a.updatedAt?.toMillis?.() || 0))[0]
  return {
    plan: list.find((p) => p.status === 'confirmed') || latest || null,
    deptColors: (yearSnap.exists() && yearSnap.data().deptColors) || {},
  }
}

/** 부서 색 — 편집자도 이 필드만 고칠 수 있다(규칙) */
export async function saveDeptColors(schoolId, year, deptColors) {
  await updateDoc(yearRef(schoolId, year), { deptColors: plain(deptColors), updatedAt: serverTimestamp() })
}

/**
 * 새 초안. 일정을 들고 시작하면(복제) 첫 저장 전이라도 내용이 남도록 revision 0으로 바로 쓴다 — 버전 v1은 첫 저장 때.
 * @returns {Promise<string>} planId
 */
export async function createPlan({ schoolId, year, name, events = [], holidays = [], basedOn = null, by }) {
  const ref = doc(plansCol(schoolId))
  await setDoc(ref, {
    ...plain({
      year, name, status: 'draft', basedOn, events, holidays,
      revision: 0, versionCount: 0, latestVersionId: null,
      createdBy: by.uid, createdByName: by.name, updatedBy: by,
    }),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function renamePlan(schoolId, planId, name) {
  await updateDoc(planRef(schoolId, planId), { name, updatedAt: serverTimestamp() })
}

/**
 * @param {{ schoolId, planId, base, mine, baseRevision, action?, summary?, by: {uid, name}, extra? }} o
 *   base: 내가 연 저장본 {events, holidays}, mine: 지금 화면 상태, baseRevision: 연 때의 revision
 *   extra: ({ versionNo, server }) => 초안 문서에 같이 쓸 필드(단계·확정 판 — 관리자). 있으면 일정이 그대로여도 버전을 남긴다
 * @returns {Promise<{ saved, data, revision, conflicts: string[], merged: boolean, summary: string }>}
 */
export async function savePlan(o) {
  const ref = planRef(o.schoolId, o.planId)
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists()) throw new Error('학사일정 초안을 찾을 수 없습니다.')
    const server = snap.data()
    const revision = server.revision ?? 0
    const n = server.versionCount ?? 0
    const latest = { events: server.events || [], holidays: server.holidays || [] }

    // 다른 사람이 먼저 저장했으면 최신본 위에 합친다. 복구는 의도한 상태를 그대로 쓴다
    const merged = revision !== o.baseRevision && o.action !== 'restore'
    const m = merged ? mergePlanData(o.base, o.mine, latest) : { ...o.mine, conflicts: [] }
    const next = plain({ events: m.events || [], holidays: m.holidays || [] })
    const lines = describeDiff(diffEvents(latest.events, next.events))
    const holidaysChanged = JSON.stringify(latest.holidays) !== JSON.stringify(next.holidays)
    if (holidaysChanged) lines.push(`공휴일 목록 갱신 (${next.holidays.length}일)`)
    if (!lines.length && !o.extra) {
      return { saved: false, data: latest, revision, conflicts: m.conflicts, merged, summary: '변경 없음' }
    }
    const auto = !lines.length ? '' : lines.length === 1 ? lines[0] : `${lines[0]} 외 ${lines.length - 1}건`
    const summary = o.summary ? (auto ? `${o.summary} — ${auto}` : o.summary) : auto
    const extra = o.extra ? plain(o.extra({ versionNo: n + 1, server })) : {}

    const vRef = doc(sub(o.schoolId, o.planId, COL.EXAM_VERSIONS))
    tx.set(vRef, {
      versionNo: n + 1, action: o.action || 'save', summary, details: lines.slice(0, 300),
      by: o.by, at: serverTimestamp(),
    })
    tx.set(doc(sub(o.schoolId, o.planId, COL.EXAM_VERSION_DATA), vRef.id), next)
    tx.update(ref, {
      events: next.events,
      holidays: next.holidays,
      revision: revision + 1,
      versionCount: n + 1,
      latestVersionId: vRef.id,
      ...extra,
      updatedBy: o.by,
      updatedAt: serverTimestamp(),
    })
    return { saved: true, data: next, revision: revision + 1, conflicts: m.conflicts, merged, summary }
  })
}

export async function listVersions(schoolId, planId) {
  const snap = await getDocs(query(sub(schoolId, planId, COL.EXAM_VERSIONS), orderBy('versionNo', 'desc')))
  return snap.docs.map((d) => ({ id: d.id, ...d.data(), at: d.data().at?.toDate?.() }))
}

/**
 * 이 브라우저가 마지막으로 본 기록(seenNo) 뒤의 수정 기록과, 그때의 일정 스냅숏.
 * 자동 저장마다 기록이 생기므로 전체를 읽지 않고 seenNo 다음부터만(최대 300건) 읽는다.
 * @returns {Promise<{ versions: object[], baseEvents: object[]|null }>}
 */
export async function loadChangesSince(schoolId, planId, seenNo) {
  const vcol = sub(schoolId, planId, COL.EXAM_VERSIONS)
  const [after, baseSnap] = await Promise.all([
    getDocs(query(vcol, where('versionNo', '>', seenNo), orderBy('versionNo'), limit(300))),
    getDocs(query(vcol, where('versionNo', '==', seenNo), limit(1))),
  ])
  const versions = after.docs.map((d) => ({ id: d.id, ...d.data(), at: d.data().at?.toDate?.() }))
  let baseEvents = null
  if (!baseSnap.empty) {
    const data = await getDoc(doc(sub(schoolId, planId, COL.EXAM_VERSION_DATA), baseSnap.docs[0].id))
    if (data.exists()) baseEvents = data.data().events || []
  }
  return { versions, baseEvents }
}

export async function loadVersionData(schoolId, planId, versionId) {
  const snap = await getDoc(doc(sub(schoolId, planId, COL.EXAM_VERSION_DATA), versionId))
  if (!snap.exists()) throw new Error('버전 데이터를 찾을 수 없습니다.')
  return snap.data()
}

/**
 * 확정(관리자) — 이 초안을 확정본으로, 같은 학년도의 다른 확정본은 초안으로 되돌린다.
 */
export async function confirmPlan({ schoolId, plan, plans, by }) {
  const b = writeBatch(db)
  for (const p of plans) {
    if (p.id !== plan.id && p.status === 'confirmed') b.update(planRef(schoolId, p.id), { status: 'draft', confirmedAt: null, confirmedBy: null, stage: 'detail' })
  }
  b.update(planRef(schoolId, plan.id), { status: 'confirmed', confirmedAt: serverTimestamp(), confirmedBy: by })
  b.set(yearRef(schoolId, plan.year), { confirmedPlanId: plan.id, updatedAt: serverTimestamp() }, { merge: true })
  await b.commit()
}

/**
 * 같은 학년도에서 이 초안 하나로 진행(주요 일정 확정) — 학년도 설정에 기록, 나머지 초안은 목록에서 '보관'으로 보인다.
 */
export async function setActivePlan(schoolId, year, planId) {
  await setDoc(yearRef(schoolId, year), { activePlanId: planId, updatedAt: serverTimestamp() }, { merge: true })
}

/** 최종 확정 해제 — 세부 일정 단계로(확정 판 기록은 남긴다) */
export async function unconfirmPlan({ schoolId, plan }) {
  const b = writeBatch(db)
  b.update(planRef(schoolId, plan.id), { status: 'draft', confirmedAt: null, confirmedBy: null, stage: 'detail' })
  b.set(yearRef(schoolId, plan.year), { confirmedPlanId: null, updatedAt: serverTimestamp() }, { merge: true })
  await b.commit()
}

// ── 지금 보고 있는 사람 · 의견 ──────────────────────────────────────
// viewers/{uid}: 화면을 보고 있는 동안 2분마다 lastSeen을 갱신하고, 떠나면 지운다. 5분 넘게 갱신이 없으면 화면에서 뺀다.
// 이 학사일정 화면을 연 사람끼리만 구독하므로 읽기는 (보는 사람 수)² / 2분 정도 — 몇 명이 함께 볼 때만 생긴다.
export const PRESENCE_BEAT_MS = 2 * 60 * 1000
export const PRESENCE_STALE_MS = 5 * 60 * 1000

export async function beatPresence(schoolId, planId, me) {
  await setDoc(doc(sub(schoolId, planId, 'viewers'), me.uid), {
    uid: me.uid, name: me.name || '', photoURL: me.photoURL || null, lastSeen: Date.now(),
  })
}
export async function leavePresence(schoolId, planId, uid) {
  await deleteDoc(doc(sub(schoolId, planId, 'viewers'), uid))
}
export function subscribeViewers(schoolId, planId, cb) {
  return onSnapshot(sub(schoolId, planId, 'viewers'), (s) => cb(s.docs.map((d) => d.data())), () => cb([]))
}

export function subscribeComments(schoolId, planId, cb, onError) {
  return onSnapshot(query(sub(schoolId, planId, 'comments'), orderBy('createdAt'), limit(300)),
    (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate?.(), updatedAt: d.data().updatedAt?.toDate?.() }))), onError)
}
export async function addComment(schoolId, planId, text, by) {
  await addDoc(sub(schoolId, planId, 'comments'), { text, by: plain(by), createdAt: serverTimestamp() })
}
export async function updateComment(schoolId, planId, id, text) {
  await updateDoc(doc(sub(schoolId, planId, 'comments'), id), { text, updatedAt: serverTimestamp() })
}
export async function deleteComment(schoolId, planId, id) {
  await deleteDoc(doc(sub(schoolId, planId, 'comments'), id))
}

const BATCH_MAX = 450

/**
 * 초안 삭제 — 첫 batch에서 초안 문서와 기록을 함께 지운다(규칙: 기록은 초안이 없어진 뒤에만 지울 수 있다).
 * 기록이 아주 많으면 남은 것은 관리자만 이어서 지울 수 있다.
 */
export async function deletePlan(schoolId, planId) {
  const snaps = await Promise.all([COL.EXAM_VERSIONS, COL.EXAM_VERSION_DATA, 'comments', 'viewers'].map((n) => getDocs(sub(schoolId, planId, n))))
  const refs = snaps.flatMap((s) => s.docs.map((d) => d.ref))
  const first = writeBatch(db)
  first.delete(planRef(schoolId, planId))
  refs.slice(0, BATCH_MAX).forEach((r) => first.delete(r))
  await first.commit()
  for (let i = BATCH_MAX; i < refs.length; i += BATCH_MAX) {
    const b = writeBatch(db)
    refs.slice(i, i + BATCH_MAX).forEach((r) => b.delete(r))
    await b.commit()
  }
}
