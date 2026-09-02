import {
  collection, doc, getDoc, getDocs, addDoc, setDoc, deleteDoc, onSnapshot,
  query, where, orderBy, writeBatch, serverTimestamp, increment,
} from 'firebase/firestore'
import { db } from './firebase'
import { COL, schoolPath } from './schema'

const checksCol = (schoolId) => collection(db, ...schoolPath(schoolId, COL.SETUK_CHECKS))
const checkDoc = (schoolId, checkId) => doc(db, ...schoolPath(schoolId, COL.SETUK_CHECKS), checkId)
const recordsCol = (schoolId, checkId) => collection(checkDoc(schoolId, checkId), 'records')
const itemsCol = (schoolId, checkId) => collection(checkDoc(schoolId, checkId), 'items')
const dictionaryDoc = (schoolId) => doc(db, ...schoolPath(schoolId, COL.SETUK_DICTIONARY), 'default')

export function subscribeChecks(schoolId, cb, onError) {
  const q = query(checksCol(schoolId), orderBy('uploadedAt', 'desc'))
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError)
}

export function subscribeCheck(schoolId, checkId, cb, onError) {
  return onSnapshot(checkDoc(schoolId, checkId), (snap) => cb(snap.exists() ? { id: snap.id, ...snap.data() } : null), onError)
}

