import { collection, getDocs, doc, setDoc, deleteDoc, writeBatch, query, where } from 'firebase/firestore'
import { db } from './firebase'
import { COL, schoolPath } from './schema'

// subjects 는 학년도(year)가 아니라 입학년도(entryYear)로 스코프된다.
// 교육과정 편제가 입학 코호트 단위로 고정되기 때문. 자세한 구분은 schema.js 참고.
// 문서 ID는 auto-ID를 쓰고, 스코프는 문서 안의 entryYear 필드로 표현한다.
const subjectsCol = (schoolId) => collection(db, ...schoolPath(schoolId, COL.SUBJECTS))

/**
 * 과목 데이터 로드
 * @param {string} schoolId
 * @returns {Promise<Array>} 과목 배열
 */
export async function loadSubjects(schoolId) {
  const snap = await getDocs(subjectsCol(schoolId))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

/**
 * 과목 저장 (추가/수정)
 * @param {string} schoolId
 * @param {Object} subjectData
 */
export async function saveSubject(schoolId, subjectData) {
  const { id, ...data } = subjectData
  const docId = id || doc(subjectsCol(schoolId)).id
  await setDoc(doc(db, ...schoolPath(schoolId, COL.SUBJECTS), docId), {
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
  await deleteDoc(doc(db, ...schoolPath(schoolId, COL.SUBJECTS), subjectId))
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
  const col = subjectsCol(schoolId)
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
 * 여기서 말하는 "년도"는 학년도(year)가 아니라 입학년도(entryYear)다.
 *
 * 엑셀로 내려받아 고친 뒤 다시 올리는 경우처럼 행이 기존 문서 id를 들고 오면
 * 그 문서를 그대로 갱신한다. 지우고 새로 만들면 문서 ID가 바뀌어
 * teacherSubjects.subjectId 참조가 조용히 끊긴다 (과목코드 일괄 수정이 대표적).
 *
 * 삭제와 생성을 가능하면 한 배치로 묶어 원자적으로 처리한다.
 * 500개를 넘어 나눠야 할 때는 "생성 후 삭제" 순서로 커밋한다.
 * 중간에 실패하면 중복이 남지만(재업로드로 복구 가능), 기존 데이터가
 * 통째로 사라지는 상황은 피할 수 있다.
 *
 * @param {string} schoolId
 * @param {Array} subjects 각 항목에 id가 있으면 해당 문서를 갱신한다
 * @param {number} entryYear
 * @returns {Promise<{updated: number, created: number, deleted: number}>}
 */
export async function bulkSaveSubjectsByYear(schoolId, subjects, entryYear) {
  const oldRefs = await getSubjectRefsByYear(schoolId, entryYear)
  const oldIds = new Set(oldRefs.map(r => r.id))
  const now = new Date()

  // 기존 문서를 가리키는 행은 그 자리를 유지하고, 나머지만 새로 만든다
  const keptIds = new Set()
  const writes = subjects.map(subject => {
    const { id, ...data } = subject
    if (id && oldIds.has(id)) {
      keptIds.add(id)
      return { ref: doc(subjectsCol(schoolId), id), data: { ...data, updatedAt: now } }
    }
    return { ref: doc(subjectsCol(schoolId)), data: { ...data, createdAt: now, updatedAt: now } }
  })

  // 이번 업로드에 없는 기존 문서만 지운다
  const deletes = oldRefs.filter(r => !keptIds.has(r.id))
  const stats = { updated: keptIds.size, created: writes.length - keptIds.size, deleted: deletes.length }

  // 한 배치에 들어가면 원자적으로 교체
  if (deletes.length + writes.length <= BATCH_LIMIT) {
    const batch = writeBatch(db)
    deletes.forEach(ref => batch.delete(ref))
    writes.forEach(({ ref, data }) => batch.set(ref, data))
    await batch.commit()
    return stats
  }

  // 한도를 넘으면 생성을 먼저 끝내고 기존 데이터를 지운다
  await commitInChunks(writes, (batch, { ref, data }) => batch.set(ref, data))
  await commitInChunks(deletes, (batch, ref) => batch.delete(ref))
  return stats
}

/**
 * 학생 데이터 로드 (과목 관리에서 학급 정보 확인용)
 * @param {string} schoolId
 * @returns {Promise<Array>}
 */
export async function loadStudents(schoolId) {
  const snap = await getDocs(collection(db, ...schoolPath(schoolId, COL.STUDENTS)))
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

/**
 * 학생 선택과목 한 칸의 표준 형태.
 *
 * 기존 데이터는 과목명 문자열 배열(`['확률과 통계', '생명과학I']`)이었다.
 * 2·3학년은 선택과목이 4~5개이고 과목마다 분반이 다르게 편성되므로
 * 과목 참조(subjectId)와 분반(classNo)을 함께 들고 있어야 한다.
 *
 * 읽는 쪽은 항상 이 함수를 거쳐 두 형태를 모두 받아들인다.
 *
 * @param {string|Object} entry
 * @returns {{subjectId: string, subjectName: string, classNo: string}}
 */
export function normalizeElective(entry) {
  if (typeof entry === 'string') {
    // 구형 데이터는 학기 구분이 없다. 1학기로 본다 — 2학기 편성이 다르면 다시 입력해야 한다.
    return { subjectId: '', subjectName: entry.trim(), classNo: '', semester: 1 }
  }
  return {
    subjectId: entry?.subjectId || '',
    subjectName: (entry?.subjectName || '').trim(),
    classNo: entry?.classNo == null ? '' : String(entry.classNo),
    semester: Number(entry?.semester) === 2 ? 2 : 1,
  }
}

/** 학생 문서의 electiveSubjects를 표준 형태 배열로 읽는다. */
export function readElectives(student) {
  return (student?.electiveSubjects || []).map(normalizeElective)
}

/** 화면 표시용 라벨. 예: "확률과 통계 (3반)". 학기는 칩 바깥에서 구분해 표시한다. */
export function electiveLabel(entry) {
  const e = normalizeElective(entry)
  return e.classNo ? `${e.subjectName} (${e.classNo}반)` : e.subjectName
}

/** 학기별로 나눠 읽는다. 1·2학기 선택과목 편성이 다르기 때문. */
export function readElectivesBySemester(student) {
  const all = readElectives(student)
  return { 1: all.filter(e => e.semester === 1), 2: all.filter(e => e.semester === 2) }
}
