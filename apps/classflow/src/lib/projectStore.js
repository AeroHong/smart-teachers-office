/**
 * 분반 배정 프로젝트 Firestore I/O — schools/{schoolId}/sectioningProjects/{id}
 * 학기별 작업 = 프로젝트 하나. 버전 스냅숏은 versions 하위 컬렉션.
 * 공동 작업(ExamCore와 같은 방식): 작업 창은 문서 하나를 실시간 구독하고, 저장은 revision이 1 오르는 transaction.
 * 내가 연 뒤 다른 사람이 먼저 저장했으면 최신본 위에 내 변경을 합쳐(mergeProject) 저장한다.
 */
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, orderBy, query, runTransaction, serverTimestamp,
} from 'firebase/firestore'
import { db } from '@shared/lib/firebase'
import { mergeProject, normalizeProject } from '@shared/lib/sectioning'

/** 문서에 저장하는 필드(계산값·화면 상태는 빼고) */
export const PERSIST_KEYS = [
  'title', 'year', 'grade', 'semester', 'termLabel', 'sourceFileName', 'entryYear', 'folder',
  'slots', 'rooms', 'maxSize', 'maxMode', 'minSize', 'minMode', 'freeMax', 'subjects', 'requests', 'assignment',
  'lockedStudents', 'manualStudents', 'excluded', 'warnings', 'separations', 'names', 'solveLogs',
  'headerRows', 'headerMerges', 'subjectCols', 'infoCols', 'studentInfo', 'lastSolve',
]

/** Firestore는 undefined를 거부한다 — 빠진 값은 null, JSON으로 한 번 걸러 쓴다 */
export function pickPersist(project) {
  const out = {}
  for (const k of PERSIST_KEYS) out[k] = project[k] === undefined ? null : project[k]
  return JSON.parse(JSON.stringify(out))
}

const colRef = (schoolId) => collection(db, 'schools', schoolId, 'sectioningProjects')
const docRef = (schoolId, id) => doc(db, 'schools', schoolId, 'sectioningProjects', id)

const byNameOf = (user) => user.displayName || user.email || ''

export async function listProjects(schoolId) {
  const snap = await getDocs(query(colRef(schoolId), orderBy('updatedAt', 'desc')))
  // 목록에는 요약만 — 큰 필드(requests·assignment)는 화면에서 쓰지 않는다
  return snap.docs.map((d) => {
    const x = d.data()
    return {
      id: d.id, title: x.title, year: x.year, grade: x.grade, semester: x.semester, termLabel: x.termLabel,
      entryYear: x.entryYear ?? null, folder: x.folder || '',
      sourceFileName: x.sourceFileName, studentCount: Object.keys(x.requests || {}).length,
      subjectCount: (x.subjects || []).length, lastSolve: x.lastSolve || null,
      separationCount: (x.separations || []).length,
      updatedAt: x.updatedAt?.toDate?.() || null, updatedByName: x.updatedByName || '', createdBy: x.createdBy,
    }
  })
}

export async function createProjectDoc(schoolId, project, user) {
  const ref = await addDoc(colRef(schoolId), {
    ...pickPersist(project),
    revision: 0,
    createdBy: user.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedByName: byNameOf(user),
  })
  return ref.id
}

/** 다른 작업을 통째로 복사해 새 작업으로(배정·기록 포함, 버전은 빼고) */
export async function duplicateProject(schoolId, id, user, title) {
  const src = await loadProject(schoolId, id)
  if (!src) throw new Error('작업을 찾을 수 없습니다.')
  return createProjectDoc(schoolId, { ...normalizeProject(src), title }, user)
}

export async function loadProject(schoolId, id) {
  const snap = await getDoc(docRef(schoolId, id))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() }
}

/**
 * 작업 문서 하나를 실시간 구독한다. cb({ project(normalize 전 원본 데이터), revision, updatedByName, updatedAt, fromCache }) / 없으면 cb(null)
 * 저장 직후 로컬 쓰기(hasPendingWrites)는 건너뛴다 — 서버가 확정한 값만 따라간다.
 */
export function watchProject(schoolId, id, cb, onError) {
  return onSnapshot(docRef(schoolId, id), (snap) => {
    if (!snap.exists()) { cb(null); return }
    if (snap.metadata.hasPendingWrites) return
    const x = snap.data()
    cb({ data: { id: snap.id, ...x }, revision: x.revision || 0, updatedByName: x.updatedByName || '', updatedAt: x.updatedAt?.toDate?.() || null })
  }, onError)
}

/**
 * 합치기 저장.
 * @param o { base: 내가 연 저장본(normalize된 작업), mine: 지금 작업, baseRevision, user, labelOf, force: 합치지 않고 그대로(버전 불러오기) }
 * @returns {{ revision, project, merged, conflicts: string[], byName }} — project는 실제로 저장된 상태(normalize됨)
 */
export async function saveProject(schoolId, id, o) {
  const ref = docRef(schoolId, id)
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists()) throw new Error('작업이 삭제되었습니다.')
    const server = snap.data()
    const cur = server.revision || 0
    const merged = cur !== o.baseRevision && !o.force
    let next = o.mine
    let conflicts = []
    if (merged) {
      const latest = normalizeProject({ id, ...server })
      const r = mergeProject(o.base, o.mine, latest, o.labelOf)
      next = r.project
      conflicts = r.conflicts
    }
    tx.update(ref, {
      ...pickPersist(next),
      revision: cur + 1,
      updatedAt: serverTimestamp(),
      updatedByName: byNameOf(o.user),
    })
    return { revision: cur + 1, project: next, merged, conflicts, byName: server.updatedByName || '' }
  })
}

/** 작업 정보(이름·학년도·묶음 등)만 바로 고친다 — 다른 사람의 작업 내용은 건드리지 않는다 */
export async function saveProjectInfo(schoolId, id, patch, user) {
  const ref = docRef(schoolId, id)
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists()) throw new Error('작업이 삭제되었습니다.')
    const cur = snap.data().revision || 0
    tx.update(ref, { ...JSON.parse(JSON.stringify(patch)), revision: cur + 1, updatedAt: serverTimestamp(), updatedByName: byNameOf(user) })
    return cur + 1
  })
}

export async function deleteProject(schoolId, id) {
  const vs = await getDocs(collection(db, 'schools', schoolId, 'sectioningProjects', id, 'versions'))
  await Promise.all(vs.docs.map((d) => deleteDoc(d.ref)))
  await deleteDoc(docRef(schoolId, id))
}

// ── 버전 스냅숏 ──
const verCol = (schoolId, id) => collection(db, 'schools', schoolId, 'sectioningProjects', id, 'versions')

export async function saveVersion(schoolId, id, name, project, user) {
  await addDoc(verCol(schoolId, id), {
    name,
    data: pickPersist(project),
    stats: project.lastSolve || null,
    createdBy: user.uid,
    createdByName: byNameOf(user),
    createdAt: serverTimestamp(),
  })
}

export async function listVersions(schoolId, id) {
  const snap = await getDocs(query(verCol(schoolId, id), orderBy('createdAt', 'desc')))
  return snap.docs.map((d) => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate?.() || null }))
}

export async function deleteVersion(schoolId, id, versionId) {
  await deleteDoc(doc(db, 'schools', schoolId, 'sectioningProjects', id, 'versions', versionId))
}
