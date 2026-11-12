/**
 * 규정집 Firestore 읽기·쓰기 (DB_STRUCTURE.md 「규정집」).
 *
 * 읽기 비용: 화면은 목차 문서(regulationBooks/main) 하나를 구독하고, 규정을 열 때 규정 문서 + 버전 한 건을 읽는다.
 * 버전은 고치지 않는 스냅숏이라 한 번 읽은 것은 메모리에 둔다. 검색 색인은 묶음 몇 건을 IndexedDB에 캐시한다.
 * 쓰기: 가져오기·개정 확정은 관리자(규칙 isHubAdmin)만, 개정안은 규정 담당자.
 */
import { useEffect, useState } from 'react'
import {
  addDoc, collection, deleteDoc, doc, FieldPath, getDoc, getDocs, onSnapshot, orderBy, query, runTransaction,
  serverTimestamp, setDoc, updateDoc, where, writeBatch,
} from 'firebase/firestore'
import { db } from '@shared/lib/firebase'
import { COL, schoolPath } from '@shared/lib/schema'
import { collectRefs, guessCategory, indexNodes, tocOf } from '@shared/lib/regulationTree'
import { buildSearchEntries, packIndex, replaceRegEntries } from '@shared/lib/regulationSearch'
import { changeSummary, diffNodes } from '@shared/lib/regulationDiff'
import { normTitle, titleSimilarity } from '@shared/lib/regulationParse'
import { suggestHierarchy } from '@shared/lib/regulationHierarchy'

export const BOOK_ID = 'main'
export const LOG_SUB = 'log'
export const VERSIONS_SUB = 'versions'

const p = (schoolId, ...segs) => schoolPath(schoolId, ...segs)
export const bookRef = (schoolId) => doc(db, ...p(schoolId, COL.REGULATION_BOOKS), BOOK_ID)
export const regRef = (schoolId, regId) => doc(db, ...p(schoolId, COL.REGULATIONS), regId)
export const versionRef = (schoolId, regId, verId) => doc(db, ...p(schoolId, COL.REGULATIONS, regId, VERSIONS_SUB), verId)
export const amendmentRef = (schoolId, id) => doc(db, ...p(schoolId, COL.REGULATION_AMENDMENTS), id)
const searchRef = (schoolId, i) => doc(db, ...p(schoolId, COL.REGULATION_SEARCH), `${BOOK_ID}_${i}`)

// ── 목차·규정 읽기 ────────────────────────────────────────────────

/** 규정집 목차 구독 — { book: null(아직 없음)|object, loading, error } */
export function useBook(schoolId) {
  const [state, setState] = useState({ book: null, loading: true, error: null })
  useEffect(() => {
    if (!schoolId) return undefined
    return onSnapshot(bookRef(schoolId),
      (snap) => setState({ book: snap.exists() ? { id: snap.id, ...snap.data() } : null, loading: false, error: null }),
      (e) => { console.error(e); setState({ book: null, loading: false, error: e }) })
  }, [schoolId])
  return state
}

const versionCache = new Map()
/** 버전(스냅숏) — 한 번 읽으면 메모리에 둔다 */
export async function getVersion(schoolId, regId, verId) {
  const key = `${schoolId}/${regId}/${verId}`
  if (!versionCache.has(key)) {
    versionCache.set(key, getDoc(versionRef(schoolId, regId, verId)).then((s) => (s.exists() ? { id: s.id, ...s.data() } : null)).catch((e) => { versionCache.delete(key); throw e }))
  }
  return versionCache.get(key)
}

/** 규정 하나 — 메타 구독 + 지금(또는 지정) 버전 */
export function useRegulation(schoolId, regId, verId = null) {
  const [state, setState] = useState({ reg: null, version: null, loading: true, error: null })
  useEffect(() => {
    if (!schoolId || !regId) return undefined
    let alive = true
    setState((s) => ({ ...s, loading: true }))
    const unsub = onSnapshot(regRef(schoolId, regId), async (snap) => {
      if (!snap.exists()) { if (alive) setState({ reg: null, version: null, loading: false, error: null }); return }
      const reg = { id: snap.id, ...snap.data() }
      try {
        const version = await getVersion(schoolId, regId, verId || reg.currentVersionId)
        if (alive) setState({ reg, version, loading: false, error: null })
      } catch (e) { if (alive) setState({ reg, version: null, loading: false, error: e }) }
    }, (e) => { if (alive) setState({ reg: null, version: null, loading: false, error: e }) })
    return () => { alive = false; unsub() }
  }, [schoolId, regId, verId])
  return state
}

