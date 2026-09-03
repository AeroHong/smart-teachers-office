import {
  collection, doc, getDoc, getDocs, addDoc, setDoc, deleteDoc, onSnapshot,
  query, where, orderBy, writeBatch, serverTimestamp, increment,
} from 'firebase/firestore'
import { db } from './firebase'
import { COL, schoolPath, currentSchoolYear } from './schema'

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

/** 과목별 보기(여러 학급을 가로질러 한 과목만 모아보기)에서 학급 하나의 항목을 가져온다. */
export async function loadItemsBySubject(schoolId, checkId, subjectName) {
  const snap = await getDocs(query(itemsCol(schoolId, checkId), where('subjectName', '==', subjectName)))
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
 * @param {number} [dictionaryVersion] 점검 시점의 사전 버전(getDictionary().version) — 이후
 * 사전이 갱신되면 이 값과 비교해 "다시 점검하라"는 경고를 보여주는 데 쓴다.
 * @returns {Promise<string>} 생성된 checkId
 */
export async function saveCheck(schoolId, meta, records, items, subjectAssignments, uid, uploadedByName, dictionaryVersion) {
  const checkRef = await addDoc(checksCol(schoolId), {
    classLabel: meta.classLabel,
    grade: meta.grade,
    uploadedByUid: uid,
    uploadedByName: uploadedByName || '',
    uploadedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    dictionaryVersion: dictionaryVersion || 0,
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

/**
 * 저장된 원문(records)에 최신 사전을 다시 적용해 items를 재생성한다 — 사전 항목이
 * 추가/수정된 뒤 기존 업로드 건을 재업로드하지 않고도 새 기준으로 다시 훑을 수 있게 한다.
 * 같은 레코드에서 같은 규칙·매칭 문자열이 다시 걸리면 기존 처리완료·메모 상태를 그대로
 * 이어받고(순서대로 매칭 — 동일 조합이 레코드 안에 여러 번 나오는 경우 대비), 더 이상
 * 걸리지 않는 항목은 삭제, 새로 걸린 항목만 미처리로 추가된다.
 *
 * items 삭제 권한(firestore.rules)이 업로더 본인·관리자로 제한돼 있어, 이 함수도 그
 * 대상만 호출하도록 호출측(UI)에서 막아야 한다 — 그 외 교사가 호출하면 delete 단계에서
 * permission-denied로 실패한다.
 *
 * @param {string} schoolId
 * @param {string} checkId
 * @param {(text:string, studentName:string)=>Array<object>} checkTextFn 레코드별 text/studentName만 받도록 감싼 setukUtils.checkText — 규칙 엔진은 portal 쪽 코드라 이 shared 레이어가 직접 import하지 않는다.
 * @param {string} name 재점검을 실행한 교사 이름(기록용)
 * @param {number} [dictionaryVersion] 이번 재점검에 실제로 적용한 사전 버전 — check 문서에
 * 갱신해 두면 "그 뒤로 사전이 또 바뀌었는지" 다음번에 다시 비교할 수 있다.
 */
export async function recheckCheck(schoolId, checkId, checkTextFn, name, dictionaryVersion) {
  const [records, oldItemsSnap] = await Promise.all([
    loadRecords(schoolId, checkId),
    getDocs(itemsCol(schoolId, checkId)),
  ])

  // (recordId, ruleId, matched) 키로 기존 항목을 큐잉해 두고, 새로 생성되는 순서대로
  // 하나씩 꺼내 이어받는다 — 같은 조합이 레코드 안에 여러 번 검출되는 경우를 대비.
  const oldByKey = {}
  oldItemsSnap.docs.forEach((d) => {
    const data = d.data()
    const key = `${data.recordId}|${data.ruleId}|${data.matched}`
    ;(oldByKey[key] ||= []).push(data)
  })

  const newItems = []
  records.forEach((r) => {
    checkTextFn(r.text, r.studentName).forEach((f) => {
      const key = `${r.id}|${f.ruleId}|${f.matched}`
      const carried = oldByKey[key]?.shift()
      newItems.push({
        recordId: r.id,
        studentNumber: r.studentNumber,
        studentName: r.studentName,
        subjectName: r.subjectName,
        ruleId: f.ruleId,
        category: f.category,
        authority: f.authority,
        severity: f.severity,
        matched: f.matched,
        index: f.index,
        length: f.length,
        message: f.message,
        before: f.before,
        after: f.after,
        resolved: carried?.resolved || false,
        resolution: carried?.resolution || null,
        resolvedByUid: carried?.resolvedByUid || null,
        resolvedByName: carried?.resolvedByName || null,
        resolvedAt: carried?.resolvedAt || null,
        note: carried?.note || '',
      })
    })
  })

  for (const chunk of chunkDocs(oldItemsSnap.docs, 400)) {
    const batch = writeBatch(db)
    chunk.forEach((d) => batch.delete(d.ref))
    await batch.commit()
  }
  for (let start = 0; start < newItems.length; start += 400) {
    const batch = writeBatch(db)
    newItems.slice(start, start + 400).forEach((it) => batch.set(doc(itemsCol(schoolId, checkId)), it))
    await batch.commit()
  }

  const statsBatch = writeBatch(db)
  statsBatch.update(checkDoc(schoolId, checkId), {
    'stats.itemCount': newItems.length,
    'stats.resolvedCount': newItems.filter((it) => it.resolved).length,
    lastRecheckAt: serverTimestamp(),
    lastRecheckByName: name || '',
    dictionaryVersion: dictionaryVersion || 0,
    updatedAt: serverTimestamp(),
  })
  await statsBatch.commit()

  return newItems.length
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
 * 처리 상태를 바꾼다. resolution은 'fixed'(실제 나이스 수정 완료) 또는
 * 'no_issue'(확인해봤지만 문제 아님 — 고유명사·도서명 속 영문 등 오탐)로 구분한다.
 * 'fixed'는 실제 세특 수정 권한자(그 과목 담당 교사)만 쓸 수 있고, 'no_issue'는 담당
 * 교사·담임(업로더)·관리자가 쓸 수 있다(firestore.rules로 서버에서도 강제).
 */
export async function updateItemResolved(schoolId, checkId, itemId, resolved, resolution, uid, name) {
  const batch = writeBatch(db)
  batch.set(doc(itemsCol(schoolId, checkId), itemId), {
    resolved,
    resolution: resolved ? resolution : null,
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

/**
 * 과목별 담당 교사를 지정한다 — 한 과목을 여러 교사가 나눠 맡는 경우가 있어(공동 수업 등)
 * 단일 교사가 아니라 배열로 받는다. teachers: [{uid, name}, ...] (빈 배열이면 미지정).
 */
export async function updateSubjectAssignment(schoolId, checkId, subjectName, teachers) {
  const list = teachers || []
  await setDoc(checkDoc(schoolId, checkId), {
    subjectAssignments: {
      [subjectName]: {
        teacherUids: list.map((t) => t.uid),
        teacherNames: list.map((t) => t.name || ''),
        source: 'manual',
      },
    },
    updatedAt: serverTimestamp(),
  }, { merge: true })
}

/**
 * 나이스 내보내기 파싱이 잘못 잘라낸 과목명을 사람이 고친다. 학생 개인의 우연한
 * 페이지 경계 문제든, 그 페이지 전체의 과목 헤더가 깨져 여러 학생이 같은 오탈자를
 * 공유하는 경우든 구분할 필요 없이, 이 점검 건 안에서 그 이름을 쓰는 records·items를
 * 전부 한 번에 고친다(oldSubjectName 문자열이 정확히 같은 것만 — 부분 일치 아님).
 *
 * records.subjectName과 items.subjectName(비정규화 사본, 과목별 필터링용) 둘 다 고쳐야
 * 화면 어디서나 새 이름으로 일관되게 보인다. 고친 이름이 이미 이 점검 건 안의 다른
 * 레코드가 쓰고 있는 이름이면(오탈자였던 과목의 "진짜" 이름) 자동으로 그 과목 밑에
 * 합쳐진다 — subjectName 문자열 일치만으로 과목별 보기·필터가 이미 동작하기 때문에
 * 별도 병합 로직이 필요 없다. subjectAssignments도 옮긴다: 오탈자였던 이름의 배정
 * 항목은 지우고, 고친 이름에 배정이 아직 없으면 업로드 때와 같은 방식으로 자동
 * 매칭을 한 번 더 시도한다 — 요청한 "수정 후 기존 과목에 자동으로 배치"가 이름만이
 * 아니라 담당 교사 배정까지 포함하는 뜻이라고 보고.
 */
export async function renameSubjectInCheck(schoolId, checkId, oldSubjectName, newSubjectName) {
  const name = String(newSubjectName || '').replace(/\s+/g, ' ').trim()
  if (!name) throw new Error('과목명을 입력하세요.')
  if (name === oldSubjectName) return

  const [recordsSnap, itemsSnap, checkSnap] = await Promise.all([
    getDocs(query(recordsCol(schoolId, checkId), where('subjectName', '==', oldSubjectName))),
    getDocs(query(itemsCol(schoolId, checkId), where('subjectName', '==', oldSubjectName))),
    getDoc(checkDoc(schoolId, checkId)),
  ])
  if (recordsSnap.empty) throw new Error('그 과목명을 쓰는 레코드를 찾을 수 없습니다.')

  const checkData = checkSnap.data() || {}
  const assignments = { ...(checkData.subjectAssignments || {}) }
  delete assignments[oldSubjectName]

  if (!assignments[name]) {
    try {
      const grade = recordsSnap.docs[0].data().grade
      const idx = await buildTeacherSubjectIndex(schoolId, currentSchoolYear())
      const candidates = idx[subjectIndexKey(grade, name)] || []
      if (candidates.length > 0) {
        assignments[name] = {
          teacherUids: candidates.map((c) => c.uid),
          teacherNames: candidates.map((c) => c.name),
          source: 'auto',
        }
      }
    } catch (e) {
      console.error('[renameSubjectInCheck] 담당교사 자동 매칭 실패(과목명만 수정):', e)
    }
  }

  for (const chunk of chunkDocs([...recordsSnap.docs, ...itemsSnap.docs], 400)) {
    const batch = writeBatch(db)
    chunk.forEach((d) => batch.update(d.ref, { subjectName: name }))
    await batch.commit()
  }
  await setDoc(checkDoc(schoolId, checkId), { subjectAssignments: assignments, updatedAt: serverTimestamp() }, { merge: true })
}

/**
 * "과목별 보기"는 여러 학급(check)을 모아 과목 단위로 보여주는 화면이라, 거기서 과목명을
 * 고칠 땐 그 이름이 정확히 어느 학급(들)에서 왔는지 화면만 봐선 알 수 없다. 넘겨받은
 * checks 목록(이미 구독 중인 전체 목록)에서 그 이름을 가진 학급을 전부 찾아
 * renameSubjectInCheck를 반복 적용한다 — 보통은 한 학급의 파싱 오류라 실제로는 1건만
 * 걸리지만, 여러 학급이 같은 오탈자를 우연히 공유해도 한 번에 고쳐진다.
 */
export async function renameSubjectAcrossChecks(schoolId, checks, oldSubjectName, newSubjectName) {
  const targets = checks.filter((c) => Object.prototype.hasOwnProperty.call(c.subjectAssignments || {}, oldSubjectName))
  if (targets.length === 0) throw new Error('그 과목명을 쓰는 학급을 찾을 수 없습니다.')
  for (const c of targets) {
    await renameSubjectInCheck(schoolId, c.id, oldSubjectName, newSubjectName)
  }
}

/**
 * 이 교사가 그 과목의 담당 교사로 배정돼 있는지 — 배열(teacherUids, 여러 교사 지원)과
 * 옛 데이터의 단일 필드(teacherUid, 이 기능이 여러 교사를 지원하기 전 형태)를 모두 본다.
 */
export function isAssignedTeacher(assign, uid) {
  if (!assign || !uid) return false
  if (Array.isArray(assign.teacherUids)) return assign.teacherUids.includes(uid)
  return assign.teacherUid === uid
}

/** 화면 표시용 담당 교사 이름 목록 — 옛 데이터(단일 teacherName)도 배열로 통일해 반환한다. */
export function assignedTeacherNames(assign) {
  if (Array.isArray(assign?.teacherNames)) return assign.teacherNames
  return assign?.teacherName ? [assign.teacherName] : []
}

/**
 * schools/{schoolId}/teacherSubjects의 이번 학년도 데이터를 모아 (학년,과목명) →
 * 교사 후보 목록 인덱스를 만든다. 한 과목을 여러 교사가 나눠 맡는 경우 후보가
 * 여럿일 수 있어 화면에서 최종 확정은 사용자가 하도록 후보 배열을 그대로 반환한다.
 */
/**
 * 학년+과목명을 인덱스 키로 정규화한다 — 나이스 내보내기가 만든 과목명과
 * teacherSubjects에 관리자가 입력해 둔 과목명이 서로 다른 출처라 띄어쓰기가 하나라도
 * 어긋나면(중복 공백, 앞뒤 공백 등) 자동 매칭이 조용히 실패한다. 표시용 이름은 그대로
 * 두고, 매칭 판단에서만 공백을 전부 지워 비교한다.
 */
export function subjectIndexKey(grade, subjectName) {
  return `${grade}_${String(subjectName || '').replace(/\s+/g, '')}`
}

export async function buildTeacherSubjectIndex(schoolId, year) {
  const snap = await getDocs(query(collection(db, ...schoolPath(schoolId, COL.TEACHER_SUBJECTS)), where('year', '==', year)))
  const index = {} // subjectIndexKey(grade, subjectName) -> [{uid, name}]
  snap.docs.forEach((d) => {
    const data = d.data()
    const allSubjects = [...(data.semester1Subjects || []), ...(data.semester2Subjects || [])]
    allSubjects.forEach((s) => {
      if (!s.subjectName || !s.grade) return
      const key = subjectIndexKey(s.grade, s.subjectName)
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

/**
 * 점검 기준 문서를 실시간으로 구독한다 — 관리자가 화면을 보는 동안 기준을 바꾸면
 * "다시 점검하라" 경고가 그 자리에서 뜨게 하는 데 쓴다.
 */
export function subscribeDictionary(schoolId, cb, onError) {
  return onSnapshot(dictionaryDoc(schoolId), (snap) => cb(snap.exists() ? snap.data() : null), onError)
}

/**
 * groups: setukUtils.js의 loadDictionary()가 반환하는 형태 그대로 저장한다(완전 대체).
 * 저장할 때마다 version을 1씩 올려서, 이미 점검을 끝낸 건이 그 뒤에 바뀐 기준을 놓치지
 * 않고 "다시 점검하라" 경고를 띄울 수 있게 한다(각 점검 건은 saveCheck/recheckCheck 시점의
 * version을 자기 문서에 함께 기록해 둔다).
 */
export async function saveDictionary(schoolId, groups, uid, name) {
  await setDoc(dictionaryDoc(schoolId), {
    groups, updatedByUid: uid, updatedByName: name || '', updatedAt: serverTimestamp(), version: increment(1),
  }, { merge: true })
}
