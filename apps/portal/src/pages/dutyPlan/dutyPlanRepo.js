/**
 * 업무분장 만들기 Firestore 접근 — academicPlan/planRepo.js와 같은 저장 방식.
 *   편성안 문서(저장 묶음·revision·versionCount) + versions/{v}(요약) + versionData/{v}(전체)를 한 transaction으로.
 *   내가 연 뒤 다른 사람이 먼저 저장했으면(revision이 다르면) 최신본 위에 내 변경을 항목 단위로 합쳐(mergeDutyPlan) 저장한다.
 *
 * 경로: dutyPlanYears/{year}(학년도 설정) / dutyPlanYears/{year}/plans/{planId}(편성안) / .../wishes/{uid}(희망원)
 *       dutyCatalog/{dutyKey}(해를 넘어 이어지는 업무) / .../notes/{id}(인수인계 노트)
 * 규칙(firestore.rules dutyPlanYears)은 1차 초안을 편집자에게만 보여준다 — 편집자가 아닌 사람은
 * 목록을 shared == true로 좁혀 조회해야 한다(subscribePlans의 onlyShared).
 */
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, runTransaction,
  serverTimestamp, setDoc, Timestamp, updateDoc, where, writeBatch,
} from 'firebase/firestore'
import { db } from '@shared/lib/firebase'
import { COL, schoolPath } from '@shared/lib/schema'
import { describeDataDiff, isSharedStage, mergeDutyPlan, planData } from '@shared/lib/dutyPlan'

/** Firestore는 undefined 필드를 거부한다 — JSON으로 한 번 걸러 쓴다 */
const plain = (x) => JSON.parse(JSON.stringify(x))
const yearRef = (schoolId, year) => doc(db, ...schoolPath(schoolId, COL.DUTY_PLAN_YEARS), String(year))
const plansCol = (schoolId, year) => collection(db, ...schoolPath(schoolId, COL.DUTY_PLAN_YEARS, String(year), COL.DUTY_PLANS))
const planRef = (schoolId, year, planId) => doc(plansCol(schoolId, year), planId)
const sub = (schoolId, year, planId, name) => collection(db, ...schoolPath(schoolId, COL.DUTY_PLAN_YEARS, String(year), COL.DUTY_PLANS, planId, name))
const withId = (d) => ({ id: d.id, ...d.data() })
const toMs = (t) => t?.toMillis?.() || 0

// ── 학년도 설정 ──────────────────────────────────────────────────────

export function subscribeYear(schoolId, year, cb, onError) {
  return onSnapshot(yearRef(schoolId, year), (s) => cb(s.exists() ? s.data() : null), onError)
}

export async function loadYear(schoolId, year) {
  const s = await getDoc(yearRef(schoolId, year))
  return s.exists() ? s.data() : null
}

/** 관리자(편집자 명단·확정 포인터) — 편집자는 wish·classCounts·specialClasses만(규칙) */
export async function saveYear(schoolId, year, data) {
  await setDoc(yearRef(schoolId, year), { ...plain(data), updatedAt: serverTimestamp() }, { merge: true })
}

// ── 편성안 ───────────────────────────────────────────────────────────

/**
 * 한 학년도의 편성안 목록. onlyShared면 공람·확정본만(편집자가 아닌 교직원 — 규칙이 이 조건을 요구한다)
 */
export function subscribePlans(schoolId, year, { onlyShared = false } = {}, cb, onError) {
  const q = onlyShared ? query(plansCol(schoolId, year), where('shared', '==', true)) : plansCol(schoolId, year)
  return onSnapshot(q, (s) => cb(s.docs.map(withId).sort((a, b) => toMs(a.createdAt) - toMs(b.createdAt))), onError)
}

export function subscribePlan(schoolId, year, planId, cb, onError) {
  return onSnapshot(planRef(schoolId, year, planId), (s) => cb(s.exists() ? withId(s) : null), onError)
}

/** 한 학년도의 확정본(3차 확정 — 업무분장안이든 배치안이든 최신 것 하나). 없으면 null */
export async function loadConfirmedPlan(schoolId, year) {
  const ys = await getDoc(yearRef(schoolId, year))
  const id = ys.exists() ? ys.data().confirmedPlanId : null
  if (!id) return null
  const s = await getDoc(planRef(schoolId, year, id))
  return s.exists() ? withId(s) : null
}

/**
 * 새 편성안. 내용을 들고 시작하면(복제·가져오기) 첫 저장 전이라도 남도록 revision 0으로 바로 쓴다.
 * stage를 넘기면(관리자 — 지난 확정본 들여오기) 그 단계로 만든다.
 * @returns {Promise<string>} planId
 */
