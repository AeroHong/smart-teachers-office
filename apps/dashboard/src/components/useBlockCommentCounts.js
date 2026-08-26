/**
 * 블록마다 댓글이 몇 개 달렸는지 — CanvasEditor(쓰는 사람)·PostDetail(읽는 사람) 둘 다
 * "이미 댓글 달린 블록"에만 댓글 아이콘을 늘 띄우는 데 쓴다(useBlockReactions와 같은
 * 이유·같은 자리 — 모든 블록마다 아이콘을 늘 띄우면 산만해진다).
 *
 * 글 전체 댓글(blockId=null)은 세지 않는다 — 이 카운트는 블록 옆에 뜨는 표시용이다.
 */
import { useEffect, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '@shared/lib/firebase'
import { COL, schoolPath } from '@shared/lib/schema'

export default function useBlockCommentCounts({ schoolId, requestId }) {
  const [countsByBlock, setCountsByBlock] = useState({})

  useEffect(() => {
    if (!schoolId || !requestId) { setCountsByBlock({}); return }
    return onSnapshot(
      collection(db, ...schoolPath(schoolId, COL.REQUESTS), requestId, COL.REQUEST_COMMENTS),
      snap => {
        const next = {}
        snap.docs.forEach(d => {
          const blockId = d.data().blockId
          if (blockId) next[blockId] = (next[blockId] || 0) + 1
        })
        setCountsByBlock(next)
      },
      () => {},
    )
  }, [schoolId, requestId])

  return countsByBlock
}
