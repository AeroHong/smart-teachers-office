/**
 * 학교 구성원 + 배정 정보를 한 번에 읽어 대상 지정에 쓸 형태로 돌려준다.
 *
 * 이름은 users, 사무실·부서·교과·담임은 teacherAssignments, 수업 학년은 teacherSubjects에
 * 흩어져 있어 세 곳을 합쳐야 "2학년 수업 들어가는 비담임" 같은 조건을 판정할 수 있다.
 *
 * 인사이동·시간표 변경이 있을 때만 바뀌는 데이터라 실시간 구독하지 않고 한 번만 읽는다.
 *
 * ── `refetch`를 반드시 쓰는 자리 (2026-08-25, 실데이터 사고 이후) ──────────────
 *
 * "한 번만 읽는다"가 **읽기 전용 화면**(대상 인원수 미리보기 등)에는 괜찮지만, 그 결과로
 * 채널 `memberUids`를 **덮어쓰는** 순간에는 위험하다. 데스크톱 앱은 트레이 상주가 전제라
 * 탭을 며칠씩 켜둔다 — 마운트 시점 이후 누군가의 직급·부서가 바뀌면, 그 사실을 모르는 채
 * 옛 데이터로 계산한 명단이 그대로 Firestore에 써진다. 실제로 이 경로로 채널을 만든
 * 사람 본인이 자기 채널에서 조용히 빠지는 사고가 있었다(`2026학년도 부장회의` 채널,
 * 직급 변경 8/18 → 갱신 클릭 8/24, 그 사이 탭이 계속 열려 있었다).
 *
 * 그래서 **쓰기로 이어지는 모든 자리**(채널 만들기·고치기, "참여자 갱신" 버튼)는 그 순간
 * `refetch()`로 다시 읽은 뒤 그 결과로 계산해야 한다. 화면에 인원수만 보여주는 자리는
 * 기존 `members`를 그대로 써도 된다 — 최악의 경우 숫자가 며칠 묵어도 되돌릴 수 있지만,
 * 잘못된 명단이 한 번 써지면 "왜 내가 빠졌지"를 스스로는 알아챌 방법이 없다(그 채널이
 * 본인 사이드바에서 통째로 사라지기 때문).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, USERS, schoolPath, currentYearSemester } from '@shared/lib/schema'
import { buildTargetMembers } from '@shared/lib/targeting'

const STAFF_ROLES = ['teacher', 'admin', 'school_admin', 'principal']

export default function useSchoolMembers() {
  const { schoolId } = useAuth()
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // fetch 함수 자체가 매 렌더 새로 만들어지면 그걸 의존성으로 쓰는 쪽 useEffect가
  // 렌더마다 다시 돈다. ref로 최신 schoolId만 참조해 함수 정체성을 고정한다.
  const schoolIdRef = useRef(schoolId)
  schoolIdRef.current = schoolId

  const fetchMembers = useCallback(async () => {
    const sid = schoolIdRef.current
    if (!sid) return []
    const { year, semester } = currentYearSemester()
    const [usersSnap, assignSnap, subjectsSnap] = await Promise.all([
      getDocs(query(collection(db, USERS), where('schoolId', '==', sid), where('role', 'in', STAFF_ROLES))),
      getDocs(query(collection(db, ...schoolPath(sid, COL.TEACHER_ASSIGNMENTS)), where('year', '==', year))),
      getDocs(query(collection(db, ...schoolPath(sid, COL.TEACHER_SUBJECTS)), where('year', '==', year))),
    ])
    return buildTargetMembers({
      users: usersSnap.docs.map(d => ({
        uid: d.id, name: d.data().name || d.data().email, photoURL: d.data().photoURL || null,
      })),
      assignments: assignSnap.docs.map(d => d.data()),
      teacherSubjects: subjectsSnap.docs.map(d => d.data()),
      semester,
    })
  }, [])

  useEffect(() => {
    if (!schoolId) return undefined
    let alive = true
    setLoading(true)
    fetchMembers()
      .then((next) => { if (alive) { setMembers(next); setError(null) } })
      .catch((e) => { if (alive) setError(e) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [schoolId, fetchMembers])

  /**
   * 지금 이 순간의 최신 명단을 읽어 상태도 갱신하고 그대로 돌려준다.
   *
   * 반환값을 쓰는 이유: 호출부가 `await refetch()`의 결과를 바로 `resolveTargets`에
   * 넘겨야 한다. `members` state는 다음 렌더에야 반영되므로, 상태 갱신을 기다렸다가
   * 다시 읽는 방식이면 그 사이에 또 렌더가 끼어들 여지가 생긴다.
   */
  const refetch = useCallback(async () => {
    const next = await fetchMembers()
    setMembers(next)
    return next
  }, [fetchMembers])

  return { members, loading, error, refetch }
}
