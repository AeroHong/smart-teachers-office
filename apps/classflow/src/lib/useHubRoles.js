/**
 * 분반 배정 권한 — StudentHub 「담당자 지정」의 선택과목(elective) 담당자를 그대로 쓴다.
 * firestore.rules의 canSection(hasHubRole 'elective') · canViewSection(+ 교장)과 같은 규칙.
 *  · manage: 관리자 동급(학교 관리자·교감·시스템 관리자) — 지정 없이 담당자 권한
 *  · canEdit: 선택과목 담당자 또는 manage — 작업을 만들고 고친다
 *  · viewer: 교장 — 열람만
 * ExamCore `src/hooks/useHub.js`의 useHubRoles와 같은 방식(studentHubManagers/{uid} 실시간 구독).
 */
import { useEffect, useMemo, useState } from 'react'
import { collection, doc, getDocs, onSnapshot } from 'firebase/firestore'
import { db } from '@shared/lib/firebase'
import { COL, HUB_ROLES, schoolPath } from '@shared/lib/schema'
import { useAuth } from '@shared/contexts/AuthContext'

export function useHubRoles() {
  const { user, schoolId, isAdmin, isSuperAdmin, role } = useAuth()
  const [state, setState] = useState({ roles: [], loading: true })

  useEffect(() => {
    if (!schoolId || !user) { setState({ roles: [], loading: false }); return undefined }
    return onSnapshot(doc(db, ...schoolPath(schoolId, COL.STUDENT_HUB_MANAGERS), user.uid),
      (snap) => setState({ roles: snap.exists() ? snap.data().roles || [] : [], loading: false }),
      (e) => { console.error(e); setState({ roles: [], loading: false }) })
  }, [schoolId, user?.uid]) // eslint-disable-line react-hooks/exhaustive-deps

  return useMemo(() => {
    const manage = !!(isAdmin || isSuperAdmin || role === 'principal')
    const viewer = role === 'headmaster'
    const canEdit = manage || state.roles.includes(HUB_ROLES.ELECTIVE)
    return { manage, viewer, canEdit, canView: canEdit || viewer, roles: state.roles, loading: state.loading }
  }, [state, isAdmin, isSuperAdmin, role])
}

/** 선택과목 담당자 이름 — 권한이 없는 사람에게 누구에게 물어보면 되는지 알려 준다 */
export async function listElectiveManagers(schoolId) {
  const snap = await getDocs(collection(db, ...schoolPath(schoolId, COL.STUDENT_HUB_MANAGERS)))
  return snap.docs
    .filter((d) => (d.data().roles || []).includes(HUB_ROLES.ELECTIVE))
    .map((d) => d.data().nameSnapshot || '')
    .filter(Boolean)
}
