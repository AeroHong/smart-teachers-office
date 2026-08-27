/**
 * 스레드(답장) — 한 메시지에 달린 답장만 구독·전송한다.
 *
 * useChannelMessages.js와 별개 훅이다. 그쪽 send()는 늘 최상위 메시지만 보내는 자리라
 * parentMessageId를 받을 이유가 없고, 이쪽은 반대로 늘 답장만 다룬다 — 섞으면 두 자리
 * 모두 "이번엔 어느 쪽이지"를 매번 따져야 한다.
 *
 * 답장도 같은 messages 컬렉션의 평범한 문서다(channelMessages.js의 newMessagePayload
 * 주석 참고) — 그래서 멘션 알림·검색이 이 훅과 무관하게 이미 답장까지 처리한다.
 * 이 훅이 새로 하는 일은 딱 하나, "이 부모에 달린 것만" 걸러 보여주는 것뿐이다.
 */
import { useCallback, useEffect, useState } from 'react'
import {
  collection, doc, increment, onSnapshot, orderBy, query, serverTimestamp, where, writeBatch,
} from 'firebase/firestore'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, schoolPath } from '@shared/lib/schema'
import { newMessagePayload } from '@shared/lib/channelMessages'

export default function useThreadMessages(channelId, parentMessageId) {
  const { user, userName, schoolId } = useAuth()
  const [parent, setParent] = useState(null)
  const [replies, setReplies] = useState([])
  const [loading, setLoading] = useState(true)

  // 부모 메시지 자체도 살아있게 구독한다 — 패널이 열려 있는 동안 원본이 편집·삭제될
  // 수 있어서(더보기 메뉴가 그 두 가지를 다 허용한다), 한 번만 읽고 끝내면 패널이
  // 낡은 내용을 계속 보여준다.
  useEffect(() => {
    if (!schoolId || !channelId || !parentMessageId) { setParent(null); return undefined }
    return onSnapshot(
      doc(db, ...schoolPath(schoolId, COL.CHANNELS), channelId, COL.CHANNEL_MESSAGES, parentMessageId),
      snap => setParent(snap.exists() ? { id: snap.id, ...snap.data() } : null),
      () => setParent(null),
    )
  }, [schoolId, channelId, parentMessageId])

  useEffect(() => {
    if (!schoolId || !channelId || !parentMessageId) {
      setReplies([])
      setLoading(false)
      return undefined
    }
    setLoading(true)
    return onSnapshot(
      query(
        collection(db, ...schoolPath(schoolId, COL.CHANNELS, channelId, COL.CHANNEL_MESSAGES)),
        where('parentMessageId', '==', parentMessageId),
        orderBy('createdAt', 'asc'),
      ),
      snap => {
        setReplies(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        setLoading(false)
      },
      () => setLoading(false),
    )
  }, [schoolId, channelId, parentMessageId])

  /**
   * 답장 하나를 보내고, 같은 배치로 원본 메시지의 집계 필드(replyCount·lastReplyAt)와
   * 채널의 lastMessageAt을 함께 올린다. 두 번째 읽음 체계를 새로 안 만들기로 한
   * 설계라서(PLAN_channels_datamodel.md의 "두 겹" 우려 대응) 사이드바 안읽음 점은
   * 여기서도 그대로 lastMessageAt 하나로 켜진다.
   */
  const sendReply = useCallback(async ({ body, bodyHtml }) => {
    if (!schoolId || !channelId || !user || !parentMessageId) return
    const channelRef = doc(db, ...schoolPath(schoolId, COL.CHANNELS), channelId)
    const parentRef = doc(channelRef, COL.CHANNEL_MESSAGES, parentMessageId)
    const replyRef = doc(collection(channelRef, COL.CHANNEL_MESSAGES))

    const batch = writeBatch(db)
    batch.set(replyRef, {
      ...newMessagePayload({ authorUid: user.uid, authorName: userName, body, bodyHtml, parentMessageId }),
      createdAt: serverTimestamp(),
    })
    batch.update(parentRef, { replyCount: increment(1), lastReplyAt: serverTimestamp() })
    batch.update(channelRef, { lastMessageAt: serverTimestamp() })
    await batch.commit()
  }, [schoolId, channelId, user, userName, parentMessageId])

  return { parent, replies, loading, sendReply }
}
