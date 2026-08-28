/**
 * 캔버스 표지 템플릿 라이브러리 — 관리자가 채워 넣고 교직원 전체가 고른다
 * (coverActions.js/coverRequests.js의 "보강신청"과는 이름만 "cover"가 겹칠 뿐 무관).
 */
import { useEffect, useState } from 'react'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, schoolPath } from '@shared/lib/schema'

export default function useCoverTemplates() {
  const { schoolId } = useAuth()
  const [templates, setTemplates] = useState([])

  useEffect(() => {
    if (!schoolId) return undefined
    return onSnapshot(
      query(collection(db, ...schoolPath(schoolId, COL.COVER_TEMPLATES)), orderBy('createdAt', 'desc')),
      snap => setTemplates(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      () => {},
    )
  }, [schoolId])

  return templates
}