export async function createPlan({ schoolId, year, name, kind = 'cards', data, basedOn = null, stage = 'draft', by, extra = {} }) {
  const ref = doc(plansCol(schoolId, year))
  await setDoc(ref, {
    ...plain({
      year: Number(year), name, kind, basedOn, stage, shared: isSharedStage(stage), confirmations: [],
      ...planData(data),
      revision: 0, versionCount: 0, latestVersionId: null,
      createdBy: by.uid, createdByName: by.name, updatedBy: by,
      ...extra,
    }),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function renamePlan(schoolId, year, planId, name) {
  await updateDoc(planRef(schoolId, year, planId), { name, updatedAt: serverTimestamp() })
}

/**
 * @param {{ schoolId, year, planId, base, mine, baseRevision, action?, summary?, by: {uid, name}, extra? }} o
 *   base: 내가 연 저장본, mine: 지금 화면 상태, baseRevision: 연 때의 revision
 *   extra: ({ versionNo, server }) => 편성안 문서에 같이 쓸 필드(단계·확정 판 — 관리자). 있으면 내용이 그대로여도 버전을 남긴다
 * @returns {Promise<{ saved, data, revision, conflicts: string[], merged: boolean, summary: string }>}
 */
export async function savePlan(o) {
  const ref = planRef(o.schoolId, o.year, o.planId)
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists()) throw new Error('편성안을 찾을 수 없습니다.')
    const server = snap.data()
    const revision = server.revision ?? 0
    const n = server.versionCount ?? 0
    const latest = planData(server)

    // 다른 사람이 먼저 저장했으면 최신본 위에 합친다. 복구는 의도한 상태를 그대로 쓴다
    const merged = revision !== o.baseRevision && o.action !== 'restore'
    const m = merged ? mergeDutyPlan(o.base, o.mine, latest) : { ...o.mine, conflicts: [] }
    const next = plain(planData(m))
    const lines = describeDataDiff(latest, next)
    if (!lines.length && !o.extra) {
      return { saved: false, data: latest, revision, conflicts: m.conflicts, merged, summary: '변경 없음' }
    }
    const auto = !lines.length ? '' : lines.length === 1 ? lines[0] : `${lines[0]} 외 ${lines.length - 1}건`
    const summary = o.summary ? (auto ? `${o.summary} — ${auto}` : o.summary) : auto
    const extra = o.extra ? plain(o.extra({ versionNo: n + 1, server })) : {}

    const vRef = doc(sub(o.schoolId, o.year, o.planId, COL.EXAM_VERSIONS))
    tx.set(vRef, {
      versionNo: n + 1, action: o.action || 'save', summary, details: lines.slice(0, 300),
      by: o.by, at: serverTimestamp(),
    })
    tx.set(doc(sub(o.schoolId, o.year, o.planId, COL.EXAM_VERSION_DATA), vRef.id), next)
    tx.update(ref, {
      ...next,
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

export async function listVersions(schoolId, year, planId) {
  const snap = await getDocs(query(sub(schoolId, year, planId, COL.EXAM_VERSIONS), orderBy('versionNo', 'desc')))
  return snap.docs.map((d) => ({ id: d.id, ...d.data(), at: d.data().at?.toDate?.() }))
}

export async function loadVersionData(schoolId, year, planId, versionId) {
  const snap = await getDoc(doc(sub(schoolId, year, planId, COL.EXAM_VERSION_DATA), versionId))
  if (!snap.exists()) throw new Error('버전 데이터를 찾을 수 없습니다.')
  return snap.data()
}

/**
 * 단계 바꾸기(관리자) — 1차 초안 ↔ 2차 공람 ↔ 3차 확정. 확정하면 학년도 설정에 확정본 포인터를 남긴다
 * (업무분장안은 cardsPlanId — 희망원 기준, 배치안은 confirmedPlanId — 그 학년도 업무분장).
 * shared는 단계에서 정해진다(규칙이 둘이 맞는지 본다).
 */
export async function setPlanStage({ schoolId, plan, stage, note = '', by }) {
  const b = writeBatch(db)
  const confirmations = [...(plan.confirmations || []), plain({ stage, versionNo: plan.versionCount || 0, at: Date.now(), by, note })]
  b.update(planRef(schoolId, plan.year, plan.id), {
    stage, shared: isSharedStage(stage), confirmations,
    ...(stage === 'confirmed' ? { confirmedAt: serverTimestamp(), confirmedBy: by } : { confirmedAt: null, confirmedBy: null }),
    updatedAt: serverTimestamp(),
  })
  const pointer = plan.kind === 'assign' ? 'confirmedPlanId' : 'cardsPlanId'
  if (stage === 'confirmed') b.set(yearRef(schoolId, plan.year), { [pointer]: plan.id, updatedAt: serverTimestamp() }, { merge: true })
  await b.commit()
}

// ── 지금 보고 있는 사람 · 의견 (academicPlan과 같은 방식) ──────────────
export const PRESENCE_BEAT_MS = 2 * 60 * 1000
export const PRESENCE_STALE_MS = 5 * 60 * 1000

export async function beatPresence(schoolId, year, planId, me) {
  await setDoc(doc(sub(schoolId, year, planId, 'viewers'), me.uid), {
    uid: me.uid, name: me.name || '', photoURL: me.photoURL || null, lastSeen: Date.now(),
  })
}
export async function leavePresence(schoolId, year, planId, uid) {
  await deleteDoc(doc(sub(schoolId, year, planId, 'viewers'), uid))
}
export function subscribeViewers(schoolId, year, planId, cb) {
  return onSnapshot(sub(schoolId, year, planId, 'viewers'), (s) => cb(s.docs.map((d) => d.data())), () => cb([]))
}

export function subscribeComments(schoolId, year, planId, cb, onError) {
  return onSnapshot(query(sub(schoolId, year, planId, 'comments'), orderBy('createdAt'), limit(300)),
    (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate?.(), updatedAt: d.data().updatedAt?.toDate?.() }))), onError)
}
export async function addComment(schoolId, year, planId, text, by) {
  await addDoc(sub(schoolId, year, planId, 'comments'), { text, by: plain(by), createdAt: serverTimestamp() })
}
export async function updateComment(schoolId, year, planId, id, text) {
  await updateDoc(doc(sub(schoolId, year, planId, 'comments'), id), { text, updatedAt: serverTimestamp() })
}
export async function deleteComment(schoolId, year, planId, id) {
  await deleteDoc(doc(sub(schoolId, year, planId, 'comments'), id))
}

/**
 * 학사일정의 접속 표시·의견·수정 기록 화면(PresenceAvatars·CommentsPanel·VersionDrawer)이 부르는 모양
 * (schoolId, planId, …)으로 맞춘 함수 묶음 — 업무분장은 경로에 학년도가 더 들어간다.
 */
export function collabRepo(year) {
  return {
    PRESENCE_BEAT_MS, PRESENCE_STALE_MS,
    beatPresence: (s, p, me) => beatPresence(s, year, p, me),
    leavePresence: (s, p, uid) => leavePresence(s, year, p, uid),
    subscribeViewers: (s, p, cb) => subscribeViewers(s, year, p, cb),
    subscribeComments: (s, p, cb, onError) => subscribeComments(s, year, p, cb, onError),
    addComment: (s, p, text, by) => addComment(s, year, p, text, by),
    updateComment: (s, p, id, text) => updateComment(s, year, p, id, text),
    deleteComment: (s, p, id) => deleteComment(s, year, p, id),
    listVersions: (s, p) => listVersions(s, year, p),
  }
}

const BATCH_MAX = 450

/**
 * 편성안 삭제 — 첫 batch에서 편성안 문서와 기록을 함께 지운다(규칙: 기록은 편성안이 없어진 뒤에만 지울 수 있다).
 */
export async function deletePlan(schoolId, year, planId) {
  const snaps = await Promise.all([COL.EXAM_VERSIONS, COL.EXAM_VERSION_DATA, 'comments', 'viewers'].map((n) => getDocs(sub(schoolId, year, planId, n))))
  const refs = snaps.flatMap((s) => s.docs.map((d) => d.ref))
  const first = writeBatch(db)
  first.delete(planRef(schoolId, year, planId))
  refs.slice(0, BATCH_MAX).forEach((r) => first.delete(r))
  await first.commit()
  for (let i = BATCH_MAX; i < refs.length; i += BATCH_MAX) {
    const b = writeBatch(db)
    refs.slice(i, i + BATCH_MAX).forEach((r) => b.delete(r))
    await b.commit()
  }
}

// ── 업무분장 희망원 (dutyPlanYears/{year}/wishes/{uid}) ─────────────────

const wishesCol = (schoolId, year) => collection(db, ...schoolPath(schoolId, COL.DUTY_PLAN_YEARS, String(year), COL.DUTY_WISHES))

/** 편집자 — 그 학년도 희망원 전부 */
export function subscribeWishes(schoolId, year, cb, onError) {
  return onSnapshot(wishesCol(schoolId, year), (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data(), submittedAt: d.data().submittedAt?.toDate?.() }))), onError)
}
/** 본인 희망원 */
export function subscribeMyWish(schoolId, year, uid, cb, onError) {
  return onSnapshot(doc(wishesCol(schoolId, year), uid), (s) => cb(s.exists() ? s.data() : null), onError)
}
/**
 * 희망원 기간 — 편집자도 쓴다(규칙: wish 필드만). 마감은 Timestamp로 남아야 규칙이 request.time과 비교하므로
 * saveYear(JSON 거름)를 거치지 않는다.
 * @param {{ open: boolean, deadline: Date|null, sourcePlanId: string|null }} w
 */