export function subscribeItems(schoolId, checkId, cb, onError) {
  return onSnapshot(itemsCol(schoolId, checkId), (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError)
}

export async function loadRecords(schoolId, checkId) {
  const snap = await getDocs(recordsCol(schoolId, checkId))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

/**
 * 업로드 1건을 저장한다 — 학생×과목 원문(records)과 검출된 항목(items)을 함께
 * 일괄 기록한다. Firestore 배치는 500건 제한이 있어 넉넉히 400건 단위로 나눈다
 * (학급 하나 분량은 보통 records 200~250건 + items 수십~백여 건 정도라 배치 여러
 * 개로 나뉠 수 있음).
 *
 * @param {string} schoolId
 * @param {{classLabel:string, grade:number|null}} meta
 * @param {Array<{studentNumber,studentName,subjectName,grade,semester,text,flagCount}>} records
 * @param {Array<object>} items records와 같은 순서로 대응할 필요 없음(각자 recordIndex를 들고 있음)
 * @param {{[subjectName]: {teacherUid, teacherName, source}}} subjectAssignments
 * @param {string} uid
 * @param {string} uploadedByName
 * @returns {Promise<string>} 생성된 checkId
 */
export async function saveCheck(schoolId, meta, records, items, subjectAssignments, uid, uploadedByName) {
  const checkRef = await addDoc(checksCol(schoolId), {
    classLabel: meta.classLabel,
    grade: meta.grade,
    uploadedByUid: uid,
    uploadedByName: uploadedByName || '',
    uploadedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    stats: {
      studentCount: new Set(records.map((r) => r.studentNumber)).size,
      subjectCount: new Set(records.map((r) => r.subjectName)).size,
      itemCount: items.length,
      resolvedCount: 0,
    },
    subjectAssignments: subjectAssignments || {},
  })

  // recordId를 미리 만들어 items가 참조할 수 있게 한다.
  const recordIds = records.map(() => doc(recordsCol(schoolId, checkRef.id)).id)

  for (let batchStart = 0; batchStart < records.length; batchStart += 400) {
    const batch = writeBatch(db)
    const slice = records.slice(batchStart, batchStart + 400)
    slice.forEach((r, i) => {
      batch.set(doc(recordsCol(schoolId, checkRef.id), recordIds[batchStart + i]), r)
    })
    await batch.commit()
  }

  const itemsWithRecordId = items.map((it) => ({ ...it, recordId: recordIds[it.recordIndex] }))
  for (let batchStart = 0; batchStart < itemsWithRecordId.length; batchStart += 400) {
    const batch = writeBatch(db)
    const slice = itemsWithRecordId.slice(batchStart, batchStart + 400)
    slice.forEach((it) => {
      const { recordIndex, ...data } = it
      batch.set(doc(itemsCol(schoolId, checkRef.id)), data)
    })
    await batch.commit()
  }

  return checkRef.id
}

export async function deleteCheck(schoolId, checkId) {
  const [records, items] = await Promise.all([
    getDocs(recordsCol(schoolId, checkId)),
    getDocs(itemsCol(schoolId, checkId)),
  ])
  for (const chunk of chunkDocs([...records.docs, ...items.docs], 400)) {
    const batch = writeBatch(db)
    chunk.forEach((d) => batch.delete(d.ref))
    await batch.commit()
  }
  await deleteDoc(checkDoc(schoolId, checkId))
}

function* chunkDocs(docs, size) {
  for (let i = 0; i < docs.length; i += size) yield docs.slice(i, i + size)
}

/**
 * 메모만 저장한다 — resolved 관련 필드는 절대 건드리지 않는다. firestore.rules가
 * "resolved 관련 필드를 건드리지 않는 update는 아무 교사나 허용"으로 판단하는 기준이
 * 이 함수가 정확히 note 필드만 쓰는 것에 있으므로, resolved류 필드를 여기서 같이
 * 써버리면(값이 같아도 재기록 자체가 diff에 잡혀) 그 판단이 깨진다.
 */
export async function updateItemNote(schoolId, checkId, itemId, note) {
  await setDoc(doc(itemsCol(schoolId, checkId), itemId), { note: note || '' }, { merge: true })
}

/**
 * 처리 완료 여부를 바꾼다 — 실제 세특 수정은 그 과목 담당 교사만 나이스에서 할 수
 * 있으므로, 이 필드는 담당 교사 본인 또는 관리자만 쓸 수 있다(firestore.rules).
 */
export async function updateItemResolved(schoolId, checkId, itemId, resolved, uid, name) {
  const batch = writeBatch(db)
  batch.set(doc(itemsCol(schoolId, checkId), itemId), {
    resolved,
    resolvedByUid: resolved ? uid : null,
    resolvedByName: resolved ? (name || '') : null,
    resolvedAt: resolved ? serverTimestamp() : null,
  }, { merge: true })
  batch.update(checkDoc(schoolId, checkId), {
    'stats.resolvedCount': increment(resolved ? 1 : -1),
    updatedAt: serverTimestamp(),
  })
  await batch.commit()
}

export async function updateSubjectAssignment(schoolId, checkId, subjectName, teacherUid, teacherName) {
  await setDoc(checkDoc(schoolId, checkId), {
    subjectAssignments: { [subjectName]: { teacherUid, teacherName: teacherName || '', source: 'manual' } },
    updatedAt: serverTimestamp(),
  }, { merge: true })
}

/**
 * schools/{schoolId}/teacherSubjects의 이번 학년도 데이터를 모아 (학년,과목명) →
 * 교사 후보 목록 인덱스를 만든다. 한 과목을 여러 교사가 나눠 맡는 경우 후보가
 * 여럿일 수 있어 화면에서 최종 확정은 사용자가 하도록 후보 배열을 그대로 반환한다.
 */
export async function buildTeacherSubjectIndex(schoolId, year) {
  const snap = await getDocs(query(collection(db, ...schoolPath(schoolId, COL.TEACHER_SUBJECTS)), where('year', '==', year)))
  const index = {} // `${grade}_${subjectName}` -> [{uid, name}]
  snap.docs.forEach((d) => {
    const data = d.data()
    const allSubjects = [...(data.semester1Subjects || []), ...(data.semester2Subjects || [])]
    allSubjects.forEach((s) => {
      if (!s.subjectName || !s.grade) return
      const key = `${s.grade}_${s.subjectName}`
      if (!index[key]) index[key] = []
      if (!index[key].some((t) => t.uid === data.teacherUid)) {
        index[key].push({ uid: data.teacherUid, name: data.teacherName || '' })
      }
    })
  })
  return index
}

export async function getDictionary(schoolId) {
  const snap = await getDoc(dictionaryDoc(schoolId))
  return snap.exists() ? snap.data() : null
}

/** groups: setukUtils.js의 loadDictionary()가 반환하는 형태 그대로 저장한다(완전 대체). */
export async function saveDictionary(schoolId, groups, uid, name) {
  await setDoc(dictionaryDoc(schoolId), {
    groups, updatedByUid: uid, updatedByName: name || '', updatedAt: serverTimestamp(),
  })
}
