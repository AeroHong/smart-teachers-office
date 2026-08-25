/**
 * 나에게 온, 아직 진행 중인 요청.
 *
 * useHomeFeed.js에서 분리했다(2026-08-25, 홈 재구성). 그 훅은 요청·안내·학사일정 셋을
 * 한 번에 구독했는데, 안내(전체 공지) 크로스채널 목록은 "모든 글이 채널을 갖는다"(P3-A)
 * 이후로는 각 채널을 열어보면 되는 것이라 더 이상 홈 화면이 따로 모아 보여줄 이유가
 * 없어졌다. 학사일정은 자기 화면(useAcademicCalendar.js)을 가지므로 여기서도 뺐다.
 * 이 훅에는 이제 "내 활동"(요청)만 남는다.
 */
import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, schoolPath } from '@shared/lib/schema'
import { sortByUrgency } from '@shared/lib/workRequests'

export default function useMyRequests() {
  const { user, schoolId } = useAuth()
  const [requests, setRequests] = useState([])

  useEffect(() => {
    if (!schoolId || !user) return undefined
    return onSnapshot(
      query(
        collection(db, ...schoolPath(schoolId, COL.REQUESTS)),
        where('targetUids', 'array-contains', user.uid),
        where('kind', '==', 'request'),
        where('status', '==', 'open'),
      ),
      snap => setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      () => {},
    )
  }, [schoolId, user])

  return sortByUrgency(requests)
}
