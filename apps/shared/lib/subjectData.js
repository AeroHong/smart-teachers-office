import { collection, getDocs, doc, setDoc, deleteDoc, writeBatch, query, where } from 'firebase/firestore'
import { db } from './firebase'

/**
 * 과목 데이터 로드
 * @param {string} schoolId
 * @returns {Promise<Array>} 과목 배열
 */
export async function loadSubjects(schoolId) {
  const snap = await getDocs(collection(db, 'schools', schoolId, 'subjects'))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

/**
 * 과목 저장 (추가/수정)
 * @param {string} schoolId
 * @param {Object} subjectData
 */
export async function saveSubject(schoolId, subjectData) {
  const { id, ...data } = subjectData
  const docId = id || doc(collection(db, 'schools', schoolId, 'subjects')).id
  await setDoc(doc(db, 'schools', schoolId, 'subjects', docId), {
    ...data,
    updatedAt: new Date()
  }, { merge: true })
}

/**
 * 과목 삭제
 * @param {string} schoolId
 * @param {string} subjectId
 */
export async function deleteSubject(schoolId, subjectId) {
  await deleteDoc(doc(db, 'schools', schoolId, 'subjects', subjectId))
}

// Firestore writeBatch 1회 최대 작업 수
const BATCH_LIMIT = 500

// 작업 목록을 BATCH_LIMIT 단위로 나눠 순차 커밋한다.
// apply(batch, item) 안에서 batch.set / batch.delete 를 호출한다.
async function commitInChunks(items, apply) {
  for (let i = 0; i < items.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db)
    items.slice(i, i + BATCH_LIMIT).forEach(item => apply(batch, item))
    await batch.commit()
  }
}

// 특정 입학년도(없으면 전체)의 기존 과목 문서 레퍼런스 목록
async function getSubjectRefsByYear(schoolId, entryYear) {
  const col = collection(db, 'schools', schoolId, 'subjects')
  const snap = await getDocs(
    entryYear ? query(col, where('entryYear', '==', entryYear)) : col
  )
  return snap.docs.map(d => d.ref)
}

/**
 * 특정 입학년도 과목 일괄 삭제 (entryYear 미지정 시 전체 삭제)
 * @param {string} schoolId
 * @param {number} entryYear
 */
export async function deleteSubjectsByYear(schoolId, entryYear) {
  const refs = await getSubjectRefsByYear(schoolId, entryYear)
  await commitInChunks(refs, (batch, ref) => batch.delete(ref))
}

/**
 * 과목 일괄 저장 (입학년도별) — 해당 입학년도 기존 데이터를 새 데이터로 교체한다.
 *
 * 삭제와 생성을 가능하면 한 배치로 묶어 원자적으로 처리한다.
 * 500개를 넘어 나눠야 할 때는 "생성 후 삭제" 순서로 커밋한다.
 * 중간에 실패하면 중복이 남지만(재업로드로 복구 가능), 기존 데이터가
 * 통째로 사라지는 상황은 피할 수 있다.
 *
 * @param {string} schoolId
 * @param {Array} subjects
 * @param {number} entryYear
 */
export async function bulkSaveSubjectsByYear(schoolId, subjects, entryYear) {
  const oldRefs = await getSubjectRefsByYear(schoolId, entryYear)
  const now = new Date()
  const newDocs = subjects.map(subject => ({
    ref: doc(collection(db, 'schools', schoolId, 'subjects')),
    data: { ...subject, createdAt: now, updatedAt: now },
  }))

  // 한 배치에 들어가면 원자적으로 교체
  if (oldRefs.length + newDocs.length <= BATCH_LIMIT) {
    const batch = writeBatch(db)
    oldRefs.forEach(ref => batch.delete(ref))
    newDocs.forEach(({ ref, data }) => batch.set(ref, data))
    await batch.commit()
    return
  }

  // 한도를 넘으면 생성을 먼저 끝내고 기존 데이터를 지운다
  await commitInChunks(newDocs, (batch, { ref, data }) => batch.set(ref, data))
  await commitInChunks(oldRefs, (batch, ref) => batch.delete(ref))
}

/**
 * 학생 데이터 로드 (과목 관리에서 학급 정보 확인용)
 * @param {string} schoolId
 * @returns {Promise<Array>}
 */
export async function loadStudents(schoolId) {
  const snap = await getDocs(collection(db, 'schools', schoolId, 'students'))
  return snap.docs.map(d => {
    const data = d.data()
    return {
      id: d.id,
      grade: data.grade,
      classNo: data.class,
      number: data.number,
      name: data.name,
      email: data.email,
      electiveSubjects: data.electiveSubjects || []
    }
  })
}