/** 규정의 지금 노드 — 다른 규정을 가리키는 고정 링크를 그릴 때 */
export async function getCurrentNodes(schoolId, book, regId) {
  const entry = book?.regulations?.find((r) => r.id === regId)
  if (!entry) return null
  const v = await getVersion(schoolId, regId, entry.currentVersionId)
  return v?.nodes || null
}

/** 규정의 버전 목록(연혁 화면) */
export async function listVersions(schoolId, regId) {
  const snap = await getDocs(query(collection(db, ...p(schoolId, COL.REGULATIONS, regId, VERSIONS_SUB)), orderBy('createdAt', 'desc')))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

/** 이름 → 규정(글자 참조 「학칙」 찾기) */
export function makeFindReg(book) {
  const regs = book?.regulations || []
  return (name) => {
    const n = normTitle(name)
    let best = null; let score = 0
    for (const r of regs) {
      const s = titleSimilarity(n, r.title)
      if (s > score) { score = s; best = r }
    }
    return score >= 0.75 ? best : null
  }
}

// ── 검색 색인 ───────────────────────────────────────────────────

function idb() {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open('codex-edu', 1)
      req.onupgradeneeded = () => req.result.createObjectStore('search')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    } catch (e) { reject(e) }
  })
}
async function idbGet(key) {
  try {
    const d = await idb()
    return await new Promise((res) => { const r = d.transaction('search').objectStore('search').get(key); r.onsuccess = () => res(r.result); r.onerror = () => res(undefined) })
  } catch { return undefined }
}
async function idbPut(key, value) {
  try {
    const d = await idb()
    await new Promise((res) => { const t = d.transaction('search', 'readwrite'); t.objectStore('search').clear(); t.objectStore('search').put(value, key); t.oncomplete = res; t.onerror = res })
  } catch { /* 캐시는 없어도 된다 */ }
}

const memIndex = new Map()
/** 검색 색인 — 규정집의 searchStamp가 같으면 캐시를 쓴다 */
export async function loadSearchIndex(schoolId, book) {
  if (!book?.searchStamp) return []
  const key = `${schoolId}:${book.searchStamp}`
  if (memIndex.has(key)) return memIndex.get(key)
  const job = (async () => {
    const cached = await idbGet(key)
    if (cached) return cached
    const parts = await Promise.all(Array.from({ length: book.searchParts || 1 }, (_, i) => getDoc(searchRef(schoolId, i))))
    const entries = parts.flatMap((s) => (s.exists() ? s.data().entries || [] : []))
    idbPut(key, entries)
    return entries
  })()
  memIndex.set(key, job)
  return job
}

/** 색인 쓰기 — 묶음을 쓰고 남는 옛 묶음은 지운다. 규정집 문서의 searchStamp·searchParts는 호출한 쪽이 같이 쓴다 */
function writeSearchParts(batch, schoolId, entries, oldParts = 0) {
  const parts = packIndex(entries)
  parts.forEach((entriesPart, i) => batch.set(searchRef(schoolId, i), { entries: entriesPart, part: i, updatedAt: serverTimestamp() }))
  for (let i = parts.length; i < oldParts; i++) batch.delete(searchRef(schoolId, i))
  return { searchParts: parts.length, searchStamp: `${Date.now().toString(36)}` }
}

// 인용 — { '규정id/노드id': ['규정id/조id', …] }
function citationsFor(regs, findReg) {
  const out = {}
  for (const r of regs) {
    for (const ref of collectRefs(r.id, r.nodes, findReg)) {
      const k = `${ref.to.regId}/${ref.to.nodeId}`
      const v = `${r.id}/${ref.from}`
      if (!out[k]) out[k] = []
      if (!out[k].includes(v)) out[k].push(v)
    }
  }
  return out
}

/** 목차 문서의 규정 한 줄 */
/**
 * 목차 문서의 규정 한 줄. 체계(level·parentId·basis)·상태(status)는 넘긴 값을 그대로 둔다(관리자가 「체계 설정」에서 고친 값).
 */