export async function setWishWindow(schoolId, year, w) {
  await setDoc(yearRef(schoolId, year), {
    wish: { open: Boolean(w.open), deadline: w.deadline ? Timestamp.fromDate(w.deadline) : null, sourcePlanId: w.sourcePlanId || null },
    updatedAt: serverTimestamp(),
  }, { merge: true })
}

export async function saveWish(schoolId, year, uid, wish) {
  await setDoc(doc(wishesCol(schoolId, year), uid), { ...plain(wish), uid, year: Number(year), submittedAt: serverTimestamp() })
}

// ── 해를 넘어 이어지는 업무(dutyCatalog) ───────────────────────────────

const catalogRef = (schoolId, dutyKey) => doc(db, ...schoolPath(schoolId, COL.DUTY_CATALOG), dutyKey)
const notesCol = (schoolId, dutyKey) => collection(db, ...schoolPath(schoolId, COL.DUTY_CATALOG, dutyKey, COL.DUTY_NOTES))

export function subscribeCatalog(schoolId, dutyKey, cb, onError) {
  return onSnapshot(catalogRef(schoolId, dutyKey), (s) => cb(s.exists() ? s.data() : null), onError)
}

/** 업무 안내 고치기 — 전·현 담당자·관리자(규칙) */
export async function saveGuide(schoolId, dutyKey, guide, by) {
  await updateDoc(catalogRef(schoolId, dutyKey), { guide: plain(guide), updatedBy: plain(by), updatedAt: serverTimestamp() })
}

