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

/**
 * 특정 입학년도 과목 일괄 삭제
 * @param {string} schoolId
 * @param {number} entryYear
 */
export async function deleteSubjectsByYear(schoolId, entryYear) {
  if (entryYear) {
    const q = query(
      collection(db, 'schools', schoolId, 'subjects'),
      where('entryYear', '==', entryYear)
    )
    const snap = await getDocs(q)
    const batch = writeBatch(db)
    snap.docs.forEach(d => batch.delete(d.ref))
    await batch.commit()
  } else {
    // 전체 삭제
    const snap = await getDocs(collection(db, 'schools', schoolId, 'subjects'))
    const batch = writeBatch(db)
    snap.docs.forEach(d => batch.delete(d.ref))
    await batch.commit()
  }
}

/**
 * 과목 일괄 저장 (입학년도별)
 * @param {string} schoolId
 * @param {Array} subjects
 * @param {number} entryYear
 */
export async function bulkSaveSubjectsByYear(schoolId, subjects, entryYear) {
  // 기존 데이터 삭제
  await deleteSubjectsByYear(schoolId, entryYear)

  // 새 데이터 저장
  const batch = writeBatch(db)
  subjects.forEach(subject => {
    const docRef = doc(collection(db, 'schools', schoolId, 'subjects'))
    batch.set(docRef, {
      ...subject,
      createdAt: new Date(),
      updatedAt: new Date()
    })
  })
  await batch.commit()
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
