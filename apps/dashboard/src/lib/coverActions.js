/**
 * 보강신청 — Firestore 읽기/쓰기. 순수 로직(파싱·오픈 판정·행 검증·집계)은
 * `@shared/lib/coverRequests.js`에 있다(그쪽은 firebase.js를 안 건드려서 node --test로
 * 검증 가능, 이 파일은 그 반대).
 */
import {
  collection, doc, deleteDoc, getDocs, query, runTransaction, serverTimestamp,
  updateDoc, where, writeBatch,
} from 'firebase/firestore'
import { db } from '@shared/lib/firebase'
import { COL, schoolPath } from '@shared/lib/schema'
import { COVER_STATUS, buildCoverRowPayload, validCoverRows } from '@shared/lib/coverRequests'

function coverCollection(schoolId) {
  return collection(db, ...schoolPath(schoolId, COL.COVER_REQUESTS))
}

function coverDoc(schoolId, coverId) {
  return doc(db, ...schoolPath(schoolId, COL.COVER_REQUESTS), coverId)
}

/**
 * 신청(claim) — 트랜잭션으로 감싼다. 포털의 기존 구현(CoverMain.jsx)은 단순 updateDoc이라
 * 동시에 두 사람이 신청 버튼을 누르면 경쟁 조건이 생길 수 있다 — 여기서는 트랜잭션 안에서
 * status를 다시 읽어, 그새 마감됐으면 명시적으로 실패시킨다.
 */
export async function claimCover({ schoolId, coverId, name, email }) {
  const ref = coverDoc(schoolId, coverId)
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists()) throw new Error('보강 항목을 찾을 수 없습니다.')
    if (snap.data().status === COVER_STATUS.CLOSED) {
      throw new Error('이미 다른 선생님이 신청했습니다.')
    }
    tx.update(ref, {
      status: COVER_STATUS.CLOSED,
      coverTeacher: name,
      coverTeacherEmail: email,
      appliedAt: serverTimestamp(),
    })
  })
}

/** 신청 취소 — 취소는 본인만 누르는 동작이라 경쟁 상황이 실질적으로 없다. */
export async function cancelCover({ schoolId, coverId }) {
  await updateDoc(coverDoc(schoolId, coverId), {
    status: COVER_STATUS.OPEN,
    coverTeacher: null,
    coverTeacherEmail: null,
    appliedAt: null,
  })
}

/** 관리자 일괄 등록(스프레드시트 입력). teachersList는 보강교사 이름→이메일 매칭용. */
export async function registerCovers({ schoolId, rows, uid, teachersList = [] }) {
  const rowsToCreate = validCoverRows(rows)
  if (rowsToCreate.length === 0) {
    throw new Error('최소 한 행 이상 필수 항목(날짜, 반, 교시, 결강교사, 교과)을 입력하세요.')
  }
  const batch = writeBatch(db)
  rowsToCreate.forEach(r => {
    const ref = doc(coverCollection(schoolId))
    const payload = buildCoverRowPayload(r, teachersList)
    batch.set(ref, {
      ...payload,
      appliedAt: payload.status === COVER_STATUS.CLOSED ? serverTimestamp() : null,
      createdAt: serverTimestamp(),
      createdBy: uid,
    })
  })
  await batch.commit()
}

/** 관리자 수정 — 필드를 그대로 덮어쓴다(호출부가 바뀐 값만 골라 넘긴다). */
export async function updateCoverFields(schoolId, coverId, fields) {
  await updateDoc(coverDoc(schoolId, coverId), fields)
}

/** 관리자 삭제. */
export async function deleteCover(schoolId, coverId) {
  await deleteDoc(coverDoc(schoolId, coverId))
}

/** 이 학교 교사 목록(보강교사 선택용) — staffType==='교사'만, 이름순. */
export async function fetchTeachersList(schoolId) {
  const snap = await getDocs(query(collection(db, 'users'), where('schoolId', '==', schoolId)))
  return snap.docs
    .map(d => ({ uid: d.id, ...d.data() }))
    .filter(u => u.staffType === '교사')
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'))
}