export function subscribeNotes(schoolId, dutyKey, cb, onError) {
  return onSnapshot(query(notesCol(schoolId, dutyKey), orderBy('createdAt', 'desc'), limit(200)),
    (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate?.(), updatedAt: d.data().updatedAt?.toDate?.() }))), onError)
}
export async function addNote(schoolId, dutyKey, { year, kind, text }, by) {
  await addDoc(notesCol(schoolId, dutyKey), { year: Number(year), kind, text, by: plain(by), createdAt: serverTimestamp() })
}
export async function updateNote(schoolId, dutyKey, id, { text, kind }) {
  await updateDoc(doc(notesCol(schoolId, dutyKey), id), { text, kind, updatedAt: serverTimestamp() })
}
export async function deleteNote(schoolId, dutyKey, id) {
  await deleteDoc(doc(notesCol(schoolId, dutyKey), id))
}

/**
 * 확정한 편성안의 담당자를 업무 기록(dutyCatalog)에 남긴다(관리자). 업무 내용 카드마다 문서 하나(카드 key) —
 * 처음 보는 카드면 만들고, 있으면 최근 내용·업무·부서와 그 해 담당자(holders·holderUids)를 더한다.
 * 같은 해를 다시 반영하면 그 해 담당자를 바꿔 쓴다(확정을 고친 경우). 여러 번 눌러도 결과가 같다.
 */
export async function recordHolders(schoolId, plan, nameOf = () => '') {
  const data = planData(plan)
  const deptName = new Map(data.departments.map((d) => [d.id, d.name]))
  const cards = data.duties.filter((d) => d.deptId && deptName.has(d.deptId))
    .flatMap((d) => d.tasks.map((t) => ({ t, d })))
  const snaps = await Promise.all(cards.map(({ t }) => getDoc(catalogRef(schoolId, t.key))))
  const year = Number(plan.year)
  for (let i = 0; i < cards.length; i += BATCH_MAX) {
    const b = writeBatch(db)
    cards.slice(i, i + BATCH_MAX).forEach(({ t, d }, j) => {
      const snap = snaps[i + j]
      const cur = snap.exists() ? snap.data() : {}
      const name = nameOf(d.assigneeUid) || d.assigneeName || ''
      const dept = deptName.get(d.deptId) || ''
      const holders = (cur.holders || []).filter((h) => h.year !== year)
      holders.push({ year, uid: d.assigneeUid || null, name, dutyTitle: d.title || '', deptName: dept })
      holders.sort((x, y) => x.year - y.year)
      const holderUids = [...new Set(holders.map((h) => h.uid).filter(Boolean))]
      b.set(catalogRef(schoolId, t.key), plain({
        title: t.text, dutyTitle: d.title || '', deptName: dept, lastYear: year,
        holders, holderUids, ...(snap.exists() ? {} : { guide: { overview: '', monthly: [], tips: '', links: [] } }),
      }), { merge: true })
    })
    await b.commit()
  }
  return cards.length
}
