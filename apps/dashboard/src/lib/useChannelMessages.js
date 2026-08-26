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
   * 아직 쓰지 않은 메시지의 ID를 미리 받아둔다.
   *
   * 파일을 첨부하면 보내기 전에 이미 Storage에 올라가야 하는데(업로드 → 미리보기 →
   * 그제서야 전송), 업로드 경로가 문서 ID를 필요로 한다(uploadAttachment의 docId).
   * 저장 시점에 ID를 만들면 그 전에 올린 파일의 경로를 정할 수 없다 —
   * PostComposer.jsx가 requestId를 미리 만들어 두는 것과 같은 이유.
   */
  const newMessageId = useCallback(() => {
    if (!schoolId || !channelId) return null
    const channelRef = doc(db, ...schoolPath(schoolId, COL.CHANNELS), channelId)
    return doc(collection(channelRef, COL.CHANNEL_MESSAGES)).id
  }, [schoolId, channelId])

  /**
   * 메시지 하나를 보내고 채널의 "마지막 메시지 시각"을 함께 올린다.
   *
   * 한 배치로 묶는 이유: lastMessageAt이 안 올라가면 남들 사이드바에 안읽음 점이 안 뜬다.
   * 메시지는 갔는데 아무도 모르는 상태가 되고, 화면에는 아무 문제가 없어 보여서 원인을
   * 찾기 어렵다. 배치는 전부 되거나 전부 안 되므로 그 어긋남이 생기지 않는다.
   */
  const send = useCallback(async ({
    messageId = null, body, bodyHtml, refRequestId = null, refTitle = '', refChannelId = null,
    attachment = null,
  }) => {
    if (!schoolId || !channelId || !user) return
    const channelRef = doc(db, ...schoolPath(schoolId, COL.CHANNELS), channelId)
    // 파일을 첨부했으면 newMessageId()로 미리 받아둔 ID를 그대로 쓴다 — 업로드 경로와
    // 실제로 쓰는 문서가 같은 ID를 가리켜야 한다.
    const messageRef = messageId
      ? doc(channelRef, COL.CHANNEL_MESSAGES, messageId)
      : doc(collection(channelRef, COL.CHANNEL_MESSAGES))

    const batch = writeBatch(db)
    batch.set(messageRef, {
      // refTitle·refChannelId를 여기서 받지 않고 그냥 버리던 게 예전 버그였다 —
      // 캔버스를 메시지에 붙여도 제목이 항상 빈 채로 저장됐다(사용자 요청으로
      // + 메뉴를 다시 짜면서 발견, 2026-08-26).
      ...newMessagePayload({
        authorUid: user.uid, authorName: userName, body, bodyHtml,
        refRequestId, refTitle, refChannelId, attachment,
      }),
      createdAt: serverTimestamp(),
    })
    // 채널 문서에서 참여자가 건드릴 수 있는 키는 이것 하나뿐이다(firestore.rules).
    // updatedAt을 같이 넣으면 규칙의 hasOnly(['lastMessageAt'])에 걸려 전송이 막힌다.
    batch.update(channelRef, { lastMessageAt: serverTimestamp() })
    await batch.commit()
  }, [schoolId, channelId, user, userName])

  return { messages, loading, error, send, newMessageId }
}
