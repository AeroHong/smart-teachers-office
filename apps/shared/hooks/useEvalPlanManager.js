import { useEffect, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@shared/lib/firebase'

/**
 * 평가 운영 계획 "업무 담당자"(schools/{schoolId}/evaluationPlanManagers/{uid}) 지정 여부.
 *
 * 전체 현황(EvalPlanManagerDashboard) 열람 권한과 개별 제출물 수정 권한(EvalPlanDetail/Edit)이
 * 이 지정 하나를 공유한다 — 전체 현황에서 오류를 발견해도 고칠 수 없으면 업무상 의미가
 * 없기 때문(2026-09-11 긴급 요청으로 수정 권한도 함께 열었다). firestore.rules의
 * isEvaluationPlanManager()와 대응.
 */
export function useIsEvalPlanManager(schoolId, uid) {
  const [isManager, setIsManager] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!schoolId || !uid) return
    setLoaded(false)
    getDoc(doc(db, 'schools', schoolId, 'evaluationPlanManagers', uid))
      .then((snap) => setIsManager(snap.exists()))
      .catch(() => setIsManager(false))
      .finally(() => setLoaded(true))
  }, [schoolId, uid])

  return { isManager, loaded }
}