export function bookEntry({ id, title, no, reference, category, order, currentVersionId, effectiveDate, nodes, isPublic = false, level, parentId, basis, status, repealedDate }) {
  return {
    id, title, no: no || '', reference: !!reference, category: category || guessCategory(title, reference), order,
    currentVersionId, effectiveDate: effectiveDate || '', public: !!isPublic,
    level: level || 'regulation', parentId: parentId || null, basis: basis || [], status: status || 'active',
    ...(repealedDate ? { repealedDate } : {}),
    articleCount: nodes.filter((n) => n.type === 'article').length,
    toc: tocOf(nodes),
  }
}

/** 체계 자동 제안을 규정 줄에 채운다 — onlyEmpty면 아직 체계가 없는 규정만(관리자가 고친 값은 그대로) */
export function withHierarchy(entries, regsWithNodes, { onlyEmpty = true } = {}) {
  const sug = suggestHierarchy(regsWithNodes)
  return entries.map((e) => {
    const s = sug.get(e.id)
    if (!s || (onlyEmpty && e.hierarchySet)) return e
    return { ...e, level: s.level, parentId: s.parentId, basis: s.basis }
  })
}

// ── 가져오기(최초 적재·다시 적재) ─────────────────────────────────

/**
 * 검수한 규정들을 규정집으로 적재한다. 이미 규정집이 있으면 같은 이름(정규화) 규정은 새 버전으로 바꾸고,
 * 새 규정은 만들고, 원본에 없는 규정은 목차에서 뺀다(규정 문서·버전은 남는다).
 * @param {{ schoolId, title, effectiveDate, sourceFileName, regs: {title, no, reference, category, history, nodes}[], user: {uid, name} }} a
 */
export async function importBook({ schoolId, schoolName = '', title, effectiveDate, sourceFileName, regs, user, existingBook }) {
  const prev = existingBook?.regulations || []
  const used = new Set()
  const staged = regs.map((r, order) => {
    const match = prev.find((x) => !used.has(x.id) && normTitle(x.title) === normTitle(r.title))
    if (match) used.add(match.id)
    const id = match?.id || doc(collection(db, ...p(schoolId, COL.REGULATIONS))).id
    const verId = doc(collection(db, ...p(schoolId, COL.REGULATIONS, id, VERSIONS_SUB))).id
    // 다시 적재 — 관리자가 정한 체계·공개·상태는 이어받는다
    const keep = match ? { isPublic: match.public, level: match.level, parentId: match.parentId, basis: match.basis, status: match.status, repealedDate: match.repealedDate, hierarchySet: match.hierarchySet } : {}
    return { ...r, id, verId, order, existed: !!match, ...keep }
  })
  const findReg = makeFindReg({ regulations: staged.map((r) => ({ id: r.id, title: r.title, toc: tocOf(r.nodes) })) })

  // 묶음 쓰기 — 한 번에 500건 아래로
  const batches = [writeBatch(db)]
  let ops = 0
  const b = () => { if (ops >= 400) { batches.push(writeBatch(db)); ops = 0 } ops++; return batches[batches.length - 1] }
  const who = { uid: user.uid, name: user.name }
  for (const r of staged) {
    b().set(versionRef(schoolId, r.id, r.verId), {
      nodes: r.nodes, effectiveDate, kind: r.existed ? '다시적재' : '최초적재', note: sourceFileName || '',
      createdAt: serverTimestamp(), createdBy: who.uid, createdByName: who.name,
    })
    b().set(regRef(schoolId, r.id), {
      title: r.title, no: r.no || '', reference: !!r.reference, category: r.category,
      history: [...(r.history || []).map((h) => ({ kind: h.kind, date: h.date })), { kind: r.existed ? '다시적재' : '최초적재', date: effectiveDate }],
      currentVersionId: r.verId, updatedAt: serverTimestamp(), updatedByName: who.name,
    }, { merge: true })
  }
  const entries = staged.flatMap((r) => buildSearchEntries(r.id, r.nodes))
  const search = writeSearchParts(b(), schoolId, entries, existingBook?.searchParts || 0)
  b().set(bookRef(schoolId), {
    title, schoolName: schoolName || existingBook?.schoolName || '', effectiveDate, sourceFileName: sourceFileName || '',
    regulations: withHierarchy(staged.map((r) => ({ ...bookEntry({ ...r, currentVersionId: r.verId, effectiveDate }), ...(r.hierarchySet ? { hierarchySet: true } : {}) })), staged),
    citations: citationsFor(staged, findReg),
    recent: existingBook?.recent || [],
    ...search,
    updatedAt: serverTimestamp(), updatedBy: who.uid, updatedByName: who.name,
  })
  for (const bt of batches) await bt.commit()
  return staged.length
}

