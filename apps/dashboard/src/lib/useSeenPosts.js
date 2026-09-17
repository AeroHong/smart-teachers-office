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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

  /**
   * 지금까지를 본 것으로 표시. 화면을 떠날 때가 아니라 열었을 때 부른다.
   *
   * 화면을 한 번 여는 동안 한 번만 쓴다. 이 쓰기는 users/{uid}로 가는데 그 문서를
   * useChannelPrefs가 구독하고 있어서, 쓸 때마다 스냅샷이 돌아와 화면이 다시 그려진다.
   * 호출부가 그 리렌더마다 markSeen을 또 부르면 쓰기→스냅샷→리렌더→쓰기가 끝없이
   * 돈다 — 실제로 그렇게 돌아 하루 읽기 2,755만·쓰기 136만이 나갔다(2026-09-17).
   * 기록의 의미상으로도 "목록을 열었다" 한 번이면 충분하므로 여기서 잠근다.
   */
  const wroteRef = useRef(false)
  useEffect(() => { wroteRef.current = false }, [user, field])

  const markSeen = useCallback(() => {
    if (!user || wroteRef.current) return
    wroteRef.current = true
    // 화면에 남아 있는 '새 글' 표시가 즉시 사라지면 무엇이 새로 왔는지 못 본다.
    // 서버 값만 올리고 화면의 기준 시각(seenAt)은 그대로 둔다.
    updateDoc(doc(db, USERS, user.uid), { [field]: new Date() }).catch(() => {})
  }, [user, field])

  const isNew = useCallback((post) => {
    if (!loaded || seenAt == null) return false
    const created = post?.createdAt?.toMillis?.() ?? 0
    return created > seenAt
  }, [loaded, seenAt])

  // 객체를 매 렌더 새로 만들면, 이걸 통째로 의존성 배열에 넣은 호출부의 useEffect가
  // 렌더마다 다시 돈다(Activity.jsx가 그랬다). 참조를 고정해 그 경로를 막는다.
  return useMemo(() => ({ isNew, markSeen, loaded }), [isNew, markSeen, loaded])
}
