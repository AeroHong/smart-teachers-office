/**
 * 캔버스 블록 반응(이모지 리액션) — CanvasEditor(쓰는 사람)와 PostDetail(읽는 사람) 둘 다
 * 이 훅 하나를 쓴다. 구독을 컴포넌트마다 따로 두지 않고 여기 하나로 모아, 블록별로
 * onSnapshot을 여러 개 여는 대신 requests/{id}/blockReactions 전체를 한 번에 구독한다.
 */
import { useCallback, useEffect, useState } from 'react'
import { arrayRemove, arrayUnion, collection, doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, schoolPath } from '@shared/lib/schema'

/** @returns {{ byBlock: object, toggle: (blockId: string, emoji: string) => void, uid: string|undefined }} */
export default function useBlockReactions({ schoolId, requestId }) {
  const { user } = useAuth()
  const [byBlock, setByBlock] = useState({})

  useEffect(() => {
    if (!schoolId || !requestId) { setByBlock({}); return }
    return onSnapshot(
      collection(db, ...schoolPath(schoolId, COL.REQUESTS), requestId, COL.REQUEST_BLOCK_REACTIONS),
      snap => {
        const next = {}
        snap.docs.forEach(d => { next[d.id] = d.data() })
        setByBlock(next)
      },
      () => {},
    )
  }, [schoolId, requestId])

  const toggle = useCallback((blockId, emoji) => {
    if (!user?.uid || !schoolId || !requestId || !blockId) return
    const mine = (byBlock[blockId]?.[emoji] || []).includes(user.uid)
    setDoc(
      doc(db, ...schoolPath(schoolId, COL.REQUESTS), requestId, COL.REQUEST_BLOCK_REACTIONS, blockId),
      { [emoji]: mine ? arrayRemove(user.uid) : arrayUnion(user.uid) },
      { merge: true },
    ).catch(() => {})
  }, [byBlock, schoolId, requestId, user?.uid])

  return { byBlock, toggle, uid: user?.uid }
}
