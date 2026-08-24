/**
 * 공개 채널 둘러보기 — 내가 안 들어간 채널까지 포함해 학교의 공개 채널을 전부 읽는다.
 *
 * 사이드바 목록(memberUids array-contains me)과 **다른 쿼리**다. 그쪽은 "내 채널"이고
 * 이쪽은 "학교에 무엇이 있나"라, 조건이 겹치지 않는다.
 *
 * where('visibility','==','public')은 firestore.rules의 read 조건 첫 갈래와 정확히 맞물린다
 * (데이터모델 §5에 이 화면을 위해 미리 적어 둔 쿼리다). 비공개 채널은 조건에 안 걸리므로
 * 여기에 이름조차 나오지 않는다 — 그게 비공개의 뜻이다.
 *
 * 실시간 구독을 쓰지 않는 이유: 둘러보기는 열 때 한 번 보면 되는 화면이고, 학교 전체 채널에
 * 리스너를 상시로 붙일 이유가 없다. 사이드바는 뱃지가 실시간이어야 해서 구독이지만 여기는
 * 아니다.
 */
import { useCallback, useEffect, useState } from 'react'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, schoolPath } from '@shared/lib/schema'
import { VISIBILITY } from '@shared/lib/channels'

export default function usePublicChannels(enabled = true) {
  const { schoolId } = useAuth()
  const [channels, setChannels] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    if (!schoolId) return
    setLoading(true)
    try {
      const snap = await getDocs(query(
        collection(db, ...schoolPath(schoolId, COL.CHANNELS)),
        where('visibility', '==', VISIBILITY.PUBLIC),
      ))
      setChannels(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setError(null)
    } catch (e) {
      setError(e)
    } finally {
      setLoading(false)
    }
  }, [schoolId])

  // 화면을 열 때만 읽는다. 참여한 뒤에는 호출부가 load()를 다시 불러 목록을 맞춘다 —
  // 구독이 아니라서 참여 표시가 저절로 바뀌지 않는다.
  useEffect(() => { if (enabled) load() }, [enabled, load])

  return { channels, loading, error, reload: load }
}
