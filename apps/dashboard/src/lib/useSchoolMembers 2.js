/**
 * 학교 구성원 + 배정 정보를 한 번에 읽어 대상 지정에 쓸 형태로 돌려준다.
 *
 * 이름은 users, 사무실·부서·교과·담임은 teacherAssignments, 수업 학년은 teacherSubjects에
 * 흩어져 있어 세 곳을 합쳐야 "2학년 수업 들어가는 비담임" 같은 조건을 판정할 수 있다.
 *
 * 인사이동·시간표 변경이 있을 때만 바뀌는 데이터라 실시간 구독하지 않고 한 번만 읽는다.
 */
import { useEffect, useState } from 'react'
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

  useEffect(() => {
    if (!schoolId) return
    let alive = true
    setLoading(true)

    ;(async () => {
      try {
        const { year, semester } = currentYearSemester()
        const [usersSnap, assignSnap, subjectsSnap] = await Promise.all([
          getDocs(query(collection(db, USERS), where('schoolId', '==', schoolId), where('role', 'in', STAFF_ROLES))),
          getDocs(query(collection(db, ...schoolPath(schoolId, COL.TEACHER_ASSIGNMENTS)), where('year', '==', year))),
          getDocs(query(collection(db, ...schoolPath(schoolId, COL.TEACHER_SUBJECTS)), where('year', '==', year))),
        ])
        if (!alive) return

        setMembers(buildTargetMembers({
          users: usersSnap.docs.map(d => ({ uid: d.id, name: d.data().name || d.data().email })),
          assignments: assignSnap.docs.map(d => d.data()),
          teacherSubjects: subjectsSnap.docs.map(d => d.data()),
          semester,
        }))
        setError(null)
      } catch (e) {
        if (alive) setError(e)
      } finally {
        if (alive) setLoading(false)
      }
    })()

    return () => { alive = false }
  }, [schoolId])

  return { members, loading, error }
}
