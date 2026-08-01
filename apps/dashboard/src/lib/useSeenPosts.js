/**
 * 새 글 표시 — 어떤 안내·요청을 아직 안 봤는지.
 *
 * Slack이 쓸 만한 가장 큰 이유는 채팅이 아니라 "뭘 봐야 하는지가 항상 명확한 것"이다.
 * 안읽음이 굵게 남아 있고, 확인하면 사라진다. 우리 도메인은 그게 더 중요하다 —
 * 놓치면 마감을 놓치는 안내가 섞여 있기 때문이다.
 *
 * 글마다 읽음 문서를 만들지 않고 "마지막으로 목록을 본 시각" 하나만 저장한다.
 * 60명 × 글 수만큼 문서가 늘어나는 걸 피하려는 것이고, 실제로 필요한 판단도
 * "내가 마지막으로 본 뒤에 올라온 글인가" 하나뿐이다.
 *
 * 한계: 목록을 열면 그 시점 이전 글은 전부 본 것으로 처리된다. 개별 글의 읽음을
 * 따로 추적하지 않으므로 "이 글만 안 읽음"은 표현하지 못한다. 요청은 완료 체크가
 * 그 역할을 하므로 지금 단계에서는 이 정도로 충분하다.
 */
import { useCallback, useEffect, useState } from 'react'
import { doc, getDoc, updateDoc } from 'firebase/firestore'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { USERS } from '@shared/lib/schema'

/** @param {string} key 화면별 구분자 — 'notice' | 'request' */
export default function useSeenPosts(key) {
  const { user } = useAuth()
  const field = `lastSeen_${key}`
  const [seenAt, setSeenAt] = useState(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!user) return
    let alive = true
    getDoc(doc(db, USERS, user.uid))
      .then(snap => {
        if (!alive) return
        const v = snap.data()?.[field]
        setSeenAt(v?.toMillis?.() ?? v ?? 0)
      })
      .catch(() => { if (alive) setSeenAt(0) })
      .finally(() => { if (alive) setLoaded(true) })
    return () => { alive = false }
  }, [user, field])

  /** 지금까지를 본 것으로 표시. 화면을 떠날 때가 아니라 열었을 때 부른다. */
  const markSeen = useCallback(() => {
    if (!user) return
    // 화면에 남아 있는 '새 글' 표시가 즉시 사라지면 무엇이 새로 왔는지 못 본다.
    // 서버 값만 올리고 화면의 기준 시각(seenAt)은 그대로 둔다.
    updateDoc(doc(db, USERS, user.uid), { [field]: new Date() }).catch(() => {})
  }, [user, field])

  const isNew = useCallback((post) => {
    if (!loaded || seenAt == null) return false
    const created = post?.createdAt?.toMillis?.() ?? 0
    return created > seenAt
  }, [loaded, seenAt])

  return { isNew, markSeen, loaded }
}