/** 목차 설정(분류·순서·제목·외부 공개)만 고친다 — 본문은 그대로 */
export async function saveBookSettings(schoolId, book, regulations, user) {
  await updateDoc(bookRef(schoolId), { regulations, ...(user.schoolName ? { schoolName: user.schoolName } : {}), updatedAt: serverTimestamp(), updatedByName: user.name })
  const batch = writeBatch(db)
  for (const r of regulations) {
    const old = book.regulations.find((x) => x.id === r.id)
    if (old && (old.title !== r.title || old.category !== r.category)) batch.update(regRef(schoolId, r.id), { title: r.title, category: r.category })
  }
  await batch.commit()
}

// ── 개정안 ──────────────────────────────────────────────────────

export function useAmendments(schoolId, { regId = null, enabled = true } = {}) {
  const [state, setState] = useState({ list: [], loading: true })
  useEffect(() => {
    if (!schoolId || !enabled) { setState({ list: [], loading: false }); return undefined }
    const base = collection(db, ...p(schoolId, COL.REGULATION_AMENDMENTS))
    const q = regId ? query(base, where('regId', '==', regId)) : query(base, orderBy('updatedAt', 'desc'))
    return onSnapshot(q, (snap) => setState({ list: snap.docs.map((d) => ({ id: d.id, ...d.data() })), loading: false }),
      (e) => { console.error(e); setState({ list: [], loading: false }) })
  }, [schoolId, regId, enabled])
  return state
}

export function useAmendment(schoolId, id) {
  const [state, setState] = useState({ amd: null, loading: true })
  useEffect(() => {
    if (!schoolId || !id) return undefined
    return onSnapshot(amendmentRef(schoolId, id), (s) => setState({ amd: s.exists() ? { id: s.id, ...s.data() } : null, loading: false }),
      (e) => { console.error(e); setState({ amd: null, loading: false }) })
  }, [schoolId, id])
  return state
}

