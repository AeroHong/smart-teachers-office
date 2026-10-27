import { useCallback, useEffect, useState } from 'react'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '@shared/lib/firebase'
import { COL, USERS, currentYearSemester, schoolPath } from '@shared/lib/schema'
import { deriveRank } from '@shared/lib/targeting'

const STAFF_ROLES = ['teacher', 'admin', 'school_admin', 'principal', 'headmaster']

/**
 * 학사일정 도구가 쓰는 교직원 명단 — 부서 목록(일정의 '관련 부서')과 부장 명단(편집자 자동 채움).
 * 학년도 배정이 아직 없으면(다음 학년도 준비 중) 올해 배정으로 대신한다.
 * 쓰기로 이어지는 자리(편집자 다시 불러오기)는 refetch()로 그 순간 다시 읽는다 — useSchoolMembers.js 주석 참고.
 * @returns {{ staff: [{uid, name, department, positionLabel, rank}], departments: string[], loading, refetch }}
 */
export default function useStaffDirectory(schoolId, year) {
  const [state, setState] = useState({ staff: [], departments: [], loading: true })

  const load = useCallback(async () => {
    if (!schoolId) return { staff: [], departments: [] }
    const assignmentsOf = (y) => getDocs(query(collection(db, ...schoolPath(schoolId, COL.TEACHER_ASSIGNMENTS)), where('year', '==', y)))
    const [usersSnap, firstSnap] = await Promise.all([
      getDocs(query(collection(db, USERS), where('schoolId', '==', schoolId), where('role', 'in', STAFF_ROLES))),
      assignmentsOf(year),
    ])
    const assignSnap = firstSnap.empty ? await assignmentsOf(currentYearSemester().year) : firstSnap
    const byUid = {}
    assignSnap.docs.forEach((d) => { byUid[d.data().uid] = d.data() })
    const staff = usersSnap.docs.map((d) => {
      const u = d.data()
      const a = byUid[d.id] || {}
      return {
        uid: d.id,
        name: u.name || u.displayName || u.email || '',
        department: a.department || '',
        positionLabel: a.positionLabel || '',
        rank: deriveRank(a.positionLabel || ''),
      }
    }).sort((x, y) => x.name.localeCompare(y.name, 'ko'))
    const departments = [...new Set(staff.map((s) => s.department).filter(Boolean))].sort((x, y) => x.localeCompare(y, 'ko'))
    return { staff, departments }
  }, [schoolId, year])

  const refetch = useCallback(async () => {
    const r = await load()
    setState({ ...r, loading: false })
    return r
  }, [load])

  useEffect(() => {
    let alive = true
    setState((s) => ({ ...s, loading: true }))
    load().then((r) => { if (alive) setState({ ...r, loading: false }) })
      .catch(() => { if (alive) setState({ staff: [], departments: [], loading: false }) })
    return () => { alive = false }
  }, [load])

  return { ...state, refetch }
}
