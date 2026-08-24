/**
 * 채널 쓰기 동작.
 *
 * 동작마다 건드리는 필드를 최소로 묶어둔다. 채널 문서 하나에 "만든 사람만 할 수 있는 일"
 * (보관·참여자 갱신)과 "본인만 할 수 있는 일"(나가기)이 같이 있어서, 한 번의 쓰기가
 * 여러 필드를 뭉뚱그리면 규칙에서 둘을 갈라낼 수 없다. 나가기가 updatedAt 말고는
 * leftUids만 건드리는 것이 그래서 중요하다 — 요청의 완료 토글과 같은 모양이다.
 */
import { arrayRemove, arrayUnion, doc, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore'
import { db } from '@shared/lib/firebase'
import { COL, schoolPath } from '@shared/lib/schema'
import { postVisibilityFor } from '@shared/lib/channels'

function channelRef(schoolId, channelId) {
  return doc(db, ...schoolPath(schoolId, COL.CHANNELS), channelId)
}

function postRef(schoolId, requestId) {
  return doc(db, ...schoolPath(schoolId, COL.REQUESTS), requestId)
}

/**
 * 채널을 고치면서 그 채널 글의 열람 범위까지 한 번에 맞춘다.
 *
 * 비공개 채널의 글은 참여자 명단(visibleUids)을 복사해 들고 있다. 채널 참여자가 바뀌었는데
 * 글이 옛 명단을 들고 있으면, 빠진 사람이 계속 읽거나 새로 온 사람이 못 읽는다. 게다가
 * 화면은 어제와 똑같아서 아무도 눈치채지 못한다.
 *
 * **한 배치로 묶는 것이 핵심이다.** Firestore 배치는 전부 되거나 전부 안 된다. 채널을
 * 먼저 고치고 글을 따로 고치는 방식이면 중간에 실패했을 때 둘이 어긋난 채로 남고, 그
 * 어긋남이 곧 열람 권한이라 조용한 유출이 된다.
 *
 * Cloud Function 트리거로 미루지 않은 이유도 같다 — 트리거는 결과적 일관성이라 잠깐이지만
 * 어긋나는 창이 생긴다. 배치는 그 창이 아예 없다.
 *
 * 한계: 배치 상한이 500이라 글이 499건을 넘는 채널은 이 방식으로 한 번에 못 맞춘다.
 * 그때는 쪼개야 하고, 쪼개는 순간 원자성이 깨지므로 Cloud Function 쪽이 낫다.
 * 지금 규모(채널당 글 수십 건)에서는 걸릴 일이 없다.
 *
 * @param {object[]} posts 이 채널에 속한 글들. 화면이 이미 들고 있는 것을 넘긴다 —
 *   새 규칙에서는 channelId로 글을 직접 조회할 수 없다(그 쿼리는 규칙 조건과 맞물리지 않아
 *   통째로 거부된다).
 */
export async function updateChannelAndPosts({ schoolId, channelId, patch, channelAfter, posts = [] }) {
  const batch = writeBatch(db)
  batch.update(channelRef(schoolId, channelId), { ...patch, updatedAt: serverTimestamp() })

  const visibility = postVisibilityFor(channelAfter)
  posts.forEach((p) => {
    batch.update(postRef(schoolId, p.id), { ...visibility, updatedAt: serverTimestamp() })
  })

  await batch.commit()
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
export async function refreshChannelMembers({ schoolId, channelId, memberUids, channel, posts = [] }) {
  await updateChannelAndPosts({
    schoolId,
    channelId,
    patch: { memberUids },
    channelAfter: { ...channel, memberUids },
    posts,
  })
}