export async function listAmendmentLog(schoolId, id) {
  const snap = await getDocs(query(collection(db, ...p(schoolId, COL.REGULATION_AMENDMENTS, id, LOG_SUB)), orderBy('at', 'desc')))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

/** 개정안 만들기 — 지금 버전을 복사해 시작한다 */
export async function createAmendment(schoolId, { reg, version, kind = '일부개정' }, user) {
  const ref = await addDoc(collection(db, ...p(schoolId, COL.REGULATION_AMENDMENTS)), {
    regId: reg.id, regTitle: reg.title, baseVersionId: version.id, nodes: version.nodes,
    title: `${reg.title} ${kind}(안)`, kind, reason: '', effectiveDate: '', staffMeetingDate: '', committeeDate: '',
    status: 'draft', revision: 0,
    createdBy: user.uid, createdByName: user.name, createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(), updatedByName: user.name,
  })
  await addDoc(collection(db, ...p(schoolId, COL.REGULATION_AMENDMENTS, ref.id, LOG_SUB)), {
    uid: user.uid, name: user.name, action: 'create', label: `${reg.title} 개정안을 만들었습니다`, at: serverTimestamp(),
  })
  return ref.id
}

/**
 * 개정안 저장 — 다른 사람이 먼저 저장했으면(revision이 다르면) 막는다. 이번 저장에서 바뀐 노드를 작업 기록에 남긴다.
 * @param {object} amd 편집을 시작할 때(또는 마지막 저장 때)의 개정안
 * @param {object} patch 바꿀 필드(nodes 포함 가능)
 */
export async function saveAmendment(schoolId, amd, patch, user) {
  const ref = amendmentRef(schoolId, amd.id)
  const changes = patch.nodes ? changeSummary(amd.nodes, patch.nodes) : []
  await runTransaction(db, async (tx) => {
    const cur = await tx.get(ref)
    if (!cur.exists()) throw new Error('개정안이 지워졌습니다.')
    if ((cur.data().revision || 0) !== (amd.revision || 0)) throw new Error(`${cur.data().updatedByName || '다른 사람'} 님이 먼저 저장했습니다. 새로 고친 뒤 다시 작업해 주세요.`)
    if (cur.data().status === 'applied') throw new Error('이미 확정된 개정안입니다.')
    tx.update(ref, { ...patch, revision: (amd.revision || 0) + 1, updatedAt: serverTimestamp(), updatedByName: user.name })
    const logCol = collection(db, ...p(schoolId, COL.REGULATION_AMENDMENTS, amd.id, LOG_SUB))
    for (const c of changes.slice(0, 200)) tx.set(doc(logCol), { uid: user.uid, name: user.name, ...c, at: serverTimestamp() })
    const meta = Object.keys(patch).filter((k) => k !== 'nodes' && k !== 'status')
    if (meta.length) tx.set(doc(logCol), { uid: user.uid, name: user.name, action: 'meta', label: `개정안 정보 수정(${meta.join(', ')})`, at: serverTimestamp() })
    if (patch.status && patch.status !== cur.data().status) tx.set(doc(logCol), { uid: user.uid, name: user.name, action: 'status', label: `상태: ${patch.status}`, at: serverTimestamp() })
  })
  return changes.length
}

export async function deleteAmendment(schoolId, id) {
  await deleteDoc(amendmentRef(schoolId, id))
}

/**
 * 개정 확정(관리자) — 새 버전·규정 연혁·목차·검색 색인·인용을 한 번에 쓰고, 외부 공개 규정이면 공개 사본도.
 * 조문마다 연혁 표시(hist)를 붙인다: 신설·개정·삭제 + 시행일.
 */
export async function applyAmendment(schoolId, amd, book, user) {
  if (!amd.effectiveDate) throw new Error('시행일을 넣어 주세요.')
  const reg = await getDoc(regRef(schoolId, amd.regId))
  if (!reg.exists()) throw new Error('규정이 없습니다.')
  if (reg.data().currentVersionId !== amd.baseVersionId) throw new Error('이 개정안을 만든 뒤 규정이 먼저 바뀌었습니다. 지금 규정으로 개정안을 다시 만들어 주세요.')
  const base = await getVersion(schoolId, amd.regId, amd.baseVersionId)
  const d = diffNodes(base.nodes, amd.nodes)
  const repeal = amd.kind === '폐지'
  if (!repeal && !d.added.length && !d.deleted.length && !d.modified.length && !d.moved.length) throw new Error('바뀐 곳이 없습니다.')
  const date = amd.effectiveDate
  const mark = new Map([...d.added.map((id) => [id, '신설']), ...d.modified.map((id) => [id, '개정']), ...d.deleted.map((id) => [id, '삭제'])])
  const nodes = amd.nodes.map((n) => (mark.has(n.id) ? { ...n, hist: [...(n.hist || []), { kind: mark.get(n.id), date }] } : n))

  const verRef = doc(collection(db, ...p(schoolId, COL.REGULATIONS, amd.regId, VERSIONS_SUB)))
  const batch = writeBatch(db)
  batch.set(verRef, {
    nodes, effectiveDate: date, kind: amd.kind || '일부개정', amendmentId: amd.id, note: amd.reason || '',
    staffMeetingDate: amd.staffMeetingDate || '', committeeDate: amd.committeeDate || '',
    createdAt: serverTimestamp(), createdBy: user.uid, createdByName: user.name,
  })
  const history = [...(reg.data().history || []), { kind: amd.kind || '일부개정', date, amendmentId: amd.id }]
  batch.update(regRef(schoolId, amd.regId), { currentVersionId: verRef.id, history, ...(repeal ? { status: 'repealed', repealedDate: date } : {}), updatedAt: serverTimestamp(), updatedByName: user.name })

  // 목차·인용
  const entry = book.regulations.find((r) => r.id === amd.regId)
  const regulations = book.regulations.map((r) => (r.id === amd.regId
    ? { ...bookEntry({ ...r, nodes, currentVersionId: verRef.id, effectiveDate: date, isPublic: repeal ? false : r.public, ...(repeal ? { status: 'repealed', repealedDate: date } : {}) }), ...(r.hierarchySet ? { hierarchySet: true } : {}) }
    : r))
  const findReg = makeFindReg({ regulations })
  const citations = Object.fromEntries(Object.entries(book.citations || {})
    .map(([k, v]) => [k, v.filter((x) => !x.startsWith(`${amd.regId}/`))]).filter(([, v]) => v.length))
  for (const ref of repeal ? [] : collectRefs(amd.regId, nodes, findReg)) {
    const k = `${ref.to.regId}/${ref.to.nodeId}`
    citations[k] = [...new Set([...(citations[k] || []), `${amd.regId}/${ref.from}`])]
  }
  // 검색 색인 — 이 규정 줄만 바꾼다
  // 폐지된 규정은 검색에서 뺀다(연혁·버전으로는 계속 볼 수 있다)
  const entries = replaceRegEntries(await loadSearchIndex(schoolId, book), amd.regId, repeal ? [] : buildSearchEntries(amd.regId, nodes))
  const search = writeSearchParts(batch, schoolId, entries, book.searchParts || 0)
  const recent = [{ regId: amd.regId, title: entry?.title || amd.regTitle, kind: amd.kind || '일부개정', date, amendmentId: amd.id }, ...(book.recent || [])].slice(0, 12)
  batch.update(bookRef(schoolId), { regulations, citations, recent, ...search, updatedAt: serverTimestamp(), updatedByName: user.name })
  batch.update(amendmentRef(schoolId, amd.id), {
    status: 'applied', appliedVersionId: verRef.id, appliedAt: serverTimestamp(), appliedByName: user.name,
    revision: (amd.revision || 0) + 1, updatedAt: serverTimestamp(), updatedByName: user.name,
  })
  batch.set(doc(collection(db, ...p(schoolId, COL.REGULATION_AMENDMENTS, amd.id, LOG_SUB))), {
    uid: user.uid, name: user.name, action: 'apply', label: `확정 — 시행일 ${date}`, at: serverTimestamp(),
  })
  await batch.commit()
  // 외부 공개 규정이면 공개 사본도 다시 쓴다(확정은 이미 끝났으니 실패해도 안내만)
  if (entry?.public) { // 폐지면 공개 사본에서도 빠진다(위에서 public을 껐다)
    const { publishPublicBook } = await import('./publicBook')
    await publishPublicBook(schoolId, { ...book, regulations, citations, recent }, user).catch((e) => console.error('공개 사본 반영 실패:', e))
  }
  return verRef.id
}

// ── 담당자 지정 ─────────────────────────────────────────────────

const STAFF_ROLES = ['teacher', 'admin', 'school_admin', 'principal', 'headmaster']

/** 교직원 목록 + 담당 역할 */
export async function listStaffWithRoles(schoolId) {
  const [users, managers] = await Promise.all([
    getDocs(query(collection(db, 'users'), where('schoolId', '==', schoolId), where('role', 'in', STAFF_ROLES))),
    getDocs(collection(db, ...p(schoolId, COL.STUDENT_HUB_MANAGERS))),
  ])
  const roles = new Map(managers.docs.map((d) => [d.id, d.data().roles || []]))
  return users.docs.map((d) => ({ uid: d.id, name: d.data().name || d.data().email || '', email: d.data().email || '', role: d.data().role, roles: roles.get(d.id) || [] }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
}

/** 담당 역할 하나만 켜고 끈다 — 다른 앱(StudentHub)의 역할은 건드리지 않는다 */
export async function setManagerRole(schoolId, staff, role, on) {
  const ref = doc(db, ...p(schoolId, COL.STUDENT_HUB_MANAGERS), staff.uid)
  const cur = await getDoc(ref)
  const roles = new Set(cur.exists() ? cur.data().roles || [] : [])
  if (on) roles.add(role); else roles.delete(role)
  await setDoc(ref, { roles: [...roles], nameSnapshot: staff.name, updatedAt: serverTimestamp() }, { merge: true })
}

export { indexNodes }

// ── 체계(위계) ──────────────────────────────────────────────────

/** 지금 규정집 전체에 체계 자동 제안을 다시 받는다 — onlyEmpty면 관리자가 정하지 않은 규정만 */
export async function suggestBookHierarchy(schoolId, book, { onlyEmpty = true } = {}) {
  const regs = await Promise.all(book.regulations.map(async (r) => ({ id: r.id, title: r.title, reference: r.reference, nodes: (await getCurrentNodes(schoolId, book, r.id)) || [] })))
  return withHierarchy(book.regulations, regs, { onlyEmpty })
}

/** 상위 법령 점검 기록 — 목차 문서 lawReviews.{법령키} = { checkedAt, byName, note } */
export async function markLawReviewed(schoolId, key, { note = '' } = {}, user) {
  await updateDoc(bookRef(schoolId), new FieldPath('lawReviews', key), { checkedAt: new Date().toISOString().slice(0, 10), byName: user.name, note })
}
