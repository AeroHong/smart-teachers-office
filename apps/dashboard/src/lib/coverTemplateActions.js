/**
 * 캔버스 표지 템플릿 라이브러리 — Firestore/Storage 쓰기.
 * (coverActions.js의 "보강신청"과는 이름만 "cover"가 겹칠 뿐 무관한 기능.)
 */
import { collection, deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '@shared/lib/firebase'
import { COL, schoolPath } from '@shared/lib/schema'
import { deleteAttachment, uploadAttachment } from '@shared/lib/requestAttachments'

function templateCollection(schoolId) {
  return collection(db, ...schoolPath(schoolId, COL.COVER_TEMPLATES))
}

/** 관리자가 새 템플릿을 올린다. 반환값(url·path)을 그대로 "지금 표지로 적용"에 쓴다. */
export async function addCoverTemplate({ schoolId, uid, file }) {
  const ref = doc(templateCollection(schoolId))
  const uploaded = await uploadAttachment({ schoolId, docId: ref.id, folder: 'coverTemplates', file })
  await setDoc(ref, {
    url: uploaded.url,
    path: uploaded.path,
    createdAt: serverTimestamp(),
    createdBy: uid,
  })
  return uploaded
}

/**
 * 관리자가 템플릿을 지운다. 이미 이 이미지를 표지로 쓰고 있는 다른 캔버스가 있으면
 * 그 표지 링크는 깨진다 — 첨부파일 복제 때(duplicatePost)와 같은 원칙으로, 참조
 * 추적·보존은 이번 범위에서 하지 않는다.
 */
export async function deleteCoverTemplate({ schoolId, template }) {
  await deleteAttachment({ path: template.path })
  await deleteDoc(doc(db, ...schoolPath(schoolId, COL.COVER_TEMPLATES), template.id))
}
