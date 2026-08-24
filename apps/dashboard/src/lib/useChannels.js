/**
 * 내가 속한 채널과 각 채널의 글을 함께 읽는다.
 *
 * 채널 목록과 글을 따로 읽으면 사이드바 뱃지("진행 중 3, 마감 지남 1")를 채널을 열기
 * 전에는 못 채운다. 그런데 그 뱃지가 채널을 열어볼지 말지를 정하는 정보라 목록과 같이
 * 와야 한다.
 *
 * ── 글을 두 갈래로 나눠 구독하는 이유 (2026-08-24, 비공개 채널) ──
 *
 * 예전에는 학교 전체 글을 조건 없이 한 번에 구독했다. 비공개 채널이 생기면서 그 쿼리가
 * 통째로 못 쓰게 됐다 — **Firestore 규칙은 필터가 아니다.** 읽을 수 없는 문서를 돌려줄
 * 가능성이 있으면 결과를 걸러 주는 게 아니라 쿼리 전체가 permission-denied로 실패한다.
 *
 * 그래서 규칙의 두 조건에 각각 대응하는 리스너를 두고 합집합을 쓴다. 각 쿼리는 규칙과
 * 정확히 맞물려 안전성이 증명된다. CommandPalette가 이미 같은 방식(두 쿼리 병합)을 쓴다.
 *
 * 두 결과를 한 배열에 합쳐두지 않고 따로 들고 있다가 마지막에 합치는 이유: 각 리스너는
 * 자기 쿼리 결과에 대해서만 권위가 있다. 하나의 Map에 계속 덧쓰면 글이 지워지거나
 * 비공개로 바뀌어 쿼리에서 빠졌을 때 화면에서 사라지지 않는다.
 *
 * 실시간 구독인 이유: 누가 완료 체크를 하면 뱃지가 줄어야 한다. 새로고침해야 바뀌면
 * "했는데 왜 그대로냐"는 말이 나온다.
 */
import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, schoolPath } from '@shared/lib/schema'
import { channelStats, hasLeft, sortChannels } from '@shared/lib/channels'

export default function useChannels() {
  const { user, schoolId } = useAuth()
  const [raw, setRaw] = useState([])
  const [schoolPosts, setSchoolPosts] = useState([])    // 학교 전체 공개 글
  const [memberPosts, setMemberPosts] = useState([])    // 비공개 채널 글 중 내가 볼 수 있는 것
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!schoolId || !user) return
    setLoading(true)

    // 보관·나간 채널까지 여기서 다 받아온다. archived나 leftUids를 쿼리 조건에 넣으면
    // 복합 색인이 늘어나는 데다, 보관함과 '나간 채널'을 열어보려면 어차피 그 문서들이
    // 필요하다. 채널 수가 수십 개라 통째로 받아 클라이언트에서 나누는 편이 싸다.
    //
    // 나간 사람도 memberUids에는 남아 있어서 이 쿼리에 계속 걸린다. 그래야 본인이
    // '다시 참여'를 누를 자리가 남는다 — 쿼리에서 사라지면 되돌아올 길이 없어진다.
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

    const posts = collection(db, ...schoolPath(schoolId, COL.REQUESTS))
    const toDocs = snap => snap.docs.map(d => ({ id: d.id, ...d.data() }))

    // firestore.rules의 requests read 조건 두 갈래와 하나씩 짝을 이룬다.
    // 조건을 고칠 때는 여기 쿼리도 함께 고쳐야 한다 — 어긋나면 쿼리가 통째로 거부된다.
    const unsubSchool = onSnapshot(
      query(posts, where('visibility', '==', 'school')),
      snap => setSchoolPosts(toDocs(snap)),
      e => setError(e),
    )
    const unsubMember = onSnapshot(
      query(posts, where('visibleUids', 'array-contains', user.uid)),
      snap => setMemberPosts(toDocs(snap)),
      e => setError(e),
    )

    return () => { unsubChannels(); unsubSchool(); unsubMember() }
  }, [schoolId, user])

  // 합집합. 한쪽에서 빠진 글이 다른 쪽에 남아 있지 않도록 매번 새로 만든다.
  const posts = useMemo(() => {
    const byId = new Map()
    schoolPosts.forEach(p => byId.set(p.id, p))
    memberPosts.forEach(p => byId.set(p.id, p))
    return [...byId.values()]
  }, [schoolPosts, memberPosts])

  /**
   * 세 갈래로 나눈다 — 보고 있는 채널, 보관한 채널, 내가 나간 채널.
   *
   * 보관을 나가기보다 먼저 본다. 둘 다 해당하면 한쪽에만 놓아야 목록에 두 번 뜨지 않는데,
   * 보관은 채널 전체에 일어난 일이고 나가기는 나 혼자의 일이라 보관 쪽이 더 큰 사실이다.
   */
  const groups = useMemo(() => {
    const byChannel = new Map()
    posts.forEach(p => {
      if (!p.channelId) return
      if (!byChannel.has(p.channelId)) byChannel.set(p.channelId, [])
      byChannel.get(p.channelId).push(p)
    })

    const all = raw.map(c => {
      const own = byChannel.get(c.id) || []
      return { ...c, posts: own, stats: channelStats(own) }
    })
    const left = c => hasLeft(c, user?.uid)

    return {
      channels: sortChannels(all.filter(c => !c.archived && !left(c))),
      archivedChannels: sortChannels(all.filter(c => c.archived)),
      leftChannels: sortChannels(all.filter(c => !c.archived && left(c))),
    }
  }, [raw, posts, user])

  return { ...groups, loading, error }
}
