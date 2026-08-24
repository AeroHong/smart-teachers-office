/**
 * 채널 메시지 구독·전송.
 *
 * 한 채널의 메시지만 다룬다. 채널을 가로질러 읽을 일이 없어서(사이드바 안읽음 점은
 * channels.lastMessageAt 하나로 계산한다) 열려 있는 채널만 구독하면 된다.
 *
 * ── 최근 것만 받는다 ────────────────────────────────────────
 *
 * 대화는 계속 쌓이는데 화면에 필요한 건 아래쪽 얼마간이다. 전부 받으면 오래된 채널을 열
 * 때마다 수천 건이 흐르고, 그 비용이 채널을 열어보는 것 자체를 무겁게 만든다.
 * 위로 더 올려보는 것(과거 불러오기)은 실제로 필요해질 때 붙인다.
 */
import { useCallback, useEffect, useState } from 'react'
import {
  collection, doc, limitToLast, onSnapshot, orderBy, query, serverTimestamp, writeBatch,
} from 'firebase/firestore'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, schoolPath } from '@shared/lib/schema'
import { newMessagePayload } from '@shared/lib/channelMessages'

/** 한 번에 들고 있을 메시지 수. */
const WINDOW = 200

export default function useChannelMessages(channelId) {
  const { user, userName, schoolId } = useAuth()
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!schoolId || !channelId) {
      setMessages([])
      setLoading(false)
      return undefined
    }
    setLoading(true)
    setError(null)
    return onSnapshot(
      query(
        collection(db, ...schoolPath(schoolId, COL.CHANNELS, channelId, COL.CHANNEL_MESSAGES)),
        orderBy('createdAt', 'asc'),
        limitToLast(WINDOW),
      ),
      (snap) => {
        setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        setLoading(false)
      },
      (e) => { setError(e); setLoading(false) },
    )
  }, [schoolId, channelId])

  /**
   * 메시지 하나를 보내고 채널의 "마지막 메시지 시각"을 함께 올린다.
   *
   * 한 배치로 묶는 이유: lastMessageAt이 안 올라가면 남들 사이드바에 안읽음 점이 안 뜬다.
   * 메시지는 갔는데 아무도 모르는 상태가 되고, 화면에는 아무 문제가 없어 보여서 원인을
   * 찾기 어렵다. 배치는 전부 되거나 전부 안 되므로 그 어긋남이 생기지 않는다.
   */
  const send = useCallback(async ({ body, refRequestId = null }) => {
    if (!schoolId || !channelId || !user) return
    const channelRef = doc(db, ...schoolPath(schoolId, COL.CHANNELS), channelId)
    const messageRef = doc(collection(channelRef, COL.CHANNEL_MESSAGES))

    const batch = writeBatch(db)
    batch.set(messageRef, {
      ...newMessagePayload({ authorUid: user.uid, authorName: userName, body, refRequestId }),
      createdAt: serverTimestamp(),
    })
    // 채널 문서에서 참여자가 건드릴 수 있는 키는 이것 하나뿐이다(firestore.rules).
    // updatedAt을 같이 넣으면 규칙의 hasOnly(['lastMessageAt'])에 걸려 전송이 막힌다.
    batch.update(channelRef, { lastMessageAt: serverTimestamp() })
    await batch.commit()
  }, [schoolId, channelId, user, userName])

  return { messages, loading, error, send }
}
