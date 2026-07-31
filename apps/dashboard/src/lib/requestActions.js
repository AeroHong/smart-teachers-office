/**
 * 업무 요청 쓰기 동작.
 *
 * 완료 표시는 두 곳에 쓴다 — 요청 문서의 completedUids(빠른 조회용)와 completions/{uid}
 * (시각·비고 상세). 둘이 어긋나면 현황 숫자와 상세가 달라지므로 항상 한 배치로 묶는다.
 */
import {
  arrayRemove, arrayUnion, deleteField, doc,
  serverTimestamp, updateDoc, writeBatch,
} from 'firebase/firestore'
import { db } from '@shared/lib/firebase'
import { COL, schoolPath } from '@shared/lib/schema'
import { newCompletionPayload } from '@shared/lib/workRequests'

function requestRef(schoolId, requestId) {
  return doc(db, ...schoolPath(schoolId, COL.REQUESTS), requestId)
}

function completionRef(schoolId, requestId, uid) {
  return doc(db, ...schoolPath(schoolId, COL.REQUESTS), requestId, COL.REQUEST_COMPLETIONS, uid)
}

/**
 * 완료 표시를 켜고 끈다.
 *
 * @param {object} p
 * @param {'self'|'manager'} p.doneBy 본인이 체크했는지, 담당자가 대신 체크했는지
 * @param {object} p.actor { uid, name } 실제로 버튼을 누른 사람
 * @param {object} p.member { uid, name } 완료로 표시되는 대상
 */
export async function setCompletion({ schoolId, requestId, member, actor, done, doneBy = 'self', note = '' }) {
  const batch = writeBatch(db)
  const reqRef = requestRef(schoolId, requestId)
  const cmpRef = completionRef(schoolId, requestId, member.uid)

  // 규칙이 completedUids/updatedAt 외의 필드 변경을 막으므로 이 두 개만 건드린다
  batch.update(reqRef, {
    completedUids: done ? arrayUnion(member.uid) : arrayRemove(member.uid),
    updatedAt: serverTimestamp(),
  })

  if (done) {
    batch.set(cmpRef, {
      ...newCompletionPayload({
        uid: member.uid,
        name: member.name,
        doneBy,
        markedByUid: actor.uid,
        markedByName: actor.name,
        note,
      }),
      doneAt: serverTimestamp(),
    })
  } else {
    // 취소는 문서를 지우지 않고 시각만 비운다 — 언제 취소됐는지 흔적이 남는 편이 낫다
    batch.set(cmpRef, { doneAt: deleteField(), updatedAt: serverTimestamp() }, { merge: true })
  }

  await batch.commit()
}

/** 담당자가 여러 명을 한 번에 체크 — 나이스에서 대조한 뒤 채워 넣는 경우. */
export async function setCompletionsBulk({ schoolId, requestId, members, actor, done }) {
  const batch = writeBatch(db)
  const reqRef = requestRef(schoolId, requestId)

  batch.update(reqRef, {
    completedUids: done ? arrayUnion(...members.map(m => m.uid)) : arrayRemove(...members.map(m => m.uid)),
    updatedAt: serverTimestamp(),
  })

  members.forEach(member => {
    const cmpRef = completionRef(schoolId, requestId, member.uid)
    if (done) {
      batch.set(cmpRef, {
        ...newCompletionPayload({
          uid: member.uid, name: member.name, doneBy: 'manager',
          markedByUid: actor.uid, markedByName: actor.name,
        }),
        doneAt: serverTimestamp(),
      })
    } else {
      batch.set(cmpRef, { doneAt: deleteField(), updatedAt: serverTimestamp() }, { merge: true })
    }
  })

  await batch.commit()
}

/**
 * 미완료자에게 독촉을 건다.
 *
 * 쪽지를 보내지 않는다. 학교에서 일상적인 독촉은 어차피 쿨메신저로 하고 있고, 여기서
 * 또 쪽지를 쌓으면 "메시지에 묻혀 못 본다"는 원래 문제를 그대로 재현한다.
 *
 * 대신 요청에 독촉 시각만 남긴다.
 *  - 지금: 대상 교사의 '요청받은 일' 위젯에서 해당 건이 독촉 표시로 강조된다
 *  - 나중(Electron): 상주 프로그램이 이 값을 보고 우측 하단 알림을 띄우고,
 *    알림을 누르면 할 일 목록으로 데려간다
 *
 * 완료한 사람은 애초에 강조 대상이 아니므로(미완료 여부로 판정) 다 한 사람을 다시
 * 귀찮게 하는 일이 없다.
 */
export async function remindPending({ schoolId, requestId }) {
  await updateDoc(requestRef(schoolId, requestId), {
    remindedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

/** 조건으로 대상을 다시 계산해 명단을 갈아끼운다. 담당자가 명시적으로 누를 때만 실행된다. */
export async function recalculateTargets({ schoolId, requestId, targets }) {
  await updateDoc(requestRef(schoolId, requestId), {
    targetUids: targets.map(t => t.uid),
    targetNames: targets.map(t => t.name),
    updatedAt: serverTimestamp(),
  })
}

export async function setRequestStatus({ schoolId, requestId, status }) {
  await updateDoc(requestRef(schoolId, requestId), { status, updatedAt: serverTimestamp() })
}

/**
 * 쿨메신저에 붙여넣을 문구.
 *
 * 도입 초기에는 쿨메신저와 병행할 수밖에 없다. 담당자는 지금처럼 쿨메신저로 뿌리되
 * 이 문구에 링크가 들어 있어, 받는 사람은 링크를 눌러 완료만 누르면 된다.
 */
export function buildShareText(request, dashboardUrl) {
  const due = request.dueDate?.toDate?.()
  const lines = [
    `[${request.title}]`,
    due ? `마감: ${due.getFullYear()}년 ${due.getMonth() + 1}월 ${due.getDate()}일` : null,
    request.description || null,
    '',
    `아래에서 자료를 받고 완료를 체크해 주세요.`,
    `${dashboardUrl}/requests/${request.id}`,
  ]
  return lines.filter(l => l !== null).join('\n')
}
