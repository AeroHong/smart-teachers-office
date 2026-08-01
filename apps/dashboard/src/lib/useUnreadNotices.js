/**
 * 안읽은 쪽지 개수.
 *
 * 쪽지가 위젯에서 전용 탭으로 옮겨가면서, 화면을 열지 않으면 새 쪽지가 온 걸 알 수 없게
 * 됐다. 레일 배지로 알리기 위해 개수만 따로 구독한다.
 */
import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, schoolPath } from '@shared/lib/schema'

export default function useUnreadNotices() {
  const { user, schoolId } = useAuth()
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!schoolId || !user) return
    // readAt == null 로 좁혀 읽으면 인덱스가 하나 더 필요해, 받은 쪽지를 받아 세는 편이 싸다
    return onSnapshot(
      query(
        collection(db, ...schoolPath(schoolId, COL.PERSONAL_NOTICES)),
        where('recipientUid', '==', user.uid),
      ),
      snap => setCount(snap.docs.filter(d => !d.data().readAt).length),
      () => setCount(0),
    )
  }, [schoolId, user])

  return count
}
