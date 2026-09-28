/**
 * 업무 요청 쓰기 동작.
 *
 * 완료 표시는 두 곳에 쓴다 — 요청 문서의 completedUids(빠른 조회용)와 completions/{uid}
 * (시각·비고 상세). 둘이 어긋나면 현황 숫자와 상세가 달라지므로 항상 한 배치로 묶는다.
 */
import {
  arrayRemove, arrayUnion, deleteField, doc, serverTimestamp, updateDoc, writeBatch,
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '@shared/lib/firebase'
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
 * 미완료자에게 다시 알린다.
 *
 * 쪽지를 보내지 않는다. 학교에서 일상적인 재촉은 어차피 쿨메신저로 하고 있고, 여기서
 * 또 쪽지를 쌓으면 "메시지에 묻혀 못 본다"는 원래 문제를 그대로 재현한다.
 *
 * 대신 요청에 시각만 남긴다.
 *  - 대상 교사의 '요청받은 일' 위젯에서 해당 건이 '다시 알림'으로 강조된다
 *  - 데스크톱 앱(useDesktopNotifications.js)이 이 값의 변경을 보고 OS 알림을 띄운다
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
 * '나와의 대화' 할 일의 완료 체크(2026-09-18, 사용자 확정 — "체크 = 끝, 목록에서 내려감").
 *
 * 혼자 쓰는 할 일은 '완료'와 '마감'이 같은 뜻이라 한 번에 둘 다 바꾼다. 완료만 찍고
 * 열어 두면 '업무 진행 중'에 취소선으로 계속 남고, 마감만 하면 완료 기록이 비어 현황이
 * 어긋난다. 마감되면 useMyRequests(status == 'open')에서 빠지고 마감 알림도 멈춘다.
 * 체크를 풀면 다시 열린다.
 *
 * 완료해도 탭에서 치우지 않는다(사용자 지적, 2026-09-18 — "완료 표시 하니까 캔버스를
 * 보관해버리네, 자동으로 보관할 필요 없음"). 요청은 끝나면 isLivePost가 탭에서 빼서
 * '보관된 글'로 보내는데, 그러면 방금 체크한 할 일이 눈앞에서 사라지고 체크를 풀려면
 * 보관함까지 찾아가야 했다. archived: false는 "끝났지만 탭에 남긴다"는 기존 예외
 * 표시(channels.js isLivePost)라 새 개념 없이 그대로 쓴다. 치우고 싶으면 탭 메뉴의
 * '보관'이 그대로 있다 — 그렇게 직접 보관한 글(keepInTabs:false)은 완료해도 끌어내지 않는다.
 *
 * 규칙상 글쓴이는 요청 문서의 어느 필드든 고칠 수 있고, completions/{uid}는 본인 것이라
 * 둘 다 한 배치로 통과한다. 이 함수는 글쓴이 = 대상 = 나인 '나와의 대화'에서만 부른다.
 *
 * @param {object} p.actor { uid, name } — 할 일의 주인이자 체크하는 사람
 * @param {boolean} [p.keepInTabs] 완료해도 탭에 남길지. 사람이 직접 보관한 글이면 false
 */
export async function setSelfTaskDone({ schoolId, requestId, actor, done, keepInTabs = true }) {
  const batch = writeBatch(db)
  batch.update(requestRef(schoolId, requestId), {
    completedUids: done ? arrayUnion(actor.uid) : arrayRemove(actor.uid),
    status: done ? 'closed' : 'open',
    ...(done && keepInTabs ? { archived: false } : {}),
    updatedAt: serverTimestamp(),
  })
  const cmpRef = completionRef(schoolId, requestId, actor.uid)
  if (done) {
    batch.set(cmpRef, {
      ...newCompletionPayload({
        uid: actor.uid, name: actor.name, doneBy: 'self',
        markedByUid: actor.uid, markedByName: actor.name, note: '',
      }),
      doneAt: serverTimestamp(),
    })
  } else {
    batch.set(cmpRef, { doneAt: deleteField(), updatedAt: serverTimestamp() }, { merge: true })
  }
  await batch.commit()
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
    `${dashboardUrl}/posts/${request.id}`,
  ]
  return lines.filter(l => l !== null).join('\n')
}

/** 글 내용 수정. 대상·완료는 건드리지 않는다. */
export async function updatePostContent({ schoolId, requestId, patch }) {
  await updateDoc(requestRef(schoolId, requestId), { ...patch, updatedAt: serverTimestamp() })
}

/**
 * 글 삭제 — 하위 컬렉션과 첨부 파일까지 함께.
 *
 * 클라이언트에서 직접 지우지 않고 함수(deletePostDeep)에 맡긴다. 두 가지가 남기 때문이다.
 *
 *  1. 댓글은 글쓴이라도 남의 것을 지울 수 없다(firestore.rules). 자기 글에 달린 불편한
 *     질문을 지울 수 있으면 안 되기 때문인데, 그 탓에 글을 지워도 남의 댓글이 남는다.
 *  2. 본문에 넣었다 뺀 이미지는 클라이언트가 목록으로 들고 있지 않아 저장소에 남는다.
 *
 * 함수는 Admin SDK로 규칙을 지나고, 저장소도 파일 목록이 아니라 경로 앞자리로 지워서
 * 아무도 모르는 파일까지 걷어낸다.
 *
 * @returns {{ deletedFiles: number }}
 */
export async function deletePost({ schoolId, requestId }) {
  const call = httpsCallable(functions, 'deletePostDeep')
  const { data } = await call({ schoolId, requestId })
  return data
}
