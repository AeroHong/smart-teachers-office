/**
 * 채널 쓰기 동작.
 *
 * 동작마다 건드리는 필드를 최소로 묶어둔다. 채널 문서 하나에 "만든 사람만 할 수 있는 일"
 * (보관·참여자 갱신)과 "본인만 할 수 있는 일"(나가기)이 같이 있어서, 한 번의 쓰기가
 * 여러 필드를 뭉뚱그리면 규칙에서 둘을 갈라낼 수 없다. 나가기가 updatedAt 말고는
 * leftUids만 건드리는 것이 그래서 중요하다 — 요청의 완료 토글과 같은 모양이다.
 */
import { arrayRemove, arrayUnion, doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '@shared/lib/firebase'
import { COL, schoolPath } from '@shared/lib/schema'

function channelRef(schoolId, channelId) {
  return doc(db, ...schoolPath(schoolId, COL.CHANNELS), channelId)
}

/**
 * 보관 / 보관 해제.
 *
 * 글은 그대로 두고 목록에서만 접는다. 지우는 동작을 따로 두지 않은 이유는, 끝난 업무의
 * 채널을 정리하려는 사람에게 삭제와 보관이 나란히 보이면 되돌릴 수 없는 쪽을 누를
 * 이유가 생기기 때문이다.
 */
export async function setChannelArchived({ schoolId, channelId, archived }) {
  await updateDoc(channelRef(schoolId, channelId), {
    archived,
    updatedAt: serverTimestamp(),
  })
}

/**
 * 나가기 / 다시 참여.
 *
 * arrayUnion·arrayRemove를 쓰는 이유는 두 사람이 동시에 나가도 서로의 기록을 덮어쓰지
 * 않기 위해서다. 읽어서 배열을 통째로 다시 쓰면 늦게 저장한 쪽이 앞사람을 지운다.
 */
export async function setChannelLeft({ schoolId, channelId, uid, left }) {
  await updateDoc(channelRef(schoolId, channelId), {
    leftUids: left ? arrayUnion(uid) : arrayRemove(uid),
    updatedAt: serverTimestamp(),
  })
}

/**
 * 조건을 다시 푼 결과로 참여자 명단을 갈아끼운다. 만든 사람이 확인하고 누를 때만 실행된다.
 *
 * leftUids는 손대지 않는다. 나간 사람을 여기서 정리하면 조건이 그 사람을 다시 데려오는
 * 순간 본인이 밝힌 뜻이 조용히 뒤집힌다.
 * memberRuleText도 그대로 둔다 — 바뀐 것은 조건이 아니라 조건이 가리키는 사람들이다.
 */
export async function refreshChannelMembers({ schoolId, channelId, memberUids }) {
  await updateDoc(channelRef(schoolId, channelId), {
    memberUids,
    updatedAt: serverTimestamp(),
  })
}
