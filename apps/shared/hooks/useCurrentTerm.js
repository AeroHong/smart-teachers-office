import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@shared/lib/firebase'
import { SCHOOLS, currentYearSemester } from '@shared/lib/schema'

/**
 * 관리자 페이지 > 홈에서 지정한 "학년도-학기 기준"(schools/{schoolId}.currentTerm).
 * 관리자가 아직 지정하지 않았으면 오늘 날짜로 계산한 학년도·학기를 기본값으로 쓴다.
 *
 * 평가 운영 계획 제출 현황처럼 "지금 학기" 기준으로 매번 필터를 다시 고르기 번거로운
 * 화면들이 이 값을 초기 필터값으로 쓴다 — 실제 날짜와 무관하게 학교가 업무상 기준으로
 * 삼는 학기를 관리자가 직접 정할 수 있게 하기 위함(예: 2학기가 시작됐지만 아직 1학기
 * 마무리 업무가 진행 중인 기간).
 *
 * `loaded`는 Firestore에서 실제 값을 확인했는지 여부다 — 화면이 "한 번만 기본값을
 * 적용"하는 초기화 로직을 쓸 때, 학교 문서를 읽기 전의 날짜 기반 임시값으로 확정해
 * 버리면 관리자가 지정한 값이 반영되지 않는다.
 */
export function useCurrentTerm(schoolId) {
  const [term, setTerm] = useState(currentYearSemester())
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!schoolId) return
    const unsub = onSnapshot(doc(db, SCHOOLS, schoolId), (snap) => {
      const data = snap.data()
      const fallback = currentYearSemester()
      setTerm({
        year: data?.currentTerm?.year ?? fallback.year,
        semester: data?.currentTerm?.semester ?? fallback.semester,
      })
      setLoaded(true)
    })
    return unsub
  }, [schoolId])

  return { ...term, loaded }
}
