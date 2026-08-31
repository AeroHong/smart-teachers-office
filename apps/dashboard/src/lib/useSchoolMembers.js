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
 *
 * ── 내 문서만 목록 쿼리에서 빠지는 경합 (2026-08-31) ──────────────────────
 *
 * 위 사고와는 다른 경로로 같은 증상이 또 나왔다 — 새로고침할 때마다(탭을 오래 켜둔
 * 것과 무관하게) "부장회의" 채널의 참여자 갱신 배너가 떴다 사라졌다 했는데, React
 * 상태를 직접 열어보니 매번 61명이어야 할 `members`가 60명이고, 정확히 로그인한
 * 본인만 빠져 있었다(직급 등 본인 데이터 자체는 멀쩡함). AuthContext가 로그인 직후
 * 본인 문서에 photoURL 등을 동기화하는 쓰기를 매번 거의 같이 날리는데(구글 photoURL은
 * 로그인마다 값이 조금씩 달라져 거의 항상 갱신 대상이 된다), 그 쓰기와 이 목록
 * 쿼리(where role in [...])가 경합하면 본인 문서만 결과에서 빠지는 것으로 보인다.
 * 아래에서 목록에 내가 없으면 단건으로 한 번 더 읽어 채운다 — 단건 자기 읽기는
 * 이 경합의 영향을 받지 않는다(규칙도 이미 항상 허용).
 *
 * ── `refreshAllSchoolMembers()` — 이 훅의 모든 인스턴스를 한 번에 새로고침 ──────
 *
 * 이 훅은 화면마다(ChannelSidebar.jsx, Channels.jsx, Members.jsx, ProfileCardProvider.jsx …)
 * 따로따로 호출되고 각자 자기만의 members state를 갖는다 — 한 곳에서 refetch()해도
 * 다른 화면은 그대로 옛 값이다. 내 프로필 사진을 바꾸면(useMyAvatar.js) 채널 메시지
 * 목록의 내 아바타도 바뀐 걸 보고 싶은데, 새로고침 없인 그쪽 인스턴스가 안 바뀌었다
 * (사용자 지적, 2026-08-29). window 이벤트로 "지금 켜져 있는 모든 인스턴스, 다시
 * 읽어라"를 방송한다 — 페이지 전체를 새로고침하는 것보다 가볍고, 스크롤·입력 중이던
 * 것도 안 끊는다.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, USERS, schoolPath, currentYearSemester } from '@shared/lib/schema'
import { buildTargetMembers } from '@shared/lib/targeting'

const STAFF_ROLES = ['teacher', 'admin', 'school_admin', 'principal']
const REFRESH_EVENT = 'smart-office-refresh-members'

/** 내 프로필 사진처럼, 명단에 영향을 주는 걸 바꾼 직후 부른다. */
export function refreshAllSchoolMembers() {
  window.dispatchEvent(new Event(REFRESH_EVENT))
}

export default function useSchoolMembers() {
  const { schoolId, user } = useAuth()
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // fetch 함수 자체가 매 렌더 새로 만들어지면 그걸 의존성으로 쓰는 쪽 useEffect가
  // 렌더마다 다시 돈다. ref로 최신 schoolId·uid만 참조해 함수 정체성을 고정한다.
  const schoolIdRef = useRef(schoolId)
  schoolIdRef.current = schoolId
  const uidRef = useRef(user?.uid)
  uidRef.current = user?.uid

  const fetchMembers = useCallback(async () => {
    const sid = schoolIdRef.current
    if (!sid) return []
    const { year, semester } = currentYearSemester()
    const [usersSnap, assignSnap, subjectsSnap] = await Promise.all([
      getDocs(query(collection(db, USERS), where('schoolId', '==', sid), where('role', 'in', STAFF_ROLES))),
      getDocs(query(collection(db, ...schoolPath(sid, COL.TEACHER_ASSIGNMENTS)), where('year', '==', year))),
      getDocs(query(collection(db, ...schoolPath(sid, COL.TEACHER_SUBJECTS)), where('year', '==', year))),
    ])
    let userDocs = usersSnap.docs
    // 목록 쿼리가 로그인 직후 프로필 동기화 쓰기와 경합하면 내 문서만 빠질 때가 있다
    // (위 파일 설명 참고). 단건 자기 읽기는 그 경합과 무관하니 빠졌을 때만 채운다.
    const myUid = uidRef.current
    if (myUid && !userDocs.some(d => d.id === myUid)) {
      const meSnap = await getDoc(doc(db, USERS, myUid)).catch(() => null)
      if (meSnap?.exists() && meSnap.data().schoolId === sid && STAFF_ROLES.includes(meSnap.data().role)) {
        userDocs = [...userDocs, meSnap]
      }
    }
    return buildTargetMembers({
      users: userDocs.map(d => ({
        uid: d.id, name: d.data().name || d.data().email, email: d.data().email || '',
        photoURL: d.data().photoURL || null,
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
      .catch((e) => {
        // 화면(ProfileCardProvider 등)엔 "정보를 찾을 수 없습니다"로만 뭉뚱그려 보이는데,
        // 실은 권한 오류 등으로 명단 자체를 못 읽어온 것일 수 있다(2026-08-28, 사용자
        // 지적 — "구성원 정보를 찾을 수 없다고 나옵니다"). 콘솔에 원인을 남겨 둔다.
        console.error('[useSchoolMembers] 구성원 명단을 불러오지 못했습니다:', e)
        if (alive) setError(e)
      })
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

  // refreshAllSchoolMembers()가 쏘는 방송을 받아 이 인스턴스도 같이 새로고침한다.
  useEffect(() => {
    const handler = () => { refetch().catch(() => {}) }
    window.addEventListener(REFRESH_EVENT, handler)
    return () => window.removeEventListener(REFRESH_EVENT, handler)
  }, [refetch])

  return { members, loading, error, refetch }
}
