/**
 * 분반 배정 프로젝트 Firestore I/O — schools/{schoolId}/sectioningProjects/{id}
 * 학기별 작업 = 프로젝트 하나. 버전 스냅숏은 versions 하위 컬렉션.
 * 저장은 revision이 정확히 1 오르는 transaction — 다른 창에서 먼저 저장했으면 덮어쓰지 않고 알려 준다.
 */
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, runTransaction, serverTimestamp,
} from 'firebase/firestore'
import { db } from '@shared/lib/firebase'

/** 문서에 저장하는 필드(계산값·화면 상태는 빼고) */
export const PERSIST_KEYS = [
  'title', 'year', 'grade', 'semester', 'termLabel', 'sourceFileName',
  'slots', 'rooms', 'maxSize', 'maxMode', 'minSize', 'minMode', 'subjects', 'requests', 'assignment',
  'lockedStudents', 'manualStudents', 'excluded', 'warnings', 'separations',
  'headerRows', 'headerMerges', 'subjectCols', 'lastSolve',
]

export function pickPersist(project) {
  const out = {}
  for (const k of PERSIST_KEYS) out[k] = project[k] === undefined ? null : project[k]
  return out
}

const colRef = (schoolId) => collection(db, 'schools', schoolId, 'sectioningProjects')
const docRef = (schoolId, id) => doc(db, 'schools', schoolId, 'sectioningProjects', id)

export async function listProjects(schoolId) {
  const snap = await getDocs(query(colRef(schoolId), orderBy('updatedAt', 'desc')))
  // 목록에는 요약만 — 큰 필드(requests·assignment)는 화면에서 쓰지 않는다
  return snap.docs.map((d) => {
    const x = d.data()
    return {
      id: d.id, title: x.title, year: x.year, grade: x.grade, semester: x.semester, termLabel: x.termLabel,
      sourceFileName: x.sourceFileName, studentCount: Object.keys(x.requests || {}).length,
      subjectCount: (x.subjects || []).length, lastSolve: x.lastSolve || null,
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
    updatedByName: user.displayName || user.email || '',
  })
  return ref.id
}

export async function loadProject(schoolId, id) {
  const snap = await getDoc(docRef(schoolId, id))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() }
}

export class SaveConflictError extends Error {}

/** expectedRevision과 서버 revision이 다르면 SaveConflictError. 성공하면 새 revision */
export async function saveProject(schoolId, id, project, expectedRevision, user) {
  const ref = docRef(schoolId, id)
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists()) throw new Error('작업이 삭제되었습니다.')
    const cur = snap.data().revision || 0
    if (cur !== expectedRevision) {
      throw new SaveConflictError(`다른 곳에서 먼저 저장했습니다(${snap.data().updatedByName || '다른 사용자'}). 새로 불러온 뒤 다시 작업하세요.`)
    }
    tx.update(ref, {
      ...pickPersist(project),
      revision: cur + 1,
      updatedAt: serverTimestamp(),
      updatedByName: user.displayName || user.email || '',
    })
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
    createdByName: user.displayName || user.email || '',
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
