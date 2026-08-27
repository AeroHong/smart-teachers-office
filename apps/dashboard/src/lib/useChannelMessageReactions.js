/**
 * 채널 메시지 반응(이모지 리액션) — useBlockReactions.js(캔버스 블록 반응)와 같은
 * 모양이다. 메시지별로 구독을 따로 열지 않고 채널의 messageReactions 서브컬렉션
 * 전체를 한 번에 구독한다.
 *
 * 메시지는 이미 고유 ID가 있어(캔버스 블록의 data-block-id처럼 새로 매길 게 없다)
 * 문서 ID = messageId로 바로 쓴다 — blockReactions보다 한 단계 더 단순하다.
 */
import { useCallback, useEffect, useState } from 'react'
import { arrayRemove, arrayUnion, collection, doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, schoolPath } from '@shared/lib/schema'

/** @returns {{ byMessage: object, toggle: (messageId: string, emoji: string) => void, uid: string|undefined }} */
export default function useChannelMessageReactions({ schoolId, channelId }) {
  const { user } = useAuth()
  const [byMessage, setByMessage] = useState({})

  useEffect(() => {
    if (!schoolId || !channelId) { setByMessage({}); return }
    return onSnapshot(
      collection(db, ...schoolPath(schoolId, COL.CHANNELS), channelId, COL.CHANNEL_MESSAGE_REACTIONS),
      snap => {
        const next = {}
        snap.docs.forEach(d => { next[d.id] = d.data() })
        setByMessage(next)
      },
      () => {},
    )
  }, [schoolId, channelId])

  const toggle = useCallback((messageId, emoji) => {
    if (!user?.uid || !schoolId || !channelId || !messageId) return
    const mine = (byMessage[messageId]?.[emoji] || []).includes(user.uid)
    setDoc(
      doc(db, ...schoolPath(schoolId, COL.CHANNELS), channelId, COL.CHANNEL_MESSAGE_REACTIONS, messageId),
      { [emoji]: mine ? arrayRemove(user.uid) : arrayUnion(user.uid) },
      { merge: true },
    ).catch(() => {})
  }, [byMessage, schoolId, channelId, user?.uid])

  return { byMessage, toggle, uid: user?.uid }
}
