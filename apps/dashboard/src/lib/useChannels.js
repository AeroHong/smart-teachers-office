/**
 * 내가 속한 채널과 각 채널의 글을 함께 읽는다.
 *
 * 채널 목록과 글을 따로 읽으면 사이드바 뱃지("진행 중 3, 마감 지남 1")를 채널을 열기
 * 전에는 못 채운다. 그런데 그 뱃지가 채널을 열어볼지 말지를 정하는 정보라 목록과 같이
 * 와야 한다. 학교 규모(교직원 60명, 글 수백 건)에서는 학교 전체 글을 한 번 구독해도
 * 부담이 없어서, 글을 통째로 받아 채널별로 나눈다.
 *
 * 실시간 구독인 이유: 누가 완료 체크를 하면 뱃지가 줄어야 한다. 새로고침해야 바뀌면
 * "했는데 왜 그대로냐"는 말이 나온다.
 */
import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, schoolPath } from '@shared/lib/schema'
import { channelStats, sortChannels } from '@shared/lib/channels'

export default function useChannels() {
  const { user, schoolId } = useAuth()
  const [raw, setRaw] = useState([])
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!schoolId || !user) return
    setLoading(true)

    // 보관한 채널은 목록에서 뺀다. archived까지 조건에 넣으면 복합 색인이 하나 더
    // 필요한데, 채널 수가 수십 개라 클라이언트에서 거르는 편이 싸다.
    const unsubChannels = onSnapshot(
      query(
        collection(db, ...schoolPath(schoolId, COL.CHANNELS)),
        where('memberUids', 'array-contains', user.uid),
      ),
      snap => {
        setRaw(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        setLoading(false)
      },
      e => { setError(e); setLoading(false) },
    )

    const unsubPosts = onSnapshot(
      query(collection(db, ...schoolPath(schoolId, COL.REQUESTS))),
      snap => setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      e => setError(e),
    )

    return () => { unsubChannels(); unsubPosts() }
  }, [schoolId, user])

  const channels = useMemo(() => {
    const byChannel = new Map()
    posts.forEach(p => {
      if (!p.channelId) return
      if (!byChannel.has(p.channelId)) byChannel.set(p.channelId, [])
      byChannel.get(p.channelId).push(p)
    })
    return sortChannels(
      raw
        .filter(c => !c.archived)
        .map(c => {
          const own = byChannel.get(c.id) || []
          return { ...c, posts: own, stats: channelStats(own) }
        }),
    )
  }, [raw, posts])

  return { channels, loading, error }
}
